/**
 * Reine Logik der Kartengrundlage — ohne DOM, ohne Leaflet, damit in vitest
 * beweisbar.
 *
 * Hier steckt genau der Teil, den ich aus dieser Umgebung sonst nur behaupten
 * könnte: Der Egress-Proxy sperrt jeden Kachelhost, ich kann also nie sehen, wie
 * eine Karte aussieht. Ob die **Umschreibung der Beschriftung** stattfindet und
 * Deutsch bevorzugt, ist dagegen eine Aussage über ein Objekt — und die lässt sich
 * prüfen.
 *
 * Die Aufteilung ist deshalb keine Ordnungsliebe: Was in `MapView.svelte` bleibt,
 * ist unbeweisbar; was hier steht, ist es nicht.
 */

/** Die Reihenfolge, in der ein Ortsname gesucht wird. */
/**
 * Der Zustand des Kartenhintergrunds, wie `MapView.svelte` ihn führt und nach
 * außen meldet.
 *
 * Steht hier und nicht in der Komponente, damit `/wache/` ihn nicht abschreiben
 * muss — zwei Kopien eines Typs sind so lange einig, bis jemand einen Fall
 * hinzufügt. Ein `export type` aus dem Instanz-Skript einer Svelte-Komponente wäre
 * die andere Möglichkeit gewesen und ist die heiklere: Dort bedeutet `export`
 * eigentlich „Instanzmethode".
 *
 * `vektor` und `raster` sind im Kartenbild **nicht** zu unterscheiden — man sieht
 * der App nicht an, ob sie deutsch oder japanisch beschriftet ist. Genau deshalb
 * gibt es den Melder.
 */
export type Kachelzustand = {
  art: 'vektor' | 'raster' | 'fehler';
  /** Nur im Fehlerfall gefüllt: der Host, der nicht antwortet. */
  host: string;
  /** Warum der Rückfall greift, etwa „Vektorkarte nicht verfügbar (WebGL fehlt)". */
  warum: string;
  /**
   * Wie viele Dinge die Vektorkarte wirklich zeichnet — **gemessen, nicht
   * angenommen**, und der Grund für diesen ganzen Zusatz.
   *
   * Vorher bedeutete `art: 'vektor'` nur „die Ebene wurde angehängt und hat
   * nicht gemeckert", und `/wache/` hat daraus „Vektorkarte, lateinisch
   * beschriftet" gemacht. Auf dem Telefon stand zur selben Zeit kein einziger
   * Name auf der Karte: Es rendert nur das Natural-Earth-Rasterrelief des Stils,
   * die Vektorquelle liefert nichts, und kein Fehler wird gemeldet.
   *
   * `-1` heißt **noch nicht gemessen** und ist ausdrücklich nicht `0` — eine
   * Anzeige, die eine fehlende Messung als „nichts da" ausgibt, schlägt beim
   * ersten Blick Alarm.
   */
  gezeichnet: number;
  /** Davon aus Symbolebenen, also Beschriftungen. `-1`: nicht gemessen. */
  beschriftet: number;
  /** Die Meldungen von maplibre im Wortlaut, höchstens fünf. */
  meldungen: string[];
};

/** Ein frischer, noch ungemessener Zustand. */
export function kachelzustand(
  art: Kachelzustand['art'],
  host = '',
  warum = '',
): Kachelzustand {
  return { art, host, warum, gezeichnet: -1, beschriftet: -1, meldungen: [] };
}

/**
 * Die Namensfelder, in der Reihenfolge, in der sie genommen werden.
 *
 * **Beide Schreibweisen, und das ist keine Schludrigkeit.** Am echten
 * Liberty-Stil nachgezählt (`test/fixtures/liberty-stil.json`): `name:de` und
 * `name:en` kommen darin **null Mal** vor. Benutzt werden `name:latin` (20 ×),
 * `name:nonlatin` (40 ×) und `name_en` mit **Unterstrich** (20 ×). Die erste
 * Fassung dieser Liste hat den deutschen Namen also nie gezogen, weil sie ihn
 * unter dem falschen Schlüssel gesucht hat — unsichtbar, denn `coalesce` fällt
 * stillschweigend auf `name:latin` durch und die Karte sieht richtig aus.
 *
 * Welche Schreibweise in den **Kacheln** steht, kann ich von hier nicht messen
 * (`tiles.openfreemap.org` ist gesperrt). `coalesce` überspringt fehlende
 * Schlüssel, ein Übermaß kostet hier also nichts, ein Fehlgriff den Namen.
 */
