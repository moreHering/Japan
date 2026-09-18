/**
 * Abgleich des Reiseplans zwischen den drei Geräten.
 *
 * ## Aufteilung
 *
 * Der localStorage bleibt die Quelle, aus der die Oberfläche liest — sofort,
 * auch ohne Netz. Supabase ist die gemeinsame Ablage darüber. Jede Änderung
 * wirkt zuerst lokal und wandert dann in eine Warteschlange, die abgearbeitet
 * wird, sobald Netz da ist. Die Warteschlange liegt selbst im localStorage:
 * Ein Handy, das in der U-Bahn den Tab schließt, verliert nichts.
 *
 * ## Warum eine Warteschlange und kein Vergleich zweier Stände
 *
 * Ein reiner Abgleich „was liegt hier, was liegt dort" kann **Löschungen nicht
 * erkennen**. Streicht Paule einen Ort vom Dienstag, hat Deggels Gerät ihn noch
 * — und schreibt ihn beim nächsten Abgleich fröhlich zurück. Eine Löschung ist
 * deshalb ein eigener Vorgang, keine Abwesenheit.
 *
 * ## Reihenfolge, die das Ganze erst richtig macht
 *
 * **Erst senden, dann holen.** Wird zuerst geholt, überschreibt der Stand aus
 * der Ablage die noch nicht gesendeten Änderungen dieses Geräts. Scheitert das
 * Senden, wird auch nicht geholt — lieber ein veralteter Stand als ein
 * verlorener.
 *
 * ## Konflikte
 *
 * Aufgelöst wird **je Zeile**, und es gewinnt der zuletzt Sendende. Bei einem
 * Tag ist die Zeile der ganze Tag: Wer gleichzeitig denselben Tag umsortiert,
 * überschreibt den anderen. Bei getrennten Tagen, Häkchen und Ausgaben kommen
 * sich die drei nicht in die Quere. Das ist die Grenze dieser Lösung, und sie
 * ist für drei Leute, die miteinander reden, die richtige.
 *
 * ## Kein Realtime
 *
 * Supabase kann Änderungen pushen. Bewusst nicht benutzt: Eine offene
 * WebSocket-Verbindung über japanisches Mobilfunknetz bricht ständig ab und
 * kostet Akku. Geholt wird beim Öffnen der Seite, beim Zurückkehren in den Tab,
 * bei wiedergefundenem Netz und im Minutentakt, solange die Seite sichtbar ist.
 */

import { getSupabase, supabaseConfigured } from './supabase';
import { auth } from './auth.svelte';
import {
  plan,
  beobachteAenderungen,
  uebernehmeFremdstand,
  hatInhalt,
  nummerErsetzen,
  type Aenderung,
  type Korrektur,
  type PlanState,
} from './store.svelte';
import { ABSEITS, stationLabelOf, type Category, type EigenerOrt } from './places';

const WARTESCHLANGE = 'japan2026:offene-aenderungen';
/** Meldung über eine Änderung, die endgültig nicht durchkam. */
const VERWORFEN = 'japan2026:verworfene-aenderung';
/** Merker, dass dieses Gerät schon einmal erfolgreich abgeglichen hat. */
const ERSTABGLEICH = 'japan2026:erstabgleich';

export type SyncStatus =
  | 'aus' // keine Zugangsdaten im Build
  | 'abgemeldet'
  | 'lädt'
  | 'bereit'
  | 'wartet' // offline oder gerade kein Durchkommen
  | 'entscheidung' // lokaler und gemeinsamer Stand, keiner darf still gewinnen
  | 'fehler';

export const sync = $state({
  status: (supabaseConfigured ? 'abgemeldet' : 'aus') as SyncStatus,
  /** Wie viele Änderungen noch nicht in der Ablage sind. */
  offen: 0,
  letzterAbgleich: null as string | null,
  fehler: null as string | null,
  /**
   * Eine Änderung, die endgültig abgelehnt wurde und damit verloren ist.
   *
   * Das steht getrennt vom `fehler`, weil ein erfolgreicher nächster Durchgang
   * den Fehler löscht — diese Meldung aber nicht löschen darf. Der lokale Stand
   * wird beim nächsten Holen vom gemeinsamen überschrieben; wer nicht erfährt,
   * dass etwas nicht angekommen ist, verliert es ohne es zu merken. Bleibt
   * stehen, bis sie weggeklickt wird, und übersteht ein Neuladen.
   */
  verworfen: null as string | null,
  /**
   * Der Stand aus der Ablage, solange die Erstübergabe nicht entschieden ist.
   * Liegt hier, damit die Oberfläche beide Seiten in Zahlen gegenüberstellen
   * kann — eine Frage ohne Zahlen wäre nicht beantwortbar.
   */
  entscheidung: null as Partial<PlanState> | null,
});

