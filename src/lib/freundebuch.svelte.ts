/**
 * Daten des Freundebuchs: Steckbriefe und Bilderstrom.
 *
 * **Bewusst anders als der Reiseplan:** Der Plan arbeitet offline weiter und
 * gleicht später ab. Das Freundebuch nicht — es braucht Netz und Anmeldung.
 * Der Grund ist nicht Bequemlichkeit, sondern der Speicher: Ein verkleinertes
 * Handyfoto sind 200–400 kB, der localStorage fasst rund 5 MB. Nach einem
 * Dutzend Bildern wäre er voll und die Reiseplanung mit ihm kaputt. Lieber
 * eine Seite, die ehrlich sagt „braucht Verbindung", als eine, die Bilder
 * annimmt und still verliert.
 *
 * Die Bilder liegen in einem nicht öffentlichen Bereich; gelesen wird über
 * Links, die eine Stunde gelten und beim Laden neu angefordert werden.
 */

import { getSupabase, supabaseConfigured } from './supabase';
import { auth } from './auth.svelte';
import { verkleinern } from './bild';
import { BILDER_MAX, pfadeVon, VORGABE, type VorlageName } from './vorlagen';

/** Die Fragen des Steckbriefs. Reihenfolge und Text stehen hier, nicht in der DB. */
export const FRAGEN = [
  { feld: 'essen', frage: 'Bestes Essen in Japan', platzhalter: 'Takoyaki um 23 Uhr …' },
  { feld: 'ort', frage: 'Lieblingsort', platzhalter: 'Nr. 96, die alte Teestube …' },
  { feld: 'moment', frage: 'Peinlichster Moment', platzhalter: 'Schuhe im Tempel …' },
  { feld: 'wort', frage: 'Erstes japanisches Wort, das saß', platzhalter: 'すみません' },
  { feld: 'motto', frage: 'Motto der Reise', platzhalter: '…' },
] as const;

export type Steckbrief = Record<string, string>;

export type Beitrag = {
  id: string;
  text: string;
  datum: string;
  ortNr: number | null;
  /**
   * Ortsangabe, wie sie beim Anlegen des Beitrags galt.
   *
   * Wird mitgeschrieben statt nachgeschlagen, weil `ortNr` ab 165 auf
   * `places_custom` zeigt — und das bleibt für Gäste dicht, dort stehen die
   * Unterkünfte. Nebeneffekt, der gefällt: Der Eintrag behält den Namen, den der
   * Ort damals hatte.
   *
   * `null` bei Beiträgen, die vor Migration 0008 entstanden sind; dann greift
   * der Rückfall über `placeByNr(ortNr)` für die festen 164.
   */
  ortName: string | null;
  ortLat: number | null;
  ortLng: number | null;
  sticker: string | null;
  /**
   * Das **erste** Bild — und nur deshalb noch da.
   *
   * Seit Migration 0009 ist `bildPfade` die Wahrheit. `bildPfad` bleibt, weil
   * `Wache.svelte` und ältere, zwischengespeicherte App-Fassungen es lesen; es
   * trägt immer `bildPfade[0]` oder `null`.
   */
  bildPfad: string | null;
  /** Für Gäste ein öffentlicher, sonst ein zeitlich begrenzter Link. */
  bildUrl: string | null;
  /** Alle Bilder des Beitrags, in Anzeigereihenfolge. Leer bei Textbeiträgen. */
  bildPfade: string[];
  bildUrls: string[];
  /**
   * Das Layout: polaroid, hochkant, panorama, streifen, collage — oder `null`
   * für die Vorgabe. Bewusst `string` und nicht `VorlageName`: In der Spalte
   * steht freier Text, und ein unbekannter Wert von einem neueren Gerät darf den
   * Beitrag nicht unlesbar machen. `vorlageVon()` fängt das ab.
   */
  vorlage: string | null;
  autorId: string;
  erstellt: string;
};

/**
 * Eine Zeile, wie `guestbook_post` sie liefert.
 *
 * `bild_pfade` und `vorlage` sind optional, weil sie vor Migration 0009 gar
 * nicht mitkommen — genau der Fall, den die Fähigkeitsprobe offenhält.
 */
