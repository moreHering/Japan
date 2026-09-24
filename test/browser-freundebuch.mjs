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

import { BASIS, buchSchreiben, START } from './browserlauf.mjs';

let fehler = 0;
const pruefe = (bedingung, text, zusatz = '') => {
  if (bedingung) console.log(`  ok    ${text}${zusatz ? ` — ${zusatz}` : ''}`);
  else {
    fehler += 1;
    console.log(`  FEHL  ${text}${zusatz ? ` — ${zusatz}` : ''}`);
  }
};

const browser = await chromium.launch({
  ...START,
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

/** Ein 1×1-Pixel als Daten-URL — lädt ohne Netz und löst kein `onerror` aus. */
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const PERSONEN = [
    { id: 'aaaa', name: 'Paule', farbe: '#C6402B' },
    { id: 'bbbb', name: 'Deggel', farbe: '#3E6B5E' },
    { id: 'cccc', name: 'Baldes', farbe: '#A67C33' },
  ];
  const STECKBRIEFE = {
    bbbb: { essen: 'Okonomiyaki', ort: 'Kanazawa, der Garten' },
  };
  const BEITRAEGE = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      text: 'Erster Abend in Osaka, viel zu viel gegessen.',
      datum: '2026-09-26',
      ortNr: 8,
      sticker: 'ramen',
      bildPfad: null,
      bildUrl: null,
      bildPfade: [],
      bildUrls: [],
      vorlage: null,
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
      bildPfade: [],
      bildUrls: [],
      vorlage: null,
      autorId: 'bbbb',
      erstellt: '2026-10-08T09:00:00Z',
    },
    /*
     * Drei Beiträge mit Bildern, je eine Vorlage.
     *
     * Die Bilder sind **Daten-URLs** und keine Adressen: In dieser Umgebung ist
     * jeder fremde Host gesperrt, ein `<img>` mit echter URL würde `onerror`
     * auslösen — und `onerror` ist im Tagebuch genau der Weg, auf dem ein Beitrag
     * als „Bild lässt sich nicht laden" markiert wird. Die Prüfung hätte dann den
     * Fehlerfall gemessen und ihn für den Normalfall gehalten.
     */
    {
      id: '33333333-3333-3333-3333-333333333333',
      text: 'Vier Ecken von Dotonbori.',
      datum: '2026-09-27',
      ortNr: null,
      sticker: null,
      bildPfad: 'x/1.png',
      bildUrl: PIXEL,
      bildPfade: ['x/1.png', 'x/2.png', 'x/3.png'],
      bildUrls: [PIXEL, PIXEL, PIXEL],
      vorlage: 'collage',
      autorId: 'aaaa',
      erstellt: '2026-09-27T20:00:00Z',
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      text: 'Die Bucht von Hakone.',
      datum: '2026-10-09',
      ortNr: null,
      sticker: null,
      bildPfad: 'x/4.png',
      bildUrl: PIXEL,
      bildPfade: ['x/4.png'],
      bildUrls: [PIXEL],
      vorlage: 'panorama',
      autorId: 'aaaa',
      erstellt: '2026-10-09T09:00:00Z',
    },
    {
      id: '66666666-6666-6666-6666-666666666666',
      text: 'Drei Gassen in Kyoto.',
      datum: '2026-10-02',
      ortNr: null,
      sticker: null,
      bildPfad: 'x/6.png',
      bildUrl: PIXEL,
      bildPfade: ['x/6.png', 'x/7.png'],
      bildUrls: [PIXEL, PIXEL],
      vorlage: 'streifen',
      autorId: 'aaaa',
      erstellt: '2026-10-02T09:00:00Z',
    },
    {
      id: '77777777-7777-7777-7777-777777777777',
      text: 'Der Turm, aufrecht.',
      datum: '2026-10-11',
      ortNr: null,
      sticker: null,
      bildPfad: 'x/8.png',
      bildUrl: PIXEL,
      bildPfade: ['x/8.png'],
      bildUrls: [PIXEL],
      vorlage: 'hochkant',
      autorId: 'aaaa',
      erstellt: '2026-10-11T09:00:00Z',
    },
    {
      id: '55555555-5555-5555-5555-555555555555',
      text: 'Ein Torii, hochkant.',
      datum: '2026-10-10',
      ortNr: null,
      sticker: null,
      bildPfad: 'x/5.png',
      bildUrl: PIXEL,
      bildPfade: ['x/5.png'],
      bildUrls: [PIXEL],
      // Kein `vorlage` — das ist der Zustand jedes Beitrags vor Migration 0009,
      // und er muss wie ein Polaroid aussehen.
      vorlage: null,
      autorId: 'aaaa',
      erstellt: '2026-10-10T09:00:00Z',
    },
  ];