/** Umfang eines Plans in vier Zahlen, für die Gegenüberstellung. */
export function kennzahlen(p: Partial<PlanState>) {
  const tage = Object.values(p.days ?? {});
  return {
    orte: tage.reduce((sum, d) => sum + (d.placeNrs?.length ?? 0), 0),
    tage: tage.filter((d) => (d.placeNrs?.length ?? 0) > 0 || (d.note ?? '') !== '').length,
    besucht: (p.done ?? []).length,
    ausgaben: (p.expenses ?? []).length,
  };
}

// ----------------------------------------------------------- Warteschlange ---

/** Ein Schlüssel je betroffener Zeile — so fällt Mehrfaches zusammen. */
function schluessel(a: Aenderung): string {
  switch (a.art) {
    case 'tag':
      return `tag:${a.datum}`;
    case 'notiz':
      return `notiz:${a.datum}`;
    case 'marke':
      return `marke:${a.typ}:${a.schluessel}`;
    case 'ausgabe-neu':
    case 'ausgabe-weg':
      return `ausgabe:${a.id}`;
    case 'ort':
    case 'ort-weg':
      return `ort:${a.nr}`;
    case 'korrektur':
    case 'korrektur-weg':
      return `korrektur:${a.nr}`;
    case 'alles':
      return 'alles';
  }
}

type Eintrag = { a: Aenderung; versuche: number };

let warteschlange: Eintrag[] = [];

function ladeWarteschlange() {
  try {
    const raw = localStorage.getItem(WARTESCHLANGE);
    if (!raw) return;
    const roh = JSON.parse(raw);
    if (Array.isArray(roh)) {
      warteschlange = roh.filter((e) => e && typeof e === 'object' && e.a?.art);
    }
  } catch {
    warteschlange = [];
  }
  sync.offen = warteschlange.length;
}

function merkeVerworfen(text: string) {
  sync.verworfen = text;
  try {
    localStorage.setItem(VERWORFEN, text);
  } catch {
    // Dann bleibt die Meldung nur für diese Sitzung stehen.
  }
}

/** Die Meldung über eine verworfene Änderung wegklicken. */
export function verworfenQuittieren() {
  sync.verworfen = null;
  try {
    localStorage.removeItem(VERWORFEN);
  } catch {
    // nichts zu tun
  }
}

function speichereWarteschlange() {
  sync.offen = warteschlange.length;
  try {
    localStorage.setItem(WARTESCHLANGE, JSON.stringify(warteschlange));
  } catch {
    // Ohne Speicher bleibt die Warteschlange nur im Arbeitsspeicher.
  }
}

function anstellen(änderungen: Aenderung[]) {
  for (const a of änderungen) {
    if (a.art === 'alles') {
      // Ein vollständiger Stand macht alles Einzelne davor hinfällig.
      warteschlange = [{ a, versuche: 0 }];
      continue;
    }
    const k = schluessel(a);
    const i = warteschlange.findIndex((e) => schluessel(e.a) === k);
    if (i === -1) warteschlange.push({ a, versuche: 0 });
    else warteschlange[i] = { a, versuche: 0 }; // jüngste Form gewinnt
  }
  speichereWarteschlange();
  baldSenden();
}

/**
 * Trägt eine neu vergebene Ortsnummer in die noch wartenden Änderungen nach.
 *
 * Ohne das schreibt ein Häkchen, das vor dem Abgleich gesetzt wurde, weiter auf
 * die vorläufige Nummer — und das echte „besucht" kommt nie an. Die Vorgänge
 * lesen ihren Wert beim Senden aus dem aktuellen Zustand, deshalb genügt es,
 * den Schlüssel zu ersetzen; doppelte Schlüssel sind unschädlich, weil jeder
 * Vorgang für sich wiederholbar ist.
 */
function nummerInWarteschlange(alt: number, neu: number) {
  let geändert = false;
  for (const e of warteschlange) {
    const a = e.a;
    if (a.art === 'marke' && a.typ === 'done' && a.schluessel === String(alt)) {
      e.a = { ...a, schluessel: String(neu) };
      geändert = true;
    } else if (
      (a.art === 'ort' ||
        a.art === 'ort-weg' ||
        a.art === 'korrektur' ||
        a.art === 'korrektur-weg') &&
      a.nr === alt
    ) {
      e.a = { ...a, nr: neu };
      geändert = true;
    }
  }
  if (geändert) speichereWarteschlange();
}

