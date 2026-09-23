/**
 * Prüfstand für den Geräteabgleich.
 *
 * Geprüft wird die Logik gegen einen strengen PostgREST-Ersatz (siehe
 * `mini-postgrest.ts`) — also: Form der Anfragen, Reihenfolge von Senden und
 * Holen, Verhalten bei Netzausfall, und vor allem, dass Löschungen nicht
 * wiederauferstehen. **Nicht** geprüft: das Verhalten des echten Supabase.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Ablage } from './mini-postgrest';
import {
  plan,
  addToDay,
  removeFromDay,
  setNote,
  toggleDone,
  togglePacking,
  addPackingItem,
  removePackingItem,
  addExpense,
  removeExpense,
  resetAll,
  uebernehmeFremdstand,
  ortAnlegen,
  ortAendern,
  ortLoeschen,
  istPlanbar,
  vorlaeufigeOrte,
  ortEntfernen,
  ortVerstecken,
  schlagworteSetzen,
  korrekturZuruecknehmen,
  sichtbareOrte,
  versteckteOrte,
  alleSchlagworte,
  istKorrigiert,
  schlagworteVon,
} from '../src/lib/store.svelte';
import { ABSEITS } from '../src/lib/places';
import { auth } from '../src/lib/auth.svelte';
import {
  sync,
  abgleichen,
  verbinde,
  zuruecksetzenFuerTest,
  kennzahlen,
  entscheideFuerAblage,
  entscheideFuerGeraet,
  verworfenQuittieren,
} from '../src/lib/sync.svelte';

const ablage = new Ablage();
const WER = '11111111-1111-1111-1111-111111111111';

globalThis.fetch = ablage.fetch as typeof fetch;
verbinde();

/** Gibt der Warteschlange Zeit, ihren 1,2-Sekunden-Takt zu überspringen. */
async function ruhe() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  ablage.leeren();
  ablage.faelltAus = 0;
  localStorage.clear();
  uebernehmeFremdstand({});
  zuruecksetzenFuerTest();
  auth.userId = WER;
  auth.status = 'angemeldet';
  // Der Erstübergabe-Merker wird je Test bewusst gesetzt oder weggelassen.
  localStorage.setItem('japan2026:erstabgleich', '2026-09-17T00:00:00Z');
  await ruhe();
});

// Tests, die `fetch` austauschen, dürfen den nächsten nicht mitreißen — und
// eine fehlgeschlagene Zusicherung überspringt jede Aufräumzeile im Testrumpf.
afterEach(() => {
  globalThis.fetch = ablage.fetch as typeof fetch;
});

