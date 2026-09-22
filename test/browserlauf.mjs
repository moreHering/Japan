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
 * Es muss der **Dev**-Server sein und nicht `astro preview`: Mehrere Suiten rufen
 * im Browser `await import('/src/lib/…')` auf, um Zustand direkt zu setzen statt
 * ihn zu erklicken. Diesen Pfad löst nur Vite im Dev-Modus auf; im statischen
 * Build gibt es ihn nicht. Der Preis ist benannt: Die Suiten prüfen den
 * Dev-Stand, nicht Byte für Byte das ausgelieferte Bundle.
 *
 * **Für den Plan ist dieser Weg allerdings verboten** — siehe `planSchreiben()`
 * weiter unten.
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
export const KACHELHOSTS =
  /tiles\.openfreemap\.org|tiles\.versatiles\.org|tile\.openstreetmap\.org|basemaps\.cartocdn\.com/;

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
  sources: {
    /*
     * Mit einem **echten** Merkmal, nicht leer.
     *
     * GeoJSON-Quellen werden wie Vektorkacheln im Web Worker von maplibre
     * geparst. Solange dessen Datei fehlte — sie wurde beim Bündeln nicht
     * mitkopiert —, kam hier nie etwas an, und keine Vektorebene konnte sich je
     * beweisen. Die Fläche ist damit zugleich die Probe darauf, dass der Worker
     * läuft.
     */
    probe: {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Probefläche' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [134, 33],
                  [141, 33],
                  [141, 38],
                  [134, 38],
                  [134, 33],
                ],
              ],
            },
          },
        ],
      },
    },
  },
  layers: [
    { id: 'hintergrund', type: 'background', paint: { 'background-color': '#eef3ee' } },
    { id: 'flaeche', type: 'fill', source: 'probe', paint: { 'fill-color': '#cfe0cf' } },
    {
      id: 'beschriftung',
      type: 'symbol',
      source: 'probe',
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'] },
    },
  ],
};

/**
 * `PROBESTIL` **plus ein Sprite, das es nicht gibt** — ein Stil, der zeichnet und
 * trotzdem meckert.
 *
 * Dieser Stil ist die Prüfvorlage für den Fehler vom 21.09.2026. Bis dahin hat
 * `vektorVersuch()` einen Anbieter beim **ersten** `error` von maplibre verworfen.
 * Das klang vernünftig und war falsch: Ein `error` ist bei maplibre auch ein
 * fehlender Glyphenbereich, ein 404 auf ein Sprite oder eine einzelne Kachel am
 * Rand. Auf dem Telefon fiel deshalb jeder Vektoranbieter durch, und unten stand
 * „OSM-Rasterkarte" — mit japanischen Städtenamen, also genau dem, was weg
 * sollte.
 *
 * Warum ein Sprite und nicht die Glyphen: Der Zeitpunkt muss **feststehen**.
 * `Style#_load` fordert das Sprite an, bevor irgendetwas gezeichnet ist
 * (`style.ts:486`), der Fehler ist also garantiert vor der ersten Messung da.
 * Der Glyphenfehler von `PROBESTIL` kommt dagegen irgendwann — er ist der Grund,
 * warum die alte Fassung in dieser Umgebung *bestand* und auf dem Gerät nicht.
 * Eine Prüfung, die ein Rennen austrägt, prüft nichts.
 *
 * Belegt ist auch, dass der Fehler harmlos ist: `_loaded = true` steht schon vor
 * dem Sprite-Abruf, und `_loadSprite` setzt im `finally` `imageManager.setLoaded(true)`
 * (`node_modules/maplibre-gl/src/style/style.ts:478`, `534-568`). Der Stil lädt
 * fertig, die Fläche wird gezeichnet — nur eine Bilddatei fehlt.
 */
export const MELDENDER_STIL = {
  ...PROBESTIL,
  sprite: 'https://tiles.openfreemap.org/sprites/gibtsnicht',
};

/**
 * Schiebt `PROBESTIL` unter, damit die Vektorebene in jeder Umgebung entsteht.
 *
 * Muss **vor** dem ersten `goto` gerufen werden. Wer sie benutzt, sollte danach
 * prüfen, dass `.maplibregl-canvas` wirklich da ist — sonst prüft man wieder nur,
 * was die Umgebung gerade zulässt.
 */
export async function vektorStilUnterschieben(ctx, stil = PROBESTIL) {
  const antwort = (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stil) });
  // **Beide** Vektoranbieter, nicht nur einer. Sonst gewinnt auf einem Runner mit
  // freiem Netz der erste der Kette mit seinem echten Stil, und die Suite prüft
  // eine andere Karte als hier — genau der Unterschied, an dem schon zwei
  // Wächterläufe gefallen sind.
  await ctx.route('**/karte-versatiles.json', antwort);
  await ctx.route('**/styles/liberty', antwort);
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

/** Der Schlüssel, unter dem `store.svelte.ts` den Plan ablegt. */
export const PLAN_KEY = 'japan2026:plan';

/**
 * Setzt Teile des Plans über den **localStorage** und lädt die Seite neu.
 *
 * Der Grund, und er hat am 22.09.2026 drei Suiten gleichzeitig rot gemacht:
 *
 * Der naheliegende Weg war `await import('/src/lib/store.svelte.ts')` in der
 * Seite und dann `s.plan.customPlaces = […]`. Vite bedient dasselbe Modul aber
 * unter **mehreren URLs** — nach einer Neu-Optimierung hängt an den Importen
 * einer Insel ein `?v=<hash>`. Ein Import ohne diesen Anhang ist dann eine
 * **zweite Instanz** des Moduls mit ihrem eigenen `$state`: Der Test schreibt in
 * einen Plan, den die Komponente nie liest.
 *
 * Nachgewiesen im Browser: `import('…store.svelte.ts')` und
 * `import('…store.svelte.ts?x=1')` liefern zwei Zustände, und der Zähler am
 * Reisetag (`.daytab .dot`) blieb nach dem Schreiben leer. Das Tückische daran:
 * Auf einem frisch gestarteten Dev-Server — also im CI — ging es gut, nach
 * Stunden Laufzeit nicht mehr. Eine Prüfung, die mal grün und mal rot ist, ohne
 * dass sich Code geändert hat, ist schlimmer als eine, die immer fällt.
 *
 * Der localStorage hat das Problem nicht: Aus ihm liest `load()` beim Start
 * **selbst**, und es gibt ihn nur einmal je Ursprung. Preis ist ein Neuladen je
 * Aufruf.
 *
 * `teil` wird über den bestehenden Stand gelegt, nicht an seine Stelle: So kann
 * eine Suite erst Tage setzen und danach eigene Orte, ohne das Erste zu
 * verlieren. `warten` ist der Selektor, auf den nach dem Neuladen gewartet wird.
 */
export async function planSchreiben(seite, teil, warten) {
  await seite.evaluate(
    ([schluessel, neu]) => {
      let stand = {};
      try {
        stand = JSON.parse(localStorage.getItem(schluessel) ?? '{}');
      } catch {
        stand = {};
      }
      localStorage.setItem(schluessel, JSON.stringify({ ...stand, ...neu }));
    },
    [PLAN_KEY, teil],
  );
  await seite.reload({ waitUntil: 'load' });
  if (warten) await seite.waitForSelector(warten, { timeout: 15000 });
  await seite.waitForTimeout(400);
}