// ------------------------------------------------------------------ Senden ---

type SB = NonNullable<ReturnType<typeof getSupabase>>;

/** Wirft bei jedem Fehler — der Aufrufer entscheidet, ob erneut versucht wird. */
async function sendeEine(sb: SB, a: Aenderung, wer: string) {
  switch (a.art) {
    case 'tag': {
      const nrs = plan.days[a.datum]?.placeNrs ?? [];
      if (nrs.length) {
        const zeilen = nrs.map((nr, i) => ({
          datum: a.datum,
          place_nr: nr,
          position: i,
          updated_at: new Date().toISOString(),
          updated_by: wer,
        }));
        const { error } = await sb.from('plan_days').upsert(zeilen, { onConflict: 'datum,place_nr' });
        if (error) throw error;
      }
      // Was hier nicht mehr steht, ist gestrichen worden.
      let weg = sb.from('plan_days').delete().eq('datum', a.datum);
      if (nrs.length) weg = weg.not('place_nr', 'in', `(${nrs.join(',')})`);
      const { error } = await weg;
      if (error) throw error;
      return;
    }

    case 'notiz': {
      const notiz = plan.days[a.datum]?.note ?? '';
      const { error } = await sb.from('plan_notes').upsert(
        { datum: a.datum, notiz, updated_at: new Date().toISOString(), updated_by: wer },
        { onConflict: 'datum' },
      );
      if (error) throw error;
      return;
    }

    case 'marke': {
      // Ein gestrichener eigener Packlisten-Eintrag verschwindet ganz; alles
      // andere behält seine Zeile mit `wert = false`. Eine Zeile mit false ist
      // die Aussage „bewusst nicht abgehakt" — eine fehlende Zeile wäre keine.
      const istExtra = a.typ === 'packing' && a.schluessel.startsWith('extra:');
      const label = istExtra ? a.schluessel.slice('extra:'.length) : '';
      if (istExtra && !plan.packingExtra.includes(label)) {
        const { error } = await sb
          .from('plan_flags')
          .delete()
          .eq('art', 'packing')
          .eq('schluessel', a.schluessel);
        if (error) throw error;
        return;
      }
      const wert =
        a.typ === 'done'
          ? plan.done.includes(Number(a.schluessel))
          : a.typ === 'booking'
            ? Boolean(plan.bookings[a.schluessel])
            : Boolean(plan.packing[a.schluessel]);
      const { error } = await sb.from('plan_flags').upsert(
        {
          art: a.typ,
          schluessel: a.schluessel,
          wert,
          updated_at: new Date().toISOString(),
          updated_by: wer,
        },
        { onConflict: 'art,schluessel' },
      );
      if (error) throw error;
      return;
    }

    case 'ausgabe-neu': {
      const e = plan.expenses.find((x) => x.id === a.id);
      // Gleich wieder gelöscht: Der Löschvorgang hat den Eintrag ersetzt.
      if (!e) return;
      if (!(e.yen > 0)) return; // die Datenbank verlangt yen > 0
      const { error } = await sb.from('expenses').upsert(
        {
          id: e.id,
          datum: e.date,
          text: e.label,
          yen: Math.round(e.yen),
          payer: e.payer,
          station: e.station,
          created_by: wer,
        },
        { onConflict: 'id' },
      );
      if (error) throw error;
      return;
    }

    case 'ausgabe-weg': {
      const { error } = await sb.from('expenses').delete().eq('id', a.id);
      if (error) throw error;
      return;
    }

    case 'ort': {
      const ort = plan.customPlaces.find((p) => p.nr === a.nr);
      // Gleich wieder gelöscht — der Löschvorgang hat den Eintrag ersetzt.
      if (!ort) return;

      if (ort.vorlaeufig) {
        // Die Nummer vergibt die Sequenz in der Datenbank, nicht der Client:
        // Zwei Leute, die gleichzeitig einen Ort anlegen, bekommen sonst
        // dieselbe. Deshalb ohne `nr` einfügen und die vergebene zurücklesen.
        const { data, error } = await sb
          .from('places_custom')
          .insert(zeileAusOrt(ort, wer, false))
          .select('nr')
          .single();
        if (error) throw error;
        const neu = Number(data?.nr);
        if (!Number.isInteger(neu) || neu <= 0) {
          throw new Error('Die Datenbank hat keine Nummer für den neuen Ort geliefert.');
        }
        nummerErsetzen(a.nr, neu);
        nummerInWarteschlange(a.nr, neu);
        return;
      }

      const { error } = await sb
        .from('places_custom')
        .upsert(zeileAusOrt(ort, wer, true), { onConflict: 'nr' });
      if (error) throw error;
      return;
    }

    case 'ort-weg': {
      // Eine vorläufige Nummer stand nie in der Ablage.
      if (a.nr < 0) return;
      const { error } = await sb.from('places_custom').delete().eq('nr', a.nr);
      if (error) throw error;
      return;
    }

    case 'korrektur': {
      const k = plan.korrekturen[String(a.nr)];
      // Gleich wieder zurückgenommen — der Löschvorgang hat den Eintrag ersetzt.
      if (!k) return;
      const { error } = await sb
        .from('places_patch')
        .upsert(zeileAusKorrektur(k, wer), { onConflict: 'nr' });
      if (error) throw error;
      return;
    }

    case 'korrektur-weg': {
      // Eine vorläufige Nummer stand nie in der Ablage.
      if (a.nr < 0) return;
      const { error } = await sb.from('places_patch').delete().eq('nr', a.nr);
      if (error) throw error;
      return;
    }

    case 'alles': {
      await sendeAlles(sb, wer);
      return;
    }
  }
}

