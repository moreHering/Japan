/**
 * Export in Googles Welt: Tagesroute als Maps-URL, Orte als KML.
 *
 * ## Warum es keine echte Schnittstelle gibt
 *
 * Gefragt war, die Karte in der Google-Maps-App automatisch aktuell zu halten.
 * Das geht nicht, und zwar nicht aus Nachlässigkeit: Google hat **keine**
 * Schreib-Schnittstelle für My Maps — die Maps Engine API, die das konnte, wurde
 * Anfang 2016 abgeschaltet —, und für die gespeicherten Listen in der App gab es
 * nie eine. Niemand kann Orte in eine fremde Maps-App schreiben.
 *
 * Was Google anbietet, sind **Maps URLs**: dokumentiert, kostenlos, ohne
 * Schlüssel, und sie öffnen auf dem Telefon die App. Dieses Modul benutzt davon
 * den `dir`-Endpunkt für eine Route und erzeugt daneben eine KML zum Importieren.
 *
 * ## Warum reine Logik in einer eigenen Datei
 *
 * Dasselbe Muster wie `tagebuch.ts` und `karte.ts`: Der Proxy dieser Umgebung
 * sperrt Google vollständig — ich kann **nie** prüfen, ob eine URL die App
 * wirklich öffnet oder wie My Maps einen Import darstellt. Was hier steht, ist
 * dafür restlos in vitest beweisbar: Reihenfolge, Aufteilung, Escaping,
 * Farbumrechnung. Was in den Komponenten bleibt, wäre es nicht.
 *
 * ## Die zwei Umkehrungen, an denen man sich schneidet
 *
 * 1. **Koordinaten.** Maps-URLs wollen `lat,lng`, KML will `lng,lat`. Diese
 *    Vertauschung steht schon im ersten Plan des Projekts als Warnung; sie ist der
 *    klassische Fehler dieses Datensatzes und fällt nicht auf, weil beide Zahlen
 *    plausibel aussehen — ein Ort landet dann irgendwo im Meer vor Somalia.
 * 2. **Farben.** CSS ist `#rrggbb`, KML ist `aabbggrr` — Alpha vorn und Rot und
 *    Blau getauscht. Ein Zinnoberrot wird sonst blau.
 */

import { CATEGORIES, type Category, type Place } from './places';

// ============================================================== Maps-Routen ===

export type Modus = 'walking' | 'transit' | 'driving' | 'bicycling';

/**
 * Wie viele Zwischenziele eine Maps-URL verträgt.
 *
 * Googles Doku nennt **neun**; mit Start und Ziel sind das elf Halte je Link.
 * Als benannte Konstante, weil ich die Zahl aus dieser Umgebung nicht nachlesen
 * kann — der Proxy sperrt Google. Sie ist aus dem Gedächtnis, und wenn sie falsch
 * ist, ist hier die einzige Stelle, an der sie steht. Die Prüfungen belegen die
 * **Aufteilungslogik**, nicht die Richtigkeit dieser Zahl.
 */
export const MAX_ZWISCHENZIELE = 9;

/** Halte je Link: Start + Zwischenziele + Ziel. */
export const HALTE_JE_LINK = MAX_ZWISCHENZIELE + 2;

export type Halt = { lat: number; lng: number };

/** `lat,lng` — die Reihenfolge, die Maps-URLs wollen. */
const urlKoordinate = (h: Halt) => `${h.lat},${h.lng}`;

/**
 * Die Halte in Abschnitte teilen, die **überlappen**.
 *
 * Der letzte Halt eines Abschnitts ist der erste des nächsten. Ohne diese
 * Überlappung fehlte genau das Stück zwischen Halt 11 und Halt 12 — man würde am
 * Ende von Teil 1 stehen und Teil 2 begänne beim nächsten Ort, ohne den Weg
 * dorthin. Auf einer Reise ist das die Art Lücke, die man erst merkt, wenn man
 * davorsteht.
 *
 * Deshalb ist der Zugewinn je Abschnitt `HALTE_JE_LINK - 1` und nicht
 * `HALTE_JE_LINK`.
 */
