/**
 * Eine Datei zum Herunterladen anbieten — so, dass es auch auf dem Telefon geht.
 *
 * Das Muster stammt aus dem KML-Export der Orte-Ansicht, wo es drei Anläufe
 * gekostet hat (Begründung dort, `PlaceExplorer.svelte`). Die zwei Punkte, an
 * denen ein Download auf dem Handy still ausbleibt:
 *
 * 1. **Die Blob-Adresse wird zu früh freigegeben.** Der Klick startet den
 *    Download nur; gelesen wird die Adresse danach. Freigegeben wird deshalb
 *    erst nach einer Minute.
 * 2. **Der Link hängt nicht im Dokument.** Mobile Browser ignorieren Klicks auf
 *    losgelöste Elemente regelmäßig. Also einhängen, klicken, wieder entfernen.
 *
 * Der JSON-Export der Organisation („Als Datei exportieren") machte bis zum
 * 23.09. beides falsch — das Sichern des Plans ging auf dem Telefon nicht.
 */
export function dateiAnbieten(blob: Blob, name: string): void {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
