/**
 * Prüfstand für das Rechnen der öffentlichen Tagebuchansicht.
 *
 * Drei Dinge können hier still schiefgehen, und alle drei fallen erst auf, wenn
 * die Seite schon öffentlich ist:
 *
 *   1. Ein Beitrag mit einem Datum außerhalb der Reise verschwindet aus der
 *      Liste. Er ist eingetragen, gespeichert — und nicht zu sehen.
 *   2. Ein Ort aus `places_custom` wird erfunden, weil die Tabelle für Gäste
 *      dicht ist. Dann steht ein Marker an einer Stelle, die niemand angegeben
 *      hat.
 *   3. Nutzertext landet unmaskiert im Popup-HTML.
 *
 * Die Daten unten sind deshalb keine Beispiele, sondern genau diese Fälle.
 */

import { describe, expect, it } from 'vitest';
import type { Beitrag, Person } from '../src/lib/freundebuch.svelte';
import { placeByNr } from '../src/lib/places';
import {
  escape,
  gruppiereNachTag,
  kennzahlen,
  markenFuer,
  ortVon,
  reisetag,
  stationsRoute,
} from '../src/lib/tagebuch';
import { stations, trip } from '../src/lib/trip';

let lauf = 0;

/**
 * Ein Beitrag mit allen Feldern gefüllt; im Test steht nur, was der Fall
 * braucht. `erstellt` läuft mit dem Zähler hoch, damit die Reihenfolge des
 * Anlegens ohne Zutun eindeutig ist — außer dort, wo sie geprüft wird.
 */
function beitrag(teil: Partial<Beitrag> = {}): Beitrag {
  lauf++;
  return {
    id: `b${lauf}`,
    text: '',
    datum: '2026-09-28',
    ortNr: null,
    ortName: null,
    ortLat: null,
    ortLng: null,
    sticker: null,
    bildPfad: null,
    bildUrl: null,
    /*
     * Die Felder aus Migration 0009. Leer als Vorgabe, weil dieser Prüfstand die
     * Gruppierung und die Kartenmarken prüft und nicht die Bilder — ein Test, der
     * hier Bilder setzt, tut es ausdrücklich.
     */
    bildPfade: [],
    bildUrls: [],
    vorlage: null,
    autorId: 'p1',
    // Über `Date.UTC` und nicht als Zeichenkette zusammengesetzt: Ein Zähler als
    // Minutenteil ergibt ab dem 60. Aufruf `08:60:00`, und das macht `Date.parse`
    // zu NaN. `zeitpunkt()` im Modul bildet NaN auf 0 ab — die Sortierung
    // innerhalb einer Gruppe verlöre also still ihre Bedeutung, sobald der Test
    // wächst. So bleibt der Zeitstempel bei jeder Anzahl gültig.
    erstellt: new Date(Date.UTC(2026, 8, 28, 8, 0, lauf)).toISOString(),
    ...teil,
  };
}

const personen: Person[] = [
  { id: 'p1', name: 'Paule', farbe: '#C6402B' },
  { id: 'p2', name: 'Deggel', farbe: '#3E6B5E' },
];

describe('Reisetag', () => {
  it('kennt die Ränder der Reise und was davor und danach liegt', () => {
    // Die vier Werte sind der ganze Punkt: ein Fehler um eins macht aus dem
    // Ankunftstag „vor der Reise" oder schiebt alle Tagnummern um eins.
    expect(reisetag('2026-09-25')).toBeNull();
    expect(reisetag('2026-09-26')).toBe(1);
    expect(reisetag('2026-10-15')).toBe(20);
    expect(reisetag('2026-10-16')).toBeNull();
  });

  it('stimmt mit trip.json überein, statt 20 fest zu behaupten', () => {
    expect(reisetag(trip.start)).toBe(1);
    expect(reisetag(trip.end)).toBe(20);
  });
});