/*
 * Über `buchSchreiben()` und **nicht** über
 * `import('/src/lib/freundebuch.svelte.ts')`. Gemessen: Der Import-Weg lief, dann
 * habe ich eine Zeile in `vorlagen.ts` geändert — und er lief nicht mehr, weil
 * Vite neu optimiert hatte und die Insel ihre Module seither unter `?v=<hash>`
 * lädt. Zwei Instanzen, zwei Zustände. Die ausführliche Begründung steht an
 * `buchSchreiben()` in `browserlauf.mjs`.
 *
 * Die `5` ist die Quittung: So viele Beiträge müssen danach stehen. Kommt der
 * Zustand nicht an, bricht der Helfer mit einem Satz ab, der auf die Ursache
 * zeigt — statt zehn Folgefehler zu erzeugen, die nach einem Fehler in der App
 * aussehen.
 */
await buchSchreiben(
  seite,
  { personen: PERSONEN, steckbriefe: STECKBRIEFE, beitraege: BEITRAEGE, status: 'bereit' },
  7,
);
await seite.waitForTimeout(600);



pruefe((await seite.locator('.brief').count()) === 3, 'Drei Steckbriefe');

/*
 * Reihenfolge der Seite (Wunsch vom 24.09.): Willkommen → Maske → Bilderstrom
 * → Steckbriefe. Geprüft über die Lage im Dokument, nicht über Pixel.
 *
 * Gegenprobe: die Steckbrief-Sektion in `Freundebuch.svelte` wieder vor die
 * Maske setzen → diese Prüfung fällt.
 */
const reihenfolge = await seite.evaluate(() => {
  const lage = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.getBoundingClientRect().top + window.scrollY : -1;
  };
  return { kopf: lage('.kopf'), maske: lage('form.neu'), strom: lage('.strom'), briefe: lage('.briefe') };
});
pruefe(
  reihenfolge.kopf >= 0 &&
    reihenfolge.kopf < reihenfolge.maske &&
    reihenfolge.maske < reihenfolge.strom &&
    reihenfolge.strom < reihenfolge.briefe,
  'Reihenfolge: Willkommen, Maske, Bilderstrom, Steckbriefe',
  JSON.stringify(reihenfolge),
);

