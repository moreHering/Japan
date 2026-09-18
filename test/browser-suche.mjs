/**
 * Prüft im echten Browser, dass die Suche wirklich findet — und die Bildwahl
 * im Freundebuch beide Wege anbietet.
 *
 * Warum ein eigener Test: Der Fehler war nicht, dass die Suche fehlte, sondern
 * dass sie am Ende der Filterkette stand und damit wirkungslos war, sobald
 * etwas anderes eingeschränkt hat. Das sieht man nur, wenn man erst filtert und
 * dann sucht — genau in dieser Reihenfolge, wie ein Mensch es tut.
 *
 *   node test/browser-suche.mjs
 */

import { chromium, devices } from 'playwright';

// Der Dev-Server, nicht die Vorschau: Nur dort lassen sich die Module über
// `import('/src/lib/…')` erreichen, und ohne Anmeldung ist das Formular des
// Freundebuchs gar nicht im DOM — dann prüfte dieser Test dort nichts.
const BASIS = process.env.BASIS ?? 'http://localhost:4322/Japan';
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
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
});
const ctx = await browser.newContext({ ...iPhone });
const seite = await ctx.newPage();

const meldungen = [];
seite.on('console', (m) => {
  if (m.type() === 'error') meldungen.push(m.text());
});
seite.on('pageerror', (e) => meldungen.push(`pageerror: ${e.message}`));

// Der Wrapper heißt `.list`, die Karte `.place` — beim ersten Lauf hatte ich
// beides falsch geraten und drei Prüfungen fielen um, obwohl die Suche lief.
const treffer = () => seite.locator('.list article.place').count();

// ============================================== 1) Orte: Suche gegen Filter ===

console.log('\nOrte — Suche gegen Filter:');
await seite.goto(`${BASIS}/orte/`, { waitUntil: 'networkidle' });
await seite.waitForTimeout(400);

const gesamt = await seite.locator('.count b').textContent();

// Erst auf eine Station einschränken, die den gesuchten Ort **nicht** enthält.
await seite.selectOption('.toolbar select[aria-label="Station"]', 'osaka');
await seite.waitForTimeout(300);
const nurOsaka = Number(await seite.locator('.count b').textContent());
pruefe(nurOsaka > 0 && nurOsaka < Number(gesamt), 'Stationsfilter schränkt ein', `${nurOsaka}/${gesamt}`);

// Jetzt nach einem Ort suchen, der in Tokio liegt. Genau hier kam vorher nichts.
await seite.fill('.toolbar input[type=search]', 'Ghibli');
await seite.waitForTimeout(400);
const ghibli = await treffer();
pruefe(ghibli > 0, 'findet „Ghibli" trotz Stationsfilter Osaka', `${ghibli} Treffer`);
pruefe(
  await seite.locator('.suchhinweis').isVisible(),
  'sagt sichtbar, dass die Filter pausiert sind',
);

// Nummer als Suchbegriff.
await seite.fill('.toolbar input[type=search]', '96');
await seite.waitForTimeout(400);
pruefe((await treffer()) === 1, 'Nummer 96 liefert genau einen Treffer', `${await treffer()}`);

// Stichwort aus dem Beschreibungstext, nicht aus dem Namen.
//
// „Teppanyaki" stand hier zuerst und war wertlos: Nr. 8 liegt selbst in Osaka,
// die Prüfung bestand also auch mit dem alten, kaputten Verhalten. Jetzt wird
// verlangt, dass ein Treffer **außerhalb** der gefilterten Station auftaucht —
// erst das beweist, dass die Suche den Filter wirklich überstimmt.
await seite.fill('.toolbar input[type=search]', 'Tempel');
await seite.waitForTimeout(400);
const stationen = await seite.evaluate(() =>
  [...document.querySelectorAll('.list .group')].map((h) => h.firstChild?.textContent?.trim()),
);
pruefe(
  stationen.length > 1,
  'ein Stichwort findet Orte über mehrere Stationen hinweg',
  JSON.stringify(stationen),
);