describe('Senden', () => {
  it('schreibt einen Tag mit Reihenfolge in die Ablage', async () => {
    addToDay('2026-09-28', 42);
    addToDay('2026-09-28', 7);
    // Zwei Änderungen am selben Tag fallen zu einer zusammen.
    expect(sync.offen).toBe(1);

    await abgleichen();

    expect(ablage.tabellen.plan_days).toHaveLength(2);
    const nach = [...ablage.tabellen.plan_days].sort(
      (a, b) => (a.position as number) - (b.position as number),
    );
    expect(nach.map((z) => z.place_nr)).toEqual([42, 7]);
    expect(nach.every((z) => z.updated_by === WER)).toBe(true);
    expect(sync.offen).toBe(0);
    expect(sync.status).toBe('bereit');
  });

  it('überträgt eine Streichung als Löschung, nicht als Abwesenheit', async () => {
    addToDay('2026-09-28', 42);
    addToDay('2026-09-28', 7);
    await abgleichen();
    expect(ablage.tabellen.plan_days).toHaveLength(2);

    removeFromDay('2026-09-28', 42);
    await abgleichen();

    expect(ablage.tabellen.plan_days.map((z) => z.place_nr)).toEqual([7]);
    // Position wird nachgezogen, sonst bliebe eine Lücke.
    expect(ablage.tabellen.plan_days[0].position).toBe(0);
  });

  it('räumt den letzten Ort eines Tages restlos ab', async () => {
    addToDay('2026-09-28', 42);
    await abgleichen();
    removeFromDay('2026-09-28', 42);
    await abgleichen();
    expect(ablage.tabellen.plan_days).toHaveLength(0);
  });

  it('verschiebt einen Ort und ändert dabei beide Tage', async () => {
    addToDay('2026-09-28', 42);
    await abgleichen();

    addToDay('2026-09-29', 42);
    expect(sync.offen).toBe(2); // Quell- und Zieltag
    await abgleichen();

    expect(ablage.tabellen.plan_days).toHaveLength(1);
    expect(ablage.tabellen.plan_days[0].datum).toBe('2026-09-29');
  });

  it('schreibt Notiz, Häkchen und Ausgabe', async () => {
    setNote('2026-09-28', 'Kaiseki abends');
    toggleDone(12);
    togglePacking('bargeld');
    addExpense({ date: '2026-09-28', label: 'Ramen', yen: 1200, payer: 'Paule', station: 'osaka' });
    await abgleichen();

    expect(ablage.tabellen.plan_notes[0].notiz).toBe('Kaiseki abends');
    expect(ablage.tabellen.plan_flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ art: 'done', schluessel: '12', wert: true }),
        expect.objectContaining({ art: 'packing', schluessel: 'bargeld', wert: true }),
      ]),
    );
    expect(ablage.tabellen.expenses[0]).toMatchObject({ text: 'Ramen', yen: 1200 });
  });

  it('behält ein abgewähltes Häkchen als Zeile mit wert=false', async () => {
    toggleDone(12);
    await abgleichen();
    toggleDone(12);
    await abgleichen();

    const zeile = ablage.tabellen.plan_flags.find((z) => z.schluessel === '12');
    expect(zeile).toBeDefined();
    expect(zeile!.wert).toBe(false);
  });

  it('gleicht eigene Packlisten-Einträge über ihre Zeile ab', async () => {
    addPackingItem('Luftpolsterfolie');
    await abgleichen();
    expect(
      ablage.tabellen.plan_flags.find((z) => z.schluessel === 'extra:Luftpolsterfolie'),
    ).toMatchObject({ wert: false });

    togglePacking('extra:Luftpolsterfolie');
    await abgleichen();
    expect(
      ablage.tabellen.plan_flags.find((z) => z.schluessel === 'extra:Luftpolsterfolie')!.wert,
    ).toBe(true);

    removePackingItem('Luftpolsterfolie');
    await abgleichen();
    expect(ablage.tabellen.plan_flags.find((z) => z.schluessel?.toString().startsWith('extra:')))
      .toBeUndefined();
  });

  it('löscht eine Ausgabe auch in der Ablage', async () => {
    addExpense({ date: '2026-09-28', label: 'Bahn', yen: 900, payer: 'Deggel', station: 'kyoto' });
    await abgleichen();
    const id = plan.expenses[0].id;
    removeExpense(id);
    await abgleichen();
    expect(ablage.tabellen.expenses).toHaveLength(0);
  });
});

describe('Holen', () => {
  it('baut Tage, Notizen, Häkchen und Ausgaben wieder auf', async () => {
    ablage.tabellen.plan_days = [
      { datum: '2026-10-01', place_nr: 5, position: 1, updated_at: 'x' },
      { datum: '2026-10-01', place_nr: 9, position: 0, updated_at: 'x' },
    ];
    ablage.tabellen.plan_notes = [{ datum: '2026-10-01', notiz: 'Kanazawa', updated_at: 'x' }];
    ablage.tabellen.plan_flags = [
      { art: 'done', schluessel: '5', wert: true, updated_at: 'x' },
      { art: 'booking', schluessel: 'ghibli', wert: true, updated_at: 'x' },
      { art: 'packing', schluessel: 'extra:Beutel', wert: false, updated_at: 'x' },
    ];
    ablage.tabellen.expenses = [
      { id: 'a1', datum: '2026-10-01', text: 'Bus', yen: 400, payer: 'Baldes', station: 'kanazawa' },
    ];

    await abgleichen();

    // Reihenfolge kommt aus `position`, nicht aus der Zeilenfolge.
    expect(plan.days['2026-10-01'].placeNrs).toEqual([9, 5]);
    expect(plan.days['2026-10-01'].note).toBe('Kanazawa');
    expect(plan.done).toEqual([5]);
    expect(plan.bookings.ghibli).toBe(true);
    expect(plan.packingExtra).toEqual(['Beutel']);
    expect(plan.packing['extra:Beutel']).toBe(false);
    expect(plan.expenses[0]).toMatchObject({ label: 'Bus', yen: 400 });
  });

  it('übernimmt die Löschung eines anderen Geräts und schreibt sie nicht zurück', async () => {
    addToDay('2026-10-02', 3);
    addToDay('2026-10-02', 4);
    await abgleichen();
    expect(plan.days['2026-10-02'].placeNrs).toEqual([3, 4]);

    // Das andere Gerät streicht Nr. 4.
    ablage.tabellen.plan_days = ablage.tabellen.plan_days.filter((z) => z.place_nr !== 4);

    await abgleichen();
    expect(plan.days['2026-10-02'].placeNrs).toEqual([3]);

    // Und der nächste Durchgang darf sie nicht wieder herbeizaubern.
    await abgleichen();
    expect(ablage.tabellen.plan_days.map((z) => z.place_nr)).toEqual([3]);
    expect(plan.days['2026-10-02'].placeNrs).toEqual([3]);
  });

  it('wirft ein abgewähltes Häkchen nicht als besucht zurück', async () => {
    ablage.tabellen.plan_flags = [{ art: 'done', schluessel: '77', wert: false, updated_at: 'x' }];
    await abgleichen();
    expect(plan.done).toEqual([]);
  });
});

