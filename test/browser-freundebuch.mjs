/**
 * Prüft das Freundebuch mit Inhalt, im Format eines iPhone.
 *
 * Supabase ist aus dieser Umgebung nicht erreichbar. Statt das zu umgehen,
 * wird der Zustand des Moduls direkt gesetzt: Der Entwicklungsserver liefert
 * die Module einzeln aus, deshalb greift der Test auf dasselbe `buch`-Objekt
 * zu, aus dem die Komponente liest. Geprüft wird damit die **Darstellung** —
 * dass die Daten wirklich so aus der Datenbank kommen, prüft das nicht und
 * behauptet es auch nicht.
 *
 *   npx astro dev --port 4322 &   und dann   node test/browser-freundebuch.mjs
 */

import { chromium, devices } from 'playwright';

const BASIS = process.env.DEV ?? 'http://localhost:4322/Japan';

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
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const seite = await ctx.newPage();

const meldungen = [];
seite.on('pageerror', (e) => meldungen.push(`pageerror: ${e.message}`));
seite.on('console', (m) => {
  if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/i.test(m.text())) {
    meldungen.push(m.text());
  }
});

await seite.goto(`${BASIS}/freundebuch/`, { waitUntil: 'load' });
await seite.waitForTimeout(900);

console.log('Ohne Verbindung:');
pruefe(
  (await seite.locator('.kasten.warnung').innerText()).includes('Verbindung'),
  'sagt offen, dass die Verbindung fehlt',
);
pruefe(
  (await seite.locator('.zziffern').innerText()).replace(/\s/g, '').length === 6,
  'Besucherzähler steht mit sechs Stellen',
);

// ------------------------------------------------------------ Mit Inhalt ---

console.log('\nMit Inhalt:');
// Erst anmelden. Die Komponente versucht daraufhin zu laden, findet keine
// Zugangsdaten und setzt den Zustand zurück — deshalb kommen die Daten erst
// danach, sonst überschreibt der Ladeversuch sie wieder.
await seite.evaluate(async () => {
  const auth = await import('/src/lib/auth.svelte.ts');
  auth.auth.userId = 'aaaa';
  auth.auth.name = 'Paule';
  auth.auth.status = 'angemeldet';
});
await seite.waitForTimeout(400);

await seite.evaluate(async () => {
  const fb = await import('/src/lib/freundebuch.svelte.ts');

  fb.buch.personen = [
    { id: 'aaaa', name: 'Paule', farbe: '#C6402B' },
    { id: 'bbbb', name: 'Deggel', farbe: '#3E6B5E' },
    { id: 'cccc', name: 'Baldes', farbe: '#A67C33' },
  ];
  fb.buch.steckbriefe = {
    bbbb: { essen: 'Okonomiyaki', ort: 'Kanazawa, der Garten' },
  };
  fb.buch.beitraege = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      text: 'Erster Abend in Osaka, viel zu viel gegessen.',
      datum: '2026-09-26',
      ortNr: 8,
      sticker: 'ramen',
      bildPfad: null,
      bildUrl: null,
      autorId: 'aaaa',
      erstellt: '2026-09-26T20:00:00Z',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      text: 'Regen in Hakone.',
      datum: '2026-10-08',
      ortNr: null,
      sticker: 'sakura',
      bildPfad: null,
      bildUrl: null,
      autorId: 'bbbb',
      erstellt: '2026-10-08T09:00:00Z',
    },
  ];
  fb.buch.status = 'bereit';
});
await seite.waitForTimeout(600);

pruefe((await seite.locator('.brief').count()) === 3, 'Drei Steckbriefe');
pruefe(
  (await seite.locator('.brief.meiner').count()) === 1,
  'Genau einer ist der eigene und damit beschreibbar',
);
pruefe(
  (await seite.locator('.brief.meiner input').count()) === 5,
  'Der eigene hat fünf Felder zum Ausfüllen',
);
pruefe(
  (await seite.locator('.brief:not(.meiner) input').count()) === 0,
  'Fremde Steckbriefe haben kein einziges Eingabefeld',
);
pruefe(
  (await seite.locator('.brief', { hasText: 'Deggel' }).innerText()).includes('Okonomiyaki'),
  'Der ausgefüllte fremde Steckbrief ist lesbar',
);

const schriftgroessen = await seite
  .locator('.brief.meiner input')
  .evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
pruefe(
  schriftgroessen.every((g) => g >= 16),
  'Auch hier haben alle Eingabefelder mindestens 16 px',
  `kleinste ${Math.min(...schriftgroessen)} px`,
);

pruefe((await seite.locator('.polaroid').count()) === 2, 'Zwei Beiträge im Bilderstrom');
pruefe(
  (await seite.locator('.polaroid .klebe svg').count()) === 2,
  'Jeder Beitrag trägt seinen Aufkleber',
);
pruefe(
  (await seite.locator('.polaroid', { hasText: 'Osaka' }).locator('.weg').count()) === 1,
  'Der eigene Beitrag hat einen Löschknopf',
);
pruefe(
  (await seite.locator('.polaroid', { hasText: 'Regen' }).locator('.weg').count()) === 0,
  'Der fremde Beitrag hat keinen',
);
pruefe(
  (await seite.locator('.polaroid', { hasText: 'Osaka' }).innerText()).includes('8 '),
  'Die Ortsnummer steht am Beitrag',
);

// ------------------------------------------------------- Formular öffnen ---

console.log('\nNeuer Beitrag:');
await seite.locator('.knopf.gross').tap();
await seite.waitForTimeout(300);
pruefe(await seite.locator('form.neu').isVisible(), 'Das Formular öffnet sich');

const stickerKnoepfe = await seite.locator('.stickerknopf').count();
pruefe(stickerKnoepfe === 10, 'Zehn Aufkleber zur Auswahl', String(stickerKnoepfe));

const masse = await seite
  .locator('.stickerknopf')
  .evaluateAll((els) => els.map((e) => Math.round(Math.min(e.getBoundingClientRect().height, e.getBoundingClientRect().width))));
pruefe(
  masse.every((m) => m >= 44),
  'Die Aufkleber sind mindestens 44 px groß',
  `kleinster ${Math.min(...masse)} px`,
);

await seite.locator('.stickerknopf').nth(4).tap();
await seite.waitForTimeout(200);
pruefe(
  (await seite.locator('.stickerknopf.on').count()) === 1,
  'Genau ein Aufkleber ist gewählt',
);

// ---------------------------------------------------------------- Layout ---

console.log('\nLayout und Sauberkeit:');
const m = await seite.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  win: window.innerWidth,
}));
pruefe(m.doc <= m.win + 1, 'Kein Querscrollen mit Inhalt', `${m.doc} px bei ${m.win} px`);

// Fünf Punkte, seit Orte und Karte auf einem Bildschirm liegen.
pruefe(
  (await seite.locator('.tabbar a').count()) === 5,
  'Die Navigationsleiste hat fünf Punkte',
  String(await seite.locator('.tabbar a').count()),
);
pruefe(
  (await seite.locator('.tabbar a[aria-current="page"]').innerText()).includes('Freunde'),
  'und das Freundebuch ist der aktive',
);

pruefe(meldungen.length === 0, 'Keine Fehler in der Konsole', meldungen.join(' | '));

await seite.screenshot({
  path: process.env.BILD ?? '/tmp/freundebuch-voll.png',
  fullPage: true,
});

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
