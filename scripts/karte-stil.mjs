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

import { writeFile } from 'node:fs/promises';

import { osm } from '@versatiles/style';

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
