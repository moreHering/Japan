/**
 * Prüft den Tagesplaner im Browser, im Format eines iPhone.
 *
 * Zwei Zusicherungen stehen hier im Mittelpunkt, und beide lassen sich nur im
 * Browser zeigen:
 *
 *   1. **Der Etappenblock am Umzugstag** nennt Richtung, Verbindung, Dauer und
 *      den Buchungsstand der Fahrt — und der Haken schreibt in denselben Zustand
 *      wie die Organisation-Ansicht.
 *   2. **Die Zahlen an den Kategoriechips bleiben stehen, wenn man einen Chip
 *      abwählt.** Das ist die maschinelle Absicherung gegen den naheliegenden
 *      Fehler: Zählt man auf `pool` statt auf `poolBasis`, steht nach dem ersten
 *      Klick auf allen anderen Chips eine Null. Man sieht es nur, wenn man klickt
 *      und danach wieder hinsieht.
 *
 *   npx astro dev --port 4322 &   und dann   node test/browser-plan.mjs
 */

import { chromium, devices } from 'playwright';

const BASIS = process.env.DEV ?? process.env.BASIS ?? 'http://localhost:4322/Japan';

let fehler = 0;
const pruefe = (bedingung, text, zusatz = '') => {
  if (bedingung) console.log(`  ok    ${text}${zusatz ? ` — ${zusatz}` : ''}`);
  else {
    fehler += 1;
    console.log(`  FEHL  ${text}${zusatz ? ` — ${zusatz}` : ''}`);
  }
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
});
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const seite = await ctx.newPage();

const meldungen = [];
seite.on('pageerror', (e) => meldungen.push(`pageerror: ${e.message}`));
seite.on('console', (m) => {
  if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource|openstreetmap/i.test(m.text())) {
    meldungen.push(m.text());
  }
});

await seite.goto(`${BASIS}/plan/`, { waitUntil: 'load' });
await seite.waitForSelector('.daybar .daytab', { timeout: 10000 });
await seite.waitForTimeout(500);

// ============================================================ 1) Umzugstage ===

console.log('Umzugstage im Tagesstreifen:');
const umzugTabs = seite.locator('.daytab.leg');
pruefe((await umzugTabs.count()) === 5, 'fünf Tage sind als Umzug markiert', `${await umzugTabs.count()}`);
// Der goldene Balken allein ist nicht zu deuten — der `title` sagt, was er
// bedeutet. Geprüft an allen fünf, nicht an einem.
const titel = await umzugTabs.evaluateAll((ns) => ns.map((n) => n.getAttribute('title') ?? ''));
pruefe(
  titel.every((t) => /Umzug .+ → .+ · /.test(t)),
  'jeder Umzugstag nennt Richtung und Dauer als Beschriftung',
  titel[0],
);
// Und die übrigen fünfzehn tragen keinen — sonst wäre die Markierung wertlos.
const andere = await seite
  .locator('.daytab:not(.leg)')
  .evaluateAll((ns) => ns.filter((n) => n.hasAttribute('title')).length);
pruefe(andere === 0, 'die übrigen Tage tragen keine', `${andere} mit title`);

/** Öffnet einen Reisetag über den Streifen. */
async function tagOeffnen(nth) {
  const tab = seite.locator('.daytab').nth(nth);
  await tab.scrollIntoViewIfNeeded();
  await tab.tap();
  await seite.waitForTimeout(350);
}

/** Index des Reisetags im Streifen; Tag 1 ist der 26.09. */
const tagIndex = (iso) => {
  const start = Date.UTC(2026, 8, 26);
  const [j, m, t] = iso.split('-').map(Number);
  return Math.round((Date.UTC(j, m - 1, t) - start) / 86400000);
};

// ------------------------------------- 30.09.: Umzug ohne Reservierungsbedarf ---

console.log('\n30.09. — Osaka → Kyoto (keine Buchung nötig):');
await tagOeffnen(tagIndex('2026-09-30'));
const leg1 = seite.locator('.note.leg');
pruefe(await leg1.isVisible(), 'der Etappenblock steht da');
const t1 = (await leg1.innerText()).replace(/\s+/g, ' ');
pruefe(/Osaka/.test(t1) && /Kyoto/.test(t1), 'nennt beide Stationen', t1.slice(0, 50));
pruefe(/JR Special Rapid/.test(t1), 'nennt die Verbindung');
pruefe(/~30 Min\./.test(t1), 'nennt die Dauer');
pruefe(
  (await leg1.locator('.legbuchung').count()) === 0,
  'kein Buchungshaken, wo es nichts zu buchen gibt',
);

// ------------------------------------------ 05.10.: der reservierungspflichtige ---

