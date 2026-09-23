/**
 * Prüft im echten Browser, dass sich jeder Ort bearbeiten lässt — auch die aus
 * dem gedruckten Reiseband — und dass Schlagworte, Ausblenden und der
 * Maps-Link-Weg für Unterkünfte funktionieren.
 *
 * Warum im Browser und nicht in vitest: Die Logik ist dort schon geprüft. Hier
 * geht es um das, was nur ein echter Browser zeigt — ob der Knopf da ist, ob
 * ihn ein Finger trifft, ob nach dem Speichern wirklich der geänderte Wert in
 * der Liste steht.
 *
 *   node test/browser-korrekturen.mjs
 */

import { chromium, devices } from 'playwright';

import { BASIS, PLAN_KEY, planSchreiben, START } from './browserlauf.mjs';
const iPhone = devices['iPhone 13'];

let fehler = 0;
const pruefe = (bedingung, text, zusatz = '') => {
  if (bedingung) {
    console.log(`  ok    ${text}`);
  } else {
    fehler += 1;
    console.log(`  FEHL  ${text}${zusatz ? ` — ${zusatz}` : ''}`);
  }
};

const browser = await chromium.launch({
  ...START,
});
const ctx = await browser.newContext({ ...iPhone });
const seite = await ctx.newPage();

const meldungen = [];
seite.on('console', (m) => {
  if (m.type() === 'error') meldungen.push(m.text());
});
seite.on('pageerror', (e) => meldungen.push(`pageerror: ${e.message}`));

// Rückfragen automatisch bejahen — sonst blockiert confirm() den Lauf.
let gefragt = [];
seite.on('dialog', async (d) => {
  gefragt.push(d.message());
  await d.accept();
});

await seite.goto(`${BASIS}/orte/`, { waitUntil: 'networkidle' });
await seite.waitForTimeout(600);

/** Erste Ortskarte der Liste. */
const ersteKarte = () => seite.locator('.list article.place').first();
const anzahl = () => seite.locator('.list article.place').count();

async function formularOeffnen(karte) {
  await karte.locator('.btn', { hasText: 'bearbeiten' }).tap();
  await seite.waitForTimeout(400);
}

// ============================================ 1) Feste Orte bearbeiten ===

console.log('\nFeste Orte bearbeiten:');

const karte = ersteKarte();
// Nur der Name, ohne die Abzeichen ★ 📖 ✎ dahinter — die stehen im selben h3,
// und mit ihnen im Vergleichstext schlug die Prüfung unten fehl, obwohl der
// Buchwert richtig angezeigt wurde.
const nameVorher = (
  await karte.locator('h3').first().evaluate((el) => el.childNodes[0]?.textContent ?? '')
).trim();
pruefe(
  (await karte.locator('.btn', { hasText: 'bearbeiten' }).count()) === 1,
  'jeder Ort hat einen Bearbeiten-Knopf, nicht nur die eigenen',
);

await formularOeffnen(karte);
pruefe(await seite.locator('form.maske').isVisible(), 'das Formular öffnet sich');
// Kleinschreiben vor dem Vergleich: `innerText` liefert den **gerenderten**
// Text, und das Etikett steht per text-transform in Großbuchstaben da.
pruefe(
  (await seite.locator('.herkunft').innerText()).toLowerCase().includes('reiseband'),
  'es sagt, dass der Ort aus dem gedruckten Reiseband kommt',
);

// Namen ändern und speichern.
await seite.locator('form.maske input[type=text]').first().fill('Geänderter Name');
await seite.locator('form.maske button[type=submit]').tap();
await seite.waitForTimeout(500);

const liste = await seite.locator('.list article.place').first().innerText();
pruefe(liste.includes('Geänderter Name'), 'die Änderung steht in der Liste', liste.slice(0, 80));
pruefe(
  (await seite.locator('.list article.place').first().locator('.korrigiert').count()) === 1,
  'der Ort ist als geändert gekennzeichnet',
);

