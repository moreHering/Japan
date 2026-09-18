# Japan 2026 — Reiseplaner

Website zum Verwalten des Reiseplans für die Japanreise vom 26.09. bis 15.10.2026:
sechs Stationen, 19 Nächte, 164 Orte.

**Live:** https://morehering.github.io/Japan/

| Seite | Adresse | Zweck |
|---|---|---|
| Startseite | `/` | Tageszählung und **der Reiseband als Volltext** — elf Kapitel, direkt lesbar |
| Tagesplan | `/plan/` | 20 Reisetage — Orte zuordnen, sortieren, Notizen; warnt bei Schließtagen |
| Orte | `/orte/` | Alle Orte, filterbar, mit Karte im selben Bild; anlegen, bearbeiten, ausblenden |
| Organisation | `/organisation/` | Buchungen und Fristen, Budget in ¥/€, Packliste, Abgleich, Export/Import |
| Freundebuch | `/freundebuch/` | Steckbriefe und Fotostream der drei — **nur angemeldet** |
| Reisetagebuch | `/tagebuch/` | Dieselben Beiträge für Gäste, ohne Anmeldung — **nicht verlinkt**, siehe unten |
| Reiseband | `/reiseband.html` | Derselbe Text als geschlossenes Dokument zum Ausdrucken |

`/karte` leitet auf `/orte/` um — beides war früher getrennt und zeigte dieselben
Orte mit fast denselben Filtern, jeweils halb.

## Wo die Daten herkommen

Die Inhalte stammen aus zwei Quellen in `data/source/`, die **nicht von Hand
bearbeitet** werden sollten:

- `Japan-Reisefuehrer-2026.html` — der gestaltete Reiseband mit den ausführlichen
  Ortsbeschreibungen
- `Japan-Karte-2026.kml` — der Google-My-Maps-Export mit den Koordinaten

`npm run data` führt beide zusammen und erzeugt daraus:

- `src/data/places.json` — die 164 Orte mit Koordinaten, Texten und abgeleiteten
  Merkmalen (Freundestipp, Reservierung nötig, Schließtag, nur Bargeld)
- `public/reiseband.html` — der Reiseband als **Lesefassung**: Kapitelanker, ein
  Rückweg zur App, und ohne die nummerierten Ortslisten. Die stehen vollständig
  im Planer; an ihrer Stelle verweist je Station ein Block dorthin. Erhalten
  bleiben die Erzählung, die 16 Anker, alle Kästen, die Probier-Tabellen und die
  Einträge unter „Weitere Optionen — ohne Nummer" (die haben keine Koordinaten
  und stehen deshalb nirgends sonst)

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

**Der localStorage ist die Quelle, aus der die Oberfläche liest** — auch ohne Netz,
was in Japan nicht selbstverständlich ist. Darüber liegt ein Abgleich mit Supabase,
damit alle drei denselben Plan sehen.

Der Abgleich ist **warteschlangenbasiert**, nicht zustandsvergleichend: Jede
Änderung meldet, *welche Zeile* betroffen ist, und beim Senden wird deren aktueller
Wert gelesen. Ein Vergleich zweier Zustände könnte Löschungen nicht ausdrücken —
eine gestrichene Zeile sieht darin wie eine fehlende aus, und die käme beim
nächsten Abgleich zurück.

Die Naht liegt in zwei Dateien:
- `src/lib/store.svelte.ts` — der Zustand und die Meldung, *was* sich geändert hat
  (`Aenderung`). Diese Datei weiß nichts von Supabase.
- `src/lib/sync.svelte.ts` — die Warteschlange, das Senden und Holen, die
  Konfliktregel je Zeile.

Der Export über *Organisation → Als Datei exportieren* bleibt als Sicherungskopie.

### Anmeldung

Drei feste Konten (Paule, Deggel, Baldes) mit einem gemeinsamen Passwort. Angemeldet
wird über den **Namen**, nicht über eine Mailadresse — auf dem Handy tippt niemand
gern Adressen. Das Passwort steht ausschließlich als GitHub-Secret `ACCOUNT_PW`; im
Repository steht nur der Variablenname, denn dieses Repository ist öffentlich.

## Das Reisetagebuch für die Gäste

Unter `/tagebuch/` stehen die Beiträge des Freundebuchs **ohne Anmeldung** — als
vorzeigbares Reisetagebuch für Freunde, im Stil von Polarsteps, aber in der
Y2K-Optik des Freundebuchs.

**Was das heißt, unmissverständlich:** Der Supabase-Schlüssel steckt im JavaScript
der Seite und ist für jeden Besucher lesbar. „Für Gäste lesbar" heißt deshalb
*weltweit* lesbar, nicht „lesbar für wen wir den Link schicken". Der einzige Schutz
ist, dass die Adresse nicht verlinkt ist und die Bildpfade (`<uuid>/<uuid>.jpg`)
nicht zu raten sind. Ein `noindex` steht im Kopf der Seite, aber das ist eine Bitte
an gutwillige Crawler; Messenger holen sich Seite und erstes Bild, ohne zu fragen.

