/**
 * Die Selbstprüfseite `/wache/` im echten Browser.
 *
 * Der Kern dieser Datei sind drei Prüfungen, und sie prüfen genau das, was der
 * Wächter im CI **nicht** kann: dass ein selbst angelegter Ort mit falscher
 * Koordinate auf dem Gerät gemeldet wird. Solche Orte liegen im localStorage, und
 * `test/orte-plausibel.test.ts` sieht nur die Dateien.
 *
 * Die Regeln selbst sind in `test/wache.test.ts` geprüft — `src/lib/wache.ts` ist
 * reine Logik, zehn Gegenproben. Hier geht es um das, was nur ein Browser zeigt:
 * dass der Befund ankommt, dass die Karte ihren Zustand wirklich meldet, dass die
 * Seite bei 390 px zu lesen ist, und dass man von der Organisationsseite hinkommt.
 *
 *   npx astro dev --port 4322 &   und dann   node test/browser-wache.mjs
 */

import { chromium, devices } from 'playwright';

import {
  BASIS,
  KACHELHOSTS,
  MELDENDER_STIL,
  planSchreiben,
  START,
  vektorStilUnterschieben,
} from './browserlauf.mjs';

let fehler = 0;
const pruefe = (bedingung, text, zusatz = '') => {
  if (bedingung) console.log(`  ok    ${text}${zusatz ? ` — ${zusatz}` : ''}`);
  else {
    fehler += 1;
    console.log(`  FEHL  ${text}${zusatz ? ` — ${zusatz}` : ''}`);
  }
};

const browser = await chromium.launch({ ...START });
const ctx = await browser.newContext({ ...devices['iPhone 13'] });

/*
 * Die Kachelhosts werden abgefangen, damit der Kartenabschnitt hier und auf einem
 * GitHub-Runner **dasselbe** meldet. Ohne das wäre die Prüfung auf „Kein
 * Kartenhintergrund" eine Aussage über den Egress-Proxy dieser Umgebung und würde
 * auf einem Runner mit freiem Netz umkippen — genau der Fehler, den
 * `browser-karte.mjs` schon einmal gehabt hätte.
 */
await ctx.route(KACHELHOSTS, (r) => r.abort());

const seite = await ctx.newPage();
const meldungen = [];
seite.on('pageerror', (e) => meldungen.push(`pageerror: ${e.message}`));
seite.on('console', (m) => {
  if (
    m.type() === 'error' &&
    !/ERR_|Failed to load resource|openstreetmap|openfreemap|fonts\.g/i.test(m.text())
  ) {
    meldungen.push(m.text());
  }
});

const laden = async () => {
  await seite.goto(`${BASIS}/wache/`, { waitUntil: 'load' });
  // Die Karte braucht einen Moment, bis sie ihren Zustand gemeldet hat.
  await seite.waitForSelector('.wache .block', { timeout: 15000 });
  await seite.waitForTimeout(2600);
};

// ================================================= 1) Der saubere Zustand ===

console.log('Mit leerem Plan:');
await laden();

const bloecke = await seite.locator('.wache .block h2').allInnerTexts();
pruefe(bloecke.length === 5, 'fünf Abschnitte', bloecke.join(' · '));
pruefe(
  /ORTE/i.test(bloecke[0]) && /KARTE/i.test(bloecke[1]) && /ABGLEICH/i.test(bloecke[2]),
  'in der Reihenfolge, in der sie unterwegs zählen',
);

const ortFazit = await seite.locator('.block').first().locator('.fazit').innerText();
pruefe(
  /keine Beanstandung/i.test(ortFazit),
  'bei sauberem Bestand steht „keine Beanstandung"',
  ortFazit,
);
pruefe(
  (await seite.locator('.befunde li').count()) === 0,
  'und keine Befundzeile',
);

/*
 * Die Zahl muss stimmen, und das ist keine Kosmetik: Der erste Entwurf zeigte
 * „164 geprüft", geprüft waren aber 141 — `alleOrteMitKorrekturen()` lässt die 23
 * erledigten Unterkunftsvorschläge weg. Eine Prüfseite, die mehr behauptet als sie
 * angesehen hat, ist schlimmer als keine: Man hält 23 Orte für kontrolliert.
 */
const zahl = await seite.locator('.zahlen dd').first().innerText();
// 141 bis zum 23.09., seitdem +17 Orte der Mietwagen-Strecke: 158.
pruefe(Number(zahl) === 158, 'sie nennt die Zahl der wirklich geprüften Orte', zahl);
pruefe(
  /23 erledigten Unterkunftsvorschläge/.test(await seite.locator('.grenzen').innerText()),
  'und sagt, welche sie nicht ansieht',
);