export function abschnitte<T>(halte: T[], groesse = HALTE_JE_LINK): T[][] {
  if (halte.length <= 1) return [];
  if (halte.length <= groesse) return [halte];
  const raus: T[][] = [];
  for (let i = 0; i < halte.length - 1; i += groesse - 1) {
    raus.push(halte.slice(i, i + groesse));
  }
  return raus;
}

/**
 * Maps-URLs für eine Route über die übergebenen Halte, in dieser Reihenfolge.
 *
 * Gibt **eine Liste** zurück: Bei mehr als `HALTE_JE_LINK` Halten sind es mehrere
 * Links, die aneinander anschließen. Bei null oder einem Halt eine leere Liste —
 * eine Route mit einem Punkt ist keine Route, und ein Knopf, der nichts tut, ist
 * schlimmer als kein Knopf.
 *
 * **Ausschließlich Koordinaten, keine `place_id`.** Googles
 * `waypoint_place_ids`-Parameter verlangt genauso viele Einträge wie `waypoints`;
 * eure selbst angelegten Orte haben nie eine `placeId` und Nr. 98 („Ashinoko
 * Club") auch nicht. Eine Liste mit Lücken würde Google verwerfen oder die
 * Reihenfolge verschieben. Für die Navigation ist die Koordinate eindeutig — die
 * `placeId` bringt die schönere POI-Karte, und die braucht man auf einer Route
 * nicht. (Für einen **einzelnen** Ort nimmt `maps()` in `paths.ts` sie weiterhin
 * mit, dort ist sie richtig.)
 */
export function routenLinks(halte: Halt[], modus: Modus = 'walking'): string[] {
  return abschnitte(halte).map((teil) => {
    const p = new URLSearchParams({
      api: '1',
      origin: urlKoordinate(teil[0]),
      destination: urlKoordinate(teil[teil.length - 1]),
      travelmode: modus,
    });
    const zwischen = teil.slice(1, -1);
    if (zwischen.length) p.set('waypoints', zwischen.map(urlKoordinate).join('|'));
    /*
     * `toString()` maskiert `|` zu `%7C` und `,` zu `%2C`. Beides akzeptiert Maps,
     * aber die URL wird unlesbar, und eine URL, die man nicht lesen kann, kann man
     * auch nicht von Hand prüfen. Deshalb zurückgedreht — es sind genau die zwei
     * Zeichen, die hier als Trenner gemeint sind.
     */
    return `https://www.google.com/maps/dir/?${p.toString()}`
      .replace(/%7C/g, '|')
      .replace(/%2C/g, ',');
  });
}

// ====================================================================== KML ===

/**
 * `#rrggbb` → KML `aabbggrr`.
 *
 * Alpha kommt vorn, Rot und Blau sind getauscht. Ohne die Vertauschung wird das
 * Zinnoberrot der Kulturorte blau — sichtbar, aber schwer als Ursache zu erkennen,
 * weil die Datei ansonsten fehlerfrei ist.
 */
export function kmlFarbe(hex: string, alpha = 'ff'): string {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`keine Hexfarbe: ${hex}`);
  const rr = h.slice(0, 2);
  const gg = h.slice(2, 4);
  const bb = h.slice(4, 6);
  return `${alpha}${bb}${gg}${rr}`.toLowerCase();
}