Und es ist nicht zurückzunehmen: Ein Bild, dessen Link einmal jemand hatte, ist
kopierbar. Ein späteres Abschalten entfernt das Original, nicht die Kopien.

**Öffentlich sind genau drei Tabellen:** `guestbook_post`, `guestbook_profile` und
`profiles` (dort nur `id`, `name`, `farbe`). Plan, Ausgaben, selbst angelegte Orte
und Korrekturen bleiben dicht — in `places_custom` stehen die Unterkünfte. Das hängt
an **zwei** unabhängigen Schranken: kein Tabellenrecht für die Rolle `anon` *und*
keine Policy. Nachzulesen im Kopf von `supabase/migrations/0008_oeffentlich.sql`.

Eine neue Tabelle in `public` bekommt in Supabase automatisch Vorgabe-Rechte für
`anon`. Der Migrationsworkflow prüft deshalb bei jedem Lauf generisch über den
Systemkatalog, dass es bei genau drei lesbaren Tabellen bleibt, und bricht sonst ab.

**Die dritte Schranke steckt im Auslieferungsartefakt:** Auf `/tagebuch/` gibt es
kein `input`, kein `textarea`, kein `form` und keinen Löschknopf, und die Seite
startet weder Anmeldung noch Abgleich (kein `SyncBadge`, kein Import von
`store.svelte`). Selbst bei einer falsch gesetzten Policy hätte ein Gast keine
Oberfläche. `test/browser-tagebuch.mjs` prüft genau das, und jede dieser
Zusicherungen ist gegengeprobt.

### Das gemeinsame Stylesheet `src/styles/y2k.css`

Freundebuch und Tagebuch teilen die Y2K-Optik, deshalb steht sie in einer Datei —
und damit **global, ohne Svelte-Hash**. Jeder Selektor beginnt mit `.y2k`; das
schützt vor fremden *Seiten*, aber nicht vor fremden *Komponenten* im selben Baum.

Genau das ist beim Herauslösen passiert: `.y2k .zeile`, `.y2k .hinweis` und
`.y2k .kasten b` griffen in `LoginPanel.svelte` hinein, das dieselben generischen
Namen benutzt und selbst stylt. Solange die Regeln im Komponenten-`<style>`
standen, endete ihre Reichweite am Hash. Diese vier sind deshalb an ihre Behälter
gebunden (`.y2k .unten > .zeile`, `.y2k .teil > .hinweis` und so fort). Eine neue
`.hinweis`-Stelle in einem anderen Behälter braucht einen Eintrag in der
Selektorliste — `test/y2k-css.test.ts` erzwingt, dass keine Regel eine Klasse einer
eingebetteten Komponente als Nachfahre trifft.

Und eine Warnung aus Erfahrung: Ein als „tot" gemeldeter Selektor kann in einer
gemeinsamen Selektorliste stehen. Das Löschen von `.neu select` hat den
Deklarationsblock von `.neu textarea, .neu input` mitgenommen — Rahmen, Polster und
die 16-px-Schrift gegen den iOS-Zoom waren weg, und gültiges CSS blieb es trotzdem.
Gefunden hat es `npm run test:suche` an der Höhe der Tippziele.

## Entwicklung

```bash
npm install
npm run data      # Quelldateien → places.json, reiseband.html, chapters.json, Lesefassung
npm run dev       # http://localhost:4321/Japan/
npm run build
npm run preview
```

### Prüfen

```bash
npm test          # vitest: Abgleich, Orte, Koordinaten, CSS-Bindung
npm run db:test   # Schema und Zugriffsregeln gegen lokalen Postgres, mit Gegenproben
npm run db:workflow   # die psql-Schritte des Migrationsworkflows gegen lokal
npm run db:regionen   # die Regionensuche des Workflows, ohne Netz
npm run test:all  # vitest plus die Browsertests (Dev-Server muss laufen)

# einzeln, wenn nur eine Ansicht betroffen ist:
npm run test:browser     # Orte und Karte
npm run test:suche       # Suche gegen die Filter, Bildwahl
npm run test:korrekturen # Orte bearbeiten und ausblenden
npm run test:band        # das Reiseband auf der Startseite
npm run test:buch        # Freundebuch, angemeldet
npm run test:tagebuch    # die öffentliche Gästeansicht
```

Die Browsertests laufen mit Playwright im iPhone-13-Format gegen den Dev-Server.
Sie prüfen, was nur ein Browser zeigt: Querscrollen, Größe der Tippziele,
Leaflet überhaupt.

Zwei Eigenheiten des Dev-Servers, über die man dabei stolpert: Er hängt eine
`astro-dev-toolbar` in die Seite, und darin stecken Eingabefelder und eine
Auswahlliste. Playwrights Selektoren durchstoßen Shadow-Grenzen und finden sie —
Prüfungen auf „kein `input` auf der Seite" laufen deshalb über
`document.querySelectorAll`. Und `MapView` setzt `zoomControl: !L.Browser.mobile`:
im iPhone-Profil gibt es keine Zoomknöpfe.