// Und zurücknehmen.
await formularOeffnen(seite.locator('.list article.place').first());
pruefe(
  (await seite.locator('.abweichungen li').count()) >= 1,
  'das Formular zeigt, was vom Buch abweicht und wie es dort stand',
);
pruefe(
  (await seite.locator('.abweichungen').innerText()).includes(nameVorher),
  'und nennt den Buchwert selbst',
  nameVorher,
);
await seite.locator('.btn', { hasText: 'zurück zum Buchwert' }).tap();
await seite.waitForTimeout(500);
pruefe(
  (await seite.locator('.list article.place').first().innerText()).includes(nameVorher),
  'nach dem Zurücknehmen steht der Buchwert wieder da',
);

// ================================================ 2) Ausblenden ===

console.log('\nAusblenden statt löschen:');

const vorher = await anzahl();
await formularOeffnen(ersteKarte());
gefragt = [];
await seite.locator('.btn', { hasText: 'ausblenden' }).tap();
await seite.waitForTimeout(500);

pruefe(
  gefragt.some((m) => m.includes('Nummer bleibt belegt')),
  'die Rückfrage sagt, dass die Nummer belegt bleibt',
  gefragt.join(' | ').slice(0, 120),
);
pruefe((await anzahl()) === vorher - 1, 'der Ort ist aus der Liste verschwunden');

const versteckKnopf = seite.locator('.btn', { hasText: 'ausgeblendet' });
pruefe(await versteckKnopf.isVisible(), 'die Leiste zeigt, wie viele ausgeblendet sind');
await versteckKnopf.tap();
await seite.waitForTimeout(300);
pruefe(await seite.locator('.versteckliste').isVisible(), 'die Liste der Ausgeblendeten öffnet');
await seite.locator('.versteckliste .btn', { hasText: 'wieder einblenden' }).first().tap();
await seite.waitForTimeout(400);
pruefe((await anzahl()) === vorher, 'wieder eingeblendet — die Liste ist wieder vollständig');

// ================================================ 3) Schlagworte ===

console.log('\nSchlagworte:');

await formularOeffnen(ersteKarte());
const wortfeld = seite.locator('.schlagwortfeld input[type=text]');
pruefe(await wortfeld.isVisible(), 'es gibt ein Feld für Schlagworte');
await wortfeld.fill('regentag');
await seite.locator('.schlagwortfeld .btn', { hasText: 'dazu' }).tap();
await seite.waitForTimeout(200);
await wortfeld.fill('frühstück');
await wortfeld.press('Enter');
await seite.waitForTimeout(200);
pruefe(
  (await seite.locator('.schlagwortfeld .wort').count()) === 2,
  'zwei Schlagworte stehen da',
  String(await seite.locator('.schlagwortfeld .wort').count()),
);
await seite.locator('form.maske button[type=submit]').tap();
await seite.waitForTimeout(500);

pruefe(
  (await seite.locator('.list article.place').first().locator('.wortchip').count()) === 2,
  'sie stehen an der Ortskarte',
);

// Danach filtern.
const filterKnopf = seite.locator('.btn.filterknopf');
if (await filterKnopf.isVisible()) {
  await filterKnopf.tap();
  await seite.waitForTimeout(300);
}
const wortChip = seite.locator('.row.cats .chip.plain', { hasText: 'regentag' }).first();
pruefe(await wortChip.isVisible(), 'die Filterleiste bietet das Schlagwort an');
await wortChip.tap();
await seite.waitForTimeout(400);
pruefe((await anzahl()) === 1, 'der Filter zeigt genau den markierten Ort', String(await anzahl()));

// Und die Suche findet es auch.
await wortChip.tap();
await seite.waitForTimeout(300);
await seite.fill('.toolbar input[type=search]', 'regentag');
await seite.waitForTimeout(400);
pruefe((await anzahl()) === 1, 'die Suche findet den Ort über sein Schlagwort');
await seite.fill('.toolbar input[type=search]', '');
await seite.waitForTimeout(300);

// ======================================= 4) Unterkunft mit Maps-Link ===

console.log('\nUnterkunft eintragen:');

const unterkunftKnopf = seite.locator('.btn', { hasText: 'Unterkunft' }).first();
pruefe(await unterkunftKnopf.isVisible(), 'es gibt einen Knopf, ohne Umweg über die Karte');
await unterkunftKnopf.tap();
await seite.waitForTimeout(400);