/** Ein eigener Ort als Datenbankzeile. Ohne `nr`, wenn die Sequenz sie vergibt. */
/**
 * Eine Korrekturzeile für die Ablage.
 *
 * `undefined` muss hier zu `null` werden: PostgREST lässt fehlende Felder beim
 * Upsert unverändert stehen, ein `null` setzt sie zurück. Genau das ist
 * gemeint — wer eine Korrektur zurücknimmt, will den Buchwert wiederhaben, und
 * würde das Feld einfach weggelassen, bliebe die alte Korrektur stehen.
 */
function zeileAusKorrektur(k: Korrektur, wer: string) {
  const oderNull = <T>(v: T | null | undefined): T | null => (v === undefined ? null : v);
  return {
    nr: k.nr,
    name: oderNull(k.name),
    kategorie: oderNull(k.category),
    station: oderNull(k.station),
    area: oderNull(k.area),
    lat: oderNull(k.lat),
    lng: oderNull(k.lng),
    beschreibung: oderNull(k.descriptionHtml),
    // Diese zwei Felder brauchen drei Zustände, die Datenbank kennt aber nur
    // zwei: NULL und einen Wert. „Nicht korrigiert" und „ausdrücklich geleert"
    // wären beides NULL — und dann löschte jede beliebige Korrektur den
    // Schließtag oder das 📖 aus dem Buch, ohne dass es auffällt.
    //
    // Deshalb der Leerstring als dritter Zustand bei closed_day, und bei
    // from_book das ausdrückliche `false`:
    //
    //     NULL  → nicht korrigiert, der Buchwert gilt
    //     ''    → korrigiert auf „kein Schließtag"
    //     'Mi'  → korrigiert auf Mittwoch
    from_book: k.book === undefined ? null : k.book !== null,
    closed_day: k.closedDay === undefined ? null : (k.closedDay ?? ''),
    needs_booking: oderNull(k.needsBooking),
    cash_only: oderNull(k.cashOnly),
    unterkunft: oderNull(k.unterkunft),
    versteckt: k.versteckt,
    schlagworte: k.schlagworte,
    updated_at: new Date().toISOString(),
    updated_by: wer,
  };
}

function zeileAusOrt(ort: EigenerOrt, wer: string, mitNr: boolean) {
  return {
    ...(mitNr ? { nr: ort.nr } : {}),
    name: ort.name,
    kategorie: ort.category,
    station: ort.station,
    area: ort.area,
    lat: ort.lat,
    lng: ort.lng,
    beschreibung: ort.descriptionHtml,
    from_book: Boolean(ort.book) || Boolean(ort.bookTitle),
    unterkunft: ort.uebernachtung === 'gebucht',
    closed_day: ort.closedDay,
    needs_booking: ort.needsBooking,
    cash_only: ort.cashOnly,
    created_by: wer,
  };
}

/**
 * Schreibt den lokalen Stand vollständig in die Ablage — einschließlich der
 * Löschung dessen, was dort noch steht. Das ist gewollt: `alles` entsteht nur
 * beim Einlesen einer Sicherung, beim Zurücksetzen und bei der Erstübergabe.
 */
