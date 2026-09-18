/**
 * Erzeugt PRUEFLISTE.md — alles, was die App über die Orte behauptet, ohne
 * dass es wörtlich in den Quellen steht.
 *
 * Der Anlass: Auf der Reise ist ein Ort, der falsch markiert ist oder gar
 * nicht existiert, schlimmer als ein fehlender. Diese Liste macht jede
 * Ableitung nachprüfbar — Buch-Kennzeichnung aus Namensvergleich, Schließtage
 * und Reservierungen aus Textmustern, die entfernten Übernachtungsvorschläge.
 *
 * Nach jeder Korrektur in den kuratierten Dateien neu erzeugen:
 *
 *   npm run data && npm run pruefliste
 */

import { readFileSync, writeFileSync } from 'node:fs';
const p = JSON.parse(readFileSync('src/data/places.json', 'utf8'));
const buch = JSON.parse(readFileSync('data/source/buch-erlebnisse.json', 'utf8'));
const titel = new Map();
for (const e of (buch.erlebnisse ?? buch)) if (e.nr) titel.set(String(e.nr), e.titel ?? e.title ?? '');

const z = [];
z.push('# Was die App behauptet, ohne dass es wörtlich in den Quellen steht');
z.push('');
z.push('Alles hier ist **abgeleitet** — aus Namensvergleich oder aus Textmustern im');
z.push('Reiseband. Jede Zeile kann falsch sein.');
z.push('');
z.push('Auf der Reise ist ein falsch markierter Ort schlimmer als ein fehlender.');
z.push('Deshalb steht hier jede Ableitung einzeln, zum Nachprüfen.');
z.push('');
z.push('## Noch offen');
z.push('');
z.push('- **Chion-in Wajun Kaikan** (Kyoto, Nacht 1) steht in `stations.json`, aber');
z.push('  nicht in den 164 Orten. Der Ort, an dem ihr die erste Nacht schlaft, ist');
z.push('  also nicht auf der Karte. Sobald die Koordinate da ist, lege ich ihn an.');
z.push('- **Kōya-san**: Die fünf Tempelherbergen Nr. 34–38 sind als erledigte');
z.push('  Vorschläge eingestuft. Falls eine Nacht dort geplant ist, stimmt das nicht.');
z.push('- **Die 📖-Liste unten** wird gerade gegen das Buch geprüft. Auffällig:');
z.push('  Nr. 47 To-ji unter Erlebnis 26 „Arashiyama" — To-ji liegt rund 8 km');
z.push('  südlich davon.');
z.push('- **Eure Unterkünfte** in Kanazawa, Takayama und Hakone trägst du selbst');
z.push('  über die Erfassungsmaske ein, mit dem Haken „hier schlafen wir".');
z.push('');
z.push('Korrekturen trage ich in die kuratierten Dateien ein');
z.push('(`data/source/buch-erlebnisse.json`, `data/source/unterkunft.json`); danach');
z.push('`npm run data && npm run pruefliste`.');
z.push('');

const bookPlaces = p.filter(x => x.book);
z.push(`## 📖 Reiseführer-Kennzeichnung (${bookPlaces.length} Orte, ${new Set(bookPlaces.map(x=>x.book)).size} Erlebnisse)`);
z.push('');
z.push('Zugeordnet über den Namen. Ein falsches 📖 heißt: Der Ort steht im Buch gar nicht.');
z.push('');
z.push('| Nr. | Ort | Erlebnis | Titel im Buch |');
z.push('|---|---|---|---|');
for (const x of bookPlaces.sort((a,b)=>a.nr-b.nr)) {
  z.push(`| ${x.nr} | ${x.name} | ${x.book} | ${x.bookTitle ?? ''} |`);
}
z.push('');

const cd = p.filter(x => x.closedDay);
z.push(`## Schließtage (${cd.length})`);
z.push('');
z.push('Aus Formulierungen wie „Di geschlossen" im Ortstext erkannt. Der Tagesplan');
z.push('**warnt**, wenn ihr so einen Ort auf diesen Wochentag legt — ein falscher');
z.push('Eintrag warnt also grundlos oder, schlimmer, gar nicht.');
z.push('');
z.push('| Nr. | Ort | erkannt | Textstelle |');
z.push('|---|---|---|---|');
for (const x of cd.sort((a,b)=>a.nr-b.nr)) {
  const t = x.descriptionHtml.replace(/<[^>]+>/g,'');
  const m = t.match(/[^.;]*(geschlossen|Ruhetag)[^.;]*/i);
  z.push(`| ${x.nr} | ${x.name} | ${x.closedDay} | ${(m?m[0]:t.slice(0,80)).trim()} |`);
}
z.push('');

const nb = p.filter(x => x.needsBooking);
z.push(`## Reservierung nötig (${nb.length})`);
z.push('');
z.push('| Nr. | Ort | Textstelle |');
z.push('|---|---|---|');
for (const x of nb.sort((a,b)=>a.nr-b.nr)) {
  const t = x.descriptionHtml.replace(/<[^>]+>/g,'');
  const m = t.match(/[^.;]*(Reservierung|reservier|Vorverkauf|Voranmeldung|buchen)[^.;]*/i);
  z.push(`| ${x.nr} | ${x.name} | ${(m?m[0]:t.slice(0,80)).trim()} |`);
}
z.push('');

const co = p.filter(x => x.cashOnly);
z.push(`## Nur Bargeld (${co.length})`);
z.push('');
z.push('| Nr. | Ort |');
z.push('|---|---|');
for (const x of co.sort((a,b)=>a.nr-b.nr)) z.push(`| ${x.nr} | ${x.name} |`);
z.push('');

const weg = p.filter(x => x.uebernachtung === 'vorschlag');
z.push(`## Aus der App genommen: Übernachtungsvorschläge (${weg.length})`);
z.push('');
z.push('Weil für jede Station etwas gebucht ist. **Das ist meine Annahme, nicht eure');
z.push('Buchungsbestätigung.** Steht hier eure tatsächliche Unterkunft dabei, gehört');
z.push('sie zurück — dann sage mir welche.');
z.push('');
z.push('| Nr. | Ort | Station | Bereich |');
z.push('|---|---|---|---|');
for (const x of weg.sort((a,b)=>a.nr-b.nr)) {
  z.push(`| ${x.nr} | ${x.name} | ${x.stationLabel} | ${x.area} |`);
}
z.push('');
z.push('## Unterkünfte, die die App kennt');
z.push('');
z.push('| Station | Was in stations.json steht | Als Ort in der App |');
z.push('|---|---|---|');
const st = JSON.parse(readFileSync('src/data/stations.json','utf8'));
const cfg = JSON.parse(readFileSync('data/source/unterkunft.json','utf8'));
for (const s of st) {
  const nr = cfg.gebucht[s.slug];
  const ort = nr ? p.find(x=>x.nr===nr) : null;
  z.push(`| ${s.name} | ${s.stay} | ${ort ? `Nr. ${ort.nr} ${ort.name}` : '— keiner —'} |`);
}
writeFileSync('PRUEFLISTE.md', z.join('\n') + '\n');
console.log('PRUEFLISTE.md geschrieben:', z.length, 'Zeilen');