// ======================================== 2) Ein kaputter eigener Ort ======

console.log('\nMit einem eigenen Ort, dessen Koordinaten vertauscht sind:');
/*
 * Über den localStorage und **nicht** über `import('/src/lib/store.svelte.ts')`:
 * Vite bedient dasselbe Modul unter mehreren URLs, und ein Import ohne das
 * `?v=<hash>` der Insel ist eine zweite Instanz mit eigenem `$state`. Die
 * ausführliche Begründung steht an `planSchreiben()` in `browserlauf.mjs`. Diese
 * drei Blöcke sind am 22.09.2026 genau daran gefallen — auf einem frischen
 * Dev-Server liefen sie, nach Stunden Laufzeit nicht mehr.
 */
await planSchreiben(seite, {
  customPlaces: [
    {
      nr: 167,
      name: 'Unsere Wohnung Kanazawa',
      category: 'hotel',
      station: 'kanazawa',
      stationLabel: 'Kanazawa · Zentrum',
      area: 'zentrum',
      /*
       * Vertauscht — aber **darstellbar**.
       *
       * Hier stand `lat: 136.6562`. Die Absicht war richtig (eine Breite von 136
       * gibt es nicht), der Wert aber unbrauchbar als Prüfvorlage: `normalize()`
       * in `store.svelte.ts:157` verwirft jeden Ort mit `lat > 90` beim **Laden**
       * aus dem localStorage. Ein solcher Ort überlebt kein Neuladen, und ein
       * Befund über ihn ist nach dem Neuladen nicht mehr herstellbar.
       *
       * Deshalb die andere Vertauschung: Breite 36,56 ist Japan, Länge 36,66 ist
       * die Türkei. `inJapan()` schlägt genauso an, und der Ort kommt durch die
       * Normalisierung. Der Nebenbefund dazu — dass ein Ort mit unmöglicher Breite
       * beim Neuladen **stillschweigend verschwindet**, statt gemeldet zu werden —
       * steht in der Zusammenfassung; er gehört nicht in diesen Test.
       */
      lat: 36.5613,
      lng: 36.6562,
      placeId: null,
      descriptionHtml: 'Von Hand ergänzt.',
      isFriendTip: false,
      needsBooking: false,
      closedDay: null,
      cashOnly: false,
      eigen: true,
      vorlaeufig: false,
      angelegtVon: null,
    },
  ],
}, '.wache .block');

const befunde = await seite.locator('.befunde li').evaluateAll((ns) =>
  ns.map((n) => ({ klasse: n.className, text: n.innerText.replace(/\s+/g, ' ') })),
);
pruefe(befunde.length >= 1, 'der Befund erscheint', `${befunde.length} Zeile(n)`);
pruefe(
  befunde.some((b) => b.klasse.includes('fehler')),
  'als Fehler, nicht als Hinweis',
);
pruefe(
  befunde.some((b) => /167/.test(b.text)),
  'und nennt die Nummer — ohne die sucht man unterwegs',
  befunde[0]?.text.slice(0, 70),
);
pruefe(
  befunde.some((b) => /nicht in Japan/i.test(b.text)),
  'mit dem Grund',
);
pruefe(
  befunde.some((b) => /vertauscht/i.test(b.text)),
  'und mit dem, was zu tun ist',
);

/*
 * Erst zählen, dann lesen.
 *
 * Die erste Fassung griff direkt mit `.first().getAttribute()` zu. Fehlt der Link,
 * läuft Playwright in einen Timeout und die **ganze Suite stürzt ab** — man bekommt
 * einen Stapelauszug statt der einen Zeile, die sagt, was fehlt. Die Gegenprobe
 * („Ortsnummer im Befund weggelassen") ist genau daran vorbeigelaufen und galt als
 * stumm, obwohl die Reparatur fehlte.
 */
