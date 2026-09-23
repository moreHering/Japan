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
  places,
  stationLabelOf,
  type Category,
  type EigenerOrt,
  type Place,
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
  /**
   * Korrekturen an bestehenden Orten, nach Nummer.
   *
   * Der Schlüssel ist die Nummer als Zeichenkette, weil JSON keine Zahlen als
   * Objektschlüssel kennt — ein Export und Wiedereinlesen würde sie sonst
   * stillschweigend verwandeln.
   */
  korrekturen: Record<string, Korrektur>;
  /** Zeitpunkt der letzten Änderung, für den Export sichtbar. */
  updatedAt: string | null;
};

/**
 * Was sich geändert hat — nicht der neue Wert, sondern die betroffene Zeile.
 * Der Abgleich liest den Wert beim Senden aus dem aktuellen Zustand. Dadurch
 * lassen sich mehrere Änderungen an derselben Zeile zusammenfassen, und
 * gesendet wird immer der jüngste Stand statt einer Kette alter Zwischenwerte.
 */
/**
 * Eine Korrektur an einem Ort.
 *
 * `undefined` oder `null` in einem Feld heißt **nicht korrigiert** — es gilt
 * der Wert aus dem Reiseband. Nur dadurch lässt sich eine Korrektur
 * zurücknehmen, ohne den Buchwert zu verlieren; eine Vollkopie hätte ihn nach
 * der ersten Änderung für immer überschrieben.
 *
 * Ein Ort mit `versteckt` verschwindet aus Liste, Karte und Tagesplanung. Seine
 * **Nummer bleibt belegt**: Sie steht im gedruckten Reiseband, und würde sie
 * neu vergeben, zeigte das Buch auf etwas anderes.
 */
export type Korrektur = {
  nr: number;
  name?: string | null;
  category?: Category | null;
  station?: string | null;
  area?: 'zentrum' | 'ausflug' | null;
  lat?: number | null;
  lng?: number | null;
  descriptionHtml?: string | null;
  book?: string | null;
  closedDay?: string | null;
  needsBooking?: boolean | null;
  cashOnly?: boolean | null;
  unterkunft?: boolean | null;
  versteckt: boolean;
  /** Freie Wörter. Immer ein Array, nie null — dann muss nirgends geprüft werden. */
  schlagworte: string[];
};

export type Aenderung =
  | { art: 'tag'; datum: string }
  | { art: 'notiz'; datum: string }
  | { art: 'marke'; typ: 'done' | 'booking' | 'packing'; schluessel: string }
  | { art: 'ausgabe-neu'; id: string }
  | { art: 'ausgabe-weg'; id: string }
  | { art: 'ort'; nr: number }
  | { art: 'ort-weg'; nr: number }
  | { art: 'korrektur'; nr: number }
  | { art: 'korrektur-weg'; nr: number }
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
    korrekturen: {},
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
    // Ein selbst angelegter Ort kann eure Unterkunft sein — dann ist er kein
    // Vorschlag, sondern die Buchung.
    uebernachtung: o.uebernachtung === 'gebucht' ? ('gebucht' as const) : undefined,
  };
}

const WOCHENTAGE = new Set(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);

/**
 * Macht aus unbekannten Daten eine gültige Korrektur — oder null.
 *
 * Unterscheidet streng zwischen „Feld fehlt" und „Feld ist gesetzt": Ein
 * `undefined` bleibt undefined und heißt damit unkorrigiert. Ein falscher Wert
 * wird **nicht** durch einen Ersatzwert gerettet, sondern verworfen — sonst
 * stünde nach einem kaputten Import eine erfundene Koordinate in der Karte, und
 * genau das darf auf der Reise nicht passieren.
 */