console.log('\n05.10. — Kanazawa → Takayama (Nōhi-Bus, reservierungspflichtig):');
await tagOeffnen(tagIndex('2026-10-05'));
const leg2 = seite.locator('.note.leg');
const t2 = (await leg2.innerText()).replace(/\s+/g, ' ');
pruefe(/Kanazawa/.test(t2) && /Takayama/.test(t2), 'nennt beide Stationen');
pruefe(/Shirakawa-gō/.test(t2), 'nennt die Verbindung über Shirakawa-gō');

const haken = leg2.locator('.legbuchung input[type=checkbox]');
pruefe((await haken.count()) === 1, 'es gibt genau einen Buchungshaken');
pruefe(!(await haken.isChecked()), 'noch nicht gebucht');
pruefe(/noch nicht gebucht/.test(t2), 'und sagt das auch');
pruefe(
  /[Rr]eservierungspflichtig/.test(t2),
  'der Grund steht dabei, solange nicht gebucht ist',
  t2.slice(-70),
);

// Tippfläche: derselbe Anspruch wie überall sonst.
const hoehe = await leg2.locator('.legbuchung').evaluate((n) => Math.round(n.getBoundingClientRect().height));
pruefe(hoehe >= 44, 'der Haken ist mindestens 44 px hoch', `${hoehe} px`);

// --------------------------- Der Haken schreibt denselben Zustand wie die Orga ---

console.log('\nDer Haken und die Organisation-Ansicht:');
await leg2.locator('.legbuchung').tap();
await seite.waitForTimeout(400);
pruefe(await haken.isChecked(), 'ein Tipp setzt den Haken');
pruefe(
  /ist gebucht/.test((await leg2.innerText()).replace(/\s+/g, ' ')),
  'der Text wechselt auf „ist gebucht"',
);
pruefe(
  (await leg2.locator('.legbdetail').count()) === 0,
  'der Reservierungsgrund verschwindet, wenn gebucht ist',
);

// Das ist der Punkt der ganzen Übung: Es ist **derselbe** Zustand, nicht ein
// zweiter daneben. Nachgesehen auf der Organisation-Seite.
const orga = await ctx.newPage();
await orga.goto(`${BASIS}/organisation/`, { waitUntil: 'load' });
await orga.waitForTimeout(900);
const orgaHaken = orga.locator('input[type=checkbox]').nth(0);
const busZeile = orga.locator('label, li, tr', { hasText: 'Nōhi-Bus' }).first();
if ((await busZeile.count()) === 0) {
  fehler += 1;
  console.log('  FEHL  die Nōhi-Bus-Zeile ist auf /organisation/ nicht zu finden');
} else {
  pruefe(
    await busZeile.locator('input[type=checkbox]').isChecked(),
    'auf /organisation/ ist die Fahrt ebenfalls abgehakt — ein Zustand, nicht zwei',
  );
}
void orgaHaken;
await orga.close();

// Zurücknehmen, damit der Rest des Tests auf dem Ausgangszustand läuft.
await leg2.locator('.legbuchung').tap();
await seite.waitForTimeout(350);
pruefe(!(await haken.isChecked()), 'und lässt sich wieder zurücknehmen');

// ================================================ 2) Zahlen an den Chips ======

console.log('\nZahlen an den Kategoriechips:');
// Ein Tag ohne Umzug, damit die Vorschlagsliste nicht von Fahrtzeug verdeckt wird.
await tagOeffnen(tagIndex('2026-09-28'));

const chipZahlen = () =>
  seite.locator('.poolcats .chip:not(.tipp) b').evaluateAll((ns) => ns.map((n) => Number(n.textContent)));
const poolAnzahl = () => seite.locator('.poollist .poolitem').count();

const vorher = await chipZahlen();
pruefe(vorher.length === 5, 'jeder der fünf Kategoriechips trägt eine Zahl', JSON.stringify(vorher));
pruefe(
  vorher.reduce((a, b) => a + b, 0) === (await poolAnzahl()),
  'die Summe der Zahlen ist die Länge der Vorschlagsliste',
  `${vorher.reduce((a, b) => a + b, 0)} vs. ${await poolAnzahl()}`,
);

/*
 * Die Prüfung, um die es hier geht.
 *
 * Einen Chip abwählen und danach die **übrigen** Zahlen ansehen: Sie müssen
 * unverändert sein. Zählte der Code auf `pool` statt auf `poolBasis`, stünden
 * dort jetzt Nullen, weil `pool` den Kategoriefilter schon angewandt hat. Das ist
 * ein Fehler, den man im Vorbeigehen nicht sieht — die Liste wird ja korrekt
 * kürzer, nur die Zahlen der anderen Chips lügen.
 */
