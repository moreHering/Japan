/**
 * Die Beschriftungssprache der Vektorkarte.
 *
 * Diese Datei prüft das Einzige an der Karte, was aus dieser Umgebung überhaupt
 * beweisbar ist. Der Egress-Proxy sperrt jeden Kachelhost — gemessen: OSM, CARTO,
 * Wikimedia, Esri, OpenFreeMap, alle `connect_rejected`. Ich kann also **nie**
 * sehen, wie eine Karte aussieht oder in welcher Sprache sie beschriftet ist.
 *
 * Was sich prüfen lässt — und seit dem 20.09.2026 deutlich mehr als vorher:
 * Diese Datei arbeitet jetzt gegen den **echten** Liberty-Stil
 * (`test/fixtures/liberty-stil.json`, 111 Ebenen) statt gegen einen erfundenen
 * Handstil, und sie **wertet den umgeschriebenen Ausdruck aus** statt nur seine
 * Form anzusehen. Aus „das Objekt sieht richtig aus" wird damit „es kommt Text
 * heraus, und zwar dieser".
 *
 * Der Anlass war ein Bildschirmfoto vom Telefon, auf dem keine einzige
 * Beschriftung stand. Der alte Handstil hatte zwei `text-field`-Formen, und
 * **keine von beiden kommt im echten Stil vor** — die Prüfung hat also eine
 * Wirklichkeit zugesichert, die es nicht gibt.
 *
 * Was weiter am Telefon hängt: ob die Kacheln ankommen und wie die Karte
 * aussieht. Das steht so in `README.md` und im Kopf von `src/lib/karte.ts`.
 *
 * Warum das nicht nur Formsache ist: Der ganze Grund für Vektorkacheln war, die
 * Sprache zu einer **Einstellung** zu machen statt zu einer Eigenschaft des
 * Kachelservers. Wenn die Einstellung nicht greift, ist der Aufwand — 273 KB gzip
 * mehr — umsonst, und zwar unsichtbar: Die Karte sähe nur wieder japanisch aus.
 */

import { readFileSync } from 'node:fs';

import { createPropertyExpression, v8 } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';

import { SPRACHE, SPRACHFOLGE, deutscheNamen, hostVon } from '../src/lib/karte';

/** Der echte OpenFreeMap-Liberty-Stil. Herkunft: `test/fixtures/LIES-MICH.md`. */
const echterStil = () =>
  JSON.parse(readFileSync(new URL('./fixtures/liberty-stil.json', import.meta.url), 'utf8')) as {
    layers: { id: string; type: string; layout?: Record<string, unknown> }[];
  };

/**
 * Wertet einen `text-field`-Ausdruck gegen ein Beispiel-Feature aus.
 *
 * **Das ist der Sprung, den diese Datei vorher nicht gemacht hat.** Vorher wurde
 * geprüft, dass im Stilobjekt das erwartete Array steht. Dass daraus auf der
 * Karte auch ein Wort wird, war Glaube. Hier läuft dieselbe Ausdrucks-Maschine,
 * die MapLibre benutzt — `@maplibre/maplibre-gl-style-spec` ist eine Abhängigkeit
 * von maplibre-gl und damit ohnehin installiert.
 */
function beschriftung(ausdruck: unknown, eigenschaften: Record<string, unknown>): string {
  const gebaut = createPropertyExpression(
    ausdruck as never,
    'text-field',
    v8.layout_symbol['text-field'] as never,
  );
  if (gebaut.result !== 'success') {
    throw new Error(`Ausdruck ungültig: ${gebaut.value.map((f) => f.message).join('; ')}`);
  }
  return String(
    (gebaut.value as { evaluate: (g: unknown, f: unknown) => unknown }).evaluate({ zoom: 6 }, {
      properties: eigenschaften,
    }) ?? '',
  );
}

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
    // Ein Autobahnschild. Es beschriftet die Straßennummer, nicht einen Namen —
    // und Features mit `ref` haben keinen `name`. Wird es mitüberschrieben,
    // bleibt es **leer**. Genau das ist im echten Stil dreimal passiert.
    { id: 'schild', type: 'symbol', layout: { 'text-field': ['to-string', ['get', 'ref']] } },
  ],
});

