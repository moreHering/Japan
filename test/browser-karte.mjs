/**
 * Prüft, was die Karte tut, wenn der Kartenhintergrund **nicht** kommt.
 *
 * Diese Datei kann genau das beweisen, was sonst am Telefon hängt — weil der
 * Egress-Proxy dieser Umgebung jeden Kachelhost sperrt (gemessen: OSM, CARTO,
 * Wikimedia, Esri, OpenFreeMap, alle `connect_rejected`). Der Fehlerfall ist hier
 * der Normalzustand, und damit ist er zuverlässig prüfbar statt zufällig.
 *
 * Der Anlass: Auf dem Telefon war die Karte grau, ohne ein Wort dazu.
 * `L.tileLayer(...)` hatte keinen `tileerror`-Zweig — bei einem Fehlschlag passierte
 * nichts, übrig blieb die Hintergrundfarbe des Containers. Eine Karte, die nicht
 * sagt, dass ihr der Untergrund fehlt, ist von einer kaputten Karte nicht zu
 * unterscheiden.
 *
 * Geprüft wird deshalb dreierlei:
 *   1. Der Hinweis erscheint überhaupt.
 *   2. Er nennt den Host, der nicht antwortet — das ist die Diagnose, die auf dem
 *      Telefon fehlte.
 *   3. Er blockiert die Karte **nicht**. Das ist die wichtigste: Ein Überzug, der
 *      Marker unerreichbar macht, wäre schlimmer als der Fehler selbst.
 *
 * Was diese Datei **nicht** kann: zeigen, dass Kacheln ankommen oder in welcher
 * Sprache sie beschriftet sind. Das sieht nur ein Gerät mit freiem Netz.
 *
 *   npx astro dev --port 4322 &   und dann   node test/browser-karte.mjs
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

/** Welche Kartendienste die Seite anspricht — daran hängt die Host-Aussage. */
function beobachte(seite, eimer) {
  seite.on('request', (r) => {
    const u = r.url();
    if (/tile|openfreemap|maplibre/i.test(u)) eimer.push(u);
  });
}

// =================================================== 1) Orte-Seite, Handy ======

const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const seite = await ctx.newPage();
const angefragt = [];
beobachte(seite, angefragt);

console.log('Orte-Seite (390 px), Kartenhintergrund nicht erreichbar:');
await seite.goto(`${BASIS}/orte/`, { waitUntil: 'load' });
// Auf dem Handy startet /orte/ in der Listenansicht und versteckt die Karte
// (`data-view='liste'`). Erst umschalten, sonst wartet man auf ein Element, das
// absichtlich unsichtbar ist — und hält das für einen Fehler.
await seite.waitForSelector('.leaflet-container', { state: 'attached', timeout: 15000 });
await seite.locator('.switch button', { hasText: 'Karte' }).tap();
await seite.waitForSelector('.leaflet-container', { state: 'visible', timeout: 15000 });

// Der Hinweis darf nicht sofort da sein, sondern erst, wenn ein Abruf scheitert —
// sonst stünde er auch bei funktionierendem Netz kurz auf der Karte.
const hinweis = seite.locator('.kachelfehler');
await hinweis.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
pruefe(await hinweis.isVisible(), 'der Hinweis erscheint, wenn kein Hintergrund kommt');

const text = (await hinweis.innerText().catch(() => '')).replace(/\s+/g, ' ');
pruefe(/lädt nicht/.test(text), 'er sagt, was fehlt', text.slice(0, 60));
pruefe(
  /funktionieren weiter/.test(text),
  'und dass die Orte weiter funktionieren — sonst hält man alles für kaputt',
);
pruefe(
  /openfreemap\.org|openstreetmap\.org/.test(text),
  'er nennt den Host, der nicht antwortet — die Diagnose, die vorher fehlte',
  text.match(/\S+\.org/)?.[0] ?? '(keiner)',
);

