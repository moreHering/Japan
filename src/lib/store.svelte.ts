/**
 * Der veränderliche Teil der Reiseplanung.
 *
 * Alles, was auf der Seite bearbeitet wird, liegt in genau einem Zustandsobjekt
 * und wird in den localStorage geschrieben. Der localStorage bleibt die Quelle,
 * aus der die Oberfläche liest — auch ohne Netz, was in Japan nicht
 * selbstverständlich ist.
 *
 * Alle Zugriffe auf den localStorage sind gekapselt und dürfen fehlschlagen
 * (privates Fenster, blockierte Site-Daten) — dann arbeitet die Seite einfach
 * ohne Persistenz weiter, statt mit einer Exception abzubrechen.
 *
 * **Abgleich:** Diese Datei weiß nichts von Supabase. Sie meldet nur, *was*
 * sich geändert hat (`Aenderung`), an einen Beobachter, den `sync.svelte.ts`
 * registriert. Ist keiner registriert, verhält sich alles wie vorher. Das ist
 * die Naht, an der das Backend andockt, ohne die Oberfläche anzufassen.
 */

import {
  ABSEITS,
  CATEGORIES,
  istAbseits,
  placeByNr,
  type Category,
  type EigenerOrt,
} from './places';

const KEY = 'japan2026:plan';
const VERSION = 1;

export type Expense = {
  id: string;
  date: string;
  label: string;
  yen: number;
  payer: string;
  station: string;
};

export type DayEntry = {
  placeNrs: number[];
  note: string;
};

export type PlanState = {
  version: number;
  /** ISO-Datum → geplante Orte und Notiz. */
  days: Record<string, DayEntry>;
  /** Nummern der besuchten Orte. */
  done: number[];
  /** Buchungs-ID → abgehakt. */
  bookings: Record<string, boolean>;
  /** Packlisten-ID → abgehakt. */
  packing: Record<string, boolean>;
  /** Selbst ergänzte Packlisten-Einträge. */
  packingExtra: string[];
  expenses: Expense[];
  /** Selbst angelegte Orte. Teil des Plans, damit der Export sie mitnimmt. */
  customPlaces: EigenerOrt[];
  /** Zeitpunkt der letzten Änderung, für den Export sichtbar. */
  updatedAt: string | null;
};

/**
 * Was sich geändert hat — nicht der neue Wert, sondern die betroffene Zeile.
 * Der Abgleich liest den Wert beim Senden aus dem aktuellen Zustand. Dadurch
 * lassen sich mehrere Änderungen an derselben Zeile zusammenfassen, und
 * gesendet wird immer der jüngste Stand statt einer Kette alter Zwischenwerte.
 */
export type Aenderung =
  | { art: 'tag'; datum: string }
  | { art: 'notiz'; datum: string }
  | { art: 'marke'; typ: 'done' | 'booking' | 'packing'; schluessel: string }
  | { art: 'ausgabe-neu'; id: string }
  | { art: 'ausgabe-weg'; id: string }
  | { art: 'ort'; nr: number }
  | { art: 'ort-weg'; nr: number }
  | { art: 'alles' };

let beobachter: ((änderungen: Aenderung[]) => void) | null = null;

/** Der Abgleich meldet sich hier an. Ohne Anmeldung passiert nichts. */
export function beobachteAenderungen(fn: ((änderungen: Aenderung[]) => void) | null) {
  beobachter = fn;
}

function emptyState(): PlanState {
  return {
    version: VERSION,
    days: {},
    done: [],
    bookings: {},
    packing: {},
    packingExtra: [],
    expenses: [],
    customPlaces: [],
    updatedAt: null,
  };
}

const KATEGORIEN = new Set(CATEGORIES.map((c) => c.key));

