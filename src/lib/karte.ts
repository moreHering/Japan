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
};

export const SPRACHFOLGE = ['name:de', 'name:en', 'name:latin', 'name'] as const;

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
 * Schreibt die Beschriftung jedes Textlayers auf Deutsch um.
 *
 * Über **alle** Ebenen mit `text-field` und nicht über bekannte Ebenennamen: Aus
 * dieser Umgebung ist kein Kachelhost erreichbar, ich könnte die Ebenennamen des
 * Stils also nur aus dem Gedächtnis nennen — und wäre beim nächsten Umbau des
 * Anbieters falsch. Eine Schleife ist davon unabhängig.
 *
 * Verändert das übergebene Objekt **an Ort und Stelle** und gibt es zurück. Das
 * ist Absicht und kein Versehen: Der Stil ist ein frisch geholtes JSON mit
 * hunderten Ebenen, das niemand sonst hält; eine Kopie wäre Arbeit ohne Nutzen.
 *
 * Wirft, wenn es keine einzige Textebene gibt. Dann stimmt die Annahme über den
 * Stil nicht, und der Rasterrückfall ist richtiger als eine Karte ohne Namen.
 */
export function deutscheNamen<T extends Stil>(stil: T): T {
  let geaendert = 0;
  for (const ebene of stil.layers ?? []) {
    if (ebene.layout && 'text-field' in ebene.layout) {
      ebene.layout['text-field'] = SPRACHE;
      geaendert++;
    }
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
