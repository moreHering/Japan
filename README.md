# Japan 2026 — Reiseplaner

Website zum Verwalten des Reiseplans für die Japanreise vom 26.09. bis 15.10.2026:
sechs Stationen, 19 Nächte, 164 Orte.

**Live:** https://morehering.github.io/Japan/

| Seite | Zweck |
|---|---|
| Übersicht | Route, Etappen, Countdown, Planungsfortschritt |
| Tagesplan | 20 Reisetage — Orte zuordnen, sortieren, Notizen; warnt bei Schließtagen |
| Orte | Alle 164 Orte, filterbar, mit Karte |
| Karte | Vollbildkarte mit Kategorie-Layern und Tagesansicht |
| Organisation | Buchungen und Fristen, Budget in ¥/€, Packliste, Export/Import |
| Reiseband | Der ursprüngliche Reiseführer, unverändert |

## Wo die Daten herkommen

Die Inhalte stammen aus zwei Quellen in `data/source/`, die **nicht von Hand
bearbeitet** werden sollten:

- `Japan-Reisefuehrer-2026.html` — der gestaltete Reiseband mit den ausführlichen
  Ortsbeschreibungen
- `Japan-Karte-2026.kml` — der Google-My-Maps-Export mit den Koordinaten

`npm run data` führt beide zusammen und erzeugt daraus:

- `src/data/places.json` — die 164 Orte mit Koordinaten, Texten und abgeleiteten
  Merkmalen (Freundestipp, Reservierung nötig, Schließtag, nur Bargeld)
- `public/reiseband.html` — der Reiseband, ergänzt um Kapitelanker und einen
  Rückweg zur App; inhaltlich unverändert

Das Skript prüft sein Ergebnis gegen feste Erwartungswerte (164 Orte, lückenlose
Nummern, Kategorieverteilung 54/35/26/25/24, sieben Freundestipps) und bricht bei
Abweichung ab, statt stillschweigend falsche Daten zu schreiben.

**Zwei Eigenheiten der Quelldaten**, die das Skript behandelt:

1. Amazake-chaya steht im Reiseband zweimal — als Nr. 95 und Nr. 96. Im KML tragen
   beide Einträge fälschlich die Nummer 096. Das Skript ordnet sie über den Namen
   zu und meldet die Korrektur. Beide Nummern bleiben erhalten, weil sie im Buch
   gedruckt sind; auf der Karte werden die Marker leicht versetzt gezeichnet.
2. Die Nummer allein bestimmt Station und Bereich — die KML-Ordner sind lückenlos
   nach Nummernblöcken sortiert (Osaka 1–38, Kyoto 39–67, Kanazawa 68–78,
   Takayama 79–91, Hakone 92–106, Tokio 107–164).

Von Hand gepflegt werden nur die kleinen Stammdaten: `src/data/stations.json`,
`legs.json`, `trip.json`, `bookings.json` und `packing.json`.

## Wo der Plan gespeichert wird

**Im localStorage des Browsers — es gibt keinen Server und keinen Abgleich
zwischen Geräten.** Wer auf dem Handy plant, hat das Ergebnis nicht automatisch
auf dem Laptop. Der Weg dazwischen führt über *Organisation → Als Datei
exportieren* und auf dem anderen Gerät über *Datei einlesen*.

Der gesamte Zugriff darauf liegt in `src/lib/store.svelte.ts`. Wenn ein echter
Abgleich gewünscht ist, wird dort ein Backend-Adapter eingesetzt — die
Oberfläche muss dafür nicht angefasst werden.

## Entwicklung

```bash
npm install
npm run data      # Quelldateien → places.json + reiseband.html
npm run dev       # http://localhost:4321/Japan/
npm run build
npm run preview
```

Astro 7 mit Svelte-5-Islands, Leaflet mit OpenStreetMap-Kacheln (kein API-Schlüssel
nötig). Die Karte wird ausschließlich mit `client:only="svelte"` eingebunden, weil
Leaflet kein serverseitiges Rendern verträgt.

Die Seite liegt unter `/Japan/`, nicht im Wurzelverzeichnis. Interne Links und
Assets deshalb immer über die Helfer in `src/lib/paths.ts` erzeugen — ein
hartkodiertes `/plan/` läuft in Produktion ins Leere.

## Veröffentlichen

Jeder Push auf `main` baut und deployt über `.github/workflows/deploy.yml`.

**Einmalig nötig:** unter *Settings → Pages* als Quelle **GitHub Actions**
auswählen.
