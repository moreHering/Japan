/**
 * Ein kleiner, **strenger** PostgREST-Ersatz für den Prüfstand.
 *
 * ## Warum das hier steht
 *
 * Die echte Datenbank ist aus dieser Umgebung nicht erreichbar (API 403,
 * Direktverbindung nur IPv6, Pooler-Ports zu), und die PostgREST-Binärdatei
 * lässt sich hier nicht beschaffen. Die Abgleich-Logik ist aber genau die
 * Stelle, an der stille Datenverluste entstehen — sie ungetestet zu lassen
 * wäre die schlechteste Wahl.
 *
 * ## Was er prüft und was nicht
 *
 * Er ist **absichtlich streng**: Jeder Filter, jeder Vorzug (`Prefer`) und jede
 * Spalte, die er nicht kennt, führt zum Abbruch. Damit fällt eine falsch
 * geschriebene Bedingung hier auf, statt erst auf dem Handy in Japan. Auch die
 * Primärschlüssel und `yen > 0` werden durchgesetzt, wie in der Migration.
 *
 * Er prüft **nicht** die Row Level Security — das tut `supabase/test/run.sh`
 * gegen einen echten Postgres. Und er ist kein Beweis, dass Supabase sich
 * genauso verhält; er prüft, dass die Anfragen die Form haben, die PostgREST
 * verlangt, und dass die Logik darüber stimmt.
 */

type Zeile = Record<string, unknown>;

/** Trenner für zusammengesetzte Schlüssel — in echten Werten kommt er nicht vor. */
const TRENNER = String.fromCharCode(0);

/** Tabellen mit ihren Primärschlüsseln — wie in 0001_init.sql. */
const SCHLUESSEL: Record<string, string[]> = {
  plan_days: ['datum', 'place_nr'],
  plan_notes: ['datum'],
  plan_flags: ['art', 'schluessel'],
  expenses: ['id'],
  places_custom: ['nr'],
  places_patch: ['nr'],
};

const SPALTEN: Record<string, string[]> = {
  plan_days: ['datum', 'place_nr', 'position', 'updated_at', 'updated_by'],
  plan_notes: ['datum', 'notiz', 'updated_at', 'updated_by'],
  plan_flags: ['art', 'schluessel', 'wert', 'updated_at', 'updated_by'],
  expenses: ['id', 'datum', 'text', 'yen', 'payer', 'station', 'created_at', 'created_by'],
  places_custom: [
    'nr',
    'name',
    'kategorie',
    'station',
    'area',
    'lat',
    'lng',
    'beschreibung',
    'from_book',
    'closed_day',
    'needs_booking',
    'cash_only',
    'unterkunft',
    'created_at',
    'created_by',
    'updated_at',
    'schlagworte',
  ],
  places_patch: [
    'nr',
    'name',
    'kategorie',
    'station',
    'area',
    'lat',
    'lng',
    'beschreibung',
    'from_book',
    'closed_day',
    'needs_booking',
    'cash_only',
    'unterkunft',
    'versteckt',
    'schlagworte',
    'updated_at',
    'updated_by',
  ],
};

/**
 * Spalten mit Standardwert — sie dürfen beim Einfügen fehlen.
 * `places_custom.nr` kommt aus einer Sequenz ab 165, wie in der Migration.
 */
const SEQUENZ_START = 165;

export class Ablage {
  tabellen: Record<string, Zeile[]> = {
    plan_days: [],
    plan_notes: [],
    plan_flags: [],
    expenses: [],
    places_custom: [],
    places_patch: [],
  };

  /** Nächster Wert der Nummernsequenz. Zählt auch nach Löschungen weiter. */
  naechsteNr = SEQUENZ_START;

  /** Mitschrift aller Anfragen — damit ein Test die Reihenfolge prüfen kann. */
  verlauf: string[] = [];

  /** So viele der nächsten Anfragen scheitern lassen (Netzausfall nachstellen). */
  faelltAus = 0;

  leeren() {
    for (const t of Object.keys(this.tabellen)) this.tabellen[t] = [];
    this.verlauf = [];
    this.naechsteNr = SEQUENZ_START;
  }

  private pk(tabelle: string, z: Zeile) {
    return SCHLUESSEL[tabelle].map((k) => String(z[k])).join(TRENNER);
  }

