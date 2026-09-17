/**
 * Prüft die Erfassung eigener Orte im echten Browser, im Format eines iPhone.
 *
 * Kein Vitest: Hier geht es um Layout und Bedienung, nicht um Logik — und um
 * Dinge, die nur ein echter Browser zeigt (Querscrollen, Größe der Tippziele,
 * Leaflet überhaupt).
 *
 * Die Kartenkacheln von OpenStreetMap sind aus dieser Umgebung gesperrt (403 am
 * Proxy). Die Karte bleibt deshalb grau; Marker, Popups und die Koordinatenwahl
 * funktionieren trotzdem, weil sie nichts mit den Kacheln zu tun haben.
 *
 *   node test/browser-orte.mjs
 */

import { chromium, devices } from 'playwright';

const BASIS = process.env.BASIS ?? 'http://localhost:4321/Japan';
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

/*
 * Die hier installierte Playwright-Fassung erwartet einen neueren Chromium als
 * der, der im Bild liegt — und nachladen lässt die Netzrichtlinie nicht zu.
 * Deshalb der ausdrückliche Pfad auf den vorhandenen.
 */
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

/** Breite des Dokuments gegen das Fenster — misst Querscrollen. */
async function querscroll() {
  return seite.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    fenster: window.innerWidth,
  }));
}

// ------------------------------------------------------- Seiten überhaupt ---

console.log('Seiten bei 390 px:');
for (const [pfad, name] of [
  ['/', 'Übersicht'],
  ['/plan/', 'Tagesplan'],
  ['/orte/', 'Orte'],
  ['/karte/', 'Karte'],
  ['/organisation/', 'Organisation'],
]) {
  await seite.goto(`${BASIS}${pfad}`, { waitUntil: 'load' });
  await seite.waitForTimeout(700); // Islands hydrieren
  const { doc, fenster } = await querscroll();
  pruefe(doc <= fenster + 1, `${name}: kein Querscrollen`, `${doc} px Inhalt bei ${fenster} px`);
}

// ------------------------------------------------- Erfassung auf der Karte ---

console.log('\nEigenen Ort auf der Vollbildkarte anlegen:');
await seite.goto(`${BASIS}/karte/`, { waitUntil: 'load' });
await seite.waitForSelector('.leaflet-container', { timeout: 15000 });
await seite.waitForTimeout(600);

const plusKnopf = seite.locator('.rundknopf.haupt');
pruefe(await plusKnopf.isVisible(), 'Der +-Knopf ist sichtbar');
const kasten = await plusKnopf.boundingBox();
pruefe(
  kasten !== null && kasten.height >= 44,
  'Der +-Knopf ist mindestens 44 px hoch',
  kasten ? `${Math.round(kasten.height)} px` : 'nicht gefunden',
);

await plusKnopf.tap();
pruefe(
  await seite.locator('.pickhint').isVisible(),
  'Der Hinweis zum Antippen der Karte erscheint',
);

// Mitte der Karte antippen
const karte = await seite.locator('.leaflet-container').boundingBox();
await seite.touchscreen.tap(karte.x + karte.width / 2, karte.y + karte.height / 2);
await seite.waitForTimeout(400);

const maske = seite.locator('.blatt form.maske');
pruefe(await maske.isVisible(), 'Die Maske öffnet sich');
pruefe(
  await seite.locator('.jp-pin-neu').count() === 1,
  'Ein Vorschau-Pin steht auf der gewählten Stelle',
);

const breite = await maske.locator('input[inputmode="decimal"]').first().inputValue();
pruefe(
  Number.isFinite(Number(breite)) && Number(breite) !== 0,
  'Die Koordinate ist aus der Karte übernommen',
  `Breite = ${breite}`,
);

// Eingabefelder müssen 16 px haben, sonst zoomt iOS beim Antippen hinein.
const schriftgroessen = await maske.locator('input, select, textarea').evaluateAll((els) =>
  els.map((e) => parseFloat(getComputedStyle(e).fontSize)),
);
pruefe(
  schriftgroessen.every((g) => g >= 16),
  'Alle Eingabefelder haben mindestens 16 px',
  `kleinste ${Math.min(...schriftgroessen)} px`,
);

await maske.locator('input[type="text"]').first().fill('Hoshino Coffee');
await maske.locator('select').first().selectOption('essen');
await maske.locator('textarea').fill('Pancakes, die eine halbe Stunde brauchen.');
await maske.getByRole('button', { name: 'anlegen' }).tap();
await seite.waitForTimeout(500);

pruefe(!(await maske.isVisible()), 'Die Maske schließt sich nach dem Anlegen');
const neuMarker = await seite.locator('.jp-marker.jp-eigen').count();
pruefe(neuMarker >= 1, 'Der neue Ort steht als eigener Marker auf der Karte', `${neuMarker}`);
const markerText = await seite.locator('.jp-marker.jp-eigen span').first().innerText();
pruefe(
  markerText.trim() === 'neu',
  'Ohne Abgleich trägt er "neu" statt einer erfundenen Nummer',
  `steht: "${markerText.trim()}"`,
);