/** Macht aus unbekannten Daten einen gültigen eigenen Ort — oder null. */
function normalisiereOrt(raw: unknown): EigenerOrt | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<EigenerOrt>;
  const nr = Number(o.nr);
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!Number.isInteger(nr) || nr === 0 || !name) return null;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  const category = (KATEGORIEN.has(o.category as Category) ? o.category : 'kultur') as Category;
  return {
    eigen: true,
    vorlaeufig: nr < 0,
    angelegtVon: typeof o.angelegtVon === 'string' ? o.angelegtVon : null,
    nr,
    name,
    category,
    station: typeof o.station === 'string' && o.station ? o.station : ABSEITS,
    stationLabel: typeof o.stationLabel === 'string' ? o.stationLabel : '',
    area: o.area === 'ausflug' ? 'ausflug' : 'zentrum',
    lat,
    lng,
    placeId: null,
    descriptionHtml: typeof o.descriptionHtml === 'string' ? o.descriptionHtml : '',
    isFriendTip: Boolean(o.isFriendTip),
    book: typeof o.book === 'string' && o.book ? o.book : undefined,
    bookTitle: typeof o.bookTitle === 'string' && o.bookTitle ? o.bookTitle : undefined,
    needsBooking: Boolean(o.needsBooking),
    closedDay: typeof o.closedDay === 'string' && o.closedDay ? o.closedDay : null,
    cashOnly: Boolean(o.cashOnly),
  };
}

/** Bringt Fremd- und Altdaten auf die aktuelle Form, ohne je zu werfen. */
function normalize(raw: unknown): PlanState {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<PlanState>;

  if (o.days && typeof o.days === 'object') {
    for (const [date, entry] of Object.entries(o.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !entry || typeof entry !== 'object') continue;
      const e = entry as Partial<DayEntry>;
      base.days[date] = {
        placeNrs: Array.isArray(e.placeNrs) ? e.placeNrs.filter((n) => Number.isInteger(n)) : [],
        note: typeof e.note === 'string' ? e.note : '',
      };
    }
  }
  if (Array.isArray(o.done)) base.done = o.done.filter((n) => Number.isInteger(n));
  if (o.bookings && typeof o.bookings === 'object') {
    for (const [k, v] of Object.entries(o.bookings)) base.bookings[k] = Boolean(v);
  }
  if (o.packing && typeof o.packing === 'object') {
    for (const [k, v] of Object.entries(o.packing)) base.packing[k] = Boolean(v);
  }
  if (Array.isArray(o.packingExtra)) {
    base.packingExtra = o.packingExtra.filter((s): s is string => typeof s === 'string');
  }
  if (Array.isArray(o.expenses)) {
    base.expenses = o.expenses
      .filter((e): e is Expense => !!e && typeof e === 'object')
      .map((e) => ({
        id: String(e.id ?? crypto.randomUUID()),
        date: String(e.date ?? ''),
        label: String(e.label ?? ''),
        yen: Number(e.yen) || 0,
        payer: String(e.payer ?? ''),
        station: String(e.station ?? ''),
      }));
  }
  if (Array.isArray(o.customPlaces)) {
    for (const roh of o.customPlaces) {
      const ort = normalisiereOrt(roh);
      // Zwei Orte mit derselben Nummer wären in der Karte nicht auflösbar.
      if (ort && !base.customPlaces.some((x) => x.nr === ort.nr)) base.customPlaces.push(ort);
    }
  }
  if (typeof o.updatedAt === 'string') base.updatedAt = o.updatedAt;
  return base;
}

function load(): PlanState {
  if (typeof localStorage === 'undefined') return emptyState();
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : emptyState();
  } catch {
    return emptyState();
  }
}

/** Zustand des Planers. Wird nie neu zugewiesen, nur mutiert. */
export const plan: PlanState = $state(load());

let timer: ReturnType<typeof setTimeout> | undefined;

/** Schreibt gesammelt, damit Tippen im Notizfeld nicht jeden Anschlag speichert. */
function persist() {
  if (typeof localStorage === 'undefined') return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      plan.updatedAt = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify(plan));
    } catch {
      // Kein Speicher verfügbar — die Sitzung läuft ohne Persistenz weiter.
    }
  }, 300);
}