  /** Als `fetch` einzusetzen. */
  fetch = async (eingabe: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (this.faelltAus > 0) {
      this.faelltAus -= 1;
      throw new TypeError('fetch failed');
    }

    const roh = typeof eingabe === 'string' ? eingabe : eingabe.toString();
    const url = new URL(roh);
    const tabelle = url.pathname.replace(/^\/rest\/v1\//, '');
    const methode = (init?.method ?? 'GET').toUpperCase();

    if (!SCHLUESSEL[tabelle]) throw new Error(`Unbekannte Tabelle: ${tabelle}`);
    this.verlauf.push(`${methode} ${tabelle}`);

    const kopf = new Headers(init?.headers as HeadersInit);
    const prefer = kopf.get('Prefer') ?? '';
    for (const teil of prefer
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (
        !/^(resolution=merge-duplicates|return=(minimal|representation)|count=exact|missing=default)$/.test(
          teil,
        )
      ) {
        throw new Error(`Unbekannter Prefer-Wert: ${teil}`);
      }
    }

    const koerper = init?.body ? JSON.parse(String(init.body)) : null;

    switch (methode) {
      case 'GET':
        return this.lesen(tabelle, url);
      case 'POST':
        return this.schreiben(
          tabelle,
          url,
          koerper,
          prefer.includes('merge-duplicates'),
          (kopf.get('Accept') ?? '').includes('vnd.pgrst.object'),
        );
      case 'DELETE':
        return this.loeschen(tabelle, url);
      default:
        throw new Error(`Methode ${methode} ist im Prüfstand nicht abgebildet.`);
    }
  };

  // ------------------------------------------------------------------ lesen --

  private lesen(tabelle: string, url: URL) {
    let zeilen = this.tabellen[tabelle].filter((z) => this.passt(tabelle, z, url));

    for (const [name, wert] of url.searchParams) {
      if (name !== 'order') continue;
      const [spalte, richtung] = wert.split('.');
      this.pruefeSpalte(tabelle, spalte);
      const aufsteigend = richtung !== 'desc';
      zeilen = [...zeilen].sort((a, b) => {
        const x = a[spalte] as never;
        const y = b[spalte] as never;
        return (x < y ? -1 : x > y ? 1 : 0) * (aufsteigend ? 1 : -1);
      });
    }

    const select = url.searchParams.get('select');
    if (select && select !== '*') {
      for (const s of select.split(',').map((x) => x.trim())) this.pruefeSpalte(tabelle, s);
    }

    return antwort(200, zeilen);
  }

  // -------------------------------------------------------------- schreiben --

  private schreiben(
    tabelle: string,
    url: URL,
    koerper: unknown,
    upsert: boolean,
    einObjekt: boolean,
  ) {
    const zeilen = (Array.isArray(koerper) ? koerper : [koerper]) as Zeile[];
    const ziel = url.searchParams.get('on_conflict');
    const geschrieben: Zeile[] = [];

    if (upsert) {
      if (!ziel) throw new Error(`Upsert auf ${tabelle} ohne on_conflict.`);
      const erwartet = SCHLUESSEL[tabelle].join(',');
      if (ziel !== erwartet) {
        throw new Error(`on_conflict=${ziel} passt nicht zum Schlüssel (${erwartet}).`);
      }
    } else if (ziel) {
      throw new Error('on_conflict ohne Prefer: resolution=merge-duplicates.');
    }

    for (const roh of zeilen) {
      const z: Zeile = { ...roh };
      for (const k of Object.keys(z)) this.pruefeSpalte(tabelle, k);

      // Die Nummer eigener Orte vergibt die Sequenz, wenn der Client keine
      // mitschickt — genau wie `default nextval(...)` in der Migration.
      if (tabelle === 'places_custom' && (z.nr === undefined || z.nr === null)) {
        z.nr = this.naechsteNr++;
      }

      for (const k of SCHLUESSEL[tabelle]) {
        if (z[k] === undefined || z[k] === null) {
          throw new Error(`${tabelle}: Primärschlüsselteil ${k} fehlt.`);
        }
      }
      if (tabelle === 'expenses' && !((z.yen as number) > 0)) {
        return antwort(400, {
          code: '23514',
          message: 'violates check constraint "expenses_yen_check"',
        });
      }

      const key = this.pk(tabelle, z);
      const i = this.tabellen[tabelle].findIndex((v) => this.pk(tabelle, v) === key);
      if (i === -1) {
        this.tabellen[tabelle].push({ ...z });
        geschrieben.push({ ...z });
      } else if (upsert) {
        this.tabellen[tabelle][i] = { ...this.tabellen[tabelle][i], ...z };
        geschrieben.push({ ...this.tabellen[tabelle][i] });
      } else {
        return antwort(409, {
          code: '23505',
          message: `duplicate key value violates unique constraint "${tabelle}_pkey"`,
        });
      }
    }
    // Nur wenn der Aufrufer `select` anhängt, kommt etwas zurück — so hält es
    // PostgREST auch.
    if (!url.searchParams.has('select')) return antwort(201, null);
    if (einObjekt) {
      if (geschrieben.length !== 1) {
        return antwort(406, {
          code: 'PGRST116',
          message: `JSON object requested, multiple (or no) rows returned`,
        });
      }
      return antwort(201, geschrieben[0]);
    }
    return antwort(201, geschrieben);
  }

  // --------------------------------------------------------------- löschen --

  private loeschen(tabelle: string, url: URL) {
    const bedingungen = [...url.searchParams].filter(([n]) => n !== 'select' && n !== 'order');
    if (!bedingungen.length) {
      // PostgREST erlaubt es, aber ein unbedingtes DELETE ist im Zweifel ein
      // Fehler im Aufrufer — hier wird er sichtbar statt stillschweigend.
      throw new Error(`DELETE auf ${tabelle} ohne jede Bedingung.`);
    }
    this.tabellen[tabelle] = this.tabellen[tabelle].filter((z) => !this.passt(tabelle, z, url));
    return antwort(204, null);
  }

  // ------------------------------------------------------------------ Filter --

  private pruefeSpalte(tabelle: string, spalte: string) {
    if (!SPALTEN[tabelle].includes(spalte)) {
      throw new Error(`${tabelle} hat keine Spalte ${spalte}.`);
    }
  }

  private passt(tabelle: string, z: Zeile, url: URL): boolean {
    for (const [name, ausdruck] of url.searchParams) {
      if (name === 'select' || name === 'order' || name === 'on_conflict') continue;
      this.pruefeSpalte(tabelle, name);
      if (!this.einFilter(z[name], ausdruck)) return false;
    }
    return true;
  }

  private einFilter(wert: unknown, ausdruck: string): boolean {
    let negiert = false;
    let rest = ausdruck;
    if (rest.startsWith('not.')) {
      negiert = true;
      rest = rest.slice(4);
    }
    const punkt = rest.indexOf('.');
    if (punkt === -1) throw new Error(`Filter ohne Operator: ${ausdruck}`);
    const op = rest.slice(0, punkt);
    const arg = rest.slice(punkt + 1);

    let treffer: boolean;
    switch (op) {
      case 'eq':
        treffer = String(wert) === arg;
        break;
      case 'neq':
        treffer = String(wert) !== arg;
        break;
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        // Zahlenvergleich, wenn beide Seiten Zahlen sind — sonst textuell,
        // wie Postgres es je nach Spaltentyp auch tut.
        const a = Number(wert);
        const b = Number(arg);
        const zahlen = Number.isFinite(a) && Number.isFinite(b);
        const x: number | string = zahlen ? a : String(wert);
        const y: number | string = zahlen ? b : arg;
        treffer =
          op === 'gt' ? x > y : op === 'gte' ? x >= y : op === 'lt' ? x < y : x <= y;
        break;
      }
      case 'in': {
        if (!/^\(.*\)$/.test(arg)) throw new Error(`in-Filter ohne Klammern: ${arg}`);
        const liste = arg
          .slice(1, -1)
          .split(',')
          .map((s) => s.replace(/^"|"$/g, ''));
        treffer = liste.includes(String(wert));
        break;
      }
      case 'is':
        treffer =
          arg === 'null' ? wert === null || wert === undefined : Boolean(wert) === (arg === 'true');
        break;
      default:
        throw new Error(`Unbekannter Operator: ${op} (in ${ausdruck})`);
    }
    return negiert ? !treffer : treffer;
  }
}

function antwort(status: number, koerper: unknown) {
  // 204 verlangt einen leeren Rumpf — ein leerer String genügt nicht, das
  // lehnt die Response-Implementierung von Node ab.
  const ohneRumpf = status === 204 || status === 205 || status === 304;
  return new Response(ohneRumpf || koerper === null ? null : JSON.stringify(koerper), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
