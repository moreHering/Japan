/**
 * Der Wächter über die Ortsdaten.
 *
 * Die Grundregel dieses Projekts steht in `PRUEFLISTE.md`: *Auf der Reise ist ein
 * falsch markierter Ort schlimmer als ein fehlender.* Ein fehlender Ort fällt beim
 * Planen auf. Ein Ort mit falscher Koordinate fällt auf, wenn man davorsteht — vor
 * einem Parkhaus, zwei Straßen vom Lokal entfernt, mit drei Leuten im Schlepptau.
 *
 * Die 164 Orte sind heute sauber. Diese Datei ändert daran nichts; sie hält es
 * fest. Sie ist ein **Regressionswächter**, kein Reparaturwerkzeug: Sie schlägt an,
 * wenn jemand in `data/source/` etwas verschiebt, `npm run data` neu läuft und
 * dabei eine Koordinate, eine Nummer oder eine Station kaputtgeht.
 *
 * ## Was sie nicht erreicht, und das ist keine kleine Einschränkung
 *
 * **Eigene Orte ab Nr. 165, Korrekturen und Ausblendungen.** Die liegen im
 * localStorage und in Supabase, nicht in diesen Dateien. Wer in der App eine
 * falsche Koordinate einträgt — etwa aus einem Maps-Link, der auf den
 * Kartenmittelpunkt statt den Ort zeigt —, bekommt von hier **keine** Warnung. Die
 * einzige Prüfung, die das könnte, wäre eine Selbstprüfung im Gerät. Die gibt es
 * nicht. Wer sich auf diesen grünen Haken verlässt, verlässt sich auf weniger, als
 * er denkt.
 *
 * ## Warum kein einfacher Kilometerdeckel
 *
 * Der naheliegende Gedanke — „ein Ort liegt nicht weiter als X km von seiner
 * Station" — ist nachgemessen und schwach: Nikko (Nr. 155–157) liegt **119 km** von
 * Tokios Mitte, Himeji-jo 76 km von Osakas. Beides sind richtige Tagesausflüge. Ein
 * Deckel müsste also über 120 km liegen, und dann fängt er fast nichts mehr.
 *
 * Der zweite naheliegende Gedanke war besser und ist trotzdem falsch: „Jeder Ort
 * liegt näher an seiner eigenen Station als an jeder anderen" bräuchte **keine**
 * erfundene Zahl. Er hält aber nicht — sechs Orte verletzen ihn zu Recht, weil die
 * Zuordnung beschreibt, von wo aus man hinfährt, und nicht die Geometrie. Nara
 * liegt näher an Osaka, wird aber von Kyoto aus besucht.
 *
 * Deshalb: die Regel **mit** einer benannten Ausnahmeliste, und eine Prüfung, die
 * die Liste am Verrotten hindert. Eine Ausnahmeliste, die niemand aufräumt, wird
 * mit der Zeit zur Generalerlaubnis.
 */

import { describe, expect, it } from 'vitest';
import { alleOrte, CATEGORIES, type Place } from '../src/lib/places';
import { inJapan } from '../src/lib/koordinaten';
import stationen from '../src/data/stations.json';

// ============================================================== Die Rahmen ====

/**
 * Der engere Rahmen für die 164 Orte aus dem Reiseband.
 *
 * Gemessen an den heutigen Daten: lat 34,21 (Nr. 35 Eko-in auf dem Kōya-san) bis
 * 36,76 (Nr. 156 Nikko), lng 134,69 (Himeji) bis 139,81 (Nikko). Das ist ein
 * Streifen Honshū. Mit Luft nach allen Seiten wird daraus 33–38 °N und 133–141 °O.
 *
 * Bewusst **enger** als `inJapan()` aus `koordinaten.ts` (20–46 / 122–154, das
 * schließt Okinawa und Ogasawara ein): Eine Koordinate aus Hokkaidō oder Kyūshū
 * ist auf dieser Reise mit Sicherheit ein Fehler, `inJapan` würde sie durchlassen.
 *
 * Für **eigene** Orte gilt weiter `inJapan` — dort kann niemand eine Reiseroute
 * voraussetzen, und dieser Rahmen prüft ohnehin nur die Dateien.
 */