// ------------------------------- Der Überzug darf nichts unerreichbar machen ---

console.log('\nDer Hinweis blockiert die Karte nicht:');
const durchlaessig = await hinweis.evaluate((n) => getComputedStyle(n).pointerEvents);
pruefe(durchlaessig === 'none', 'der Überzug selbst nimmt keine Tipps an', durchlaessig);
const knopfDurch = await hinweis
  .locator('button')
  .evaluate((n) => getComputedStyle(n).pointerEvents);
pruefe(knopfDurch === 'auto', 'nur der Knopf nimmt Tipps an', knopfDurch);
const knopfHoch = await hinweis
  .locator('button')
  .evaluate((n) => Math.round(n.getBoundingClientRect().height));
pruefe(knopfHoch >= 44, 'und ist mindestens 44 px hoch', `${knopfHoch} px`);

/*
 * Die Probe aufs Ganze, und zwar direkt gefragt: Liegt der Hinweis irgendwo über
 * der Karte so, dass er Tipps abfängt?
 *
 * Über `elementFromPoint` auf einem Raster über die Kartenfläche und **nicht**
 * über einen Markerklick. Ein Markerklick prüft das nur mittelbar und hängt an
 * Leaflets Treffererkennung: Bei Übersichtszoom liegen von 141 Markern viele
 * übereinander, ein echter Mausklick trifft jeweils den obersten, und ob dessen
 * Popup aufgeht, sagt über den Überzug nichts. `elementFromPoint` beantwortet
 * genau die gestellte Frage — deterministisch und ohne Umweg.
 */
const verdeckt = await seite.evaluate(() => {
  const karte = document.querySelector('.leaflet-container');
  const r = karte.getBoundingClientRect();
  const treffer = [];
  for (let sx = 1; sx <= 5; sx++) {
    for (let sy = 1; sy <= 5; sy++) {
      const x = Math.round(r.left + (r.width * sx) / 6);
      const y = Math.round(r.top + (r.height * sy) / 6);
      const oben = document.elementFromPoint(x, y);
      if (oben?.closest?.('.kachelfehler')) treffer.push(`${x},${y}`);
    }
  }
  return treffer;
});
pruefe(
  verdeckt.length === 0,
  'an keiner Stelle der Karte fängt der Hinweis den Tipp ab',
  verdeckt.length ? `verdeckt bei ${verdeckt.join(' / ')}` : '25 Stellen geprüft',
);

/*
 * Und die Marker selbst reagieren noch — ohne Kartenbild ist das alles, was die
 * Karte noch leistet.
 *
 * `element.click()` im Dokument und nicht über die Maus: Damit wird genau
 * geprüft, was hier zur Debatte steht (Leaflets Klickzweig am Marker lebt), und
 * nicht Playwrights Treffererkennung auf einem Haufen überlappender Marker.
 * Dass der Überzug nichts abfängt, ist oben eigenständig gezeigt — diese Prüfung
 * muss es also nicht mitbeweisen.
 */
const popupText = await seite.evaluate(async () => {
  document.querySelector('.jp-marker')?.click();
  await new Promise((r) => setTimeout(r, 400));
  return document.querySelector('.leaflet-popup-content')?.innerText ?? '';
});
pruefe(popupText.length > 0, 'ein Marker öffnet sein Popup, auch ohne Kartenbild',
  popupText.split('\n')[0]?.slice(0, 34));

console.log('\nWas die Seite überhaupt angefragt hat:');
const hosts = [...new Set(angefragt.map((u) => new URL(u).host))];
pruefe(hosts.length > 0, 'sie hat einen Kartendienst angesprochen', hosts.join(' · '));
pruefe(
  hosts.some((h) => /openfreemap/.test(h)),
  'darunter den Vektordienst — der Weg über OpenFreeMap wird wirklich gegangen',
  hosts.join(' · '),
);

// ================================================ 2) Der Rasterrückfall =======

