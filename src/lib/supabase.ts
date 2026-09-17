/**
 * Verbindung zu Supabase.
 *
 * Zwei Dinge sind hier bewusst entschieden:
 *
 * 1. **Die Seite funktioniert auch ohne Supabase.** Sind die Zugangsdaten nicht
 *    gesetzt, gibt `getSupabase()` null zurück und alles arbeitet wie bisher
 *    allein mit dem localStorage weiter. Ein fehlendes Secret darf die
 *    Reiseplanung nicht lahmlegen — schon gar nicht unterwegs.
 *
 * 2. **„Angemeldet bleiben" entscheidet über den Ablageort der Sitzung.** Mit
 *    Haken landet sie im localStorage und überdauert das Schließen des
 *    Browsers; ohne im sessionStorage, wo sie mit dem Tab endet. Weil die Wahl
 *    erst beim Anmelden fällt, der Client aber vorher existiert, entscheidet
 *    das Speicherobjekt bei jedem Zugriff neu, statt fest verdrahtet zu sein.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

/** Merker für die Wahl „angemeldet bleiben". */
const PERSIST_KEY = 'japan2026:bleibe-angemeldet';

export const supabaseConfigured = Boolean(URL && KEY);

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    // Privates Fenster oder blockierte Site-Daten.
    return null;
  }
}

/** Soll die Sitzung das Schließen des Browsers überdauern? Standard: ja. */
export function bleibtAngemeldet(): boolean {
  try {
    return safeStorage('local')?.getItem(PERSIST_KEY) !== 'nein';
  } catch {
    return true;
  }
}

export function setBleibtAngemeldet(wert: boolean) {
  const ls = safeStorage('local');
  const ss = safeStorage('session');
  try {
    ls?.setItem(PERSIST_KEY, wert ? 'ja' : 'nein');
    // Beim Wechsel die Sitzung aus dem nicht mehr zuständigen Speicher räumen,
    // sonst meldet ein alter Eintrag den Nutzer später unerwartet wieder an.
    const quelle = wert ? ss : ls;
    const ziel = wert ? ls : ss;
    if (quelle && ziel) {
      for (let i = quelle.length - 1; i >= 0; i--) {
        const k = quelle.key(i);
        if (!k?.startsWith('sb-')) continue;
        const v = quelle.getItem(k);
        if (v !== null) ziel.setItem(k, v);
        quelle.removeItem(k);
      }
    }
  } catch {
    // Ohne Speicher bleibt es bei der Sitzung im Arbeitsspeicher.
  }
}

/**
 * Speicher, der bei jedem Zugriff neu entscheidet. Schreiben geht immer in den
 * gewählten Speicher, Lesen sucht in beiden — so geht eine Sitzung nicht
 * verloren, wenn die Wahl zwischenzeitlich umgestellt wurde.
 */
const wechselnderSpeicher = {
  getItem: (key: string): string | null => {
    const bevorzugt = bleibtAngemeldet() ? 'local' : 'session';
    return (
      safeStorage(bevorzugt)?.getItem(key) ??
      safeStorage(bevorzugt === 'local' ? 'session' : 'local')?.getItem(key) ??
      null
    );
  },
  setItem: (key: string, value: string) => {
    safeStorage(bleibtAngemeldet() ? 'local' : 'session')?.setItem(key, value);
  },
  removeItem: (key: string) => {
    safeStorage('local')?.removeItem(key);
    safeStorage('session')?.removeItem(key);
  },
};

let client: SupabaseClient | null = null;

/** Der gemeinsame Client, oder null wenn keine Zugangsdaten hinterlegt sind. */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (typeof window === 'undefined') return null;
  if (client) return client;

  client = createClient(URL!, KEY!, {
    auth: {
      storage: wechselnderSpeicher,
      persistSession: true,
      autoRefreshToken: true,
      // Die Seite verarbeitet keine Anmeldelinks aus der Adresszeile.
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Die drei Konten. Die Kennung setzt sich aus dem Namen zusammen. */
export const KONTEN = [
  { name: 'Paule', email: 'paule@japan2026.local', farbe: '#C6402B' },
  { name: 'Deggel', email: 'deggel@japan2026.local', farbe: '#3E6B5E' },
  { name: 'Baldes', email: 'baldes@japan2026.local', farbe: '#A67C33' },
] as const;

export type KontoName = (typeof KONTEN)[number]['name'];