await seite.locator('.poolcats .chip:not(.tipp)').nth(0).tap();
await seite.waitForTimeout(350);
const nachher = await chipZahlen();
pruefe(
  JSON.stringify(nachher) === JSON.stringify(vorher),
  'die Zahlen bleiben stehen, wenn man einen Chip abwählt',
  `vorher ${JSON.stringify(vorher)} · nachher ${JSON.stringify(nachher)}`,
);
const kuerzer = await poolAnzahl();
pruefe(
  kuerzer < vorher.reduce((a, b) => a + b, 0),
  'die Liste wird dabei trotzdem kürzer',
  `${kuerzer} Einträge`,
);
// Wieder einschalten.
await seite.locator('.poolcats .chip:not(.tipp)').nth(0).tap();
await seite.waitForTimeout(350);

// ------------------------------------------------------------- Der ★-Filter ---

console.log('\nDer ★-Filter:');
const stern = seite.locator('.poolcats .chip.tipp');
pruefe((await stern.count()) === 1, 'es gibt genau einen ★-Chip');
const sternZahl = Number((await stern.locator('b').textContent()) ?? '-1');
pruefe(sternZahl >= 0, 'er trägt eine Zahl', `${sternZahl}`);
if (sternZahl > 0) {
  await stern.tap();
  await seite.waitForTimeout(350);
  pruefe((await poolAnzahl()) === sternZahl, 'eingeschaltet zeigt die Liste genau so viele',
    `${await poolAnzahl()} vs. ${sternZahl}`);
  // Die Kategoriezahlen müssen jetzt den ★-Filter berücksichtigen — jede Facette
  // beachtet die andere und ignoriert nur sich selbst.
  const mitStern = await chipZahlen();
  pruefe(
    mitStern.reduce((a, b) => a + b, 0) === sternZahl,
    'und die Kategoriezahlen berücksichtigen den ★-Filter',
    JSON.stringify(mitStern),
  );

  /*
   * Und die Gegenrichtung: `tippZahl` muss den **Kategorie**filter beachten und
   * nur den ★-Filter ignorieren. Ohne diese Prüfung bliebe ein `tippZahl`, das
   * `poolCats` gar nicht liest, unbemerkt — solange alle Chips an sind, ist es
   * dasselbe Ergebnis. Deshalb hier eine Kategorie abschalten und zusehen, dass
   * die ★-Zahl kleiner wird.
   */
  const messwerte = [];
  for (let i = 0; i < 5; i++) {
    const chip = seite.locator('.poolcats .chip:not(.tipp)').nth(i);
    await chip.tap();
    await seite.waitForTimeout(300);
    messwerte.push(Number((await stern.locator('b').textContent()) ?? '-1'));
    await chip.tap();
    await seite.waitForTimeout(250);
  }
  /*
   * Über **alle fünf** Kategorien und nicht über eine: Schaltet man nur eine ab
   * und verlangt eine kleinere Zahl, hängt der Test daran, dass gerade in dieser
   * Kategorie ein Freundestipp liegt — bei anderen Daten schlägt er dann grundlos
   * an. Verlangt man nur „nicht größer", schlägt er nie an: Eine ★-Zahl, die
   * `poolCats` gar nicht liest, bleibt gleich, und 7 ≤ 7 ist wahr. (Genau so war
   * die erste Fassung, und die Gegenprobe hat es gezeigt.)
   *
   * Richtig ist: Bei mindestens einer der fünf muss die Zahl sinken, solange es
   * überhaupt Tipps gibt. Das gilt für jede Datenlage und ist genau dann falsch,
   * wenn die Facettenregel gebrochen ist.
   */
  pruefe(
    messwerte.some((z) => z < sternZahl),
    'die ★-Zahl beachtet den Kategoriefilter',
    `${sternZahl} → ${JSON.stringify(messwerte)} je abgeschaltete Kategorie`,
  );
  pruefe(
    Number((await stern.locator('b').textContent()) ?? '-1') === sternZahl,
    'und ist wieder die alte, wenn alle Kategorien zurück sind',
  );

  await stern.tap();
  await seite.waitForTimeout(300);
} else {
  console.log(`  (an dieser Station gibt es keinen Freundestipp — ★ steht auf 0)`);
  pruefe(
    (await stern.getAttribute('class'))?.includes('leer'),
    'und ist bei null ausgegraut statt abgeschaltet',
  );
}

// ======================================================== 3) Layout und Rest ===

console.log('\nLayout bei 390 px:');
const quer = await seite.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
pruefe(!quer, 'kein Querscrollen');

// Die Chipleiste darf umbrechen — sie ist `flex-wrap: wrap` —, aber nicht
// seitlich überlaufen. Gemessen, nicht gerechnet.
const leiste = await seite.locator('.poolcats').evaluate((n) => ({
  hoehe: Math.round(n.getBoundingClientRect().height),
  ueberlauf: n.scrollWidth > n.clientWidth + 1,
}));
pruefe(!leiste.ueberlauf, 'die Chipleiste läuft nicht seitlich über', `${leiste.hoehe} px hoch`);

console.log('\nFehlermeldungen der Seite:');
pruefe(meldungen.length === 0, 'keine Fehler in der Konsole', meldungen.join(' | '));

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
