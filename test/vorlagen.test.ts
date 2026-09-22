/**
 * `src/lib/vorlagen.ts` — die fünf Layout-Vorlagen der Freundebuch-Beiträge.
 *
 * Reine Logik, also hier und nicht im Browser. Die Prüfungen sind bewusst an den
 * Rändern angesetzt: Die Mitte („eine Collage mit vier Bildern zeigt vier") ist
 * unstrittig, die Ränder entscheiden, ob unterwegs ein Beitrag verschwindet.
 */

import { describe, expect, it } from 'vitest';

import {
  BILDER_MAX,
  bilderPassen,
  bilderZeigen,
  hinweis,
  pfadeVon,
  VORGABE,
  VORLAGEN,
  vorlageVon,
} from '../src/lib/vorlagen';

describe('Die Liste der Vorlagen', () => {
  it('führt fünf, von einem Bild bis zur Collage', () => {
    expect(VORLAGEN).toHaveLength(5);
    expect(VORLAGEN.map((v) => v.id)).toEqual([
      'polaroid',
      'hochkant',
      'panorama',
      'streifen',
      'collage',
    ]);
  });

  it('hat eindeutige Kennungen', () => {
    expect(new Set(VORLAGEN.map((v) => v.id)).size).toBe(VORLAGEN.length);
  });

  it('gibt jeder Vorlage einen Namen, ein Zeichen und einen Satz dazu', () => {
    // Ohne das stünde in der Maske ein leerer Knopf, und getroffen hätte man ihn
    // trotzdem — 44 px sind 44 px, auch wenn nichts darauf steht.
    for (const v of VORLAGEN) {
      expect(v.name.length, `${v.id} ohne Namen`).toBeGreaterThan(2);
      expect(v.zeichen.length, `${v.id} ohne Zeichen`).toBeGreaterThan(0);
      expect(v.was.length, `${v.id} ohne Erklärung`).toBeGreaterThan(10);
    }
  });

  it('hält min ≤ max und bleibt innerhalb von BILDER_MAX', () => {
    for (const v of VORLAGEN) {
      expect(v.min, `${v.id}: min über max`).toBeLessThanOrEqual(v.max);
      expect(v.min, `${v.id}: min unter 1`).toBeGreaterThanOrEqual(1);
      expect(v.max, `${v.id}: max über BILDER_MAX`).toBeLessThanOrEqual(BILDER_MAX);
    }
  });

  it('nennt die Vorgabe als erste — sie ist der Zustand aller alten Beiträge', () => {
    expect(VORLAGEN[0].id).toBe(VORGABE);
  });
});

describe('vorlageVon()', () => {
  it('gibt die passende Vorlage zurück', () => {
    expect(vorlageVon('collage').id).toBe('collage');
    expect(vorlageVon('hochkant').max).toBe(1);
  });

  it('fällt bei null auf Polaroid zurück — das sind alle Beiträge vor 0009', () => {
    expect(vorlageVon(null).id).toBe('polaroid');
    expect(vorlageVon(undefined).id).toBe('polaroid');
  });

  /*
   * Der wichtigste Fall dieser Datei.
   *
   * In der Spalte steht freier Text (kein Enum — die Liste führt der Client, wie
   * bei `sticker`). Legt ein Telefon mit neuerer App-Fassung einen Beitrag mit
   * `vorlage: 'raster'` an, dann liest ein Telefon mit älterer Fassung einen Wert,
   * den es nicht kennt. Würde `vorlageVon()` dabei `undefined` liefern, wäre der
   * Beitrag auf dem einen Gerät da und auf dem anderen nicht — und niemand würde
   * verstehen, warum. Ein Polaroid mit dem richtigen Bild ist die harmlose Antwort.
   */
  it('fällt bei einem unbekannten Wert auf Polaroid zurück, statt nichts zu liefern', () => {
    expect(vorlageVon('raster').id).toBe('polaroid');
    expect(vorlageVon('').id).toBe('polaroid');
    expect(vorlageVon('POLAROID').id, 'Großschreibung ist ein anderer Wert').toBe('polaroid');
  });
});

