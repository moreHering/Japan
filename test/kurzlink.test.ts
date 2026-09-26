import { describe, expect, it, vi } from 'vitest';
import {
  adressVarianten,
  aufloesen,
  auswerten,
  kandidatenAus,
  kurzlinkAus,
  nominatimUrl,
  suchtextAus,
  suchtextAusZielen,
  type Netz,
} from '../src/lib/kurzlink';

const KURZ = 'https://maps.app.goo.gl/AbC123xyz';
const GETEILT = `Hotel Mystays Kanazawa Castle\n10-17 Konomachi, Kanazawa\n${KURZ}?g_st=ic`;

function netz(antwort: unknown, treffer: unknown = []): Netz & { holen: ReturnType<typeof vi.fn> } {
  return {
    aufloesen: vi.fn(async () => antwort as never),
    holen: vi.fn(async () => treffer),
    warten: async () => {},
  };
}

/** Das Ziel des ersten echten Kurzlinks (26.09.2026), wie der Server es sah. */
const ECHTES_ZIEL =
  'https://www.google.com/maps/place/Japan,+%E3%80%92542-0073+Osaka,+Chuo+Ward,+Nipponbashi,+1+Chome%E2%88%928%E2%88%9216+%E7%9C%9F%E5%B9%B8%E3%83%93%E3%83%AB+%E5%9C%B0%E4%B8%8B1+R%2FH%2FB/data=!4m2!3m1!1s0x6000e7403e7cd83f:0x172b05afa7452cbd!18m1!1e1?utm_source=mstt_1&entry=gps';

describe('Bausteine', () => {
  it('findet den Kurzlink im geteilten Text', () => {
    expect(kurzlinkAus(GETEILT)).toBe(`${KURZ}?g_st=ic`);
    expect(kurzlinkAus('https://goo.gl/maps/xyz9')).toBe('https://goo.gl/maps/xyz9');
    expect(kurzlinkAus('https://www.google.com/maps/place/x')).toBeNull();
  });

  it('nimmt Name und Adresse aus dem geteilten Text, ohne Link', () => {
    expect(suchtextAus(GETEILT)).toBe('Hotel Mystays Kanazawa Castle, 10-17 Konomachi, Kanazawa');
    expect(suchtextAus(KURZ)).toBe('');
  });

  it('liest den Suchtext aus ?q= und aus /maps/place/', () => {
    expect(suchtextAusZielen(['https://maps.google.com/?q=Kenroku-en,+Kanazawa&ftid=0x1:0x2'])).toBe(
      'Kenroku-en, Kanazawa',
    );
    expect(suchtextAusZielen(['https://www.google.com/maps/place/Kenroku-en/data=!4m2'])).toBe('Kenroku-en');
    // Ein Zahlenpaar ist kein Name — das hätte lese() schon gefunden.
    expect(suchtextAusZielen(['https://maps.google.com/?q=36.5,136.6'])).toBe('');
  });

  it('wertet die Antwort der Datenbank mit lese() aus — der Ort schlägt den Mittelpunkt', () => {
    const f = auswerten({
      ziele: ['https://www.google.com/maps/place/X/@36.50,136.60,15z/data=!3d36.5613!4d136.6562'],
      fund: null,
    });
    expect(f).toMatchObject({ lat: 36.5613, lng: 136.6562 });
    expect(auswerten({ ziele: [], fund: '@36.1,136.2' })?.quelle).toMatch(/prüfen/);
    expect(auswerten({ ziele: [], fund: null, fehler: 'nicht verfügbar' })).toBeNull();
    expect(auswerten(null)).toBeNull();
  });

  it('macht aus Nominatim höchstens drei Kandidaten und verwirft Unbrauchbares', () => {
    const k = kandidatenAus([
      { lat: '36.56', lon: '136.65', name: 'Kenroku-en', display_name: 'Kenroku-en, 1 Kenrokumachi, Kanazawa, Ishikawa, Japan' },
      { lat: 'x', lon: '1' },
      { lat: '1', lon: '2', display_name: 'A, B' },
      { lat: '3', lon: '4', display_name: 'C' },
      { lat: '5', lon: '6', display_name: 'D' },
    ]);
    expect(k).toHaveLength(3);
    expect(k[0]).toEqual({ name: 'Kenroku-en', adresse: '1 Kenrokumachi, Kanazawa, Ishikawa', lat: 36.56, lng: 136.65 });
    expect(kandidatenAus({ fehler: 1 })).toEqual([]);
  });

  it('sucht nur in Japan', () => {
    expect(nominatimUrl('Kenroku-en')).toContain('countrycodes=jp');
  });
});