function normalisiereKorrektur(raw: unknown, nrAusSchluessel?: number): Korrektur | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<Korrektur>;
  const nr = Number.isInteger(Number(o.nr)) ? Number(o.nr) : Number(nrAusSchluessel);
  if (!Number.isInteger(nr) || nr === 0) return null;

  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const zahl = (v: unknown, min: number, max: number) => {
    const n = Number(v);
    return v === null || v === undefined || !Number.isFinite(n) || n < min || n > max
      ? undefined
      : n;
  };
  const jaNein = (v: unknown) => (typeof v === 'boolean' ? v : undefined);

  const k: Korrektur = {
    nr,
    versteckt: o.versteckt === true,
    schlagworte: Array.isArray(o.schlagworte)
      ? [...new Set(o.schlagworte.filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim()))]
      : [],
  };

  const name = text(o.name);
  if (name) k.name = name;
  if (KATEGORIEN.has(o.category as Category)) k.category = o.category as Category;
  const station = text(o.station);
  if (station) k.station = station;
  if (o.area === 'zentrum' || o.area === 'ausflug') k.area = o.area;

  // Koordinaten nur als Paar. Eine halbe Korrektur würde den Ort auf den
  // Nullmeridian oder den Äquator ziehen, ohne dass es auffällt.
  const lat = zahl(o.lat, -90, 90);
  const lng = zahl(o.lng, -180, 180);
  if (lat !== undefined && lng !== undefined) {
    k.lat = lat;
    k.lng = lng;
  }

  if (typeof o.descriptionHtml === 'string') k.descriptionHtml = o.descriptionHtml;
  if (o.book === null) k.book = null;
  else {
    const buch = text(o.book);
    if (buch) k.book = buch;
  }
  // Null ist hier ein echter Wert: „geschlossen am" ausdrücklich geleert.
  if (o.closedDay === null) k.closedDay = null;
  else {
    const tag = text(o.closedDay);
    if (tag && WOCHENTAGE.has(tag)) k.closedDay = tag;
  }
  const nb = jaNein(o.needsBooking);
  if (nb !== undefined) k.needsBooking = nb;
  const co = jaNein(o.cashOnly);
  if (co !== undefined) k.cashOnly = co;
  const uk = jaNein(o.unterkunft);
  if (uk !== undefined) k.unterkunft = uk;

  return k;
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
  if (o.korrekturen && typeof o.korrekturen === 'object') {
    for (const [schluessel, roh] of Object.entries(o.korrekturen)) {
      const k = normalisiereKorrektur(roh, Number(schluessel));
      if (k) base.korrekturen[String(k.nr)] = k;
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
  plan.korrekturen = voll.korrekturen;
  persist();
}

/** Liegt auf diesem Gerät überhaupt etwas, das verloren gehen könnte? */
export function hatInhalt(): boolean {
  return (
    Object.values(plan.days).some((d) => d.placeNrs.length > 0 || d.note !== '') ||
    plan.done.length > 0 ||
    plan.expenses.length > 0 ||
    plan.customPlaces.length > 0 ||
    // Korrekturen zählen mit: Wer eine falsche Koordinate gerichtet hat, würde
    // sie sonst beim Überschreiben verlieren, ohne gewarnt zu werden.
    Object.keys(plan.korrekturen).length > 0 ||
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
      /*
       * `korrekturen` fehlte hier.
       *
       * `exportJson()` schreibt sie mit (`...plan`), der Import übernahm sie
       * nicht — ein Export-Import-Umlauf verlor also **jede** Ortskorrektur, und
       * zwar stillschweigend: Die Datei enthielt sie, der Plan danach nicht mehr.
       * Aufgefallen beim Erweitern des Exports, nicht durch eine Meldung.
       *
       * Für eine Reise ist das der teure Fall: Eine korrigierte Koordinate ist der
       * Unterschied zwischen dem richtigen Laden und einem Punkt zwei Straßen
       * weiter, und wer eine Sicherung zurückspielt, erwartet sie zurück.
       */
      plan.korrekturen = next.korrekturen;
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
      /*
       * `korrekturen` fehlte hier genauso wie im Import — derselbe Fehler zweimal,
       * gefunden durch die Prüfung, die den Umlauf nachstellt.
       *
       * Folge war: „Alles zurücksetzen" ließ jede Ortskorrektur stehen. Ein
       * ausgeblendeter Ort blieb ausgeblendet, eine verschobene Koordinate blieb
       * verschoben, und der Knopf behauptete das Gegenteil. Bei einem Knopf, der
       * „alles" verspricht, ist das der schlimmere Fall von beiden: Man drückt ihn
       * gerade dann, wenn man einen sauberen Anfang braucht.
       */
      plan.korrekturen = fresh.korrekturen;
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
 * Positive Nummern gehören der Datenbanksequenz (ab 1001, seit 0010) und dem
 * Reiseband (1–1000). Eine negative kann mit keiner von beiden kollidieren und
 * ist auf den ersten Blick als „noch nicht endgültig" erkennbar.
 */
function naechsteVorlaeufigeNr(): number {
  const kleinste = plan.customPlaces.reduce((m, p) => Math.min(m, p.nr), 0);
  return Math.min(kleinste, 0) - 1;
}

// ============================================================== Korrekturen ===

/**
 * Alle Orte, wie sie die App zeigen soll: die festen aus dem Reiseband, die
 * selbst angelegten, beide mit angewandten Korrekturen, ausgeblendete heraus.
 *
 * Bewusst eine Funktion und kein `$derived`-Export: So kann jede Komponente
 * `$derived(sichtbareOrte())` schreiben und bekommt Nachführung frei, ohne dass
 * dieses Modul eine Ableitung exportieren muss, die sich nicht neu zuweisen
 * lässt.
 */
export function sichtbareOrte(): Place[] {
  return alleOrteMitKorrekturen().filter((p) => !plan.korrekturen[String(p.nr)]?.versteckt);
}

/** Auch die ausgeblendeten — die Ansicht muss sie zum Wiederholen anbieten. */
export function alleOrteMitKorrekturen(): Place[] {
  return [...places, ...plan.customPlaces].map((p) => korrekturAnwenden(p));
}

/** Nur die ausgeblendeten, zum Wiedereinblenden. */
export function versteckteOrte(): Place[] {
  return alleOrteMitKorrekturen().filter((p) => plan.korrekturen[String(p.nr)]?.versteckt);
}

/** Die Schlagworte eines Ortes — egal ob fest oder selbst angelegt. */
export function schlagworteVon(nr: number): string[] {
  return plan.korrekturen[String(nr)]?.schlagworte ?? [];
}

/** Alle vergebenen Schlagworte, für Vorschläge und den Filter. */
export function alleSchlagworte(): string[] {
  const s = new Set<string>();
  for (const k of Object.values(plan.korrekturen)) for (const w of k.schlagworte) s.add(w);
  return [...s].sort((a, b) => a.localeCompare(b, 'de'));
}

/** Weicht dieser Ort vom Reiseband ab? Die Ansicht macht das sichtbar. */
export function istKorrigiert(nr: number): boolean {
  const k = plan.korrekturen[String(nr)];
  if (!k) return false;
  // Auch hier gilt `null` als Korrektur — siehe korrekturLeer.
  return Object.entries(k).some(
    ([feld, wert]) =>
      feld !== 'nr' && feld !== 'schlagworte' && feld !== 'versteckt' && wert !== undefined,
  );
}

/**
 * Legt die Korrektur über einen Ort. Nur gesetzte Felder gewinnen — `undefined`
 * heißt unkorrigiert, und der Buchwert bleibt stehen.
 */
function korrekturAnwenden(p: Place): Place {
  const k = plan.korrekturen[String(p.nr)];
  if (!k) return p;
  const neu: Place = { ...p };
  if (k.name !== undefined && k.name !== null) neu.name = k.name;
  if (k.category !== undefined && k.category !== null) neu.category = k.category;
  if (k.station !== undefined && k.station !== null) {
    neu.station = k.station;
    neu.stationLabel = stationLabelOf(k.station);
  }
  if (k.area !== undefined && k.area !== null) neu.area = k.area;
  if (k.lat !== undefined && k.lat !== null && k.lng !== undefined && k.lng !== null) {
    neu.lat = k.lat;
    neu.lng = k.lng;
    // Der Google-Maps-Verweis zeigte sonst weiter auf die alte Stelle — und die
    // Navigation vor Ort geht über genau diesen Verweis.
    neu.placeId = null;
  }
  if (k.descriptionHtml !== undefined && k.descriptionHtml !== null) {
    neu.descriptionHtml = k.descriptionHtml;
  }
  // `null` ist hier ein Wert, kein Fehlen: „dieser Ort steht nicht im Buch".
  // Damit lässt sich ein falsches 📖 entfernen — und 72 der Zuordnungen sind
  // über Namensabgleich entstanden, also genau dafür gedacht.
  if (k.book !== undefined) {
    neu.book = k.book ?? undefined;
    if (k.book === null) neu.bookTitle = undefined;
  }
  if (k.closedDay !== undefined) neu.closedDay = k.closedDay;
  if (k.needsBooking !== undefined && k.needsBooking !== null) neu.needsBooking = k.needsBooking;
  if (k.cashOnly !== undefined && k.cashOnly !== null) neu.cashOnly = k.cashOnly;
  if (k.unterkunft !== undefined && k.unterkunft !== null) {
    neu.uebernachtung = k.unterkunft ? 'gebucht' : undefined;
    if (k.unterkunft) neu.category = 'hotel';
  }
  return neu;
}

/** Holt die Korrektur zu einer Nummer oder legt eine leere an. */
function korrekturFuer(nr: number): Korrektur {
  return plan.korrekturen[String(nr)] ?? { nr, versteckt: false, schlagworte: [] };
}

/**
 * Ist die Korrektur inhaltsleer? Dann darf die Zeile ganz weg.
 *
 * Geprüft wird auf `undefined`, **nicht** auf `null`. Bei `book` und `closedDay`
 * ist `null` ein ausdrücklicher Wert: „steht nicht im Buch" beziehungsweise
 * „hat keinen Schließtag". Würde `null` hier als leer gelten, hätte genau die
 * Korrektur keinen Bestand, die ein falsches 📖 entfernt — und die 72
 * Zuordnungen sind über Namensabgleich entstanden, also der Hauptfall.
 */
function korrekturLeer(k: Korrektur): boolean {
  return (
    !k.versteckt &&
    k.schlagworte.length === 0 &&
    Object.entries(k).every(
      ([feld, wert]) =>
        feld === 'nr' || feld === 'versteckt' || feld === 'schlagworte' || wert === undefined,
    )
  );
}

/** Schreibt eine Korrektur weg — oder löscht die Zeile, wenn nichts übrig ist. */
function korrekturSchreiben(k: Korrektur) {
  const schluessel = String(k.nr);
  if (korrekturLeer(k)) {
    if (!(schluessel in plan.korrekturen)) return;
    mutate(
      () => {
        delete plan.korrekturen[schluessel];
      },
      { art: 'korrektur-weg', nr: k.nr },
    );
    return;
  }
  mutate(
    () => {
      plan.korrekturen[schluessel] = k;
      // Ein Ort, der abseits der Route landet oder verschwindet, darf auf
      // keinem Reisetag stehenbleiben.
      if (k.versteckt || k.station === ABSEITS) removeFromAnyDay(k.nr, false);
    },
    { art: 'korrektur', nr: k.nr },
  );
}

/** Gehört die Nummer zu einem selbst angelegten Ort? */
function istEigeneNr(nr: number): boolean {
  return plan.customPlaces.some((p) => p.nr === nr);
}

/**
 * Schlagworte setzen — für feste und eigene Orte gleich.
 *
 * Auch bei eigenen Orten landen sie in der Korrekturtabelle, nicht im Ort
 * selbst. Damit gibt es genau eine Stelle, an der Schlagworte stehen, und der
 * Filter muss nicht zwei Quellen zusammensuchen.
 */
export function schlagworteSetzen(nr: number, worte: string[]) {
  const sauber = [...new Set(worte.map((w) => w.trim()).filter(Boolean))];
  const k = { ...korrekturFuer(nr), schlagworte: sauber };
  korrekturSchreiben(k);
}

/** Ein Ort aus- oder wieder einblenden. Nur für feste Orte gedacht. */
export function ortVerstecken(nr: number, versteckt = true) {
  korrekturSchreiben({ ...korrekturFuer(nr), versteckt });
}

/**
 * Ein Ort weg.
 *
 * Bei einem selbst angelegten heißt das löschen. Bei einem festen heißt es
 * ausblenden: Seine Nummer steht im gedruckten Reiseband und wird nie neu
 * vergeben, sonst zeigte das Buch später auf etwas anderes. Umkehrbar.
 */
export function ortEntfernen(nr: number) {
  if (istEigeneNr(nr)) ortLoeschen(nr);
  else ortVerstecken(nr, true);
}

/** Eine einzelne Korrektur zurücknehmen — der Buchwert gilt wieder. */
export function korrekturZuruecknehmen(nr: number, feld?: keyof Korrektur) {
  const vorhanden = plan.korrekturen[String(nr)];
  if (!vorhanden) return;
  if (!feld) {
    // Alles zurück, aber Schlagworte und Ausblendung bleiben: Die sind keine
    // Korrektur am Buchwert, sondern eigene Angaben.
    korrekturSchreiben({
      nr,
      versteckt: vorhanden.versteckt,
      schlagworte: vorhanden.schlagworte,
    });
    return;
  }
  const k: Korrektur = { ...vorhanden };
  delete k[feld];
  if (feld === 'lat' || feld === 'lng') {
    delete k.lat;
    delete k.lng;
  }
  korrekturSchreiben(k);
}

export type NeuerOrt = {
  name: string;
  /** Hier wird geschlafen. */
  unterkunft?: boolean;
  category: Category;
  station: string;
  stationLabel: string;
  area: 'zentrum' | 'ausflug';
  lat: number;
  lng: number;
  descriptionHtml?: string;
  /** `null` heißt ausdrücklich „steht nicht im Buch" — zum Entfernen eines 📖. */
  book?: string | null;
  bookTitle?: string;
  closedDay?: string | null;
  needsBooking?: boolean;
  cashOnly?: boolean;
};

/** Legt einen Ort an und gibt seine (vorläufige) Nummer zurück. */
export function ortAnlegen(daten: NeuerOrt, angelegtVon: string | null = null): number {
  const nr = naechsteVorlaeufigeNr();
  const ort = normalisiereOrt({
    ...daten,
    nr,
    angelegtVon,
    uebernachtung: daten.unterkunft ? 'gebucht' : undefined,
  });
  if (!ort) throw new Error('Der Ort ist unvollständig.');
  mutate(
    () => {
      plan.customPlaces.push(ort);
    },
    { art: 'ort', nr },
  );
  return nr;
}

/**
 * Ort ändern — gleiche Schnittstelle für feste und eigene.
 *
 * Ein eigener Ort wird an der Quelle geändert; er gehört euch ganz. Ein fester
 * Ort aus dem Reiseband bekommt eine **Korrektur** obendrauf, weil der Buchwert
 * erhalten bleiben muss: Nur so lässt sich eine Änderung zurücknehmen, und nur
 * so bleibt sichtbar, was vom Buch abweicht.
 *
 * Die Oberfläche muss diesen Unterschied nicht kennen.
 */
export function ortAendern(nr: number, daten: Partial<NeuerOrt>) {
  if (istEigeneNr(nr)) {
    ortAendernEigen(nr, daten);
    return;
  }
  // Fester Ort: als Korrektur ablegen. Nur die übergebenen Felder werden
  // angefasst — was nicht drinsteht, bleibt unkorrigiert.
  const k: Korrektur = { ...korrekturFuer(nr) };
  if ('name' in daten) k.name = daten.name?.trim() || undefined;
  if ('category' in daten) k.category = daten.category;
  if ('station' in daten) k.station = daten.station;
  if ('area' in daten) k.area = daten.area;
  if ('lat' in daten || 'lng' in daten) {
    const lat = Number(daten.lat);
    const lng = Number(daten.lng);
    // Nur als Paar, sonst zieht eine halbe Korrektur den Ort auf den Äquator.
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      k.lat = lat;
      k.lng = lng;
    }
  }
  if ('descriptionHtml' in daten) k.descriptionHtml = daten.descriptionHtml;
  if ('book' in daten) k.book = daten.book === undefined ? undefined : daten.book;
  if ('closedDay' in daten) k.closedDay = daten.closedDay;
  if ('needsBooking' in daten) k.needsBooking = daten.needsBooking;
  if ('cashOnly' in daten) k.cashOnly = daten.cashOnly;
  if ('unterkunft' in daten) k.unterkunft = daten.unterkunft;
  korrekturSchreiben(k);
}

function ortAendernEigen(nr: number, daten: Partial<NeuerOrt>) {
  const i = plan.customPlaces.findIndex((p) => p.nr === nr);
  if (i === -1) return;
  const zusammen = normalisiereOrt({
    ...plan.customPlaces[i],
    ...daten,
    nr,
    uebernachtung:
      daten.unterkunft === undefined
        ? plan.customPlaces[i].uebernachtung
        : daten.unterkunft
          ? 'gebucht'
          : undefined,
  });
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

  // Auch Schlagworte und Ausblendung müssen mitwandern. Bleiben sie an der
  // vorläufigen Nummer hängen, verliert der Ort beim ersten Abgleich seine
  // Schlagworte — und die Waise bliebe für immer im Zustand stehen.
  const alterSchluessel = String(alt);
  const k = plan.korrekturen[alterSchluessel];
  if (k) {
    delete plan.korrekturen[alterSchluessel];
    plan.korrekturen[String(neu)] = { ...k, nr: neu };
  }

  persist();
}

/** Orte, die noch keine endgültige Nummer haben. */
export function vorlaeufigeOrte(): EigenerOrt[] {
  return plan.customPlaces.filter((p) => p.vorlaeufig);
}