/*
 * Ohne WebGL kann maplibre nicht zeichnen. Dann **muss** die Rasterebene
 * entstehen, sonst hätte die Umstellung einen neuen Weg geschaffen, grau zu
 * werden — und zwar auf genau den Geräten, die am wenigsten können.
 *
 * `--disable-webgl` schaltet es im Testbrowser ab. Geprüft wird nicht das Bild
 * (die Kacheln sind hier ohnehin gesperrt), sondern dass die Seite die
 * Rasterkacheln **anfragt**: Das beweist, dass der Rückfall gegriffen hat.
 */
console.log('\nOhne WebGL greift der Rasterrückfall:');
const ohneGl = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--disable-webgl', '--disable-webgl2', '--disable-gpu'],
});
const ctx2 = await ohneGl.newContext({ ...devices['iPhone 13'] });
const s2 = await ctx2.newPage();
const angefragt2 = [];
beobachte(s2, angefragt2);
await s2.goto(`${BASIS}/orte/`, { waitUntil: 'load' });
await s2.waitForSelector('.leaflet-container', { state: 'attached', timeout: 15000 });
await s2.locator('.switch button', { hasText: 'Karte' }).tap();
await s2.waitForTimeout(4000);

const hatWebGl = await s2.evaluate(() => {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
});
// Wenn der Schalter nicht greift, prüft der Rest nichts — dann muss das dastehen
// und nicht als „bestanden" durchgehen.
pruefe(!hatWebGl, 'WebGL ist im Testbrowser wirklich abgeschaltet', hatWebGl ? 'noch da' : 'weg');
const hosts2 = [...new Set(angefragt2.map((u) => new URL(u).host))];
pruefe(
  hosts2.some((h) => /tile\.openstreetmap\.org/.test(h)),
  'die Rasterkacheln werden angefragt — der Rückfall greift',
  hosts2.join(' · '),
);
pruefe(await s2.locator('.kachelfehler').isVisible(), 'und der Hinweis erscheint auch dort');
await ohneGl.close();

// ================================================ 3) Die übrigen Karten =======

console.log('\nTagesplan und Gästeansicht:');
for (const [pfad, vorher] of [
  ['/plan/', async (p) => { await p.locator('.dayactions button', { hasText: 'Karte an' }).tap().catch(() => {}); }],
  // Die Gästeseite rendert ihre Karte erst mit Inhalt — ohne Supabase gibt es
  // keinen. Zustand direkt setzen, wie in `browser-tagebuch.mjs`; sonst wartet
  // man auf ein Element, das es zu Recht nicht gibt.
  ['/tagebuch/', async (p) => {
    await p.evaluate(async () => {
      const fb = await import('/src/lib/freundebuch.svelte.ts');
      fb.buch.personen = [{ id: 'aaaa', name: 'Paule', farbe: '#C6402B' }];
      fb.buch.beitraege = [{
        id: 'k1', text: 'Kartenprobe', datum: '2026-09-27', ortNr: null,
        ortName: 'Kuromon-Ichiba', ortLat: 34.6656, ortLng: 135.5061,
        sticker: null, bildPfad: null, bildUrl: null, autorId: 'aaaa',
        erstellt: '2026-09-27T09:00:00Z',
      }];
      fb.buch.status = 'bereit';
    });
    await p.waitForTimeout(700);
  }],
]) {
  await seite.goto(`${BASIS}${pfad}`, { waitUntil: 'load' });
  await seite.waitForTimeout(700);
  await vorher(seite);
  await seite.waitForSelector('.leaflet-container', { timeout: 15000 }).catch(() => {});
  await seite.locator('.kachelfehler').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  pruefe(await seite.locator('.kachelfehler').isVisible(), `${pfad} zeigt denselben Hinweis`);
  const quer = await seite.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  pruefe(!quer, `${pfad}: kein Querscrollen mit dem Hinweis`);
}

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