async function sendeAlles(sb: SB, wer: string) {
  const jetzt = new Date().toISOString();

  const tage = Object.entries(plan.days).flatMap(([datum, e]) =>
    e.placeNrs.map((nr, i) => ({
      datum,
      place_nr: nr,
      position: i,
      updated_at: jetzt,
      updated_by: wer,
    })),
  );
  const notizen = Object.entries(plan.days)
    .filter(([, e]) => e.note !== '')
    .map(([datum, e]) => ({ datum, notiz: e.note, updated_at: jetzt, updated_by: wer }));

  const marken = [
    ...plan.done.map((nr) => ({ art: 'done', schluessel: String(nr), wert: true })),
    ...Object.entries(plan.bookings).map(([k, v]) => ({ art: 'booking', schluessel: k, wert: v })),
    ...Object.entries(plan.packing).map(([k, v]) => ({ art: 'packing', schluessel: k, wert: v })),
  ].map((m) => ({ ...m, updated_at: jetzt, updated_by: wer }));

  const ausgaben = plan.expenses
    .filter((e) => e.yen > 0)
    .map((e) => ({
      id: e.id,
      datum: e.date,
      text: e.label,
      yen: Math.round(e.yen),
      payer: e.payer,
      station: e.station,
      created_by: wer,
    }));

  // Erst räumen, dann schreiben. `neq` mit einem unmöglichen Wert löscht alles;
  // PostgREST verlangt für ein DELETE eine Bedingung.
  for (const t of ['plan_days', 'plan_notes', 'plan_flags'] as const) {
    const { error } = await sb.from(t).delete().neq('updated_at', '1970-01-01T00:00:00Z');
    if (error) throw error;
  }
  {
    const { error } = await sb.from('expenses').delete().neq('created_at', '1970-01-01T00:00:00Z');
    if (error) throw error;
  }
  {
    // Eigene Orte behalten ihre Nummer: Sie steht in den Tagen und womöglich
    // schon auf einem Zettel. Nur was hier fehlt, verschwindet.
    const bleiben = plan.customPlaces.filter((p) => !p.vorlaeufig).map((p) => p.nr);
    let weg = sb.from('places_custom').delete().gt('nr', 0);
    if (bleiben.length) weg = weg.not('nr', 'in', `(${bleiben.join(',')})`);
    const { error } = await weg;
    if (error) throw error;
  }
  for (const ort of plan.customPlaces) {
    if (ort.vorlaeufig) {
      const { data, error } = await sb
        .from('places_custom')
        .insert(zeileAusOrt(ort, wer, false))
        .select('nr')
        .single();
      if (error) throw error;
      const neu = Number(data?.nr);
      if (Number.isInteger(neu) && neu > 0) {
        nummerErsetzen(ort.nr, neu);
        nummerInWarteschlange(ort.nr, neu);
      }
      continue;
    }
    const { error } = await sb
      .from('places_custom')
      .upsert(zeileAusOrt(ort, wer, true), { onConflict: 'nr' });
    if (error) throw error;
  }

  {
    // Korrekturen: Was hier fehlt, ist zurückgenommen worden und muss weg.
    const bleiben = Object.values(plan.korrekturen)
      .map((k) => k.nr)
      .filter((nr) => nr > 0);
    let weg = sb.from('places_patch').delete().gt('nr', 0);
    if (bleiben.length) weg = weg.not('nr', 'in', `(${bleiben.join(',')})`);
    const { error } = await weg;
    if (error) throw error;
  }
  {
    const zeilen = Object.values(plan.korrekturen)
      .filter((k) => k.nr > 0)
      .map((k) => zeileAusKorrektur(k, wer));
    if (zeilen.length) {
      const { error } = await sb
        .from('places_patch')
        .upsert(zeilen as never, { onConflict: 'nr' });
      if (error) throw error;
    }
  }

  for (const [tabelle, zeilen] of [
    ['plan_days', tage],
    ['plan_notes', notizen],
    ['plan_flags', marken],
    ['expenses', ausgaben],
  ] as const) {
    if (!zeilen.length) continue;
    const { error } = await sb.from(tabelle).insert(zeilen as never);
    if (error) throw error;
  }
}

// ------------------------------------------------------------------- Holen ---