describe('adressVarianten', () => {
  it('bereinigt die Adresse des echten Kurzlinks und vergröbert schrittweise', () => {
    const roh = suchtextAusZielen([ECHTES_ZIEL]);
    expect(roh).toContain('Nipponbashi');
    expect(adressVarianten(roh)).toEqual([
      'Osaka, Chuo Ward, Nipponbashi, 1 Chome-8-16 真幸ビル 地下1 R/H/B',
      '1-8-16 Nipponbashi, Chuo Ward, Osaka',
      'Nipponbashi, Chuo Ward, Osaka',
    ]);
  });
  it('lässt einen schlichten Namen, wie er ist', () => {
    expect(adressVarianten('Kenroku-en')).toEqual(['Kenroku-en']);
  });
});

describe('aufloesen', () => {
  it('Kurzlink mit Koordinate im Ziel: sofort gefunden, keine Namenssuche', async () => {
    const n = netz({ ziele: ['https://www.google.com/maps/place/X/data=!3d36.5613!4d136.6562'], fund: null });
    const r = await aufloesen(GETEILT, n);
    expect(r).toMatchObject({ art: 'gefunden', lat: 36.5613, lng: 136.6562 });
    expect(r.art === 'gefunden' && r.quelle).toMatch(/Kurzlink/);
    expect(n.holen).not.toHaveBeenCalled();
  });

  it('Kurzlink ohne Koordinate: Kandidaten aus der Namenssuche — nie still übernommen', async () => {
    const n = netz(
      { ziele: ['https://maps.google.com/?q=Kenroku-en&ftid=1'], fund: null },
      [{ lat: '36.56', lon: '136.66', name: 'Kenroku-en', display_name: 'Kenroku-en, Kanazawa' }],
    );
    const r = await aufloesen(KURZ, n);
    expect(r.art).toBe('kandidaten');
    expect(n.holen.mock.calls[0][0]).toContain('q=Kenroku-en');
  });

  it('Datenbank nicht erreichbar: der Name aus dem geteilten Text wird gesucht', async () => {
    const n: Netz = {
      aufloesen: async () => {
        throw new Error('offline');
      },
      holen: vi.fn(async () => [{ lat: '36.5', lon: '136.6', display_name: 'Mystays' }]),
    };
    const r = await aufloesen(GETEILT, n);
    expect(r.art).toBe('kandidaten');
  });

  it('echter Fall: Adresse ohne Koordinate — erst genau, dann gröber gesucht', async () => {
    const n: Netz & { holen: ReturnType<typeof vi.fn> } = {
      aufloesen: async () => ({ ziele: [ECHTES_ZIEL], fund: null }),
      holen: vi.fn(async (url: string) =>
        new URL(url).searchParams.get('q')?.startsWith('1-8-16')
          ? [{ lat: '34.6687', lon: '135.5063', display_name: '1-8-16, Nipponbashi, Chuo Ward, Osaka' }]
          : [],
      ),
      warten: async () => {},
    };
    const r = await aufloesen('https://maps.app.goo.gl/iHpuNHzyxPuNpnfF8', n);
    expect(r.art).toBe('kandidaten');
    expect(n.holen).toHaveBeenCalledTimes(2);
  });

  it('nichts zu finden: eine Erklärung mit dem Rat, lange zu tippen', async () => {
    const r = await aufloesen(KURZ, netz(null));
    expect(r.art).toBe('nichts');
    expect(r.art === 'nichts' && r.grund).toMatch(/Kurzlink.*lange auf den Ort/);
    const leer = await aufloesen('Irgendwas', netz(null, []));
    expect(leer.art === 'nichts' && leer.grund).toMatch(/nichts gefunden/);
  });
});
