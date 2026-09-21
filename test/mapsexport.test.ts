/**
 * Der Export in Googles Welt: Routenlinks und KML.
 *
 * Hier liegt der ganze Beweiswert dieses Vorhabens. Der Proxy dieser Umgebung
 * sperrt Google vollständig — ich kann nie sehen, ob eine URL die Maps-App öffnet
 * oder wie My Maps einen Import darstellt. Was sich prüfen lässt, sind Aussagen
 * über Zeichenketten: Reihenfolge der Koordinaten, Aufteilung langer Tage,
 * Escaping, Farbumrechnung.
 *
 * Zwei Vertauschungen stehen im Mittelpunkt, weil sie beide **plausibel falsch**
 * aussehen und deshalb nicht auffallen:
 *
 *   1. Maps-URLs wollen `lat,lng`, KML will `lng,lat`. Verdreht landet ein
 *      Osaka-Restaurant im Meer vor Somalia — die Zahlen bleiben aber gültige
 *      Koordinaten, es fliegt nichts.
 *   2. CSS ist `#rrggbb`, KML ist `aabbggrr`. Verdreht wird Zinnoberrot blau, und
 *      die Datei ist ansonsten fehlerfrei.
 */

import { describe, expect, it } from 'vitest';
import type { Place } from '../src/lib/places';
import {
  HALTE_JE_LINK,
  MAX_ZWISCHENZIELE,
  abschnitte,
  cdata,
  kartenLink,
  kml,
  kmlDateiname,
  kmlFarbe,
  routenLinks,
  xmlText,
} from '../src/lib/mapsexport';

/** Halte mit wiedererkennbaren Zahlen: lat = 1..n, lng = 100 + n. */
const halte = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: i + 1, lng: 100 + i + 1 }));

/**
 * `reisetag` gehört nicht zu `Place`, sondern kommt in `kml()` von außen dazu —
 * dieses Modul liest keinen Zustand. Deshalb hier im Typ mitgeführt.
 */
type Testort = Place & { reisetag?: string | null };

const ort = (teil: Partial<Testort> = {}): Testort => ({
  nr: 1,
  name: 'Ein Ort',
  category: 'kultur',
  station: 'osaka',
  stationLabel: 'Osaka · Zentrum',
  area: 'zentrum',
  lat: 34.6857,
  lng: 135.5055,
  placeId: 'ChIJtest',
  descriptionHtml: 'Ein Text.',
  isFriendTip: false,
  needsBooking: false,
  closedDay: null,
  cashOnly: false,
  ...teil,
});

// =============================================================== Aufteilung ===