async function holeStand(sb: SB): Promise<{ stand: Partial<PlanState>; leer: boolean }> {
  const [tage, notizen, marken, ausgaben, orte, korrekturen] = await Promise.all([
    sb.from('plan_days').select('datum, place_nr, position').order('position'),
    sb.from('plan_notes').select('datum, notiz'),
    sb.from('plan_flags').select('art, schluessel, wert'),
    sb.from('expenses').select('id, datum, text, yen, payer, station').order('datum', {
      ascending: false,
    }),
    sb
      .from('places_custom')
      .select(
        'nr, name, kategorie, station, area, lat, lng, beschreibung, from_book, closed_day, needs_booking, cash_only, unterkunft, created_by',
      )
      .order('nr'),
    sb
      .from('places_patch')
      .select(
        'nr, name, kategorie, station, area, lat, lng, beschreibung, from_book, closed_day, needs_booking, cash_only, unterkunft, versteckt, schlagworte',
      )
      .order('nr'),
  ]);
  for (const r of [tage, notizen, marken, ausgaben, orte, korrekturen]) if (r.error) throw r.error;

  const days: PlanState['days'] = {};
  for (const z of tage.data ?? []) {
    (days[z.datum] ??= { placeNrs: [], note: '' }).placeNrs.push(z.place_nr);
  }
  for (const z of notizen.data ?? []) {
    (days[z.datum] ??= { placeNrs: [], note: '' }).note = z.notiz ?? '';
  }

  const done: number[] = [];
  const bookings: Record<string, boolean> = {};
  const packing: Record<string, boolean> = {};
  const packingExtra: string[] = [];
  for (const z of marken.data ?? []) {
    if (z.art === 'done') {
      if (z.wert) done.push(Number(z.schluessel));
    } else if (z.art === 'booking') {
      bookings[z.schluessel] = Boolean(z.wert);
    } else {
      packing[z.schluessel] = Boolean(z.wert);
      // Eigene Einträge stehen als `extra:<Text>`; die Zeile ist der Eintrag.
      if (z.schluessel.startsWith('extra:')) packingExtra.push(z.schluessel.slice(6));
    }
  }

  const expenses = (ausgaben.data ?? []).map((z) => ({
    id: z.id,
    date: z.datum,
    label: z.text,
    yen: z.yen,
    payer: z.payer,
    station: z.station ?? '',
  }));

  const customPlaces: EigenerOrt[] = (orte.data ?? []).map((z) => ({
    eigen: true as const,
    vorlaeufig: false,
    angelegtVon: z.created_by ?? null,
    nr: z.nr,
    name: z.name,
    category: z.kategorie as Category,
    station: z.station ?? ABSEITS,
    stationLabel: stationLabelOf(z.station ?? ABSEITS),
    area: z.area === 'ausflug' ? ('ausflug' as const) : ('zentrum' as const),
    lat: z.lat,
    lng: z.lng,
    placeId: null,
    descriptionHtml: z.beschreibung ?? '',
    isFriendTip: false,
    // Aus der Datenbank kommt nur „aus dem Reiseführer, ja oder nein" — die
    // Erlebnisnummer führt nur die kuratierte Liste der festen Orte.
    book: z.from_book ? '—' : undefined,
    bookTitle: z.from_book ? 'Aus dem Reiseführer' : undefined,
    needsBooking: Boolean(z.needs_booking),
    closedDay: z.closed_day ?? null,
    cashOnly: Boolean(z.cash_only),
    uebernachtung: z.unterkunft ? ('gebucht' as const) : undefined,
  }));

  /**
   * Korrekturen zurück in die Form des Stores.
   *
   * `null` aus der Datenbank heißt „nicht korrigiert" und muss zu `undefined`
   * werden — im Store bedeutet nur `undefined` das. Bei `closed_day` ist das
   * anders: Dort ist `null` ein echter Wert („ausdrücklich kein Schließtag"),
   * und ihn zu verschlucken hieße, einen falschen Schließtag aus dem Buch
   * wieder aufleben zu lassen. Die Unterscheidung lässt sich über PostgREST
   * nicht herausbekommen, deshalb gilt hier: gesetzt bleibt gesetzt.
   */
  const korrekturenStand: PlanState['korrekturen'] = {};
  for (const z of korrekturen.data ?? []) {
    const k: Korrektur = {
      nr: z.nr,
      versteckt: Boolean(z.versteckt),
      schlagworte: Array.isArray(z.schlagworte) ? z.schlagworte.filter(Boolean) : [],
    };
    if (z.name != null) k.name = z.name;
    if (z.kategorie != null) k.category = z.kategorie as Category;
    if (z.station != null) k.station = z.station;
    if (z.area != null) k.area = z.area === 'ausflug' ? 'ausflug' : 'zentrum';
    if (z.lat != null && z.lng != null) {
      k.lat = z.lat;
      k.lng = z.lng;
    }
    if (z.beschreibung != null) k.descriptionHtml = z.beschreibung;
    // `null` heißt unkorrigiert, `false` heißt „ausdrücklich nicht aus dem Buch".
    if (z.from_book != null) k.book = z.from_book ? '—' : null;
    if (z.needs_booking != null) k.needsBooking = Boolean(z.needs_booking);
    if (z.cash_only != null) k.cashOnly = Boolean(z.cash_only);
    if (z.unterkunft != null) k.unterkunft = Boolean(z.unterkunft);
    // Leerstring heißt „korrigiert auf keinen Schließtag", `null` heißt
    // unkorrigiert. Ohne diese Unterscheidung nähme jede Korrektur dem Ort
    // seinen Schließtag aus dem Buch — und ein geschlossenes Museum, das offen
    // aussieht, kostet unterwegs einen halben Tag.
    if (z.closed_day === '') k.closedDay = null;
    else if (z.closed_day != null) k.closedDay = z.closed_day;
    korrekturenStand[String(z.nr)] = k;
  }

  const leer =
    !(tage.data ?? []).length &&
    !(notizen.data ?? []).length &&
    !(marken.data ?? []).length &&
    !expenses.length &&
    !customPlaces.length &&
    !Object.keys(korrekturenStand).length;

  return {
    stand: {
      days,
      done,
      bookings,
      packing,
      packingExtra,
      expenses,
      customPlaces,
      korrekturen: korrekturenStand,
    },
    leer,
  };
}