const linkZahl = await seite.locator('.befunde a').count();
pruefe(linkZahl > 0, 'jede Befundzeile bietet einen Weg zum Ort', `${linkZahl} Link(s)`);
if (linkZahl) {
  const link = await seite.locator('.befunde a').first().getAttribute('href');
  pruefe(/\/orte\/\?nr=167/.test(link ?? ''), 'die Zeile führt zum Ort', link ?? '(keiner)');
  const linkHoch = await seite
    .locator('.befunde a')
    .first()
    .evaluate((n) => Math.round(n.getBoundingClientRect().height));
  pruefe(linkHoch >= 44, 'und ist mit dem Daumen zu treffen', `${linkHoch} px`);
} else {
  pruefe(false, 'die Zeile führt zum Ort', 'es gibt gar keinen Link');
  pruefe(false, 'und ist mit dem Daumen zu treffen', 'es gibt gar keinen Link');
}

const fazitJetzt = await seite.locator('.block').first().locator('.fazit').innerText();
pruefe(/Fehler/.test(fazitJetzt), 'die Kopfzeile zählt mit', fazitJetzt);

// ================== 3) Ein eigener Ort, der nie abgeglichen wurde ==========

console.log('\nMit einem eigenen Ort ohne endgültige Nummer:');
await planSchreiben(seite, {
  customPlaces: [
    {
      nr: -1,
      name: 'Noch nicht abgeglichen',
      category: 'hotel',
      station: 'kanazawa',
      stationLabel: 'Kanazawa · Zentrum',
      area: 'zentrum',
      lat: 36.5613,
      lng: 136.6562,
      placeId: null,
      descriptionHtml: 'Von Hand ergänzt.',
      isFriendTip: false,
      needsBooking: false,
      closedDay: null,
      cashOnly: false,
      eigen: true,
      vorlaeufig: true,
      angelegtVon: null,
    },
  ],
}, '.wache .block');

/*
 * Der Befund, den sonst nichts bemerkt: Eine negative Nummer heißt, dieses Gerät
 * hat den Ort angelegt und **nie abgeglichen**. Die Unterkunft steht damit auf
 * keinem der beiden anderen Telefone — und das merkt man erst, wenn jemand anders
 * sie sucht.
 */
const nieAbgeglichen = (await seite.locator('.befunde li').allInnerTexts()).join(' | ');
pruefe(
  /keine endgültige Nummer/i.test(nieAbgeglichen),
  'die fehlende Nummer wird gemeldet',
  nieAbgeglichen.slice(0, 80),
);
pruefe(/abgleichen/i.test(nieAbgeglichen), 'mit dem Weg zur Behebung');

// Zurück auf den sauberen Stand.
await planSchreiben(seite, { customPlaces: [] }, '.wache .block');

// ======================================================= 4) Die Karte =====

console.log('\nDer Kartenabschnitt bei gesperrten Kachelhosts:');
const karte = await seite.locator('.block').nth(1).innerText();
pruefe(!/noch nichts gemeldet/i.test(karte), 'die Karte hat ihren Zustand gemeldet');
pruefe(/Kein Kartenhintergrund/i.test(karte), 'und nennt ihn beim Namen', karte.split('\n')[1]);
pruefe(
  /openfreemap|openstreetmap/i.test(karte),
  'samt dem Host, der nicht antwortet',
  karte.replace(/\s+/g, ' ').slice(0, 110),
);
pruefe(
  (await seite.locator('.probekarte .leaflet-container').count()) === 1,
  'die Probekarte ist eine echte Leaflet-Karte — gemeldet wird, was die App erlebt',
);

// ==================================================== 5) Der Speicher =====

console.log('\nSpeicher und Abgleich:');
const speicher = await seite.locator('.block').nth(3).innerText();
pruefe(/lässt sich speichern/i.test(speicher), 'der Schreibversuch gelingt', speicher.split('\n')[1]);

const abgleich = await seite.locator('.block').nth(2).innerText();
pruefe(abgleich.length > 20, 'der Abgleichabschnitt sagt etwas', abgleich.split('\n')[1]);

// ==================================================== 6) Erreichbarkeit ===

