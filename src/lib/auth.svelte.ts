/**
 * Anmeldezustand der drei Reisenden.
 *
 * Angemeldet wird über einen Namen, nicht über eine E-Mail-Adresse: Auf dem
 * Handy ist die Auswahl aus drei Namen der Unterschied zwischen zwei und
 * zwanzig Sekunden. Die Kennung setzt die App daraus zusammen.
 */

import {
  getSupabase,
  supabaseConfigured,
  bleibtAngemeldet,
  setBleibtAngemeldet,
  KONTEN,
  type KontoName,
} from './supabase';

const LETZTER_NAME = 'japan2026:letzter-name';

export type AuthStatus = 'lädt' | 'abgemeldet' | 'angemeldet' | 'nicht-eingerichtet';

export const auth = $state({
  status: (supabaseConfigured ? 'lädt' : 'nicht-eingerichtet') as AuthStatus,
  /** Anzeigename des angemeldeten Kontos. */
  name: null as string | null,
  userId: null as string | null,
  fehler: null as string | null,
  /** Läuft gerade eine An- oder Abmeldung? */
  beschäftigt: false,
});

/** Zuletzt gewählter Name, damit die Maske sinnvoll vorbelegt ist. */
export function letzterName(): KontoName {
  try {
    const gespeichert = localStorage.getItem(LETZTER_NAME);
    const treffer = KONTEN.find((k) => k.name === gespeichert);
    if (treffer) return treffer.name;
  } catch {
    // ohne Speicher einfach der erste
  }
  return KONTEN[0].name;
}

export { bleibtAngemeldet, setBleibtAngemeldet, KONTEN };
export type { KontoName };

function nameAusSession(user: { email?: string | null; user_metadata?: Record<string, unknown> }) {
  const ausMetadaten = user.user_metadata?.name;
  if (typeof ausMetadaten === 'string' && ausMetadaten) return ausMetadaten;
  const treffer = KONTEN.find((k) => k.email === user.email);
  return treffer?.name ?? user.email ?? 'unbekannt';
}

let initGelaufen = false;

/**
 * Beim Laden der Seite den vorhandenen Anmeldezustand übernehmen.
 *
 * Mehrfach aufrufbar: Anmeldemaske und Abzeichen in der Kopfzeile rufen beide
 * auf, und ein zweiter `onAuthStateChange`-Beobachter würde jede Änderung
 * doppelt verarbeiten.
 */
export async function initAuth() {
  if (initGelaufen) return;
  initGelaufen = true;
  const sb = getSupabase();
  if (!sb) {
    auth.status = 'nicht-eingerichtet';
    return;
  }

  try {
    const { data } = await sb.auth.getSession();
    if (data.session?.user) {
      auth.status = 'angemeldet';
      auth.name = nameAusSession(data.session.user);
      auth.userId = data.session.user.id;
    } else {
      auth.status = 'abgemeldet';
    }
  } catch {
    // Kein Netz: Die Seite arbeitet weiter mit dem lokalen Stand.
    auth.status = 'abgemeldet';
  }

  sb.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      auth.status = 'angemeldet';
      auth.name = nameAusSession(session.user);
      auth.userId = session.user.id;
    } else {
      auth.status = 'abgemeldet';
      auth.name = null;
      auth.userId = null;
    }
  });
}

export async function anmelden(name: KontoName, passwort: string, merken: boolean) {
  const sb = getSupabase();
  if (!sb) {
    auth.fehler = 'Die Verbindung ist noch nicht eingerichtet.';
    return false;
  }

  const konto = KONTEN.find((k) => k.name === name);
  if (!konto) {
    auth.fehler = 'Unbekannter Name.';
    return false;
  }

  // Vor dem Anmelden festlegen, wohin die Sitzung geschrieben wird.
  setBleibtAngemeldet(merken);

  auth.beschäftigt = true;
  auth.fehler = null;
  try {
    const { error } = await sb.auth.signInWithPassword({
      email: konto.email,
      password: passwort,
    });
    if (error) {
      // Die Meldungen von Supabase sind englisch und technisch — hier das,
      // was tatsächlich weiterhilft.
      auth.fehler =
        error.message.toLowerCase().includes('invalid')
          ? 'Passwort stimmt nicht.'
          : `Anmeldung fehlgeschlagen: ${error.message}`;
      return false;
    }
    try {
      localStorage.setItem(LETZTER_NAME, name);
    } catch {
      // nicht schlimm
    }
    return true;
  } catch (e) {
    auth.fehler = 'Keine Verbindung. Offline arbeitet die Seite weiter mit dem lokalen Stand.';
    return false;
  } finally {
    auth.beschäftigt = false;
  }
}

export async function abmelden() {
  const sb = getSupabase();
  if (!sb) return;
  auth.beschäftigt = true;
  try {
    await sb.auth.signOut();
  } catch {
    // Auch ohne Netz lokal als abgemeldet behandeln.
    auth.status = 'abgemeldet';
    auth.name = null;
    auth.userId = null;
  } finally {
    auth.beschäftigt = false;
  }
}