// ------------------------------------------------------------------- Ablauf ---

let läuft = false;
let sendeTimer: ReturnType<typeof setTimeout> | undefined;
let taktTimer: ReturnType<typeof setInterval> | undefined;
let angemeldetAlsZuletzt: string | null = null;

function baldSenden() {
  clearTimeout(sendeTimer);
  sendeTimer = setTimeout(() => void abgleichen(), 1200);
}

/** Übersetzt die technischen Meldungen in etwas, das weiterhilft. */
function deute(e: unknown): { text: string; status: SyncStatus } {
  const o = (e ?? {}) as { code?: string; message?: string };
  const code = o.code ?? '';
  const msg = (o.message ?? '').toLowerCase();

  if (code === '42P01' || msg.includes('does not exist') || msg.includes('schema cache')) {
    return {
      text: 'Die Tabellen fehlen — die Migration ist noch nicht eingespielt.',
      status: 'fehler',
    };
  }
  if (code === '42501' || msg.includes('row-level security') || msg.includes('permission denied')) {
    return {
      text: 'Dieses Konto ist nicht als Reisender eingetragen. Die Migration, die die Profile anlegt, fehlt noch.',
      status: 'fehler',
    };
  }
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to')) {
    return { text: '', status: 'wartet' };
  }
  return { text: o.message ?? 'Unbekannter Fehler beim Abgleich.', status: 'fehler' };
}

/**
 * Ein Durchgang: senden, dann holen. Mehrfache Aufrufe überlappen nicht.
 */
