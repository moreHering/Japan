/**
 * Die Beschriftungssprache der Vektorkarte.
 *
 * Diese Datei prüft das Einzige an der Karte, was aus dieser Umgebung überhaupt
 * beweisbar ist. Der Egress-Proxy sperrt jeden Kachelhost — gemessen: OSM, CARTO,
 * Wikimedia, Esri, OpenFreeMap, alle `connect_rejected`. Ich kann also **nie**
 * sehen, wie eine Karte aussieht oder in welcher Sprache sie beschriftet ist.
 *
 * Was sich prüfen lässt: dass die Umschreibung stattfindet, dass sie Deutsch
 * bevorzugt, und dass sie keine Ebene übersieht. Der Rest hängt am Telefon, und
 * das steht so in `README.md` und im Kopf von `src/lib/karte.ts`.
 *
 * Warum das nicht nur Formsache ist: Der ganze Grund für Vektorkacheln war, die
 * Sprache zu einer **Einstellung** zu machen statt zu einer Eigenschaft des
 * Kachelservers. Wenn die Einstellung nicht greift, ist der Aufwand — 273 KB gzip
 * mehr — umsonst, und zwar unsichtbar: Die Karte sähe nur wieder japanisch aus.
 */

import { describe, expect, it } from 'vitest';
import { SPRACHE, SPRACHFOLGE, deutscheNamen, hostVon } from '../src/lib/karte';

/** Ein Stil in der Bauart, wie MapLibre-Stile sie haben. */
const stil = () => ({
  version: 8,
  layers: [
    { id: 'hintergrund', type: 'background', paint: { 'background-color': '#fff' } },
    { id: 'wasser', type: 'fill', paint: {} },
    { id: 'ort-stadt', type: 'symbol', layout: { 'text-field': ['get', 'name:latin'], 'text-size': 12 } },
    { id: 'ort-dorf', type: 'symbol', layout: { 'text-field': '{name}' } },
    { id: 'strasse-name', type: 'symbol', layout: { 'text-field': ['get', 'name'] } },
    // Eine Symbolebene **ohne** Beschriftung: nur ein Bildchen. Die darf die
    // Umschreibung nicht anfassen, sonst bekäme ein Piktogramm Text.
    { id: 'poi-icon', type: 'symbol', layout: { 'icon-image': 'cafe' } },
  ],
});

describe('Beschriftungssprache', () => {
  it('setzt Deutsch an die erste Stelle', () => {
    // Die Reihenfolge ist die ganze Aussage: `coalesce` nimmt den ersten Wert, der
    // da ist. Stünde `name` vorn, wäre alles wieder japanisch — und niemandem
    // fiele es auf, solange die Karte überhaupt Namen zeigt.
    expect(SPRACHFOLGE[0]).toBe('name:de');
    expect(SPRACHE[0]).toBe('coalesce');
    expect(SPRACHE.slice(1)).toEqual([
      ['get', 'name:de'],
      ['get', 'name:en'],
      ['get', 'name:latin'],
      ['get', 'name'],
    ]);
  });

  it('behält den lokalen Namen als letzte Möglichkeit', () => {
    // Ein Ort ohne jede Umschrift soll seinen Namen behalten statt namenlos zu
    // sein: 大阪 zu lesen ist besser als einen leeren Punkt zu sehen.
    expect(SPRACHFOLGE[SPRACHFOLGE.length - 1]).toBe('name');
  });

  it('schreibt jede Textebene um und keine andere', () => {
    const s = deutscheNamen(stil());
    const texte = s.layers.filter((l) => l.layout && 'text-field' in l.layout);
    expect(texte).toHaveLength(3);
    for (const l of texte) {
      expect(l.layout!['text-field'], `${l.id} nicht umgeschrieben`).toEqual(SPRACHE);
    }
    // Die Ebene ohne Beschriftung bleibt unberührt — sie bekommt kein `text-field`
    // dazu.
    const icon = s.layers.find((l) => l.id === 'poi-icon')!;
    expect('text-field' in icon.layout!).toBe(false);
    expect(icon.layout!['icon-image']).toBe('cafe');
  });

  it('lässt andere Angaben der Textebene stehen', () => {
    // Umgeschrieben wird die Beschriftung, nicht die Ebene. Ginge `text-size`
    // verloren, wären alle Namen plötzlich in der Vorgabegröße — sichtbar, aber
    // schwer als Ursache zu erkennen.
    const s = deutscheNamen(stil());
    const stadt = s.layers.find((l) => l.id === 'ort-stadt')!;
    expect(stadt.layout!['text-size']).toBe(12);
  });

  it('wirft bei einem Stil ohne jede Textebene', () => {
    /*
     * Dann stimmt die Annahme über den Stil nicht. Wichtig ist, was daraus folgt:
     * Die Komponente fängt den Fehler und nimmt die Rasterkarte — japanisch
     * beschriftet, aber sichtbar. Eine stillschweigend unbeschriftete Vektorkarte
     * wäre das schlechtere Ergebnis, und niemand wüsste, warum.
     */
    expect(() => deutscheNamen({ layers: [{ id: 'a', type: 'fill' }] })).toThrow(/Textebene/);
    expect(() => deutscheNamen({})).toThrow(/Textebene/);
  });

  it('kommt mit einem Stil ohne layers-Feld zurecht, statt abzustürzen', () => {
    // `stil.layers ?? []` — ein unerwartetes JSON soll den Rückfall auslösen und
    // nicht einen TypeError, der als „Karte kaputt" ankommt.
    expect(() => deutscheNamen({ version: 8 } as never)).toThrow(/Textebene/);
  });
});

describe('Host einer Kachel-URL', () => {
  it('liest den Host aus einer Vorlage mit Platzhaltern', () => {
    // Ohne das Ersetzen der `{z}`-Platzhalter wirft `URL`, und der Hinweis stünde
    // ohne Host da — genau die Auskunft, um die es geht.
    expect(hostVon('https://tile.openstreetmap.org/{z}/{x}/{y}.png')).toBe(
      'tile.openstreetmap.org',
    );
    expect(hostVon('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png')).toBe(
      '0.basemaps.cartocdn.com',
    );
  });

  it('liest den Host aus einer gewöhnlichen Adresse', () => {
    expect(hostVon('https://tiles.openfreemap.org/styles/liberty')).toBe('tiles.openfreemap.org');
  });

  it('gibt bei Unlesbarem die Eingabe zurück statt zu werfen', () => {
    // Ein Hinweis mit merkwürdigem Text ist besser als keiner: Der Fehlerfall ist
    // genau der Moment, in dem nichts zusätzlich scheitern darf.
    expect(hostVon('kein-url')).toBe('kein-url');
    expect(hostVon('')).toBe('');
  });
});