type ZeileRoh = {
  id: string;
  text: string | null;
  datum: string;
  ort_nr: number | null;
  ort_name: string | null;
  ort_lat: number | null;
  ort_lng: number | null;
  sticker: string | null;
  bild_pfad: string | null;
  bild_pfade?: string[] | null;
  vorlage?: string | null;
  created_by: string;
  created_at: string;
};

export type Person = { id: string; name: string; farbe: string };

export type BuchStatus = 'aus' | 'abgemeldet' | 'lädt' | 'bereit' | 'fehler';

export const buch = $state({
  status: (supabaseConfigured ? 'abgemeldet' : 'aus') as BuchStatus,
  fehler: null as string | null,
  personen: [] as Person[],
  steckbriefe: {} as Record<string, Steckbrief>,
  /**
   * Link zum Profilbild je Person. Der Pfad steht im Steckbrief unter `bild`
   * (`PROFILBILD_FELD`), der Link kommt beim Laden dazu wie bei den Beiträgen.
   */
  profilbilder: {} as Record<string, string>,
  beitraege: [] as Beitrag[],
  /** Fortschritt eines laufenden Uploads, 0–100, oder null. */
  upload: null as number | null,
  /** Was das Verkleinern gebracht hat — wird nach dem Hochladen angezeigt. */
  letzteGroesse: null as { vorher: number; nachher: number } | null,
});

/*
 * **Ein Prüfhaken, und nur im Entwicklungsmodus.**
 *
 * Die Browsersuiten setzen `buch` direkt, weil Supabase aus dieser Umgebung nicht
 * erreichbar ist. Der naheliegende Weg dafür war
 * `await import('/src/lib/freundebuch.svelte.ts')` in der Seite — und der ist
 * unzuverlässig: Vite bedient dasselbe Modul unter mehreren URLs, und nach einer
 * Neu-Optimierung tragen die Importe einer Insel ein `?v=<hash>`. Ein Import ohne
 * diesen Anhang ist dann eine **zweite Instanz** mit eigenem `$state`, und der
 * Schreibvorgang landet in einem Zustand, den die Komponente nie liest.
 *
 * Gemessen: Die Suite lief, ich änderte eine Zeile in `vorlagen.ts`, und sie fiel
 * — ohne dass sich an ihr etwas geändert hatte. Am 22.09.2026 hat dieselbe Falle
 * drei andere Suiten gekippt.
 *
 * Deshalb hängt die Insel ihre **eigene** Instanz hier auf. `import.meta.env.DEV`
 * ist zur Bauzeit `false`, der Zweig fällt beim Bündeln weg; `test/dist.test.ts`
 * prüft, dass `__buch` im ausgelieferten Stand nicht vorkommt. Ein Prüfhaken, der
 * mitgeliefert wird, ist eine Hintertür.
 */
if (import.meta.env.DEV) {
  (globalThis as unknown as { __buch?: typeof buch }).__buch = buch;
}

const BUCKET = 'freundebuch';

/**
 * Das Profilbild ist eine weitere Zeile im Steckbrief: `feld = 'bild'`, `wert` =
 * Pfad in der Ablage.
 *
 * Ohne Migration, und das ist der Grund für diese Form: `guestbook_profile` nimmt
 * freie Feldnamen, jeder schreibt nur seine eigenen Zeilen (0003), Gäste dürfen
 * lesen (0008), die Ablage ist öffentlich lesbar. Eine eigene Spalte hätte eine
 * Migration gekostet und nichts gekonnt, was diese Zeile nicht kann.
 *
 * Das Feld steht **nicht** in `FRAGEN` — sonst tauchte der Pfad als Textfeld
 * „bild" im Steckbrief auf.
 */
export const PROFILBILD_FELD = 'bild';

/** Die Spalten, die `guestbook_post` seit 0001 hat — ohne die von 0009. */
const SPALTEN_ALT =
  'id, text, datum, ort_nr, ort_name, ort_lat, ort_lng, sticker, bild_pfad, created_by, created_at';
/** Dieselben plus `bild_pfade` und `vorlage` aus Migration 0009. */
const SPALTEN_NEU = `${SPALTEN_ALT}, bild_pfade, vorlage`;

