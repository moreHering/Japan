/**
 * Rechnen für die öffentliche Reisetagebuch-Ansicht unter /Japan/tagebuch/.
 *
 * Absichtlich ein reines Modul: keine Runen, kein DOM, kein Supabase. Nur so
 * ist jede Regel hier in vitest nachweisbar, und in der Ansicht bleibt
 * Darstellung. Läge die Gruppierung in der Komponente, ließe sie sich nur über
 * einen Browser prüfen — und genau die Fälle, die hier gefährlich sind (Beitrag
 * außerhalb der Reise, Ort in `places_custom`, `<script>` im Text), sieht im
 * Browser niemand, bis sie live schiefgehen.
 *
 * Datumsrechnungen laufen ausschließlich über die Helfer aus trip.ts, die
 * `Date.UTC` benutzen. Ein `new Date('2026-10-02')` wäre hier zeitzonenabhängig
 * und verschöbe den Reisetag in Japan um eins.
 */

import type { Beitrag, Person } from './freundebuch.svelte';
/*
 * Der Import aus `places` zieht `src/data/places.json` mit allen 164 Orten samt
 * Beschreibungstexten in das Bündel der öffentlichen Gästeseite; Tree-Shaking hilft
 * nicht, weil `placeByNr()` in `alleOrte` sucht.
 *
 * Gemessen statt geschätzt, im Build vom 18.09.: der gemeinsame `places`-Chunk
 * kostet **18,2 KB gzip**, die ganze Gästeseite 68 KB ohne Leaflet und ohne Fotos.
 * Ein einziges Foto im Bilderstrom ist mit ~300 KB das Sechzehnfache. Dazu liefert
 * GitHub Pages die Datei, nicht Supabase — die Egress-Grenze des Freitarifs betrifft
 * den Bucket, nicht das JavaScript. Der Import bleibt also; eine schmale Zuordnung
 * `nr → {name, lat, lng}` wäre ein zweites Abbild derselben Daten und müsste
 * gepflegt werden.
 */
import { HOECHSTE_FESTE_NR, placeByNr } from './places';
import type { TripDay } from './trip';
import { buildDays, daysBetween, formatDay, formatFull, hauptstationen, legs, stations, trip } from './trip';

export type Ort = { name: string; lat: number; lng: number };

/** Wo ein Beitrag zeitlich liegt: vor der Reise, während, danach. */
export type Lage = 'vor' | 'reise' | 'nach';

export type Tagesgruppe = {
  /** Schlüssel für `{#each}` — ISO-Datum bei Reisetagen, sonst `vor`/`nach`. */
  schluessel: string;
  titel: string;
  untertitel: string;
  /** `null` bei den Rand-Eimern, dort gibt es keinen Reisetag. */
  tag: TripDay | null;
  lage: Lage;
  beitraege: Beitrag[];
};

export type Kennzahlen = {
  tageGesamt: number;
  naechte: number;
  stationen: number;
  etappen: number;
  /** Reisetagnummer für `heute`, `null` vor und nach der Reise. */
  reisetagJetzt: number | null;
  /** Tage bis zum Reisebeginn, `null` sobald die Reise begonnen hat. */
  tageBisAbreise: number | null;
  vorbei: boolean;
  anzahl: number;
  mitFoto: number;
  /** Verschiedene Daten mit Eintrag, nur innerhalb der Reise gezählt. */
  tageMitEintrag: number;
  jePerson: { person: Person; anzahl: number }[];
  /** Verschiedene Ortsnamen, die sich über `ortVon` auflösen ließen. */
  orte: number;
  aufkleber: { name: string; anzahl: number } | null;
  erster: string | null;
  letzter: string | null;
};

export type Marke = {
  lat: number;
  lng: number;
  /**
   * Beschriftung im Markerkreis — die Reisetagnummer des ersten Beitrags, `?`
   * außerhalb der Reise. Bei mehreren Beiträgen am selben Ort steht die Zahl
   * dahinter in Klammern, etwa `2·3` für drei Einträge an Tag 2.
   */
  text: string;
  farbe: string;
  /** Fertiges HTML für `bindPopup`, jeder Nutzertext maskiert. */
  popup: string;
};

