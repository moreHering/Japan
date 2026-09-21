/**
 * Erzeugt den VersaTiles-Kartenstil und legt ihn in `public/` ab.
 *
 * **Warum der Stil im Repo liegt und nicht zur Laufzeit geholt wird.**
 * Am 20.09.2026 hat die Karte auf dem Telefon nichts mehr gezeigt: Der Stil des
 * bisherigen einzigen Anbieters kam an, seine Vektorkacheln nicht — und maplibre
 * meldet so einen Ausfall nicht (eine 404-Kachel gilt dort als geladen). Jeder
 * Abruf, den die Karte zum Zeichnen braucht, ist eine Stelle, an der genau das
 * passieren kann. Diese eine fällt damit weg: Der Stil kommt vom selben Server
 * wie die App. Ist die Seite da, ist der Stil da.
 *
 * Übrig bleibt die Abhängigkeit von den **Kacheln** — die lässt sich nicht
 * wegnehmen, aber auf mehrere Schultern verteilen, siehe `ANBIETER` in
 * `src/lib/karte.ts`.
 *
 * Die Beschriftung wird hier **nicht** umgeschrieben. Das macht `deutscheNamen()`
 * zur Laufzeit, für jeden Anbieter gleich — eine Regel an einer Stelle statt
 * zwei, die auseinanderlaufen. Nötig ist es, weil der deutsche VersaTiles-Stil
 * `["coalesce", ["get","name_de"], ["get","name"]]` erzeugt: Ein japanischer Ort
 * ohne deutschen Namen stünde damit wieder auf Japanisch da.
 *
 *   npm run data
 */

import { readFile, writeFile } from 'node:fs/promises';

import { osm } from '@versatiles/style';

import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('maplibre-gl/package.json');

const ZIEL = new URL('../public/karte-versatiles.json', import.meta.url);

const stil = await osm({ text: { language: 'de' } });

// Eine Zusicherung statt eines Vertrauensvorschusses: Ändert der Anbieter seinen
// Generator, soll das hier auffallen und nicht erst auf der Reise.
const texte = stil.layers.filter((l) => l.layout && 'text-field' in l.layout);
if (stil.layers.length < 100) throw new Error(`Nur ${stil.layers.length} Ebenen — das ist kein vollständiger Stil`);
if (texte.length < 20) throw new Error(`Nur ${texte.length} Beschriftungsebenen`);
if (!JSON.stringify(stil).includes('name_de')) throw new Error('Keine deutschen Namen im Stil');

await writeFile(ZIEL, `${JSON.stringify(stil)}\n`, 'utf8');
console.log(
  `public/karte-versatiles.json: ${stil.layers.length} Ebenen, ${texte.length} davon beschriftet, ` +
    `${Math.round(JSON.stringify(stil).length / 1024)} KB`,
);

// ======================================= Der Worker von maplibre =============

/**
 * Legt maplibres Web Worker neben die App.
 *
 * **Das ist die Ursache des Ausfalls vom 20./21.09.2026, und sie steckte im
 * Bündeln.** maplibre baut die Adresse seines Workers als *Geschwisterdatei
 * neben sich selbst*:
 *
 * ```js
 * const datei = url.endsWith('-dev.mjs') ? 'maplibre-gl-worker-dev.mjs' : 'maplibre-gl-worker.mjs';
 * return new URL(`./${datei}`, import.meta.url).href;
 * ```
 *
 * Vite bündelt maplibre aber in einen Chunk unter `_astro/` und kopiert die
 * Worker-Datei **nicht** mit. Gesucht wurde also `_astro/maplibre-gl-worker.mjs`,
 * und dort ist nichts. Ergebnis: Der Worker startet nie — und **Vektorkacheln
 * werden ausschließlich im Worker geparst.** Rasterquellen nicht.
 *
 * Genau das war das Bild auf dem Telefon: Das Natural-Earth-Reliefbild des
 * Liberty-Stils (eine Rasterquelle) kam an, alles Vektorielle blieb leer. Kein
 * Fehler, keine Meldung — der Worker fehlt einfach, und maplibre wartet.
 *
 * Deshalb liegen beide Dateien jetzt in `public/karte-motor/` und werden über
 * `setWorkerUrl()` ausdrücklich benannt. Der Worker zieht seinen gemeinsamen
 * Teil nach; die Endung wird dabei auf `.js` geändert, weil `.mjs` je nach
 * Server als `application/octet-stream` ausgeliefert wird und ein
 * Modul-Worker das ablehnt.
 */
const WORKER_ZIEL = new URL('../public/karte-motor/maplibre-gl-worker.js', import.meta.url);
const GETEILT_ZIEL = new URL('../public/karte-motor/maplibre-gl-shared.js', import.meta.url);

// Über den Pfad der `package.json` und nicht über `require.resolve('maplibre-gl')`:
// Das Paket hat keinen CommonJS-Haupteintrag in seinen `exports`, der Aufruf wirft.
const dist = new URL('./dist/', new URL(require.resolve('maplibre-gl/package.json'), 'file:'));
const worker = await readFile(new URL('maplibre-gl-worker.mjs', dist), 'utf8');
const geteilt = await readFile(new URL('maplibre-gl-shared.mjs', dist), 'utf8');

const workerNeu = worker.replaceAll('./maplibre-gl-shared.mjs', './maplibre-gl-shared.js');
// Eine Zusicherung statt eines Vertrauensvorschusses: Ändert maplibre den Namen
// seines gemeinsamen Teils, soll es hier auffallen und nicht auf der Reise.
if (workerNeu === worker) throw new Error('Worker verweist nicht auf maplibre-gl-shared.mjs — Aufbau geändert?');
if (!/import\s*\{/.test(worker)) throw new Error('Worker sieht nicht wie ein ES-Modul aus');

await mkdir(new URL('../public/karte-motor/', import.meta.url), { recursive: true });
await writeFile(WORKER_ZIEL, workerNeu, 'utf8');
await writeFile(GETEILT_ZIEL, geteilt, 'utf8');
console.log(
  `public/karte-motor/: Worker ${Math.round(workerNeu.length / 1024)} KB, ` +
    `gemeinsamer Teil ${Math.round(geteilt.length / 1024)} KB (maplibre-gl ${version})`,
);
