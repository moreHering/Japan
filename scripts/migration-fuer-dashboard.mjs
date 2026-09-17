/**
 * Erzeugt aus den Migrationen eine Fassung für den SQL-Editor im
 * Supabase-Dashboard.
 *
 * Warum: Der Editor kennt die Metabefehle von psql nicht (`\if`, `\set`, und
 * `:'variable'` ersetzt er nicht). Solange die Migration nicht über die CI
 * läuft — etwa weil ein Secret fehlt — ist der Editor der einzige Weg von
 * außen. Die Datei wird erzeugt und nicht gepflegt, damit sie nicht von den
 * echten Migrationen abdriftet.
 *
 * Das Passwort steht als Platzhalter darin und wird **nicht** eingecheckt:
 * Die Ausgabe geht nach `supabase/dashboard/`, das in .gitignore steht.
 *
 *   npm run db:dashboard
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const QUELLE = 'supabase/migrations';
const ZIEL = 'supabase/dashboard';
const PLATZHALTER = 'HIER-DAS-PASSWORT-EINSETZEN';

mkdirSync(ZIEL, { recursive: true });

const dateien = readdirSync(QUELLE)
  .filter((n) => n.endsWith('.sql'))
  .sort();

for (const name of dateien) {
  const roh = readFileSync(join(QUELLE, name), 'utf8');

  const zeilen = roh.split('\n');
  const heraus = [];
  let entfernt = 0;

  for (const zeile of zeilen) {
    // Metabefehle von psql beginnen am Zeilenanfang mit einem Backslash.
    if (/^\s*\\/.test(zeile)) {
      entfernt += 1;
      continue;
    }
    // `:'pw'` wird im Editor nicht ersetzt — hier steht der Platzhalter.
    heraus.push(zeile.replace(/:'pw'/g, `'${PLATZHALTER}'`));
  }

  const kopf = [
    '-- ==========================================================================',
    `-- ERZEUGT aus ${QUELLE}/${name} — nicht bearbeiten.`,
    '--',
    '-- Für den SQL-Editor im Supabase-Dashboard: die Metabefehle von psql sind',
    '-- entfernt.',
    entfernt && roh.includes(":'pw'")
      ? `-- Vor dem Ausführen ${PLATZHALTER} durch das Anmeldepasswort ersetzen.`
      : '--',
    '-- ==========================================================================',
    '',
  ].join('\n');

  const zielName = name.replace(/\.sql$/, '.dashboard.sql');
  writeFileSync(join(ZIEL, zielName), kopf + heraus.join('\n'));
  console.log(
    `${zielName}  (${entfernt} psql-Zeile(n) entfernt${
      roh.includes(":'pw'") ? ', Passwort als Platzhalter' : ''
    })`,
  );
}

console.log(`\nDie Dateien liegen in ${ZIEL}/ und sind nicht im Git.`);
console.log('Im Dashboard in dieser Reihenfolge ausführen:');
for (const n of dateien) console.log(`  ${n.replace(/\.sql$/, '.dashboard.sql')}`);
