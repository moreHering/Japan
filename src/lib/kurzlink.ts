/**
 * Google-Maps-Kurzlinks und Namenssuche — der zweite Weg zur Koordinate.
 *
 * ## Warum
 *
 * Das Teilen-Menü von Google Maps liefert `https://maps.app.goo.gl/…`, oft mit
 * dem Ortsnamen davor. Eine Koordinate steht darin nicht (gemeldet am
 * 25.09.2026). `lese()` in `koordinaten.ts` kann dann nur raten lassen.
 *
 * ## Der Weg
 *
 * 1. Die Datenbankfunktion `kurzlink_aufloesen` (Migration 0011) folgt der
 *    Weiterleitung. Ihre Ziele und ihr Fund gehen wieder durch `lese()` —
 *    dieselbe Regel wie beim Einfügen eines langen Links.
 * 2. Ohne Koordinate: Namenssuche bei OpenStreetMap (Nominatim), beschränkt
 *    auf Japan. **Deren Treffer werden nie still übernommen**, sondern als
 *    Auswahl gezeigt. Ein Pin an der falschen Stelle ist auf der Reise
 *    schlimmer als gar keiner.
 *
 * Die Netzaufrufe kommen als Parameter herein, damit vitest alles ohne Netz
 * prüfen kann.
 */
import { lese, type Fund } from './koordinaten';

export type Kandidat = { name: string; adresse: string; lat: number; lng: number };

export type Aufgeloest =
  | { art: 'gefunden'; lat: number; lng: number; quelle: string }
  | { art: 'kandidaten'; kandidaten: Kandidat[]; suchtext: string }
  | { art: 'nichts'; grund: string };

/** Antwort der Datenbankfunktion. */
export type Antwort = { ziele?: string[] | null; fund?: string | null; fehler?: string | null };

export type Netz = {
  /** Ruft `kurzlink_aufloesen` auf; `null`, wenn keine Datenbank da ist. */
  aufloesen: (link: string) => Promise<Antwort | null>;
  /** Holt JSON von einer Adresse (Nominatim). */
  holen: (url: string) => Promise<unknown>;
  /** Pause zwischen zwei Suchanfragen — im Test ohne Wartezeit. */
  warten?: (ms: number) => Promise<void>;
};

const URL_MUSTER = /https?:\/\/\S+/gi;

/** Der erste Kurzlink im Text, ohne angehängte Satzzeichen. */
export function kurzlinkAus(text: string): string | null {
  const m = text.match(/https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[A-Za-z0-9_-]+(?:\?[A-Za-z0-9_=&%.-]*)?/i);
  return m ? m[0] : null;
}

/**
 * Was außer Links im geteilten Text steht — meist Name und Adresse.
 *
 * iOS teilt aus Google Maps etwa „Hotel Mystays\n1-2-3 Kanazawa\nhttps://maps.app.goo.gl/…".
 */
export function suchtextAus(text: string): string {
  return text
    .replace(URL_MUSTER, ' ')
    .split(/\n+/)
    .map((z) => z.replace(/\s+/g, ' ').trim())
    .filter((z) => z.length > 1)
    .join(', ');
}

/** Name oder Adresse aus den Weiterleitungszielen (`?q=…`, `/maps/place/Name/`). */
export function suchtextAusZielen(ziele: string[]): string {
  for (const ziel of [...ziele].reverse()) {
    let u: URL;
    try {
      u = new URL(ziel);
    } catch {
      continue;
    }
    const q = u.searchParams.get('q') ?? u.searchParams.get('query');
    if (q && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(q)) return q.trim();
    const platz = u.pathname.match(/\/maps\/place\/([^/]+)/);
    if (platz) return decodeURIComponent(platz[1].replace(/\+/g, ' ')).trim();
  }
  return '';
}

/** Koordinate aus der Antwort der Datenbankfunktion — über dieselbe `lese()`. */
export function auswerten(antwort: Antwort | null): Extract<Fund, { art: 'gefunden' }> | null {
  if (!antwort) return null;
  // Fund zuerst: Er kommt aus dem Seitentext, wenn in keinem Ziel eine stand.
  for (const kandidat of [...(antwort.ziele ?? []).slice().reverse(), antwort.fund ?? '']) {
    if (!kandidat) continue;
    const f = lese(kandidat);
    if (f.art === 'gefunden') return f;
  }
  return null;
}

/** Die Nominatim-Antwort als Auswahlliste. Unbrauchbare Zeilen fallen weg. */
export function kandidatenAus(json: unknown): Kandidat[] {
  if (!Array.isArray(json)) return [];
  const liste: Kandidat[] = [];
  for (const z of json) {
    if (!z || typeof z !== 'object') continue;
    const r = z as Record<string, unknown>;
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const voll = String(r.display_name ?? '');
    const name = String(r.name || voll.split(',')[0] || 'Treffer').trim();
    const adresse = voll.split(',').slice(1, 4).map((t) => t.trim()).filter(Boolean).join(', ');
    liste.push({ name, adresse, lat, lng });
  }
  return liste.slice(0, 3);
}

