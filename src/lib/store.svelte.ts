/**
 * Der veränderliche Teil der Reiseplanung.
 *
 * Alles, was auf der Seite bearbeitet wird, liegt in genau einem Zustandsobjekt
 * und wird in den localStorage geschrieben. Das ist die bewusste Beschränkung
 * dieser Lösung: die Daten bleiben auf dem Gerät, auf dem sie entstanden sind.
 * Der Abgleich zwischen mehreren Geräten läuft über `exportJson` / `importJson`.
 *
 * Alle Zugriffe auf den localStorage sind gekapselt und dürfen fehlschlagen
 * (privates Fenster, blockierte Site-Daten) — dann arbeitet die Seite einfach
 * ohne Persistenz weiter, statt mit einer Exception abzubrechen.
 *
 * Diese Datei ist die einzige Stelle, die etwas über Speicherung weiß. Ein
 * Backend würde `load` und `persist` ersetzen, nicht die Oberfläche.
 */

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
  /** Zeitpunkt der letzten Änderung, für den Export sichtbar. */
  updatedAt: string | null;
};

function emptyState(): PlanState {
  return {
    version: VERSION,
    days: {},
    done: [],
    bookings: {},
    packing: {},
    packingExtra: [],
    expenses: [],
    updatedAt: null,
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
function mutate(fn: () => void) {
  fn();
  persist();
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

export function addToDay(date: string, nr: number, index?: number) {
  mutate(() => {
    removeFromAnyDay(nr, false);
    const list = dayOf(date).placeNrs;
    const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length));
    list.splice(at, 0, nr);
  });
}

export function removeFromDay(date: string, nr: number) {
  mutate(() => {
    const entry = plan.days[date];
    if (!entry) return;
    entry.placeNrs = entry.placeNrs.filter((n) => n !== nr);
  });
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
  removeFromAnyDay(nr);
}

/** Verschiebt einen Ort innerhalb eines Tages. */
export function moveWithinDay(date: string, from: number, to: number) {
  mutate(() => {
    const list = plan.days[date]?.placeNrs;
    if (!list || from === to) return;
    const [nr] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(to, list.length)), 0, nr);
  });
}

export function setNote(date: string, note: string) {
  mutate(() => {
    dayOf(date).note = note;
  });
}

// -------------------------------------------------------------------- Besucht

export const isDone = (nr: number) => plan.done.includes(nr);

export function toggleDone(nr: number) {
  mutate(() => {
    const i = plan.done.indexOf(nr);
    if (i === -1) plan.done.push(nr);
    else plan.done.splice(i, 1);
  });
}

// --------------------------------------------------------- Buchungen & Packen

export function toggleBooking(id: string) {
  mutate(() => {
    plan.bookings[id] = !plan.bookings[id];
  });
}

export function togglePacking(id: string) {
  mutate(() => {
    plan.packing[id] = !plan.packing[id];
  });
}

export function addPackingItem(label: string) {
  const clean = label.trim();
  if (!clean) return;
  mutate(() => {
    if (!plan.packingExtra.includes(clean)) plan.packingExtra.push(clean);
  });
}

export function removePackingItem(label: string) {
  mutate(() => {
    plan.packingExtra = plan.packingExtra.filter((s) => s !== label);
    delete plan.packing[`extra:${label}`];
  });
}

// --------------------------------------------------------------------- Budget

export function addExpense(e: Omit<Expense, 'id'>) {
  mutate(() => {
    plan.expenses.unshift({ ...e, id: crypto.randomUUID() });
  });
}

export function removeExpense(id: string) {
  mutate(() => {
    plan.expenses = plan.expenses.filter((e) => e.id !== id);
  });
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
  mutate(() => {
    plan.days = next.days;
    plan.done = next.done;
    plan.bookings = next.bookings;
    plan.packing = next.packing;
    plan.packingExtra = next.packingExtra;
    plan.expenses = next.expenses;
  });
  return { ok: true };
}

export function resetAll() {
  const fresh = emptyState();
  mutate(() => {
    plan.days = fresh.days;
    plan.done = fresh.done;
    plan.bookings = fresh.bookings;
    plan.packing = fresh.packing;
    plan.packingExtra = fresh.packingExtra;
    plan.expenses = fresh.expenses;
  });
}

/** Zählt, wie viele Orte insgesamt eingeplant sind. */
export function plannedCount(): number {
  return Object.values(plan.days).reduce((sum, d) => sum + d.placeNrs.length, 0);
}
