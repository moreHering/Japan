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
  breite: number;
  hoehe: number;
  /** Ursprungsgröße in Bytes — für die Anzeige „aus 6,2 MB wurden 280 kB". */
  vorher: number;
};

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
): Promise<Verkleinert> {
  const vorher = datei.size;
  const bild = await createImageBitmap(datei, { imageOrientation: 'from-image' });

  try {
    const faktor = Math.min(1, maxKante / Math.max(bild.width, bild.height));
    const breite = Math.max(1, Math.round(bild.width * faktor));
    const hoehe = Math.max(1, Math.round(bild.height * faktor));

    const leinwand = document.createElement('canvas');
    leinwand.width = breite;
    leinwand.height = hoehe;
    const stift = leinwand.getContext('2d');
    if (!stift) throw new Error('Der Browser kann das Bild nicht verkleinern.');

    // Ohne weißen Grund werden durchsichtige Stellen im JPEG schwarz.
    stift.fillStyle = '#ffffff';
    stift.fillRect(0, 0, breite, hoehe);
    stift.imageSmoothingQuality = 'high';
    stift.drawImage(bild, 0, 0, breite, hoehe);

    const blob = await new Promise<Blob | null>((fertig) =>
      leinwand.toBlob(fertig, 'image/jpeg', guete),
    );
    if (!blob) throw new Error('Das Bild ließ sich nicht umwandeln.');

    return { blob, breite, hoehe, vorher };
  } finally {
    bild.close();
  }
}

/** „6,2 MB", „284 kB" — für die Anzeige neben dem Bild. */
export function groesse(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${Math.round(bytes / 1024)} kB`;
}