/**
 * Kennt diese Datenbank die Spalten aus Migration 0009?
 *
 * `null` heißt „noch nicht geprüft". Die Probe ist **nötig und nicht
 * vorsichtshalber**: `ladeFreundebuch()` selektiert namentlich, und eine Abfrage
 * mit `bild_pfade` gegen eine Tabelle ohne diese Spalte antwortet mit 400. Der
 * ausgelieferte Code wäre damit zwischen Deploy und eingespielter Migration
 * **tot** — kein Bilderstrom, keine Steckbriefe, nur eine Fehlermeldung. Und
 * diese Lücke ist keine Minute lang, sondern so lang, bis jemand am Rechner
 * sitzt.
 *
 * Also: erst den vollen Select versuchen, bei „Spalte gibt es nicht" einmal auf
 * den alten zurückfallen und das für die Sitzung merken.
 */
let reihenFaehig: boolean | null = null;

/**
 * Nur für den Prüfstand: die Fähigkeitsprobe vergessen.
 *
 * Im Betrieb ruft das niemand — dort ist genau richtig, dass die Antwort für die
 * Sitzung stehen bleibt. In einer Prüfdatei liefen sonst alle Fälle gegen das
 * Ergebnis des ersten, und „ohne Migration" wäre grün, weil „mit Migration"
 * vorher gelaufen ist. Dasselbe Muster wie `zuruecksetzenFuerTest()` in
 * `sync.svelte.ts`.
 */
export function spaltenprobeZuruecksetzenFuerTest() {
  reihenFaehig = null;
}

/** Was die Oberfläche wissen muss: Sind Collagen überhaupt speicherbar? */
export function mehrbildFaehig(): boolean {
  // Vor der ersten Abfrage optimistisch: Die Wahl soll nicht flackern, und wer
  // eine migrierte Datenbank hat — der Normalfall — sieht sofort alles.
  return reihenFaehig !== false;
}

/**
 * Erkennt die PostgREST-Antwort auf eine unbekannte Spalte.
 *
 * `42703` ist der Postgres-Code für „undefined column". Die Meldung wird
 * mitgeprüft, weil PostgREST den Code je nach Fassung auch als `PGRST204`
 * ausgibt — und weil ein Prüfstand (`test/mini-postgrest.ts`) nur die Meldung
 * hat. Geprüft wird auf den **Spaltennamen**, damit ein anderer Spaltenfehler
 * nicht stillschweigend die Reihenfunktion abschaltet.
 */
function fehltSpalte(e: unknown): boolean {
  const o = (e ?? {}) as { code?: string; message?: string };
  const msg = (o.message ?? '').toLowerCase();
  const code = o.code ?? '';
  return (
    (code === '42703' || code === 'PGRST204' || msg.includes('spalte') || msg.includes('column')) &&
    (msg.includes('bild_pfade') || msg.includes('vorlage'))
  );
}

function deute(e: unknown, fuerGaeste = false): string {
  const o = (e ?? {}) as { code?: string; message?: string };
  const msg = (o.message ?? '').toLowerCase();
  if (o.code === '42P01' || msg.includes('schema cache')) {
    return 'Die Tabellen fehlen — die Migration ist noch nicht eingespielt.';
  }
  if (msg.includes('bucket not found')) {
    return 'Die Bilderablage fehlt — Migration 0003 ist noch nicht gelaufen.';
  }
  if (o.code === '42501' || msg.includes('row-level security') || msg.includes('violates')) {
    // Für einen Gast wäre „dieses Konto" eine falsche Fährte — er hat keins.
    // Genau diese Meldung kommt an, wenn die Freigabe aus 0008 fehlt.
    return fuerGaeste
      ? 'Das Tagebuch ist gerade nicht lesbar — die Freigabe in der Datenbank fehlt noch.'
      : 'Dieses Konto ist nicht als Reisender eingetragen.';
  }
  if (msg.includes('fetch') || msg.includes('network')) {
    return fuerGaeste
      ? 'Keine Verbindung. Das Tagebuch braucht Netz.'
      : 'Keine Verbindung. Das Freundebuch braucht Netz.';
  }
  return o.message ?? 'Unbekannter Fehler.';
}

// ------------------------------------------------------------------ Laden ---

/**
 * Lädt Personen, Steckbriefe und Beiträge.
 *
 * `oeffentlich: true` ist der Weg der Gästeansicht unter /Japan/tagebuch/: kein
 * Anmeldezwang, und die Bilder kommen über öffentliche statt signierte Links.
 * Ohne die Option verhält sich alles wie zuvor — die bestehenden Aufrufe bleiben
 * unverändert.
 */
