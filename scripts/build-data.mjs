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
const OUT = resolve(root, 'src/data/places.json');

/** Erwartungswerte, gegen die das Ergebnis geprüft wird. */
const EXPECT = {
  total: 164,
  categories: { kultur: 54, essen: 35, natur: 26, hotel: 25, shop: 24 },
  friendTips: 7,
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
 * Der Reiseband wird inhaltlich nicht angefasst. Ergänzt werden nur
 *   a) Anker an den 11 Kapiteln, damit die App hineinverlinken kann, und
 *   b) ein Rückweg zur App, sonst ist man im Band gefangen.
 * Beides ist rein additiv — kein Text und kein Stil wird verändert.
 */
const CHAPTER_IDS = [
  'einladung', 'prolog', 'route', 'ankunft', 'osaka', 'kyoto',
  'kanazawa', 'takayama', 'hakone', 'tokio', 'epilog',
];

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

  const backLink = `<style>
.app-back{position:fixed;top:14px;right:14px;z-index:99;font-family:"Zen Kaku Gothic New",sans-serif;
font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;background:#16233CEE;color:#EFE7D6;
border:1px solid #A67C33;border-radius:999px;padding:9px 16px;text-decoration:none;backdrop-filter:blur(6px)}
.app-back:hover{background:#C6402B;border-color:#C6402B}
@media print{.app-back{display:none}}
</style>
<a class="app-back" href="./">← Zum Reiseplaner</a>
`;

  if (!html.includes('class="app-back"')) {
    html = html.replace('<body>', `<body>${backLink}`);
  }

  const out = resolve(root, 'public/reiseband.html');
  writeFileSync(out, html, 'utf8');
  return added;
}

const anchorsAdded = writeGuide();

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
console.log(`  Schließtage   ${places.filter((p) => p.closedDay).length}`);
console.log(`  Reservierung  ${places.filter((p) => p.needsBooking).length}`);
console.log(`  Nur Bargeld   ${places.filter((p) => p.cashOnly).length}`);
console.log(`  Stationen     ${Object.entries(byStation).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`  Reiseband     public/reiseband.html (${anchorsAdded} Kapitelanker ergänzt)\n`);