describe('Ort eines Beitrags', () => {
  it('nimmt die mitgeschriebene Angabe des Beitrags', () => {
    // Der Weg aller Beiträge seit Migration 0008 — und der einzige, der auch
    // für Orte aus places_custom trägt.
    const b = beitrag({
      ortNr: 200,
      ortName: 'Airbnb Chūō-ku',
      ortLat: 34.6701,
      ortLng: 135.5012,
    });
    expect(ortVon(b)).toEqual({ name: 'Airbnb Chūō-ku', lat: 34.6701, lng: 135.5012 });
  });

  it('fällt für die festen Orte auf das Reiseband zurück', () => {
    // Beiträge von vor 0008 haben nur die Nummer. Erwartet wird nicht ein
    // fester Name, sondern was places.json sagt — sonst prüft der Test die
    // Daten und nicht die Auflösung.
    const ort = placeByNr(1)!;
    expect(ortVon(beitrag({ ortNr: 1 }))).toEqual({
      name: ort.name,
      lat: ort.lat,
      lng: ort.lng,
    });
  });

  it('erfindet nichts für eigene Orte ohne mitgeschriebenen Namen', () => {
    // Nummer 200 zeigt auf places_custom, und das ist für Gäste dicht. Dort
    // stehen die Unterkünfte. Alles außer null wäre geraten.
    expect(ortVon(beitrag({ ortNr: 200 }))).toBeNull();
    expect(ortVon(beitrag())).toBeNull();
    // Halbe Angabe ohne Koordinate: kein Punkt für die Karte.
    expect(ortVon(beitrag({ ortName: 'Irgendwo', ortLat: null, ortLng: null }))).toBeNull();
  });
});

