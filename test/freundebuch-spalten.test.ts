/**
 * **Der ausgelieferte Code muss eine nicht migrierte Datenbank überleben.**
 *
 * Das ist die wichtigste Prüfung an den Bildreihen, und sie prüft einen Zustand,
 * den es unterwegs wirklich gibt:
 *
 * Migration 0009 ergänzt `guestbook_post` um `bild_pfade` und `vorlage`. Der
 * Code dazu wird per Push ausgeliefert, das SQL spielt ein Mensch von Hand im
 * Supabase-Dashboard ein — **zwischen beidem liegt eine Lücke**, und sie dauert
 * nicht Minuten, sondern so lange, bis jemand am Rechner sitzt. Wenn jemand in
 * dieser Zeit in Japan das Freundebuch öffnet, muss es funktionieren.
 *
 * `ladeFreundebuch()` selektiert die Spalten namentlich. Ohne Fähigkeitsprobe
 * antwortet PostgREST mit 400, und die Seite zeigt keinen Bilderstrom, keine
 * Steckbriefe, nichts — nur eine Fehlermeldung.
 *
 * Geprüft wird gegen `mini-postgrest.ts`, der unbekannte Spalten abweist wie das
 * Original. Das ist **nicht** Supabase, und es beweist nicht, dass Supabase sich
 * genauso verhält; es beweist, dass der Code beide Schemaformen verkraftet.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { Ablage } from './mini-postgrest';
import { auth } from '../src/lib/auth.svelte';
import {
  beitragAnlegen,
  buch,
  ladeFreundebuch,
  mehrbildFaehig,
  spaltenprobeZuruecksetzenFuerTest,
} from '../src/lib/freundebuch.svelte';

const ablage = new Ablage();
globalThis.fetch = ablage.fetch as typeof fetch;

const WER = '22222222-2222-2222-2222-222222222222';

/** Eine Zeile, wie sie vor 0009 in der Tabelle steht. */
function alterBeitrag(id: string, pfad: string | null) {
  return {
    id,
    text: 'Abend in Dotonbori',
    datum: '2026-09-27',
    ort_nr: 1,
    ort_name: 'Dotonbori',
    ort_lat: 34.6687,
    ort_lng: 135.5013,
    sticker: 'sushi',
    bild_pfad: pfad,
    created_by: WER,
    created_at: '2026-09-27T12:00:00.000Z',
  };
}

beforeEach(() => {
  // Die Probe merkt sich ihr Ergebnis für die Sitzung — im Betrieb richtig, hier
  // fatal: Ohne Rücksetzer liefe „ohne Migration" gegen das Ergebnis von „mit
  // Migration" und wäre grün, ohne etwas geprüft zu haben.
  spaltenprobeZuruecksetzenFuerTest();
  ablage.leeren();
  ablage.tabellen.profiles.push({
    id: WER,
    name: 'Reisender 1',
    farbe: '#C6402B',
    angelegt_am: '2026-01-01T00:00:00.000Z',
  });
  auth.userId = WER;
  buch.fehler = null;
});

describe('Mit Migration 0009', () => {
  beforeEach(() => {
    ablage.migration0009();
  });

  it('liest mehrere Bilder aus bild_pfade', async () => {
    ablage.tabellen.guestbook_post.push({
      ...alterBeitrag('a', 'x/1.jpg'),
      bild_pfade: ['x/1.jpg', 'x/2.jpg', 'x/3.jpg'],
      vorlage: 'collage',
    });

    await ladeFreundebuch();

    expect(buch.fehler).toBeNull();
    expect(buch.beitraege).toHaveLength(1);
    const b = buch.beitraege[0];
    expect(b.bildPfade).toEqual(['x/1.jpg', 'x/2.jpg', 'x/3.jpg']);
    expect(b.vorlage).toBe('collage');
    // Je Pfad ein Link — das ist die Zusicherung darauf, dass die Auflösung mit
    // einer Liste umgeht und nicht nur mit dem ersten Eintrag.
    expect(b.bildUrls).toHaveLength(3);
    // `bildPfad`/`bildUrl` tragen weiter das erste Bild: `Wache.svelte` und
    // zwischengespeicherte App-Fassungen lesen sie.
    expect(b.bildPfad).toBe('x/1.jpg');
    expect(b.bildUrl).toBe(b.bildUrls[0]);
    expect(mehrbildFaehig()).toBe(true);
  });

  it('schreibt beim Anlegen das Array **und** das erste Bild in bild_pfad', async () => {
    const ok = await beitragAnlegen({
      dateien: [],
      vorlage: 'streifen',
      text: 'Nur Text, aber mit Vorlage',
      datum: '2026-09-28',
      ortNr: null,
      sticker: null,
    });

    expect(ok, buch.fehler ?? '').toBe(true);
    const zeile = ablage.tabellen.guestbook_post[0];
    expect(zeile.bild_pfade).toEqual([]);
    expect(zeile.vorlage).toBe('streifen');
    expect(zeile.bild_pfad).toBeNull();
  });
});