describe('Reihenfolge und Netzausfall', () => {
  it('sendet vor dem Holen — sonst wäre die eigene Änderung verloren', async () => {
    // In der Ablage liegt ein anderer Stand für denselben Tag.
    ablage.tabellen.plan_days = [
      { datum: '2026-10-03', place_nr: 99, position: 0, updated_at: 'x' },
    ];
    addToDay('2026-10-03', 5);

    await abgleichen();

    expect(plan.days['2026-10-03'].placeNrs).toEqual([5]);
    expect(ablage.tabellen.plan_days.map((z) => z.place_nr)).toEqual([5]);
    // Erst POST/DELETE, dann GET.
    const ersterGet = ablage.verlauf.findIndex((z) => z.startsWith('GET'));
    const letztesSchreiben = ablage.verlauf.reduce(
      (i, z, n) => (z.startsWith('GET') ? i : n),
      -1,
    );
    expect(letztesSchreiben).toBeLessThan(ersterGet);
  });

  it('behält die Änderung bei Netzausfall und holt nichts', async () => {
    ablage.tabellen.plan_notes = [{ datum: '2026-10-04', notiz: 'fremd', updated_at: 'x' }];
    setNote('2026-10-05', 'meine Notiz');

    ablage.faelltAus = 1;
    await abgleichen();

    expect(sync.status).toBe('wartet');
    expect(sync.offen).toBe(1);
    // Nicht geholt: der fremde Stand ist noch nicht da.
    expect(plan.days['2026-10-04']).toBeUndefined();
    expect(plan.days['2026-10-05'].note).toBe('meine Notiz');

    await abgleichen();
    expect(sync.status).toBe('bereit');
    expect(sync.offen).toBe(0);
    expect(ablage.tabellen.plan_notes.find((z) => z.datum === '2026-10-05')).toBeDefined();
    expect(plan.days['2026-10-04'].note).toBe('fremd');
  });

  it('übersteht einen Neustart mit gefüllter Warteschlange', async () => {
    ablage.faelltAus = 1;
    setNote('2026-10-06', 'unterwegs getippt');
    await abgleichen();
    expect(sync.offen).toBe(1);

    // Gespeichert wird die Warteschlange im localStorage — das ist der Punkt.
    const gespeichert = localStorage.getItem('japan2026:offene-aenderungen');
    expect(gespeichert).toContain('2026-10-06');

    verbinde(); // wie nach einem Neuladen der Seite
    await abgleichen();
    expect(ablage.tabellen.plan_notes[0].notiz).toBe('unterwegs getippt');
  });
});

