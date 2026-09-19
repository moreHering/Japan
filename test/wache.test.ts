/**
 * Die Prüfregeln aus `src/lib/wache.ts`.
 *
 * Hier liegt der Beweiswert der Selbstprüfseite, denn `wache.ts` ist reine Logik:
 * Orte kommen herein, Befunde gehen hinaus, kein DOM, kein Zustand. Was in
 * `Wache.svelte` bleibt, ist Anzeige und von hier aus nicht prüfbar.
 *
 * **Die zwei Prüfungen, die man vergisst, stehen zuerst.** Eine Prüfseite, die bei
 * sauberem Bestand Alarm zeigt, wird nach drei Tagen nicht mehr gelesen — und dann
 * ist sie schlimmer als keine, weil man sich auf sie verlassen zu können glaubt.
 * Deshalb: sauberer Bestand gibt eine leere Liste, und die sechs benannten
 * Tagesausflüge geben keinen Befund.
 */

import { describe, expect, it } from 'vitest';
import {
  AUSFLUEGE,
  befundZusammenfassung,
  km,
  naechsteStation,
  pruefeOrte,
  REISERAHMEN,
  type Station,
} from '../src/lib/wache';
import { alleOrte, type Place } from '../src/lib/places';
import stationenRoh from '../src/data/stations.json';

const stationen = stationenRoh as unknown as Station[];

/** Ein unauffälliger Ort in Osaka, als Ausgangspunkt für jede Abwandlung. */
function ort(ueber: Partial<Place> = {}): Place {
  return {
    nr: 900,
    name: 'Prüfort',
    category: 'kultur',
    station: 'osaka',
    stationLabel: 'Osaka · Zentrum',
    area: 'zentrum',
    lat: 34.6873,
    lng: 135.5259,
    placeId: null,
    descriptionHtml: 'Ein Text.',
    isFriendTip: false,
    needsBooking: false,
    closedDay: null,
    cashOnly: false,
    ...ueber,
  } as Place;
}

const titel = (b: ReturnType<typeof pruefeOrte>) => b.map((x) => x.titel).join(' | ');

describe('Der saubere Fall', () => {
  it('gibt bei den echten 164 Orten keinen einzigen Befund', () => {
    /*
     * Die wichtigste Prüfung dieser Datei. Sie ist auch die, die bei einer
     * Regeländerung zuerst anschlägt — und dann ist die Frage, ob die Regel zu
     * streng ist oder die Daten falsch. Beides will man wissen.
     *
     * Insbesondere dürfen Amazake-chaya (Nr. 95 und 96, zwei Nummern aus dem
     * gedruckten Band für eine Adresse) **keinen** Dublettenhinweis erzeugen:
     * `sameSpotAs` kennzeichnet sie.
     */
    const b = pruefeOrte(alleOrte, stationen);
    expect(titel(b)).toBe('');
    expect(befundZusammenfassung(b)).toBe('keine Beanstandung');
  });

  it('meldet die sechs benannten Tagesausflüge nicht', () => {
    /*
     * Ohne die Ausnahmeliste wären Nara (59, 61, 66), Iga-Ueno (21, 22) und
     * Ainokura (88) Dauergäste in der Befundliste — sechs Meldungen, die man
     * wegzuklicken lernt, und damit sind die echten sechs Meldungen daneben auch
     * weg. Geprüft wird ausdrücklich, dass die Regel sie **kennt** und nicht, dass
     * sie zufällig durchfallen.
     */
    for (const nr of Object.keys(AUSFLUEGE).map(Number)) {
      const o = alleOrte.find((x) => x.nr === nr);
      expect(o, `Nr. ${nr} steht in AUSFLUEGE, aber nicht in den Orten`).toBeDefined();
      expect(titel(pruefeOrte([o!], stationen))).toBe('');
    }
  });

  it('hält die Ausnahmeliste aktuell — jeder Eintrag verletzt die Regel wirklich', () => {
    /*
     * Die Prüfung, die den Test darüber davor schützt, wertlos zu werden.
     *
     * Wird eine Koordinate korrigiert, sodass ein Ausflug plötzlich doch bei seiner
     * eigenen Station liegt, bleibt der Eintrag hier stehen und deckt von dann an
     * einen echten Fehler mit. Eine Ausnahmeliste, die niemand aufräumt, wird zur
     * Generalerlaubnis — also muss jeder Eintrag seine Berechtigung laufend
     * nachweisen.
     */
    const ueberfluessig = Object.keys(AUSFLUEGE)
      .map(Number)
      .filter((nr) => {
        const o = alleOrte.find((x) => x.nr === nr);
        return !o || naechsteStation(o, stationen).slug === o.station;
      });
    expect(
      ueberfluessig,
      `nicht mehr nötig und verdeckt künftige Fehler: ${ueberfluessig.join(', ')}`,
    ).toEqual([]);
  });
});