export async function ladeFreundebuch(opt: { oeffentlich?: boolean } = {}) {
  const gast = opt.oeffentlich === true;
  const sb = getSupabase();
  if (!sb) {
    buch.status = 'aus';
    return;
  }
  if (!auth.userId && !gast) {
    buch.status = 'abgemeldet';
    return;
  }

  buch.status = 'lädt';
  buch.fehler = null;
  try {
    /*
     * Die Beiträge mit Fähigkeitsprobe: voller Select, und nur bei „Spalte gibt
     * es nicht" einmal zurück auf den alten. Der zweite Versuch läuft **im
     * selben Lauf**, damit die Seite nichts davon merkt.
     */
    const beitraegeHolen = (spalten: string) =>
      sb
        .from('guestbook_post')
        .select(spalten)
        .order('datum', { ascending: false })
        .order('created_at', { ascending: false });

    const [personen, briefe, ersterVersuch] = await Promise.all([
      sb.from('profiles').select('id, name, farbe').order('angelegt_am'),
      sb.from('guestbook_profile').select('user_id, feld, wert'),
      beitraegeHolen(reihenFaehig === false ? SPALTEN_ALT : SPALTEN_NEU),
    ]);
    for (const r of [personen, briefe]) if (r.error) throw r.error;

    let posts = ersterVersuch;
    if (posts.error && reihenFaehig !== false && fehltSpalte(posts.error)) {
      // Migration 0009 fehlt. Kein Fehler für die Nutzer — nur ein Bild je
      // Beitrag, und `mehrbildFaehig()` sagt der Maske, dass Collagen aus sind.
      reihenFaehig = false;
      posts = await beitraegeHolen(SPALTEN_ALT);
    } else if (!posts.error) {
      reihenFaehig = reihenFaehig ?? true;
    }
    if (posts.error) throw posts.error;

    buch.personen = (personen.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      farbe: p.farbe ?? '#C6402B',
    }));

    const briefeMap: Record<string, Steckbrief> = {};
    for (const z of briefe.data ?? []) {
      (briefeMap[z.user_id] ??= {})[z.feld] = z.wert ?? '';
    }
    buch.steckbriefe = briefeMap;

    /*
     * `as unknown as` ist hier nicht Faulheit: Der Select ist zur Laufzeit eine
     * von zwei Zeichenketten, und Supabase leitet seinen Rückgabetyp aus dem
     * Literal ab. Bei einem veränderlichen Select gibt es keinen Typ, den es
     * ableiten könnte — die Form der Zeilen prüft `pfadeVon()` und die
     * Zuweisungen darunter.
     */
    const roh = (posts.data ?? []) as unknown as ZeileRoh[];
    /*
     * **Alle** Pfade aller Beiträge auf einmal. `createSignedUrls()` nimmt schon
     * heute eine Liste, die Map bleibt wie sie war — an dieser Stelle ändert die
     * Mehrbildfähigkeit also nichts außer der Länge der Liste.
     */
    const profilPfade = Object.entries(briefeMap)
      .map(([id, brief]) => [id, brief[PROFILBILD_FELD]] as const)
      .filter((e): e is readonly [string, string] => Boolean(e[1]));
    const pfade = [...roh.flatMap((z) => pfadeVon(z)), ...profilPfade.map(([, p]) => p)];
    const links = new Map<string, string>();

    /*
     * Zwei Wege zum Bild, und die Verzweigung hängt am **Parameter**, nicht am
     * Anmeldezustand:
     *
     *   Gast        → öffentlicher Link. Der Bucket ist seit 0008 öffentlich,
     *                 die Pfade sind `<uuid>/<uuid>.jpg` und damit nicht ratbar.
     *                 Stabil und cachebar — was auf einer Seite zählt, die
     *                 Freunde mehrfach öffnen.
     *   Angemeldet  → signierter Link, eine Stunde gültig. Unverändert, damit
     *                 der bewährte Weg der drei Reisenden Byte für Byte derselbe
     *                 bleibt; fällt der öffentliche Bucket aus, merken es nur
     *                 Gäste.
     *
     * Am Parameter und nicht an `auth.userId`, weil das deterministisch ist:
     * Öffnet ein Reisender die Gästeseite im angemeldeten Browser, soll sie sich
     * trotzdem wie für einen Gast verhalten.
     */
    if (gast) {
      for (const pfad of pfade) {
        links.set(pfad, sb.storage.from(BUCKET).getPublicUrl(pfad).data.publicUrl);
      }
    } else if (pfade.length) {
      const { data } = await sb.storage.from(BUCKET).createSignedUrls(pfade, 3600);
      for (const eintrag of data ?? []) {
        if (eintrag.signedUrl && eintrag.path) links.set(eintrag.path, eintrag.signedUrl);
      }
    }

    buch.profilbilder = Object.fromEntries(
      profilPfade.flatMap(([id, pfad]) => (links.has(pfad) ? [[id, links.get(pfad)!]] : [])),
    );

    buch.beitraege = roh.map((z) => {
      const eigenePfade = pfadeVon(z);
      // Nur Pfade, zu denen es wirklich einen Link gibt. Ein fehlender Link
      // würde sonst als leeres `src` im Markup landen, und das lädt in manchen
      // Browsern die Seite selbst noch einmal.
      const urls = eigenePfade.map((pf) => links.get(pf)).filter((u): u is string => Boolean(u));
      return {
        id: z.id,
        text: z.text ?? '',
        datum: z.datum,
        ortNr: z.ort_nr ?? null,
        ortName: z.ort_name ?? null,
        ortLat: z.ort_lat ?? null,
        ortLng: z.ort_lng ?? null,
        sticker: z.sticker ?? null,
        bildPfad: eigenePfade[0] ?? null,
        bildUrl: urls[0] ?? null,
        bildPfade: eigenePfade,
        bildUrls: urls,
        vorlage: z.vorlage ?? null,
        autorId: z.created_by,
        erstellt: z.created_at,
      };
    });

    buch.status = 'bereit';
  } catch (e) {
    buch.fehler = deute(e, gast);
    buch.status = 'fehler';
  }
}