/** Alle Mutationen laufen hierüber, damit kein Schreibvorgang vergessen wird. */
function mutate(fn: () => void, ...änderungen: Aenderung[]) {
  fn();
  persist();
  if (beobachter && änderungen.length) beobachter(änderungen);
}

/**
 * Übernimmt einen Stand aus der Ablage. Anders als `importJson` löst das
 * **keine** Meldung an den Abgleich aus — sonst würde der gerade geholte Stand
 * unmittelbar wieder hochgeschrieben.
 */
export function uebernehmeFremdstand(next: Partial<PlanState>) {
  const voll = normalize({ ...emptyState(), ...next });
  plan.days = voll.days;
  plan.done = voll.done;
  plan.bookings = voll.bookings;
  plan.packing = voll.packing;
  plan.packingExtra = voll.packingExtra;
  plan.expenses = voll.expenses;
  plan.customPlaces = voll.customPlaces;
  persist();
}

/** Liegt auf diesem Gerät überhaupt etwas, das verloren gehen könnte? */
export function hatInhalt(): boolean {
  return (
    Object.values(plan.days).some((d) => d.placeNrs.length > 0 || d.note !== '') ||
    plan.done.length > 0 ||
    plan.expenses.length > 0 ||
    plan.customPlaces.length > 0 ||
    plan.packingExtra.length > 0 ||
    Object.values(plan.bookings).some(Boolean) ||
    Object.values(plan.packing).some(Boolean)
  );
}

// ------------------------------------------------------------------ Tagesplan

function dayOf(date: string): DayEntry {
  plan.days[date] ??= { placeNrs: [], note: '' };
  return plan.days[date];
}

export function placesOfDay(date: string): number[] {
  return plan.days[date]?.placeNrs ?? [];
}

/** Tag, auf dem ein Ort liegt, oder null. Ein Ort kann nur auf einem Tag liegen. */
export function dayOfPlace(nr: number): string | null {
  for (const [date, entry] of Object.entries(plan.days)) {
    if (entry.placeNrs.includes(nr)) return date;
  }
  return null;
}

/**
 * Darf dieser Ort auf einen Reisetag? Orte abseits der Route nicht.
 *
 * Die Prüfung steht hier und nicht nur in der Oberfläche: Ein Knopf lässt sich
 * ausblenden, eine Nummer per Tastatur trotzdem eintragen, und ein importierter
 * Plan bringt womöglich eine mit.
 */
export function istPlanbar(nr: number): boolean {
  const eigen = plan.customPlaces.find((p) => p.nr === nr);
  if (eigen) return !istAbseits(eigen);
  return placeByNr(nr) !== undefined;
}

export function addToDay(date: string, nr: number, index?: number) {
  if (!istPlanbar(nr)) return;
  // Der Ort kann von einem anderen Tag kommen — dann ändern sich zwei Tage.
  const vorher = dayOfPlace(nr);
  const betroffen: Aenderung[] = [{ art: 'tag', datum: date }];
  if (vorher && vorher !== date) betroffen.push({ art: 'tag', datum: vorher });

  mutate(() => {
    removeFromAnyDay(nr, false);
    const list = dayOf(date).placeNrs;
    const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length));
    list.splice(at, 0, nr);
  }, ...betroffen);
}

export function removeFromDay(date: string, nr: number) {
  mutate(
    () => {
      const entry = plan.days[date];
      if (!entry) return;
      entry.placeNrs = entry.placeNrs.filter((n) => n !== nr);
    },
    { art: 'tag', datum: date },
  );
}

function removeFromAnyDay(nr: number, doPersist = true) {
  const act = () => {
    for (const entry of Object.values(plan.days)) {
      const i = entry.placeNrs.indexOf(nr);
      if (i !== -1) entry.placeNrs.splice(i, 1);
    }
  };
  if (doPersist) mutate(act);
  else act();
}

export function unplacePlace(nr: number) {
  const datum = dayOfPlace(nr);
  removeFromAnyDay(nr);
  if (datum && beobachter) beobachter([{ art: 'tag', datum }]);
}

