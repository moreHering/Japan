/**
 * Die Prüfregeln für Orte — **eine Stelle für zwei Verbraucher**.
 *
 * Das ist der Zweck dieser Datei und nicht bloß Aufräumen. Dieselben Regeln
 * brauchen zwei ganz verschiedene Prüfer:
 *
 * 1. **Der Wächter im CI** (`test/orte-plausibel.test.ts`) prüft die **Dateien** —
 *    `src/data/places.json`, die 181 Orte aus dem Reiseband. Er läuft bei jedem
 *    Push und blockiert den Deploy.
 * 2. **Die Selbstprüfseite `/wache/`** prüft, was auf **diesem Gerät** steht: die
 *    181 plus die eigenen Orte ab Nr. 1001, mit allen Korrekturen. Das erreicht der
 *    CI nie, denn das liegt im localStorage und in Supabase, nicht in den Dateien.
 *
 * Bis hierher standen die Regeln nur im Test. Zwei Kopien laufen auseinander,
 * sobald jemand eine davon anfasst — und dann sagt der grüne Haken im CI etwas
 * anderes als das Gerät in der Hand. Das wäre die schlechteste der drei möglichen
 * Welten.
 *
 * ## Warum das überhaupt gebaut ist
 *
 * `PRUEFLISTE.md` nennt die Grundregel des Projekts: *Auf der Reise ist ein falsch
 * markierter Ort schlimmer als ein fehlender.* Ein fehlender Ort fällt beim Planen
 * auf. Ein Ort mit falscher Koordinate fällt auf, wenn man davorsteht — vor einem
 * Parkhaus, zwei Straßen vom Lokal entfernt, mit drei Leuten im Schlepptau.
 *
 * Der teuerste Fall ist dabei nicht die grob falsche Zahl, sondern die
 * **plausible**: Ein aus einem Maps-Link kopierter Wert, der auf den
 * Kartenmittelpunkt statt den Ort zeigt (`koordinaten.ts:lese()` warnt davor, aber
 * man kann die Warnung übergehen), oder eine Koordinate, die zu einem
 * gleichnamigen Ort in der falschen Stadt gehört. Beide Zahlen sind echt, beide
 * liegen in Japan, und keine Rahmengrenze fängt sie. Dagegen hilft nur der
 * Vergleich mit der Station, zu der der Ort gehört.
 *
 * ## Reine Logik, ohne DOM
 *
 * Dasselbe Muster wie `tagebuch.ts`, `karte.ts` und `mapsexport.ts`: Was ohne
 * Browser auskommt, ist in vitest beweisbar. Diese Datei liest **keinen** Zustand
 * — die Orte kommen von außen herein, damit derselbe Code die Dateien und den
 * Gerätestand prüfen kann.
 */

import { inJapan } from './koordinaten';
import { istEigen, type Place } from './places';

// ================================================================= Die Rahmen ===

/**
 * Der engere Rahmen für die Orte dieser Reise.
 *
 * Gemessen an den heutigen Daten: lat 34,21 (Nr. 35 Eko-in auf dem Kōya-san) bis
 * 36,76 (Nr. 156 Nikko), lng 134,69 (Himeji) bis 139,81 (Nikko). Das ist ein
 * Streifen Honshū. Mit Luft nach allen Seiten wird daraus 33–38 °N und 133–141 °O.
 *
 * Bewusst **enger** als `inJapan()` aus `koordinaten.ts` (20–46 / 122–154, das
 * schließt Okinawa und Ogasawara ein): Eine Koordinate aus Hokkaidō oder Kyūshū
 * ist auf dieser Reise mit Sicherheit ein Fehler, `inJapan` würde sie durchlassen.
 */
export const REISERAHMEN = { latVon: 33, latBis: 38, lngVon: 133, lngBis: 141 };