console.log('\nErreichbarkeit:');
pruefe(
  (await seite.locator('.tabbar a').count()) === 3,
  'die Tab-Leiste trägt drei Einträge — /wache/ drängt sich nicht hinein',
);
pruefe(
  (await seite.locator('.tabbar a[aria-current="page"]').innerText()).includes('Plan'),
  'auf /wache/ ist „Plan" aktiv — man erreicht sie aus der Orga',
);
await seite.goto(`${BASIS}/organisation/`, { waitUntil: 'load' });
// Kein `waitForSelector`: Fehlt der Verweis, wäre das ein Timeout und damit ein
// Absturz der Suite statt einer Meldung. Auf den Abgleich-Abschnitt warten, der
// immer da ist, und dann zählen.
await seite.waitForSelector('.login', { timeout: 15000 });
await seite.waitForTimeout(400);
const orgaZahl = await seite.locator('.wachelink a').count();
pruefe(orgaZahl === 1, 'die Organisationsseite trägt genau einen Verweis', `${orgaZahl}`);
const orgaLink = orgaZahl ? await seite.locator('.wachelink a').first().getAttribute('href') : null;
pruefe(/\/wache\//.test(orgaLink ?? ''), 'die Organisationsseite verlinkt sie', orgaLink ?? '—');

// ================================ 6b) Die Anbieterkette geht weiter =========

/*
 * Der Fall, der dieses Kapitel ausgelöst hat.
 *
 * Auf dem Telefon zeigte die Karte ein Relief und sonst nichts: kein Wasser,
 * keine Straße, kein Name. Der Grund steckt im Liberty-Stil selbst — er hat
 * **zwei** Quellen, ein Natural-Earth-Raster und die Vektorquelle. Das Raster
 * kam an und sah aus wie eine Karte; die Vektorquelle lieferte nichts, meldete
 * aber auch keinen Fehler. Seitdem hängt die Karte nicht mehr an einem Dienst,
 * sondern probiert mehrere durch.
 *
 * **Was hier geprüft wird und was nicht.** Prüfbar ist, dass die Kette
 * weitergeht, wenn ein Anbieter ausfällt, und dass sie am Ende beim Raster
 * landet und alle Durchgefallenen benennt. Erzwungen wird das über
 * fehlschlagende Stilabrufe — die gehen über `fetch` und brauchen kein maplibre.
 *
 * **Nicht** prüfbar ist der stille Fall vom Telefon: In dieser Umgebung fordert
 * maplibre überhaupt keine Kacheln an (der Worker arbeitet hier nicht), es gibt
 * also weder Daten noch Fehler. Dass die Kette *dort* weitergeht, sagt nur
 * `/wache/` auf dem Gerät.
 */
console.log('\nWenn die Vektoranbieter ausfallen:');
{
  const ctx2 = await browser.newContext({ ...devices['iPhone 13'] });
  // Beide Stilabrufe scheitern — einmal der eigene aus public/, einmal der fremde.
  await ctx2.route('**/karte-versatiles.json', (r) => r.fulfill({ status: 503, body: 'weg' }));
  await ctx2.route('**/styles/liberty', (r) => r.fulfill({ status: 503, body: 'weg' }));
  await ctx2.route(KACHELHOSTS, (r) => r.abort());
  const zweite = await ctx2.newPage();
  await zweite.goto(`${BASIS}/wache/`, { waitUntil: 'load' });
  await zweite.waitForSelector('.probekarte .leaflet-container', { timeout: 20000 });
  await zweite.waitForTimeout(3000);

  const text = await zweite.locator('.block').nth(1).innerText();
  const flach = text.replace(/\s+/g, ' ');
  // Erst zählen, dann prüfen — ein fehlender Block bestünde sonst still.
  pruefe(flach.length > 20, 'der Kartenabschnitt ist da', `${flach.length} Zeichen`);
  pruefe(
    !/lateinisch beschriftet/i.test(flach),
    'die Seite behauptet nicht mehr, die Beschriftung laufe',
    flach.slice(0, 100),
  );
  pruefe(
    /OpenStreetMap/.test(flach),
    'die Kette landet beim Rasteranbieter',
    flach.slice(0, 160),
  );
  pruefe(
    /VersaTiles/.test(flach) && /OpenFreeMap/.test(flach),
    'und benennt beide Vektoranbieter, die durchgefallen sind',
    flach.slice(0, 220),
  );
  pruefe(
    /503/.test(flach),
    'samt dem Grund im Wortlaut, nicht nur „ging nicht"',
    flach.slice(0, 220),
  );
  await ctx2.close();
}

/*
 * **Eine maplibre-Meldung ist kein Ausfall.**
 *
 * Das ist der Fehler, der diese Karte drei Tage japanisch gehalten hat. Die
 * Messung war richtig, aber davor stand ein Abbruch: `if (fehlerTexte.length)
 * return durchgefallen(...)` — der erste `error` von maplibre warf den Anbieter
 * weg. Solange der Worker fehlte, wurde nie eine Kachel, nie ein Glyph, nie ein
 * Sprite angefordert, also kam auch nie eine Meldung; der Abbruch lief ins Leere
 * und fiel niemandem auf. Seit der Worker läuft, kommen Meldungen — und am
 * 21.09.2026 stand auf dem Telefon „OSM-Rasterkarte" unter der Karte, mit genau
 * den japanischen Städtenamen, gegen die das Ganze gebaut ist.
 *
 * Geprüft wird deshalb ein Stil, der **zeichnet und meldet**: ein fehlendes
 * Sprite. Zwei Zusicherungen, und beide sind nötig:
 *
 * 1. Die Vektorebene setzt sich durch — sichtbar, Rasterkarte abgeräumt.
 * 2. `/wache/` zeigt mindestens eine maplibre-Meldung.
 *
 * Ohne (2) wäre (1) wertlos: Ein Stil, der gar nichts meldet, würde ebenfalls
 * bestehen, und die Prüfung hätte nichts geprüft. Erst zusammen sagen sie „es
 * gab einen Fehler, und er hat den Anbieter nicht gekostet".
 *
 * Gegenprobe: Die Zeile oben wieder einsetzen — dann fällt (1).
 */
console.log('\nEin gemeldeter Fehler kostet den Anbieter nicht:');
{
  const ctx3 = await browser.newContext({ ...devices['iPhone 13'] });
  // Reihenfolge: Playwright nimmt die **zuletzt** angemeldete passende Route.
  // Die Kachelsperre zuerst, damit das Sprite darunter seinen eigenen 404 bekommt
  // und nicht bloß abgebrochen wird — ein Abbruch und ein 404 sind verschiedene
  // Meldungen, und geprüft werden soll die, die ein Server schickt.
  await ctx3.route(KACHELHOSTS, (r) => r.abort());
  await ctx3.route('**/sprites/**', (r) => r.fulfill({ status: 404, body: 'weg' }));
  await vektorStilUnterschieben(ctx3, MELDENDER_STIL);
  const dritte = await ctx3.newPage();
  await dritte.goto(`${BASIS}/wache/`, { waitUntil: 'load' });
  await dritte.waitForSelector('.probekarte .leaflet-container', { timeout: 20000 });
  // Auf das Ergebnis warten, nicht auf die Uhr — derselbe Grund wie im Block
  // „Der Kartenmotor hat seinen Worker" in `browser-orte.mjs`. Die Schranke liegt
  // unter der Probefrist von 20 s, wer hineinläuft hat wirklich nicht geliefert.
  await dritte
    .waitForFunction(
      () => {
        const n = document.querySelector('.probekarte .maplibregl-canvas');
        if (!n) return false;
        const huelle = n.closest('.leaflet-gl-layer') ?? n.parentElement;
        return getComputedStyle(huelle).opacity === '1';
      },
      { timeout: 12000 },
    )
    .catch(() => {});

  const leinwand = await dritte.locator('.probekarte .maplibregl-canvas').count();
  pruefe(
    leinwand === 1,
    'die Vektorebene setzt sich durch, obwohl maplibre gemeckert hat',
    `${leinwand} Leinwände`,
  );
  if (leinwand === 1) {
    const deckkraft = await dritte
      .locator('.probekarte .maplibregl-canvas')
      .evaluate((n) => getComputedStyle(n.closest('.leaflet-gl-layer') ?? n.parentElement).opacity);
    pruefe(deckkraft === '1', 'und sie ist sichtbar, nicht die durchsichtige Probe', `Deckkraft ${deckkraft}`);
    const rest = await dritte.locator('.probekarte .leaflet-tile').count();
    pruefe(rest === 0, 'die Rasterkarte darunter ist abgeräumt', `${rest} Kacheln übrig`);
  }

  const kartentext = (await dritte.locator('.block').nth(1).innerText()).replace(/\s+/g, ' ');
  pruefe(
    /gibtsnicht|404|sprite/i.test(kartentext),
    'und die Meldung steht trotzdem auf der Seite — verschwiegen wird sie nicht',
    kartentext.slice(0, 220),
  );
  await ctx3.close();
}

// ========================================================= 7) Layout =====

console.log('\nLayout bei 390 px:');
await laden();
const quer = await seite.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
pruefe(!quer, 'kein Querscrollen');
const fazitGross = await seite
  .locator('.fazit')
  .first()
  .evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
pruefe(fazitGross >= 18, 'die Kopfzeile ist die größte Schrift im Block', `${fazitGross} px`);

console.log('\nFehlermeldungen der Seite:');
pruefe(meldungen.length === 0, 'keine Fehler in der Konsole', meldungen.join(' | '));

await browser.close();
console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