// Der Hinweisknopf räumt die Suche weg und stellt die Filter wieder her.
await seite.locator('.suchhinweis').tap();
await seite.waitForTimeout(400);
pruefe(
  Number(await seite.locator('.count b').textContent()) === nurOsaka,
  'der Hinweisknopf stellt den Stationsfilter wieder her',
);

// =============================================== 2) Planer: über die Station ===

console.log('\nTagesplaner — Suche über die Stationsgrenze:');
await seite.goto(`${BASIS}/plan/`, { waitUntil: 'networkidle' });
await seite.waitForTimeout(500);

const poolSuche = seite.locator('.poolhead input[type=search]');
const stationsname = await seite.locator('.allswitch').textContent();

await poolSuche.fill('Ghibli');
await seite.waitForTimeout(400);
const poolTreffer = await seite.locator('.pool article.place').count();
pruefe(
  poolTreffer > 0,
  'findet „Ghibli" am ersten Reisetag (Station Osaka)',
  `${poolTreffer} Treffer, Haken war: ${stationsname?.trim()}`,
);
pruefe(
  await seite.locator('.poolhead .suchhinweis').isVisible(),
  'nennt ausdrücklich, dass über alle Stationen gesucht wird',
);

await seite.locator('.poolhead .suchhinweis button').tap();
await seite.waitForTimeout(300);
pruefe(
  await seite.locator('.allswitch').isVisible(),
  'zurück zum Filter bringt den Stationshaken wieder',
);

// ============================================= 3) Freundebuch: Bild und Ort ===

console.log('\nFreundebuch — Bildwahl und Ortssuche:');
await seite.goto(`${BASIS}/freundebuch/`, { waitUntil: 'load' });
await seite.waitForTimeout(600);

// Anmelden wie in browser-freundebuch.mjs: ohne Sitzung ist das Formular gar
// nicht im DOM, und der Test liefe ins Leere, ohne es zu merken.
await seite.evaluate(async () => {
  const auth = await import('/src/lib/auth.svelte.ts');
  auth.auth.userId = 'aaaa';
  auth.auth.name = 'Paule';
  auth.auth.status = 'angemeldet';
});
await seite.waitForTimeout(500);

// Ohne `status = 'bereit'` bleibt der Bilderstrom verborgen — die Komponente
// wartet dann noch auf die Verbindung, die es hier nicht gibt. Nach dem
// Anmelden setzen, nicht davor: Der Ladeversuch überschreibt es sonst wieder.
await seite.evaluate(async () => {
  const fb = await import('/src/lib/freundebuch.svelte.ts');
  fb.buch.personen = [{ id: 'aaaa', name: 'Paule', farbe: '#C6402B' }];
  fb.buch.beitraege = [];
  fb.buch.status = 'bereit';
});
await seite.waitForTimeout(500);

const aufmachen = seite.locator('.knopf.gross', { hasText: 'hinzufügen' });
pruefe(await aufmachen.isVisible(), 'das Formular lässt sich öffnen');
await aufmachen.tap();
await seite.waitForTimeout(400);

const felder = seite.locator('.bildwahl input[type=file]');
pruefe((await felder.count()) === 2, 'zwei Wege zum Bild', `${await felder.count()} Felder`);
pruefe(
  (await felder.nth(0).getAttribute('capture')) === null,
  'der erste Weg hat kein capture — öffnet damit die Aufnahmen',
);
pruefe(
  (await felder.nth(1).getAttribute('capture')) === 'environment',
  'der zweite Weg öffnet die Kamera',
);

// Ein Bild wählen, Vorschau prüfen, wieder wegnehmen.
const einBild = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
await felder.nth(0).setInputFiles({ name: 'urlaub.png', mimeType: 'image/png', buffer: einBild });
await seite.waitForTimeout(400);
pruefe(await seite.locator('.vorschau').isVisible(), 'die Vorschau erscheint');
pruefe(await seite.locator('.bildweg').isVisible(), 'es gibt einen Knopf, das Bild wieder wegzunehmen');