// ------------------------------------------------------------- Steckbrief ---

/** Ein Feld des eigenen Steckbriefs setzen. Fremde sperrt die Datenbank. */
export async function steckbriefSetzen(feld: string, wert: string) {
  const sb = getSupabase();
  if (!sb || !auth.userId) return false;
  const id = auth.userId;

  // Sofort anzeigen, dann schreiben — sonst zuckt das Feld beim Tippen.
  (buch.steckbriefe[id] ??= {})[feld] = wert;

  const { error } = await sb
    .from('guestbook_profile')
    .upsert({ user_id: id, feld, wert }, { onConflict: 'user_id,feld' });
  if (error) {
    buch.fehler = deute(error);
    return false;
  }
  buch.fehler = null;
  return true;
}

/**
 * Das eigene Profilbild setzen oder ersetzen.
 *
 * Reihenfolge mit Absicht: erst hochladen, dann den Steckbrief umschreiben, erst
 * danach das alte Bild löschen. Scheitert der Steckbrief, wird das **neue** Bild
 * wieder entfernt — sonst läge es für immer in der Ablage, ohne dass eine Zeile
 * darauf zeigt. Scheitert das Löschen des alten, bleibt eine Waise; das ist
 * billiger als ein Steckbrief ohne Bild.
 */
export async function profilbildSetzen(datei: File): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !auth.userId) return false;
  const id = auth.userId;
  const alt = buch.steckbriefe[id]?.[PROFILBILD_FELD] || null;
  buch.fehler = null;

  let neu: string | null = null;
  try {
    const klein = await verkleinern(datei);
    neu = `${id}/profil-${crypto.randomUUID()}.jpg`;
    const hoch = await sb.storage.from(BUCKET).upload(neu, klein.blob, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (hoch.error) throw hoch.error;

    const { error } = await sb
      .from('guestbook_profile')
      .upsert({ user_id: id, feld: PROFILBILD_FELD, wert: neu }, { onConflict: 'user_id,feld' });
    if (error) throw error;
  } catch (e) {
    if (neu) {
      try {
        await sb.storage.from(BUCKET).remove([neu]);
      } catch {
        /* Der Fehler unten ist der wichtigere. */
      }
    }
    buch.fehler = deute(e);
    return false;
  }

  (buch.steckbriefe[id] ??= {})[PROFILBILD_FELD] = neu;
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(neu, 3600);
  if (data?.signedUrl) buch.profilbilder = { ...buch.profilbilder, [id]: data.signedUrl };
  if (alt && alt !== neu) {
    try {
      await sb.storage.from(BUCKET).remove([alt]);
    } catch {
      /* Waise — siehe oben. */
    }
  }
  return true;
}