describe('Die Koordinate', () => {
  it('meldet ein vertauschtes Paar als Fehler', () => {
    // Der häufigste Tippfehler: beide Zahlen echt, in der falschen Spalte. Der Ort
    // landet damit im Meer vor Somalia.
    const b = pruefeOrte([ort({ lat: 135.5259, lng: 34.6873 })], stationen);
    expect(b[0].schwere).toBe('fehler');
    expect(b[0].titel).toMatch(/nicht in Japan/);
    expect(b[0].was).toMatch(/vertauscht/);
  });

  it('meldet eine fehlende oder null-Koordinate als Fehler', () => {
    for (const abwandlung of [{ lat: 0 }, { lng: 0 }, { lat: Number.NaN }]) {
      const b = pruefeOrte([ort(abwandlung)], stationen);
      expect(b[0]?.schwere, JSON.stringify(abwandlung)).toBe('fehler');
      expect(b[0].titel).toMatch(/keine brauchbare Koordinate/);
    }
  });

  it('rechnet bei einer kaputten Koordinate nicht weiter', () => {
    // Ohne das `continue` in `pruefeOrte` liefe die Stationsprüfung mit NaN weiter
    // und meldete zusätzlich Unsinn — zwei Befunde für einen Fehler, und der
    // zweite verwirrt mehr als er hilft.
    const b = pruefeOrte([ort({ lat: Number.NaN })], stationen);
    expect(b).toHaveLength(1);
  });

  it('warnt bei einer Koordinate in Japan, aber außerhalb der Reiseroute', () => {
    // Sapporo: echte Koordinate, in Japan, `inJapan()` lässt sie durch. Nur der
    // engere Reiserahmen fängt sie.
    const b = pruefeOrte([ort({ lat: 43.0618, lng: 141.3545 })], stationen);
    expect(b[0].schwere).toBe('warnung');
    expect(b[0].titel).toMatch(/außerhalb der Reiseroute/);
  });

  it('lässt die vier Ecken des Reiserahmens gerade noch durch', () => {
    // Die Grenzen sind inklusiv gemeint. Eine Prüfung, die genau auf der Grenze
    // anschlägt, meldet später einen neuen Ort in Himeji als Fehler.
    const ecken = [
      { lat: REISERAHMEN.latVon, lng: REISERAHMEN.lngVon },
      { lat: REISERAHMEN.latBis, lng: REISERAHMEN.lngBis },
    ];
    for (const e of ecken) {
      const b = pruefeOrte([ort({ ...e, station: 'abseits' })], stationen);
      expect(titel(b), JSON.stringify(e)).not.toMatch(/außerhalb der Reiseroute/);
    }
  });
});

describe('Ort und Station', () => {
  it('warnt, wenn ein Osaka-Ort auf einer Tokio-Koordinate liegt', () => {
    /*
     * Der teuerste Fehler und der Grund für diese ganze Datei: Beide Zahlen sind
     * echt, beide liegen in Japan, beide im Reiserahmen. Keine Grenze fängt das —
     * nur der Vergleich mit der Station.
     */
    const b = pruefeOrte([ort({ lat: 35.6812, lng: 139.7671 })], stationen);
    expect(b[0].schwere).toBe('warnung');
    expect(b[0].titel).toMatch(/näher an tokio als an osaka/);
    expect(b[0].was).toMatch(/km statt/);
  });

  it('schweigt bei einer Station, die es nicht gibt', () => {
    // Ein unbekannter Slug ist ein anderer Fehler, und den prüft
    // `orte-plausibel.test.ts` an den Dateien. Hier würde die Stationsprüfung sonst
    // jeden eigenen Ort mit Station „abseits" anmeckern — und `abseits` ist gewollt.
    const b = pruefeOrte([ort({ station: 'abseits' })], stationen);
    expect(titel(b)).not.toMatch(/näher an/);
  });
});

describe('Was nur auf dem Gerät vorkommt', () => {
  it('meldet einen eigenen Ort mit vorläufiger Nummer als Fehler', () => {
    /*
     * Der wertvollste Befund überhaupt, und einer, den sonst **nichts** bemerkt:
     * Eine negative Nummer heißt, dieses Gerät hat den Ort angelegt und nie
     * abgeglichen. Die Unterkunft steht damit auf keinem der beiden anderen
     * Telefone — und das merkt man erst, wenn jemand anders sie sucht.
     */
    const eigen = ort({ nr: -1, name: 'Unsere Wohnung', eigen: true, vorlaeufig: true } as never);
    const b = pruefeOrte([eigen], stationen);
    expect(b[0].schwere).toBe('fehler');
    expect(b[0].titel).toMatch(/keine endgültige Nummer/);
    expect(b[0].was).toMatch(/abgleichen/);
  });

  it('meldet einen eigenen Ort mit vergebener Nummer nicht', () => {
    const eigen = ort({ nr: 165, eigen: true, vorlaeufig: false } as never);
    expect(titel(pruefeOrte([eigen], stationen))).toBe('');
  });

  it('warnt bei einem Ort ohne Namen', () => {
    const b = pruefeOrte([ort({ name: '   ' })], stationen);
    expect(b[0].schwere).toBe('warnung');
    expect(b[0].titel).toMatch(/keinen Namen/);
  });

  it('gibt einen Hinweis bei zwei Orten auf demselben Punkt', () => {
    const a = ort({ nr: 901 });
    const b = ort({ nr: 902, name: 'Zweimal angelegt' });
    const befunde = pruefeOrte([a, b], stationen);
    expect(befunde).toHaveLength(1);
    expect(befunde[0].schwere).toBe('hinweis');
    expect(befunde[0].titel).toMatch(/liegt genau auf Nr. 901/);
  });

  it('schweigt, wenn die Dublette über sameSpotAs bekannt ist', () => {
    // Amazake-chaya trägt aus dem gedruckten Band zwei Nummern für eine Adresse.
    // Ohne diese Ausnahme stünde der Hinweis dauerhaft auf der Seite.
    const a = ort({ nr: 95, sameSpotAs: [96] } as never);
    const b = ort({ nr: 96, sameSpotAs: [95] } as never);
    expect(titel(pruefeOrte([a, b], stationen))).toBe('');
  });
});