// Text eintragen, damit sich zeigt: Das Bild geht weg, der Text bleibt stehen.
await seite.locator('textarea').fill('Regen in Osaka');
await seite.locator('.bildweg').tap();
await seite.waitForTimeout(300);
pruefe((await seite.locator('.vorschau').count()) === 0, 'das Bild ist weg');
pruefe(
  (await seite.locator('textarea').inputValue()) === 'Regen in Osaka',
  'der geschriebene Text bleibt dabei stehen',
);

// Dieselbe Datei muss sich danach erneut wählen lassen — sonst hätte das
// Feld noch ihren alten Wert und löste kein change mehr aus.
await felder.nth(0).setInputFiles({ name: 'urlaub.png', mimeType: 'image/png', buffer: einBild });
await seite.waitForTimeout(400);
pruefe(await seite.locator('.vorschau').isVisible(), 'dieselbe Datei lässt sich erneut wählen');

// --- Ortssuche statt Dropdown
pruefe((await seite.locator('.wachsend select').count()) === 0, 'das Dropdown mit 164 Einträgen ist weg');
const ortfeld = seite.locator('.wachsend input[type=search]');
pruefe(await ortfeld.isVisible(), 'stattdessen ein Suchfeld für den Ort');

await ortfeld.fill('Ghibli');
await seite.waitForTimeout(400);
const ot = await seite.locator('.orttreffer button').count();
pruefe(ot > 0, 'die Ortssuche findet „Ghibli"', `${ot} Treffer`);
pruefe(ot <= 8, 'die Trefferliste bleibt kurz', `${ot}`);

await seite.locator('.orttreffer button').first().tap();
await seite.waitForTimeout(300);
pruefe(await seite.locator('.ortgewaehlt').isVisible(), 'der gewählte Ort steht als Knopf da');
pruefe(
  (await seite.locator('.ortgewaehlt').innerText()).toLowerCase().includes('ghibli'),
  'und trägt den richtigen Namen',
);

await seite.locator('.ortgewaehlt').tap();
await seite.waitForTimeout(300);
pruefe(await ortfeld.isVisible(), 'ein Tipp darauf löst die Wahl wieder');

/*
 * Alle Tippziele im Formular groß genug für einen Finger.
 *
 * Diese Prüfung hat sich bezahlt: Beim Herauslösen der Y2K-Regeln habe ich einen
 * als tot gemeldeten Selektor `.neu select` entfernt — er stand aber in einer
 * gemeinsamen Selektorliste mit `.neu textarea` und `.neu input`, und mit dem
 * Block waren Rahmen, Polster und die **16-px-Schrift gegen den iOS-Zoom** weg.
 * Sichtbar wurde es allein daran, dass Datums- und Suchfeld auf 32 px fielen.
 *
 * Ein struktureller Test hätte das nicht gefunden: Die verstümmelte Regel war
 * gültiges CSS, sie hing nur am falschen Deklarationsblock.
 */
const zuKlein = await seite.evaluate(() =>
  [...document.querySelectorAll('form.neu button, form.neu label.datei, form.neu input')]
    .filter((e) => e.offsetParent !== null)
    .map((e) => ({ t: e.className || e.tagName, h: Math.round(e.getBoundingClientRect().height) }))
    .filter((x) => x.h > 0 && x.h < 40),
);
pruefe(zuKlein.length === 0, 'alle Tippziele im Formular sind mindestens 40 px hoch', JSON.stringify(zuKlein));

// ------------------------------------------------------------- Querscrollen ---

console.log('\nLayout:');
for (const pfad of ['/orte/', '/plan/', '/freundebuch/']) {
  await seite.goto(`${BASIS}${pfad}`, { waitUntil: 'networkidle' });
  await seite.waitForTimeout(300);
  const quer = await seite.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  pruefe(!quer, `kein Querscrollen auf ${pfad}`);
}

// ---------------------------------------------------------------- Aufräumen ---

console.log('\nFehlermeldungen der Seite:');
const echte = meldungen.filter(
  (m) => !/tile\.openstreetmap|fonts\.g|ERR_|Failed to load resource|supabase/i.test(m),
);
pruefe(echte.length === 0, 'keine Fehler in der Konsole', echte.join(' | '));

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
