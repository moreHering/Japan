/**
 * Datums- und Routenlogik der Reise.
 *
 * Alle Datumsangaben sind ISO-Strings (`2026-09-28`) und werden bewusst als
 * reine Zeichenketten behandelt: die Reise hat keine Uhrzeiten, und sobald man
 * `new Date()` mit lokaler Zeitzone benutzt, verschiebt sich in Japan der Tag.
 */

import stationsData from '../data/stations.json';
import legsData from '../data/legs.json';
import tripData from '../data/trip.json';

export type Station = (typeof stationsData)[number];

export type TripDay = {
  /** ISO-Datum, z. B. `2026-09-28`. */
  date: string;
  /** 1-basierte Nummer des Reisetags. */
  dayNo: number;
  /** `Sa`, `So`, … */
  weekday: Weekday;
  /** `Sa 26.09.` */
  label: string;
  /** Station, in der an diesem Tag geschlafen wird (bzw. die letzte am Abreisetag). */
  station: Station;
  /** Gesetzt, wenn an diesem Tag die Station gewechselt wird. */
  leg: Leg | null;
  /** Letzter Tag der Reise — Rückflug, keine Nacht mehr. */
  isDeparture: boolean;
};

export type Leg = {
  date: string;
  from: string;
  to: string;
  connection: string;
  duration: string;
  /**
   * `id` der zugehörigen Buchung in `bookings.json` — fehlt, wo keine
   * Reservierung nötig ist (Osaka → Kyoto, JR Special Rapid).
   *
   * Ausdrücklich eine Referenz und keine Herleitung: Die vier Transportbuchungen
   * haben heute zufällig genau die Etappentage als `due`, aber `due` bedeutet
   * dort den Fahrtag und bei anderen Einträgen eine Frist davor
   * (Ghibli-Vorverkauf). Ein zweiter Transporteintrag mit derselben Frist —
   * etwa ein Flughafentransfer — tauchte bei einer Herleitung still im
   * Etappenblock des Planers auf. Vier Zeilen in einer handgepflegten Datei mit
   * fünf Einträgen sind billiger als jede Heuristik.
   */
  booking?: string;
  /** Nummer der Mietwagen-Etappe (1–5), seit dem Plan vom 23.09. Sonst fehlt sie. */
  etappe?: number;
};

export const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const trip = tripData;
export const stations: Station[] = stationsData;

/**
 * Die sechs Stationen des Reisebands — ohne Zwischennacht.
 *
 * Seit dem Mietwagen-Plan steht Kawaguchiko als Station in `stations.json`: Der
 * Tagesplan braucht für den 07.10. einen Schlafort, sonst fiele `stationOf()` auf
 * Osaka zurück. Das Band zählt aber „sechs Stationen" und nennt die Nacht am
 * Kawaguchi-See ausdrücklich „die einzige außerhalb der sechs". Überall, wo
 * gezählt oder ein Kapitel erwartet wird, gilt deshalb diese Liste.
 */
export const hauptstationen: Station[] = stations.filter((s) => !s.zwischennacht);

/** Tage zwischen zwei ISO-Daten, zeitzonenfrei über UTC gerechnet. */
function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const t = new Date(toUtc(iso) + days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86_400_000);
}

export function weekdayOf(iso: string): Weekday {
  return WEEKDAYS[new Date(toUtc(iso)).getUTCDay()];
}

/** `Sa 26.09.` */
export function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${weekdayOf(iso)} ${d}.${m}.`;
}

/** `26.09.2026` */
export function formatFull(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Station eines Tages. Am Umzugstag gilt die Station, in der die Nacht verbracht
 * wird — also die neue. Am Abreisetag gibt es keine Nacht mehr, dann bleibt die
 * letzte Station stehen.
 */
export function stationOf(iso: string): Station {
  const sleeping = stations.find((s) => iso >= s.from && iso < s.to);
  if (sleeping) return sleeping;
  return iso >= trip.end ? stations[stations.length - 1] : stations[0];
}

export const legs: Leg[] = legsData;

export function legOf(iso: string): Leg | null {
  return legs.find((l) => l.date === iso) ?? null;
}

/** Alle Reisetage von der Ankunft bis zum Rückflug. */
export function buildDays(): TripDay[] {
  const total = daysBetween(trip.start, trip.end);
  const out: TripDay[] = [];
  for (let i = 0; i <= total; i++) {
    const date = addDays(trip.start, i);
    out.push({
      date,
      dayNo: i + 1,
      weekday: weekdayOf(date),
      label: formatDay(date),
      station: stationOf(date),
      leg: legOf(date),
      isDeparture: date === trip.end,
    });
  }
  return out;
}

/** ¥ → € mit dem in trip.json gepflegten Kurs. */
export function yenToEuro(yen: number): number {
  return yen / trip.yenPerEuro;
}

export function formatYen(yen: number): string {
  return `¥${Math.round(yen).toLocaleString('de-DE')}`;
}

export function formatEuro(euro: number): string {
  return `${euro.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