describe('Die Zusammenfassung für die Kopfzeile', () => {
  it('nennt keine Beanstandung, wenn es keine gibt', () => {
    expect(befundZusammenfassung([])).toBe('keine Beanstandung');
  });

  it('zählt nach Schwere und beugt richtig', () => {
    /*
     * `station: 'abseits'` bei den zwei Warnorten, und das ist der Punkt: Der erste
     * Entwurf dieses Tests nahm dreimal Osaka und erwartete „1 Fehler, 2
     * Warnungen". Gekommen sind fünf — jeder Ort außerhalb des Rahmens löst
     * **zwei** Befunde aus, den Rahmen *und* die Station. Der Code hatte recht, die
     * Erwartung war falsch. Mit einer Station, die es nicht gibt, entfällt die
     * Stationsprüfung, und jeder Ort trägt genau einen Befund bei — nur so prüft
     * dieser Test die Zählung und nicht seine eigene Arithmetik.
     */
    const b = pruefeOrte(
      [
        ort({ nr: 901, lat: 135, lng: 34, station: 'abseits' }), // Fehler: nicht in Japan
        ort({ nr: 902, lat: 43.06, lng: 141.35, station: 'abseits' }), // Warnung: Sapporo
        ort({ nr: 903, lat: 33.59, lng: 130.4, station: 'abseits' }), // Warnung: Fukuoka
      ],
      stationen,
    );
    expect(b.filter((x) => x.schwere === 'fehler')).toHaveLength(1);
    expect(b.filter((x) => x.schwere === 'warnung')).toHaveLength(2);
    expect(befundZusammenfassung(b)).toBe('1 Fehler, 2 Warnungen');
  });

  it('beugt den Einzahlfall', () => {
    const b = pruefeOrte([ort({ lat: 43.06, lng: 141.35, station: 'abseits' })], stationen);
    expect(befundZusammenfassung(b)).toBe('1 Warnung');
  });

  it('sortiert die Befunde schwerste zuerst', () => {
    /*
     * Unterwegs liest man die erste Zeile. Steht dort eine Warnung, während unten
     * ein Fehler wartet, ist die Reihenfolge das Problem.
     *
     * Die **Reihenfolge der Eingabe ist hier entscheidend**: Der Warnort steht
     * vorn, der Fehlerort hinten. Ohne das wäre die Prüfung zahnlos — genau daran
     * ist die erste Fassung gescheitert: Sie stellte den Fehlerort an den Schluss,
     * die Dublettenprüfung läuft aber ohnehin erst nach der Hauptschleife, und
     * damit stand der Fehler auch unsortiert vorn. Die Gegenprobe (Sortierung
     * entfernt) schwieg.
     */
    const b = pruefeOrte(
      [
        ort({ nr: 901, lat: 43.06, lng: 141.35, station: 'abseits' }), // Warnung
        ort({ nr: 902, lat: 135, lng: 34, station: 'abseits' }), // Fehler
      ],
      stationen,
    );
    expect(b.map((x) => x.schwere)).toEqual(['fehler', 'warnung']);
  });
});

describe('Die Entfernungsrechnung', () => {
  it('rechnet Osaka–Tokio auf die bekannte Größenordnung', () => {
    // Luftlinie Osaka–Tokio sind rund 400 km. Eine Haversine-Formel mit
    // vertauschten Argumenten oder fehlender Gradumrechnung läge um Faktoren
    // daneben, und das würde hier auffallen.
    const d = km(34.6857, 135.5055, 35.6812, 139.7671);
    expect(d).toBeGreaterThan(380);
    expect(d).toBeLessThan(420);
  });

  it('gibt für denselben Punkt null', () => {
    expect(km(34.6857, 135.5055, 34.6857, 135.5055)).toBeCloseTo(0, 6);
  });

  it('findet zu einer Koordinate die nächste Station', () => {
    expect(naechsteStation({ lat: 35.6812, lng: 139.7671 }, stationen).slug).toBe('tokio');
    expect(naechsteStation({ lat: 36.5613, lng: 136.6562 }, stationen).slug).toBe('kanazawa');
  });
});
