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

import { readFile } from 'node:fs/promises';

import { chromium, devices } from 'playwright';

import { BASIS, START, vektorStilUnterschieben } from './browserlauf.mjs';
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
 * Web-Mercator, wie Leaflet ihn rechnet (EPSG:3857, Kachelgröße 256).
 *
 * Das ist die **äußere** Wahrheit dieser Datei. Ohne sie prüft man die Karte
 * nur gegen sich selbst: Marker und die Koordinatenwahl benutzen beide denselben
 * Pixelursprung, und wenn der falsch ist, sind sie **miteinander** trotzdem
 * einig. Genau daran ist der Fehler vorbeigekommen, der auf dem Telefon alle 141
 * Marker in die linke obere Ecke geschoben hat.
 */
const WELT = (z) => 256 * 2 ** z;
function projiziere(lat, lng, z) {
  const s = Math.sin((lat * Math.PI) / 180);
  const w = WELT(z);
  return {
    x: ((lng + 180) / 360) * w,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * w,
  };
}
function entprojiziere(x, y, z) {
  const w = WELT(z);
  const n = Math.PI - 2 * Math.PI * (y / w);
  return {
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    lng: (x / w) * 360 - 180,
  };
}
/** Luftlinie in Kilometern (Haversine). */
function km(aLat, aLng, bLat, bLng) {
  const r = (g) => (g * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLng = r(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/*
 * Der Ausschnitt, mit dem `/orte/` startet — die Vorgaben aus `MapView.svelte`,
 * die `PlaceExplorer` nicht überschreibt. Ändert jemand sie dort, fällt diese
 * Datei laut um, und das ist erwünscht: Die Sollposition eines Markers lässt
 * sich ohne Mittelpunkt und Zoom nicht ausrechnen.
 */
const START_MITTE = { lat: 36.2, lng: 137.5 };
const START_ZOOM = 6;

/** Orte aus den Stammdaten, um Marker gegen ihre echte Koordinate zu prüfen. */
const orte = JSON.parse(
  await readFile(new URL('../src/data/places.json', import.meta.url), 'utf8'),
);
const ortNach = new Map(orte.map((o) => [String(o.nr), o]));

// Warum `START` und nicht einfach `chromium.launch()`: siehe `browserlauf.mjs`.
// Kurz — hier braucht Playwright einen ausdrücklichen Pfad, auf einem Runner darf
// es keinen bekommen.
const browser = await chromium.launch({ ...START });
const ctx = await browser.newContext({ ...iPhone });
/*
 * Die Vektorebene wird erzwungen, nicht vorgefunden — siehe `browserlauf.mjs`.
 * Ohne das prüft diese Datei hier eine Karte ohne Leinwand und auf dem Runner
 * eine mit, und die beiden verhalten sich beim Antippen verschieden.
 */
await vektorStilUnterschieben(ctx);
const seite = await ctx.newPage();

const meldungen = [];
seite.on('console', (m) => {
  if (m.type() === 'error') meldungen.push(m.text());
});
seite.on('pageerror', (e) => meldungen.push(`pageerror: ${e.message}`));

/**
 * Mitte des **sichtbaren** Teils der Karte.
 *
 * Die Karte ist höher als der Bildschirm, und Berührungen über das
 * DevTools-Protokoll gehen an Bildschirmkoordinaten: Ein Punkt unterhalb des
 * sichtbaren Bereichs trifft nichts. Jedes Mal neu gemessen, weil sich das
 * Layout zwischen den Abschnitten ändert.
 */
/** Auf die Kartenansicht schalten, falls gerade die Liste zu sehen ist. */
async function zurKarte() {
  if (await seite.locator('.leaflet-container').isVisible()) return;
  await seite.locator('.switch .btn', { hasText: 'Karte' }).tap();
  await seite.waitForTimeout(400);
}

async function kartenMitte() {
  await zurKarte();
  const k = await seite.locator('.leaflet-container').boundingBox();
  const sicht = seite.viewportSize();
  return {
    x: Math.round(k.x + k.width / 2),
    y: Math.round((Math.max(k.y, 0) + Math.min(k.y + k.height, sicht.height)) / 2),
  };
}

/**
 * Ein Punkt, an dem wirklich die Karte liegt — und kein Popup und kein Marker.
 *
 * Vorher hat diese Datei blind die Mitte angetippt. Das ging nur gut, solange
 * der Größenfehler sämtliche Marker und Popups in die linke obere Ecke
 * geschoben hat: Die Mitte war dadurch immer leer. Mit richtig sitzender Karte
 * liegt über der Mitte das Popup des zuletzt angelegten Ortes, und Leaflet
 * stoppt dort die Weitergabe von `touchstart` — der lange Druck käme nie an.
 *
 * Geprüft wird weiter dasselbe Verhalten, nur an einer Stelle, an der die Karte
 * tatsächlich freiliegt.
 */
async function freieStelle() {
  await zurKarte();
  const k = await seite.locator('.leaflet-container').boundingBox();
  const sicht = seite.viewportSize();
  const oben = Math.max(k.y, 0) + 30;
  const unten = Math.min(k.y + k.height, sicht.height) - 30;
  const punkte = [];
  for (let y = oben; y <= unten; y += 24) {
    for (const x of [k.x + k.width * 0.2, k.x + k.width * 0.5, k.x + k.width * 0.8]) {
      punkte.push({ x: Math.round(x), y: Math.round(y) });
    }
  }
  /*
   * „Frei" heißt **nicht** „`elementFromPoint` liefert genau `.leaflet-container`".
   * Das war die erste Fassung, und sie ist im CI gefallen: Hier sperrt der Proxy
   * jeden Kachelhost, die Karte bleibt leer und der Container liegt selbst
   * obenauf. Auf einem Runner mit freiem Netz lädt die Vektorkarte, und dann
   * deckt die maplibre-Leinwand die ganze Fläche ab — sie hat kein
   * `pointer-events: none`. Es gab also **keine** freie Stelle, und die Suite
   * fiel an einem Unterschied der Umgebung, nicht an einem Fehler der App.
   *
   * Richtig gefragt ist: Liegt hier etwas **darüber**, das den Druck schluckt?
   * Marker, Popups und Leaflets Bedienknöpfe tun das, die Kartenfläche nicht —
   * egal ob sie aus Kacheln, aus einer Leinwand oder aus nichts besteht.
   */
  const treffer = await seite.evaluate((kandidaten) => {
    const IM_WEG = '.leaflet-marker-icon, .leaflet-popup, .leaflet-control-container';
    let letzterHinderer = 'nichts getroffen';
    for (const p of kandidaten) {
      const el = document.elementFromPoint(p.x, p.y);
      if (!el) continue;
      if (!el.closest('.leaflet-container')) {
        letzterHinderer = `außerhalb der Karte: ${el.className}`;
        continue;
      }
      const drueber = el.closest(IM_WEG);
      if (drueber) {
        letzterHinderer = `verdeckt von ${drueber.className}`;
        continue;
      }
      return { punkt: p, hinderer: null };
    }
    return { punkt: null, hinderer: letzterHinderer };
  }, punkte);

  // Kein stiller Ersatzpunkt: Der würde die folgende Prüfung fehlschlagen
  // lassen, ohne den Grund zu nennen. Deshalb steht hier, was im Weg lag.
  pruefe(
    treffer.punkt !== null,
    'Auf der Karte ist eine freie Stelle zum Drücken erreichbar',
    treffer.hinderer ?? '',
  );
  return treffer.punkt ?? { x: Math.round(k.x + k.width / 2), y: Math.round((oben + unten) / 2) };
}

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
  ['/orte/', 'Orte & Karte'],
  ['/organisation/', 'Organisation'],
  ['/freundebuch/', 'Freundebuch'],
]) {
  await seite.goto(`${BASIS}${pfad}`, { waitUntil: 'load' });
  await seite.waitForTimeout(700); // Islands hydrieren
  const { doc, fenster } = await querscroll();
  pruefe(doc <= fenster + 1, `${name}: kein Querscrollen`, `${doc} px Inhalt bei ${fenster} px`);
}

// ------------------------------------------------------------ Alte Adresse ---

console.log('\nDie frühere Kartenseite:');
// Mit Schrägstrich, wie die Seite ihre Adressen selbst schreibt
// (trailingSlash: 'always').
await seite.goto(`${BASIS}/karte/`, { waitUntil: 'load' });
await seite.waitForTimeout(900);
pruefe(
  seite.url().includes('/orte/'),
  'leitet auf Orte & Karte weiter, statt ins Leere zu laufen',
  seite.url(),
);

// ------------------------------------------------- Erfassung auf der Karte ---

await seite.goto(`${BASIS}/orte/`, { waitUntil: 'load' });
// Auf dem Handy startet die Ansicht in der Liste — die Karte ist dann
// ausgeblendet und wird erst nach dem Umschalten sichtbar.
await seite.waitForSelector('.switch .btn', { timeout: 15000 });
await seite.locator('.switch .btn', { hasText: 'Karte' }).tap();
await seite.waitForSelector('.leaflet-container', { state: 'visible', timeout: 15000 });
await seite.waitForTimeout(700);

// ------------------------------------------------ Die Marker sitzen richtig ---

/*
 * Der Block, den es vorher nicht gab — und der Fehler, den es deshalb bis auf
 * das Telefon geschafft hat: Auf dem Handy startet `/orte/` auf dem Reiter
 * „Liste", die Karte entsteht also in einem Container mit `display: none` und
 * damit der Größe 0. Leaflet merkt sich diese Größe und zieht beim Pixelursprung
 * keinen halben Bildschirm mehr ab; alle 141 Marker rutschen um rund 191/325 px
 * nach links oben auf einen Haufen. Gemessen am ausgelieferten Stand, nicht
 * vermutet.
 *
 * Geprüft wird gegen die **ausgerechnete** Position, nicht gegen die Nachbarn:
 * Marker und Koordinatenwahl teilen sich den Pixelursprung und sind
 * miteinander auch dann einig, wenn er falsch ist.
 */
console.log('\nMarker sitzen an der Stelle, die ihre Koordinate vorgibt:');
{
  // Erst nachweisen, dass das Unterschieben gewirkt hat. Sonst prüft die Suite
  // bloß wieder, was die Umgebung gerade zulässt — und meldet es als Erfolg.
  const leinwand = await seite.locator('.maplibregl-canvas').count();
  pruefe(leinwand === 1, 'Die untergeschobene Vektorebene liegt auf der Karte', `${leinwand} Leinwände`);
}
{
  const gezeichnet = await seite.evaluate(() => {
    const c = document.querySelector('.leaflet-container');
    const pane = document.querySelector('.leaflet-map-pane');
    const versatz = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(pane?.style.transform ?? '');
    const ox = versatz ? +versatz[1] : 0;
    const oy = versatz ? +versatz[2] : 0;
    const marker = [...document.querySelectorAll('.leaflet-marker-icon')].map((el) => {
      const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(el.style.transform ?? '');
      return m
        ? { nr: (el.getAttribute('title') ?? '').split(' ')[0], x: +m[1] + ox, y: +m[2] + oy }
        : null;
    });
    return {
      breite: c.clientWidth,
      hoehe: c.clientHeight,
      marker: marker.filter(Boolean),
    };
  });

  // Erst zählen, dann prüfen: Ein leeres Feld würde sonst jede folgende Prüfung
  // stumm bestehen lassen — eine Gegenprobe, die nichts beweist.
  pruefe(
    gezeichnet.marker.length >= 100,
    'Die Karte zeichnet die Marker überhaupt',
    `${gezeichnet.marker.length} gefunden`,
  );
  pruefe(
    gezeichnet.breite > 0 && gezeichnet.hoehe > 0,
    'Die Karte kennt ihre eigene Größe',
    `${gezeichnet.breite} × ${gezeichnet.hoehe} px`,
  );

  if (gezeichnet.marker.length >= 100 && gezeichnet.breite > 0) {
    const drinnen = gezeichnet.marker.filter(
      (m) => m.x >= 0 && m.y >= 0 && m.x <= gezeichnet.breite && m.y <= gezeichnet.hoehe,
    );
    pruefe(
      drinnen.length >= gezeichnet.marker.length * 0.9,
      'Fast alle Marker liegen innerhalb der Kartenfläche',
      `${drinnen.length} von ${gezeichnet.marker.length}`,
    );

    // Die Sollposition: Weltpixel des Ortes minus Weltpixel des Mittelpunkts,
    // plus die halbe Kartenfläche. Genau das, was Leaflet mit einer richtig
    // gemessenen Größe täte.
    const mitte = projiziere(START_MITTE.lat, START_MITTE.lng, START_ZOOM);
    for (const nr of ['54', '98', '160']) {
      const ist = gezeichnet.marker.find((m) => m.nr === nr);
      const ort = ortNach.get(nr);
      if (!ist || !ort) {
        pruefe(false, `Marker ${nr} ist vorhanden`, ist ? 'Ort fehlt in places.json' : 'nicht gezeichnet');
        continue;
      }
      const soll = projiziere(ort.lat, ort.lng, START_ZOOM);
      const sx = soll.x - mitte.x + gezeichnet.breite / 2;
      const sy = soll.y - mitte.y + gezeichnet.hoehe / 2;
      const ab = Math.hypot(ist.x - sx, ist.y - sy);
      pruefe(
        ab <= 4,
        `Marker ${nr} (${ort.name}) steht, wo seine Koordinate hingehört`,
        `${Math.round(ab)} px daneben — ist ${Math.round(ist.x)}/${Math.round(ist.y)}, soll ${Math.round(sx)}/${Math.round(sy)}`,
      );
    }
  }
}

console.log('\nEigenen Ort auf der Karte anlegen:');

const plusKnopf = seite.locator('.rundknopf');
pruefe(await plusKnopf.isVisible(), 'Der +-Knopf ist sichtbar');
const kasten = await plusKnopf.boundingBox();
pruefe(
  kasten !== null && kasten.height >= 44,
  'Der +-Knopf ist mindestens 44 px hoch',
  kasten ? `${Math.round(kasten.height)} px` : 'nicht gefunden',
);

await zurKarte();
await plusKnopf.tap();
pruefe(
  await seite.locator('.pickhint').isVisible(),
  'Der Hinweis zum Antippen der Karte erscheint',
);

// Mitte der Karte antippen — und die Stelle merken, um die zurückgemeldete
// Koordinate gegen sie halten zu können.
const tippPunkt = await kartenMitte();
const kartenRahmen = await seite.locator('.leaflet-container').boundingBox();
await seite.touchscreen.tap(tippPunkt.x, tippPunkt.y);
await seite.waitForTimeout(400);

const maske = seite.locator('.erfassen form.maske');
pruefe(await maske.isVisible(), 'Die Maske öffnet sich');
pruefe(
  await seite.locator('.jp-pin-neu').count() === 1,
  'Ein Vorschau-Pin steht auf der gewählten Stelle',
);

const breite = await maske.locator('input[inputmode="decimal"]').first().inputValue();
const laenge = await maske.locator('input[inputmode="decimal"]').nth(1).inputValue();
pruefe(
  Number.isFinite(Number(breite)) && Number(breite) !== 0,
  'Die Koordinate ist aus der Karte übernommen',
  `Breite = ${breite}`,
);
/*
 * Und sie muss die **angetippte** Stelle treffen.
 *
 * Vorher stand hier nur „endlich und ≠ 0". Mit dem Größenfehler kam ein Punkt
 * rund 650 km nordöstlich heraus — irgendwo vor Aomori — und die Prüfung war
 * grün. Ein falsch gesetzter Ort ist auf der Reise schlimmer als ein fehlender;
 * genau deshalb wird hier jetzt gerechnet statt nur auf Plausibilität geschaut.
 */
{
  const mitte = projiziere(START_MITTE.lat, START_MITTE.lng, START_ZOOM);
  const soll = entprojiziere(
    mitte.x + (tippPunkt.x - kartenRahmen.x) - kartenRahmen.width / 2,
    mitte.y + (tippPunkt.y - kartenRahmen.y) - kartenRahmen.height / 2,
    START_ZOOM,
  );
  const ab = km(Number(breite), Number(laenge), soll.lat, soll.lng);
  pruefe(
    Number.isFinite(ab) && ab <= 5,
    'Die übernommene Koordinate gehört zur angetippten Stelle',
    `${ab.toFixed(1)} km daneben — ist ${breite}/${laenge}, soll ${soll.lat.toFixed(4)}/${soll.lng.toFixed(4)}`,
  );
}

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
// Nach dem Anlegen steht die Ansicht wieder auf der Liste — die Karte ist
// dann ausgeblendet und nimmt keine Berührung an.
await seite.locator('.switch .btn', { hasText: 'Karte' }).tap();
await seite.waitForTimeout(500);
// Die Karte sitzt nach dem Umschalten an einer anderen Stelle als vorher —
// deshalb neu messen statt den alten Kasten wiederzuverwenden.
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

{
  const m = await freieStelle();
  await langerDruck(m.x, m.y);
}
pruefe(
  await seite.locator('.erfassen form.maske').isVisible(),
  'Langer Druck öffnet die Maske ohne Umweg über den Knopf',
);
await seite.locator('.erfassen .zu').tap();
await seite.waitForTimeout(250);

// Wischen darf nicht auslösen — sonst wäre jedes Verschieben der Karte ein
// neuer Ort.
{
  const m = await freieStelle();
  await langerDruck(m.x, m.y, 750, 60);
}
pruefe(
  (await seite.locator('.erfassen').count()) === 0,
  'Wischen löst keinen neuen Ort aus',
);

// Kurzes Antippen ohne Erfassungsmodus ebenfalls nicht.
{
  const m = await freieStelle();
  await seite.touchscreen.tap(m.x, m.y);
}
await seite.waitForTimeout(350);
pruefe(
  (await seite.locator('.erfassen').count()) === 0,
  'Kurzes Antippen ohne Erfassungsmodus tut nichts',
);

// ------------------------------------------------ Abseits der Route sperren ---

console.log('\nOrt abseits der Route:');
await zurKarte();
await seite.locator('.rundknopf').tap();
{
  const m = await kartenMitte();
  await seite.touchscreen.tap(m.x, m.y - 30);
}
await seite.waitForTimeout(400);
const maske2 = seite.locator('.erfassen form.maske');
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

// ------------------------------------------------ Fusionierter Bildschirm ---

console.log('\nEin Filter für Liste und Karte:');
await seite.goto(`${BASIS}/orte/`, { waitUntil: 'load' });
await seite.waitForTimeout(900);

const alleOrte = Number(
  (await seite.locator('.schnell .count').first().innerText()).match(/von (\d+)/)[1],
);
pruefe(alleOrte >= 141, 'Die Zählung nennt alle Orte', String(alleOrte));

// Auf dem Handy liegen die Filter zusammengeklappt — das ist der Zweck.
const ersteKarte = await seite.locator('article.place').first().boundingBox();
pruefe(
  ersteKarte.y < 400,
  'Der erste Ort steht ohne Scrollen auf dem Schirm',
  `y = ${Math.round(ersteKarte.y)} px`,
);
await seite.locator('.filterknopf').tap();
await seite.waitForTimeout(400);
pruefe(
  await seite.locator('.tagwahl select').isVisible(),
  'Der Filterknopf klappt die Filter auf',
);

// Keine Übernachtungsvorschläge mehr
await seite.locator('input[type="search"]').fill('Ryokan');
await seite.waitForTimeout(400);
const ryokanTreffer = await seite.locator('article.place').count();
pruefe(
  ryokanTreffer === 0,
  'Die Suche nach "Ryokan" findet keinen Vorschlag mehr',
  `${ryokanTreffer} Treffer`,
);

await seite.locator('input[type="search"]').fill('Shin-Ōkubo');
await seite.waitForTimeout(400);
pruefe(
  (await seite.locator('article.place .gebucht').count()) === 1,
  'Die gebuchte Unterkunft steht da und ist als solche gekennzeichnet',
);
await seite.locator('input[type="search"]').fill('');
await seite.waitForTimeout(300);

// Der Tagesfilter von der früheren Kartenseite
const vorher = await seite.locator('article.place').count();
await seite.locator('.tagwahl select').selectOption({ index: 1 });
await seite.waitForTimeout(500);
const nachher = await seite.locator('article.place').count();
pruefe(
  nachher < vorher,
  'Der Tagesfilter engt Liste und Karte gemeinsam ein',
  `${vorher} → ${nachher}`,
);
pruefe(
  (await seite.locator('.chip[disabled]').count()) > 0,
  'Die übrigen Filter stehen dabei still, statt wirkungslos anklickbar zu sein',
);
await seite.locator('.tagwahl select').selectOption('');
await seite.waitForTimeout(400);
pruefe(
  (await seite.locator('article.place').count()) === vorher,
  'Und geben die Liste wieder frei',
);
pruefe(
  Number(
    (await seite.locator('.filterknopf').innerText()).match(/\((\d+)\)/)?.[1] ?? 0,
  ) === 0,
  'Der Filterknopf zeigt wieder keine aktive Einschränkung',
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