pruefe(await seite.locator('form.maske').isVisible(), 'das Formular öffnet sich');
const artFeld = seite.locator('form.maske select').first();
pruefe(
  (await artFeld.inputValue()) === 'hotel',
  'Art ist auf Übernachten vorbelegt',
  await artFeld.inputValue(),
);
const hakenAn = await seite
  .locator('form.maske .haken label', { hasText: 'hier schlafen wir' })
  .locator('input')
  .isChecked();
pruefe(hakenAn, 'der Haken „hier schlafen wir" ist gesetzt');

// Der eigentliche Punkt: Link einfügen statt Koordinaten abtippen.
await seite.locator('form.maske input[type=text]').first().fill('Airbnb Kanazawa');
await seite
  .locator('.einfuegefeld input')
  .fill(
    'https://www.google.com/maps/place/Kanazawa/@36.5600,136.6500,15z/data=!4m2!3m1!1s0x0:0x0!8m2!3d36.5613!4d136.6562',
  );
await seite.locator('.einfuegefeld .btn', { hasText: 'lesen' }).tap();
await seite.waitForTimeout(400);

const meldung = await seite.locator('.einfuegemeldung').innerText();
pruefe(meldung.includes('Übernommen'), 'die Koordinate wird aus dem Link gelesen', meldung);
const breite = await seite.locator('.koordinaten input').first().inputValue();
pruefe(
  Math.abs(Number(breite) - 36.5613) < 0.0001,
  'und es ist der Ort, nicht der Kartenmittelpunkt',
  breite,
);

await seite.locator('form.maske button[type=submit]').tap();
await seite.waitForTimeout(600);
pruefe(
  (await seite.locator('.list article.place').filter({ hasText: 'Airbnb Kanazawa' }).count()) === 1,
  'die Unterkunft steht in der Liste',
);

console.log('\nKurzlink:');
await seite.locator('.btn', { hasText: 'Unterkunft' }).first().tap();
await seite.waitForTimeout(400);
await seite.locator('.einfuegefeld input').fill('https://maps.app.goo.gl/abc123');
await seite.locator('.einfuegefeld .btn', { hasText: 'lesen' }).tap();
await seite.waitForTimeout(300);
const kurz = await seite.locator('.einfuegemeldung').innerText();
pruefe(
  kurz.includes('Kurzlink') && kurz.length > 60,
  'ein Kurzlink wird nicht stumm verschluckt, sondern erklärt',
  kurz.slice(0, 90),
);
await seite.locator('form.maske .btn', { hasText: 'abbrechen' }).tap();
await seite.waitForTimeout(300);

// ==================================================== 5) Layout ===

console.log('\nLayout:');
const quer = await seite.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
pruefe(!quer, 'kein Querscrollen');

await formularOeffnen(ersteKarte());
const zuKlein = await seite.evaluate(() =>
  [...document.querySelectorAll('form.maske button, form.maske input, form.maske select')]
    .filter((e) => e.offsetParent !== null && e.type !== 'radio' && e.type !== 'checkbox')
    .map((e) => ({ t: e.className || e.tagName, h: Math.round(e.getBoundingClientRect().height) }))
    .filter((x) => x.h > 0 && x.h < 40),
);
pruefe(zuKlein.length === 0, 'alle Tippziele im Formular sind mindestens 40 px hoch', JSON.stringify(zuKlein));

// ====================== 6) Tagesplan und Orga sehen die Korrekturen ===
/*
 * Der Fehler, den diese Prüfung bewacht, ist der teuerste der ganzen App: Bis zum
 * 23.09. baute der Tagesplan aus den **rohen** Buchdaten. Ein in Orte
 * verschobener Punkt stand auf der Tageskarte und im Maps-Routenlink weiter an
 * der alten Stelle, ein ausgeblendeter Ort wurde weiter gezeigt, ein
 * umbenannter trug seinen alten Namen.
 *
 * Gegenprobe: In `DayPlanner.svelte` `alle` wieder aus der Build-Liste bauen →
 * die drei Prüfungen unten fallen.
 */
