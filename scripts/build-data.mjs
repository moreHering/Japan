/**
 * Führt die beiden Quelldateien des Reisebands zu src/data/places.json zusammen.
 *
 *   data/source/Japan-Karte-2026.kml           → Koordinaten, Kategorie, Station
 *   data/source/Japan-Reisefuehrer-2026.html   → die ausführlichen Beschreibungstexte
 *
 * Join-Key ist die Ortsnummer (1–164); sie ist in beiden Quellen lückenlos und
 * eindeutig. Das Skript ist idempotent und bricht ab, wenn die Prüfsummen unten
 * nicht mehr stimmen — dann hat sich eine Quelldatei geändert und das Ergebnis
 * muss angesehen werden, statt stillschweigend falsche Daten zu schreiben.
 *
 *   npm run data
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KML = resolve(root, 'data/source/Japan-Karte-2026.kml');
const HTML = resolve(root, 'data/source/Japan-Reisefuehrer-2026.html');
const BOOK = resolve(root, 'data/source/buch-erlebnisse.json');
const UNTERKUNFT = resolve(root, 'data/source/unterkunft.json');
const OUT = resolve(root, 'src/data/places.json');

/** Erwartungswerte, gegen die das Ergebnis geprüft wird. */
const EXPECT = {
  total: 164,
  categories: { kultur: 54, essen: 35, natur: 26, hotel: 25, shop: 24 },
  friendTips: 7,
  /** Einträge unter "Weitere Optionen — ohne Nummer"; ohne Koordinaten, nur im Band. */
  unnumbered: 7,
  /** Abschnitte, in denen diese Einträge stehen — einer je Station außer Kanazawa. */
  unnumberedSections: 5,
  /** Übernachtungsvorschläge, die durch die Buchungen erledigt sind. */
  unterkunftVorschlaege: 23,
  /** Orte der Kategorie Übernachten, die die tatsächliche Buchung sind. */
  unterkunftGebucht: 1,
};

/** KML-Style-IDs → interne Kategorie-Slugs. */
const CATEGORY = {
  kultur: 'kultur',
  essen_trinken: 'essen',
  einkaufen_handwerk: 'shop',
  natur_aktiv: 'natur',
  'übernachten': 'hotel',
};

const WEEKDAYS = {
  mo: 'Mo', di: 'Di', mi: 'Mi', do: 'Do', fr: 'Fr', sa: 'Sa', so: 'So',
  montags: 'Mo', dienstags: 'Di', mittwochs: 'Mi', donnerstags: 'Do',
  freitags: 'Fr', samstags: 'Sa', sonntags: 'So',
};

// ---------------------------------------------------------------- Hilfsmittel

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

const stripTags = (s) => decode(s.replace(/<[^>]+>/g, ''));