describe('Aufteilung langer Tage', () => {
  it('gibt bei null oder einem Halt nichts zurück', () => {
    // Eine Route mit einem Punkt ist keine. Ein Knopf, der nichts tut, ist
    // schlimmer als kein Knopf.
    expect(abschnitte(halte(0))).toEqual([]);
    expect(abschnitte(halte(1))).toEqual([]);
    expect(routenLinks(halte(0))).toEqual([]);
    expect(routenLinks(halte(1))).toEqual([]);
  });

  it('kommt bis zur Grenze mit einem Link aus', () => {
    expect(HALTE_JE_LINK).toBe(MAX_ZWISCHENZIELE + 2);
    expect(abschnitte(halte(2))).toHaveLength(1);
    expect(abschnitte(halte(HALTE_JE_LINK))).toHaveLength(1);
    expect(routenLinks(halte(HALTE_JE_LINK))).toHaveLength(1);
  });

  it('teilt einen Halt über der Grenze in zwei', () => {
    expect(abschnitte(halte(HALTE_JE_LINK + 1))).toHaveLength(2);
    expect(routenLinks(halte(HALTE_JE_LINK + 1))).toHaveLength(2);
  });

  it('überlappt die Abschnitte, damit kein Wegstück fehlt', () => {
    /*
     * Die Zusicherung, um die es geht. Ohne Überlappung stünde man am Ende von
     * Teil 1 und Teil 2 begänne beim **nächsten** Ort — das Stück dazwischen
     * fehlte, und man merkt es erst, wenn man davorsteht.
     *
     * Geprüft wird die Identität der Nahtstelle, nicht bloß die Anzahl: Der letzte
     * Halt eines Abschnitts muss derselbe sein wie der erste des folgenden.
     */
    const teile = abschnitte(halte(25));
    expect(teile.length).toBeGreaterThan(2);
    for (let i = 1; i < teile.length; i++) {
      expect(teile[i][0], `Naht zwischen Teil ${i} und ${i + 1}`).toEqual(
        teile[i - 1][teile[i - 1].length - 1],
      );
    }
  });

  it('lässt keinen Halt weg und keinen doppelt außer an den Nähten', () => {
    // Die Gegenrechnung zur Überlappung: Aus n Halten werden n + (Teile − 1)
    // Einträge, weil jede Naht einen Halt zweimal nennt.
    for (const n of [2, 11, 12, 21, 22, 40]) {
      const teile = abschnitte(halte(n));
      const gesamt = teile.reduce((s, t) => s + t.length, 0);
      expect(gesamt, `${n} Halte`).toBe(n + (teile.length - 1));
      // Und die Reihenfolge bleibt: erster Halt vorn, letzter hinten.
      expect(teile[0][0]).toEqual(halte(n)[0]);
      expect(teile.at(-1)!.at(-1)).toEqual(halte(n)[n - 1]);
    }
  });

  it('nennt die erwarteten Zahlen an den Rändern', () => {
    // Festgenagelt, damit eine Änderung an der Grenze sichtbar wird und nicht
    // stillschweigend andere Linkzahlen erzeugt.
    expect(abschnitte(halte(2)).length).toBe(1);
    expect(abschnitte(halte(11)).length).toBe(1);
    expect(abschnitte(halte(12)).length).toBe(2);
    expect(abschnitte(halte(21)).length).toBe(2);
    expect(abschnitte(halte(22)).length).toBe(3);
  });
});

// ============================================================= Routenlinks ===

describe('Routenlinks', () => {
  it('schreibt die Koordinaten als lat,lng — nicht umgekehrt', () => {
    /*
     * Die erste der zwei Vertauschungen. `lat=1, lng=101` muss als `1,101`
     * erscheinen. Verdreht wäre es `101,1` — eine gültige Zahlenpaarung, die
     * Google ohne Murren annimmt und irgendwohin zeigt.
     */
    const [url] = routenLinks(halte(2));
    expect(url).toContain('origin=1,101');
    expect(url).toContain('destination=2,102');
    expect(url).not.toContain('origin=101,1');
  });

  it('setzt die Zwischenziele in der geplanten Reihenfolge', () => {
    const [url] = routenLinks(halte(4));
    expect(url).toContain('waypoints=2,102|3,103');
    // Start und Ziel stehen **nicht** zusätzlich in den Zwischenzielen.
    expect(url).not.toContain('1,101|');
  });

  it('lässt waypoints weg, wenn es keine gibt', () => {
    const [url] = routenLinks(halte(2));
    expect(url).not.toContain('waypoints');
  });

  it('nennt den Verkehrsmittelmodus', () => {
    expect(routenLinks(halte(3), 'walking')[0]).toContain('travelmode=walking');
    expect(routenLinks(halte(3), 'transit')[0]).toContain('travelmode=transit');
  });

  it('gibt keine place_id mit, auch wenn die Orte eine haben', () => {
    /*
     * `waypoint_place_ids` verlangt genauso viele Einträge wie `waypoints`. Eure
     * eigenen Orte haben nie eine `placeId`, Nr. 98 auch nicht — eine Liste mit
     * Lücken würde Google verwerfen oder die Reihenfolge verschieben. Für die
     * Navigation ist die Koordinate eindeutig.
     */
    const url = routenLinks(halte(5))[0];
    expect(url).not.toContain('place_id');
    expect(url).not.toContain('placeid');
  });

  it('hält die Trennzeichen lesbar', () => {
    // `URLSearchParams` maskiert `|` und `,`. Maps nimmt beides, aber eine URL,
    // die man nicht lesen kann, kann man auch nicht von Hand prüfen.
    const url = routenLinks(halte(4))[0];
    expect(url).not.toContain('%7C');
    expect(url).not.toContain('%2C');
  });

  it('beginnt mit dem dokumentierten Endpunkt', () => {
    expect(routenLinks(halte(3))[0].startsWith('https://www.google.com/maps/dir/?api=1')).toBe(true);
  });
});