/**
 * HTML-Maskierung für die Kartenpopups.
 *
 * Die einzige Stelle, an der **dieses Modul** HTML baut: Leaflet nimmt
 * Popup-Inhalte als Zeichenkette, und der Beitragstext kommt aus einem
 * Eingabefeld. Ohne diese Funktion genügt ein `<img src=x onerror=…>` in einem
 * Beitrag, um auf der öffentlichen Seite fremden Code auszuführen.
 *
 * `Marke.text` und `Marke.farbe` gehen dagegen als **Daten** hinaus und werden
 * in `MapView.applyMarken()` von `maskiere()` behandelt — nicht hier. Wer die
 * Maskierung prüft, muss also an zwei Stellen schauen.
 *
 * `&` muss zuerst ersetzt werden, sonst maskiert der nächste Schritt das `&`
 * der eben erzeugten Entität ein zweites Mal (`&lt;` würde `&amp;lt;`).
 * Das Apostroph wird numerisch als `&#39;` geschrieben und nicht als `&apos;`:
 * numerische Verweise versteht jeder Parser, `&apos;` erst HTML5.
 */
export function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Datum → Reisetag, einmalig aus `buildDays()` aufgebaut.
 *
 * Nicht selbst gerechnet: `buildDays()` ist die eine Stelle, an der die
 * Reisetage definiert sind. Eine zweite Rechnung hier liefe bei einer Änderung
 * von trip.json still auseinander, und niemand würde es merken, weil beide
 * Zahlen plausibel aussähen.
 */
const tageNachDatum = new Map<string, TripDay>(buildDays().map((t) => [t.date, t]));

export function reisetag(datum: string): number | null {
  return tageNachDatum.get(datum)?.dayNo ?? null;
}

/**
 * Ortsangabe eines Beitrags.
 *
 * Drei Wege, in dieser Reihenfolge:
 *
 *   1. `ortName`/`ortLat`/`ortLng` am Beitrag — so entstehen Beiträge seit
 *      Migration 0008, und das ist die einzige Quelle, die auch für Orte aus
 *      `places_custom` trägt.
 *   2. Rückfall über `placeByNr` für die festen Orte des Reisebands. Deckt
 *      Beiträge ab, die vor 0008 angelegt wurden.
 *   3. `null`.
 *
 * Der dritte Fall ist der wichtige: Bei `ortNr` über `HOECHSTE_FESTE_NR` ohne
 * mitgeschriebenen Namen steht der Ort in `places_custom`, und die Tabelle ist
 * für Gäste dicht — dort liegen die Unterkünfte. Weder Name noch Koordinate
 * sind zu bekommen. Kein Marker ist dann richtig; ein Marker auf der
 * Stationsmitte behauptete eine Stelle, die niemand angegeben hat.
 */
export function ortVon(b: Beitrag): Ort | null {
  if (b.ortName && b.ortLat !== null && b.ortLng !== null) {
    return { name: b.ortName, lat: b.ortLat, lng: b.ortLng };
  }
  // Die Grenze steht nicht als 164 im Code, sondern kommt aus places.json:
  // wächst das Reiseband, wächst sie mit.
  if (b.ortNr !== null && b.ortNr <= HOECHSTE_FESTE_NR) {
    const ort = placeByNr(b.ortNr);
    if (ort) return { name: ort.name, lat: ort.lat, lng: ort.lng };
  }
  return null;
}

/**
 * Zeitstempel als Zahl.
 *
 * `erstellt` ist ein vollständiger Zeitstempel mit Zonenangabe, kein reines
 * Datum — `Date.parse` ist hier also eindeutig und verträgt auch einen anderen
 * Offset als `+00:00`. Ein Vergleich der Zeichenketten täte das nicht.
 * Unlesbares landet vorn statt als `NaN` im Vergleich, denn `NaN` macht die
 * Sortierung der ganzen Gruppe unbestimmt.
 */