// Profilbild: der Knopf nur auf dem eigenen Steckbrief, ohne `capture`.
pruefe((await seite.locator('.brief .profilwahl').count()) === 1, 'Nur der eigene Steckbrief hat „Profilbild wählen"');
pruefe(
  (await seite.locator('.brief.meiner .profilwahl input[type=file]').getAttribute('capture')) === null,
  'Die Profilbild-Wahl lässt die Galerie zu (kein capture)',
);
const wahlHoehe = await seite.locator('.brief.meiner .profilwahl').evaluate((e) => e.getBoundingClientRect().height);
pruefe(wahlHoehe >= 44, 'Der Knopf ist mindestens 44 px hoch', `${Math.round(wahlHoehe)} px`);
pruefe((await seite.locator('.brief .profilbild').count()) === 0, 'Ohne Profilbild steht das Kaomoji');
await buchSchreiben(seite, { profilbilder: { [PERSONEN[1].id]: PIXEL } }, 7);
await seite.waitForTimeout(300);
pruefe((await seite.locator('.brief .profilbild').count()) === 1, 'Mit Profilbild steht ein Bild statt des Kaomoji');
pruefe(
  (await seite.locator('.brief.meiner').count()) === 1,
  'Genau einer ist der eigene und damit beschreibbar',
);
pruefe(
  (await seite.locator('.brief.meiner input[type="text"]').count()) === 5,
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

pruefe((await seite.locator('.polaroid').count()) === 7, 'Sieben Beiträge im Bilderstrom');
pruefe(
  (await seite.locator('.polaroid .klebe svg').count()) === 2,
  'Jeder Beitrag mit Aufkleber trägt ihn',
);

// ============================================= Die fünf Layout-Vorlagen ===

/*
 * Gemessen wird die **Wirkung**, nicht die Klasse.
 *
 * Eine Zusicherung auf `class="collage"` wäre grün, sobald das Wort im Markup
 * steht — auch wenn die Regel in `y2k.css` fehlt oder anders heißt. Deshalb
 * `aspect-ratio` und `grid-template-columns` aus `getComputedStyle`: Das ist,
 * was auf dem Schirm passiert.
 */
console.log('\nDie Layout-Vorlagen:');
{
  const form = (text) =>
    seite.evaluate((t) => {
      const art = [...document.querySelectorAll('.strom .polaroid')].find((n) =>
        (n.textContent ?? '').includes(t),
      );
      if (!art) return null;
      const bilder = art.querySelector('.bilder');
      const bild = art.querySelector('.bilder img');
      const s = bild ? getComputedStyle(bild) : null;
      return {
        klassen: art.className,
        anzahl: art.querySelectorAll('.bilder img').length,
        verhaeltnis: s ? s.aspectRatio : null,
        spalten: bilder ? getComputedStyle(bilder).gridTemplateColumns : null,
        spaltenImStrom: getComputedStyle(art).gridColumn,
      };
    }, text);

  const collage = await form('Vier Ecken');
  pruefe(collage !== null, 'der Collagen-Beitrag steht auf der Seite');
  if (collage) {
    pruefe(collage.anzahl === 3, 'er zeigt seine drei Bilder', `${collage.anzahl}`);
    pruefe(
      collage.verhaeltnis === '1 / 1',
      'im Quadrat, nicht im 4:3 des Polaroids',
      String(collage.verhaeltnis),
    );
    // Zwei Spalten — das ist das 2×2-Raster. Eine einzige hieße, die Regel
    // greift nicht und die Bilder stünden untereinander.
    pruefe(
      collage.spalten !== null && collage.spalten.split(' ').length === 2,
      'in zwei Spalten',
      String(collage.spalten),
    );
  }

  const panorama = await form('Bucht von Hakone');
  pruefe(panorama !== null, 'der Panorama-Beitrag steht auf der Seite');
  if (panorama) {
    pruefe(
      panorama.verhaeltnis === '16 / 9',
      'das Panorama ist 16:9 breit',
      String(panorama.verhaeltnis),
    );
    // `1 / -1` liest der Browser als „von der ersten bis zur letzten Linie" und
    // gibt es als `1 / -1` oder als `span N` zurück — geprüft wird deshalb, dass
    // es **nicht** der Vorgabewert `auto` ist.
    pruefe(
      panorama.spaltenImStrom !== 'auto',
      'und nimmt die ganze Breite des Stroms',
      String(panorama.spaltenImStrom),
    );
  }

  const streifen = await form('Drei Gassen');
  pruefe(streifen !== null, 'der Filmstreifen steht auf der Seite');
  if (streifen) {
    pruefe(streifen.anzahl === 2, 'er zeigt seine zwei Bilder', `${streifen.anzahl}`);
    // Nebeneinander heißt: zwei Spalten. Untereinander wäre eine — und genau das
    // passiert, wenn `grid-auto-flow: column` nicht greift.
    pruefe(
      streifen.spalten !== null && streifen.spalten.split(' ').length === 2,
      'nebeneinander und nicht untereinander',
      String(streifen.spalten),
    );
  }

  const hochkant = await form('Turm, aufrecht');
  pruefe(hochkant !== null, 'das Hochformat steht auf der Seite');
  if (hochkant) {
    pruefe(
      hochkant.verhaeltnis === '3 / 4',
      'es ist 3:4 hoch — genau das, was im Polaroid beschnitten würde',
      String(hochkant.verhaeltnis),
    );
  }

  /*
   * **Der wichtigste Fall dieses Blocks.** `vorlage: null` ist der Zustand jedes
   * Beitrags, der vor Migration 0009 entstanden ist — und das sind alle
   * vorhandenen. Sie müssen aussehen wie vorher: 4:3, eine Spalte.
   */
  const alt = await form('Torii, hochkant');
  pruefe(alt !== null, 'der Beitrag ohne Vorlage steht auf der Seite');
  if (alt) {
    pruefe(
      alt.verhaeltnis === '4 / 3',
      'ohne Vorlage bleibt es das Polaroid — 4:3 wie vor der Migration',
      String(alt.verhaeltnis),
    );
    pruefe(
      alt.klassen.includes('polaroid'),
      'und die Klasse polaroid steht daran',
      alt.klassen,
    );
    pruefe(
      alt.spaltenImStrom === 'auto',
      'es nimmt keine Sonderbreite im Strom',
      String(alt.spaltenImStrom),
    );
  }
}
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
// Seit dem 24.09. ohne Knopf davor: Die Maske steht offen da.
pruefe(await seite.locator('form.neu').isVisible(), 'Die Maske steht ohne Tipp offen da');
pruefe((await seite.locator('.knopf.gross').count()) === 0, 'Kein „✚ hinzufügen"-Knopf mehr davor');

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

// -------------------------------------------------------- Die Vorlagenwahl ---

/*
 * Dasselbe Muster wie die Aufkleberwahl darüber, und aus demselben Grund
 * geprüft: Ein Knopf unter 44 px wird auf einem Telefon nicht zuverlässig
 * getroffen, und zwei aktive Knöpfe heißen, dass der Zustand nicht exklusiv ist.
 */
{
  const knoepfe = seite.locator('.vorlageknopf');
  const anzahl = await knoepfe.count();
  pruefe(anzahl === 5, 'fünf Vorlagen stehen zur Wahl', String(anzahl));

  const hoehen = await knoepfe.evaluateAll((ns) =>
    ns.map((n) => Math.round(n.getBoundingClientRect().height)),
  );
  pruefe(
    hoehen.length > 0 && hoehen.every((h) => h >= 44),
    'jede ist mindestens 44 px hoch',
    `kleinste ${Math.min(...hoehen)} px`,
  );

  const namen = await knoepfe.allInnerTexts();
  pruefe(
    /Polaroid/.test(namen.join(' ')) && /Collage/.test(namen.join(' ')),
    'sie tragen ihre Namen',
    namen.join(' · ').replace(/\s+/g, ' ').slice(0, 80),
  );

  // Polaroid ist die Vorgabe — der Zustand, in dem alle bestehenden Beiträge
  // stehen. Eine andere Vorauswahl würde unbemerkt das Aussehen ändern.
  // `.vorlageknopf.on` und nicht `knoepfe.locator('.on')`: Das Zweite sucht ein
  // `.on` **innerhalb** eines Knopfes, und dort ist keines.
  const vorher = await seite.locator('.vorlageknopf.on').count();
  pruefe(vorher === 1, 'genau eine ist vorgewählt', String(vorher));
  pruefe(
    /Polaroid/.test(await seite.locator('.vorlageknopf.on').innerText()),
    'und zwar Polaroid',
    (await seite.locator('.vorlageknopf.on').innerText()).replace(/\s+/g, ' '),
  );

  await knoepfe.nth(4).tap();
  await seite.waitForTimeout(250);
  pruefe(
    (await seite.locator('.vorlageknopf.on').count()) === 1,
    'ein Tipp wechselt und lässt genau eine aktiv',
  );
  pruefe(
    /Collage/.test(await seite.locator('.vorlageknopf.on').innerText()),
    'nämlich die angetippte',
    (await seite.locator('.vorlageknopf.on').innerText()).replace(/\s+/g, ' '),
  );
  // Ohne Bild und mit Collage gewählt: Der Hinweis muss da sein und sagen, dass
  // es trotzdem geht — keine Sperre.
  const hinweis = await seite.locator('.vorlagehinweis').count();
  pruefe(hinweis >= 1, 'bei unpassender Bildzahl steht ein Hinweis, keine Sperre', `${hinweis}`);

  // Zurück auf Polaroid, damit die folgenden Blöcke den Ausgangszustand sehen.
  await knoepfe.nth(0).tap();
  await seite.waitForTimeout(200);
}

// ---------------------------------------------------------------- Layout ---

console.log('\nLayout und Sauberkeit:');
const m = await seite.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  win: window.innerWidth,
}));
pruefe(m.doc <= m.win + 1, 'Kein Querscrollen mit Inhalt', `${m.doc} px bei ${m.win} px`);

// Fünf Punkte, seit Orte und Karte auf einem Bildschirm liegen.
pruefe(
  (await seite.locator('.tabbar a').count()) === 3,
  'Die Navigationsleiste hat drei Punkte: Reiseband, Plan, Freunde',
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
