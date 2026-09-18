/**
 * Die Etappen und ihre Buchungen.
 *
 * `legs.json` nennt seit dem Umbau über `booking` die `id` der zugehörigen
 * Transportbuchung in `bookings.json`. Der Tagesplaner löst sie auf und zeigt am
 * Umzugstag, ob die Fahrt gebucht ist.
 *
 * Diese Verknüpfung ist eine Zeichenkette in einer handgepflegten Datei — ein
 * Tippfehler dort fällt im Browser nicht auf: `buchungen.get('nohi-buss')` ist
 * `undefined`, der `{#if legBuchung}`-Zweig entfällt, und der Etappenblock sieht
 * aus wie einer ohne Reservierung. Genau deshalb steht sie hier unter Prüfung.
 *
 * Die zweite Richtung ist die wichtigere: Kommt eine Transportbuchung dazu, deren
 * Frist auf einen Umzugstag fällt, dann fehlt der Etappe eine Referenz — und die
 * Fahrt wäre im Planer nicht abhakbar, ohne dass irgendetwas rot wird.
 */

import { describe, expect, it } from 'vitest';
import { legs, trip } from '../src/lib/trip';
import bookingsData from '../src/data/bookings.json';

type Booking = { id: string; label: string; detail: string; due: string | null; group: string };
const buchungen = bookingsData as Booking[];
const nachId = new Map(buchungen.map((b) => [b.id, b]));

describe('Etappen', () => {
  it('sind fünf und liegen alle innerhalb der Reise', () => {
    expect(legs).toHaveLength(5);
    for (const l of legs) {
      expect(l.date >= trip.start, `${l.date} liegt vor dem Reisebeginn`).toBe(true);
      expect(l.date <= trip.end, `${l.date} liegt nach dem Reiseende`).toBe(true);
    }
  });

  it('sind chronologisch und ohne doppeltes Datum', () => {
    // Zwei Umzüge am selben Tag wären ein Datenfehler: `legOf()` in trip.ts nimmt
    // den ersten Treffer, der zweite verschwände lautlos.
    const daten = legs.map((l) => l.date);
    expect([...daten].sort()).toEqual(daten);
    expect(new Set(daten).size).toBe(daten.length);
  });

  it('haben eine lückenlose Kette von Station zu Station', () => {
    // Das `to` der einen Etappe muss das `from` der nächsten sein. Sonst zeigt der
    // Planer am Umzugstag eine Fahrt an, die von einer Stadt losfährt, in der man
    // nicht ist — und auf einer Reise ist das der teure Fehler.
    for (let i = 1; i < legs.length; i++) {
      expect(legs[i].from, `Etappe ${i + 1} fährt von ${legs[i].from} los`).toBe(legs[i - 1].to);
    }
  });
});

describe('Etappen und Buchungen', () => {
  it('lösen jede genannte Buchungs-ID wirklich auf', () => {
    const kaputt = legs
      .filter((l) => l.booking && !nachId.has(l.booking))
      .map((l) => `${l.date}: ${l.booking}`);
    expect(kaputt, `nicht auflösbar: ${kaputt.join(', ')}`).toEqual([]);
  });

  it('zeigen nur auf Transportbuchungen', () => {
    // Eine Unterkunft am Umzugstag ist keine Fahrt. Stünde sie im Etappenblock,
    // hakte man dort das Falsche ab — und der Haken ist derselbe wie in der
    // Organisation-Ansicht.
    for (const l of legs) {
      if (!l.booking) continue;
      expect(nachId.get(l.booking)!.group, `${l.booking} bei ${l.date}`).toBe('Transport');
    }
  });

  it('vergessen keine Transportbuchung, die auf einen Umzugstag fällt', () => {
    // Die Gegenrichtung, und die eigentliche Absicherung: Kommt in bookings.json
    // ein Transporteintrag dazu, dessen Frist ein Umzugstag ist, muss die Etappe
    // ihn nennen. Ohne diese Prüfung wäre er im Planer unsichtbar.
    const referenziert = new Set(legs.map((l) => l.booking).filter(Boolean));
    const umzugstage = new Set(legs.map((l) => l.date));
    const vergessen = buchungen
      .filter((b) => b.group === 'Transport' && b.due && umzugstage.has(b.due))
      .filter((b) => !referenziert.has(b.id))
      .map((b) => `${b.due}: ${b.id} (${b.label})`);
    expect(vergessen, `keine Etappe nennt: ${vergessen.join(', ')}`).toEqual([]);
  });

  it('lassen genau die Etappe ohne Buchung, die keine braucht', () => {
    // Osaka → Kyoto mit dem JR Special Rapid: freie Platzwahl, nichts zu
    // reservieren. Eine Referenz dort wäre eine Behauptung, die zu einem Haken
    // führt, den niemand setzen kann.
    const ohne = legs.filter((l) => !l.booking);
    expect(ohne).toHaveLength(1);
    expect(ohne[0].from).toBe('Osaka');
    expect(ohne[0].to).toBe('Kyoto');
  });

  it('nennen bei der reservierungspflichtigen Fahrt auch im Detail, dass sie es ist', () => {
    // Der Nōhi-Bus über Shirakawa-gō ist die einzige Fahrt, die ohne Reservierung
    // gar nicht geht. Der Planer zeigt `detail` an, solange nicht gebucht ist —
    // der Text muss also sagen, worum es geht.
    const bus = legs.find((l) => l.to === 'Takayama')!;
    expect(bus.booking).toBe('nohi-bus');
    expect(nachId.get('nohi-bus')!.detail.toLowerCase()).toContain('reservierungspflichtig');
  });
});
