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
  sticker: string | null;
  bildPfad: string | null;
  /** Zeitlich begrenzter Link, beim Laden erzeugt. */
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

function deute(e: unknown): string {
  const o = (e ?? {}) as { code?: string; message?: string };
  const msg = (o.message ?? '').toLowerCase();
  if (o.code === '42P01' || msg.includes('schema cache')) {
    return 'Die Tabellen fehlen — die Migration ist noch nicht eingespielt.';
  }
  if (msg.includes('bucket not found')) {
    return 'Die Bilderablage fehlt — Migration 0003 ist noch nicht gelaufen.';
  }
  if (o.code === '42501' || msg.includes('row-level security') || msg.includes('violates')) {
    return 'Dieses Konto ist nicht als Reisender eingetragen.';
  }
  if (msg.includes('fetch') || msg.includes('network')) {
    return 'Keine Verbindung. Das Freundebuch braucht Netz.';
  }
  return o.message ?? 'Unbekannter Fehler.';
}

// ------------------------------------------------------------------ Laden ---

export async function ladeFreundebuch() {
  const sb = getSupabase();
  if (!sb) {
    buch.status = 'aus';
    return;
  }
  if (!auth.userId) {
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
        .select('id, text, datum, ort_nr, sticker, bild_pfad, created_by, created_at')
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
    if (pfade.length) {
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
      sticker: z.sticker ?? null,
      bildPfad: z.bild_pfad ?? null,
      bildUrl: z.bild_pfad ? (links.get(z.bild_pfad) ?? null) : null,
      autorId: z.created_by,
      erstellt: z.created_at,
    }));

    buch.status = 'bereit';
  } catch (e) {
    buch.fehler = deute(e);
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

export async function beitragLoeschen(id: string) {
  const sb = getSupabase();
  if (!sb) return false;
  // Das Bild räumt ein Trigger in der Datenbank ab — sonst bliebe es liegen,
  // wenn der Browser zwischen beiden Schritten geschlossen wird.
  const { error } = await sb.from('guestbook_post').delete().eq('id', id);
  if (error) {
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