describe('Erstübergabe', () => {
  beforeEach(() => {
    localStorage.removeItem('japan2026:erstabgleich');
  });

  it('lädt den lokalen Plan hoch, wenn die Ablage leer ist', async () => {
    addToDay('2026-10-07', 21);
    zuruecksetzenFuerTest(); // als wäre der Plan schon vor dem Anmelden entstanden
    expect(sync.offen).toBe(0);

    await abgleichen();
    expect(sync.status).toBe('lädt');
    await abgleichen(); // der von `anstellen` angestoßene Durchgang

    expect(ablage.tabellen.plan_days.map((z) => z.place_nr)).toEqual([21]);
  });

  it('fragt, wenn auf beiden Seiten etwas liegt', async () => {
    addToDay('2026-10-08', 31);
    zuruecksetzenFuerTest();
    ablage.tabellen.plan_days = [
      { datum: '2026-10-09', place_nr: 55, position: 0, updated_at: 'x' },
      { datum: '2026-10-09', place_nr: 56, position: 1, updated_at: 'x' },
    ];

    await abgleichen();

    expect(sync.status).toBe('entscheidung');
    expect(kennzahlen(plan).orte).toBe(1);
    expect(kennzahlen(sync.entscheidung!).orte).toBe(2);
    // Nichts wurde still verändert.
    expect(plan.days['2026-10-08'].placeNrs).toEqual([31]);
    expect(ablage.tabellen.plan_days).toHaveLength(2);
  });

  it('übernimmt auf Wunsch den gemeinsamen Stand', async () => {
    addToDay('2026-10-08', 31);
    zuruecksetzenFuerTest();
    ablage.tabellen.plan_days = [
      { datum: '2026-10-09', place_nr: 55, position: 0, updated_at: 'x' },
    ];
    await abgleichen();
    expect(sync.status).toBe('entscheidung');

    entscheideFuerAblage();
    await ruhe();

    expect(plan.days['2026-10-08']).toBeUndefined();
    expect(plan.days['2026-10-09'].placeNrs).toEqual([55]);
    expect(sync.entscheidung).toBeNull();
  });

  it('lädt auf Wunsch das Gerät hoch und räumt die Ablage ab', async () => {
    addToDay('2026-10-08', 31);
    zuruecksetzenFuerTest();
    ablage.tabellen.plan_days = [
      { datum: '2026-10-09', place_nr: 55, position: 0, updated_at: 'x' },
    ];
    await abgleichen();
    expect(sync.status).toBe('entscheidung');

    entscheideFuerGeraet();
    await ruhe();
    await abgleichen();

    expect(ablage.tabellen.plan_days.map((z) => z.datum)).toEqual(['2026-10-08']);
    expect(plan.days['2026-10-09']).toBeUndefined();
  });
});

describe('Alles zurücksetzen', () => {
  it('leert auch die gemeinsame Ablage', async () => {
    addToDay('2026-10-10', 61);
    setNote('2026-10-10', 'x');
    toggleDone(61);
    addExpense({ date: '2026-10-10', label: 'Taxi', yen: 2000, payer: 'Paule', station: 'tokio' });
    await abgleichen();
    expect(ablage.tabellen.plan_days).toHaveLength(1);

    resetAll();
    await abgleichen();

    expect(ablage.tabellen.plan_days).toHaveLength(0);
    expect(ablage.tabellen.plan_notes).toHaveLength(0);
    expect(ablage.tabellen.plan_flags).toHaveLength(0);
    expect(ablage.tabellen.expenses).toHaveLength(0);
  });
});

