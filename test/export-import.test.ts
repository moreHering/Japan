/**
 * Export und Import des Plans — der Umlauf muss verlustfrei sein.
 *
 * Anlass ist ein Fehler, den ich beim Erweitern des Exports gefunden habe:
 * `exportJson()` schrieb die Ortskorrekturen mit (es serialisiert `...plan`),
 * `importJson()` übernahm sie **nicht**. Ein Export-Import-Umlauf verlor damit
 * jede Korrektur, und zwar stillschweigend — die Datei enthielt sie, der Plan
 * danach nicht mehr. Aufgefallen ist es nicht durch eine Meldung, sondern beim
 * Lesen.
 *
 * Für eine Reise ist genau das der teure Fall: Eine korrigierte Koordinate ist der
 * Unterschied zwischen dem richtigen Lokal und einem Punkt zwei Straßen weiter, und
 * wer eine Sicherung zurückspielt, erwartet sie zurück.
 *
 * Geprüft wird deshalb nicht „Import funktioniert", sondern **Feld für Feld, dass
 * nichts fehlt** — und zwar aus dem Typ abgeleitet, damit ein künftiges neues Feld
 * im `PlanState` die Prüfung anschlagen lässt, statt wieder unbemerkt zu
 * verschwinden.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { exportJson, importJson, plan, resetAll } from '../src/lib/store.svelte';

/**
 * Vergleich mit sortierten Schlüsseln.
 *
 * Ein schlichtes `JSON.stringify` war hier falsch: `normalize()` baut die Objekte
 * neu auf und legt die Eigenschaften in anderer Reihenfolge ab — bei einem eigenen
 * Ort stehen danach `eigen`, `vorlaeufig`, `angelegtVon` vorn. Inhaltlich ist
 * nichts verändert, aber die Zeichenkette ist eine andere, und die erste Fassung
 * dieser Prüfung hat das als Verlust gemeldet. Ein Test, der bei richtigem
 * Verhalten anschlägt, ist genauso unbrauchbar wie einer, der bei falschem
 * schweigt — nur lauter.
 */
function stabil(wert: unknown): string {
  return JSON.stringify(wert, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** Ein Plan mit in jedem Feld etwas drin, damit ein Verlust sichtbar wird. */
function befuellen() {
  plan.days = { '2026-09-27': { placeNrs: [8, 15], note: 'Regentag' } };
  plan.done = [3, 8];
  plan.bookings = { 'nohi-bus': true };
  plan.packing = { bargeld: true };
  plan.packingExtra = ['Luftpolsterfolie'];
  plan.expenses = [
    { id: 'e1', date: '2026-09-27', label: 'Ramen', yen: 1200, payer: 'Paule', station: 'osaka' },
  ];
  plan.customPlaces = [
    {
      nr: 165,
      name: 'Eigene Unterkunft',
      category: 'hotel',
      station: 'kanazawa',
      stationLabel: 'Kanazawa · Zentrum',
      area: 'zentrum',
      lat: 36.56,
      lng: 136.65,
      placeId: null,
      descriptionHtml: 'Von Hand ergänzt.',
      isFriendTip: false,
      needsBooking: false,
      closedDay: null,
      cashOnly: false,
      eigen: true,
      vorlaeufig: false,
      angelegtVon: null,
    },
  ];
  plan.korrekturen = {
    '8': { nr: 8, lat: 34.7, lng: 135.5, versteckt: false, schlagworte: ['regentag'] },
    '15': { nr: 15, versteckt: true, schlagworte: [] },
  };
}

describe('Export und Import', () => {
  beforeEach(() => {
    resetAll();
  });

  it('bringt jedes Feld des Plans zurück', () => {
    /*
     * Die Felder werden aus dem **exportierten** Objekt abgeleitet und nicht
     * aufgezählt. Kommt später ein Feld in den `PlanState`, taucht es im Export auf
     * und muss diese Prüfung bestehen — genau das hat bei `korrekturen` gefehlt.
     *
     * Ausgenommen sind nur die zwei Felder, die der Import absichtlich neu setzt:
     * `updatedAt` ist der Zeitpunkt der Änderung, `exportedAt` gehört zur Datei.
     */
    befuellen();
    const datei = exportJson();
    const vorher = JSON.parse(datei);

    resetAll();
    /*
     * Diese Zeile hat einen **zweiten** Fehler derselben Sorte gefunden:
     * `resetAll()` setzte `korrekturen` auch nicht zurück. „Alles zurücksetzen"
     * ließ jede Ausblendung und jede verschobene Koordinate stehen — und man
     * drückt den Knopf gerade dann, wenn man einen sauberen Anfang braucht.
     */
    expect(plan.korrekturen).toEqual({});

    const ergebnis = importJson(datei);
    expect(ergebnis.ok).toBe(true);

    const nachher = JSON.parse(exportJson());
    const auslassen = new Set(['updatedAt', 'exportedAt', 'version']);
    const fehlt: string[] = [];
    for (const feld of Object.keys(vorher)) {
      if (auslassen.has(feld)) continue;
      if (stabil(nachher[feld]) !== stabil(vorher[feld])) fehlt.push(feld);
    }
    expect(fehlt, `nach dem Umlauf verändert oder verloren: ${fehlt.join(', ')}`).toEqual([]);
  });

  it('bringt insbesondere die Ortskorrekturen zurück', () => {
    // Derselbe Sachverhalt ausdrücklich benannt, damit die Fehlermeldung bei einem
    // Rückfall sofort sagt, worum es geht — die Prüfung oben nennt nur „korrekturen".
    befuellen();
    const datei = exportJson();
    resetAll();
    importJson(datei);

    expect(Object.keys(plan.korrekturen).sort()).toEqual(['15', '8']);
    expect(plan.korrekturen['8'].lat).toBe(34.7);
    expect(plan.korrekturen['8'].schlagworte).toEqual(['regentag']);
    // Und die Ausblendung, die für die Orte-Liste entscheidet, ob ein Ort da ist.
    expect(plan.korrekturen['15'].versteckt).toBe(true);
  });

  it('lässt einen kaputten Inhalt den Plan nicht anfassen', () => {
    // Eine halbe Wiederherstellung wäre schlimmer als keine.
    befuellen();
    const vorher = exportJson();
    expect(importJson('das ist kein JSON').ok).toBe(false);
    // `toEqual` ist bei Objektschlüsseln reihenfolgeunabhängig — hier also richtig.
    expect(JSON.parse(exportJson()).korrekturen).toEqual(JSON.parse(vorher).korrekturen);
    expect(JSON.parse(exportJson()).days).toEqual(JSON.parse(vorher).days);
  });

  it('nennt den Zeitpunkt der Datei, ohne ihn zurückzuspielen', () => {
    // `exportedAt` beschreibt die Datei, nicht den Plan. Würde er mit importiert,
    // stünde in einem frisch eingelesenen Plan ein Änderungszeitpunkt, an dem
    // nichts geändert wurde — und der Abgleich zwischen den Geräten hängt daran.
    befuellen();
    const datei = JSON.parse(exportJson());
    expect(typeof datei.exportedAt).toBe('string');
    resetAll();
    importJson(JSON.stringify(datei));
    expect((plan as unknown as Record<string, unknown>).exportedAt).toBeUndefined();
  });
});