// ------------------------------------------------------------ Langer Druck ---

/*
 * Echter langer Druck über das Chrome-DevTools-Protokoll: Playwrights
 * `touchscreen.tap()` kann das nicht, und ein nachgebautes Ereignis würde nur
 * beweisen, dass das Nachbauen funktioniert.
 */
console.log('\nLanger Druck auf die Karte:');
const cdp = await ctx.newCDPSession(seite);

async function langerDruck(x, y, ms = 750, versatz = 0) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  if (versatz) {
    await seite.waitForTimeout(80);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + versatz, y, id: 1 }],
    });
  }
  await seite.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await seite.waitForTimeout(350);
}

await langerDruck(karte.x + karte.width / 2, karte.y + karte.height / 2 + 40);
pruefe(
  await seite.locator('.blatt form.maske').isVisible(),
  'Langer Druck öffnet die Maske ohne Umweg über den Knopf',
);
await seite.locator('.blatt .zu').tap();
await seite.waitForTimeout(250);

// Wischen darf nicht auslösen — sonst wäre jedes Verschieben der Karte ein
// neuer Ort.
await langerDruck(karte.x + karte.width / 2, karte.y + karte.height / 2 + 40, 750, 60);
pruefe(
  (await seite.locator('.blatt').count()) === 0,
  'Wischen löst keinen neuen Ort aus',
);

// Kurzes Antippen ohne Erfassungsmodus ebenfalls nicht.
await seite.touchscreen.tap(karte.x + karte.width / 2, karte.y + karte.height / 2 + 40);
await seite.waitForTimeout(350);
pruefe(
  (await seite.locator('.blatt').count()) === 0,
  'Kurzes Antippen ohne Erfassungsmodus tut nichts',
);

// ------------------------------------------------ Abseits der Route sperren ---

console.log('\nOrt abseits der Route:');
await seite.locator('.rundknopf.haupt').tap();
await seite.touchscreen.tap(karte.x + karte.width / 2, karte.y + karte.height / 3);
await seite.waitForTimeout(400);
const maske2 = seite.locator('.blatt form.maske');
await maske2.locator('input[type="text"]').first().fill('Burg Matsumoto');
await maske2.locator('select').nth(1).selectOption('abseits');
await seite.waitForTimeout(200);
pruefe(
  await maske2.locator('.warn').isVisible(),
  'Die Maske warnt, dass der Ort nicht auf einen Reisetag kann',
);
await maske2.getByRole('button', { name: 'anlegen' }).tap();
await seite.waitForTimeout(500);

// ------------------------------------------------------ Liste und Planer ---

console.log('\nOrte-Liste:');
await seite.goto(`${BASIS}/orte/`, { waitUntil: 'load' });
await seite.waitForTimeout(900);

const hoshino = seite.locator('article.place', { hasText: 'Hoshino Coffee' });
pruefe(await hoshino.count() === 1, 'Der eigene Ort steht in der Liste');
pruefe(
  (await hoshino.locator('.pin').innerText()).trim() === 'neu',
  'Auch hier steht "neu" statt einer Nummer',
);
pruefe(
  await hoshino.getByRole('button', { name: 'bearbeiten' }).isVisible(),
  'Er ist bearbeitbar',
);

const matsumoto = seite.locator('article.place', { hasText: 'Burg Matsumoto' });
pruefe(await matsumoto.count() === 1, 'Der Ort abseits der Route steht ebenfalls in der Liste');
pruefe(
  await matsumoto.locator('.nichtplanbar').isVisible(),
  'Bei ihm steht "nicht auf der Route" statt eines Tagesknopfs',
);
pruefe(
  (await matsumoto.getByRole('button', { name: /^\+ / }).count()) === 0,
  'Er hat keinen Knopf, der ihn auf einen Tag legt',
);

// Den planbaren eigenen Ort tatsächlich auf einen Tag legen
await hoshino.getByRole('button', { name: /^\+ / }).first().tap();
await seite.waitForTimeout(300);
pruefe(
  await hoshino.getByRole('button', { name: /nehmen$/ }).isVisible(),
  'Der eigene Ort ließ sich auf einen Reisetag legen',
);

console.log('\nTagesplan:');
await seite.goto(`${BASIS}/plan/`, { waitUntil: 'load' });
await seite.waitForTimeout(900);
const planText = await seite.locator('.stops').innerText();
pruefe(planText.includes('Hoshino Coffee'), 'Der eigene Ort steht im Tagesplan');
pruefe(
  !(await seite.locator('.pool').innerText().catch(() => '')).includes('Burg Matsumoto'),
  'Der Ort abseits der Route wird im Planer nicht vorgeschlagen',
);

// ------------------------------------------------------------ Aufräumen ---

console.log('\nFehlermeldungen der Seite:');
const echte = meldungen.filter(
  // Gesperrte Kartenkacheln und Schriften sind eine Eigenheit dieser Umgebung.
  (m) => !/tile\.openstreetmap|fonts\.g|ERR_|Failed to load resource/i.test(m),
);
pruefe(echte.length === 0, 'keine Fehler in der Konsole', echte.join(' | '));

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