export const SPRACHFOLGE = [
  'name_de',
  'name:de',
  'name_en',
  'name:en',
  'name:latin',
  'name',
] as const;

/**
 * MapLibre-Ausdruck für die Beschriftung: deutsch, sonst englisch, sonst
 * lateinische Umschrift, sonst der lokale Name.
 *
 * `coalesce` nimmt den ersten Wert, der nicht fehlt. Der lokale Name steht als
 * letztes und nicht gar nicht: Ein Ort ohne jede Umschrift soll seinen Namen
 * behalten statt namenlos zu sein — 大阪 zu lesen ist besser als einen leeren
 * Punkt zu sehen.
 */
export const SPRACHE: unknown[] = ['coalesce', ...SPRACHFOLGE.map((f) => ['get', f])];

type Ebene = { id?: string; layout?: Record<string, unknown> };
type Stil = { layers?: Ebene[] };

/**
 * Schreibt die **Namensbeschriftung** jeder Textebene auf Deutsch um.
 *
 * Über eine Schleife und nicht über bekannte Ebenennamen: Der Anbieter benennt
 * seine Ebenen um, wann er will, und eine Liste wäre beim nächsten Umbau still
 * falsch.
 *
 * **Nicht mehr jede Ebene mit `text-field`, sondern nur die, deren Beschriftung
 * von einem Namensfeld kommt.** Die erste Fassung hat bedingungslos überschrieben,
 * und am echten Liberty-Stil nachgezählt kostete das drei Ebenen ihre Auskunft:
 * `highway-shield-non-us`, `highway-shield-us-interstate` und `road_shield_us`
 * tragen `["to-string", ["get", "ref"]]` — die Nummer im Autobahnschild.
 * Features mit einer `ref` haben keinen `name`, die Schilder blieben danach
 * **leer**. Ein leeres Schild ist schlimmer als ein japanisches: Es sieht aus
 * wie ein Darstellungsfehler und sagt gar nichts.
 *
 * Geprüft wird auf das Vorkommen von `name` im bisherigen Ausdruck. Das ist
 * grob, aber in die sichere Richtung: Eine Ebene, die `name` gar nicht erwähnt,
 * beschriftet mit Sicherheit etwas anderes.
 *
 * Verändert das übergebene Objekt **an Ort und Stelle** und gibt es zurück. Das
 * ist Absicht und kein Versehen: Der Stil ist ein frisch geholtes JSON mit
 * hunderten Ebenen, das niemand sonst hält; eine Kopie wäre Arbeit ohne Nutzen.
 *
 * Wirft, wenn keine einzige Namensebene übrig bleibt. Dann stimmt die Annahme
 * über den Stil nicht, und der Rasterrückfall ist richtiger als eine Karte ohne
 * Namen.
 */
export function deutscheNamen<T extends Stil>(stil: T): T {
  let geaendert = 0;
  for (const ebene of stil.layers ?? []) {
    if (!ebene.layout || !('text-field' in ebene.layout)) continue;
    // Der bisherige Ausdruck als Text — `JSON.stringify` erfasst dabei beide
    // Bauarten gleichermaßen: den Platzhalterstring `"{name:latin}"` und den
    // Ausdruck `["get", "name:latin"]`.
    if (!JSON.stringify(ebene.layout['text-field'] ?? '').includes('name')) continue;
    ebene.layout['text-field'] = SPRACHE;
    geaendert++;
  }
  if (!geaendert) throw new Error('Stil hat keine Textebene');
  return stil;
}

/**
 * Der Host einer Kachel-URL, für den Hinweis bei fehlendem Kartenhintergrund.
 *
 * Die Vorlagenplatzhalter (`{z}`, `{x}`, `{y}`, `{s}`) werden durch eine Null
 * ersetzt, bevor `URL` daran geht — mit Klammern darin wirft der Parser, und der
 * Hinweis stünde ohne Host da. Genau der Host ist aber die Auskunft, um die es
 * geht: Er sagt, ob der Dienst aus ist oder das Netz blockt.
 */
export function hostVon(url: string): string {
  try {
    return new URL(url.replace(/\{[a-z]\}/g, '0')).host;
  } catch {
    return url;
  }
}
