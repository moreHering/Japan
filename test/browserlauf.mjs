/**
 * Gemeinsames für die Browsersuiten: wo der Dev-Server steht, welcher Browser
 * startet.
 *
 * Beides stand vorher in jeder der zehn Dateien einzeln, und beides war
 * uneinheitlich. Das ist keine Geschmacksfrage gewesen, sondern zwei Fehler:
 *
 * **1. Der falsche Port.** `browser-orte.mjs` fiel auf **4321** zurück, alle
 * anderen auf 4322. Ein `npm run test:all` schickte diese eine Suite also gegen
 * einen Port, an dem nichts horcht — sie meldete danach Fehler, die keine waren,
 * und man sucht sie im falschen Code. Dazu lasen manche Dateien nur `BASIS`,
 * andere nur `DEV`, drei beides.
 *
 * **2. Ein Browserpfad, der ins Nichts zeigt.** `executablePath` stand hart auf
 * `/opt/pw-browsers/chromium`. Das ist richtig für **diese** Umgebung, und der
 * Grund steht unten. Auf einem GitHub-Runner gibt es den Pfad nicht, und dort ist
 * ein gesetzter falscher Pfad schlechter als keiner: Playwright nimmt dann
 * **nicht** seinen eigenen installierten Browser, sondern scheitert am Start.
 *
 * Seit es den Wächter im CI gibt, laufen dieselben Suiten an zwei Orten mit
 * verschiedenen Voraussetzungen. Deshalb eine Stelle statt zehn.
 */

import { existsSync } from 'node:fs';

/**
 * Die Basis-URL des Dev-Servers, einschließlich `/Japan`.
 *
 * `BASIS` zuerst, `DEV` als Zweitname — beide Namen waren im Umlauf, und was in
 * Shell-Historien steht, soll weiter tun, was es getan hat.
 *
 * Es muss der **Dev**-Server sein und nicht `astro preview`: Sechs der Suiten
 * rufen im Browser `await import('/src/lib/store.svelte.ts')` auf, um den Plan
 * direkt zu setzen statt Orte anzuklicken. Diesen Pfad löst nur Vite im
 * Dev-Modus auf; im statischen Build gibt es ihn nicht. Der Preis ist benannt:
 * Die Suiten prüfen den Dev-Stand, nicht Byte für Byte das ausgelieferte Bundle.
 */
export const BASIS = process.env.BASIS ?? process.env.DEV ?? 'http://localhost:4322/Japan';

/**
 * Was `chromium.launch()` mitbekommt — entweder ein Pfad oder nichts.
 *
 * Warum hier überhaupt ein Pfad steht: Die installierte Playwright-Fassung
 * erwartet einen neueren Chromium als den, der im Bild dieser Umgebung liegt,
 * und nachladen lässt die Netzrichtlinie nicht zu. Ohne den ausdrücklichen Pfad
 * sucht Playwright eine Revision, die es hier nicht gibt.
 *
 * Auf einem GitHub-Runner holt `npx playwright install chromium` die **passende**
 * Revision. Dort ist `/opt/pw-browsers/chromium` nicht vorhanden, `START` bleibt
 * leer, und Playwright findet seinen eigenen Browser selbst — genau richtig.
 *
 * Geprüft wird die Existenz und nicht die Umgebung: Eine Abfrage auf
 * `process.env.CI` wäre eine Vermutung darüber, wo man ist; `existsSync` ist eine
 * Aussage darüber, was da ist.
 */
const browserPfad = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
export const START = existsSync(browserPfad) ? { executablePath: browserPfad } : {};

/**
 * Die Kachelhosts, die `browser-karte.mjs` abfängt.
 *
 * Steht hier, weil die Liste zur Umgebung gehört und nicht zur Prüfung: Sie muss
 * mit den Hosts in `MapView.svelte` und `karte.ts` übereinstimmen. Kommt dort
 * einer dazu, gehört er hierher — sonst prüft die Suite einen Fehlerfall, den sie
 * nur halb hergestellt hat.
 */
export const KACHELHOSTS = /tiles\.openfreemap\.org|tile\.openstreetmap\.org|basemaps\.cartocdn\.com/;

/**
 * Ein winziger, gültiger MapLibre-Stil, der **statt** des echten ausgeliefert wird.
 *
 * Der Grund ist derselbe wie bei der erzwungenen Kachelsperre in
 * `browser-karte.mjs`, nur andersherum: Hier ist `tiles.openfreemap.org` gesperrt,
 * die Vektorebene kommt also nie zustande. Auf einem GitHub-Runner ist das Netz
 * frei, maplibre hängt seine Leinwand über die ganze Kartenfläche — und die hat
 * **kein** `pointer-events: none`. Eine Suite, die Punkte auf der Karte antippt,
 * sieht damit in den beiden Umgebungen zwei verschiedene Welten. Genau daran ist
 * Wächterlauf 39 gefallen.
 *
 * Der Stil hat eine leere GeoJSON-Quelle: Es werden keine Kacheln und keine
 * Glyphen nachgeladen, und `deutscheNamen()` findet trotzdem seine Textebene und
 * wirft nicht.
 */
export const PROBESTIL = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: { leer: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
  layers: [
    { id: 'hintergrund', type: 'background', paint: { 'background-color': '#eef3ee' } },
    {
      id: 'beschriftung',
      type: 'symbol',
      source: 'leer',
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'] },
    },
  ],
};

/**
 * Schiebt `PROBESTIL` unter, damit die Vektorebene in jeder Umgebung entsteht.
 *
 * Muss **vor** dem ersten `goto` gerufen werden. Wer sie benutzt, sollte danach
 * prüfen, dass `.maplibregl-canvas` wirklich da ist — sonst prüft man wieder nur,
 * was die Umgebung gerade zulässt.
 */
export async function vektorStilUnterschieben(ctx, stil = PROBESTIL) {
  await ctx.route('**/styles/liberty', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stil),
    }),
  );
}

/**
 * Ein Stil mit einer **Vektorquelle, die nie antwortet** — der Fall vom Telefon.
 *
 * Genau dieser Zustand ist der App bis zum 20.09.2026 entgangen: Der Stil lädt,
 * die Ebene hängt, kein Fehler wird gemeldet — und auf der Karte steht nichts.
 * Die Rasterquelle des echten Liberty-Stils (ein Natural-Earth-Relief) kam an
 * und sah aus wie eine Karte.
 *
 * Die leere GeoJSON-Quelle daneben ist nötig, damit `deutscheNamen()` eine
 * Textebene findet und nicht wirft — sonst greift der Rasterrückfall schon vor
 * der Messung, und die Prüfung prüfte den falschen Weg.
 */
export const STUMMER_VEKTORSTIL = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {
    daten: {
      type: 'vector',
      tiles: ['https://tiles.openfreemap.org/stumm/{z}/{x}/{y}.pbf'],
      minzoom: 0,
      maxzoom: 14,
    },
    leer: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'hintergrund', type: 'background', paint: { 'background-color': '#eef3ee' } },
    {
      id: 'wasser',
      type: 'fill',
      source: 'daten',
      'source-layer': 'water',
      paint: { 'fill-color': '#9ebdff' },
    },
    {
      id: 'beschriftung',
      type: 'symbol',
      source: 'leer',
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'] },
    },
  ],
};