// ------------------------------------------------------------ Bilderstrom ---

export type NeuerBeitrag = {
  /**
   * Die gewählten Bilder, in Anzeigereihenfolge — höchstens `BILDER_MAX`.
   *
   * War bis zum 22.09.2026 eine einzelne `datei`. Eine Liste, weil Filmstreifen
   * und Collage mehrere zeigen; die Reihenfolge ist die Auswahlreihenfolge.
   */
  dateien: File[];
  /** Das Layout. `vorlage: 'polaroid'` ist die Vorgabe der Maske. */
  vorlage: VorlageName;
  text: string;
  datum: string;
  ortNr: number | null;
  /**
   * Name und Koordinate des gewählten Orts.
   *
   * Werden mitgeschrieben, damit die öffentliche Tagebuchansicht ohne Zugriff
   * auf `places_custom` auskommt — dort stehen die Unterkünfte, und die bleiben
   * privat. Die Maske hat den Ort ohnehin schon aufgelöst.
   */
  ortName?: string | null;
  ortLat?: number | null;
  ortLng?: number | null;
  sticker: string | null;
};

export async function beitragAnlegen(neu: NeuerBeitrag) {
  const sb = getSupabase();
  if (!sb || !auth.userId) return false;

  buch.fehler = null;
  /*
   * Die schon hochgeladenen Pfade, für die Rücknahme.
   *
   * **Außerhalb** von `try` deklariert, damit der `catch`-Zweig sie sieht. Bis
   * zum 22.09.2026 wurde nur die *eine* Datei entfernt, und nur wenn der Insert
   * scheiterte. Bei vier Bildern reicht das nicht: Bricht der dritte Upload ab,
   * lief gar kein Insert — die zwei ersten Dateien lägen für immer im Bucket und
   * zählten gegen die 5 GB, ohne dass eine Zeile auf sie zeigt. Niemand würde sie
   * je finden.
   */
  const hochgeladen: string[] = [];
  /*
   * Ohne Migration 0009 nimmt die Tabelle nur ein Bild. Hier abgeschnitten und
   * nicht in der Maske: Die Maske sagt es vorher (`mehrbildFaehig()`), aber wenn
   * die Probe erst bei diesem Laden fehlschlägt, darf der Beitrag nicht mitten im
   * Absenden an einem 400 scheitern — nachdem die Bilder schon oben sind.
   */
  const dateien = (neu.dateien ?? []).slice(0, mehrbildFaehig() ? BILDER_MAX : 1);

  try {
    for (const [i, datei] of dateien.entries()) {
      // Der Fortschritt je Datei statt in vier festen Stufen. Behauptet bleibt er
      // — gemessen wird der Upload von Supabase aus nicht —, aber er behauptet
      // etwas, das bei vier Bildern nicht bei 35 % stehen bleibt.
      buch.upload = Math.round((i / dateien.length) * 90);
      const klein = await verkleinern(datei);
      // Die Ersparnis des **letzten** Bildes, wie bisher die des einzigen.
      buch.letzteGroesse = { vorher: klein.vorher, nachher: klein.blob.size };

      // Pfad mit Benutzerkennung voran: So bleibt nachvollziehbar, wem die
      // Datei gehört, auch wenn die Zeile dazu einmal fehlen sollte.
      const pfad = `${auth.userId}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from(BUCKET).upload(pfad, klein.blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (error) throw error;
      hochgeladen.push(pfad);
      buch.upload = Math.round(((i + 1) / dateien.length) * 90);
    }

    const zeile: Record<string, unknown> = {
      text: neu.text,
      datum: neu.datum,
      ort_nr: neu.ortNr,
      ort_name: neu.ortName ?? null,
      ort_lat: neu.ortLat ?? null,
      ort_lng: neu.ortLng ?? null,
      sticker: neu.sticker,
      // Weiter das **erste** Bild, auch mit Migration: Ein Telefon mit altem,
      // zwischengespeichertem JavaScript liest nur diese Spalte.
      bild_pfad: hochgeladen[0] ?? null,
      created_by: auth.userId,
    };
    // Die neuen Spalten nur, wenn es sie gibt — sonst antwortet PostgREST mit
    // 400, und zwar erst hier, nach dem Upload.
    if (mehrbildFaehig()) {
      zeile.bild_pfade = hochgeladen;
      zeile.vorlage = neu.vorlage ?? VORGABE;
    }

    const { error } = await sb.from('guestbook_post').insert(zeile);
    if (error) throw error;

    buch.upload = 100;
    await ladeFreundebuch();
    return true;
  } catch (e) {
    // Alles, was schon oben liegt, wieder weg — egal, woran es gescheitert ist.
    if (hochgeladen.length) {
      try {
        await sb.storage.from(BUCKET).remove(hochgeladen);
      } catch {
        /* Dann bleiben Waisen. Der Fehler unten ist der wichtigere. */
      }
    }
    buch.fehler = deute(e);
    return false;
  } finally {
    buch.upload = null;
  }
}

/**
 * Beitrag löschen — erst die Datei, dann die Zeile.
 *
 * Das lief vorher über einen Trigger in der Datenbank, und zwar gar nicht:
 * Supabase verbietet direktes DELETE auf `storage.objects`
 * („Direct deletion from storage tables is not allowed"), weil eine gelöschte
 * Metadatenzeile die Datei im Objektspeicher nur verwaisen ließe. Der Trigger
 * brach ab und riss das Löschen des Beitrags mit. 0006 hat ihn entfernt.
 *
 * Die Reihenfolge ist Absicht. **Datei zuerst:** Bricht sie ab, bleibt der
 * Beitrag stehen, der Fehler ist sichtbar und der Versuch wiederholbar.
 * Umgekehrt wäre die Zeile weg, der Pfad damit verloren, und die Datei würde
 * unbemerkt für immer gegen das Freikontingent zählen.
 */
export async function beitragLoeschen(id: string) {
  const sb = getSupabase();
  if (!sb) return false;
  buch.fehler = null;

  // Alle Bilder des Beitrags, nicht nur das erste — sonst bleiben bei einer
  // Collage drei Dateien liegen, auf die nichts mehr zeigt.
  const pfade = buch.beitraege.find((b) => b.id === id)?.bildPfade ?? [];

  if (pfade.length) {
    const { error } = await sb.storage.from(BUCKET).remove(pfade);
    if (error) {
      buch.fehler = deute(error);
      return false;
    }
  }

  const { error } = await sb.from('guestbook_post').delete().eq('id', id);
  if (error) {
    // Die Datei ist weg, die Zeile nicht. Das ist der einzige unschöne
    // Zwischenstand, und er ist sichtbar statt still: Der Beitrag zeigt dann
    // „Bild lässt sich gerade nicht laden", und ein zweiter Versuch räumt ihn ab.
    buch.fehler = deute(error);
    return false;
  }

  buch.beitraege = buch.beitraege.filter((b) => b.id !== id);
  return true;
}

/**
 * Die Bilder eines Beitrags, wie `Bildfeld` sie braucht.
 *
 * Steht hier und nicht zweimal in den Komponenten: Der Alternativtext ist die
 * einzige Stelle, an der etwas zu entscheiden war, und eine Entscheidung gehört
 * nicht zweimal aufgeschrieben.
 *
 * Bei einem Bild ist der Beitragstext der Alternativtext — das ist die beste
 * Beschreibung, die es gibt. Bei mehreren kommt die Position dazu: „Abend in
 * Dotonbori — Bild 2 von 4" sagt einem Screenreader, dass hier eine Reihe steht
 * und wo man darin ist. Ohne die Position hörte man denselben Satz viermal.
 */
export function bilderVon(b: Beitrag): { url: string; alt: string }[] {
  const grund = b.text || 'Foto';
  const n = b.bildUrls.length;
  return b.bildUrls.map((url, i) => ({
    url,
    alt: n > 1 ? `${grund} — Bild ${i + 1} von ${n}` : grund,
  }));
}

/** Name und Farbe zu einer Kennung — für die Zuordnung der Beiträge. */
export function person(id: string): Person {
  return buch.personen.find((p) => p.id === id) ?? { id, name: '?', farbe: '#8A8070' };
}
