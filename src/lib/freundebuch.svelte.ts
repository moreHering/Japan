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
  bildPfad: string | null;
  /** Für Gäste ein öffentlicher, sonst ein zeitlich begrenzter Link. */
  bildUrl: string | null;
  autorId: string;
  erstellt: string;
};

export type Person = { id: string; name: string; farbe: string };

export type BuchStatus = 'aus' | 'abgemeldet' | 'lädt' | 'bereit' | 'fehler';

export const buch = $state({
  status: (supabaseConfigured ? 'abgemeldet' : 'aus') as BuchStatus,
  fehler: null as string | null,
  personen: [] as Person[],
  steckbriefe: {} as Record<string, Steckbrief>,
  beitraege: [] as Beitrag[],
  /** Fortschritt eines laufenden Uploads, 0–100, oder null. */
  upload: null as number | null,
  /** Was das Verkleinern gebracht hat — wird nach dem Hochladen angezeigt. */
  letzteGroesse: null as { vorher: number; nachher: number } | null,
});

const BUCKET = 'freundebuch';

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
    const [personen, briefe, posts] = await Promise.all([
      sb.from('profiles').select('id, name, farbe').order('angelegt_am'),
      sb.from('guestbook_profile').select('user_id, feld, wert'),
      sb
        .from('guestbook_post')
        .select(
          'id, text, datum, ort_nr, ort_name, ort_lat, ort_lng, sticker, bild_pfad, created_by, created_at',
        )
        .order('datum', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);
    for (const r of [personen, briefe, posts]) if (r.error) throw r.error;

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

    const roh = posts.data ?? [];
    const pfade = roh.map((z) => z.bild_pfad).filter((p): p is string => Boolean(p));
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

    buch.beitraege = roh.map((z) => ({
      id: z.id,
      text: z.text ?? '',
      datum: z.datum,
      ortNr: z.ort_nr ?? null,
      ortName: z.ort_name ?? null,
      ortLat: z.ort_lat ?? null,
      ortLng: z.ort_lng ?? null,
      sticker: z.sticker ?? null,
      bildPfad: z.bild_pfad ?? null,
      bildUrl: z.bild_pfad ? (links.get(z.bild_pfad) ?? null) : null,
      autorId: z.created_by,
      erstellt: z.created_at,
    }));

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

// ------------------------------------------------------------ Bilderstrom ---

export type NeuerBeitrag = {
  datei: File | null;
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
  try {
    let pfad: string | null = null;

    if (neu.datei) {
      buch.upload = 5;
      const klein = await verkleinern(neu.datei);
      buch.upload = 35;
      buch.letzteGroesse = { vorher: klein.vorher, nachher: klein.blob.size };

      // Pfad mit Benutzerkennung voran: So bleibt nachvollziehbar, wem die
      // Datei gehört, auch wenn die Zeile dazu einmal fehlen sollte.
      pfad = `${auth.userId}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from(BUCKET).upload(pfad, klein.blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (error) throw error;
      buch.upload = 80;
    }

    const { error } = await sb.from('guestbook_post').insert({
      text: neu.text,
      datum: neu.datum,
      ort_nr: neu.ortNr,
      ort_name: neu.ortName ?? null,
      ort_lat: neu.ortLat ?? null,
      ort_lng: neu.ortLng ?? null,
      sticker: neu.sticker,
      bild_pfad: pfad,
      created_by: auth.userId,
    });
    if (error) {
      // Die Zeile kam nicht durch — dann darf das Bild nicht als Waise
      // liegenbleiben.
      if (pfad) await sb.storage.from(BUCKET).remove([pfad]);
      throw error;
    }

    buch.upload = 100;
    await ladeFreundebuch();
    return true;
  } catch (e) {
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

  const pfad = buch.beitraege.find((b) => b.id === id)?.bildPfad ?? null;

  if (pfad) {
    const { error } = await sb.storage.from(BUCKET).remove([pfad]);
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

/** Name und Farbe zu einer Kennung — für die Zuordnung der Beiträge. */
export function person(id: string): Person {
  return buch.personen.find((p) => p.id === id) ?? { id, name: '?', farbe: '#8A8070' };
}
