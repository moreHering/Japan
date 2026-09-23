/**
 * Prüft die Arbeitsliste der Orte — vor allem, dass die erledigten
 * Übernachtungsvorschläge wirklich draußen sind und nichts anderes mit ihnen.
 */

import { describe, expect, it } from 'vitest';
import { alleOrte, places, placeByNr, CATEGORIES } from '../src/lib/places';
import stationen from '../src/data/stations.json';

describe('Übernachtungen', () => {
  it('nimmt die erledigten Vorschläge aus der Arbeitsliste', () => {
    const vorschlaege = alleOrte.filter((p) => p.uebernachtung === 'vorschlag');
    expect(vorschlaege).toHaveLength(23);
    // Keiner davon steht noch in der Liste, mit der die App arbeitet.
    for (const v of vorschlaege) {
      expect(places.some((p) => p.nr === v.nr)).toBe(false);
    }
    expect(places).toHaveLength(alleOrte.length - 23);
  });

  it('behält die gebuchte Unterkunft und kennzeichnet sie', () => {
    const gebucht = places.filter((p) => p.uebernachtung === 'gebucht');
    expect(gebucht).toHaveLength(1);
    expect(gebucht[0].nr).toBe(147);
    expect(gebucht[0].station).toBe('tokio');
  });

  it('behält einen Ort, der gar keine Übernachtung ist', () => {
    // Nr. 164 führt das Reiseband unter Übernachten, ist aber ein Tages-Onsen
    // nach der Wanderung — also etwas zu tun, kein Bett.
    const takao = places.find((p) => p.nr === 164);
    expect(takao).toBeDefined();
    expect(takao!.uebernachtung).toBeUndefined();
  });

  it('lässt keinen einzigen Ryokan-Vorschlag übrig', () => {
    // Übrig bleiben dürfen nur die zwei Tages-Onsen (164, 172 — kein Bett) und
    // die Empfehlung für die noch ungebuchte Nacht am Kawaguchi-See (177).
    const uebrig = places.filter(
      (p) =>
        p.category === 'hotel' && p.uebernachtung !== 'gebucht' && ![164, 172, 177].includes(p.nr),
    );
    expect(uebrig.map((p) => `${p.nr} ${p.name}`)).toEqual([]);
  });

  it('zeigt die Empfehlung für Kawaguchiko, ohne sie als gebucht auszugeben', () => {
    // Ausgeblendet stünde für die Nacht 07./08.10. gar keine Unterkunft in der
    // App; als „gebucht" behauptete die App etwas, das nicht stimmt.
    const ooike = places.find((p) => p.nr === 177);
    expect(ooike?.name).toContain('Ooike');
    expect(ooike?.uebernachtung).toBeUndefined();
  });

  it('findet ausgeblendete Orte weiterhin über ihre Nummer', () => {
    // Die Nummern stehen gedruckt im Reiseband — sie müssen etwas finden,
    // auch wenn die App den Ort nicht mehr anbietet.
    const ekoin = placeByNr(35);
    expect(ekoin?.name).toContain('Eko-in');
    expect(ekoin?.uebernachtung).toBe('vorschlag');
  });

  it('lässt die übrigen Kategorien unangetastet', () => {
    const zaehlung = Object.fromEntries(
      CATEGORIES.map((c) => [c.key, places.filter((p) => p.category === c.key).length]),
    );
    // Seit dem Mietwagen-Plan +5 Kultur, +1 Essen, +9 Natur und die zwei
    // sichtbaren Übernachten-Orte der Straße (172 Tages-Onsen, 177 Empfehlung).
    expect(zaehlung).toEqual({ kultur: 59, essen: 36, natur: 35, shop: 24, hotel: 4 });
  });

  it('hat für jede Station eine gebuchte Unterkunft — sonst wäre das Ausblenden falsch', () => {
    for (const s of stationen) {
      expect(s.stay, `${s.name} ohne Unterkunft`).toBeTruthy();
    }
  });
});

describe('Eigene Unterkunft', () => {
  it('merkt sich den Haken und zieht die Kategorie nach', async () => {
    const { plan, ortAnlegen, ortAendern, uebernehmeFremdstand } = await import(
      '../src/lib/store.svelte'
    );
    uebernehmeFremdstand({});

    const nr = ortAnlegen({
      name: 'Ryokan Sumiyoshiya',
      category: 'hotel',
      station: 'kanazawa',
      stationLabel: 'Kanazawa',
      area: 'zentrum',
      lat: 36.5735,
      lng: 136.6588,
      unterkunft: true,
    });

    const ort = plan.customPlaces.find((p) => p.nr === nr)!;
    expect(ort.uebernachtung).toBe('gebucht');

    // Der Haken lässt sich auch wieder wegnehmen.
    ortAendern(nr, { unterkunft: false });
    expect(plan.customPlaces.find((p) => p.nr === nr)!.uebernachtung).toBeUndefined();

    // Und eine Änderung, die den Haken nicht erwähnt, lässt ihn stehen.
    ortAendern(nr, { unterkunft: true });
    ortAendern(nr, { name: 'Ryokan Sumiyoshiya (Kanazawa)' });
    expect(plan.customPlaces.find((p) => p.nr === nr)!.uebernachtung).toBe('gebucht');

    uebernehmeFremdstand({});
  });
});