/**
 * Suchtexte vom genauesten zum gröbsten — OpenStreetMap findet japanische
 * Adressen schlecht, wenn Postleitzahl, Gebäude und Stockwerk dabeistehen.
 *
 * Beispiel aus dem ersten echten Kurzlink (26.09.2026):
 *   „Japan, 〒542-0073 Osaka, Chuo Ward, Nipponbashi, 1 Chome−8−16 真幸ビル 地下1 R/H/B"
 * wird zu
 *   1. „Osaka, Chuo Ward, Nipponbashi, 1 Chome-8-16 真幸ビル 地下1 R/H/B"
 *   2. „1-8-16 Nipponbashi, Chuo Ward, Osaka"   (Hausnummer, ohne Gebäude)
 *   3. „Nipponbashi, Chuo Ward, Osaka"           (nur noch das Viertel)
 *
 * Jede gröbere Stufe trifft ungenauer. Deshalb bleibt es bei der Auswahl mit
 * dem Hinweis, den Ort auf der Karte zu prüfen — übernommen wird nichts still.
 */
export function adressVarianten(roh: string): string[] {
  const text = roh
    .replace(/[\u2212\u2010-\u2015\uFF0D]/g, '-')
    .replace(/〒\s*\d{3}-?\d{4}/g, '')
    .replace(/^\s*(Japan|日本)\s*[,、]\s*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*,/g, ',')
    .trim()
    .replace(/^,\s*/, '');
  const varianten = [text];

  // „1 Chome-8-16" → „1-8-16"; alles danach (Gebäude, Stockwerk) fällt weg.
  const teile = text.split(/\s*,\s*/);
  const hausIdx = teile.findIndex((t) => /\d+\s*Chome-\d+(-\d+)?/i.test(t));
  if (hausIdx >= 0) {
    const nummer = teile[hausIdx].match(/(\d+)\s*Chome-(\d+(?:-\d+)?)/i)!;
    const orte = teile.slice(0, hausIdx).reverse(); // Viertel, Bezirk, Stadt
    if (orte.length) {
      varianten.push(`${nummer[1]}-${nummer[2]} ${orte.join(', ')}`);
      varianten.push(orte.join(', '));
    }
  }
  return [...new Set(varianten.filter((v) => v.length > 2))];
}

export function nominatimUrl(suchtext: string): string {
  const p = new URLSearchParams({
    format: 'jsonv2',
    countrycodes: 'jp',
    limit: '3',
    'accept-language': 'de,en,ja',
    q: suchtext,
  });
  return `https://nominatim.openstreetmap.org/search?${p}`;
}

const RAT =
  'Tipp: In Google Maps lange auf den Ort tippen — dann steht oben die Koordinate zum Kopieren.';

/**
 * Den eingefügten Text zur Koordinate bringen — oder zu einer Auswahl.
 *
 * Nur für Text, den `lese()` nicht allein lösen konnte: einen Kurzlink oder
 * bloß einen Namen.
 */
export async function aufloesen(text: string, netz: Netz): Promise<Aufgeloest> {
  const link = kurzlinkAus(text);
  let ziele: string[] = [];

  if (link) {
    let antwort: Antwort | null = null;
    try {
      antwort = await netz.aufloesen(link);
    } catch {
      antwort = null;
    }
    const f = auswerten(antwort);
    if (f) return { art: 'gefunden', lat: f.lat, lng: f.lng, quelle: `${f.quelle} (Kurzlink aufgelöst)` };
    ziele = antwort?.ziele ?? [];
  }

  const suchtext = suchtextAus(text) || suchtextAusZielen(ziele);
  if (!suchtext) {
    return {
      art: 'nichts',
      grund: link
        ? `Der Kurzlink ließ sich nicht auflösen, und es steht kein Name dabei. ${RAT}`
        : `Darin steckt keine Koordinate. ${RAT}`,
    };
  }

  let kandidaten: Kandidat[] = [];
  const varianten = adressVarianten(suchtext);
  for (const [i, v] of varianten.entries()) {
    // Nominatim erlaubt eine Anfrage je Sekunde.
    if (i > 0) await (netz.warten ?? ((ms) => new Promise((f) => setTimeout(f, ms))))(1100);
    try {
      kandidaten = kandidatenAus(await netz.holen(nominatimUrl(v)));
    } catch {
      kandidaten = [];
    }
    if (kandidaten.length) break;
  }
  if (!kandidaten.length) {
    return { art: 'nichts', grund: `Zu „${suchtext}" nichts gefunden. ${RAT}` };
  }
  return { art: 'kandidaten', kandidaten, suchtext };
}