**Ein Muster, das sich durch alle Prüfungen zieht: zu jeder Reparatur gehört eine
Gegenprobe.** Erst wird die Reparatur wieder entfernt und geschaut, ob die Prüfung
anschlägt. Eine Prüfung, die bei kaputtem Code grün bleibt, ist schlimmer als
keine — sie beruhigt. `npm run db:test` führt das selbst aus und reißt fünf Löcher
in die Zugriffsregeln, um zu zeigen, dass sie auffallen.

Denselben Dienst leistet `supabase/test/local-auth-stub.sql`: Er bildet Supabase
nach, **auch dessen Unfreundlichkeiten**. Viermal war er großzügiger als das
Original, und jedes Mal ging der Fehler erst in Produktion auf — fehlende
Tokenspalten in `auth.users`, ein `auth.uid()`, das nur eine der beiden
Claimformen las, ein fehlendes storage-Schema samt Löschschutz, und
Vorgabe-Privilegien für `anon`, die es lokal nicht gab. Der Kopf der Datei führt
diese Liste; wer dort etwas nachbildet, bildet es streng nach.

**Eine Gegenprobe kann selbst blind sein**, und das ist hier mehrfach vorgekommen:

- Wer nur den Exitcode ansieht, hält jeden Fehlschlag für einen Treffer. Ein
  `--reporter=basic` (das es in vitest 5 nicht gibt) ließ den Lauf abstürzen, bevor
  eine Prüfung lief — die Gegenprobe meldete fünfmal Erfolg, ohne etwas zu prüfen.
  Gegenproben suchen deshalb nach dem **Namen** der fehlgeschlagenen Prüfung.
- Die Testdaten müssen die Zusicherung auf die Probe stellen. Die Prüfung „im Popup
  steckt kein rohes Markup" blieb grün, als die Maskierung entfernt war — in den
  Daten stand kein Markup. Jetzt trägt ein Beitrag ein `<script>` im Text und ein
  `<b>` im Ortsnamen.
- Die Erwartung darf nicht die Eingabereihenfolge sein. „Personen absteigend
  sortiert" blieb ohne `sort()` grün, weil die erwartete Liste schon die Eingabe war.
- Das Loch muss wirklich eines sein. Zweimal habe ich eine Zeile geändert, die im
  geprüften Pfad gar nicht lief, und daraus geschlossen, die Prüfung sei blind.

Astro 7 mit Svelte-5-Islands, Leaflet mit OpenStreetMap-Kacheln (kein API-Schlüssel
nötig). Die Karte wird ausschließlich mit `client:only="svelte"` eingebunden, weil
Leaflet kein serverseitiges Rendern verträgt.

Die Seite liegt unter `/Japan/`, nicht im Wurzelverzeichnis. Interne Links und
Assets deshalb immer über die Helfer in `src/lib/paths.ts` erzeugen — ein
hartkodiertes `/plan/` läuft in Produktion ins Leere.

## Veröffentlichen

Jeder Push auf `main` oder `claude/**` baut und deployt über
`.github/workflows/deploy.yml`.

**Einmalig nötig:** unter *Settings → Pages* als Quelle **GitHub Actions**
auswählen.

Der Build braucht vier Secrets unter *Settings → Secrets and variables → Actions*:
`SUPABASE_DB_PASSWORD`, `ACCOUNT_PW`, `PUBLIC_SUPABASE_URL`,
`PUBLIC_SUPABASE_ANON_KEY`. Fehlen die beiden `PUBLIC_*`, baut die Seite durch,
kann aber nicht abgleichen — sie ist dann reiner Gerätespeicher. Schritt für
Schritt steht das in `ANLEITUNG-DATENBANK.md`.

## Migrationen

Die Datenbank ist aus der Entwicklungsumgebung **nicht erreichbar** — gemessen,
nicht vermutet: `supabase.co` antwortet mit 403 am Proxy, `db.<ref>.supabase.co`
löst nur über IPv6 auf, die Pooler-Ports sind zu. Deshalb laufen die Migrationen
über `.github/workflows/migrate.yml`, wo freies Netz besteht.

Der Workflow wird bei Änderungen unter `supabase/migrations/**` ausgelöst und lässt
sich von Hand starten. Er sucht die Region des Projekts selbst; es genügt das
Datenbankpasswort. Erfolg heißt nicht „grün", sondern: alle Tabellen mit `rls = t`
und mindestens einer Policy, die drei Namen in `profiles`, die Bilderablage
vorhanden, und für die Gästesicht genau drei lesbare Tabellen ohne Schreibrecht.

Jede Migration ist idempotent und läuft bei **jedem** Lauf mit. Vorher lokal prüfen
mit `npm run db:test` — die CI ist nicht das Testfeld.