/** Für Text in Elementen und Attributen. */
export function xmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Text in einen CDATA-Abschnitt, damit HTML darin stehen darf.
 *
 * `descriptionHtml` enthält echtes Markup — `<strong>`, `<br>`, `&`. In einem
 * normalen Element müsste jedes Zeichen maskiert werden und My Maps zeigte die
 * Entitäten als Text. CDATA lässt es durch.
 *
 * Die eine Sequenz, die CDATA **nicht** enthalten darf, ist `]]>`: Sie beendet den
 * Abschnitt, und der Rest der Datei wäre Markup. Aufgeteilt in zwei Abschnitte,
 * wie es der XML-Standard vorsieht. Kein Ortstext enthält das heute — aber die
 * Texte sind bearbeitbar, und ein Ort, dessen Name die ganze Datei zerreißt, wäre
 * ein Fehler, den man erst beim Import sieht.
 */
export function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

type KmlOrt = Place & { reisetag?: string | null };

/** `lng,lat,0` — die Reihenfolge, die KML will. Umgekehrt zu den Maps-URLs. */
const kmlKoordinate = (o: Halt) => `${o.lng},${o.lat},0`;

/**
 * Die Orte als KML, gegliedert nach Station.
 *
 * **Zur Gliederung eine Einschränkung, die genannt sein muss:** Google Earth
 * achtet auf `<Folder>`, My Maps flacht beim Import ab und färbt über eine Spalte.
 * Deshalb steht jede Eigenschaft **zusätzlich** in `<ExtendedData>` — damit lässt
 * sich in My Maps nach Station, Kategorie, Reisetag oder Freundestipp gruppieren
 * und einfärben. Wie der Import am Ende aussieht, kann ich nicht sagen: Aus dieser
 * Umgebung ist My Maps nicht erreichbar.
 *
 * `reisetag` ist freiwillig und kommt von außen — dieses Modul liest keinen
 * Zustand.
 */
export function kml(orte: KmlOrt[], titel: string): string {
  const stationen = [...new Set(orte.map((o) => o.stationLabel))];
  const zeilen: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '<Document>',
    `<name>${xmlText(titel)}</name>`,
  ];

  // Ein Stil je Kategorie, in den Projektfarben.
  for (const c of CATEGORIES) {
    zeilen.push(
      `<Style id="kat-${c.key}">`,
      `<IconStyle><color>${kmlFarbe(c.color)}</color><scale>1.1</scale></IconStyle>`,
      `<LabelStyle><color>${kmlFarbe(c.color)}</color></LabelStyle>`,
      '</Style>',
    );
  }

  for (const station of stationen) {
    zeilen.push('<Folder>', `<name>${xmlText(station)}</name>`);
    for (const o of orte.filter((x) => x.stationLabel === station)) {
      zeilen.push(
        '<Placemark>',
        `<name>${xmlText(`${o.nr} · ${o.name}`)}</name>`,
        `<description>${cdata(o.descriptionHtml)}</description>`,
        `<styleUrl>#kat-${o.category}</styleUrl>`,
        '<ExtendedData>',
        feld('nr', String(o.nr)),
        feld('station', o.stationLabel),
        feld('kategorie', kategorieName(o.category)),
        feld('reisetag', o.reisetag ?? ''),
        feld('freundestipp', o.isFriendTip ? 'ja' : ''),
        feld('buch', o.book ? `${o.book} ${o.bookTitle ?? ''}`.trim() : ''),
        feld('schliesstag', o.closedDay ?? ''),
        '</ExtendedData>',
        `<Point><coordinates>${kmlKoordinate(o)}</coordinates></Point>`,
        '</Placemark>',
      );
    }
    zeilen.push('</Folder>');
  }

  zeilen.push('</Document>', '</kml>');
  return zeilen.join('\n');
}

const feld = (name: string, wert: string) =>
  `<Data name="${xmlText(name)}"><value>${xmlText(wert)}</value></Data>`;

const kategorieName = (k: Category) => CATEGORIES.find((c) => c.key === k)?.short ?? k;

/** Dateiname mit Datum, wie beim Plan-Export in `Organisation.svelte`. */
export function kmlDateiname(heute: string): string {
  return `japan-2026-orte-${heute.slice(0, 10)}.kml`;
}
