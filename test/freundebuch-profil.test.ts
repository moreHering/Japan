/**
 * Profilbild und Reihenfolge im Freundebuch.
 *
 * Gegen `mini-postgrest.ts`, nicht gegen Supabase — geprüft wird, dass der Code
 * das Richtige in der richtigen Reihenfolge verlangt, und dass nach einem
 * Fehler keine Datei ohne Zeile in der Ablage liegt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `verkleinern()` braucht ein Canvas, das es in Node nicht gibt. Hier geht es
// nicht ums Verkleinern, sondern um das, was danach mit der Datei passiert.
vi.mock('../src/lib/bild', () => ({
  verkleinern: async (f: File) => ({ blob: new Blob([await f.arrayBuffer()], { type: 'image/jpeg' }), vorher: f.size }),
}));

import { Ablage } from './mini-postgrest';
import { auth } from '../src/lib/auth.svelte';
import {
  buch,
  ladeFreundebuch,
  PROFILBILD_FELD,
  profilbildSetzen,
  spaltenprobeZuruecksetzenFuerTest,
} from '../src/lib/freundebuch.svelte';

const ablage = new Ablage();
globalThis.fetch = ablage.fetch as typeof fetch;

const ICH = '11111111-1111-1111-1111-111111111111';
const bild = () => new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' });
const meinPfad = () =>
  ablage.tabellen.guestbook_profile.find((z) => z.user_id === ICH && z.feld === PROFILBILD_FELD)?.wert;

beforeEach(() => {
  spaltenprobeZuruecksetzenFuerTest();
  ablage.leeren();
  ablage.migration0009();
  ablage.tabellen.profiles.push({ id: ICH, name: 'Reisender 1', farbe: '#C6402B', angelegt_am: '2026-01-01T00:00:00Z' });
  auth.userId = ICH;
  buch.fehler = null;
  buch.steckbriefe = {};
  buch.profilbilder = {};
});

describe('Profilbild', () => {
  it('lädt hoch, trägt den Pfad im Steckbrief ein und zeigt es', async () => {
    const ok = await profilbildSetzen(bild());
    expect(ok, buch.fehler ?? '').toBe(true);
    const pfad = meinPfad();
    expect(pfad).toMatch(new RegExp(`^${ICH}/profil-.+\\.jpg$`));
    expect(ablage.dateien.has(pfad as string)).toBe(true);
    expect(buch.profilbilder[ICH]).toContain(pfad as string);
  });

  it('löscht beim Ersetzen das alte Bild — erst nachdem das neue eingetragen ist', async () => {
    await profilbildSetzen(bild());
    const alt = meinPfad() as string;
    await profilbildSetzen(bild());
    const neu = meinPfad() as string;
    expect(neu).not.toBe(alt);
    expect(ablage.dateien.has(neu)).toBe(true);
    expect(ablage.dateien.has(alt)).toBe(false);
    expect(ablage.dateien.size).toBe(1);
  });

  it('lässt keine Datei zurück, wenn der Steckbrief nicht geschrieben werden kann', async () => {
    /*
     * Gegenprobe: in `profilbildSetzen()` die Rücknahme im `catch` entfernen →
     * `dateien.size` ist 1, diese Prüfung fällt.
     */
    ablage.schreibsperre.add('guestbook_profile');
    const ok = await profilbildSetzen(bild());
    expect(ok).toBe(false);
    expect(buch.fehler).toBeTruthy();
    expect(ablage.dateien.size).toBe(0);
    expect(buch.profilbilder[ICH]).toBeUndefined();
  });

  it('kommt beim Laden als Link je Person mit', async () => {
    ablage.tabellen.guestbook_profile.push({ user_id: ICH, feld: PROFILBILD_FELD, wert: `${ICH}/profil-a.jpg` });
    await ladeFreundebuch();
    expect(buch.status, buch.fehler ?? '').toBe('bereit');
    expect(buch.profilbilder[ICH]).toContain('profil-a.jpg');
  });
});

describe('Reihenfolge des Bilderstroms', () => {
  it('neuestes Fotodatum zuerst, bei gleichem Tag das zuletzt Eingestellte', async () => {
    /*
     * Gegenprobe: in `ladeFreundebuch()` `ascending: true` beim Datum setzen →
     * die Reihenfolge kippt, diese Prüfung fällt.
     */
    const zeile = (id: string, datum: string, zeit: string) => ({
      id, text: id, datum, ort_nr: null, ort_name: null, ort_lat: null, ort_lng: null,
      sticker: null, bild_pfad: null, bild_pfade: [], vorlage: null, created_by: ICH, created_at: zeit,
    });
    ablage.tabellen.guestbook_post.push(
      zeile('a', '2026-09-28', '2026-09-28T10:00:00Z'),
      zeile('b', '2026-09-30', '2026-09-30T08:00:00Z'),
      zeile('c', '2026-09-29', '2026-10-02T09:00:00Z'), // nachgetragen, älteres Fotodatum
      zeile('d', '2026-09-30', '2026-09-30T20:00:00Z'),
    );
    await ladeFreundebuch();
    expect(buch.beitraege.map((b) => b.id)).toEqual(['d', 'b', 'c', 'a']);
  });
});