describe('Störungen', () => {
  it('nennt fehlende Tabellen im Klartext', async () => {
    // So antwortet Supabase wirklich, wenn die Migration nicht gelaufen ist:
    // HTTP 404 mit PGRST205, nicht ein Netzfehler.
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          code: 'PGRST205',
          message: "Could not find the table 'public.plan_notes' in the schema cache",
        }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    setNote('2026-10-11', 'x');
    await abgleichen();
    await abgleichen();
    await abgleichen();

    expect(sync.status).toBe('fehler');
    expect(sync.fehler).toMatch(/Migration/);
  });

  it('lässt eine dauerhaft abgelehnte Änderung nicht alles blockieren', async () => {
    let abgelehnt = 0;
    const streng = async (eingabe: string | URL | Request, init?: RequestInit) => {
      const u = new URL(eingabe.toString());
      if (u.pathname.endsWith('plan_notes') && (init?.method ?? 'GET') === 'POST') {
        abgelehnt += 1;
        return new Response(JSON.stringify({ code: '42501', message: 'permission denied' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }
      return ablage.fetch(eingabe, init);
    };
    globalThis.fetch = streng as typeof fetch;

    setNote('2026-10-12', 'geht nicht durch');
    toggleDone(5); // muss trotzdem ankommen

    await abgleichen();
    await abgleichen();
    await abgleichen();

    expect(abgelehnt).toBe(3);
    // Die folgenden Änderungen kommen durch …
    expect(sync.offen).toBe(0);
    expect(ablage.tabellen.plan_flags.map((z) => z.schluessel)).toEqual(['5']);
    // … und die verlorene Änderung bleibt gemeldet, auch wenn danach alles
    // wieder läuft. Ein erfolgreiches Holen darf sie nicht überdecken.
    expect(sync.verworfen).toMatch(/Reisender/);

    verworfenQuittieren();
    expect(sync.verworfen).toBeNull();
  });

  it('schickt eine Ausgabe ohne Betrag nicht los', async () => {
    addExpense({ date: '2026-10-13', label: 'kaputt', yen: 0, payer: 'Paule', station: 'tokio' });
    await abgleichen();
    expect(ablage.tabellen.expenses).toHaveLength(0);
    expect(sync.offen).toBe(0);
    expect(sync.status).toBe('bereit');
  });
});

describe('Eigene Orte', () => {
  /** Grundgerüst für einen neuen Ort — die Maske füllt dasselbe. */
  const HOSHINO = {
    name: 'Hoshino Coffee',
    category: 'essen' as const,
    station: 'tokio',
    stationLabel: 'Tokio',
    area: 'zentrum' as const,
    lat: 35.6932,
    lng: 139.7005,
    descriptionHtml: 'Pancakes, die eine halbe Stunde brauchen.',
  };

  it('vergibt die endgültige Nummer aus der Datenbank, nicht im Browser', async () => {
    const vorlaeufig = ortAnlegen(HOSHINO, WER);
    expect(vorlaeufig).toBeLessThan(0); // noch keine echte Nummer
    expect(vorlaeufigeOrte()).toHaveLength(1);

    await abgleichen();

    // 1001 ist der Start der Sequenz: 1–1000 gehören dem Reiseband (0010).
    expect(ablage.tabellen.places_custom[0].nr).toBe(1001);
    expect(plan.customPlaces[0].nr).toBe(1001);
    expect(plan.customPlaces[0].vorlaeufig).toBe(false);
    expect(vorlaeufigeOrte()).toHaveLength(0);
  });

  it('zählt weiter statt eine Nummer zweimal zu vergeben', async () => {
    ortAnlegen(HOSHINO, WER);
    await abgleichen();
    ortAnlegen({ ...HOSHINO, name: 'Ninja Café Asakusa' }, WER);
    await abgleichen();

    expect(plan.customPlaces.map((p) => p.nr)).toEqual([1001, 1002]);
  });

  it('zieht die neue Nummer in Tagesplan und Häkchen nach', async () => {
    const vorlaeufig = ortAnlegen(HOSHINO, WER);
    // Direkt auf einen Tag gelegt und abgehakt, bevor Netz da war.
    addToDay('2026-10-12', vorlaeufig);
    toggleDone(vorlaeufig);
    expect(plan.days['2026-10-12'].placeNrs).toEqual([vorlaeufig]);

    await abgleichen();

    expect(plan.customPlaces[0].nr).toBe(1001);
    expect(plan.days['2026-10-12'].placeNrs).toEqual([1001]);
    expect(plan.done).toEqual([1001]);
    // Und in der Ablage steht die echte Nummer, keine vorläufige.
    expect(ablage.tabellen.plan_days.map((z) => z.place_nr)).toEqual([1001]);
    expect(ablage.tabellen.plan_flags.map((z) => z.schluessel)).toEqual(['1001']);
  });

  it('legt den Ort vor dem Tag an, der ihn enthält', async () => {
    const nr = ortAnlegen(HOSHINO, WER);
    addToDay('2026-10-12', nr);
    await abgleichen();

    const ortPost = ablage.verlauf.indexOf('POST places_custom');
    const tagPost = ablage.verlauf.indexOf('POST plan_days');
    expect(ortPost).toBeGreaterThanOrEqual(0);
    expect(ortPost).toBeLessThan(tagPost);
  });

  it('überlebt einen Neustart ohne Netz und bekommt die Nummer später', async () => {
    ablage.faelltAus = 1;
    const vorlaeufig = ortAnlegen(HOSHINO, WER);
    await abgleichen();
    expect(sync.status).toBe('wartet');
    expect(plan.customPlaces[0].nr).toBe(vorlaeufig);
    // Nichts geholt — der lokale, nummernlose Ort ist noch da.
    expect(plan.customPlaces).toHaveLength(1);

    verbinde();
    await abgleichen();
    expect(plan.customPlaces[0].nr).toBe(1001);
  });

  it('ändert einen Ort ohne neue Nummer', async () => {
    ortAnlegen(HOSHINO, WER);
    await abgleichen();
    ortAendern(1001, { name: 'Hoshino Coffee (Shinjuku)' });
    await abgleichen();

    expect(ablage.tabellen.places_custom).toHaveLength(1);
    expect(ablage.tabellen.places_custom[0]).toMatchObject({
      nr: 1001,
      name: 'Hoshino Coffee (Shinjuku)',
    });
  });

  it('löscht einen Ort samt seiner Spuren im Plan', async () => {
    ortAnlegen(HOSHINO, WER);
    await abgleichen();
    addToDay('2026-10-12', 1001);
    toggleDone(1001);
    await abgleichen();

    ortLoeschen(1001);
    await abgleichen();

    expect(ablage.tabellen.places_custom).toHaveLength(0);
    // Ein Tag ohne Orte verschwindet beim Holen ganz — er hat keine Zeile mehr.
    expect(plan.days['2026-10-12']?.placeNrs ?? []).toEqual([]);
    expect(plan.done).toEqual([]);
    expect(ablage.tabellen.plan_days).toHaveLength(0);
  });

  it('holt eigene Orte anderer Geräte', async () => {
    ablage.tabellen.places_custom = [
      {
        nr: 170,
        name: 'Burg Matsumoto',
        kategorie: 'kultur',
        station: ABSEITS,
        area: 'zentrum',
        lat: 36.2384,
        lng: 137.969,
        beschreibung: 'Schwarze Burg, Original von 1594.',
        from_book: true,
        closed_day: null,
        needs_booking: false,
        cash_only: false,
        updated_at: 'x',
      },
    ];
    await abgleichen();

    const ort = plan.customPlaces[0];
    expect(ort).toMatchObject({ nr: 170, name: 'Burg Matsumoto', station: ABSEITS });
    expect(ort.stationLabel).toBe('Nicht auf der Route');
    expect(ort.book).toBeTruthy(); // 📖 ist gesetzt
    expect(ort.vorlaeufig).toBe(false);
  });
});

describe('Nicht auf der Route', () => {
  const MATSUMOTO = {
    name: 'Burg Matsumoto',
    category: 'kultur' as const,
    station: ABSEITS,
    stationLabel: 'Nicht auf der Route',
    area: 'zentrum' as const,
    lat: 36.2384,
    lng: 137.969,
  };

  it('ist nicht auf einen Reisetag legbar', async () => {
    const nr = ortAnlegen(MATSUMOTO, WER);
    expect(istPlanbar(nr)).toBe(false);

    addToDay('2026-10-06', nr);
    expect(plan.days['2026-10-06']?.placeNrs ?? []).toEqual([]);
  });

  it('nimmt einen Ort vom Tag, der nachträglich abseits landet', async () => {
    const nr = ortAnlegen({ ...MATSUMOTO, station: 'takayama', stationLabel: 'Takayama' }, WER);
    addToDay('2026-10-06', nr);
    expect(plan.days['2026-10-06'].placeNrs).toEqual([nr]);

    ortAendern(nr, { station: ABSEITS, stationLabel: 'Nicht auf der Route' });
    expect(plan.days['2026-10-06'].placeNrs).toEqual([]);
  });

  it('lässt feste Orte des Reisebands unverändert planbar', () => {
    expect(istPlanbar(1)).toBe(true);
    expect(istPlanbar(164)).toBe(true);
    expect(istPlanbar(999)).toBe(false);
  });
});

// ============================================================ Korrekturen ===
//
// Der schwierige Teil sind nicht die Korrekturen selbst, sondern ihre
// **Rücknahme**: In der Datenbank ist NULL zweideutig — „nicht korrigiert" und
// „ausdrücklich geleert" sehen gleich aus. Wird das verwechselt, löscht jede
// beliebige Korrektur den Schließtag eines Ortes aus dem Reiseband. Ein Museum,
// das geschlossen ist und offen aussieht, kostet unterwegs einen halben Tag.

describe('Korrekturen an festen Orten', () => {
  it('überschreibt nur das korrigierte Feld, der Rest bleibt wie im Buch', async () => {
    const vorher = sichtbareOrte().find((p) => p.nr === 47)!;
    expect(vorher).toBeDefined();

    ortAendern(47, { lat: 34.9805, lng: 135.7477 });
    const nachher = sichtbareOrte().find((p) => p.nr === 47)!;

    expect(nachher.lat).toBeCloseTo(34.9805, 4);
    expect(nachher.name).toBe(vorher.name);
    expect(nachher.descriptionHtml).toBe(vorher.descriptionHtml);
    expect(nachher.station).toBe(vorher.station);
    expect(istKorrigiert(47)).toBe(true);
  });

  it('nimmt den Google-Maps-Verweis weg, wenn die Koordinate korrigiert wurde', async () => {
    // Sonst führt die Navigation vor Ort weiter zur falschen Stelle — und genau
    // dafür wurde die Koordinate ja korrigiert.
    const mitId = sichtbareOrte().find((p) => p.placeId)!;
    expect(mitId).toBeDefined();
    ortAendern(mitId.nr, { lat: 35.0, lng: 135.0 });
    expect(sichtbareOrte().find((p) => p.nr === mitId.nr)!.placeId).toBeNull();
  });

  it('macht eine Korrektur rückgängig und der Buchwert steht wieder da', async () => {
    const vorher = sichtbareOrte().find((p) => p.nr === 47)!;
    ortAendern(47, { name: 'Falscher Name' });
    expect(sichtbareOrte().find((p) => p.nr === 47)!.name).toBe('Falscher Name');

    korrekturZuruecknehmen(47, 'name');
    expect(sichtbareOrte().find((p) => p.nr === 47)!.name).toBe(vorher.name);
    expect(istKorrigiert(47)).toBe(false);
  });

  it('räumt eine inhaltslose Korrektur ganz weg statt eine leere Zeile zu behalten', async () => {
    ortAendern(47, { name: 'Irgendwas' });
    expect(plan.korrekturen['47']).toBeDefined();
    korrekturZuruecknehmen(47, 'name');
    expect(plan.korrekturen['47']).toBeUndefined();
  });

  it('überträgt eine Korrektur und ihre Rücknahme in die Ablage', async () => {
    ortAendern(47, { lat: 34.9805, lng: 135.7477 });
    await abgleichen();
    expect(ablage.tabellen.places_patch).toHaveLength(1);
    expect(ablage.tabellen.places_patch[0]).toMatchObject({ nr: 47, lat: 34.9805 });

    korrekturZuruecknehmen(47);
    await abgleichen();
    // Zurückgenommen heißt: Zeile weg, nicht Zeile mit alten Werten.
    expect(ablage.tabellen.places_patch).toHaveLength(0);
  });

  it('unterscheidet „nicht korrigiert" von „ausdrücklich kein Schließtag"', async () => {
    // Der Ort hat im Buch einen Schließtag. Eine Korrektur an der Koordinate
    // darf ihn nicht mitnehmen.
    const mitTag = sichtbareOrte().find((p) => p.closedDay)!;
    expect(mitTag).toBeDefined();
    ortAendern(mitTag.nr, { lat: 35.1, lng: 135.1 });
    expect(sichtbareOrte().find((p) => p.nr === mitTag.nr)!.closedDay).toBe(mitTag.closedDay);

    // Jetzt ausdrücklich leeren — das muss wirken und den Abgleich überleben.
    ortAendern(mitTag.nr, { closedDay: null });
    expect(sichtbareOrte().find((p) => p.nr === mitTag.nr)!.closedDay).toBeNull();

    await abgleichen();
    const zeile = ablage.tabellen.places_patch.find((z) => z.nr === mitTag.nr)!;
    expect(zeile.closed_day).toBe('');

    // Und nach dem Holen vom anderen Gerät ist er noch geleert.
    uebernehmeFremdstand({});
    expect(sichtbareOrte().find((p) => p.nr === mitTag.nr)!.closedDay).toBe(mitTag.closedDay);
    await abgleichen();
    expect(sichtbareOrte().find((p) => p.nr === mitTag.nr)!.closedDay).toBeNull();
  });

  it('kann ein falsches Buchzeichen entfernen', async () => {
    // 72 der 📖-Zuordnungen sind über Namensabgleich entstanden und ungeprüft.
    const mitBuch = sichtbareOrte().find((p) => p.book)!;
    expect(mitBuch).toBeDefined();
    ortAendern(mitBuch.nr, { book: null });
    expect(sichtbareOrte().find((p) => p.nr === mitBuch.nr)!.book).toBeUndefined();

    await abgleichen();
    expect(ablage.tabellen.places_patch.find((z) => z.nr === mitBuch.nr)!.from_book).toBe(false);

    uebernehmeFremdstand({});
    await abgleichen();
    expect(sichtbareOrte().find((p) => p.nr === mitBuch.nr)!.book).toBeUndefined();
  });
});

describe('Ausblenden statt löschen', () => {
  it('nimmt einen festen Ort aus der Liste, behält aber seine Nummer', async () => {
    const anzahl = sichtbareOrte().length;
    ortEntfernen(47);
    expect(sichtbareOrte()).toHaveLength(anzahl - 1);
    expect(sichtbareOrte().some((p) => p.nr === 47)).toBe(false);
    // Die Nummer steht im gedruckten Band — sie darf nicht frei werden.
    expect(versteckteOrte().some((p) => p.nr === 47)).toBe(true);
  });

  it('blendet ihn wieder ein', async () => {
    ortEntfernen(47);
    ortVerstecken(47, false);
    expect(sichtbareOrte().some((p) => p.nr === 47)).toBe(true);
    expect(plan.korrekturen['47']).toBeUndefined();
  });

  it('nimmt einen ausgeblendeten Ort von seinem Reisetag', async () => {
    addToDay('2026-09-28', 47);
    expect(plan.days['2026-09-28'].placeNrs).toContain(47);
    ortEntfernen(47);
    expect(plan.days['2026-09-28']?.placeNrs ?? []).not.toContain(47);
  });

  it('löscht einen eigenen Ort wirklich, statt ihn nur auszublenden', async () => {
    const nr = ortAnlegen({
      name: 'Airbnb Kanazawa',
      category: 'hotel',
      station: 'kanazawa',
      stationLabel: 'Kanazawa',
      area: 'zentrum',
      lat: 36.56,
      lng: 136.65,
      unterkunft: true,
    });
    ortEntfernen(nr);
    expect(plan.customPlaces).toHaveLength(0);
    expect(versteckteOrte().some((p) => p.nr === nr)).toBe(false);
  });
});

describe('Schlagworte', () => {
  it('hängen an festen und an eigenen Orten', async () => {
    schlagworteSetzen(47, ['regentag', 'früh da sein']);
    expect(schlagworteVon(47)).toEqual(['regentag', 'früh da sein']);

    const nr = ortAnlegen({
      name: 'Hoshino Coffee',
      category: 'essen',
      station: 'tokio',
      stationLabel: 'Tokio',
      area: 'zentrum',
      lat: 35.68,
      lng: 139.76,
    });
    schlagworteSetzen(nr, ['frühstück']);
    expect(schlagworteVon(nr)).toEqual(['frühstück']);
    expect(alleSchlagworte()).toEqual(['frühstück', 'regentag', 'früh da sein'].sort((a, b) => a.localeCompare(b, 'de')));
  });

  it('werfen Doppelte und Leerzeichen weg', async () => {
    schlagworteSetzen(47, ['  regentag ', 'regentag', '', '   ']);
    expect(schlagworteVon(47)).toEqual(['regentag']);
  });

  it('zählen nicht als Korrektur am Buchwert', async () => {
    // Sonst würde „alles zurücksetzen" die eigenen Schlagworte mitreißen.
    schlagworteSetzen(47, ['regentag']);
    expect(istKorrigiert(47)).toBe(false);
    ortAendern(47, { name: 'Neu' });
    korrekturZuruecknehmen(47);
    expect(schlagworteVon(47)).toEqual(['regentag']);
  });

  it('überleben den Abgleich', async () => {
    schlagworteSetzen(47, ['regentag', 'teuer']);
    await abgleichen();
    expect(ablage.tabellen.places_patch[0].schlagworte).toEqual(['regentag', 'teuer']);

    uebernehmeFremdstand({});
    expect(schlagworteVon(47)).toEqual([]);
    await abgleichen();
    expect(schlagworteVon(47)).toEqual(['regentag', 'teuer']);
  });

  it('wandern mit, wenn ein eigener Ort seine echte Nummer bekommt', async () => {
    // Ohne Netz bekommt ein neuer Ort eine negative Nummer. Bliebe das
    // Schlagwort daran hängen, wäre es nach dem ersten Abgleich verloren.
    const nr = ortAnlegen({
      name: 'Airbnb Takayama',
      category: 'hotel',
      station: 'takayama',
      stationLabel: 'Takayama',
      area: 'zentrum',
      lat: 36.14,
      lng: 137.25,
      unterkunft: true,
    });
    expect(nr).toBeLessThan(0);
    schlagworteSetzen(nr, ['unsere buchung']);

    await abgleichen();
    const echte = plan.customPlaces[0].nr;
    expect(echte).toBeGreaterThan(0);
    expect(schlagworteVon(echte)).toEqual(['unsere buchung']);
    expect(schlagworteVon(nr)).toEqual([]);
  });
});