function zeitpunkt(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Innerhalb eines Tages immer aufsteigend, auch wenn die Gruppen absteigend
 * laufen — sonst steht der Abend über dem Frühstück.
 *
 * Auf einer Kopie, weil die übergebene Liste `buch.beitraege` ist; `sort()`
 * arbeitet an der Stelle und würde die Reihenfolge des Freundebuchs umstellen.
 */
function nachErstellt(liste: Beitrag[]): Beitrag[] {
  return [...liste].sort((a, b) => zeitpunkt(a.erstellt) - zeitpunkt(b.erstellt));
}

/**
 * Eimer für alles außerhalb der Reise.
 *
 * Einer je Seite, nicht einer je Datum: Vorfreude und Nachklang sind kein
 * Reisetag und sollen die Tagesliste nicht mit Pseudo-Tagen verlängern.
 */
function randgruppe(lage: 'vor' | 'nach', beitraege: Beitrag[]): Tagesgruppe {
  // Anders als innerhalb eines Reisetags umfasst ein Rand-Eimer mehrere Daten —
  // die Überschrift nennt eine Spanne. Deshalb ordnet hier zuerst das Datum und
  // erst danach der Zeitstempel; nur nach `erstellt` sortiert widersprächen die
  // Einträge der Spanne, die über ihnen steht.
  const sortiert = nachErstellt(beitraege).sort((a, b) => a.datum.localeCompare(b.datum));
  const daten = [...new Set(sortiert.map((b) => b.datum))].sort();
  const spanne =
    daten.length > 1
      ? `${formatFull(daten[0])} – ${formatFull(daten[daten.length - 1])}`
      : formatFull(daten[0]);
  return {
    schluessel: lage,
    titel: lage === 'vor' ? 'Vor der Reise' : 'Nach der Reise',
    untertitel: spanne,
    tag: null,
    lage,
    beitraege: sortiert,
  };
}

/**
 * Beiträge nach Tag gruppieren.
 *
 * Die Falle steckt in `datum`: Das Feld ist beim Anlegen frei wählbar und muss
 * nicht in die Reise fallen — jemand trägt vor der Abreise etwas ein oder
 * schreibt hinterher nach. Solche Beiträge dürfen nicht durchfallen, sonst sind
 * sie eingetragen, gespeichert und unsichtbar. Sie kommen deshalb in eigene
 * Eimer (`lage: 'vor'` / `'nach'`) und nicht in den ersten oder letzten
 * Reisetag, wo sie ein falsches Datum bekämen.
 */
export function gruppiereNachTag(beitraege: Beitrag[], neuesteZuerst = false): Tagesgruppe[] {
  const reise = new Map<string, Beitrag[]>();
  const vor: Beitrag[] = [];
  const nach: Beitrag[] = [];

  for (const b of beitraege) {
    if (tageNachDatum.has(b.datum)) {
      const liste = reise.get(b.datum);
      if (liste) liste.push(b);
      else reise.set(b.datum, [b]);
    } else if (b.datum < trip.start) {
      vor.push(b);
    } else {
      // Alles, was nicht in der Reise liegt und nicht davor: danach. Auch ein
      // kaputtes Datum landet damit in einem Eimer statt im Nichts.
      nach.push(b);
    }
  }

  const gruppen: Tagesgruppe[] = [];
  if (vor.length) gruppen.push(randgruppe('vor', vor));
  for (const datum of [...reise.keys()].sort()) {
    // Vorhanden, weil der Schlüssel aus `tageNachDatum.has` kam.
    const tag = tageNachDatum.get(datum)!;
    gruppen.push({
      schluessel: datum,
      titel: `Tag ${tag.dayNo}`,
      // `tag.station` füllt buildDays() über stationOf — am Umzugstag also die
      // Station, in der die Nacht verbracht wird.
      untertitel: `${formatDay(datum)} · ${tag.station.name}`,
      tag,
      lage: 'reise',
      beitraege: nachErstellt(reise.get(datum)!),
    });
  }
  if (nach.length) gruppen.push(randgruppe('nach', nach));

  // Nur die Gruppen kippen. Innerhalb eines Tages bleibt es aufsteigend, das
  // erledigt nachErstellt() oben und überlebt das Umdrehen.
  return neuesteZuerst ? gruppen.reverse() : gruppen;
}

/**
 * Zahlen für den Kopf der Tagebuchseite.
 *
 * `heute` kommt von außen und wird nicht aus `new Date()` geholt: sonst ließe
 * sich weder der Zustand vor der Reise noch der nach ihr prüfen, und die
 * Funktion hätte an jedem Tag ein anderes Ergebnis.
 *
 * Was hier bewusst fehlt: gelaufene Kilometer und „X von 164 Orten besucht".
 * Die Daten dafür (Plan, `places_custom`) sind für Gäste nicht lesbar. Eine
 * gerechnete Zahl wäre geraten, und eine geratene Zahl auf einer Seite, die
 * Freunde für Bericht halten, ist eine Lüge.
 */
export function kennzahlen(
  beitraege: Beitrag[],
  personen: Person[],
  heute: string,
): Kennzahlen {
  // Auf das reine Datum kürzen. Der Typ `string` lässt einen vollen Zeitstempel
  // durch (`new Date().toISOString()` liegt nahe), und `'2026-10-02T…' < '2026-10-02'`
  // ist false — die Vergleiche gegen `trip.start`/`trip.end` fielen dann still
  // falsch aus, statt zu scheitern. Zehn Zeichen sind das ISO-Datum; ist `heute`
  // schon eines, ändert der Schnitt nichts.
  const tag = heute.slice(0, 10);
  const tage = new Set<string>();
  const ortsnamen = new Set<string>();
  const jeAutor = new Map<string, number>();
  const jeAufkleber = new Map<string, number>();
  let mitFoto = 0;
  let erster: string | null = null;
  let letzter: string | null = null;

  for (const b of beitraege) {
    // `bildPfad`, nicht `bildUrl`: der Pfad sagt, dass ein Bild existiert. Die
    // URL kann fehlen, weil das Verlinken scheiterte — dann wäre das Foto
    // gezählt weg, obwohl es da ist.
    if (b.bildPfad) mitFoto++;
    if (reisetag(b.datum) !== null) tage.add(b.datum);
    jeAutor.set(b.autorId, (jeAutor.get(b.autorId) ?? 0) + 1);
    if (b.sticker) jeAufkleber.set(b.sticker, (jeAufkleber.get(b.sticker) ?? 0) + 1);
    const ort = ortVon(b);
    if (ort) ortsnamen.add(ort.name);
    // ISO-Daten sind zeichenweise vergleichbar, solange sie vierstellig
    // beginnen — kein Date nötig.
    if (erster === null || b.datum < erster) erster = b.datum;
    if (letzter === null || b.datum > letzter) letzter = b.datum;
  }

  let aufkleber: { name: string; anzahl: number } | null = null;
  for (const [name, anzahl] of jeAufkleber) {
    // Strikt größer: bei Gleichstand gewinnt der zuerst aufgetretene Aufkleber,
    // weil die Map die Reihenfolge des Einfügens behält. Irgendeine Regel muss
    // greifen, sonst wechselt die Anzeige zwischen zwei Ladevorgängen.
    if (!aufkleber || anzahl > aufkleber.anzahl) aufkleber = { name, anzahl };
  }

  return {
    tageGesamt: tageNachDatum.size,
    naechte: trip.nights,
    // Die sechs des Bandes — die Zwischennacht in Kawaguchiko zählt nicht mit.
    stationen: hauptstationen.length,
    etappen: legs.length,
    reisetagJetzt: reisetag(tag),
    // „Abreise" ist hier der Reisebeginn, wie in TripStatus: die Seite zählt
    // vorher herunter. Ab dem ersten Reisetag steht die Tagnummer da, deshalb
    // null statt einer negativen Zahl.
    tageBisAbreise: tag < trip.start ? daysBetween(tag, trip.start) : null,
    vorbei: tag > trip.end,
    anzahl: beitraege.length,
    mitFoto,
    tageMitEintrag: tage.size,
    // Alle Personen, auch mit null Beiträgen — wer nichts geschrieben hat, wird
    // nicht aus der Liste geschwiegen. Beiträge einer Person, die nicht in
    // `personen` steht, zählen nur in `anzahl` mit.
    // `sort` ist stabil, bei gleicher Anzahl bleibt also die Reihenfolge aus
    // der Datenbank (angelegt_am) erhalten.
    jePerson: personen
      .map((person) => ({ person, anzahl: jeAutor.get(person.id) ?? 0 }))
      .sort((a, b) => b.anzahl - a.anzahl),
    orte: ortsnamen.size,
    aufkleber,
    erster,
    letzter,
  };
}

/**
 * Die geplante Route als Linie: die Schlaforte in Reihenfolge — die sechs
 * Stationen und seit dem Mietwagen-Plan die Nacht am Kawaguchi-See.
 *
 * Ausdrücklich die **geplante** Route. Die tatsächlich gelaufene ließe sich nur
 * aus Plan und Orten rekonstruieren, und beides ist für Gäste nicht lesbar. Was
 * hier gezeichnet wird, ist die Kette der Stationen — nicht die Behauptung,
 * genau so sei es gegangen.
 *
 * Neue Tupel statt `s.center`: Leaflet bekommt die Arrays in die Hand, und ein
 * `latlngs.push()` dort dürfte stations.json nicht verändern.
 */
export function stationsRoute(): [number, number][] {
  return stations.map((s) => [s.center[0], s.center[1]]);
}

/** Popuptext auf Kartenmaß. */
const POPUP_LAENGE = 180;

function kuerze(text: string, laenge = POPUP_LAENGE): string {
  const t = text.trim();
  if (t.length <= laenge) return t;
  // Nach Codepunkten schneiden, nicht nach UTF-16-Einheiten: Ein Emoji oder ein
  // seltenes Kanji belegt zwei Einheiten, und `slice()` zerlegt das Paar. Übrig
  // bliebe ein einsames Surrogat, das der Browser als „�" zeigt — `escape()`
  // räumt das nicht auf, weil es ein gültiges Zeichen ist. `[...t]` zerlegt
  // nach Codepunkten, deshalb kann das hier nicht passieren.
  return `${[...t].slice(0, laenge).join('').trimEnd()}…`;
}

/**
 * Popup-HTML eines Beitrags.
 *
 * Erst kürzen, dann maskieren. Andersherum fiele der Schnitt irgendwann mitten
 * in eine Entität (`&amp;` würde zu `&am`), und die Bruchstelle stünde roh im
 * Popup.
 *
 * Maskiert wird alles, was aus der Datenbank kommt — auch das Datum, obwohl es
 * dort in einer `date`-Spalte steht und nichts anderes als Ziffern enthalten
 * kann. Die Regel „nichts Ungefiltertes geht hinein" ist beim Ändern dieser
 * Funktion verlässlich; eine Regel mit einer begründeten Ausnahme ist es nicht.
 */
function eintragHtml(b: Beitrag, name: string): string {
  const text = escape(kuerze(b.text));
  const nr = reisetag(b.datum);
  const datum = escape(formatFull(b.datum));
  const kopf = nr === null ? datum : `Tag ${nr} · ${datum}`;
  return [
    '<div class="tb-popup-eintrag">',
    `<div class="tb-popup-kopf">${kopf}</div>`,
    text ? `<p>${text}</p>` : '',
    name ? `<div class="tb-popup-wer">${escape(name)}</div>` : '',
    '</div>',
  ].join('');
}

/**
 * Popup-HTML für **alle** Beiträge an einem Ort.
 *
 * Der Ortsname steht einmal oben, darunter die Einträge in der Reihenfolge, in
 * der sie geschrieben wurden. `.tb-popup-eintrag` trennt sie; die Optik dieser
 * Klassen liefert die Komponente global, weil Leaflet die Knoten außerhalb des
 * Svelte-Scopes einhängt.
 */
function popupHtml(beitraege: Beitrag[], ort: Ort, nameVon?: (id: string) => string): string {
  return [
    '<div class="tb-popup">',
    `<strong>${escape(ort.name)}</strong>`,
    ...beitraege.map((b) => eintragHtml(b, nameVon?.(b.autorId) ?? '')),
    '</div>',
  ].join('');
}

/**
 * Eine Marke je **Ort**, mit allen Beiträgen dieses Orts im Popup.
 *
 * Der naheliegende Weg — eine Marke je Beitrag — funktioniert nicht, und das ist
 * gemessen, nicht vermutet:
 *
 * Leaflet errechnet den z-Index eines Markers aus seiner Bildschirm-y-Position.
 * Bei identischer Koordinate entscheidet die Reihenfolge im DOM, der später
 * gebaute Marker deckt den früheren vollständig ab, und der untere bekommt keine
 * Zeigerereignisse mehr — sein Popup ist nicht zu öffnen. Zwei Beiträge über
 * dasselbe Lokal ergäben also einen sichtbaren und einen unerreichbaren.
 *
 * Ein geografischer Versatz, wie `MapView.offsetOf()` ihn für die Orte Nr. 95/96
 * benutzt, löst das nicht: `0.00016°` sind bei Zoomstufe 15 rund **3,7 Pixel** bei
 * einer Markerbreite von 26 — unsichtbar, solange man nicht bis z≈18 hineinzoomt.
 * (Ein erster Anlauf hat genau das gebaut; der Browsertest hat es widerlegt.)
 * Dazu kommt der Einwand, der schwerer wiegt als die Pixel: Ein Versatz setzt
 * einen Punkt an eine Stelle, an der nichts ist. Auf einer Reisekarte ist ein
 * Ort, den es nicht gibt, schlimmer als zwei Einträge in einem Popup.
 *
 * Deshalb gruppiert: eine Marke, ein Punkt, alle Einträge darin. Die Karte zeigt
 * weiter, was geschrieben wurde — nur gebündelt nach dem Ort, über den es
 * geschrieben wurde.
 *
 * `nameVon` ist getrennt von `farbeVon` und freiwillig: Das Popup nennt die
 * Person, dieses Modul kennt aber keine Personenliste (es soll nichts aus dem
 * Freundebuch-Zustand lesen). Fehlt der Löser, bleibt die Zeile weg — lieber
 * kein Name als „?".
 *
 * Die **Farbe** ist die des ersten Beitrags. Bei mehreren Personen an einem Ort
 * ließe sich das nicht auflösen, ohne einen Kreis zu erfinden, der niemandem
 * gehört; die Namen stehen vollständig im Popup.
 */
export function markenFuer(
  beitraege: Beitrag[],
  farbeVon: (autorId: string) => string,
  nameVon?: (autorId: string) => string,
): Marke[] {
  // Schlüssel ist die rohe Zahlenpaarung, nicht gerundet: `ortVon()` gibt entweder
  // die mitgeschriebenen Koordinaten des Beitrags oder die aus `places.json` — in
  // beiden Fällen identische Werte für denselben Ort, also greift der Vergleich.
  // Eine `Map` behält die Einfügereihenfolge, die Marken kommen deshalb in der
  // Reihenfolge des ersten Beitrags je Ort heraus.
  const jeOrt = new Map<string, { ort: Ort; beitraege: Beitrag[] }>();
  for (const b of beitraege) {
    const ort = ortVon(b);
    if (!ort) continue;
    const schluessel = `${ort.lat}|${ort.lng}`;
    const vorhanden = jeOrt.get(schluessel);
    if (vorhanden) vorhanden.beitraege.push(b);
    else jeOrt.set(schluessel, { ort, beitraege: [b] });
  }

  const marken: Marke[] = [];
  for (const { ort, beitraege: hier } of jeOrt.values()) {
    const erster = hier[0];
    const nr = reisetag(erster.datum);
    const tag = nr === null ? '?' : String(nr);
    marken.push({
      lat: ort.lat,
      lng: ort.lng,
      // Die Anzahl gehört sichtbar in den Kreis: Sonst sieht ein Ort mit fünf
      // Einträgen aus wie einer mit einem, und niemand klickt ihn an.
      text: hier.length > 1 ? `${tag}·${hier.length}` : tag,
      farbe: farbeVon(erster.autorId),
      popup: popupHtml(hier, ort, nameVon),
    });
  }
  return marken;
}
