/**
 * Prüft den Leseblock auf der Startseite — und vor allem, dass jeder der elf
 * Kapitellinks im Reiseband wirklich ankommt.
 *
 * Das ist der eigentliche Grund für diesen Test: Die Anker setzt das
 * Konvertierungsskript, die Titel liest es aus der Lesefassung. Läuft beides
 * auseinander, zeigt ein Kapitellink ins Leere — und das fällt im Build nicht
 * auf, weil ein Anker, den es nicht gibt, keinen Fehler erzeugt. Der Browser
 * bleibt dann einfach oben stehen.
 *
 *   node test/browser-reiseband.mjs
 */

import { chromium, devices } from 'playwright';
import { readFileSync } from 'node:fs';

const BASIS = process.env.BASIS ?? 'http://localhost:4322/Japan';
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

const kapitel = JSON.parse(readFileSync('src/data/chapters.json', 'utf8'));

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

// ============================================= 1) Der Block auf der Startseite ===

console.log('\nLeseblock auf der Startseite:');
await seite.goto(`${BASIS}/`, { waitUntil: 'networkidle' });
await seite.waitForTimeout(400);

const block = seite.locator('.leseband');
pruefe(await block.count() === 1, 'der Abschnitt ist da');
pruefe(
  (await seite.locator('.leseband .kap').count()) === kapitel.length,
  `alle ${kapitel.length} Kapitel stehen darin`,
  String(await seite.locator('.leseband .kap').count()),
);
pruefe(
  (await seite.locator('.leseband .kap.station').count()) === 6,
  'die sechs Stationskapitel sind hervorgehoben',
);

// Titel und Rubrik aus chapters.json müssen auch angezeigt werden.
const angezeigt = await seite.locator('.leseband .kaptitel').allTextContents();
const fehlend = kapitel.filter((k) => !angezeigt.some((a) => a.trim() === k.titel));
pruefe(fehlend.length === 0, 'jeder Titel aus chapters.json steht auf der Seite', JSON.stringify(fehlend.map((k) => k.id)));

// Die harten Zahlen an den Stationskapiteln.
const fakten = await seite.locator('.leseband .kapfakten').allTextContents();
pruefe(fakten.length === 6, 'nur die Stationskapitel tragen Nächte und Datum', String(fakten.length));
pruefe(
  fakten.every((f) => /\d+ (Nacht|Nächte) ·/.test(f) && /\d+ Orte$/.test(f.trim())),
  'und zwar vollständig',
  fakten[0],
);

// Der Abschnitt steht unten, nicht oben — so gewünscht.
const positionen = await seite.evaluate(() => {
  const y = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1;
  return { band: y('.leseband'), stationen: y('.stations'), zahlen: y('.cats') };
});
pruefe(
  positionen.band > positionen.stationen && positionen.band > positionen.zahlen,
  'er steht unter den Stationen und den Orte-Zahlen',
  JSON.stringify(positionen),
);

// Tippziele.
const zuKlein = await seite.evaluate(() =>
  [...document.querySelectorAll('.leseband .kap a')]
    .map((e) => Math.round(e.getBoundingClientRect().height))
    .filter((h) => h < 44),
);
pruefe(zuKlein.length === 0, 'jedes Kapitel ist mindestens 44 px hoch', JSON.stringify(zuKlein));

const quer = await seite.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
pruefe(!quer, 'kein Querscrollen');

// ============================================ 2) Jeder Link kommt wirklich an ===

console.log('\nJeder Kapitellink führt ins richtige Kapitel:');

const ziele = await seite.locator('.leseband .kap a').evaluateAll((as) =>
  as.map((a) => a.getAttribute('href')),
);

for (const k of kapitel) {
  const href = ziele.find((z) => z?.endsWith(`#${k.id}`));
  if (!href) {
    pruefe(false, `Link auf #${k.id} vorhanden`);
    continue;
  }
  await seite.goto(new URL(href, `${BASIS}/`).href, { waitUntil: 'load' });
  await seite.waitForTimeout(150);

  // Der Anker muss existieren **und** die Überschrift darunter muss die sein,
  // die chapters.json behauptet. Nur so ist bewiesen, dass beides zusammenpasst.
  const gefunden = await seite.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    return {
      h2: el.querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      gescrollt: Math.abs(el.getBoundingClientRect().top) < 200,
    };
  }, k.id);

  if (!gefunden) {
    pruefe(false, `#${k.id} — Anker existiert im Reiseband`);
    continue;
  }
  pruefe(
    gefunden.h2 === k.titel,
    `#${k.id} landet bei „${k.titel.slice(0, 40)}"`,
    `dort steht: ${gefunden.h2.slice(0, 50)}`,
  );
}

// „Von vorn lesen" muss das Band selbst öffnen, nicht ein Kapitel.
await seite.goto(`${BASIS}/`, { waitUntil: 'networkidle' });
const vorn = await seite.locator('.bandlead a').getAttribute('href');
pruefe(
  Boolean(vorn?.includes('reiseband.html')) && !vorn?.includes('#'),
  '„Von vorn lesen" öffnet den Band ohne Ankersprung',
  String(vorn),
);

// ---------------------------------------------------------------- Aufräumen ---

console.log('\nFehlermeldungen der Seite:');
const echte = meldungen.filter(
  (m) => !/tile\.openstreetmap|fonts\.g|ERR_|Failed to load resource|supabase/i.test(m),
);
pruefe(echte.length === 0, 'keine Fehler in der Konsole', echte.join(' | '));

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
