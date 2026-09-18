/**
 * Prüfstand für das Lesen von Koordinaten aus eingefügtem Text.
 *
 * Die Link-Formen unten sind keine erfundenen Muster, sondern die, die Google
 * Maps ausgibt. Wichtigster Fall: Steht im Link sowohl der Kartenmittelpunkt
 * (`@`) als auch der Ort (`!3d/!4d`), muss der **Ort** gewinnen. Der
 * Mittelpunkt kann hundert Meter daneben liegen, und auf der Reise ist das der
 * Unterschied zwischen „da ist es" und „irgendwo hier".
 */

import { describe, expect, it } from 'vitest';
import { lese, inJapan } from '../src/lib/koordinaten';

describe('Koordinaten aus Maps-Links', () => {
  it('nimmt den Ort, nicht den Kartenmittelpunkt', () => {
    // Beides im Link — @ zeigt auf die Kartenmitte, !3d/!4d auf den Ort.
    const link =
      'https://www.google.com/maps/place/Ghibli+Museum/@35.6962,139.5703,15z/data=!4m6!3m5!1s0x0:0x0!8m2!3d35.6962274!4d139.5704043!16s%2Fg%2F123';
    const f = lese(link);
    expect(f.art).toBe('gefunden');
    if (f.art !== 'gefunden') return;
    expect(f.lat).toBeCloseTo(35.6962274, 6);
    expect(f.lng).toBeCloseTo(139.5704043, 6);
    expect(f.quelle).toContain('Ort');
  });

  it('nimmt den Kartenmittelpunkt, wenn es nichts Genaueres gibt — und sagt es', () => {
    const f = lese('https://www.google.com/maps/@34.6937,135.5023,17z');
    expect(f.art).toBe('gefunden');
    if (f.art !== 'gefunden') return;
    expect(f.lat).toBeCloseTo(34.6937, 4);
    // Der Hinweis ist der Punkt: ungeprüft darf das nicht in die Karte.
    expect(f.quelle).toMatch(/prüfen/);
  });

  it('liest die Abfrageform', () => {
    for (const link of [
      'https://maps.google.com/?q=36.5613,136.6562',
      'https://www.google.com/maps/search/?api=1&query=36.5613,136.6562',
      'https://maps.google.com/?q=36.5613%2C136.6562',
    ]) {
      const f = lese(link);
      expect(f.art, link).toBe('gefunden');
      if (f.art !== 'gefunden') continue;
      expect(f.lat).toBeCloseTo(36.5613, 4);
      expect(f.lng).toBeCloseTo(136.6562, 4);
    }
  });

  it('liest ein bloßes Zahlenpaar in mehreren Schreibweisen', () => {
    for (const roh of ['35.6895, 139.6917', '35.6895,139.6917', '35.6895 139.6917']) {
      const f = lese(roh);
      expect(f.art, roh).toBe('gefunden');
      if (f.art !== 'gefunden') continue;
      expect(f.lat).toBeCloseTo(35.6895, 4);
    }
  });

  it('liest Grad, Minuten, Sekunden — so gibt Maps es beim langen Tippen aus', () => {
    const f = lese('35°41\'22.2"N 139°41\'30.1"E');
    expect(f.art).toBe('gefunden');
    if (f.art !== 'gefunden') return;
    expect(f.lat).toBeCloseTo(35.6895, 3);
    expect(f.lng).toBeCloseTo(139.6917, 3);
  });

  it('nimmt aus einem langen Link nicht die Zoomstufe für eine Koordinate', () => {
    // Genau das würde ein zu gieriges Zahlenmuster tun: 15z und Bildmaße
    // sehen wie Zahlenpaare aus.
    const f = lese('https://www.google.com/maps/place/X/@35.6962,139.5703,15z/data=!3m1!4b1');
    expect(f.art).toBe('gefunden');
    if (f.art !== 'gefunden') return;
    expect(f.lat).toBeCloseTo(35.6962, 4);
    expect(f.lng).toBeCloseTo(139.5703, 4);
  });

  it('sagt bei einem Kurzlink, was zu tun ist, statt stumm nichts zu finden', () => {
    for (const link of ['https://maps.app.goo.gl/abc123', 'https://goo.gl/maps/xyz']) {
      const f = lese(link);
      expect(f.art, link).toBe('kurzlink');
      if (f.art !== 'kurzlink') continue;
      expect(f.rat.length).toBeGreaterThan(30);
    }
  });

  it('verwirft unmögliche Werte statt sie zu übernehmen', () => {
    // 200 als Länge gibt es nicht. Ein stillschweigend übernommener Wert wäre
    // ein Pin im Nichts — und der fällt erst auf, wenn man davorsteht.
    expect(lese('91.0, 20.0').art).toBe('nichts');
    expect(lese('45.0, 200.0').art).toBe('nichts');
    expect(lese('').art).toBe('nichts');
    expect(lese('Kanazawa, Ishikawa').art).toBe('nichts');
  });

  it('erkennt verdrehte Breite und Länge als unplausibel für Japan', () => {
    expect(inJapan(35.6895, 139.6917)).toBe(true);
    // Vertauscht: 139 als Breite ist unmöglich, 35 als Länge liegt in Irak.
    expect(inJapan(35.6895, 35.6895)).toBe(false);
  });
});