describe('Gruppierung nach Tag', () => {
  it('verliert keinen Beitrag außerhalb der Reise', () => {
    // Der wichtigste Fall: `datum` ist beim Anlegen frei wählbar. Fiele so ein
    // Beitrag durch, wäre er gespeichert und unsichtbar.
    const gruppen = gruppiereNachTag([
      beitrag({ datum: '2026-09-01' }),
      beitrag({ datum: '2026-09-28' }),
      beitrag({ datum: '2026-11-20' }),
    ]);
    expect(gruppen.flatMap((g) => g.beitraege)).toHaveLength(3);
    expect(gruppen.map((g) => g.lage)).toEqual(['vor', 'reise', 'nach']);
    expect(gruppen[0].titel).toBe('Vor der Reise');
    expect(gruppen[2].titel).toBe('Nach der Reise');
    // Rand-Eimer haben keinen Reisetag — die Ansicht darf sich darauf verlassen.
    expect(gruppen[0].tag).toBeNull();
    expect(gruppen[2].tag).toBeNull();
  });

  it('beschriftet Reisetage mit Nummer, Datum und Station', () => {
    const [g] = gruppiereNachTag([beitrag({ datum: '2026-10-02' })]);
    expect(g.titel).toBe('Tag 7');
    // Kyoto, nicht Kanazawa: der Umzug nach Kanazawa ist erst am 03.10.
    expect(g.untertitel).toBe('Fr 02.10. · Kyoto');
    expect(g.tag?.station.name).toBe('Kyoto');
    expect(g.schluessel).toBe('2026-10-02');
  });

  it('läuft standardmäßig vorwärts und gekippt rückwärts', () => {
    const roh = [
      beitrag({ datum: '2026-10-02' }),
      beitrag({ datum: '2026-09-26' }),
      beitrag({ datum: '2026-09-20' }),
      beitrag({ datum: '2026-10-20' }),
    ];
    expect(gruppiereNachTag(roh).map((g) => g.schluessel)).toEqual([
      'vor',
      '2026-09-26',
      '2026-10-02',
      'nach',
    ]);
    expect(gruppiereNachTag(roh, true).map((g) => g.schluessel)).toEqual([
      'nach',
      '2026-10-02',
      '2026-09-26',
      'vor',
    ]);
  });

  it('sortiert innerhalb eines Tages immer aufsteigend, auch bei gekippten Gruppen', () => {
    // Sonst steht der Abend über dem Frühstück. Die Liste kommt absteigend aus
    // der Datenbank, der Fall ist also der Normalfall und nicht die Ausnahme.
    const abend = beitrag({ datum: '2026-09-28', erstellt: '2026-09-28T21:00:00+00:00' });
    const morgen = beitrag({ datum: '2026-09-28', erstellt: '2026-09-28T07:30:00+00:00' });
    for (const gekippt of [false, true]) {
      const [g] = gruppiereNachTag([abend, morgen], gekippt);
      expect(g.beitraege.map((b) => b.id), `gekippt=${gekippt}`).toEqual([morgen.id, abend.id]);
    }
  });

  it('ordnet einen Rand-Eimer zuerst nach Datum, dann nach Zeitstempel', () => {
    /*
     * Anders als ein Reisetag umfasst ein Rand-Eimer mehrere Daten, und seine
     * Überschrift nennt eine Spanne. Nur nach `erstellt` sortiert widersprächen
     * die Einträge dieser Spanne: Wer am 20.09. über den 10.09. schreibt, stünde
     * vor dem, der am 12.09. über den 12.09. geschrieben hat.
     *
     * Die Reihenfolge des **Anlegens** steht absichtlich gegen die Datumsfolge:
     * `beitrag()` zählt `erstellt` hoch, also hat der 12.09. hier den früheren
     * Zeitstempel. Nach `erstellt` allein käme `[12.09., 10.09.]` heraus — nur
     * die Datumssortierung liefert die Erwartung. (Erst falsch herum benannt
     * gewesen; der Test war dadurch auch ohne die Sortierung grün.)
     */
    const zuerstAngelegt = beitrag({ datum: '2026-09-12' });
    const danachAngelegt = beitrag({ datum: '2026-09-10' });
    const [g] = gruppiereNachTag([zuerstAngelegt, danachAngelegt]);
    expect(g.lage).toBe('vor');
    expect(g.beitraege.map((b) => b.datum)).toEqual(['2026-09-10', '2026-09-12']);
  });

  it('lässt die übergebene Liste unverändert', () => {
    // Die Ansicht bekommt buch.beitraege herein und liest sie an anderer Stelle
    // weiter; ein sort() an der Stelle würde dort die Reihenfolge umstellen.
    const roh = [
      beitrag({ datum: '2026-09-28', erstellt: '2026-09-28T21:00:00+00:00' }),
      beitrag({ datum: '2026-09-28', erstellt: '2026-09-28T07:30:00+00:00' }),
    ];
    const vorher = roh.map((b) => b.id);
    gruppiereNachTag(roh);
    expect(roh.map((b) => b.id)).toEqual(vorher);
  });
});