/** Entfernung in Kilometern, Haversine. Für Größenordnungen genau genug. */
export function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLng = r(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nur das, was von einer Station gebraucht wird — so bleibt die Datei datenfrei. */
export type Station = { slug: string; center: [number, number] };

/** Die nächstgelegene Station zu einer Koordinate, nach Luftlinie. */
export function naechsteStation(
  o: { lat: number; lng: number },
  stationen: Station[],
): { slug: string; km: number } {
  return stationen
    .map((s) => ({ slug: s.slug, km: km(s.center[0], s.center[1], o.lat, o.lng) }))
    .sort((a, b) => a.km - b.km)[0];
}

/**
 * Die sechs Orte, deren nächste Station nicht die eigene ist — **und zwar zu
 * Recht**. Jeder Eintrag ist ein Tagesausflug, bei dem man von der einen Station
 * aus zu einem Ort fährt, der geografisch näher an einer anderen liegt.
 *
 * Diese Liste ist der Grund, warum die Regel überhaupt brauchbar ist. Ohne
 * Ausnahmen hält sie nicht: Nara liegt näher an Osaka, wird aber von Kyoto aus
 * besucht. Ein einfacher Kilometerdeckel wäre die Alternative gewesen und ist
 * nachgemessen schwach — Nikko liegt legitim 119 km von Tokios Mitte entfernt,
 * Himeji-jo 76 km von Osakas. Ein Deckel müsste also über 120 km liegen und fängt
 * dann fast nichts mehr.
 *
 * Wer hier etwas einträgt, behauptet: „Das ist ein Ausflug, kein Tippfehler."
 * Deshalb steht der Grund dabei — und deshalb prüft `test/wache.test.ts`, dass
 * jeder Eintrag die Regel wirklich noch verletzt. Eine Ausnahmeliste, die niemand
 * aufräumt, wird mit der Zeit zur Generalerlaubnis.
 */
export const AUSFLUEGE: Record<number, string> = {
  21: 'Iga-Ueno-Burg — Tagesausflug aus Osaka, liegt näher an Kyoto',
  22: 'Iga-ryu Ninja-Museum — dasselbe Ziel wie Nr. 21',
  59: 'Heijo-Palast in Nara — Nara wird von Kyoto aus besucht, liegt aber näher an Osaka',
  61: 'Todai-ji in Nara — wie Nr. 59',
  66: 'Nara-Park — wie Nr. 59',
  88: 'Ainokura in Gokayama — Tagesausflug aus Takayama, liegt näher an Kanazawa',
};

/**
 * Wie weit ein Ort der Mietwagen-Strecke neben seiner Etappe liegen darf.
 *
 * Gemessen wird die Luftlinie zur geraden Verbindung der zwei Stationsmitten —
 * nicht zur Straße, die kennt diese Datei nicht. Die Straße weicht davon ab,
 * gemessen am 23.09. an allen 17 Orten: am weitesten die Daiō-Wasabi-Farm
 * (Nr. 175) mit 46,7 km neben Takayama → Kawaguchiko — „35 Min. nördlich, in der
 * falschen Richtung" sagt das Band selbst —, dann Matsumoto-jō mit 39,3 km und
 * Kappa-bashi mit 36,7 km vom Mittelpunkt Takayamas. 60 km lassen das zu und
 * fangen trotzdem, worum es geht: eine Koordinate aus der falschen Gegend. Ein
 * vertauschter oder aus Tokio kopierter Pin liegt Hunderte Kilometer daneben.
 */
export const KORRIDOR_KM = 60;

/** Abstand eines Punktes zur Strecke a–b in km (flach gerechnet, reicht für < 300 km). */
export function kmZurStrecke(
  p: { lat: number; lng: number },
  a: [number, number],
  b: [number, number],
): number {
  const breite = (((a[0] + b[0]) / 2) * Math.PI) / 180;
  const x = (lng: number) => lng * 111.32 * Math.cos(breite);
  const y = (lat: number) => lat * 110.57;
  const [ax, ay, bx, by, px, py] = [x(a[1]), y(a[0]), x(b[1]), y(b[0]), x(p.lng), y(p.lat)];
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// =================================================================== Befunde ===

/**
 * Ein Befund nennt **was zu tun ist**, nicht nur was falsch ist.
 *
 * Unterwegs liest das jemand mit einem Koffer in der Hand. „Koordinate
 * unplausibel" hilft dort nicht; „Nr. 167 liegt in Hokkaidō — Breite und Länge
 * vertauscht?" sagt, wo man nachsieht.
 */
export type Befund = {
  /** `fehler` = der Ort ist unterwegs nicht zu gebrauchen. `warnung` = nachsehen. */
  schwere: 'fehler' | 'warnung' | 'hinweis';
  nr?: number;
  titel: string;
  was: string;
};

const ZAHL = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

/**
 * Prüft die übergebenen Orte und gibt die Befunde zurück — schwerste zuerst.
 *
 * **Jeder** übergebene Ort wird geprüft, also auch eigene ab Nr. 1001 und
 * korrigierte. Das ist der Unterschied zum CI-Wächter, der nur die Dateien sieht.
 *
 * Ein sauberer Bestand gibt eine **leere** Liste. Das ist ausdrücklich geprüft:
 * Eine Seite, die immer etwas meldet, wird nach drei Tagen nicht mehr gelesen.
 */
export function pruefeOrte(orte: Place[], stationen: Station[]): Befund[] {
  const raus: Befund[] = [];
  const melde = (b: Befund) => raus.push(b);

  for (const o of orte) {
    const wer = `Nr. ${o.nr} „${o.name || '(ohne Namen)'}"`;

    // --- Die Koordinate selbst ------------------------------------------------
    if (!ZAHL(o.lat) || !ZAHL(o.lng) || o.lat === 0 || o.lng === 0) {
      melde({
        schwere: 'fehler',
        nr: o.nr,
        titel: `${wer}: keine brauchbare Koordinate`,
        was: 'Der Marker landet bei 0/0 im Golf von Guinea. Ort bearbeiten und die Adresse oder den Maps-Link neu einfügen.',
      });
      continue; // Alles Weitere wäre Rechnen mit Unsinn.
    }

    if (!inJapan(o.lat, o.lng)) {
      melde({
        schwere: 'fehler',
        nr: o.nr,
        titel: `${wer}: Koordinate liegt nicht in Japan (${o.lat}, ${o.lng})`,
        was: 'Meist sind Breite und Länge vertauscht — 135 als Breite gibt es nicht. Beim Bearbeiten die beiden Zahlen tauschen.',
      });
    } else if (
      o.lat < REISERAHMEN.latVon ||
      o.lat > REISERAHMEN.latBis ||
      o.lng < REISERAHMEN.lngVon ||
      o.lng > REISERAHMEN.lngBis
    ) {
      melde({
        schwere: 'warnung',
        nr: o.nr,
        titel: `${wer}: liegt außerhalb der Reiseroute (${o.lat}, ${o.lng})`,
        was: 'In Japan, aber nicht auf dem Streifen zwischen Himeji und Nikko — Hokkaidō oder Kyūshū. Bei einem selbst angelegten Ort kann das gewollt sein.',
      });
    }

    // --- Passt der Ort zu seiner Station? -------------------------------------
    //
    // Die Prüfung mit dem größten Fang, weil sie ohne erfundene Zahl auskommt und
    // trotzdem den teuersten Fehler trifft: eine echte Koordinate aus der falschen
    // Gegend. Ein Osaka-Ort mit einer Tokio-Koordinate schlägt hier an, obwohl
    // beide Zahlen stimmen und beide in Japan liegen.
    //
    // Die Orte der Straße (Nr. 165–181) liegen per Definition **zwischen** zwei
    // Stationen — Hikone-jō ist näher an Kyoto, gehört aber zum Kanazawa-Tag.
    // Für sie gilt statt „nächste Station" der Korridor ihrer Etappe.
    if (o.etappe) {
      const von = stationen.find((s) => s.slug === o.etappe!.von);
      const nach = stationen.find((s) => s.slug === o.etappe!.nach);
      if (!von || !nach) {
        melde({
          schwere: 'warnung',
          nr: o.nr,
          titel: `${wer}: Etappe ${o.etappe.von} → ${o.etappe.nach} kennt die App nicht`,
          was: 'Die Station fehlt in stations.json — dann steht der Ort an keinem Reisetag. Bitte melden.',
        });
      } else {
        const abseits = kmZurStrecke(o, von.center, nach.center);
        if (abseits > KORRIDOR_KM) {
          melde({
            schwere: 'warnung',
            nr: o.nr,
            titel: `${wer}: liegt ${abseits.toFixed(0)} km neben der Etappe ${o.etappe.von} → ${o.etappe.nach}`,
            was: 'Ein Ort der Straße liegt auf oder nahe der Fahrtstrecke. So weit daneben ist die Koordinate vermutlich aus der falschen Gegend.',
          });
        }
      }
    } else if (!(o.nr in AUSFLUEGE) && stationen.some((s) => s.slug === o.station)) {
      const nah = naechsteStation(o, stationen);
      if (nah.slug !== o.station) {
        const eigene = stationen.find((s) => s.slug === o.station)!;
        const weit = km(eigene.center[0], eigene.center[1], o.lat, o.lng);
        melde({
          schwere: 'warnung',
          nr: o.nr,
          titel: `${wer}: liegt näher an ${nah.slug} als an ${o.station}`,
          was: `${nah.km.toFixed(0)} km statt ${weit.toFixed(0)} km. Ist das ein Tagesausflug, stimmt es — sonst ist die Koordinate aus der falschen Gegend.`,
        });
      }
    }

    // --- Der Ort als Eintrag --------------------------------------------------
    if (!o.name?.trim()) {
      melde({
        schwere: 'warnung',
        nr: o.nr,
        titel: `Nr. ${o.nr} hat keinen Namen`,
        was: 'Auf der Karte ein Punkt ohne Auskunft. Beim Bearbeiten nachtragen.',
      });
    }

    // --- Eigener Ort ohne endgültige Nummer -----------------------------------
    //
    // Der wertvollste Befund dieser ganzen Datei, und einer, den sonst nichts
    // bemerkt. Eine negative Nummer heißt: Dieses Gerät hat den Ort angelegt und
    // **nie abgeglichen**. Die Unterkunft steht damit auf keinem der beiden anderen
    // Telefone — und das merkt man sonst erst, wenn jemand anders sie sucht.
    if (istEigen(o) && o.nr < 0) {
      melde({
        schwere: 'fehler',
        nr: o.nr,
        titel: `„${o.name}" hat noch keine endgültige Nummer`,
        was: 'Dieses Gerät hat den Ort angelegt, aber nie abgeglichen — auf den anderen Telefonen fehlt er. Anmelden und abgleichen.',
      });
    }
  }

  // --- Zwei Orte auf demselben Punkt -----------------------------------------
  //
  // Meist ein doppelt angelegter Ort. `sameSpotAs` kennzeichnet die Fälle, die es
  // wirklich gibt — Amazake-chaya trägt aus dem gedruckten Band zwei Nummern für
  // eine Adresse. Nur ein Hinweis, kein Fehler: Zwei Lokale in einem Gebäude sind
  // in Japan nicht selten.
  const gesehen = new Map<string, Place>();
  for (const o of orte) {
    if (!ZAHL(o.lat) || !ZAHL(o.lng)) continue;
    // Fünf Nachkommastellen sind rund 1 m — feiner zu vergleichen hieße, jede
    // Rundung als Dublette zu melden.
    const schluessel = `${o.lat.toFixed(5)},${o.lng.toFixed(5)}`;
    const vorher = gesehen.get(schluessel);
    if (vorher) {
      const bekannt =
        vorher.sameSpotAs?.includes(o.nr) || (o as Place).sameSpotAs?.includes(vorher.nr);
      if (!bekannt) {
        melde({
          schwere: 'hinweis',
          nr: o.nr,
          titel: `Nr. ${o.nr} „${o.name}" liegt genau auf Nr. ${vorher.nr} „${vorher.name}"`,
          was: 'Zwei Einträge auf einem Punkt — meist versehentlich doppelt angelegt. Wenn es zwei Lokale in einem Haus sind, ist es richtig.',
        });
      }
    } else {
      gesehen.set(schluessel, o);
    }
  }

  const rang = { fehler: 0, warnung: 1, hinweis: 2 };
  return raus.sort((a, b) => rang[a.schwere] - rang[b.schwere] || (a.nr ?? 0) - (b.nr ?? 0));
}

/** Kurzfassung für die Kopfzeile: „2 Fehler, 1 Warnung" oder „keine Beanstandung". */
export function befundZusammenfassung(befunde: Befund[]): string {
  if (!befunde.length) return 'keine Beanstandung';
  const z = (art: Befund['schwere']) => befunde.filter((b) => b.schwere === art).length;
  const teile = [
    z('fehler') && `${z('fehler')} ${z('fehler') === 1 ? 'Fehler' : 'Fehler'}`,
    z('warnung') && `${z('warnung')} ${z('warnung') === 1 ? 'Warnung' : 'Warnungen'}`,
    z('hinweis') && `${z('hinweis')} ${z('hinweis') === 1 ? 'Hinweis' : 'Hinweise'}`,
  ].filter(Boolean);
  return teile.join(', ');
}