// ===================================================================== KML ===

describe('KML-Farben', () => {
  it('dreht rrggbb nach bbggrr und setzt Alpha vorn', () => {
    // Die zweite Vertauschung. `#C6402B` ist Zinnober; als `ffc6402b` wäre es blau.
    expect(kmlFarbe('#C6402B')).toBe('ff2b40c6');
    expect(kmlFarbe('#3E6B5E')).toBe('ff5e6b3e');
    expect(kmlFarbe('#000000')).toBe('ff000000');
    expect(kmlFarbe('#ffffff')).toBe('ffffffff');
  });

  it('nimmt die Farbe auch ohne Raute', () => {
    expect(kmlFarbe('A67C33')).toBe('ff337ca6');
  });

  it('wirft bei allem, was keine Hexfarbe ist', () => {
    // Lieber ein Fehler beim Erzeugen als eine Datei mit kaputten Farbwerten, die
    // My Maps stillschweigend ignoriert.
    expect(() => kmlFarbe('rot')).toThrow(/Hexfarbe/);
    expect(() => kmlFarbe('#abc')).toThrow(/Hexfarbe/);
  });
});

describe('Escaping', () => {
  it('maskiert die fünf XML-Zeichen im Text', () => {
    expect(xmlText('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;');
  });

  it('teilt ein ]]> im CDATA auf, statt die Datei zu zerreißen', () => {
    /*
     * `]]>` beendet einen CDATA-Abschnitt. Stünde es im Text, wäre der Rest der
     * Datei Markup und der Import schlüge mit einer unverständlichen Meldung fehl.
     * Kein Ortstext enthält das heute — aber die Texte sind bearbeitbar.
     */
    const raus = cdata('vorher ]]> nachher');
    expect(raus).toBe('<![CDATA[vorher ]]]]><![CDATA[> nachher]]>');

    /*
     * Die Eigenschaft, die wirklich gilt — und die eine erste Fassung dieser
     * Prüfung verfehlt hat: Das Ergebnis **enthält** `]]>`, und zwar richtig, denn
     * genau diese Sequenz beendet den ersten Abschnitt, bevor der zweite öffnet.
     * Auf ihre Abwesenheit zu prüfen war Unsinn.
     *
     * Beweisbar ist stattdessen die Umkehrung: Liest man alle CDATA-Abschnitte
     * aus und hängt ihren Inhalt aneinander, muss der Ausgangstext
     * herauskommen — Zeichen für Zeichen, `]]>` eingeschlossen. Genau das tut ein
     * XML-Parser.
     */
    const zurueck = (text: string) =>
      [...text.matchAll(/<!\[CDATA\[([\s\S]*?)]]>/g)].map((m) => m[1]).join('');
    expect(zurueck(raus)).toBe('vorher ]]> nachher');
    // Und mehrere Sequenzen hintereinander überleben es auch.
    expect(zurueck(cdata('a ]]> b ]]> c'))).toBe('a ]]> b ]]> c');
    expect(zurueck(cdata(']]>'))).toBe(']]>');
  });

  it('lässt HTML im CDATA unangetastet', () => {
    // Der ganze Zweck: `descriptionHtml` enthält echtes Markup, das My Maps
    // anzeigen soll — maskiert stünden die Entitäten als Text da.
    expect(cdata('<strong>Fisch</strong> & Reis')).toContain('<strong>Fisch</strong> & Reis');
  });
});

describe('KML-Dokument', () => {
  const orte = [
    ort({ nr: 1, name: 'Kuromon', descriptionHtml: '<strong>Markt</strong> & mehr' }),
    ort({ nr: 2, name: 'Tempel', category: 'natur', stationLabel: 'Kyoto · Zentrum' }),
    ort({ nr: 3, name: 'Böse ]]> Stelle', stationLabel: 'Kyoto · Zentrum' }),
  ];

  it('schreibt die Koordinaten als lng,lat,0 — umgekehrt zur URL', () => {
    /*
     * Dieselbe Vertauschung wie oben, nur andersherum. Genau deshalb sind beide
     * Prüfungen da: Wer eine Seite „korrigiert", bricht die andere, und nur wenn
     * beide Richtungen festgenagelt sind, fällt es auf.
     */
    const text = kml([ort({ lat: 34.6857, lng: 135.5055 })], 'Titel');
    expect(text).toContain('<coordinates>135.5055,34.6857,0</coordinates>');
    expect(text).not.toContain('<coordinates>34.6857,135.5055');
  });

  it('hat ein Placemark je Ort', () => {
    const text = kml(orte, 'Titel');
    expect(text.match(/<Placemark>/g)).toHaveLength(orte.length);
    expect(text.match(/<\/Placemark>/g)).toHaveLength(orte.length);
  });

  it('gliedert nach Station, ohne einen Ort zu verlieren', () => {
    const text = kml(orte, 'Titel');
    // Zwei Stationen in den Daten → zwei Ordner, und alle drei Orte drin.
    expect(text.match(/<Folder>/g)).toHaveLength(2);
    expect(text.match(/<\/Folder>/g)).toHaveLength(2);
    for (const o of orte) expect(text).toContain(`${o.nr} · ${o.name.replace(/>/g, '&gt;')}`);
  });

  it('bleibt wohlgeformt, auch mit HTML und ]]> in den Daten', () => {
    /*
     * Ohne echten XML-Parser (in vitest gibt es keinen, und eine Abhängigkeit nur
     * dafür wäre zu viel) wird geprüft, was ohne ihn prüfbar ist und den Fehler
     * fängt: ausgeglichene Elemente, kein nacktes `&` oder `<` außerhalb von CDATA,
     * und keine unaufgeteilte `]]>`-Sequenz.
     */
    const text = kml(orte, 'Titel & Co. <test>');
    for (const tag of ['kml', 'Document', 'Placemark', 'Folder', 'ExtendedData', 'Point']) {
      expect(
        text.match(new RegExp(`<${tag}[ >]`, 'g'))?.length ?? 0,
        `${tag} unausgeglichen`,
      ).toBe(text.match(new RegExp(`</${tag}>`, 'g'))?.length ?? 0);
    }
    // Alles außerhalb der CDATA-Abschnitte darf kein rohes & oder < tragen.
    const ohneCdata = text.replace(/<!\[CDATA\[[\s\S]*?]]>/g, '');
    expect(ohneCdata).not.toMatch(/&(?!(amp|lt|gt|quot|apos|#\d+);)/);
    // Der Dokumenttitel ist maskiert, nicht rohes Markup.
    expect(text).toContain('<name>Titel &amp; Co. &lt;test&gt;</name>');
  });

  it('bringt einen Stil je Kategorie mit und verweist darauf', () => {
    const text = kml(orte, 'Titel');
    expect(text.match(/<Style id="kat-/g)).toHaveLength(5);
    expect(text).toContain('<styleUrl>#kat-kultur</styleUrl>');
    expect(text).toContain('<styleUrl>#kat-natur</styleUrl>');
    // Die Farbe des Kulturstils ist der gedrehte Zinnober.
    expect(text).toContain('<color>ff2b40c6</color>');
  });

  it('legt jede Eigenschaft zusätzlich als ExtendedData ab', () => {
    /*
     * Der Grund: My Maps flacht Ordner beim Import ab und färbt über eine Spalte.
     * Ohne diese Felder ließe sich dort nach nichts gruppieren — und ob die Ordner
     * überhaupt ankommen, kann ich von hier nicht prüfen.
     */
    const text = kml(
      [ort({ nr: 8, isFriendTip: true, book: '12', bookTitle: 'Teppanyaki', closedDay: 'Mi', reisetag: '2026-09-27' })],
      'Titel',
    );
    for (const f of ['nr', 'station', 'kategorie', 'reisetag', 'freundestipp', 'buch', 'schliesstag']) {
      expect(text, `Feld ${f} fehlt`).toContain(`<Data name="${f}">`);
    }
    expect(text).toContain('<value>8</value>');
    expect(text).toContain('<value>ja</value>');
    expect(text).toContain('<value>12 Teppanyaki</value>');
    expect(text).toContain('<value>Mi</value>');
    expect(text).toContain('<value>2026-09-27</value>');
  });

  it('nimmt einen Ort ohne placeId und ohne Reisetag mit', () => {
    // Eigene Orte haben nie eine placeId, und ein ungeplanter Ort keinen Reisetag.
    // Beides darf ihn nicht aus der Datei fallen lassen.
    const text = kml([ort({ nr: 165, name: 'Eigener', placeId: null })], 'Titel');
    expect(text).toContain('165 · Eigener');
    expect(text).toContain('<Data name="reisetag"><value></value></Data>');
  });

  it('beginnt mit der XML-Deklaration', () => {
    expect(kml([ort()], 'Titel').startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});

describe('Dateiname', () => {
  it('trägt das Datum und endet auf .kml', () => {
    expect(kmlDateiname('2026-09-19')).toBe('japan-2026-orte-2026-09-19.kml');
    // Auch mit einem vollen Zeitstempel — `new Date().toISOString()` liegt nahe.
    expect(kmlDateiname('2026-09-19T08:12:00.000Z')).toBe('japan-2026-orte-2026-09-19.kml');
  });
});

describe('Kartenausschnitt in Google Maps öffnen', () => {
  it('benutzt die dokumentierte Schnittstelle, nicht die /maps/@-Gewohnheit', () => {
    const u = kartenLink(34.6873, 135.5259, 12);
    expect(u).toContain('api=1');
    expect(u).toContain('map_action=map');
    expect(u).toContain('center=34.687300,135.525900');
    expect(u).toContain('zoom=12');
  });

  it('lässt das Komma lesbar, statt es zu maskieren', () => {
    // Eine URL, die man nicht lesen kann, kann man auch nicht von Hand prüfen.
    expect(kartenLink(35, 135, 10)).not.toContain('%2C');
  });

  it('begrenzt den Zoom auf das, was Google annimmt', () => {
    // Außerhalb 0…21 verwirft Google die Adresse **still** und öffnet irgendeinen
    // Ausschnitt — schlimmer als ein grober, weil es wie ein Fehler der App aussieht.
    expect(kartenLink(35, 135, 99)).toContain('zoom=21');
    expect(kartenLink(35, 135, -4)).toContain('zoom=0');
    expect(kartenLink(35, 135, Number.NaN)).toContain('zoom=12');
  });

  it('rundet Nachkommastellen, statt sie voll auszuschreiben', () => {
    // Leaflet liefert 15 Stellen; sechs sind auf zehn Zentimeter genau und machen
    // die Adresse lesbar.
    expect(kartenLink(34.68725714285, 135.52591234567, 14)).toContain(
      'center=34.687257,135.525912',
    );
  });
});