describe('Marken für die Karte', () => {
  it('lässt Beiträge ohne auflösbaren Ort weg', () => {
    const marken = markenFuer(
      [beitrag({ ortNr: 200 }), beitrag(), beitrag({ ortNr: 1 })],
      () => '#000',
    );
    expect(marken).toHaveLength(1);
  });

  it('bündelt zwei Beiträge am selben Ort zu einer Marke mit beiden im Popup', () => {
    /*
     * Eine Marke je Beitrag wäre falsch: Leaflet errechnet den z-Index aus der
     * Bildschirm-y-Position, bei identischer Koordinate deckt der später gebaute
     * Marker den früheren vollständig ab und der untere nimmt keine Klicks mehr
     * an. Ein geografischer Versatz löst es nicht (0.00016° sind bei Zoomstufe 15
     * rund 3,7 px bei 26 px Markerbreite) und erfindet zudem einen Ort, an dem
     * nichts ist. Beides war einmal gebaut, beides ist widerlegt.
     */
    const ort = { ortName: 'Kuromon-Ichiba', ortLat: 34.6656, ortLng: 135.5061 };
    const marken = markenFuer(
      [beitrag({ ...ort, text: 'erster Gang' }), beitrag({ ...ort, text: 'zweiter Gang' })],
      () => '#000',
    );
    expect(marken).toHaveLength(1);
    // Genau auf dem echten Punkt, kein Versatz.
    expect([marken[0].lat, marken[0].lng]).toEqual([34.6656, 135.5061]);
    // Beide Texte stehen im einen Popup, in der Reihenfolge des Schreibens.
    expect(marken[0].popup).toContain('erster Gang');
    expect(marken[0].popup).toContain('zweiter Gang');
    expect(marken[0].popup.indexOf('erster Gang')).toBeLessThan(
      marken[0].popup.indexOf('zweiter Gang'),
    );
    // Der Ortsname steht einmal, nicht je Eintrag.
    expect(marken[0].popup.match(/Kuromon-Ichiba/g)).toHaveLength(1);
  });

  it('nennt die Anzahl im Kreis, damit ein Ort mit fünf Einträgen nicht wie einer aussieht', () => {
    const ort = { ortName: 'Ryokan', ortLat: 36.2, ortLng: 137.25 };
    const [eine] = markenFuer([beitrag({ ...ort, datum: '2026-09-27' })], () => '#000');
    expect(eine.text).toBe('2');
    const [viele] = markenFuer(
      Array.from({ length: 5 }, () => beitrag({ ...ort, datum: '2026-09-27' })),
      () => '#000',
    );
    expect(viele.text).toBe('2·5');
  });

  it('hält verschiedene Orte auseinander und rührt ihre Koordinaten nicht an', () => {
    // Die Gegenprobe zur Bündelung: Sie darf nur greifen, wo die Koordinate
    // dieselbe ist. Ein Ort, der eingespart oder verschoben wird, ist auf einer
    // Reisekarte der schlimmere Fehler.
    const marken = markenFuer(
      [
        beitrag({ ortName: 'A', ortLat: 34.6656, ortLng: 135.5061 }),
        beitrag({ ortName: 'B', ortLat: 35.0116, ortLng: 135.7681 }),
      ],
      () => '#000',
    );
    expect(marken).toHaveLength(2);
    expect([marken[0].lat, marken[0].lng]).toEqual([34.6656, 135.5061]);
    expect([marken[1].lat, marken[1].lng]).toEqual([35.0116, 135.7681]);
  });

  it('nimmt Farbe und Tagnummer vom ersten Beitrag des Orts', () => {
    // Bei mehreren Personen an einem Ort ließe sich die Farbe nicht auflösen, ohne
    // einen Kreis zu erfinden, der niemandem gehört. Die Namen stehen im Popup.
    const ort = { ortName: 'Kuromon', ortLat: 34.6656, ortLng: 135.5061 };
    const [m] = markenFuer(
      [
        beitrag({ ...ort, autorId: 'p1', datum: '2026-09-27' }),
        beitrag({ ...ort, autorId: 'p2', datum: '2026-09-28' }),
      ],
      (id) => (id === 'p1' ? '#C6402B' : '#3E6B5E'),
      (id) => (id === 'p1' ? 'Paule' : 'Deggel'),
    );
    expect(m.farbe).toBe('#C6402B');
    expect(m.text).toBe('2·2');
    // Beide Namen stehen drin — die Farbe eines allein wäre sonst eine Aussage
    // über den Ort, die nicht stimmt.
    expect(m.popup).toContain('Paule');
    expect(m.popup).toContain('Deggel');
  });

  it('beschriftet mit der Reisetagnummer, außerhalb der Reise mit ?', () => {
    const ort = { ortNr: 1 };
    const [drin] = markenFuer([beitrag({ ...ort, datum: '2026-09-26' })], () => '#000');
    const [draussen] = markenFuer([beitrag({ ...ort, datum: '2026-09-01' })], () => '#000');
    expect(drin.text).toBe('1');
    expect(draussen.text).toBe('?');
  });

  it('nimmt Farbe und Name über die übergebenen Löser', () => {
    const b = beitrag({ ortNr: 1, autorId: 'p2' });
    const [m] = markenFuer(
      [b],
      (id) => (id === 'p2' ? '#3E6B5E' : '#000'),
      (id) => (id === 'p2' ? 'Deggel' : '?'),
    );
    expect(m.farbe).toBe('#3E6B5E');
    expect(m.popup).toContain('Deggel');
  });
});