export async function abgleichen(nurSenden = false) {
  const sb = getSupabase();
  if (!sb || !auth.userId) return;
  if (läuft) return;
  läuft = true;
  const wer = auth.userId;

  try {
    // ---- senden
    while (warteschlange.length) {
      // Orte zuerst: Ein Tag, der einen frisch angelegten Ort enthält, darf
      // erst hochgehen, wenn dessen endgültige Nummer feststeht.
      const zuerst = warteschlange.findIndex((x) => x.a.art === 'ort');
      if (zuerst > 0) warteschlange.unshift(...warteschlange.splice(zuerst, 1));
      const e = warteschlange[0];
      try {
        await sendeEine(sb, e.a, wer);
        warteschlange.shift();
        speichereWarteschlange();
      } catch (err) {
        const d = deute(err);
        e.versuche += 1;
        if (d.status === 'fehler' && e.versuche >= 3) {
          // Eine Änderung, die dauerhaft abgelehnt wird, darf nicht alle
          // folgenden blockieren. Sie fällt heraus und der Grund wird genannt.
          warteschlange.shift();
          speichereWarteschlange();
          merkeVerworfen(
            `Eine Änderung kam nicht durch und ist nicht in der gemeinsamen Ablage: ${d.text}`,
          );
          sync.fehler = d.text;
          sync.status = 'fehler';
          continue;
        }
        speichereWarteschlange();
        sync.status = d.status;
        sync.fehler = d.text || null;
        return; // ohne vollständiges Senden wird nicht geholt
      }
    }

    if (nurSenden) {
      sync.status = 'bereit';
      sync.fehler = null;
      return;
    }

    // ---- holen
    const { stand, leer } = await holeStand(sb);

    // Erstübergabe: Steht hier etwas und dort nichts, gewinnt dieses Gerät.
    // Steht auf beiden Seiten etwas, entscheidet das niemand still — dann
    // fragt die Oberfläche.
    if (!localStorage.getItem(ERSTABGLEICH)) {
      if (leer && hatInhalt()) {
        // `anstellen` stößt das Senden von selbst an — keine Rekursion hier,
        // sonst setzt der `finally`-Block die Sperre des neuen Durchgangs zurück.
        localStorage.setItem(ERSTABGLEICH, new Date().toISOString());
        anstellen([{ art: 'alles' }]);
        sync.status = 'lädt';
        return;
      }
      if (!leer && hatInhalt()) {
        sync.entscheidung = stand;
        sync.status = 'entscheidung';
        sync.fehler = null;
        return;
      }
      localStorage.setItem(ERSTABGLEICH, new Date().toISOString());
    }

    uebernehmeFremdstand(stand);
    sync.letzterAbgleich = new Date().toISOString();
    sync.status = 'bereit';
    sync.fehler = null;
  } catch (err) {
    const d = deute(err);
    sync.status = d.status;
    sync.fehler = d.text || null;
  } finally {
    läuft = false;
  }
}

/** „Diesen lokalen Plan hochladen" — überschreibt den gemeinsamen Stand. */
export function entscheideFuerGeraet() {
  localStorage.setItem(ERSTABGLEICH, new Date().toISOString());
  sync.entscheidung = null;
  anstellen([{ art: 'alles' }]);
  sync.status = 'lädt';
  void abgleichen();
}

/** „Gemeinsamen Stand übernehmen" — ersetzt den Plan auf diesem Gerät. */
export function entscheideFuerAblage() {
  localStorage.setItem(ERSTABGLEICH, new Date().toISOString());
  if (sync.entscheidung) uebernehmeFremdstand(sync.entscheidung);
  sync.entscheidung = null;
  warteschlange = [];
  speichereWarteschlange();
  sync.letzterAbgleich = new Date().toISOString();
  sync.status = 'bereit';
  void abgleichen();
}

// ------------------------------------------------------------------- Aufbau ---

let gestartet = false;

/**
 * Einmal je Seitenaufruf aufzurufen. Hängt sich an den Store und an die
 * Ereignisse, bei denen ein Abgleich lohnt.
 */
export function verbinde() {
  ladeWarteschlange();
  try {
    sync.verworfen = localStorage.getItem(VERWORFEN);
  } catch {
    sync.verworfen = null;
  }
  beobachteAenderungen(anstellen);
}

/**
 * Nur für den Prüfstand: Warteschlange und Zustand leeren, damit Tests
 * unabhängig voneinander laufen. Im Betrieb ruft das niemand.
 */
export function zuruecksetzenFuerTest() {
  warteschlange = [];
  speichereWarteschlange();
  läuft = false;
  sync.status = supabaseConfigured ? 'abgemeldet' : 'aus';
  sync.fehler = null;
  sync.verworfen = null;
  sync.entscheidung = null;
  sync.letzterAbgleich = null;
  clearTimeout(sendeTimer);
}

export function initSync() {
  if (gestartet || typeof window === 'undefined') return;
  gestartet = true;

  if (!supabaseConfigured) {
    sync.status = 'aus';
    return;
  }

  verbinde();

  // Auf die Anmeldung warten: ohne `auth.userId` gibt es keinen Abgleich.
  $effect.root(() => {
    $effect(() => {
      const id = auth.userId;
      if (id && id !== angemeldetAlsZuletzt) {
        angemeldetAlsZuletzt = id;
        sync.status = 'lädt';
        void abgleichen();
      } else if (!id) {
        angemeldetAlsZuletzt = null;
        if (auth.status === 'abgemeldet') sync.status = 'abgemeldet';
      }
    });
  });

  const wennSichtbar = () => {
    if (document.visibilityState === 'visible') void abgleichen();
  };
  document.addEventListener('visibilitychange', wennSichtbar);
  window.addEventListener('online', () => void abgleichen());
  window.addEventListener('focus', wennSichtbar);

  clearInterval(taktTimer);
  taktTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void abgleichen();
  }, 60_000);
}