/** Vergleichsform für den Namensabgleich zwischen KML und Reiseband. */
const normalizeName = (s) =>
  stripTags(s)
    .replace(/★\s*Freundestipp/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Erlaubt nur die Inline-Auszeichnung, die in den Beschreibungen wirklich vorkommt. */
const sanitize = (html) =>
  html
    .replace(/<(?!\/?(?:strong|b|em|i)\b)[^>]*>/g, '')
    .replace(/<b>/g, '<strong>')
    .replace(/<\/b>/g, '</strong>')
    .replace(/\s+/g, ' ')
    .trim();

function fail(msg) {
  console.error(`\n  Abbruch: ${msg}\n`);
  process.exit(1);
}

// ------------------------------------------------------------------ KML lesen

/**
 * @param {Map<string, number[]>} htmlByName Name → Nummern aus dem Reiseband
 * @returns {{places: Map<number, object>, corrections: string[]}}
 */
function readKml(htmlByName) {
  const xml = readFileSync(KML, 'utf8');
  const places = new Map();
  const corrections = [];
  let folderCount = 0;

  for (const folder of xml.matchAll(/<Folder><name>(.*?)<\/name>([\s\S]*?)<\/Folder>/g)) {
    folderCount++;
    const [stationLabel, areaLabel] = folder[1].split('—').map((s) => s.trim());
    const station = stationLabel
      .toLowerCase()
      .replace(/ō/g, 'o')
      .replace(/[^a-z]/g, '');
    const area = /ausfl/i.test(areaLabel ?? '') ? 'ausflug' : 'zentrum';

    for (const pm of folder[2].matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
      const block = pm[1];
      const name = block.match(/<name>(\d{3}) · (.*?)<\/name>/);
      const coords = block.match(/<coordinates>([-\d.]+),([-\d.]+)/);
      const style = block.match(/<styleUrl>#(.*?)<\/styleUrl>/);
      if (!name || !coords) fail(`Placemark ohne Name oder Koordinaten in "${folder[1]}"`);

      const kmlName = decode(name[2]);
      const category = CATEGORY[style?.[1] ?? ''];
      if (!category) fail(`Unbekannte KML-Kategorie "${style?.[1]}" bei "${kmlName}"`);

      // Die Nummern im KML sind nicht verlässlich: Amazake-chaya trägt dort
      // zweimal die 096, obwohl das Reiseband die beiden Einträge als 095 und
      // 096 führt. Maßgeblich sind die Nummern des Reisebands — die stehen
      // gedruckt im Buch und werden auf der Karte gesucht. Der Name ist deshalb
      // der eigentliche Join-Key, die KML-Nummer nur die Gegenprobe.
      let nr = Number(name[1]);
      const byName = htmlByName.get(normalizeName(kmlName)) ?? [];
      const free = byName.filter((n) => !places.has(n));

      if (!byName.includes(nr) && free.length === 1) {
        corrections.push(`Nr. ${nr} → ${free[0]} ("${kmlName}", über Namensabgleich)`);
        nr = free[0];
      } else if (places.has(nr) && free.length >= 1) {
        corrections.push(`Nr. ${nr} war belegt → ${free[0]} ("${kmlName}")`);
        nr = free[0];
      } else if (places.has(nr)) {
        fail(`Nr. ${nr} ("${kmlName}") doppelt im KML, kein Name im Reiseband passt dazu`);
      }

      const entry = {
        nr,
        kmlName,
        category,
        station,
        stationLabel,
        area,
        lng: Number(coords[1]), // KML-Reihenfolge ist lng,lat — hier gedreht
        lat: Number(coords[2]),
        placeId: block.match(/query_place_id=([\w-]+)/)?.[1] ?? null,
      };

      places.set(nr, entry);
    }
  }

  if (folderCount !== 10) fail(`${folderCount} KML-Folder statt der erwarteten 10`);
  return { places, corrections };
}

// ----------------------------------------------------------------- HTML lesen

/** @returns {Map<number, {name: string, descriptionHtml: string}>} */
function readHtml() {
  const html = readFileSync(HTML, 'utf8');
  const out = new Map();

  const rows = html.matchAll(
    /<span class="pin [a-zäöü]+">(\d+)<\/span><\/td><td>([\s\S]*?)<\/td><\/tr>/g,
  );

  for (const row of rows) {
    const nr = Number(row[1]);
    let cell = row[2];

    // Kategorie-Badge und den angehängten Karten-Link entfernen; letzterer wird
    // aus der place_id neu erzeugt, damit es nur eine Quelle dafür gibt.
    cell = cell.replace(/<span class="tag [^"]*">.*?<\/span>\s*/g, '');
    cell = cell.replace(/\s*<a href="https:\/\/www\.google\.com\/maps[^"]*">[^<]*<\/a>\s*/g, ' ');

    const nameMatch = cell.match(/<b>(.*?)<\/b>/);
    if (!nameMatch) fail(`Kein <b>Name</b> in der Pin-Zeile Nr. ${nr}`);

    const name = stripTags(nameMatch[1]).trim();
    const description = sanitize(cell.slice(nameMatch.index + nameMatch[0].length))
      .replace(/^\s*[—–-]\s*/, '');

    if (out.has(nr)) fail(`Nummer ${nr} kommt im HTML doppelt vor`);
    out.set(nr, { name, descriptionHtml: description });
  }

  return out;
}

// ------------------------------------------------------- abgeleitete Merkmale

/** Wochentag, an dem der Ort geschlossen ist, oder null. */
function detectClosedDay(text) {
  const m =
    text.match(/\b(Mo|Di|Mi|Do|Fr|Sa|So)\s+geschlossen/i) ??
    text.match(/\b(MONTAGS|DIENSTAGS|MITTWOCHS|DONNERSTAGS|FREITAGS|SAMSTAGS|SONNTAGS)\s+GESCHLOSSEN/i);
  return m ? WEEKDAYS[m[1].toLowerCase()] ?? null : null;
}

/**
 * Braucht der Ort eine Reservierung? Die Negationen sind nötig, weil im Buch
 * auch "ohne Reservierung" als Entwarnung steht (Nr. 115).
 */
function needsBooking(text) {
  if (/(ohne|keine|kein[e]?r?)\s+(reservierung|voranmeldung|vorbuchung|anmeldung)/i.test(text)) {
    return false;
  }
  return /reservierung|reservier|vorverkauf|vorab buchen|vorab reservieren|zeitfenster vorab|ticket am|losverfahren/i.test(
    text,
  );
}

const cashOnly = (text) => /nur bargeld|kein tax-free/i.test(text);

// --------------------------------------------------------- Orte aus dem Buch

/**
 * Ordnet den Orten das Erlebnis aus "Japan erleben" zu, aus dem sie stammen.
 *
 * Der Abgleich läuft über feste Namensbestandteile aus buch-erlebnisse.json,
 * nicht über Ähnlichkeit: Ein falsch gesetztes Buchsymbol behauptet etwas über
 * die Quelle eines Ortes und ist schlimmer als ein fehlendes. Treffer werden
 * am Ende aufgelistet, damit die Zuordnung prüfbar bleibt.
 */
function assignBook(places) {
  const { erlebnisse } = JSON.parse(readFileSync(BOOK, 'utf8'));
  const norm = (x) => stripTags(x).toLowerCase().replace(/\s+/g, ' ').trim();
  const report = [];
  const unmatched = [];

  /*
   * Der Suchbegriff muss als eigenes Wort vorkommen, nicht als Silbe: "Uji"
   * steckt sonst in "Tenjinbashi-suji" und "Doguyasuji" und würde zwei
   * Osakaer Einkaufsstraßen dem Erlebnis über die Teestadt bei Kyoto
   * zuschlagen. Geprüft wird deshalb, dass links und rechts des Treffers
   * kein Buchstabe steht.
   */
  const matches = (name, key) => {
    let from = 0;
    for (;;) {
      const i = name.indexOf(key, from);
      if (i === -1) return false;
      const before = name[i - 1];
      const after = name[i + key.length];
      const isLetter = (c) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
      if (!isLetter(before) && !isLetter(after)) return true;
      from = i + 1;
    }
  };

  for (const e of erlebnisse) {
    for (const suchbegriff of e.orte) {
      const key = norm(suchbegriff);
      const hits = places.filter((p) => matches(norm(p.name), key));

      if (!hits.length) {
        unmatched.push(`${e.nr} · ${suchbegriff}`);
        continue;
      }
      for (const p of hits) {
        // Ein Ort kann zu mehreren Erlebnissen passen — das erste gewinnt,
        // damit die Zuordnung stabil bleibt.
        if (p.book) continue;
        p.book = e.nr;
        p.bookTitle = e.titel;
        report.push(`${e.nr} ${e.titel} → Nr. ${p.nr} ${p.name}`);
      }
    }
  }
  return { report, unmatched };
}

// ----------------------------------------------------------------------- Merge

const texts = readHtml();

// Name → Nummern des Reisebands. Mehrere Nummern pro Name sind möglich, wenn ein
// Ort im Buch doppelt gelistet ist (Amazake-chaya als 95 und 96).
const htmlByName = new Map();
for (const [nr, t] of texts) {
  const key = normalizeName(t.name);
  if (!htmlByName.has(key)) htmlByName.set(key, []);
  htmlByName.get(key).push(nr);
}

/**
 * Trennt bei den Übernachtungsorten das Gebuchte vom Vorschlag.
 *
 * Für alle sechs Stationen ist etwas gebucht. Die Vorschläge des Reisebands
 * sind damit erledigt; sie bleiben in den Daten stehen (mit `uebernachtung:
 * 'vorschlag'`), werden aber von der App nicht mehr angeboten. Welcher Ort die
 * tatsächliche Buchung ist und welcher gar keine Übernachtung, steht kuratiert
 * in `data/source/unterkunft.json` — raten wäre hier falsch.
 */
function markiereUnterkuenfte(places) {
  const cfg = JSON.parse(readFileSync(UNTERKUNFT, 'utf8'));
  const keine = new Set(cfg.keineUebernachtung ?? []);
  const gebucht = new Map(
    Object.entries(cfg.gebucht ?? {}).filter(([, nr]) => Number.isInteger(nr)),
  );
  const gebuchteNrn = new Set(gebucht.values());

  let vorschlaege = 0;
  let belegt = 0;

  for (const p of places) {
    if (p.category !== 'hotel' || keine.has(p.nr)) continue;
    if (gebuchteNrn.has(p.nr)) {
      p.uebernachtung = 'gebucht';
      belegt += 1;
    } else {
      p.uebernachtung = 'vorschlag';
      vorschlaege += 1;
    }
  }

  // Eine Nummer, die es nicht gibt oder die zur falschen Station gehört, wäre
  // ein stiller Fehler in der kuratierten Datei.
  for (const [station, nr] of gebucht) {
    const p = places.find((x) => x.nr === nr);
    if (!p) fail(`unterkunft.json: Nr. ${nr} (${station}) gibt es nicht`);
    else if (p.station !== station) {
      fail(`unterkunft.json: Nr. ${nr} liegt in ${p.station}, nicht in ${station}`);
    }
  }
  for (const nr of keine) {
    if (!places.some((x) => x.nr === nr)) fail(`unterkunft.json: Nr. ${nr} gibt es nicht`);
  }

  return { vorschlaege, belegt };
}

const { places: geo, corrections } = readKml(htmlByName);

const places = [];
for (const nr of [...geo.keys()].sort((a, b) => a - b)) {
  const g = geo.get(nr);
  const t = texts.get(nr);
  if (!t) fail(`Nr. ${nr} ("${g.kmlName}") fehlt im Reiseband-HTML`);

  // Der HTML-Name ist der gepflegtere; die Freundestipp-Markierung wandert in
  // ein eigenes Feld, damit sie in der UI als Symbol statt als Text erscheint.
  const isFriendTip = /★\s*Freundestipp/.test(t.name) || /★\s*Freundestipp/.test(g.kmlName);
  const name = t.name.replace(/\s*★\s*Freundestipp\s*/g, '').trim();
  const haystack = `${t.name} ${t.descriptionHtml}`;

  places.push({
    nr,
    name,
    category: g.category,
    station: g.station,
    stationLabel: g.stationLabel,
    area: g.area,
    lat: g.lat,
    lng: g.lng,
    placeId: g.placeId,
    descriptionHtml: t.descriptionHtml,
    isFriendTip,
    needsBooking: needsBooking(haystack),
    closedDay: detectClosedDay(haystack),
    cashOnly: cashOnly(haystack),
  });
}

const book = assignBook(places);
const unterkunft = markiereUnterkuenfte(places);

// Orte auf identischer Position gegenseitig markieren, damit die Karte deren
// Marker leicht versetzt zeichnen kann statt sie übereinanderzulegen.
const byCoord = new Map();
for (const p of places) {
  const key = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  if (!byCoord.has(key)) byCoord.set(key, []);
  byCoord.get(key).push(p);
}
for (const group of byCoord.values()) {
  if (group.length < 2) continue;
  for (const p of group) p.sameSpotAs = group.filter((o) => o !== p).map((o) => o.nr);
}

// ------------------------------------------------------------------- Prüfungen

const problems = [];

if (places.length !== EXPECT.total) {
  problems.push(`${places.length} Orte statt ${EXPECT.total}`);
}

const missing = [];
for (let i = 1; i <= EXPECT.total; i++) {
  if (!places.some((p) => p.nr === i)) missing.push(i);
}
if (missing.length) problems.push(`fehlende Nummern: ${missing.join(', ')}`);

const counts = {};
for (const p of places) counts[p.category] = (counts[p.category] ?? 0) + 1;
for (const [cat, want] of Object.entries(EXPECT.categories)) {
  if (counts[cat] !== want) problems.push(`Kategorie ${cat}: ${counts[cat] ?? 0} statt ${want}`);
}

const tips = places.filter((p) => p.isFriendTip).length;
if (tips !== EXPECT.friendTips) problems.push(`${tips} Freundestipps statt ${EXPECT.friendTips}`);

if (unterkunft.vorschlaege !== EXPECT.unterkunftVorschlaege) {
  problems.push(
    `${unterkunft.vorschlaege} Übernachtungsvorschläge statt ${EXPECT.unterkunftVorschlaege}`,
  );
}
if (unterkunft.belegt !== EXPECT.unterkunftGebucht) {
  problems.push(`${unterkunft.belegt} gebuchte Unterkünfte statt ${EXPECT.unterkunftGebucht}`);
}

const badCoords = places.filter(
  (p) =>
    !Number.isFinite(p.lat) || !Number.isFinite(p.lng) ||
    p.lat < 24 || p.lat > 46 || p.lng < 122 || p.lng > 146, // Japan-Bounding-Box
);
if (badCoords.length) {
  problems.push(`Koordinaten außerhalb Japans: Nr. ${badCoords.map((p) => p.nr).join(', ')}`);
}

const noText = places.filter((p) => p.descriptionHtml.length < 10);
if (noText.length) problems.push(`Beschreibung zu kurz: Nr. ${noText.map((p) => p.nr).join(', ')}`);

if (problems.length) fail(`Prüfung fehlgeschlagen\n    - ${problems.join('\n    - ')}`);

// -------------------------------------------------------------------- Schreiben

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(places, null, 2)}\n`, 'utf8');

const byStation = {};
for (const p of places) byStation[p.stationLabel] = (byStation[p.stationLabel] ?? 0) + 1;

// ------------------------------------------------- Reiseband nach public/ legen

/**
 * Die Lesefassung des Reisebands.
 *
 * Die Quelldatei bleibt unangetastet — aus ihr werden weiterhin alle 164
 * Ortstexte für places.json gelesen. Verändert wird nur die veröffentlichte
 * Fassung, und zwar in drei Richtungen:
 *
 *   a) Anker an den 11 Kapiteln, damit die App hineinverlinken kann
 *   b) ein Rückweg zur App, sonst ist man im Band gefangen
 *   c) die nummerierten Ortslisten fallen weg: sie stehen vollständig und
 *      besser bedienbar im Planer. Der Band wird damit zur reinen Lektüre.
 *
 * Was ausdrücklich bleibt: die Erzählung, die Anker samt Praxiszeile, alle
 * Kästen, die Probier-Tabellen — und die Einträge unter "Weitere Optionen —
 * ohne Nummer". Letztere haben keine Koordinaten, stehen deshalb nicht in
 * places.json und wären sonst ersatzlos verloren.
 */
const CHAPTER_IDS = [
  'einladung', 'prolog', 'route', 'ankunft', 'osaka', 'kyoto',
  'kanazawa', 'takayama', 'hakone', 'tokio', 'epilog',
];

/**
 * Der Verweis, der an die Stelle einer Ortsliste tritt. Die Zahlen stammen aus
 * den eben zusammengeführten Orten, sind also nie von Hand nachgepflegt.
 */
function listLink(slug) {
  const all = places.filter((p) => p.station === slug);
  if (!all.length) fail(`Kein Ort zur Station "${slug}" — Slug im Reiseband geändert?`);

  const name = all[0].stationLabel.split('—')[0].trim();
  const zentrum = all.filter((p) => p.area === 'zentrum').length;
  const ausflug = all.length - zentrum;

  const detail = [
    `${zentrum} im Zentrum`,
    ausflug ? `${ausflug} als Ausflüge` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return `<a class="app-orte" href="./orte/?station=${slug}">
<span class="ao-count">${all.length}</span>
<span class="ao-text"><b>Orte in ${name}</b><small>${detail} — such- und filterbar im Planer, auf der Karte und für die Tagesplanung</small></span>
<span class="ao-go">Ansehen →</span>
</a>
`;
}

/**
 * Die Einleitung erklärte bisher die Nummernlisten und einen QR-Code zu Google
 * My Maps. Beides trifft nicht mehr zu, sobald die Listen im Planer stehen.
 */
function rewriteIntro(html) {
  const replacements = [
    [
      '<p>Noch ein Wort zu den <strong>Nummern</strong>: Jeder Ort in diesem Buch trägt eine — von 1 in Osaka bis 164 in Tokio. Dieselben Nummern stehen auf eurer Karte in Google My Maps — QR-Code auf der Rückseite, einmal scannen und sie ist auf dem Handy. Ihr lest hier „Nr. 96", sucht auf der Karte „096" — fertig. Das Buch erzählt, die Karte führt.</p>',
      '<p>Noch ein Wort zu den <strong>Nummern</strong>: Jeder Ort trägt eine — von 1 in Osaka bis 164 in Tokio. Die vollständigen Ortslisten stehen nicht mehr in diesem Buch, sondern im <a href="./orte/">Reiseplaner</a>: dort sind sie durchsuchbar, nach Kategorie filterbar, liegen auf der Karte und lassen sich auf einzelne Reisetage legen. Ihr lest hier „Nr. 96" und findet denselben Punkt dort wieder. <strong>Das Buch erzählt, der Planer führt.</strong></p>',
    ],
    [
      '\n        <div><b>🔢 Orte auf der Karte</b> — nummeriert und nach Kategorie gefärbt: Kultur, Essen, Einkaufen, Natur, Übernachten.</div>',
      '\n        <div><b>🔢 Orte im Planer</b> — alle 164, nummeriert und nach Kategorie gefärbt: Kultur, Essen, Einkaufen, Natur, Übernachten.</div>',
    ],
    [
      '<span class="badge">Nummern im Text = <b>Nummern auf der Karte</b></span>',
      '<span class="badge">Nummern im Text = <b>Nummern im Planer</b></span>',
    ],
    // Der QR-Code auf der Rückseite bleibt: Google Maps kann Navigation und
    // Offline-Karten, was der Planer nicht leistet. Nur der Verweis "wie im
    // Buch" stimmt nicht mehr, seit die Listen dort nicht mehr stehen.
    [
      'Scannen — alle 164 Orte mit denselben Nummern wie im Buch, nach Stationen sortiert und nach Kategorie gefärbt.',
      'Scannen — alle 164 Orte mit denselben Nummern wie im Planer, nach Stationen sortiert und nach Kategorie gefärbt. Für Navigation und Offline-Karten unterwegs.',
    ],
  ];

  for (const [from, to] of replacements) {
    if (!html.includes(from)) {
      fail(`Textstelle für die Einleitung nicht gefunden:\n      ${from.slice(0, 90)}…`);
    }
    html = html.replace(from, to);
  }

  // Diese Überschriften stehen jetzt direkt unter dem Planer-Verweis. Ohne
  // Zusatz wirkt es, als hätte man dort etwas vergessen — der Hinweis sagt,
  // warum genau diese Einträge nicht im Planer stehen.
  const before = 'Weitere Optionen — ohne Nummer';
  const after = 'Weitere Optionen — ohne Nummer, nur hier im Buch';
  const count = (html.match(new RegExp(before, 'g')) ?? []).length;
  if (count !== EXPECT.unnumberedSections) {
    fail(`${count} Abschnitte "ohne Nummer", erwartet ${EXPECT.unnumberedSections}`);
  }
  html = html.replaceAll(before, after);

  return html;
}

/** Erwartete Anzahl der Blockköpfe "Orte auf der Karte" — einer je Station. */
const EXPECTED_LIST_BLOCKS = 6;

/** Kategorien, deren Pins eine Nummer tragen und damit in der App stehen. */
const NUMBERED = 'kultur|essen|shop|natur|hotel';

function writeGuide() {
  let html = readFileSync(HTML, 'utf8');

  let i = 0;
  let added = 0;
  html = html.replace(/<section class="(chapter[^"]*)"([^>]*)>/g, (match, cls, attrs) => {
    const id = CHAPTER_IDS[i++];
    if (!id) fail(`Mehr Kapitel im Reiseband als erwartet (${CHAPTER_IDS.length})`);
    if (/\bid=/.test(attrs)) return match; // vorhandenen Anker respektieren
    added++;
    return `<section class="${cls}" id="${id}"${attrs}>`;
  });

  if (i !== CHAPTER_IDS.length) {
    fail(`${i} Kapitel im Reiseband statt ${CHAPTER_IDS.length} — Ankerliste anpassen`);
  }

  const stats = { rows: 0, tables: 0, cats: 0, blocks: 0, kept: 0 };

  // 1. Die nummerierten Ortszeilen entfernen — das ist das Duplikat zur App.
  html = html.replace(
    new RegExp(`<tr><td class="b"><span class="pin (?:${NUMBERED})">\\d+</span></td><td>[\\s\\S]*?</td></tr>\\s*`, 'g'),
    () => {
      stats.rows++;
      return '';
    },
  );

  stats.kept = (html.match(/<span class="pin more">/g) ?? []).length;

  // 2. Tabellen, die dadurch leer geworden sind, samt ihrer Kategorie-
  //    überschrift entfernen. Tabellen mit verbliebenen Zeilen ("Weitere
  //    Optionen — ohne Nummer") bleiben mitsamt Überschrift stehen.
  html = html.replace(/<div class="cat [a-z]+">[^<]*<\/div>\s*<table class="pins">\s*<\/table>\s*/g, () => {
    stats.cats++;
    stats.tables++;
    return '';
  });
  // Leere Tabellen ohne eigene Überschrift (kommt bei den Ausflugsblöcken vor)
  html = html.replace(/<table class="pins">\s*<\/table>\s*/g, () => {
    stats.tables++;
    return '';
  });

  // 3. Blockkopf und den (unsichtbaren, nirgends gestylten) Kartenplatzhalter
  //    durch einen Verweis in den Planer ersetzen.
  html = html.replace(
    /<h3 class="sect">Orte auf der Karte.*?<\/h3>\s*<div class="mapbox" data-map="([^"]*)"><\/div>\s*/gs,
    (_match, slug) => {
      stats.blocks++;
      return listLink(slug);
    },
  );

  // Die Platzhalter der Ausflugsblöcke fallen ersatzlos weg. Sie sind nirgends
  // gestylt und umschließen nur die Überschrift "Ausflüge & Umgebung ab …",
  // deren Tabelle gerade entfernt wurde — sonst bliebe eine leere Überschrift.
  html = html.replace(
    /<div class="mapbox"[^>]*>(?:<div class="cat [a-z ]+">[^<]*<\/div>)?<\/div>\s*/g,
    () => {
      stats.cats++;
      return '';
    },
  );

  if (stats.blocks !== EXPECTED_LIST_BLOCKS) {
    fail(`${stats.blocks} Listenblöcke ersetzt, erwartet ${EXPECTED_LIST_BLOCKS}`);
  }
  if (stats.rows !== EXPECT.total) {
    fail(`${stats.rows} Ortszeilen entfernt, erwartet ${EXPECT.total}`);
  }
  if (stats.kept !== EXPECT.unnumbered) {
    fail(`${stats.kept} nummernlose Einträge erhalten, erwartet ${EXPECT.unnumbered}`);
  }
  if (/<span class="pin (?:kultur|essen|shop|natur|hotel)">/.test(html)) {
    fail('In der Lesefassung stehen noch nummerierte Pins');
  }
  if (/class="mapbox"/.test(html)) {
    fail('Kartenplatzhalter in der Lesefassung übrig geblieben');
  }

  // Jede verbliebene Kategorieüberschrift muss eine Tabelle mit Inhalt haben —
  // sonst steht im Band eine Überschrift ohne alles darunter.
  const cats = (html.match(/<div class="cat [a-z ]+">/g) ?? []).length;
  const tables = (html.match(/<table class="pins">/g) ?? []).length;
  if (cats !== tables) {
    fail(`${cats} Kategorieüberschriften, aber ${tables} Tabellen — eine steht verwaist da`);
  }

  html = rewriteIntro(html);

  const injected = `<style>
.app-back{position:fixed;top:14px;right:14px;z-index:99;font-family:"Zen Kaku Gothic New",sans-serif;
font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;background:#16233CEE;color:#EFE7D6;
border:1px solid #A67C33;border-radius:999px;padding:9px 16px;text-decoration:none;backdrop-filter:blur(6px)}
.app-back:hover{background:#C6402B;border-color:#C6402B}

/* Verweis auf die Ortsliste im Planer — steht, wo früher die Tabellen standen */
.app-orte{display:flex;align-items:center;gap:16px;margin:30px 0 10px;padding:16px 20px;
background:#F6F1E6;border:1px solid #D7CBB2;border-left:5px solid #C6402B;border-radius:14px;
text-decoration:none;color:#16233C;transition:border-color .15s,background .15s}
.app-orte:hover{background:#EFE7D6;border-left-color:#A63220}
.app-orte .ao-count{font-family:"Fraunces",Georgia,serif;font-weight:700;font-size:2.1rem;
line-height:1;color:#C6402B;flex:none}
.app-orte .ao-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.app-orte .ao-text b{font-family:"Fraunces",Georgia,serif;font-weight:600;font-size:1.12rem}
.app-orte .ao-text small{font-family:"Zen Kaku Gothic New",sans-serif;font-size:.78rem;
color:#4B5468;line-height:1.45}
.app-orte .ao-go{font-family:"Zen Kaku Gothic New",sans-serif;font-size:.74rem;letter-spacing:.1em;
text-transform:uppercase;color:#A63220;white-space:nowrap;flex:none}
@media(max-width:600px){.app-orte{flex-wrap:wrap;gap:10px;padding:14px 16px}
.app-orte .ao-go{width:100%}}
@media print{.app-back{display:none}}
</style>
<a class="app-back" href="./">← Zum Reiseplaner</a>
`;

  if (!html.includes('class="app-back"')) {
    html = html.replace('<body>', `<body>${injected}`);
  }

  const out = resolve(root, 'public/reiseband.html');
  writeFileSync(out, html, 'utf8');
  return { added, ...stats };
}

const guide = writeGuide();

const doubled = places.filter((p) => p.sameSpotAs?.length);

console.log(`\n  ${places.length} Orte → src/data/places.json`);
if (corrections.length) {
  console.log(`  Nummern korrigiert:`);
  for (const c of corrections) console.log(`    · ${c}`);
}
if (doubled.length) {
  console.log(`  Gleiche Position: Nr. ${doubled.map((p) => p.nr).join(', ')}`);
}
console.log(`  Kategorien   ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`  Freundestipps ${tips}`);
console.log(
  `  Übernachten   ${unterkunft.belegt} gebucht · ${unterkunft.vorschlaege} Vorschläge (erledigt, nicht mehr in der App)`,
);
console.log(`  Schließtage   ${places.filter((p) => p.closedDay).length}`);
console.log(`  Reservierung  ${places.filter((p) => p.needsBooking).length}`);
console.log(`  Nur Bargeld   ${places.filter((p) => p.cashOnly).length}`);
console.log(`  Aus dem Buch  ${places.filter((p) => p.book).length} Orte aus ${new Set(places.filter((p) => p.book).map((p) => p.book)).size} Erlebnissen`);
if (book.unmatched.length) {
  console.log(`  Ohne Treffer  ${book.unmatched.length}: ${book.unmatched.join(' · ')}`);
}
console.log(`  Stationen     ${Object.entries(byStation).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`  Reiseband     public/reiseband.html`);
console.log(`    · ${guide.added} Kapitelanker ergänzt`);
console.log(`    · ${guide.rows} Ortszeilen entfernt (stehen im Planer)`);
console.log(`    · ${guide.tables} Tabellen und ${guide.cats} Kategorieüberschriften aufgelöst`);
console.log(`    · ${guide.blocks} Blockköpfe durch Planer-Verweis ersetzt`);
console.log(`    · ${guide.kept} nummernlose Einträge behalten\n`);
