/** Typen und Beschriftungen rund um die 164 Orte des Reisebands. */

import placesData from '../data/places.json';
import stationsData from '../data/stations.json';

export type Category = 'kultur' | 'essen' | 'shop' | 'natur' | 'hotel';

export type Place = {
  nr: number;
  name: string;
  category: Category;
  station: string;
  stationLabel: string;
  area: 'zentrum' | 'ausflug';
  lat: number;
  lng: number;
  placeId: string | null;
  descriptionHtml: string;
  isFriendTip: boolean;
  /** Erlebnis-Nummer aus "Japan erleben", wenn der Ort daher stammt. */
  book?: string;
  bookTitle?: string;
  needsBooking: boolean;
  closedDay: string | null;
  cashOnly: boolean;
  /** Nummern weiterer Orte an genau derselben Koordinate. */
  sameSpotAs?: number[];
  /**
   * Nur bei der Kategorie Übernachten gesetzt.
   *
   * `gebucht` — das ist die Unterkunft, in der wirklich geschlafen wird.
   * `vorschlag` — ein Vorschlag des Reisebands, durch die Buchung erledigt.
   */
  uebernachtung?: 'gebucht' | 'vorschlag';
};

/**
 * Ein selbst angelegter Ort. Trägt dieselben Felder wie die 164 aus dem
 * Reiseband, plus drei eigene.
 */
export type EigenerOrt = Place & {
  eigen: true;
  /**
   * Die Nummer ist noch nicht die endgültige.
   *
   * Nummern kommen aus einer Sequenz in der Datenbank, damit zwei Leute nicht
   * gleichzeitig dieselbe bekommen. Ohne Netz gibt es keine Nummer — der Ort
   * bekommt dann eine negative, die mit nichts kollidieren kann, und wird als
   * „neu" angezeigt. Beim nächsten Abgleich holt er sich seine echte.
   */
  vorlaeufig: boolean;
  angelegtVon: string | null;
};

export const istEigen = (p: Place): p is EigenerOrt =>
  (p as Partial<EigenerOrt>).eigen === true;

/**
 * Station für Orte aus dem Reiseführer, die nicht an der Route liegen
 * (Kusatsu, Matsumoto, Jigokudani, Kawaguchiko …).
 *
 * Sie stehen auf Karte und in der Liste, sind aber **nicht auf einen Reisetag
 * legbar**: Jigokudani ist kein Nachmittagsausflug ab Takayama, und eine
 * Tagesplanung, die das zulässt, lügt. Die Station steht deshalb bewusst nicht
 * in `stations.json` — dort hängen Nächte und Datumsbereiche dran.
 */
export const ABSEITS = 'abseits';
export const ABSEITS_LABEL = 'Nicht auf der Route';

export const istAbseits = (p: Place) => p.station === ABSEITS;

/**
 * Beschriftung einer Station aus ihrem Slug. Wird gebraucht, wenn ein eigener
 * Ort aus der Datenbank kommt — dort steht nur der Slug.
 */
export function stationLabelOf(slug: string): string {
  if (slug === ABSEITS) return ABSEITS_LABEL;
  return stationsData.find((s) => s.slug === slug)?.name ?? slug;
}

/** Die sechs Stationen der Route plus die Ablage für alles daneben. */
export const STATIONSWAHL: { slug: string; label: string; planbar: boolean }[] = [
  ...stationsData.map((s) => ({ slug: s.slug, label: `${s.no} · ${s.name}`, planbar: true })),
  { slug: ABSEITS, label: ABSEITS_LABEL, planbar: false },
];

/** Alle 164 Orte des Reisebands, unverändert. Nur zum Nachschlagen. */
export const alleOrte = placesData as Place[];

/**
 * Die Arbeitsliste der App.
 *
 * Draußen sind die Übernachtungsvorschläge: Für jede der sechs Stationen ist
 * etwas gebucht, damit sind die Vorschläge des Reisebands erledigt. Sie standen
 * sonst zu 23 Stück in Liste, Karte und Tagesplaner herum und machten die
 * Kategorie Übernachten unbrauchbar.
 *
 * **Falls eine Buchung platzt:** Diese Zeile durch `alleOrte` ersetzen, und sie
 * sind sofort wieder da — die Daten stehen weiterhin vollständig in
 * places.json, welcher Ort welche Rolle hat in data/source/unterkunft.json.
 */
export const places = alleOrte.filter((p) => p.uebernachtung !== 'vorschlag');

export const CATEGORIES: { key: Category; label: string; short: string; color: string }[] = [
  { key: 'kultur', label: 'Kultur & Sehenswürdigkeiten', short: 'Kultur', color: '#C6402B' },
  { key: 'essen', label: 'Essen & Trinken', short: 'Essen', color: '#A67C33' },
  { key: 'shop', label: 'Einkaufen & Handwerk', short: 'Einkaufen', color: '#3C2316' },
  { key: 'natur', label: 'Natur & Aktiv', short: 'Natur', color: '#3E6B5E' },
  { key: 'hotel', label: 'Übernachten', short: 'Übernachten', color: '#6B5D2F' },
];

export const categoryOf = (key: Category) => CATEGORIES.find((c) => c.key === key)!;

/**
 * Sucht in **allen** 164 Orten, nicht nur in der Arbeitsliste: Eine Nummer aus
 * dem gedruckten Reiseband soll auch dann etwas finden, wenn der Ort in der App
 * nicht mehr angeboten wird.
 */
export function placeByNr(nr: number): Place | undefined {
  return alleOrte.find((p) => p.nr === nr);
}

/** Die höchste vergebene Nummer der festen Orte — eigene zählen darüber weiter. */
export const HOECHSTE_FESTE_NR = alleOrte.reduce((m, p) => Math.max(m, p.nr), 0);

/** Orte einer Station, optional nur Zentrum oder nur Ausflüge. */
export function placesOfStation(station: string, area?: 'zentrum' | 'ausflug'): Place[] {
  return places.filter((p) => p.station === station && (!area || p.area === area));
}

/** Text ohne Auszeichnung — für Suche und Kartenpopups. */
export function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}