describe('Ohne Migration 0009 — die Lücke zwischen Deploy und Dashboard', () => {
  beforeEach(() => {
    ablage.ohneMigration0009();
  });

  /*
   * **Die Prüfung, um die es geht.**
   *
   * Gegenprobe: In `ladeFreundebuch()` den Rückfall entfernen (also immer
   * `SPALTEN_NEU` selektieren). Dann wirft die Abfrage, `buch.status` wird
   * `'fehler'`, `buch.beitraege` bleibt leer — und diese Prüfung fällt
   * namentlich. Ohne sie liefere ich eine App aus, die bis zum Einspielen der
   * Migration kein Freundebuch hat.
   */
  it('liest die Beiträge trotzdem — mit einem Bild und ohne Fehler', async () => {
    ablage.tabellen.guestbook_post.push(alterBeitrag('a', 'x/1.jpg'));

    await ladeFreundebuch();

    expect(buch.status, buch.fehler ?? '').toBe('bereit');
    expect(buch.fehler).toBeNull();
    expect(buch.beitraege).toHaveLength(1);
    const b = buch.beitraege[0];
    expect(b.bildPfade, 'der Rückfall auf bild_pfad greift').toEqual(['x/1.jpg']);
    expect(b.bildUrls).toHaveLength(1);
    // Kein Wert, wo keiner ist — und `vorlageVon(null)` macht daraus ein Polaroid.
    expect(b.vorlage).toBeNull();
  });

  it('merkt sich, dass Collagen aus sind', async () => {
    ablage.tabellen.guestbook_post.push(alterBeitrag('a', null));
    await ladeFreundebuch();
    // Darauf schaltet die Maske Filmstreifen und Collage ab, statt eine Wahl
    // anzubieten, die beim Absenden scheitert.
    expect(mehrbildFaehig()).toBe(false);
  });

  it('legt einen Beitrag an, ohne die neuen Spalten mitzuschicken', async () => {
    ablage.tabellen.guestbook_post.push(alterBeitrag('a', null));
    await ladeFreundebuch(); // damit die Probe gelaufen ist

    const ok = await beitragAnlegen({
      dateien: [],
      vorlage: 'collage',
      text: 'Geht auch ohne Migration',
      datum: '2026-09-28',
      ortNr: null,
      sticker: null,
    });

    expect(ok, buch.fehler ?? '').toBe(true);
    const neu = ablage.tabellen.guestbook_post.find((z) => z.text === 'Geht auch ohne Migration')!;
    // **Nicht** mitgeschickt: Die Attrappe weist unbekannte Spalten ab, und das
    // echte PostgREST tut es auch — mitten im Absenden, nach dem Upload.
    expect(Object.keys(neu)).not.toContain('bild_pfade');
    expect(Object.keys(neu)).not.toContain('vorlage');
  });

  it('fragt nach dem ersten Fehlschlag nicht jedes Mal erneut', async () => {
    ablage.tabellen.guestbook_post.push(alterBeitrag('a', null));
    await ladeFreundebuch();
    const ersteRunde = ablage.verlauf.filter((z) => z === 'GET guestbook_post').length;
    ablage.verlauf.length = 0;

    await ladeFreundebuch();
    const zweiteRunde = ablage.verlauf.filter((z) => z === 'GET guestbook_post').length;

    // Beim ersten Laden zwei Abfragen (Versuch und Rückfall), danach eine. Ein
    // dauerhafter Doppelabruf wäre auf einer Mobilverbindung eine Rundreise je
    // Aufruf — und diese Seite lädt bei jedem Öffnen neu.
    expect(ersteRunde).toBe(2);
    expect(zweiteRunde).toBe(1);
  });
});