describe('bilderPassen() und hinweis()', () => {
  const collage = vorlageVon('collage');
  const polaroid = vorlageVon('polaroid');

  it('passt an den Rändern', () => {
    expect(bilderPassen(collage, 1)).toBe(false);
    expect(bilderPassen(collage, 2)).toBe(true);
    expect(bilderPassen(collage, 4)).toBe(true);
    expect(bilderPassen(collage, 5)).toBe(false);
    expect(bilderPassen(polaroid, 1)).toBe(true);
    expect(bilderPassen(polaroid, 2)).toBe(false);
  });

  it('schweigt, wenn es passt', () => {
    expect(hinweis(collage, 3)).toBeNull();
    expect(hinweis(polaroid, 1)).toBeNull();
  });

  it('sagt bei zu wenigen Bildern, dass es trotzdem geht', () => {
    const s = hinweis(collage, 1) ?? '';
    expect(s).toMatch(/Collage/);
    expect(s).toMatch(/1/);
    // Das ist die Zusicherung gegen eine Sperre: Ein Formular, das auf dem Telefon
    // das Absenden verweigert, kostet den Beitrag.
    expect(s).toMatch(/trotzdem/i);
  });

  it('sagt bei zu vielen Bildern, dass die übrigen nicht erscheinen', () => {
    const s = hinweis(polaroid, 3) ?? '';
    expect(s).toMatch(/nicht/);
    expect(s).toMatch(/3/);
  });

  it('nennt ohne Bild den Textbeitrag', () => {
    expect(hinweis(collage, 0) ?? '').toMatch(/Textbeitrag/);
  });
});

describe('bilderZeigen()', () => {
  it('schneidet auf das Maß der Vorlage ab', () => {
    // Sonst bekäme eine Collage bei fünf Pfaden fünf Felder, und das 2×2-Raster
    // wäre keines mehr.
    expect(bilderZeigen(vorlageVon('collage'), [1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4]);
    expect(bilderZeigen(vorlageVon('polaroid'), [1, 2, 3])).toEqual([1]);
    expect(bilderZeigen(vorlageVon('streifen'), [1, 2, 3, 4])).toEqual([1, 2, 3]);
  });

  it('lässt weniger Bilder in Ruhe', () => {
    expect(bilderZeigen(vorlageVon('collage'), [1, 2])).toEqual([1, 2]);
    expect(bilderZeigen(vorlageVon('collage'), [])).toEqual([]);
  });
});

describe('pfadeVon()', () => {
  it('nimmt das Array, wenn es da ist', () => {
    expect(pfadeVon({ bild_pfade: ['a', 'b'], bild_pfad: 'a' })).toEqual(['a', 'b']);
  });

  /*
   * Der Rückfall ist **zwei** Fälle in einem, und beide sind echt:
   *
   * 1. Migration 0009 ist noch nicht eingespielt — dann kommt `bild_pfade` gar
   *    nicht mit, und ohne den Rückfall hätte jeder Beitrag plötzlich kein Bild.
   * 2. Ein Beitrag von vor der Migration, dessen Array die Nachfüllung nicht
   *    erwischt hat.
   */
  it('fällt auf bild_pfad zurück, wenn das Array fehlt oder leer ist', () => {
    expect(pfadeVon({ bild_pfad: 'a' })).toEqual(['a']);
    expect(pfadeVon({ bild_pfade: [], bild_pfad: 'a' })).toEqual(['a']);
    expect(pfadeVon({ bild_pfade: null, bild_pfad: 'a' })).toEqual(['a']);
  });

  it('gibt bei einem Textbeitrag eine leere Liste', () => {
    expect(pfadeVon({ bild_pfad: null })).toEqual([]);
    expect(pfadeVon({})).toEqual([]);
    expect(pfadeVon({ bild_pfade: [], bild_pfad: null })).toEqual([]);
  });

  it('wirft leere Einträge aus dem Array', () => {
    // Ein leerer Pfad würde zu einem `<img src="">`, und das lädt in manchen
    // Browsern die Seite selbst noch einmal.
    expect(pfadeVon({ bild_pfade: ['a', '', 'b'] })).toEqual(['a', 'b']);
  });
});