console.log('\nTagesplan mit Korrekturen:');
await seite.goto(`${BASIS}/plan/`, { waitUntil: 'load' });
await seite.waitForSelector('.daybar .daytab', { timeout: 15000 });
await planSchreiben(
  seite,
  {
    days: { '2026-09-28': { placeNrs: [1, 3, 8], note: '' } },
    korrekturen: {
      3: { nr: 3, versteckt: true, schlagworte: [] },
      8: { nr: 8, versteckt: false, schlagworte: [], name: 'Umbenannt Test', lat: 34.6655, lng: 135.5011 },
    },
  },
  '.daybar .daytab',
);
await seite.locator('.daybar .daytab', { hasText: '28.09' }).first().click();
await seite.waitForTimeout(500);
const stopps = (await seite.locator('.stops').innerText()).replace(/\s+/g, ' ');
pruefe(/Umbenannt Test/.test(stopps), 'der umbenannte Ort trägt im Tagesplan den neuen Namen', stopps.slice(0, 120));
pruefe(!/Cascade/.test(stopps), 'der ausgeblendete Ort steht nicht mehr im Tag');
const routen = await seite.locator('.mapsroute a').evaluateAll((as) => as.map((a) => decodeURIComponent(a.href)));
pruefe(
  routen.length > 0 && routen.every((h) => h.includes('34.6655,135.5011') && !h.includes('34.7028289')),
  'der Maps-Routenlink führt zur korrigierten Koordinate, nicht zur alten',
  routen[0]?.slice(0, 160),
);

/*
 * Speichern beim Seitenwechsel. Bis zum 23.09. schrieb der Plan erst nach 300 ms
 * — wer in der Zeit die Seite wechselte, verlor die Änderung, während die
 * Warteschlange des Abgleichs sie schon vermerkt hatte.
 *
 * Gegenprobe: den `pagehide`-Hörer in `store.svelte.ts` entfernen → fällt.
 */
console.log('\nSpeichern beim Seitenwechsel:');
await seite.goto(`${BASIS}/orte/`, { waitUntil: 'load' });
// Leer anfangen: Der Plan aus dem Block davor läge sonst noch im Speicher, und
// die Zählung unten bestünde auch dann, wenn das „+" verloren ginge.
await planSchreiben(seite, { days: {}, korrekturen: {} }, '.list article.place');
const plusKnopf = seite.locator('.list article.place .btn.primary').first();
const plusText = await plusKnopf.innerText();
await plusKnopf.click();
// Sofort weg — keine Wartezeit.
await seite.goto(`${BASIS}/plan/`, { waitUntil: 'load' });
const gespeichert = await seite.evaluate((k) => {
  const p = JSON.parse(localStorage.getItem(k) ?? '{}');
  return Object.values(p.days ?? {}).reduce((n, d) => n + (d.placeNrs?.length ?? 0), 0);
}, PLAN_KEY);
pruefe(gespeichert >= 1, 'ein „+" direkt vor dem Seitenwechsel ist gespeichert', `${plusText} → ${gespeichert} Orte`);

/*
 * `?nr=` — der Weg aus der Selbstprüfung und aus der Stoppliste der Straße. Bis
 * zum 23.09. las den Parameter niemand.
 */
console.log('\nEin einzelner Ort über ?nr=:');
await seite.goto(`${BASIS}/orte/?nr=171`, { waitUntil: 'load' });
await seite.waitForSelector('.list article.place', { timeout: 15000 });
await seite.waitForTimeout(300);
const suchfeld = await seite.locator('input[type="search"]').first().inputValue();
pruefe(suchfeld === '171', 'die Nummer steht im Suchfeld', suchfeld);
const erste = (await seite.locator('.list article.place').first().innerText()).replace(/\s+/g, ' ');
pruefe(/Kappa-bashi/.test(erste), 'der erste Treffer ist Nr. 171 Kappa-bashi', erste.slice(0, 60));

// -------------------------------------------------------- Aufräumen ---

console.log('\nFehlermeldungen der Seite:');
const echte = meldungen.filter(
  (m) => !/tile\.openstreetmap|fonts\.g|ERR_|Failed to load resource|supabase/i.test(m),
);
pruefe(echte.length === 0, 'keine Fehler in der Konsole', echte.join(' | '));

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