describe('Maskierung', () => {
  it('maskiert die fünf gefährlichen Zeichen', () => {
    expect(escape('a & b')).toBe('a &amp; b');
    // Das & zuerst: sonst wird aus &lt; ein &amp;lt; und der Text bricht auf.
    expect(escape('<b>')).toBe('&lt;b&gt;');
    expect(escape('er sagte "so" und \'so\'')).toBe(
      'er sagte &quot;so&quot; und &#39;so&#39;',
    );
  });

  it('lässt kein Skript ins Popup', () => {
    // Leaflet nimmt Popups als HTML-Zeichenkette, der Text kommt aus einem
    // Eingabefeld — das ist die einzige XSS-Stelle der Tagebuchansicht.
    const [m] = markenFuer(
      [beitrag({ ortNr: 1, text: '<script>alert(1)</script>' })],
      () => '#000',
    );
    expect(m.popup).not.toContain('<script>');
    expect(m.popup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('zerlegt beim Kürzen kein Surrogatpaar', () => {
    /*
     * 🍣 belegt zwei UTF-16-Einheiten. Ein `slice(0, 180)` auf Einheiten kann das
     * Paar teilen; übrig bliebe ein einsames Surrogat, das der Browser als „�"
     * zeigt. `escape()` räumt das nicht auf, weil es ein gültiges Zeichen ist.
     *
     * Das einzelne `x` am Anfang ist der ganze Test: Ohne es beginnt jedes Paar
     * auf einem geraden Index, der Schnitt bei 180 fällt genau auf eine
     * Paargrenze und teilt nie — die erste Fassung war deshalb auch mit dem
     * naiven `slice()` grün. Mit dem `x` liegen die Paare auf ungeraden Indizes
     * und der Schnitt zerreißt das Paar bei 179.
     */
    const text = `x${'🍣'.repeat(200)}`;
    const [m] = markenFuer([beitrag({ ortNr: 1, text })], () => '#000');
    // Kein alleinstehendes High- oder Low-Surrogat im Ergebnis.
    expect(m.popup).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(m.popup).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    expect(m.popup).toContain('…');
  });

  it('maskiert auch den Ortsnamen, der aus einem Eingabefeld kommt', () => {
    const [m] = markenFuer(
      [beitrag({ ortName: '<i>Ort</i>', ortLat: 35, ortLng: 139 })],
      () => '#000',
    );
    expect(m.popup).toContain('&lt;i&gt;Ort&lt;/i&gt;');
  });

  it('kürzt vor dem Maskieren, damit keine halbe Entität im Popup steht', () => {
    /*
     * Die Zahl ist der ganze Test. Bei 180 Zeichen Popup-Länge steht das `&` an
     * Stelle 178, gefolgt von Leerzeichen und `m`:
     *
     *   richtig (erst kürzen, dann maskieren): 180 Zeichen geschnitten, das `&`
     *     ist drin, danach maskiert → `…x& m…`
     *   falsch (erst maskieren, dann kürzen): `&` wird zu `&amp;` und der Text
     *     wächst um vier Zeichen; der Schnitt bei 180 fällt dann mitten in die
     *     Entität → `…x&am…`
     *
     * Die alte Fassung dieses Tests prüfte auf `toContain('&amp;')` und war
     * damit auch bei falscher Reihenfolge grün, weil `&amp;` als abgeschnittenes
     * `&am` nicht mehr vorkommt — aber auch nichts anderes das Fehlen bemerkte.
     * Geprüft wird deshalb der Wortlaut des Endes.
     */
    const text = `${'x'.repeat(177)}& mehr Text, der wegfällt`;
    const [m] = markenFuer([beitrag({ ortNr: 1, text })], () => '#000');
    expect(m.popup).toContain('x&amp; m…');
    expect(m.popup).not.toContain('&am…');
  });
});

describe('Kennzahlen', () => {
  const beitraege = [
    beitrag({
      autorId: 'p1',
      datum: '2026-09-28',
      bildPfad: 'p1/a.jpg',
      sticker: 'sushi',
      ortName: 'Kuromon-Ichiba',
      ortLat: 34.6656,
      ortLng: 135.5061,
    }),
    beitrag({
      autorId: 'p1',
      datum: '2026-09-28',
      sticker: 'sushi',
      ortName: 'Kuromon-Ichiba',
      ortLat: 34.6656,
      ortLng: 135.5061,
    }),
    beitrag({
      autorId: 'p2',
      datum: '2026-10-02',
      bildPfad: 'p2/b.jpg',
      sticker: 'fuji',
      ortName: 'Fushimi Inari',
      ortLat: 34.9671,
      ortLng: 135.7727,
    }),
    // Vorfreude: zählt bei den Beiträgen mit, aber nicht als Reisetag.
    beitrag({ autorId: 'p1', datum: '2026-09-20' }),
  ];

  it('zählt Beiträge, Fotos, Tage mit Eintrag und Orte', () => {
    const k = kennzahlen(beitraege, personen, '2026-10-02');
    expect(k.anzahl).toBe(4);
    // Am Pfad gezählt, nicht am Link: ein fehlgeschlagener Link soll das Foto
    // nicht wegzählen.
    expect(k.mitFoto).toBe(2);
    // Zwei verschiedene Daten innerhalb der Reise — der 20.09. gehört nicht dazu.
    expect(k.tageMitEintrag).toBe(2);
    // Verschiedene Ortsnamen: zwei Beiträge am Kuromon-Ichiba sind ein Ort.
    expect(k.orte).toBe(2);
  });

  it('rechnet auch mit einem vollen Zeitstempel als heute', () => {
    /*
     * `heute: string` lässt einen Zeitstempel durch, und `new Date().toISOString()`
     * liegt nahe. Ohne Kürzen auf zehn Zeichen ist
     * `'2026-10-02T00:00:00.000Z' < '2026-10-02'` false und
     * `> '2026-10-15'` ebenfalls — die Zahlen fielen still falsch aus, statt zu
     * scheitern. Verglichen wird gegen dasselbe Datum als reines ISO-Datum.
     */
    const rein = kennzahlen([], personen, '2026-10-02');
    const stempel = kennzahlen([], personen, '2026-10-02T09:41:07.123Z');
    expect(stempel.reisetagJetzt).toBe(rein.reisetagJetzt);
    expect(stempel.reisetagJetzt).toBe(7);
    expect(stempel.tageBisAbreise).toBeNull();
    expect(stempel.vorbei).toBe(false);

    // Und am Rand: der Tag nach dem Ende, als Zeitstempel.
    const danach = kennzahlen([], personen, '2026-10-16T00:00:00.000Z');
    expect(danach.vorbei).toBe(true);
    expect(danach.reisetagJetzt).toBeNull();
  });

  it('gibt die festen Zahlen der Reise aus den Daten, nicht aus dem Kopf', () => {
    const k = kennzahlen([], personen, '2026-10-02');
    expect(k.tageGesamt).toBe(20);
    expect(k.naechte).toBe(trip.nights);
    expect(k.stationen).toBe(stations.length);
    expect(k.etappen).toBe(5);
  });

  it('ordnet die Personen absteigend und nennt auch die ohne Beitrag', () => {
    /*
     * Die Eingabereihenfolge ist absichtlich gekippt: `personen` beginnt mit
     * Paule (3 Beiträge), die Liste hier mit Deggel (1) und einer dritten Person
     * ohne Beitrag. Ohne `.sort()` im Modul käme `[Deggel 1, Baldes 0, Paule 3]`
     * heraus — die alte Fassung übergab die Personen in der Reihenfolge, die
     * auch das Ergebnis war, und blieb deshalb ohne Sortierung grün.
     */
    const gekippt: Person[] = [
      personen[1],
      { id: 'p3', name: 'Baldes', farbe: '#A67C33' },
      personen[0],
    ];
    const k = kennzahlen(beitraege, gekippt, '2026-10-02');
    expect(k.jePerson.map((e) => [e.person.name, e.anzahl])).toEqual([
      ['Paule', 3],
      ['Deggel', 1],
      ['Baldes', 0],
    ]);
    // Wer nichts geschrieben hat, fehlt nicht, sondern steht mit null da.
    const leer = kennzahlen([], personen, '2026-10-02');
    expect(leer.jePerson.map((e) => e.anzahl)).toEqual([0, 0]);
  });

  it('nennt den häufigsten Aufkleber und den ersten und letzten Eintrag', () => {
    const k = kennzahlen(beitraege, personen, '2026-10-02');
    expect(k.aufkleber).toEqual({ name: 'sushi', anzahl: 2 });
    // Über alle Beiträge, auch die außerhalb der Reise — sonst stimmte „erster
    // Eintrag" nicht mit dem überein, was auf der Seite oben steht.
    expect(k.erster).toBe('2026-09-20');
    expect(k.letzter).toBe('2026-10-02');
    expect(kennzahlen([], personen, '2026-10-02').aufkleber).toBeNull();
    expect(kennzahlen([], personen, '2026-10-02').erster).toBeNull();
  });

  it('rechnet den Stand der Reise gegen ein übergebenes Heute', () => {
    // Von außen, damit vorher, unterwegs und vorbei prüfbar sind — mit
    // new Date() wäre nur einer der drei Zustände je zu sehen.
    const vorher = kennzahlen([], personen, '2026-09-20');
    expect(vorher.tageBisAbreise).toBe(6);
    expect(vorher.reisetagJetzt).toBeNull();
    expect(vorher.vorbei).toBe(false);

    const unterwegs = kennzahlen([], personen, '2026-10-02');
    expect(unterwegs.reisetagJetzt).toBe(7);
    // Ab dem ersten Reisetag steht die Tagnummer da, kein Herunterzählen mehr.
    expect(unterwegs.tageBisAbreise).toBeNull();
    expect(unterwegs.vorbei).toBe(false);

    // Der letzte Reisetag ist noch nicht vorbei — am 15.10. wird geflogen.
    const letzter = kennzahlen([], personen, '2026-10-15');
    expect(letzter.reisetagJetzt).toBe(20);
    expect(letzter.vorbei).toBe(false);

    const danach = kennzahlen([], personen, '2026-10-16');
    expect(danach.vorbei).toBe(true);
    expect(danach.reisetagJetzt).toBeNull();
    expect(danach.tageBisAbreise).toBeNull();
  });
});

describe('Route der Stationen', () => {
  it('gibt die sechs Stationsmitten in Reihenfolge', () => {
    const route = stationsRoute();
    expect(route).toHaveLength(6);
    expect(route[0]).toEqual([stations[0].center[0], stations[0].center[1]]);
    expect(route[5]).toEqual([stations[5].center[0], stations[5].center[1]]);
  });

  it('gibt neue Tupel heraus, damit Leaflet stations.json nicht anfasst', () => {
    const route = stationsRoute();
    expect(route[0]).not.toBe(stations[0].center);
  });
});