/** Verschiebt einen Ort innerhalb eines Tages. */
export function moveWithinDay(date: string, from: number, to: number) {
  mutate(() => {
    const list = plan.days[date]?.placeNrs;
    if (!list || from === to) return;
    const [nr] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(to, list.length)), 0, nr);
  }, { art: 'tag', datum: date });
}

export function setNote(date: string, note: string) {
  mutate(
    () => {
      dayOf(date).note = note;
    },
    { art: 'notiz', datum: date },
  );
}

// -------------------------------------------------------------------- Besucht

export const isDone = (nr: number) => plan.done.includes(nr);

export function toggleDone(nr: number) {
  mutate(
    () => {
      const i = plan.done.indexOf(nr);
      if (i === -1) plan.done.push(nr);
      else plan.done.splice(i, 1);
    },
    { art: 'marke', typ: 'done', schluessel: String(nr) },
  );
}

// --------------------------------------------------------- Buchungen & Packen

export function toggleBooking(id: string) {
  mutate(
    () => {
      plan.bookings[id] = !plan.bookings[id];
    },
    { art: 'marke', typ: 'booking', schluessel: id },
  );
}

export function togglePacking(id: string) {
  mutate(
    () => {
      plan.packing[id] = !plan.packing[id];
    },
    { art: 'marke', typ: 'packing', schluessel: id },
  );
}

export function addPackingItem(label: string) {
  const clean = label.trim();
  if (!clean) return;
  // Der Eintrag selbst wird als Häkchen-Zeile `extra:<Text>` abgeglichen: Die
  // Existenz der Zeile ist der Eintrag, `wert` das Häkchen. Dafür braucht es
  // keine eigene Tabelle.
  mutate(
    () => {
      if (!plan.packingExtra.includes(clean)) plan.packingExtra.push(clean);
      plan.packing[`extra:${clean}`] ??= false;
    },
    { art: 'marke', typ: 'packing', schluessel: `extra:${clean}` },
  );
}

export function removePackingItem(label: string) {
  mutate(
    () => {
      plan.packingExtra = plan.packingExtra.filter((s) => s !== label);
      delete plan.packing[`extra:${label}`];
    },
    { art: 'marke', typ: 'packing', schluessel: `extra:${label}` },
  );
}

// --------------------------------------------------------------------- Budget

export function addExpense(e: Omit<Expense, 'id'>) {
  const id = crypto.randomUUID();
  mutate(
    () => {
      plan.expenses.unshift({ ...e, id });
    },
    { art: 'ausgabe-neu', id },
  );
}

export function removeExpense(id: string) {
  mutate(
    () => {
      plan.expenses = plan.expenses.filter((e) => e.id !== id);
    },
    { art: 'ausgabe-weg', id },
  );
}

// ------------------------------------------------------------ Export / Import

export function exportJson(): string {
  return JSON.stringify({ ...plan, exportedAt: new Date().toISOString() }, null, 2);
}

/**
 * Übernimmt eine exportierte Datei. Gibt zurück, ob die Datei lesbar war —
 * eine kaputte Datei darf den bestehenden Plan nicht zerstören.
 */
export function importJson(text: string): { ok: boolean; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' };
  }
  const next = normalize(parsed);
  mutate(
    () => {
      plan.days = next.days;
      plan.done = next.done;
      plan.bookings = next.bookings;
      plan.packing = next.packing;
      plan.packingExtra = next.packingExtra;
      plan.expenses = next.expenses;
      plan.customPlaces = next.customPlaces;
    },
    { art: 'alles' },
  );
  return { ok: true };
}

export function resetAll() {
  const fresh = emptyState();
  mutate(
    () => {
      plan.days = fresh.days;
      plan.done = fresh.done;
      plan.bookings = fresh.bookings;
      plan.packing = fresh.packing;
      plan.packingExtra = fresh.packingExtra;
      plan.expenses = fresh.expenses;
      plan.customPlaces = fresh.customPlaces;
    },
    { art: 'alles' },
  );
}