describe('Beschriftungssprache', () => {
  it('setzt Deutsch an die erste Stelle', () => {
    // Die Reihenfolge ist die ganze Aussage: `coalesce` nimmt den ersten Wert, der
    // da ist. Stünde `name` vorn, wäre alles wieder japanisch — und niemandem
    // fiele es auf, solange die Karte überhaupt Namen zeigt.
    expect(SPRACHFOLGE[0]).toBe('name_de');
    expect(SPRACHE[0]).toBe('coalesce');
    expect(SPRACHE.slice(1)).toEqual([
      ['get', 'name_de'],
      ['get', 'name:de'],
      ['get', 'name_en'],
      ['get', 'name:en'],
      ['get', 'name:latin'],
      ['get', 'name'],
    ]);
    // Beide Schreibweisen, und zwar gemessen: Im echten Stil kommt `name:de`
    // null Mal vor, `name_en` mit Unterstrich zwanzig Mal. Die alte Liste hat
    // den deutschen Namen unter einem Schlüssel gesucht, den es nicht gibt.
    const roh = JSON.stringify(echterStil());
    expect(roh).not.toContain('name:de');
    expect(roh).toContain('name_en');
  });

  it('behält den lokalen Namen als letzte Möglichkeit', () => {
    // Ein Ort ohne jede Umschrift soll seinen Namen behalten statt namenlos zu
    // sein: 大阪 zu lesen ist besser als einen leeren Punkt zu sehen.
    expect(SPRACHFOLGE[SPRACHFOLGE.length - 1]).toBe('name');
  });

  it('schreibt die Namensebenen um — und nur die', () => {
    const s = deutscheNamen(stil());
    for (const id of ['ort-stadt', 'ort-dorf', 'strasse-name']) {
      const l = s.layers.find((x) => x.id === id)!;
      expect(l.layout!['text-field'], `${id} nicht umgeschrieben`).toEqual(SPRACHE);
    }

    /*
     * Hier stand vorher `expect(texte).toHaveLength(3)` plus „jede Textebene
     * gleich SPRACHE". Diese Zusicherung hat das bedingungslose Überschreiben
     * nicht nur durchgewunken, sie hat es **verteidigt**: Eine schonende Fassung
     * wäre daran rot geworden. Jetzt wird das Gegenteil zugesichert.
     */
    const schild = s.layers.find((l) => l.id === 'schild')!;
    expect(schild.layout!['text-field']).toEqual(['to-string', ['get', 'ref']]);
    expect(beschriftung(schild.layout!['text-field'], { ref: 'E1' })).toBe('E1');
    // Und der Gegenbeweis, warum das nötig ist: Mit der Sprachfolge darauf
    // käme nichts heraus.
    expect(beschriftung(SPRACHE, { ref: 'E1' })).toBe('');

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

describe('Am echten Liberty-Stil', () => {
  /*
   * Die Zahlen stehen hier ausdrücklich. Frischt jemand den Schnappschuss auf
   * und der Anbieter hat seinen Stil umgebaut, fällt das hier auf, statt
   * durchzurutschen — das ist der Zweck, nicht ein Versehen.
   */
  it('hat keine einzige der Formen, die der Handstil geprüft hat', () => {
    const s = echterStil();
    expect(s.layers).toHaveLength(111);
    const texte = s.layers.filter((l) => l.layout && 'text-field' in l.layout);
    expect(texte).toHaveLength(23);
    for (const l of texte) {
      const f = l.layout!['text-field'];
      // Weder `['get', X]` noch ein Platzhalterstring — ausschließlich `case`
      // und `to-string`. Der alte Handstil kannte nur die beiden anderen.
      expect(typeof f, `${l.id} ist ein String`).not.toBe('string');
      expect((f as unknown[])[0], `${l.id}`).not.toBe('get');
      expect(['case', 'to-string']).toContain((f as unknown[])[0]);
    }
  });

  it('behält die drei ref-Schilder und schreibt die zwanzig Namensebenen um', () => {
    const s = deutscheNamen(echterStil());
    const schilder = s.layers.filter(
      (l) => l.layout && JSON.stringify(l.layout['text-field']) === '["to-string",["get","ref"]]',
    );
    expect(schilder.map((l) => l.id)).toEqual([
      'highway-shield-non-us',
      'highway-shield-us-interstate',
      'road_shield_us',
    ]);
    const umgeschrieben = s.layers.filter(
      (l) => l.layout && JSON.stringify(l.layout['text-field']) === JSON.stringify(SPRACHE),
    );
    expect(umgeschrieben).toHaveLength(20);
  });

  it('macht aus einem japanischen Ort einen lesbaren Namen', () => {
    const s = deutscheNamen(echterStil());
    const stadt = s.layers.find((l) => l.id === 'label_city')!;
    const feld = stadt.layout!['text-field'];

    // Der Fall, um den es geht: ein Ort mit japanischem Namen und lateinischer
    // Umschrift. Vorher stand auf der Karte „Tokyo\n東京" — zweizeilig, mit dem
    // japanischen Namen darunter.
    expect(beschriftung(feld, { name: '東京', 'name:latin': 'Tokyo' })).toBe('Tokyo');
    // Mit deutschem Namen gewinnt der.
    expect(beschriftung(feld, { name: '大阪', 'name:latin': 'Osaka', name_de: 'Ōsaka' })).toBe(
      'Ōsaka',
    );
    // Und ohne jede Umschrift bleibt der lokale Name stehen statt nichts.
    expect(beschriftung(feld, { name: '京都' })).toBe('京都');
    // Der Vollständigkeit halber der Ausgangszustand, damit der Gewinn belegt
    // ist und nicht behauptet: So sah dieselbe Beschriftung vorher aus.
    const vorher = echterStil().layers.find((l) => l.id === 'label_city')!.layout!['text-field'];
    expect(beschriftung(vorher, { name: '東京', 'name:latin': 'Tokyo', 'name:nonlatin': '東京' })).toBe(
      'Tokyo\n東京',
    );
  });

  it('erzeugt einen Ausdruck, den MapLibre annimmt', () => {
    /*
     * Die Prüfung, die bisher ganz gefehlt hat. `beschriftung()` wirft, wenn der
     * Ausdruck nicht übersetzbar ist — und ein Stil mit einem ungültigen
     * Ausdruck wird von MapLibre **komplett** verworfen: dann bleibt die Karte
     * leer, und man sucht den Fehler im Netz statt im Ausdruck.
     */
    const s = deutscheNamen(echterStil());
    for (const l of s.layers.filter((x) => x.layout && 'text-field' in x.layout)) {
      expect(() => beschriftung(l.layout!['text-field'], { name: 'x' }), l.id).not.toThrow();
    }
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
