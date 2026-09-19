/**
 * Koordinaten aus eingefügtem Text lesen.
 *
 * Der Anlass: Unterkünfte eintragen. Niemand tippt auf dem Handy zwei
 * sechsstellige Dezimalzahlen ab, und eine Airbnb-Adresse lässt sich nicht auf
 * der Karte antippen, wenn man nicht weiß, wo sie liegt. Was man dagegen hat,
 * ist ein Google-Maps-Link in der Buchungsbestätigung.
 *
 * Erkannt werden die Formen, die Google tatsächlich ausgibt:
 *
 *     .../maps/place/Name/@35.6895,139.6917,17z/...     der Kartenmittelpunkt
 *     ...!3d35.6895!4d139.6917...                        der Ort selbst
 *     ...?q=35.6895,139.6917                             Abfrage
 *     ...?api=1&query=35.6895,139.6917                   neuere Abfrageform
 *     35.6895, 139.6917                                  bloßes Zahlenpaar
 *     35°41'22.2"N 139°41'30.1"E                         Grad, Minuten, Sekunden
 *
 * **Wichtig bei `@` und `!3d`:** Stehen beide im Link, gewinnt `!3d/!4d`. Das
 * `@` ist der Mittelpunkt der angezeigten Karte und kann um hunderte Meter
 * neben dem Ort liegen — auf der Reise ist das der Unterschied zwischen „da
 * ist es" und „irgendwo hier".
 *
 * **Was nicht geht:** Kurzlinks (`maps.app.goo.gl`, `goo.gl/maps`). Die
 * enthalten keine Koordinate, sie verweisen nur. Auflösen bräuchte einen
 * Netzaufruf, den der Browser wegen CORS nicht machen darf — und die App hat
 * keinen Server. Deshalb sagt `lese()` in dem Fall ausdrücklich, was zu tun
 * ist, statt stumm nichts zu finden.
 */

export type Fund =
  | { art: 'gefunden'; lat: number; lng: number; quelle: string }
  | { art: 'kurzlink'; rat: string }
  | { art: 'nichts' };

const gueltig = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

/** Grad/Minuten/Sekunden nach Dezimalgrad. */
function ausGrad(grad: string, min: string, sek: string, richtung: string): number {
  const wert = Number(grad) + Number(min) / 60 + Number(sek || '0') / 3600;
  return /[SW]/i.test(richtung) ? -wert : wert;
}

export function lese(eingabe: string): Fund {
  const text = eingabe.trim();
  if (!text) return { art: 'nichts' };

  if (/(?:maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(text)) {
    return {
      art: 'kurzlink',
      rat: 'Kurzlinks enthalten keine Koordinate. Öffne den Link einmal in Google Maps und kopiere dann die Adresse aus der Adresszeile — oder tippe im Kartenbild lange auf den Ort, dann zeigt Maps die Koordinate zum Kopieren.',
    };
  }

  // 1) Der Ort selbst. Schlägt den Kartenmittelpunkt.
  const genau = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (genau) {
    const lat = Number(genau[1]);
    const lng = Number(genau[2]);
    if (gueltig(lat, lng)) return { art: 'gefunden', lat, lng, quelle: 'Ort aus dem Maps-Link' };
  }

  // 2) Ausdrückliche Abfrage — das ist, wonach gesucht wurde.
  const abfrage = text.match(/[?&](?:q|query|daddr|ll)=(-?\d+(?:\.\d+)?)[,%2C\s]+(-?\d+(?:\.\d+)?)/i);
  if (abfrage) {
    const lat = Number(abfrage[1]);
    const lng = Number(abfrage[2]);
    if (gueltig(lat, lng)) return { art: 'gefunden', lat, lng, quelle: 'Abfrage aus dem Link' };
  }

  // 3) Kartenmittelpunkt. Ungenauer, deshalb zuletzt unter den Linkformen —
  //    und die Meldung sagt das, damit man notfalls nachjustiert.
  const mitte = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (mitte) {
    const lat = Number(mitte[1]);
    const lng = Number(mitte[2]);
    if (gueltig(lat, lng)) {
      return {
        art: 'gefunden',
        lat,
        lng,
        quelle: 'Kartenmittelpunkt — bitte auf der Karte prüfen',
      };
    }
  }

  // 4) Grad, Minuten, Sekunden — so gibt Maps es beim langen Tippen aus.
  const gms = text.match(
    /(\d+)°\s*(\d+)['′]\s*([\d.]+)?["″]?\s*([NS])[,\s]+(\d+)°\s*(\d+)['′]\s*([\d.]+)?["″]?\s*([EWO])/i,
  );
  if (gms) {
    const lat = ausGrad(gms[1], gms[2], gms[3] ?? '0', gms[4]);
    const lng = ausGrad(gms[5], gms[6], gms[7] ?? '0', gms[8]);
    if (gueltig(lat, lng)) return { art: 'gefunden', lat, lng, quelle: 'Grad und Minuten' };
  }

  // 5) Bloßes Zahlenpaar. Bewusst zuletzt: In einem Maps-Link stehen viele
  //    Zahlenpaare (Zoomstufe, Bildmaße), und eines davon wäre sonst der Ort.
  const paar = text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (paar) {
    const lat = Number(paar[1]);
    const lng = Number(paar[2]);
    if (gueltig(lat, lng)) return { art: 'gefunden', lat, lng, quelle: 'Zahlenpaar' };
  }

  return { art: 'nichts' };
}

/**
 * Plausibel für Japan?
 *
 * Kein Fehler, nur ein Hinweis — aber ein nützlicher: Verdrehte Breite und
 * Länge sind der häufigste Tippfehler, und 139,7 als Breite gibt es nicht.
 *
 * Der Rahmen ist **absichtlich weit**: 20–46 °N und 122–154 °O schließt Okinawa
 * im Süden und die Ogasawara-Inseln im Osten ein. Japans Festland allein läge bei
 * etwa 24–46 °N und 122–146 °O, aber wer hier eine Koordinate einfügt, darf auch
 * einen Ort außerhalb dieser Reise meinen.
 *
 * (Der Kommentar nannte vorher die engeren Zahlen, der Code prüfte die weiten.
 * Beides stand so seit dem Anlegen da; welche der beiden Angaben gemeint war,
 * ließ sich nicht mehr feststellen. Der Code bleibt unverändert — eine Grenze
 * still zu verschieben, weil ein Kommentar etwas anderes behauptet, wäre die
 * gefährlichere der zwei Möglichkeiten. Wer den engen Rahmen braucht, findet ihn
 * in `test/orte-plausibel.test.ts` als `REISERAHMEN`.)
 */
export function inJapan(lat: number, lng: number): boolean {
  return lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154;
}