/** Zählt, wie viele Orte insgesamt eingeplant sind. */
export function plannedCount(): number {
  return Object.values(plan.days).reduce((sum, d) => sum + d.placeNrs.length, 0);
}

// ------------------------------------------------------------- Eigene Orte ---

/**
 * Nächste vorläufige Nummer: negativ, absteigend.
 *
 * Positive Nummern gehören der Datenbanksequenz (ab 165) und dem gedruckten
 * Reiseband (1–164). Eine negative kann mit keiner von beiden kollidieren und
 * ist auf den ersten Blick als „noch nicht endgültig" erkennbar.
 */
function naechsteVorlaeufigeNr(): number {
  const kleinste = plan.customPlaces.reduce((m, p) => Math.min(m, p.nr), 0);
  return Math.min(kleinste, 0) - 1;
}

export type NeuerOrt = {
  name: string;
  category: Category;
  station: string;
  stationLabel: string;
  area: 'zentrum' | 'ausflug';
  lat: number;
  lng: number;
  descriptionHtml?: string;
  book?: string;
  bookTitle?: string;
  closedDay?: string | null;
  needsBooking?: boolean;
  cashOnly?: boolean;
};

/** Legt einen Ort an und gibt seine (vorläufige) Nummer zurück. */
export function ortAnlegen(daten: NeuerOrt, angelegtVon: string | null = null): number {
  const nr = naechsteVorlaeufigeNr();
  const ort = normalisiereOrt({ ...daten, nr, angelegtVon });
  if (!ort) throw new Error('Der Ort ist unvollständig.');
  mutate(
    () => {
      plan.customPlaces.push(ort);
    },
    { art: 'ort', nr },
  );
  return nr;
}

export function ortAendern(nr: number, daten: Partial<NeuerOrt>) {
  const i = plan.customPlaces.findIndex((p) => p.nr === nr);
  if (i === -1) return;
  const zusammen = normalisiereOrt({ ...plan.customPlaces[i], ...daten, nr });
  if (!zusammen) return;
  mutate(
    () => {
      plan.customPlaces[i] = zusammen;
      // Ein Ort, der abseits der Route landet, darf auf keinem Tag bleiben.
      if (istAbseits(zusammen)) removeFromAnyDay(nr, false);
    },
    { art: 'ort', nr },
  );
}

export function ortLoeschen(nr: number) {
  if (!plan.customPlaces.some((p) => p.nr === nr)) return;
  const datum = dayOfPlace(nr);
  mutate(
    () => {
      plan.customPlaces = plan.customPlaces.filter((p) => p.nr !== nr);
      removeFromAnyDay(nr, false);
      const i = plan.done.indexOf(nr);
      if (i !== -1) plan.done.splice(i, 1);
    },
    { art: 'ort-weg', nr },
    ...(datum ? ([{ art: 'tag', datum }] as Aenderung[]) : []),
    { art: 'marke', typ: 'done', schluessel: String(nr) },
  );
}

/**
 * Trägt die endgültige Nummer eines Orts nach, sobald die Datenbank sie
 * vergeben hat — im Ort selbst **und** an jeder Stelle, die ihn referenziert.
 *
 * Löst absichtlich keine Meldung an den Abgleich aus: Der Aufrufer ist der
 * Abgleich, der die Zeile gerade geschrieben hat.
 */
export function nummerErsetzen(alt: number, neu: number) {
  const i = plan.customPlaces.findIndex((p) => p.nr === alt);
  if (i === -1 || alt === neu) return;
  plan.customPlaces[i] = { ...plan.customPlaces[i], nr: neu, vorlaeufig: false };

  for (const tag of Object.values(plan.days)) {
    const j = tag.placeNrs.indexOf(alt);
    if (j !== -1) tag.placeNrs[j] = neu;
  }
  const d = plan.done.indexOf(alt);
  if (d !== -1) plan.done[d] = neu;

  persist();
}

/** Orte, die noch keine endgültige Nummer haben. */
export function vorlaeufigeOrte(): EigenerOrt[] {
  return plan.customPlaces.filter((p) => p.vorlaeufig);
}
