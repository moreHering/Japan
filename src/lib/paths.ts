/**
 * Pfad-Helfer für das GitHub-Pages-Unterverzeichnis.
 *
 * Die Seite läuft unter /Japan/, nicht im Wurzelverzeichnis. Jeder interne Link
 * und jedes Asset aus public/ muss diesen Präfix tragen — absolute Pfade wie
 * "/plan/" würden in Produktion auf 404 laufen. Astro stellt den Wert als
 * import.meta.env.BASE_URL bereit; mit trailingSlash: 'always' endet er auf "/".
 */

const BASE = import.meta.env.BASE_URL;

/** Interner Link: `url('plan')` → `/Japan/plan/` */
export function url(path = ''): string {
  const clean = path.replace(/^\/+/, '');
  if (!clean) return BASE;
  return `${BASE}${clean.replace(/\/*$/, '')}/`;
}

/** Datei aus public/: `asset('reiseband.html')` → `/Japan/reiseband.html` */
export function asset(path: string): string {
  return `${BASE}${path.replace(/^\/+/, '')}`;
}

/**
 * Kapitel im Reiseband **auf der Startseite**: `kapitel('kyoto')` → `/Japan/#kyoto`
 *
 * Seit der Band vollständig auf der Startseite steht, ist das der Weg zum Text.
 * Innerhalb der Startseite genügt `#kyoto`; von anderen Seiten braucht es den
 * vollen Pfad, sonst sucht der Browser den Anker auf der aktuellen Seite.
 */
export function kapitel(anchor?: string): string {
  return `${BASE}${anchor ? `#${anchor}` : ''}`;
}

/**
 * Die eigenständige Lesefassung als Datei: `guide('kyoto')` →
 * `/Japan/reiseband.html#kyoto`
 *
 * Bleibt für den Ausdruck und als geschlossenes Dokument. Für das Lesen in der
 * App ist `kapitel()` der Weg — sonst landet man in einer zweiten Kopie
 * desselben Texts und wundert sich, warum die Navigation fehlt.
 */
export function guide(anchor?: string): string {
  return `${asset('reiseband.html')}${anchor ? `#${anchor}` : ''}`;
}

/** Google Maps für die Navigation vor Ort. */
export function maps(place: { lat: number; lng: number; placeId?: string | null }): string {
  const q = `${place.lat},${place.lng}`;
  const id = place.placeId ? `&query_place_id=${place.placeId}` : '';
  return `https://www.google.com/maps/search/?api=1&query=${q}${id}`;
}
