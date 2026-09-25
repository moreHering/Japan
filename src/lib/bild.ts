/**
 * Bilder im Browser verkleinern, bevor sie hochgeladen werden.
 *
 * Steht bewusst allein und ohne Runen: So lässt es sich im Browser einzeln
 * prüfen, ohne die halbe App zu laden — und es ist die Stelle mit den meisten
 * stillen Fallstricken (Drehung aus den EXIF-Daten, Speicher bei großen
 * Bildern, Formate, die `toBlob` nicht kann).
 */

export type Verkleinert = {
  blob: Blob;
  /** Nur mit Zuschnitt gesetzt: in welches der zwei Formate das Bild kam. */
  format?: Format;
  breite: number;
  hoehe: number;
  /** Ursprungsgröße in Bytes — für die Anzeige „aus 6,2 MB wurden 280 kB". */
  vorher: number;
};

/**
 * Die zwei Formate des Freundebuchs.
 *
 * **Hochformat 4:5** — das Hochformat von Instagram, das am meisten Fläche auf
 * dem Handybildschirm bekommt.
 *
 * **Querformat 8:5 (16:10)** — und bewusst nicht Instagrams 1,91:1. Der Grund ist
 * die Collage: Ein Querbild ist genau so breit und hoch wie **zwei Hochbilder
 * nebeneinander** (2 × 4:5 = 8:5). Damit ist jede Zeile einer Collage gleich
 * hoch, egal ob sie ein Querbild oder zwei Hochbilder trägt, und zwei Zeilen
 * ergeben wieder genau 4:5. Mit 1,91:1 passt nichts ohne weiteren Anschnitt
 * zusammen.
 */
export type Format = 'hoch' | 'quer';
export const VERHAELTNIS: Record<Format, number> = { hoch: 4 / 5, quer: 8 / 5 };

/**
 * Welcher Ausschnitt eines Bildes der Größe `breite`×`hoehe` stehen bleibt.
 *
 * Breiter als hoch → Querformat, sonst (auch quadratisch) → Hochformat.
 * Beschnitten wird mittig. Rein gerechnet, damit vitest es ohne Leinwand prüft.
 */
export function zuschnitt(
  breite: number,
  hoehe: number,
): { format: Format; x: number; y: number; b: number; h: number } {
  const format: Format = breite > hoehe ? 'quer' : 'hoch';
  const ziel = VERHAELTNIS[format];
  if (breite / hoehe > ziel) {
    const b = Math.round(hoehe * ziel);
    return { format, x: Math.round((breite - b) / 2), y: 0, b, h: hoehe };
  }
  const h = Math.round(breite / ziel);
  return { format, x: 0, y: Math.round((hoehe - h) / 2), b: breite, h };
}

/**
 * Längste Kante auf `maxKante`, als JPEG mit `guete`.
 *
 * 1600 px und 0,82 sind der Punkt, an dem man auf einem Handydisplay keinen
 * Unterschied mehr sieht, die Datei aber um den Faktor 10–20 kleiner ist. Ein
 * Handyfoto hat 4–8 MB; über japanisches Mobilfunknetz ist das der Unterschied
 * zwischen einer und zwanzig Sekunden, und es füllt sonst das Freikontingent.
 *
 * `imageOrientation: 'from-image'` dreht hochkant aufgenommene Bilder richtig
 * herum. Ohne das liegen sie nach dem Zeichnen auf der Seite, weil die Drehung
 * nur in den EXIF-Daten steht und beim Zeichnen verlorengeht.
 */
export async function verkleinern(
  datei: Blob,
  maxKante = 1600,
  guete = 0.82,
  zuschneiden = false,
): Promise<Verkleinert> {
  const vorher = datei.size;
  const { bild, breite: quelleB, hoehe: quelleH, freigeben } = await dekodieren(datei);

  try {
    const aus = zuschneiden
      ? zuschnitt(quelleB, quelleH)
      : { format: undefined, x: 0, y: 0, b: quelleB, h: quelleH };
    const faktor = Math.min(1, maxKante / Math.max(aus.b, aus.h));
    const breite = Math.max(1, Math.round(aus.b * faktor));
    const hoehe = Math.max(1, Math.round(aus.h * faktor));

    const leinwand = document.createElement('canvas');
    leinwand.width = breite;
    leinwand.height = hoehe;
    const stift = leinwand.getContext('2d');
    if (!stift) throw new Error('Der Browser kann das Bild nicht verkleinern.');

    // Ohne weißen Grund werden durchsichtige Stellen im JPEG schwarz.
    stift.fillStyle = '#ffffff';
    stift.fillRect(0, 0, breite, hoehe);
    stift.imageSmoothingQuality = 'high';
    stift.drawImage(bild, aus.x, aus.y, aus.b, aus.h, 0, 0, breite, hoehe);

    const blob = await new Promise<Blob | null>((fertig) =>
      leinwand.toBlob(fertig, 'image/jpeg', guete),
    );
    if (!blob) throw new Error('Das Bild ließ sich nicht umwandeln.');

    return { blob, breite, hoehe, vorher, format: aus.format };
  } finally {
    freigeben();
  }
}

/**
 * Ein Bild lesen — erst über `<img>`, dann über `createImageBitmap`.
 *
 * **Warum nicht nur `createImageBitmap`:** Auf dem iPhone scheiterte damit jeder
 * Upload mit „The source image cannot be decoded" (gemeldet am 25.09.2026, aus
 * Fotos, Kamera und Profilbild). Geprüft war nur Chromium, und dort geht es. Das
 * `<img>`-Element dagegen liest Safari zuverlässig, HEIC eingeschlossen, und
 * dreht nach den EXIF-Daten von selbst (Safari ab 13.1, Chrome ab 81) — auch
 * beim Zeichnen auf die Leinwand.
 */
async function dekodieren(
  datei: Blob,
): Promise<{ bild: CanvasImageSource; breite: number; hoehe: number; freigeben: () => void }> {
  const url = URL.createObjectURL(datei);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth) throw new Error('leer');
    return {
      bild: img,
      breite: img.naturalWidth,
      hoehe: img.naturalHeight,
      freigeben: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
  }
  try {
    const bmp = await createImageBitmap(datei, { imageOrientation: 'from-image' });
    return { bild: bmp, breite: bmp.width, hoehe: bmp.height, freigeben: () => bmp.close() };
  } catch {
    throw new Error(
      'Dieses Bild kann der Browser nicht lesen. Versuch ein anderes oder mach einen Screenshot davon.',
    );
  }
}

/** „6,2 MB", „284 kB" — für die Anzeige neben dem Bild. */
export function groesse(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${Math.round(bytes / 1024)} kB`;
}
