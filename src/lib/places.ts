/** Typen und Beschriftungen rund um die 164 Orte des Reisebands. */

import placesData from '../data/places.json';

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
  needsBooking: boolean;
  closedDay: string | null;
  cashOnly: boolean;
  /** Nummern weiterer Orte an genau derselben Koordinate. */
  sameSpotAs?: number[];
};

export const places = placesData as Place[];

export const CATEGORIES: { key: Category; label: string; short: string; color: string }[] = [
  { key: 'kultur', label: 'Kultur & Sehenswürdigkeiten', short: 'Kultur', color: '#C6402B' },
  { key: 'essen', label: 'Essen & Trinken', short: 'Essen', color: '#A67C33' },
  { key: 'shop', label: 'Einkaufen & Handwerk', short: 'Einkaufen', color: '#3C2316' },
  { key: 'natur', label: 'Natur & Aktiv', short: 'Natur', color: '#3E6B5E' },
  { key: 'hotel', label: 'Übernachten', short: 'Übernachten', color: '#6B5D2F' },
];

export const categoryOf = (key: Category) => CATEGORIES.find((c) => c.key === key)!;

export function placeByNr(nr: number): Place | undefined {
  return places.find((p) => p.nr === nr);
}

/** Orte einer Station, optional nur Zentrum oder nur Ausflüge. */
export function placesOfStation(station: string, area?: 'zentrum' | 'ausflug'): Place[] {
  return places.filter((p) => p.station === station && (!area || p.area === area));
}

/** Text ohne Auszeichnung — für Suche und Kartenpopups. */
export function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}