const REISERAHMEN = { latVon: 33, latBis: 38, lngVon: 133, lngBis: 141 };

/** Entfernung in Kilometern, Haversine. Für Größenordnungen genau genug. */
function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLng = r(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const stationVon = (slug: string) => stationen.find((s) => s.slug === slug);

/** Die nächstgelegene Station zu einer Koordinate, nach Luftlinie. */
function naechsteStation(o: Place) {
  return stationen
    .map((s) => ({ slug: s.slug, km: km(s.center[0], s.center[1], o.lat, o.lng) }))
    .sort((a, b) => a.km - b.km)[0];
}

/**
 * Die sechs Orte, deren nächste Station nicht die eigene ist — **und zwar zu
 * Recht**. Jeder Eintrag ist ein Tagesausflug, bei dem man von der einen Station
 * aus zu einem Ort fährt, der geografisch näher an einer anderen liegt.
 *
 * Wer hier etwas einträgt, behauptet damit: „Das ist ein Ausflug, kein Tippfehler."
 * Deshalb steht der Grund dabei — und deshalb prüft der letzte Test dieser Datei,
 * dass jeder Eintrag die Regel wirklich noch verletzt.
 */
const AUSFLUEGE: Record<number, string> = {
  21: 'Iga-Ueno-Burg — Tagesausflug aus Osaka, liegt näher an Kyoto',
  22: 'Iga-ryu Ninja-Museum — dasselbe Ziel wie Nr. 21',
  59: 'Heijo-Palast in Nara — Nara wird von Kyoto aus besucht, liegt aber näher an Osaka',
  61: 'Todai-ji in Nara — wie Nr. 59',
  66: 'Nara-Park — wie Nr. 59',
  88: 'Ainokura in Gokayama — Tagesausflug aus Takayama, liegt näher an Kanazawa',
};

// ================================================================ Prüfungen ===

describe('Die Orte aus dem Reiseband', () => {
  it('sind einhundertvierundsechzig, lückenlos von 1 bis 164', () => {
    /*
     * Die Nummern stehen im gedruckten Band. Eine Lücke heißt, dass ein Ort beim
     * Umbau verloren gegangen ist; eine Doppelung heißt, dass zwei Orte dieselbe
     * Nummer tragen und `placeByNr` nur einen davon findet — der andere ist dann
     * aus der App heraus unerreichbar, ohne dass irgendwo etwas rot wird.
     */
    const nummern = alleOrte.map((o) => o.nr).sort((a, b) => a - b);
    expect(new Set(nummern).size, 'doppelte Nummern').toBe(nummern.length);
    expect(nummern[0]).toBe(1);
    expect(nummern.at(-1)).toBe(164);
    const luecken = Array.from({ length: 164 }, (_, i) => i + 1).filter(
      (n) => !nummern.includes(n),
    );
    expect(luecken, `fehlende Nummern: ${luecken.join(', ')}`).toEqual([]);
  });

  it('haben alle eine Koordinate im Reiserahmen', () => {
    /*
     * Die zwei Fehler, die diese Prüfung fängt, sehen beide plausibel aus:
     *
     * 1. **Verdrehtes Paar.** `lat: 135.5, lng: 34.7` statt umgekehrt. Beide Zahlen
     *    sind echte Werte aus dem Datensatz, nur in der falschen Spalte. Der Ort
     *    landet dann im Meer vor Somalia — aber in einer JSON-Datei sieht das
     *    aus wie jede andere Zeile.
     * 2. **Eine Koordinate aus der falschen Gegend.** Ein aus einem Maps-Link
     *    kopierter Wert, der zu einem gleichnamigen Ort in Sapporo gehört.
     *
     * `inJapan` allein fängt (2) nicht: Sapporo liegt in Japan. Deshalb der engere
     * Rahmen.
     */
    const daneben = alleOrte.filter(
      (o) =>
        !Number.isFinite(o.lat) ||
        !Number.isFinite(o.lng) ||
        o.lat < REISERAHMEN.latVon ||
        o.lat > REISERAHMEN.latBis ||
        o.lng < REISERAHMEN.lngVon ||
        o.lng > REISERAHMEN.lngBis,
    );
    expect(
      daneben.map((o) => `${o.nr} ${o.name} (${o.lat}, ${o.lng})`),
      'außerhalb des Reiserahmens',
    ).toEqual([]);
  });

  it('bestehen auch die weite Japan-Prüfung der App', () => {
    // Dieselbe Funktion, die das Ortsformular auf einen eingefügten Maps-Link
    // anwendet (`koordinaten.ts`). Redundant zum Rahmen oben — aber wenn jemand
    // `inJapan` ändert, soll das hier auffallen und nicht erst, wenn ein
    // eingefügter Link stillschweigend verworfen wird.
    const raus = alleOrte.filter((o) => !inJapan(o.lat, o.lng));
    expect(raus.map((o) => `${o.nr} ${o.name}`)).toEqual([]);
  });

  it('haben keine Koordinate, die nach Platzhalter aussieht', () => {
    // `0, 0` liegt im Golf von Guinea und ist der klassische Rest eines nicht
    // gefüllten Feldes. Eine glatte ganze Zahl bei einer Koordinate mit sieben
    // Nachkommastellen im Rest des Datensatzes ist ebenfalls verdächtig.
    const verdaechtig = alleOrte.filter(
      (o) => o.lat === 0 || o.lng === 0 || Number.isInteger(o.lat) || Number.isInteger(o.lng),
    );
    expect(verdaechtig.map((o) => `${o.nr} ${o.name} (${o.lat}, ${o.lng})`)).toEqual([]);
  });

  it('tragen eine Station, die es gibt', () => {
    // Ein Tippfehler wie `'kioto'` fällt im Browser nicht auf: Der Ort
    // verschwindet aus jeder Stationsansicht, die Zählung wird um eins kleiner,
    // und niemand vermisst eine Nummer unter 164.
    const falsch = alleOrte.filter((o) => !stationVon(o.station));
    expect(falsch.map((o) => `${o.nr} ${o.name} → '${o.station}'`)).toEqual([]);
  });

  it('tragen eine Kategorie, die es gibt', () => {
    // Gegen `CATEGORIES` aus `places.ts` und nicht gegen eine abgeschriebene
    // Liste — sonst prüft man zwei Kopien gegeneinander und nicht die Wahrheit.
    const schluessel = new Set(CATEGORIES.map((c) => c.key));
    const falsch = alleOrte.filter((o) => !schluessel.has(o.category));
    expect(falsch.map((o) => `${o.nr} ${o.name} → '${o.category}'`)).toEqual([]);
  });

  it('haben einen Namen und einen Text', () => {
    // Ein Ort ohne Namen ist auf der Karte ein Punkt ohne Auskunft. Ein Ort ohne
    // Text ist eine leere Karte beim Antippen — beides fällt erst unterwegs auf.
    const leer = alleOrte.filter(
      (o) => !o.name?.trim() || !o.descriptionHtml?.trim() || !o.stationLabel?.trim(),
    );
    expect(leer.map((o) => o.nr)).toEqual([]);
  });

  it('nennen als Schließtag höchstens einen echten Wochentag', () => {
    /*
     * `closedDay` ist die Kürzelform, die der Ortspool zählt („heute geschlossen").
     * Stünde dort `'Montag'` statt `'Mo'`, verglich der Pool eine Zeichenkette mit
     * einer anderen, fände nie eine Übereinstimmung, und die Zahl stünde für immer
     * auf null — ein Werkzeug, das schweigt, statt zu warnen.
     */
    const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const falsch = alleOrte.filter((o) => o.closedDay && !TAGE.includes(o.closedDay));
    expect(falsch.map((o) => `${o.nr} → '${o.closedDay}'`)).toEqual([]);
  });
});

describe('Ort und Station passen zusammen', () => {
  it('die nächste Station ist die eigene — außer bei den benannten Ausflügen', () => {
    /*
     * Das ist die Prüfung mit dem größten Fang: Sie braucht keinen erfundenen
     * Kilometerwert und trifft trotzdem den teuersten Fehler — eine Koordinate aus
     * der falschen Gegend, die im Rahmen liegt und plausibel aussieht. Ein
     * Osaka-Ort mit einer Tokio-Koordinate schlägt hier an, obwohl beide
     * Koordinaten echt sind und beide in Japan liegen.
     */
    const verstoesse = alleOrte
      .filter((o) => !(o.nr in AUSFLUEGE))
      .map((o) => ({ o, naechste: naechsteStation(o) }))
      .filter(({ o, naechste }) => naechste.slug !== o.station);

    expect(
      verstoesse.map(
        ({ o, naechste }) =>
          `${o.nr} ${o.name}: Station '${o.station}', aber näher an '${naechste.slug}' ` +
          `(${naechste.km.toFixed(0)} km) — Ausflug? Dann in AUSFLUEGE eintragen. ` +
          `Sonst stimmt die Koordinate nicht.`,
      ),
    ).toEqual([]);
  });

  it('jeder Eintrag in AUSFLUEGE verletzt die Regel wirklich', () => {
    /*
     * Die Prüfung, die die Ausnahmeliste am Verrotten hindert — und ohne die der
     * Test darüber mit der Zeit wertlos wird.
     *
     * Wird eine Koordinate korrigiert, sodass ein Ausflug plötzlich doch bei seiner
     * eigenen Station liegt, bleibt der Eintrag hier stehen und deckt von dann an
     * einen echten Fehler mit. Eine Ausnahmeliste, die niemand aufräumt, wird zur
     * Generalerlaubnis. Also muss jeder Eintrag seine Berechtigung laufend
     * nachweisen.
     */
    const ueberfluessig = Object.keys(AUSFLUEGE)
      .map(Number)
      .filter((nr) => {
        const o = alleOrte.find((x) => x.nr === nr);
        return !o || naechsteStation(o).slug === o.station;
      });
    expect(
      ueberfluessig,
      `diese Einträge in AUSFLUEGE sind nicht mehr nötig und verdecken künftige Fehler: ` +
        ueberfluessig.join(', '),
    ).toEqual([]);
  });

  it('hält die größte Entfernung je Station im Blick', () => {
    /*
     * Kein Fehlerfall — eine Ausgabe. Sie steht hier, damit sichtbar wird, wenn ein
     * neuer Ort die Spanne einer Station ausweitet. Heute gemessen: Tokio 119 km
     * (Nikko), Osaka 76 km (Himeji), Takayama 43 km (Gokayama), Kyoto 37 km (Nara),
     * Hakone 7 km, Kanazawa 2 km.
     *
     * Eine Zahl, die man beim Lesen des Testlaufs sieht, ist mehr wert als eine
     * Schranke, die man raten müsste — und sie nimmt niemandem einen Tagesausflug
     * weg.
     */
    const zeilen = stationen.map((s) => {
      const orte = alleOrte.filter((o) => o.station === s.slug);
      const weit = orte
        .map((o) => ({ nr: o.nr, name: o.name, d: km(s.center[0], s.center[1], o.lat, o.lng) }))
        .sort((a, b) => b.d - a.d)[0];
      return `  ${s.slug.padEnd(9)} ${String(orte.length).padStart(3)} Orte, am weitesten ${
        weit ? `${weit.d.toFixed(0)} km (${weit.nr} ${weit.name})` : '—'
      }`;
    });
    console.log('\nSpanne je Station:\n' + zeilen.join('\n'));
    // Die eine Zusicherung, die dazugehört: keine Station ohne Orte. Eine leere
    // Station heißt, dass `station` irgendwo umbenannt wurde und die Orte in eine
    // Ansicht gerutscht sind, in die sie nicht gehören.
    const leer = stationen.filter((s) => !alleOrte.some((o) => o.station === s.slug));
    expect(leer.map((s) => s.slug)).toEqual([]);
  });
});
