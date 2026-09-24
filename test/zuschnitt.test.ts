import { describe, expect, it } from 'vitest';
import { VERHAELTNIS, zuschnitt } from '../src/lib/bild';
import { collageAnordnung, formatAusPfad } from '../src/lib/vorlagen';

describe('zuschnitt', () => {
  it('Querbild 4:3 wird mittig auf 8:5 beschnitten, oben und unten', () => {
    const z = zuschnitt(4032, 3024);
    expect(z.format).toBe('quer');
    expect(z).toMatchObject({ x: 0, b: 4032, h: 2520, y: 252 });
    expect(z.b / z.h).toBeCloseTo(VERHAELTNIS.quer, 3);
  });

  it('Hochbild 3:4 wird mittig auf 4:5 beschnitten, oben und unten', () => {
    const z = zuschnitt(3024, 4032);
    expect(z.format).toBe('hoch');
    expect(z).toMatchObject({ x: 0, b: 3024, h: 3780, y: 126 });
  });

  it('Panorama 3:1 verliert die Seiten, nicht die Höhe', () => {
    const z = zuschnitt(6000, 2000);
    expect(z).toMatchObject({ format: 'quer', y: 0, h: 2000, b: 3200, x: 1400 });
  });

  it('Quadrat und Handy-Hochformat 9:16 werden Hochformat', () => {
    expect(zuschnitt(1000, 1000)).toMatchObject({ format: 'hoch', x: 100, b: 800, h: 1000 });
    const z = zuschnitt(1080, 1920);
    expect(z).toMatchObject({ format: 'hoch', b: 1080, h: 1350, y: 285 });
  });

  it('der Ausschnitt liegt immer im Bild', () => {
    for (const [w, h] of [[1, 1], [7, 3], [3, 7], [4000, 3999], [3999, 4000]]) {
      const z = zuschnitt(w, h);
      expect(z.x).toBeGreaterThanOrEqual(0);
      expect(z.y).toBeGreaterThanOrEqual(0);
      expect(z.x + z.b).toBeLessThanOrEqual(w);
      expect(z.y + z.h).toBeLessThanOrEqual(h);
    }
  });

  it('ein Querbild ist so breit wie zwei Hochbilder nebeneinander', () => {
    expect(VERHAELTNIS.quer).toBeCloseTo(2 * VERHAELTNIS.hoch, 10);
  });
});

describe('formatAusPfad', () => {
  it('liest das Format aus Pfad und signierter URL', () => {
    expect(formatAusPfad('u/abc-hoch.jpg')).toBe('hoch');
    expect(formatAusPfad('https://x/storage/v1/object/sign/freundebuch/u/abc-quer.jpg?token=1')).toBe('quer');
  });
  it('ältere Bilder ohne Format: null', () => {
    expect(formatAusPfad('u/abc.jpg')).toBeNull();
    expect(formatAusPfad('u/hoch/abc.jpg')).toBeNull();
    expect(formatAusPfad('u/profil-quer-x.jpg')).toBeNull();
  });
});

describe('collageAnordnung', () => {
  it('zwei Hochbilder teilen sich eine Zeile, ohne Zusatz', () => {
    expect(collageAnordnung(['hoch', 'hoch'])).toEqual({ raster: '', bilder: ['hoch', 'hoch'] });
  });
  it('drei Hochbilder: eins groß, zwei klein', () => {
    expect(collageAnordnung(['hoch', 'hoch', 'hoch'])).toEqual({
      raster: 'drei-hoch',
      bilder: ['hoch gross', 'hoch', 'hoch'],
    });
  });
  it('ein Querbild und zwei Hochbilder: keins steht allein', () => {
    expect(collageAnordnung(['hoch', 'quer', 'hoch']).bilder).toEqual(['hoch', 'quer', 'hoch']);
  });
  it('das übrige Hochbild bei ungerader Zahl nimmt die ganze Zeile', () => {
    expect(collageAnordnung(['quer', 'hoch']).bilder).toEqual(['quer', 'hoch allein']);
    expect(collageAnordnung(['hoch', 'hoch', 'hoch', 'quer']).bilder).toEqual([
      'hoch',
      'hoch',
      'hoch allein',
      'quer',
    ]);
  });
  it('ein einzelnes Bild steht nie „allein" — es zeigt sein Format', () => {
    expect(collageAnordnung(['hoch']).bilder).toEqual(['hoch']);
  });
});
