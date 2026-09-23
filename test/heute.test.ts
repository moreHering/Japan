/**
 * `heuteInJapan()` — der Reisetag nach japanischer Uhr.
 *
 * Bis zum 23.09. rechnete die App „heute" in UTC. Japan ist UTC+9: Vor 9 Uhr
 * morgens war es für die App noch gestern — der Countdown, das Datum eines
 * Freundebuch-Beitrags beim Frühstück, die Vorbelegung einer Ausgabe.
 */
import { describe, expect, it } from 'vitest';
import { heuteInJapan } from '../src/lib/trip';

describe('heuteInJapan()', () => {
  it('ist um 5 Uhr morgens in Japan schon der neue Tag', () => {
    // 27.09. 20:00 UTC = 28.09. 05:00 in Tokio.
    // Gegenprobe: die alte Rechnung `toISOString().slice(0, 10)` liefert hier
    // den 27. — genau der Fehler.
    const jetzt = new Date('2026-09-27T20:00:00Z');
    expect(heuteInJapan(jetzt)).toBe('2026-09-28');
    expect(jetzt.toISOString().slice(0, 10)).toBe('2026-09-27');
  });

  it('wechselt um Mitternacht japanischer Zeit, nicht um Mitternacht UTC', () => {
    expect(heuteInJapan(new Date('2026-10-02T14:59:59Z'))).toBe('2026-10-02');
    expect(heuteInJapan(new Date('2026-10-02T15:00:00Z'))).toBe('2026-10-03');
  });

  it('liefert die Form JJJJ-MM-TT, mit der alle Vergleiche rechnen', () => {
    expect(heuteInJapan(new Date('2026-01-05T03:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
