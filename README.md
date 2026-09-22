# Japan 2026 — Reiseplaner

Website zum Verwalten des Reiseplans für die Japanreise vom 26.09. bis 15.10.2026:
sechs Stationen, 19 Nächte, 164 Orte.

**Live:** https://morehering.github.io/Japan/

| Seite | Adresse | Zweck |
|---|---|---|
| Startseite | `/` | Tageszählung, **der Reiseband als Akkordeon** — elf aufklappbare Kapitel — und die sechs Stationen |
| Tagesplan | `/plan/` | 20 Reisetage — Orte zuordnen, sortieren, Notizen; warnt bei Schließtagen; am Umzugstag Etappe und Buchungsstand der Fahrt |
| Orte | `/orte/` | Alle Orte, filterbar, mit Karte im selben Bild; anlegen, bearbeiten, ausblenden; KML-Download |
| Organisation | `/organisation/` | Buchungen und Fristen, Budget in ¥/€, Packliste, Abgleich, Export/Import |
| Freundebuch | `/freundebuch/` | Steckbriefe und Fotostream der drei — **nur angemeldet** |
| Reisetagebuch | `/tagebuch/` | Dieselben Beiträge für Gäste, ohne Anmeldung — **nicht verlinkt**, siehe unten |
| Selbstprüfung | `/wache/` | Was **dieses Gerät** über sich sagen kann — **nicht verlinkt**, erreichbar über Organisation |
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

## Fünf Layout-Vorlagen für Beiträge

Ein Beitrag im Freundebuch trug bis zum 22.09.2026 **genau ein Bild**, immer im
Verhältnis 4:3. Für ein Polaroid ist das richtig; ein Torii im Hochformat wurde
darin oben und unten abgeschnitten, eine Küstenlinie seitlich, und vier Bilder von
einem Abend wurden vier Beiträge.

| id | Bilder | Form |
|---|---|---|
| `polaroid` | 1 | 4:3, Text darunter — **Vorgabe**, das Aussehen aller alten Beiträge |
| `hochkant` | 1 | 3:4 |
| `panorama` | 1 | 16:9, über die ganze Breite des Stroms |
| `streifen` | 2–3 | nebeneinander |
| `collage` | 2–4 | 2×2-Raster |

Gewählt wird von Hand, fünf Knöpfe im Formular nach dem Muster der Aufkleberwahl.
Die Liste steht in `src/lib/vorlagen.ts`, in der Datenbank ist `vorlage` ein
freies `text` ohne Enum — dasselbe Muster wie `sticker`, und eine sechste Vorlage
kostet damit keine Migration. `vorlageVon()` fällt bei `null` **und** bei einem
unbekannten Wert auf Polaroid zurück: Ein Beitrag, den ein Gerät mit neuerer
Fassung anlegt, muss auf einem mit älterer Fassung sichtbar bleiben.

**Gerendert wird an einer Stelle**, nicht an zwei: `Bildfeld.svelte` benutzen
Freundebuch und Gästeansicht gemeinsam. Sie enthält **kein** `input`, `form` oder
`button` — die Gästeseite verspricht, nichts Bedienbares zu tragen — und **keinen**
`<style>`-Block, weil ihre Regeln in `y2k.css` stehen. Beides prüft
`y2k-css.test.ts`, dazu, dass es zu **jeder** Kennung aus `VORLAGEN` eine Regel
gibt (abgeleitet, nicht getippt). Was verschieden bleibt und bleiben soll: der
Kippwinkel (0,7 im Freundebuch, 0,4 im Tagebuch), die `nurtext`-Klasse und der
Löschknopf.

### Migration 0009 und die Lücke dahinter

`bild_pfade text[]` und `vorlage text` kommen per Migration; `bild_pfad` **bleibt**
und trägt weiter das erste Bild, weil ein Telefon mit zwischengespeichertem altem
JavaScript nur diese Spalte liest.

Eingespielt wird die Migration **automatisch**: `.github/workflows/migrate.yml`
läuft bei jedem Push auf `main` und `claude/**`, wenn sich unter
`supabase/migrations/` etwas geändert hat, und hat die Zugangsdaten als Secret.
Für 0009 ist das um 14:17 passiert (`ALTER TABLE`, `COMMENT`, `ALTER TABLE`,
`COMMENT`, `UPDATE 0` — null Zeilen, weil noch kein Beitrag ein Bild hatte). Das
Dashboard braucht es nur, wenn dieser Lauf scheitert.

**Die Fähigkeitsprobe bleibt trotzdem nötig**, und der Grund ist die
Reihenfolge: Migration und Deploy starten **gleichzeitig** und sind zwei
getrennte Läufe. Bei 0009 war die Datenbank 5 Minuten vor der Seite fertig — das
war Glück, keine Zusicherung. Kippt die Migration (Secret abgelaufen, Projekt
angehalten, Netz), geht der Deploy trotzdem hinaus. `ladeFreundebuch()` selektiert
namentlich; ein `bild_pfade` gegen die alte Tabelle ergibt 400, und das
Freundebuch wäre dann **tot** — kein Bilderstrom, keine Steckbriefe, bis jemand
am Rechner sitzt.

Deshalb eine Fähigkeitsprobe: voller Select, bei „Spalte gibt es nicht" (`42703`)
einmal zurück auf die alte Liste, Ergebnis für die Sitzung gemerkt. Ist sie
negativ, nimmt `beitragAnlegen()` nur ein Bild und schickt die neuen Spalten nicht
mit, und die Maske zeigt Filmstreifen und Collage gar nicht erst — eine Wahl, die
beim Absenden scheitert, wäre schlimmer als keine.

`test/freundebuch-spalten.test.ts` fährt **beide** Schemaformen gegen
`mini-postgrest.ts`. Gegenprobe: Rückfall entfernen → die vier „ohne
Migration"-Prüfungen fallen. Dafür musste die Attrappe lernen, auf eine unbekannte
Spalte im `select` mit **400** zu antworten statt zu werfen: Mit einem `throw`
**hängt** der Supabase-Client, die Abfrage löst nie auf. Eine Attrappe, die anders
scheitert als das Original, prüft eine Welt, die es nicht gibt.

**Rücknahme über alle Bilder.** Bisher wurde bei einem Insert-Fehler die *eine*
Datei entfernt. Bei vier Bildern reicht das nicht: Bricht der dritte Upload ab, lief
gar kein Insert — die zwei ersten lägen für immer im Bucket, ohne dass eine Zeile
auf sie zeigt. Niemand würde sie je finden. `beitragLoeschen()` entfernt
entsprechend alle Pfade, weiter Datei zuerst.

**Datenverbrauch, gerechnet:** ~300 kB je Foto nach `verkleinern()`, also ~1,2 MB
für einen Collagen-Beitrag statt 300 kB. Die Gästeseite lädt acht Tagesgruppen auf
einmal, alle Bilder `loading="lazy"` — grob 25–30 MB je vollständig gescrollter
Seite, gegen 5 GB im Monat also etwa 170 Durchläufe. Wird es knapp, ist `SCHRITT`
in `Tagebuch.svelte` der Hebel, nicht die Bildzahl.

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

## Die Karte

**Grundkarte: Vektorkacheln von OpenFreeMap, Beschriftung deutsch.** Das ist der
Grund für den Vektorweg und nicht Geschmack: Bei Rasterkacheln entscheidet der
Server über die Sprache — der OSM-Standardserver rendert den `name`-Tag, in Japan
also 大阪 statt Osaka. Bei Vektorkacheln liegt die Beschriftung als Datenfeld vor,
und `MapView.svelte` setzt sie auf `name:de`, sonst `name:en`, sonst lateinische
Umschrift. Angewandt über **alle** Ebenen des Stils mit `text-field`, nicht über
bekannte Ebenennamen: So hält es, wenn der Anbieter seinen Stil umbaut.

**Rasterrückfall auf OSM.** Drei Dinge können den Vektoruntergrund verhindern —
kein WebGL, der Stil lädt nicht, der Dienst ist aus. In allen drei Fällen entsteht
die OSM-Rasterebene: dann japanisch beschriftet, aber sichtbar. OpenFreeMap ist
kostenlos und gibt keine Zusage; für eine Reise, auf der die Karte zählt, wäre ein
einzelner Anbieter ohne Rückfall die falsche Wahl.

**Preis, gemessen:** Der maplibre-Brocken ist **273 KB gzip** und verdreifacht das
JavaScript der Anwendung (137 → 412 KB). Er lädt erst, wenn eine Karte erscheint,
und danach behält ihn der Browser. Stil und Paket werden **gleichzeitig** geholt,
nicht nacheinander — sonst kostet es unterwegs eine volle Rundreise Wartezeit,
bevor der Download überhaupt beginnt.

### Wenn keine Kacheln kommen

Vorher passierte dann **nichts**: `L.tileLayer(...)` hatte keinen
`tileerror`-Zweig, übrig blieb die Hintergrundfarbe des Containers. Auf dem Telefon
sah das aus wie eine kaputte Karte, und genau so wurde es gemeldet. Eine Karte, die
nicht sagt, dass ihr der Untergrund fehlt, ist von einer kaputten nicht zu
unterscheiden.

Jetzt erscheint ein Hinweis, und zwei Dinge daran sind wichtiger als sein Aussehen:

- **Er nennt den Host.** Steht dort `tiles.openfreemap.org`, ist der Dienst aus;
  steht dort `tile.openstreetmap.org`, ist auch der Rückfall blockiert und die
  Ursache liegt im Netz oder an einem Inhaltsblocker im Browser. Das ist die
  Diagnose, die vorher fehlte.
- **Er blockiert nichts.** `pointer-events: none` am Überzug, nur der Knopf nimmt
  Tipps an. Marker, Popups und die Liste arbeiten ohne Untergrund weiter, und das
  steht auch da.

**Eine Falle, die zweimal zuschlägt:** Leaflets `load`-Ereignis feuert, wenn keine
Kachel mehr *lädt* — auch dann, wenn jede einzelne gescheitert ist. Eine erste
Fassung hat damit den Hinweis zurückgesetzt, den `tileerror` einen Moment vorher
gesetzt hatte, und die Karte war wieder stumm grau. Deshalb hängt das Zurücksetzen
an `tileload`, das je wirklich angekommener Kachel feuert. Gefunden wurde es nicht
durch Nachdenken, sondern durch eine Spur im Browser: `tileerror gefeuert`, danach
`load gefeuert, grund war fehler`.

**Diese Umgebung ist für den Fehlerfall der bessere Prüfstand als ein echtes
Telefon:** Der Egress-Proxy sperrt jeden Kachelhost (gemessen: OSM, CARTO,
Wikimedia, Esri, OpenFreeMap). „Keine Kacheln" ist hier der Normalzustand, also
zuverlässig prüfbar — `npm run test:karte`. Umgekehrt lässt sich von hier **nicht**
zeigen, dass Kacheln ankommen oder in welcher Sprache sie beschriftet sind. Das
sieht nur ein Gerät mit freiem Netz.

### Die Karte hatte keine Größe — und alle 141 Marker lagen in der Ecke

Gemeldet von einem Bildschirmfoto vom Telefon, und das war die erste echte
Gerätemessung in diesem Projekt. Reproduziert gegen den ausgelieferten
`dist/`-Stand bei 412 × 760 px:

| Zustand | Container | Kacheln | Kartenebene | Marker 54 / 98 / 160 |
|---|---|---|---|---|
| geladen, Reiter „Liste" | **0 × 0** | 1 | 0, 0 | −83/67 · 69/57 · 94/29 |
| nach Tipp auf „Karte" | 382 × 650 | **1** | **0, 0** | **unverändert** |
| nach echtem Fenster-Resize | 383 × 650 | **12** | **192, 325** | dadurch korrekt |

**Die Kette.** `/orte/` startet auf dem Handy mit `mobileView = 'liste'`, und
`.split[data-view='liste'] .mapwrap` steht auf `display: none`. Die Karte entsteht
trotzdem — ihr Markup steht unbedingt da, ohne `{#if}`. Leaflet merkt sich die
Größe beim ersten `getSize()` und löst den Cache nur bei `invalidateSize()` oder
einem `window`-`resize`; ein Reiterwechsel per CSS ist keines von beidem.
`invalidateSize` kam im ganzen Quelltext **nicht vor**. Bei Größe 0 zieht Leaflet
beim Pixelursprung keinen halben Bildschirm ab — alles rutscht um 191/325 px nach
links oben.

**Die Maßstäbe stimmten die ganze Zeit.** 233 × 142 px Spanne für Kyoto bis Nikkō
bei Zoom 6 ist auf den Pixel richtig. Es war kein Koordinaten- und kein
Projektionsfehler, nur ein verschobener Ursprung — weshalb jede Prüfung, die
Marker gegen Marker hält, blind dafür bleibt.

**Die zu kleine gemalte Fläche war derselbe Fehler.** Mit untergeschobenem Stil
gemessen: Der GL-Container steht auf `width: 0; height: 0`, maplibre fällt für
seine Leinwand auf die Vorgabe **400 × 300 px** zurück. Genau dieser Ausschnitt war
auf dem Telefon bemalt, der Rest des Rahmens blieb Hintergrundfarbe.

**Die Reparatur** ist ein `ResizeObserver` auf dem Kartencontainer in
`MapView.svelte`, der bei jeder Größe ≠ 0 `invalidateSize()` ruft. Nicht ein
Aufruf beim Reiterwechsel: Der ist nur *ein* Weg zu einer neuen Größe, die anderen
sind das Drehen des Telefons, die ein- und ausfahrende Browserleiste (`--app-h`
hängt an `100dvh`) und das Erfassungsformular. Und nicht im Ortsbrowser, sondern in
`MapView` — dann haben alle vier Karten der App ihn.

**Warum keine Prüfung das gefunden hat.** Keine einzige las je die *Position* eines
Markers. `browser-karte.mjs` benennt den Markerhaufen sogar ausdrücklich — und
deutet ihn als Testhindernis statt als Befund. Und `browser-orte.mjs` prüfte die
aus der Karte übernommene Koordinate nur auf „endlich und ≠ 0"; sie lag **683,7 km
daneben** und war grün. Beides ist jetzt anders, und beides misst gegen die
**ausgerechnete** Sollposition (Web-Mercator im Testkopf), nicht gegen die
Nachbarn: Marker und Koordinatenwahl teilen sich den Pixelursprung und sind
miteinander auch dann einig, wenn er falsch ist.

**Ein Nebeneffekt, der die Prüfung selbst entlarvt hat:** Nach der Reparatur fiel
der lange Druck auf die Karte durch — weil über der Kartenmitte jetzt das Popup des
zuletzt angelegten Ortes liegt und Leaflet dort die Weitergabe von `touchstart`
stoppt. Vorher lag das Popup mit allem anderen in der Ecke, und die Mitte war
zufällig frei. Die Suite sucht sich die Stelle nun mit `freieStelle()`.

**Und `freieStelle()` fiel beim ersten Anlauf im CI — am selben Fehlertyp wie die
Kachelprüfung ein Durchgang vorher.** Die erste Fassung verlangte, dass
`elementFromPoint` genau den `.leaflet-container` liefert. Das stimmt **nur hier**:
Der Proxy sperrt jeden Kachelhost, die Vektorebene kommt nie zustande, die
Kartenfläche ist der Container selbst. Auf einem Runner mit freiem Netz lädt die
Vektorkarte, und die maplibre-Leinwand deckt alles ab — sie hat kein
`pointer-events: none`. Es gab dort **keine** freie Stelle, und der Wächter hielt
das Tor zu. Zwei Lehren, beide eingebaut: Gefragt wird jetzt, ob etwas
**darüber** liegt (Marker, Popup, Bedienknopf), nicht woraus die Fläche besteht —
und `browser-orte.mjs` **schiebt den Stil unter** (`vektorStilUnterschieben()` in
`browserlauf.mjs`), damit die Leinwand in beiden Umgebungen da ist, mit einer
eigenen Zusicherung, dass das Unterschieben gewirkt hat.

### Die Beschriftung: was der echte Stil wirklich sagt

Der zweite Defekt aus demselben Bildschirmfoto: kein Name, kein Wasser, keine
Straße — nur Landfarbe und Schummerung. `tiles.openfreemap.org` ist aus dieser
Umgebung gesperrt, **`raw.githubusercontent.com` aber nicht**, und der Stil wird
in `hyperknot/openfreemap-styles` gepflegt. Damit lag er zum ersten Mal vor:
111 Ebenen, 23 mit `text-field`.

**Was er über das Bildschirmfoto sagt.** Der Stil hat **zwei** Quellen:
`ne2_shaded` — ein Natural-Earth-**Raster**, dessen Kachel-URLs inline stehen —
und `openmaptiles`, die **Vektorquelle**, die erst ein TileJSON unter `/planet`
holen muss. Bei Zoom 6 zeichnet der Stil `water` in `rgb(158,189,255)`, dazu
`label_country_1/2/3`, `label_city`, `label_state`, Autobahnen und Grenzen. Auf
dem Telefon war das Meer `#f8f4f0` — die `background-color` des Stils — und die
Küstenlinie blockig verpixelt. **Es rendert ausschließlich das Rasterrelief; die
Vektorquelle liefert nichts**, und kein `error` hat den Handler erreicht, sonst
wäre die Ebene abgeworfen und die OSM-Rasterkarte eingehängt worden — und die hat
kein Relief.

**Zwei Defekte in `deutscheNamen()`, jetzt belegt statt vermutet.**

- `SPRACHFOLGE` stand auf `['name:de', 'name:en', 'name:latin', 'name']`.
  `name:de` und `name:en` kommen im echten Stil **null Mal** vor; benutzt werden
  `name:latin` (20 ×), `name:nonlatin` (40 ×) und **`name_en` mit Unterstrich**
  (20 ×). Der deutsche Name wurde also unter einem Schlüssel gesucht, den es
  nicht gibt — unsichtbar, weil `coalesce` stillschweigend auf `name:latin`
  durchfällt und die Karte dann richtig aussieht. Jetzt stehen beide
  Schreibweisen drin; welche in den Kacheln liegt, ist von hier nicht messbar,
  und ein Übermaß kostet bei `coalesce` nichts.
- Die Umschreibung hat **jeden** `text-field` überschrieben. Drei Ebenen
  (`highway-shield-non-us`, `highway-shield-us-interstate`, `road_shield_us`)
  tragen `["to-string", ["get", "ref"]]` — die Nummer im Autobahnschild. Features
  mit `ref` haben keinen `name`, die Schilder blieben danach **leer**. Ein leeres
  Schild ist schlimmer als ein japanisches: Es sieht nach Darstellungsfehler aus
  und sagt gar nichts. Umgeschrieben wird jetzt nur noch, wo der bisherige
  Ausdruck `name` erwähnt.

**Entwarnung an einer Stelle, damit der Verdacht nicht wiederkommt:** `text-font`
steht in allen 23 Beschriftungsebenen als Geschwisterfeld (`Noto Sans
Regular/Bold/Italic`) und nicht im Ausdruck. Die Umschreibung zerstört also
keinen Fontstack — der naheliegende Glyphenverdacht ist **widerlegt**.

**Die Prüfung hat all das verteidigt.** `test/karte.test.ts` arbeitete gegen
einen erfundenen Sechs-Ebenen-Stil, dessen beide `text-field`-Formen
(`['get', X]` und `'{name}'`) im echten Stil **gar nicht vorkommen** — alle 23
tragen `case` oder `to-string`. Und `expect(texte).toHaveLength(3)` plus „jede
Textebene gleich `SPRACHE`" machte das bedingungslose Überschreiben zur
Zusicherung: Eine schonende Fassung wäre daran rot geworden. Beides ist ersetzt.
Der echte Stil liegt als datierter Schnappschuss in
`test/fixtures/liberty-stil.json` (Herkunft in `test/fixtures/LIES-MICH.md`), und
die Prüfung **wertet den Ausdruck jetzt aus** statt ihn anzusehen — mit derselben
Maschine, die MapLibre benutzt (`createPropertyExpression` aus
`@maplibre/maplibre-gl-style-spec`, ohnehin eine Abhängigkeit von maplibre-gl):

| Feature | vorher | nachher |
|---|---|---|
| `{name: 東京, name:latin: Tokyo}` | `Tokyo⏎東京` | `Tokyo` |
| `{name: 大阪, name_de: Ōsaka}` | `大阪` | `Ōsaka` |
| `{name: 京都}` | `京都` | `京都` |
| `{ref: E1}` auf einem Schild | `E1` | `E1` — vorher wäre daraus `""` geworden |

### Warum das niemand gemerkt hat — und was jetzt gezählt wird

Im Quelltext von maplibre-gl 6.10 nachgelesen, nicht vermutet:

- **Eine 404-Kachel ist kein Fehler.** `src/source/vector_tile_source.ts:253-256`:
  `if (err && err.status !== 404) { throw err; }`, danach
  `_afterTileLoadWorkerResponse(tile, null)`. Die Kachel bekommt den Zustand
  `'loaded'` und ist leer. **Kein Ereignis, keine Meldung.** Ein Kartendienst,
  der auf jede Kachelanfrage 404 antwortet, ist damit von einem funktionierenden
  nicht zu unterscheiden.
- **Eine gescheiterte Quelle meldet „geladen".** `src/tile/tile_manager.ts:155-157`,
  erste Zeile von `loaded()`: `if (this._sourceErrored) { return true; }`. Und
  `vector_tile_source.ts:132-134` setzt beim gescheiterten TileJSON ausdrücklich
  `this._loaded = true; // let's pretend it's loaded so the source will be ignored`.
  `isSourceLoaded()` und `areTilesLoaded()` taugen als Auskunft also **nicht**;
  `'idle'` feuert im Fehlerfall sogar *früher* als im Gutfall.

Deshalb zählt `MapView` jetzt, was die Karte **wirklich zeichnet** —
`queryRenderedFeatures()`, getrennt nach allem und nach Symbolebenen, die auch
ein `text-field` tragen. Drei Dinge daran sind bewusst so und nicht anders:

1. **Erst Bereitschaft, dann zählen.** Symbolebenen kommen erst in den
   Merkmalsindex, wenn die Platzierung festgeschrieben ist; vorher meldet
   `queryRenderedFeatures` **null Beschriftungen, obwohl alle Kacheln da sind**.
   Gewartet wird auf `loaded()` **und** `style.placement`, sekündlich nachgefragt.
2. **Zwei Fristen.** `idle` ist der richtige Zeitpunkt, wenn alles gut geht —
   bleibt das TileJSON aber stumm, kommt `idle` nie. Nach 12 s wird deshalb
   gemessen, nach 24 s gilt „lädt noch" als Ausfall. Eine magere Verbindung
   unterwegs soll nicht sofort auf die japanisch beschriftete Rasterkarte
   zurückfallen.
3. **Der Rückfall hängt an den Merkmalen der Vektorquelle, nicht an den Namen.**
   Ein kleiner Ausschnitt über dem Meer hat zu Recht keine Beschriftung; eine
   Karte, die sich deshalb selbst abschaltet, wäre schlimmer als das Problem.
   Abgeworfen wird nur, wenn der Stil eine Vektorquelle hat und **kein einziges**
   ihrer Merkmale gezeichnet wurde.

`-1` heißt überall „noch nicht gemessen" und wird nie als `0` angezeigt. Eine
Seite, die eine fehlende Messung als „nichts da" ausgibt, schlägt beim ersten
Blick Alarm und wird danach nicht mehr gelesen.

**Zwei Nebenreparaturen aus derselben Lesung:** Der `error`-Zweig hat bisher nur
den **ersten** Fehler beachtet (`if (grund.art === 'vektor')`) und alle weiteren
verworfen — jetzt stehen bis zu fünf Meldungen im Wortlaut auf `/wache/`. Und
`gl.supported()` gibt es in maplibre-gl 6.10 nicht; die WebGL-Vorprüfung lief
also nie. Eine Prüfung, die es nur scheinbar gibt, ist schlimmer als keine.

**Geprüft wird das im CI** (`browser-wache.mjs`): Ein untergeschobener Stil mit
einer Vektorquelle, die nie antwortet, muss nach der Frist den Rückfall auslösen
und ihn beim Namen nennen. Gegenprobe ohne die Frist: Die Seite bleibt ewig bei
„wird gemessen" — genau der stumme Zustand vom Telefon.

**Was hier nicht prüfbar ist und deshalb nicht behauptet wird:** In dieser
Umgebung fordert maplibre keine Vektorkacheln an, und die WebGL-Leinwand ist im
Bildschirmfoto durchsichtig — **was die Karte malt, ist von hier nicht zu
sehen**. Gemessen werden kann nur die Frist und der Rückfall. Ob die Beschriftung
auf dem Gerät zurückkommt, sagt `/wache/` auf dem Gerät.

### Der Weg zurück zur lesbaren Karte

Der Rasterrückfall war eine **Einbahnstraße**. Auf dem Telefon lieferte die
Vektorquelle nichts, die App schaltete wie vorgesehen auf OpenStreetMap um — und
damit war die Karte japanisch beschriftet, bis jemand die Seite neu lud. Dass
Neuladen hilft, muss man erst einmal wissen.

Drei Dinge dagegen:

- **Ein Umschalter auf der Karte** (`kartenwahl`-Prop, nur auf `/orte/`; die
  Probekarte auf `/wache/` ist 180 px hoch, da wäre er im Weg). Die Beschriftung
  sagt, was ein Tipp *bewirkt* — „OSM-Karte" beziehungsweise „Lateinische Karte"
  —, nicht welcher Zustand gerade gilt. „Vektor" und „Raster" sind Fachwörter,
  die unterwegs niemand gegeneinander abwägt; was zählt, ist die Schrift auf der
  Karte.
- **Die Wahl wird gemerkt**, in `localStorage` unter `japan2026:kartenart`, und
  ausdrücklich **nicht** im Plan-Store: Der gehört der Reise und wird zwischen
  den drei Telefonen abgeglichen. Ob auf *diesem* Gerät die Vektorkarte läuft,
  ist eine Eigenschaft dieses Geräts und seiner Verbindung. Bei `'raster'` wird
  maplibre **gar nicht erst geladen** — das spart die vollen 273 KB gzip.
- **Ein neuer Versuch beim Wiedersichtbarwerden.** OpenFreeMap betreibt laut
  eigenem Repo zwei Server im Round-Robin; ein Ausfall kann den einen treffen und
  den anderen nicht. Drei Bedingungen, damit daraus kein Dauerversuch wird: Der
  Container war wirklich verborgen (ein Reiterwechsel, nicht die ein- und
  ausfahrende Browserleiste), wir sind auf dem Rückfall *gelandet* statt ihn
  gewählt zu haben, und der letzte Versuch ist über 30 s her.

**Eine Sackgasse, die beim ersten Anlauf entstanden ist und die Prüfung gefunden
hat:** Im Fehlerzustand ist der Umschalter ausgeblendet — sonst läge er über dem
Hinweisbalken. Dessen Knopf „nochmal versuchen" setzte die gemerkte Wahl aber
nicht zurück. Wer OSM gewählt hatte und dort *auch* keine Kacheln bekam, drehte
sich im Kreis. Der Knopf stellt jetzt auf `'auto'` zurück; die Gegenprobe ohne
diese Zeile lässt zwei Prüfungen namentlich fallen.

**Und der zweite Anlauf ist im CI gefallen — an derselben Falle wie zwei
Durchgänge vorher.** Die Prüfung verlangte den Knopf **im Hinweisbalken**. Den
gibt es aber nur, wenn auch die OSM-Kacheln ausbleiben, und das ist allein hier
so: Der Proxy dieser Umgebung sperrt sie. Auf dem Runner kommt die OSM-Karte an,
der Balken erscheint nicht, der Rückweg hängt an der Pille. Verlangt wird jetzt,
was gemeint war — **irgendein** Weg zurück, der nicht im Kreis führt —, und der
zweite Zustand wird eigens hergestellt: Die Rasterkacheln werden mit einem
1×1-Punkt beantwortet, damit auch der Fall „OSM kommt an" in beiden Umgebungen
geprüft ist. Drei Mal derselbe Fehler in einer Sitzung; die Lehre steht jetzt an
drei Stellen im Testcode.

### Drei Anbieter statt einem

Der Ausfall vom 20.09.2026 hatte eine Ursache, die keine Reparatur am Code
beheben kann: **Die Karte hing an einem einzigen Dienst.** Als dessen
Vektorkacheln ausblieben, war sie tot — und niemand merkte es, weil maplibre so
einen Ausfall nicht meldet.

Jetzt wird nicht mehr gehofft, sondern durchprobiert. `ANBIETER` in
`src/lib/karte.ts`:

| | Anbieter | Stil kommt von | Beschriftung |
|---|---|---|---|
| 1 | **VersaTiles** | `public/karte-versatiles.json`, also von **dieser** Seite | lateinisch |
| 2 | **OpenFreeMap** | `tiles.openfreemap.org` | lateinisch |
| 3 | **OpenStreetMap** | — (Rasterkacheln) | japanisch |

Jeder Vektoranbieter wird angehängt und muss **beweisen**, dass er zeichnet
(`queryRenderedFeatures`). Tut er das nicht, kommt der nächste. Der zuletzt
erfolgreiche wird gemerkt (`japan2026:kartenanbieter`) und beim nächsten Mal
zuerst gefragt — unterwegs zählt die erste Sekunde, nicht die Ordnung der Liste.

**Warum VersaTiles zuerst und warum sein Stil im Repo liegt.** Jeder Abruf, den
die Karte zum Zeichnen braucht, ist eine Stelle, an der genau das passieren kann,
was passiert ist. Der Stil wird deshalb beim Bauen erzeugt
(`npm run data` → `scripts/karte-stil.mjs`, aus `@versatiles/style`) und liegt in
`public/`. Ist die Seite da, ist der Stil da; nur die Kacheln hängen noch am
fremden Server.

**Eine Falle des VersaTiles-Stils**, gemessen und abgefangen: Sein deutscher
Stil erzeugt `["coalesce", ["get","name_de"], ["get","name"]]` — ein japanischer
Ort ohne deutschen Namen stünde damit wieder auf Japanisch da. `deutscheNamen()`
schreibt das zur Laufzeit für **jeden** Anbieter gleich um, statt zwei Regeln zu
führen, die auseinanderlaufen.

**Drei Fehler beim Bauen, alle von den eigenen Prüfungen gefunden:**

1. **Die Bereitschaftsprüfung war zu streng.** Erste Fassung: erst messen, wenn
   `loaded()` *und* `style.placement` stehen, sonst durchgefallen. Ergebnis: ein
   **gültiger** Stil fiel mit „antwortet seit 10 s nicht" durch, weil `loaded()`
   erst wahr wird, wenn *jede* Quelle fertig ist. Auf einer mageren Verbindung
   hätte das einen Anbieter weggeworfen, der gleich geliefert hätte.
2. **Ein gemeldeter Fehler galt als Ausfall — und hat die Karte drei Tage
   japanisch gehalten.** In der Probeschleife stand
   `if (fehlerTexte.length) return durchgefallen(fehlerTexte[0])`. Das klingt
   vernünftig und ist falsch: Bei maplibre ist ein `error` auch ein fehlender
   Glyphenbereich, ein 404 auf ein Sprite oder eine einzelne Kachel am Rand — die
   Karte steht trotzdem. Solange der Worker fehlte (siehe unten), wurde nie eine
   Kachel, nie ein Glyph, nie ein Sprite angefordert; es kam nie eine Meldung, der
   Abbruch lief ins Leere und fiel niemandem auf. Mit laufendem Worker kamen
   Meldungen — und auf dem Telefon fiel **jeder** Vektoranbieter durch. Unter der
   Karte stand „OSM-Rasterkarte", mit genau den japanischen Städtenamen, gegen die
   der ganze Vektorweg gebaut ist.

   Jetzt entscheidet **allein die Messung**: Kommt ein Merkmal aus einer
   `type: 'vector'`-Quelle im Bild an? Gefragt wird währenddessen, nicht erst am
   Ende — ein Anbieter, der liefert, wird sofort eingewechselt, und die Frist
   (20 s) kostet nur den, der nichts liefert. Meldungen werden mitgeschrieben und
   stehen auf `/wache/` im Wortlaut; über Bestehen entscheiden sie nicht.

   Geprüft wird das mit `MELDENDER_STIL` in `test/browserlauf.mjs`: ein Stil, der
   zeichnet **und** meckert (ein Sprite, das es nicht gibt). Warum ein Sprite und
   nicht die Glyphen: Der Zeitpunkt muss feststehen — `Style#_load` fordert das
   Sprite an, bevor irgendetwas gezeichnet ist, der Fehler ist also garantiert vor
   der ersten Messung da. Der Glyphenfehler kommt irgendwann, und genau dieses
   Rennen ist der Grund, warum die alte Fassung in der Entwicklungsumgebung
   *bestand* und auf dem Gerät nicht.
3. **Die Marker warteten auf die Kette.** `grundkarte()` stand hinter einem
   `await`, und die Kette kann zwanzig Sekunden brauchen. Eine Karte, die erst
   dann auf einen Finger reagiert, ist unterwegs unbrauchbar. Sie läuft jetzt
   nebenher; Marker und Antippen hängen an nichts davon. Gefunden hat es die
   Prüfung, die nach 700 ms keinen einzigen Marker mehr fand.

**Was im CI prüfbar ist und was nicht.** Prüfbar: dass die Kette weitergeht,
wenn ein Stilabruf scheitert, dass sie beim Raster landet und dass sie alle
Durchgefallenen samt Grund benennt (erzwungen über 503-Antworten, die brauchen
kein maplibre); und seit dem Worker auch, dass eine Vektorebene sich überhaupt
durchsetzen kann und dass eine maplibre-Meldung sie nicht kostet (`MELDENDER_STIL`).
**Nicht** prüfbar bleibt der Fall echter Vektorkacheln: Alle Kachelhosts sind hier
gesperrt, und ein `.pbf` von Hand zu fälschen wäre eine Prüfung gegen die eigene
Fälschung. Ob auf dem Gerät Daten ankommen, sagt `/wache/` — Anbieter, gezeichnete
Merkmale, gezählte Namen, die letzten fünf Meldungen im Wortlaut.

### Die eigentliche Ursache: eine Datei, die beim Bündeln verlorenging

Drei Tage lang sah es nach einem Ausfall des Kartendienstes aus. Es war ein
Fehler im **Bauen**, und er reproduziert sich in dieser Umgebung genauso wie auf
dem Telefon.

maplibre baut die Adresse seines Web Workers als Geschwisterdatei neben sich
selbst:

```js
function workerUrl() {
  const e = import.meta.url;
  if (!/^https?:/.test(e)) return '';
  const t = e.endsWith('-dev.mjs') ? 'maplibre-gl-worker-dev.mjs' : 'maplibre-gl-worker.mjs';
  return new URL(`./${t}`, e).href;
}
```

Vite bündelt maplibre aber in einen Chunk unter `_astro/` und **kopiert die
Worker-Datei nicht mit**. Gesucht wurde also `_astro/maplibre-gl-worker.mjs` —
dort ist nichts. Im Dev-Server stand dieselbe Warnung im Protokoll und wurde
übersehen: *„The file does not exist at …/deps/maplibre-gl-worker.mjs."*

**Warum das wie ein Dienstausfall aussieht:** Vektorkacheln werden
**ausschließlich im Worker** geparst, Rasterquellen nicht. Der Liberty-Stil hat
beides — ein Natural-Earth-Raster und die Vektorquelle. Ohne Worker kam genau das
Raster an: ein Reliefbild ohne Wasser, ohne Straßen, ohne Namen. Kein Fehler,
keine Meldung, kein `error`-Ereignis. Der Worker startet einfach nie, und
maplibre wartet.

Das erklärt rückblickend auch, warum in dieser Umgebung **nie** eine Vektorebene
gewinnen konnte und warum maplibre hier keine einzige Kachel angefordert hat. Ich
hatte das der Netzsperre zugeschrieben. Es war derselbe Fehler.

**Die Reparatur:** `scripts/karte-stil.mjs` kopiert Worker und gemeinsamen Teil
nach `public/karte-motor/` (Endung `.js`, weil `.mjs` je nach Server als
`application/octet-stream` ausgeliefert wird und ein Modul-Worker das ablehnt),
und `MapView` setzt die Adresse über `setWorkerUrl()` ausdrücklich — statt sie
vom Bündeln zu erhoffen.

Gegengeprobt: Ohne diese Zeile wird die Worker-Datei **nie geholt**, die
Vektorebene bleibt bei Deckkraft 0 und die Rasterkarte liegen — genau das Bild
vom Telefon. Dazu prüft `karte.test.ts`, dass die Kopien bytegleich zur
installierten maplibre-Fassung sind; ein Versionssprung ohne neuen Kopierlauf
wäre sonst ein stiller Rückfall.

### Zuerst eine Karte, die da ist — dann erst die schönere

Am 21.09.2026 kam auf dem Telefon eine **weiße** Karte an: Marker an der
richtigen Stelle, Untergrund nichts. Die Ursache war eine Regel, die einen Tag
vorher als Vorsicht gedacht war — „im Zweifel den Anbieter behalten", damit eine
magere Verbindung keinen funktionierenden verliert. Das Ergebnis: Wer nichts
beweist, deckt trotzdem alles zu.

Die Reihenfolge ist deshalb umgedreht:

1. Die **OSM-Rasterkarte hängt sofort** unten drin. Japanisch beschriftet, aber
   sie kommt an — auf dem Gerät gemessen. Gemessen auch hier: Kacheln nach
   **800 ms**, 141 Marker, keine leere Fläche.
2. Die lateinischen Vektoranbieter werden **darüber** geprüft, und zwar
   **durchsichtig** (`opacity: 0`), damit ein stummer Anbieter die Rasterkarte
   nicht zudeckt.
3. Sichtbar wird einer erst, wenn er nachweislich zeichnet. Dann verschwindet die
   Rasterkarte darunter. Beweist sich keiner, bleibt sie einfach liegen.

Damit ist die Strenge wieder möglich, die vorher gefährlich war: Ohne Beweis kein
Wechsel — der Preis dafür ist nur noch „japanisch" statt „weiß".

**Der Umschalter zeigt jetzt die Einstellung, nicht den Momentzustand.** Vorher
hing seine Beschriftung an `grund.art`: Sie wechselte während der Anbieterkette
unter dem Finger, und auf der OSM-Karte bot er „Lateinische Karte" an, obwohl
genau das eingestellt war — ein Knopf, der nichts ändert.

### Der Knopf führt nach My Maps — der einzige Weg zu eigenen Pins

Die Zwischenstufe „In Google Maps öffnen" hat enttäuscht, und zwar berechtigt:
Sie öffnete den **Ausschnitt**, und Maps ging ohne einen einzigen Pin auf. Der
Name las sich wie „mit meinen Orten".

**Was Googles Maps-URLs können** (Kenntnisstand, nicht nachgeschlagen — die
Dokumentation ist aus dieser Umgebung gesperrt): einen Ort suchen, eine Route mit
höchstens zehn Halten zeigen, einen Kartenausschnitt zeigen, Street View. Es gibt
**keinen Parameter für eine Liste eigener Marker.** Mehrere eigene Pins gehen nur
über My Maps oder über die kostenpflichtige Maps-JavaScript-API mit Schlüssel —
und ein Schlüssel in einem öffentlichen Repo ist keiner.

Dort stehen jetzt **zwei Knöpfe**: *1 · Datei mit 141 Orten laden* und
*2 · My Maps öffnen*. In My Maps dann *Neue Karte erstellen* → *Importieren* →
die geladene Datei wählen.

**Warum zwei und nicht einer.** Der erste Versuch war ein Knopf, der die Datei
bereitlegte **und** My Maps öffnete. Auf dem Telefon tat er nichts: Der Wechsel
in den neuen Tab bricht den gerade gestarteten Download ab. Ein Tipp, eine Sache.

**Drei Fehler im Download selbst**, alle am Rechner unsichtbar und auf dem Handy
tödlich:

```js
a.click();
URL.revokeObjectURL(a.href);   // ← sofort
```

1. **Der Widerruf kam sofort.** Damit ist der Blob freigegeben, *bevor* der
   Browser ihn gelesen hat. Chrome am Rechner ist schnell genug, ein Telefon
   nicht — dort passiert schlicht nichts. Jetzt eine Minute später.
2. **Das `<a>` hing nicht im Dokument.** Mobile Browser ignorieren Klicks auf
   losgelöste Elemente regelmäßig.
3. **Der Tipp machte zwei Dinge** — siehe oben.

Geprüft wird deshalb nicht „kommt eine Datei an" (das tat sie hier auch vorher,
Playwright ist schnell), sondern die **Ursache**: Während des Tipps darf kein
Widerruf passieren. Gegenprobe mit der alten Zeile: Die Prüfung fällt namentlich.

**Die Produktseite `google.com/mymaps` und keine erfundene Import-Adresse:** Einen
Weg, den Import per URL anzustoßen, gibt es nicht — er ist ein Menüpunkt.

Der Kartenausschnitt bleibt als Nebenlink und heißt jetzt **„Nur den
Kartenausschnitt in Maps öffnen — ohne Pins"**. Dieselbe Funktion, ehrlich
beschriftet.

### Welche Karte man gerade sieht, steht unten an der Karte

Drei Tage lang war „welche Karte sehe ich eigentlich?" nur über `/wache/` zu
beantworten. Der aktive Anbieter steht jetzt in der Quellenangabe —
`Leaflet | VersaTiles` oder `Leaflet | © OpenStreetMap, OSM-Rasterkarte`. Das ist
die übliche Form (eine Karte nennt, woher sie kommt) und zugleich die billigste
Diagnose: ein Blick statt eines Seitenwechsels.

### Der Nebenweg: nur der Kartenausschnitt

Statt „KML für Google My Maps" steht dort jetzt **„In Google Maps öffnen"**: Die
Maps-App geht an derselben Stelle und im selben Maßstab auf, den die Karte
gerade zeigt — für Suche, Verkehr und Navigation von dort aus.

**Was dabei nicht geht, und warum:** Google Maps kennt keinen Weg, per Adresse
141 eigene Marker zu setzen. Möglich sind genau drei Dinge — ein Ort, eine Route
mit höchstens zehn Punkten, ein Ausschnitt. Für „ich will da jetzt in Maps
weiterschauen" ist der Ausschnitt das Richtige; für die Marker bleibt der Umweg
über KML und My Maps, und der steht als Textlink daneben.

Benutzt wird die **dokumentierte** Maps-URLs-Schnittstelle (`map_action=map`) und
nicht die verbreitete `/maps/@lat,lng,17z`-Form. Letztere funktioniert auch, ist
aber nirgends zugesagt — auf einer Reise ist ein Link, der sich auf eine Zusage
stützt, mehr wert als einer, der sich auf Gewohnheit stützt. Der Zoom wird auf
0…21 begrenzt: Außerhalb verwirft Google die Adresse **still** und öffnet
irgendeinen Ausschnitt, was schlimmer ist als ein grober.

## Die Selbstprüfung `/wache/` — und die Lücke, die sie schließt

Der Wächter im CI prüft die **Dateien**: `src/data/places.json`, die Orte aus dem
Reiseband. Eigene Orte ab Nr. 165, Ortskorrekturen und Ausblendungen liegen aber im
localStorage und in Supabase — der CI sieht sie **nie**. Wer in der App eine falsche
Koordinate einträgt, etwa aus einem Maps-Link, der auf den Kartenmittelpunkt statt
den Ort zeigt, bekam von nirgends eine Warnung. Genau das ist der Fall, den die
Grundregel meint: *auf der Reise ist ein falsch markierter Ort schlimmer als ein
fehlender.*

Die Seite steht unter `/wache/`, ist **nicht in der Navigation** (die trägt fünf
Einträge; ein sechster drängt die Tab-Leiste bei 390 px zusammen) und über den
Abgleich-Abschnitt der Organisationsseite erreichbar. **Keine Anmeldung**, und das
ist kein Versehen: Sie liest nur den localStorage dieses Geräts und Konstanten aus
der Bauzeit — ein Fremder sieht seinen eigenen leeren Zustand. Aus Supabase holt sie
nichts.

Fünf Abschnitte, in der Reihenfolge, in der sie unterwegs zählen:

1. **Orte** — die Befunde aus `src/lib/wache.ts`, jeder mit Nummer, Grund und dem
   Weg zur Behebung; ein Tipp führt zum Ort in `/orte/`.
2. **Karte** — welche Kachelart wirklich läuft. **Das ist neu und war vorher
   unsichtbar:** Ob die lateinisch beschriftete Vektorkarte läuft oder der japanisch
   beschriftete Rasterrückfall, sah man der App nicht an; sichtbar war nur der Fall,
   in dem gar kein Hintergrund kommt. `MapView.svelte` meldet den Zustand jetzt über
   eine Prop nach außen, aus einem `$effect` über `grund` und nicht aus den sechs
   Zuweisungsstellen — eine vergessene Stelle wäre ein Melder, der im seltensten
   Fall schweigt.
3. **Abgleich** — Status, offene Änderungen, letzter und erster Abgleich. Ein Gerät,
   das **nie** abgeglichen hat, wird ausdrücklich genannt.
4. **Speicher** — ein Schreib- **und Lese**-Versuch auf den localStorage. Im privaten
   Fenster wirft er, und dann ist jede Planänderung nach dem Schließen weg, ohne dass
   sonst etwas in der App das bemerkt.
5. **Was diese Seite nicht weiß** — als Text auf der Seite, nicht nur im Kommentar.

### Eine Regel, zwei Prüfer

`src/lib/wache.ts` hält die Regeln, und `test/orte-plausibel.test.ts` benutzt
**dieselben** im CI. Vorher standen sie nur im Test. Zwei Kopien laufen auseinander,
sobald jemand eine anfasst — und dann sagt der grüne Haken etwas anderes als das
Telefon in der Hand. Nach dem Umzug sind die zehn Gegenproben des CI-Tests
unverändert gelaufen; das ist der Beweis, dass nichts verrutscht ist.

Die tragende Zusicherung ist, dass **jeder Ort näher an seiner eigenen Station liegt
als an jeder anderen** — mit der benannten Ausnahmeliste für die sechs echten
Tagesausflüge. Sie braucht keine erfundene Zahl und trifft den teuersten Fehler: eine
echte Koordinate aus der falschen Gegend. Ein Osaka-Ort mit einer Tokio-Koordinate
schlägt an, obwohl beide Zahlen stimmen und beide in Japan liegen.

Der wertvollste Einzelbefund ist ein anderer: **ein eigener Ort mit negativer
Nummer** heißt, dieses Gerät hat ihn angelegt und nie abgeglichen. Die Unterkunft
steht dann auf keinem der beiden anderen Telefone — und das merkt sonst niemand, bis
jemand sie sucht.

### Zwei Fehler in der Anzeige, beide durch Messen gefunden

- **„164 Orte geprüft" war falsch.** `alleOrteMitKorrekturen()` baut auf `places`,
  und das lässt die 23 erledigten Unterkunftsvorschläge weg — geprüft waren 141 plus
  die eigenen. Eine Prüfseite, die mehr behauptet, als sie angesehen hat, ist genau
  das Gegenteil von nützlich: Man hält 23 Orte für kontrolliert. Jetzt steht die Zahl,
  die stimmt, und der Unterschied ist unter „Was diese Seite nicht weiß" erklärt.
- **Zwei Prüfungen in `browser-wache.mjs` stürzten ab, statt zu melden.** Fehlt das
  Element, läuft Playwright in einen Timeout und die ganze Suite bricht mit einem
  Stapelauszug ab. Zwei Gegenproben galten dadurch als stumm, obwohl die Reparatur
  fehlte. Jetzt wird erst gezählt und dann gelesen.

## Der Wächter: was bei jedem Push geprüft wird

Bis vor kurzem lief keine Prüfung dieses Projekts automatisch. `deploy.yml` sah
nach, ob die Supabase-Secrets gesetzt sind, und baute dann — mit dem Kommentar
„Die Browsertests laufen beim Entwickeln, nicht hier."

Das ist nicht theoretisch schiefgegangen. In einer einzigen Sitzung sind zwei
Regressionen entstanden: Der erste Ort auf `/orte/` rutschte von 326 px auf 454 px
und damit unter die Falzkante, und zwei Routenknöpfe im Tagesplan standen 6 px
auseinander. **Beide haben nur angeschlagen, weil die Suiten von Hand gestartet
wurden.** Ohne das wären sie deployt.

Seither hängt der Deploy an `.github/workflows/wache.yml`: `deploy.yml` ruft ihn
über `workflow_call` als eigenen Job, und `build` trägt `needs: wache`. **Rot heißt
kein Deploy.** Geprüft wird in dieser Reihenfolge — das Billige zuerst, damit eine
kaputte Koordinate nach einer halben Minute auffällt und nicht nach sechs:

1. `npm run wache:daten` — die Ortsdaten, ohne Netz und ohne Browser.
2. `npx astro sync` (erzeugt die Typen für `import.meta.env`), `npx tsc --noEmit`,
   `npm test` (189 Prüfungen), `npm run build`.
3. Chromium (zwischengespeichert), Dev-Server, und die zehn Browsersuiten mit
   zusammen 327 Prüfungen — jede als eigener Schritt, damit ein Lauf alle
   Ergebnisse zeigt statt nur des ersten Fehlers.

**Gemessen an Lauf 35**, dem ersten grünen: Der Wächter braucht **2 min 48 s**, mit
Build und Veröffentlichung sind es **3 min 25 s** von Push bis live. Die zehn Suiten
machen davon 1 min 53 s, Chromium 24 Sekunden, der Dev-Server drei. Im Plan hatte
ich 4–7 Minuten geschätzt — das war zu pessimistisch.

Die Kehrseite, damit sie nicht überrascht: Ein Fehlschlag blockiert dann auch eine
harmlose Textänderung. Wer trotzdem veröffentlichen muss, startet `deploy.yml`
über `workflow_dispatch` von einem Stand, der grün war — nicht indem er das
`needs` entfernt.

### Sechs Dinge, an denen es zuerst gescheitert ist

Vier davon beim Nachfahren der Schrittfolge von Hand gefunden — das war der Zweck
des Nachfahrens. Die letzten zwei erst im ersten echten Lauf, und beide zeigen eine
Grenze der Erprobung, die benannt gehört.

- **`npx tsc --noEmit` war nie sauber.** `test/setup.ts` deklarierte `const
  localStorage` auf oberster Ebene; da die Datei keinen `import` und kein `export`
  hat, ist das eine *globale* Deklaration und kollidiert mit `lib.dom` — zwei Mal
  TS2451, seit dem Anlegen. Gemerkt hat es niemand, weil vitest ohne Typprüfung
  übersetzt und weil jeder Aufruf von `tsc` hier mit einem `grep -v test/setup.ts`
  endete. Im CI wäre daraus ein dauerhaft blockierter Deploy geworden. Die zwei
  Instanzen heißen jetzt `speicher` und `sitzungsSpeicher`.
- **Die Kachelprüfung hätte auf einem Runner umgekippt.**
  `test/browser-karte.mjs` prüft den *Fehlerfall* — dass der Hinweis erscheint,
  wenn kein Hintergrund kommt. Hier ist das der Normalzustand, weil der Proxy jeden
  Kachelhost sperrt; auf einem GitHub-Runner ist das Netz frei, die Kacheln kämen
  an, der Hinweis verschwände planmäßig, und die Suite wäre rot, **obwohl alles
  richtig ist**. Die Sperre wird deshalb jetzt mit Playwrights `route()`
  **erzwungen** statt vorgefunden, und eine eigene Zusicherung prüft, dass sie
  wirklich zugeschlagen hat — sonst könnte weiter bloß der Proxy die Arbeit tun und
  man wüsste es nicht. Gegengeprobt mit einer ausgelieferten 1×1-Kachel: Dann
  fallen vier Fehlerfallprüfungen, genau wie auf einem Runner mit freiem Netz.
- **Eine Suite zeigte auf den falschen Port.** `browser-orte.mjs` fiel auf 4321
  zurück, alle anderen auf 4322 — `npm run test:all` schickte sie also gegen einen
  Port, an dem nichts horcht. Dazu lasen manche nur `BASIS`, andere nur `DEV`.
  Beides steht jetzt einmal in `test/browserlauf.mjs`, samt dem Browserpfad: Der
  war hart auf `/opt/pw-browsers/chromium` gesetzt, und ein Pfad, der ins Nichts
  zeigt, ist schlechter als keiner — Playwright fällt dann nicht auf seinen eigenen
  Browser zurück.
- **`if: always()` war der falsche Schalter.** Er hätte die zehn Suiten auch dann
  gestartet, wenn der Dev-Server gar nicht hochgekommen ist — zwanzig
  Verbindungsfehler, die die eine wahre Ursache verdecken. Jetzt hängen sie an
  `steps.devserver.outcome == 'success'`.
- **Ein `on: push` in `wache.yml` war einer zu viel** — gelernt am ersten echten
  Lauf. `deploy.yml` läuft auf denselben Pushes und ruft den Wächter über
  `workflow_call`; er lief also zweimal, mit allem doppelt. Verdeckt hat es die
  `concurrency`-Gruppe, indem sie den einen Lauf abbrach — und damit wäre es
  gefährlich geworden: Startet der eigenständige Lauf als zweiter, würgt er das Tor
  des Deploys mitten im Lauf ab, `build` sieht ein abgebrochenes `needs` und
  scheitert, ohne dass an der Anwendung etwas falsch ist. Der Auslöser ist weg und
  die Gruppe trägt jetzt `github.workflow` im Namen.
- **`npx astro sync` fehlte** — und der eigentliche Fehler steckte in meiner
  Erprobung. Auf einem frischen Checkout scheitert `tsc` drei Mal mit TS2339
  „Property 'env' does not exist on type 'ImportMeta'": `import.meta.env` ist eine
  Zutat von Astro und Vite, und die Typen dafür stehen in `.astro/types.d.ts` — einer
  **erzeugten** Datei, die `.gitignore` ausschließt. Auf einem Entwicklungsrechner ist
  sie da, weil dort schon `astro dev` gelaufen ist.

  Gefunden hat das nicht mein „frischer Klon", sondern der erste CI-Lauf: Der Klon war
  eine `tar`-Kopie des Arbeitsverzeichnisses und hat `.astro/` mitgenommen. **Ein
  frischer Stand ist, was git hat, nicht was im Verzeichnis liegt.** Die Erprobung
  läuft jetzt über `git ls-files -z | tar --null -T - -cf -`, und damit war der Fehler
  auf Anhieb reproduzierbar.

### Dass das Tor hält, ist beobachtet und nicht behauptet

Ein absichtlich rotes Push war dafür eingeplant und dann nicht nötig: Im **ersten**
Lauf ist „Typen prüfen" rot geworden (der `astro sync`-Fehler oben), und die Jobs
danach stehen im Protokoll als `skipped` — `build` übersprungen, `deploy`
übersprungen, nichts veröffentlicht. Rot blockiert den Deploy, gesehen am Lauf 33.

- **Das `&` beim Dev-Server-Start war doch nötig** — und das ist ein Fehler aus einer
  Messung, die ich zu weit getragen habe. Hier startet Astro 7 den Dev-Server als
  Hintergrunddienst, kehrt nach vier Sekunden mit Exit 0 zurück, und der Dienst
  überlebt die Schrittgrenze; ein `&` wäre überflüssig. **Auf dem Runner hängt
  derselbe Aufruf.** Woran, ist nicht geklärt: `CI=true` erklärt es nicht — damit
  daemonisiert er auch damit. Die Erklärung ist inzwischen **belegt** und nicht mehr
  vermutet: Auf dem Runner daemonisiert er gar nicht, er bleibt im Vordergrund. Mit
  `&` war der Server im nächsten Lauf nach **drei Sekunden** erreichbar — es lag also
  nicht an der Dauer einer kalten Erstübersetzung, wie ich zuerst geschrieben hatte.

  Der Punkt ist aber nicht die Erklärung: Die Form mit `&` ist unter **beiden**
  Verhaltensweisen richtig. Daemonisiert er, beendet sich die Hülle sofort und die
  Bereitschaftsprüfung findet den Dienst; bleibt er im Vordergrund, hält der
  Hintergrundprozess ihn am Leben. Eine Messung aus einer Umgebung gegen eine andere
  zu setzen war der Fehler — Robustheit gewinnt gegen die schönere Erklärung. Die
  Wartezeit steht bei 180 Sekunden — reine Reserve, gemessen sind es drei —, und bei
  einem Fehlschlag gibt der Schritt
  `astro dev status` und `astro dev logs` aus, damit der nächste Fall diagnostizierbar
  ist statt nur rot.

Nebenbei: `astro dev` startet **keinen zweiten** Server, wenn schon einer läuft —
auch nicht auf einem anderen Port. Auf einem frischen Runner kein Thema, beim
Nachfahren auf dem eigenen Rechner schon.

### Die Ortsdaten: warum kein Kilometerdeckel

`test/orte-plausibel.test.ts` prüft die 164 Orte gegen `stations.json` und
`CATEGORIES`: Nummern lückenlos 1–164 und eindeutig, Koordinate im Reiserahmen
(lat 33–38, lng 133–141 — gemessen liegen die Orte zwischen 34,21 und 36,76 bzw.
134,69 und 139,81), Station und Kategorie gültig, Name und Text nicht leer,
Schließtag ein echtes Kürzel.

Die interessante Zusicherung ist die letzte: **jeder Ort liegt näher an seiner
eigenen Station als an jeder anderen.** Sie braucht keine erfundene Zahl und
trifft trotzdem den teuersten Fehler — eine Koordinate aus der falschen Gegend,
die im Rahmen liegt und plausibel aussieht. Ein Osaka-Ort mit einer
Tokio-Koordinate schlägt hier an, obwohl beide Koordinaten echt sind und beide in
Japan liegen; der Rahmen allein lässt ihn durch.

Zwei Wege dorthin waren falsch und sind nachgemessen verworfen:

- **Ein Kilometerdeckel** müsste über 120 km liegen, weil Nikko (Nr. 155–157)
  legitim 119 km von Tokios Mitte entfernt ist und Himeji-jo 76 km von Osakas.
  Dann fängt er fast nichts mehr.
- **Die Regel ohne Ausnahmen** hält nicht: Sechs Orte verletzen sie **zu Recht**,
  weil die Zuordnung beschreibt, von wo aus man hinfährt, und nicht die Geometrie.
  Nara (Nr. 59, 61, 66) liegt näher an Osaka, wird aber von Kyoto aus besucht;
  Iga-Ueno (21, 22) ist ein Ausflug aus Osaka; Ainokura (88) einer aus Takayama.

Deshalb eine benannte Ausnahmeliste mit Begründung je Eintrag — und eine Prüfung,
dass **jeder Eintrag die Regel wirklich noch verletzt**. Ohne die wird eine
Ausnahmeliste, die niemand aufräumt, mit der Zeit zur Generalerlaubnis.

Zehn Gegenproben, jede einzeln nachgewiesen: vertauschte Koordinaten, `lat: 0`,
doppelte Nummer, Tippfehler in Station und Kategorie, leerer Name,
ausgeschriebener Schließtag, Osaka-Ort auf Tokio-Koordinate, ein überflüssiger
Ausnahmeeintrag, eine umbenannte Station.

### Was der Wächter nicht bewacht

Damit der grüne Haken nicht mehr verspricht, als er hält:

- **Eigene Orte ab Nr. 165, Korrekturen und Ausblendungen.** Die liegen im
  localStorage und in Supabase, nicht in den Dateien. Der CI sieht sie nie; dafür
  gibt es `/wache/` im Gerät, das dieselben Regeln aus `src/lib/wache.ts` auf den
  gespeicherten Stand anwendet.
- **Dass Kacheln ankommen und lateinisch beschriftet sind.** Geprüft wird der
  Fehlerfall, und der wird jetzt sogar erzwungen. **Dass ein Marker an der Stelle
  sitzt, die seine Koordinate vorgibt, wird dagegen seit der Größenreparatur
  gerechnet** — gegen Web-Mercator, nicht gegen die Nachbarmarker.
- **Dass Google die Maps-URLs annimmt.**
- **Den Abgleich gegen echtes Supabase.** Läuft bis heute nur gegen die Attrappe.
- **Das ausgelieferte Bundle in den Browsersuiten.** Mehrere brauchen den
  Dev-Server, weil sie `import('/src/lib/…')` aufrufen — diesen Pfad löst nur Vite
  auf. `npm run build` läuft mit, die Suiten sehen den Dev-Stand.

### Zwei Instanzen eines Moduls — der Fehler, der vom Alter des Servers abhing

Am 22.09.2026 fielen drei Suiten gleichzeitig, ohne dass sich der Code geändert
hatte. Ursache: **Vite bedient dasselbe Modul unter mehreren URLs.** Nach einer
Neu-Optimierung tragen die Importe einer Insel ein `?v=<hash>`; ein
`import('/src/lib/store.svelte.ts')` **ohne** diesen Anhang ist dann eine zweite
Instanz des Moduls mit ihrem eigenen `$state`.

Die Suiten schrieben also in einen Plan, den die Komponente nie liest. Gemessen:
`.daytab .dot` blieb nach dem Schreiben leer, der Tag zeigte keine Orte, und die
Routenzeile erschien **zu Recht** nicht — die Prüfung meldete einen Fehler in der
App, der keiner war. Nachgewiesen mit `import('…store.svelte.ts')` gegen
`import('…store.svelte.ts?x=1')`: ein Modul, zwei Zustände.

Das Tückische ist die Abhängigkeit vom **Zustand der Umgebung**: Auf einem frisch
gestarteten Dev-Server — also im CI — lief es, nach Stunden Laufzeit nicht mehr.
Dieselbe Klasse Fehler wie die Kachelsperre, die einmal vorgefunden statt erzwungen
wurde, nur andersherum.

Seitdem läuft jeder Schreibvorgang auf den Plan über `planSchreiben()` in
`test/browserlauf.mjs`: localStorage setzen, Seite neu laden. Aus dem localStorage
liest `load()` beim Start **selbst**, und es gibt ihn nur einmal je Ursprung.

**Für das Freundebuch ging dieser Weg nicht** — `buch` liegt nicht im
localStorage. Dort hängt die Insel im Entwicklungsmodus ihre eigene Instanz an
`globalThis.__buch` (`freundebuch.svelte.ts`, hinter `import.meta.env.DEV`), und
`buchSchreiben()` schreibt dorthin. Es ist also **die** Instanz, die die Komponente
liest; eine zweite gibt es nicht. Dass der Haken nicht mitgeliefert wird, prüft
`test/dist.test.ts` gegen `dist/` — Gegenprobe: `DEV` durch `true` ersetzen, die
Prüfung fällt. Ein Prüfhaken im Bündel wäre eine Hintertür: Jeder Besucher könnte
über `window.__buch` den angezeigten Bilderstrom verändern.

Dass es diesen Weg braucht, hat sich sofort bestätigt: Die Suite lief, ich habe
eine Zeile in `vorlagen.ts` geändert — an einer **anderen** Datei —, und sie fiel,
weil Vite neu optimiert hatte. Mit dem Haken übersteht sie dieselbe Änderung.

**Eine Prüfung, die es nicht geben kann.** In `test/dist.test.ts` stand kurz „das
Anmeldepasswort kommt im Bündel nicht vor". Sie schlug sofort an — das Passwort ist
ein gewöhnliches japanisches Gericht und steht achtmal im Reiseband
(„Yakitori-Stände im Grillrauch"), also auf genau den öffentlich erreichbaren
Seiten. Eine Prüfung, die immer anschlägt, wird abgeschaltet und schützt danach
nichts; sie ist wieder raus. Der Punkt ist kein Testproblem: Ein Passwort, das als
Wort auf der eigenen Seite steht, ist geraten, bevor jemand einen Angriff
versucht.

**Ein Nebenbefund dabei, noch offen:** `normalisiereOrt()` verwirft beim Laden
jeden eigenen Ort mit `lat > 90` (`store.svelte.ts:157`). Ein Ort mit vertauschten
Koordinaten — genau der Fall, vor dem `/wache/` warnt — **verschwindet damit beim
nächsten Laden stillschweigend**, statt gemeldet zu werden. Der Befund ist also nur
in der Sitzung sichtbar, in der der Ort angelegt wurde. Ob Verwerfen oder Behalten
richtig ist, ist eine Entscheidung und keine Reparatur; sie steht aus.

## Das Reiseband auf der Startseite: ein Akkordeon

Der Band ist rund 14.650 Wörter und lag als durchlaufender Volltext auf der
Startseite — auf einem 390-px-Schirm eine Schriftrolle, durch die man scrollt, um von
Osaka nach Hakone zu kommen. Die Seitenhöhe liegt jetzt bei **7.267 px** statt rund
33.000. Je Kapitel eine Klappe mit Kanji, Nummer und Beiname aus `stations.json`; in
den sechs Stationen darin drei Abschnitte (Hintergrund, Klassiker, Essen), bei Osaka
ein vierter für den Dorogawa-Ausflug. Offen bleiben zwei Dinge, die man beim Öffnen
einer Station zuerst braucht: der Verweis in den Planer („38 Orte in Osaka —
ansehen") und die Übergangszeile zum nächsten Kapitel.

`public/reiseband.html` bleibt durchlaufender Text. Ein zugeklapptes `<details>`
druckt nicht; wer die Datei aufs Papier gibt, bekäme sonst elf Überschriften.

### Die mobile Fassung (22.09.2026)

Eine neuere Vorlage kam, und wieder wurde die **Form** übernommen und nicht die
Datei. Fünf Dinge sind dazugekommen, alle in `build-data.mjs` erzeugt:

| Was | Statt | Warum |
|---|---|---|
| `.m-cover` — dunkler Verlaufsdeckel, `.kpi`-Zeile, angeschnittenes 旅 | `.cover2`, hell, `table.facts` | Auf 390 px ist der Deckel die erste und einzige Fläche vor dem ersten Wisch |
| `.m-nav` — **klebende** Kanji-Leiste, sechs Stationen, Scroll-Markierung | `.bandsprung`, unbewegliche Textzeile | Bei 14.650 Wörtern ist „wie komme ich nach Hakone" keine Frage, die man einmal am Seitenanfang stellt |
| `.mcards`/`.mrow`/`.mlbl`/`.mval` — 18 Kartenblöcke, 77 Zeilen, 191 Werte | 19 Tabellen in `.bandtabelle`-Scrollrahmen | `table.data` ist bei 390 px **532 px** breit. Der Rahmen war die Notlösung, die Auflösung ist die Behebung |
| `a.app-orte` dunkel wie der `.planer`-Knopf der Vorlage | heller Kasten mit rotem Balken | Auf Papier ist hell richtig, auf dem Schirm ist es ein Knopf. Deshalb nur im Stylesheet der Lesefassung umgekleidet, nicht in `listLink()` |
| `.m-top` — runder Knopf ab 700 px | fehlte | — |

**Was aus den Daten kommt und nicht aus der Vorlage:** die Kennzahlen des Deckels
(`trip.json`, `stations.json`, `places.json` — die Vorlage hat „3 · 19 · 6 · 164"
als getippten Text), die Kanji der Leiste (`stations.json` hält für Kyoto 形, die
Vorlage 雅), die Ortszahlen der Planer-Knöpfe und `?station=<slug>`. Die Schrift
des Deckels steht auf **16 px** statt der 15,5 px der Vorlage: Unter 16 px zoomt
iOS beim Antippen, und das ist eine Regel des Projekts.

**Der Rand als Token.** Deckel und Leiste stehen randlos und müssen dafür den
Innenabstand von `main.inner` zurücknehmen. Erst stand dort ein festes `-16px` —
bei 14 px Rand ragten beide zwei Pixel über den Schirm, und die Startseite
scrollte quer. Jetzt führt `tokens.css` `--seitenrand` (16 px, unter 767 px
14 px), `Base.astro` benutzt es, und das Bandstylesheet nimmt genau diesen Wert
zurück. Eine geratene Zahl war der ganze Fehler.

**Die Kollision mit der App-Kopfzeile.** `.topbar` ist selbst
`sticky; top: 0; z-index: 100`. Die Leiste klebt deshalb bei `var(--nav-h)` und
bleibt unter `z-index: 100` — bei `top: 0`, wie in der Vorlage, verschwände sie
dahinter. Sichtbar wäre das nur auf dem Gerät, deshalb misst
`browser-reiseband.mjs` nach 1800 px Scrollen, ob ihre Oberkante auf der
Unterkante der Kopfzeile sitzt (± 2 px). Gegenprobe: `position: static` → fällt.

**Sechs Chips, elf Anker.** Die Leiste führt nur die Stationen; die fünf Kapitel
ohne Station behalten ihre Sprungmarke am `<details>`, und `paths.ts:kapitel()`
trifft sie weiter. Die Prüfung fährt alle elf einzeln an.

**Erzeugt und nicht kopiert.** Die Vorlage kam als fertige HTML-Datei. Sie
einzusetzen wäre schneller gewesen, hätte aber Inhalt gelöscht: 19 Probier-Tabellen,
die fünf Blöcke „Weitere Optionen — ohne Nummer, **nur hier im Buch**" (die haben
keine Koordinaten, stehen in keiner anderen Datei und wären ersatzlos weg), fünf
Kapitelanker und rund 715 Wörter. Übernommen ist deshalb die Form, der Inhalt kommt
weiter aus `data/source/` — eine Korrektur dort landet wie bisher automatisch im
Band. Vom CSS der Vorlage sind nur die Token-Namen umgeschrieben: Ihre mobile Fassung
führt `--karte`, `--linie`, `--ai60` mit denselben Werten wie `--card`, `--line`,
`--ai-60`, und zwei Namen für eine Farbe ist die Doppelung, an der Stylesheets
verrotten.

### Ein Fehler, den keine Zählung gesehen hat

Die erste Fassung schnitt den Kapiteltext an den Positionen der `<h3>`. Das geht gut,
solange die Überschrift ein **direktes Kind** ist — „Der Guide" und „Essens-Fokus"
sind es. Osakas „Tagesausflug" steckt eine Ebene tiefer, in `div.daytrip`. Der Schnitt
zerriss das `div`: vorn ein offenes, hinten ein überzähliges Tag.

Die Bilanz der Datei blieb dabei **ausgeglichen**, 374 `<div>` auf 374. Jede
Zählprüfung schwieg. Sichtbar wurde es erst im Browser, und zwar durch Vergleich mit
`git show HEAD:` — vorher lagen 11 von 11 Kapiteln in `.bandtext`, danach 5. Der
HTML-Parser schloss den Behälter vorzeitig, und ab Kyoto stand der halbe Band
außerhalb dessen, woran das Bandstylesheet gebunden ist. Dazu traf die Regel
`.bandtext section[id]` nichts mehr: gültiges CSS, das ins Leere zeigte.

Behoben über `kindGrenze()`: geschnitten wird nur, wo ein direktes Kind beginnt. Dazu
zwei unabhängige Netze, beide gegengeprobt:

- **`build-data.mjs` prüft jede Klappe einzeln** auf Paarigkeit. Erst auf
  Kapitelebene geprüft — das war zu grob, und die Gegenprobe hat es bewiesen: Ein
  Schnitt unbalanciert die zwei Teilabschnitte, aber beide liegen im selben Kapitel,
  die Summe stimmte weiter, das Loch ging durch.
- **`browser-reiseband.mjs` zählt die Kapitel ausdrücklich innerhalb von
  `.bandtext`** und vergleicht mit der Zahl im Dokument. Mit beiden Löchern gebohrt
  schlagen dort sechs Prüfungen an, darunter „19 Tabellen — 5".

Ein Ankersprung (`paths.ts:kapitel('kyoto')` → `/Japan/#kyoto`) klappt das Kapitel
auf; ohne das landet man richtig und sieht eine zugeklappte Zeile.

**Und ein Fehler in der Prüfung dazu, gefunden im CI.** Die erste Fassung verlangte
„die Überschrift steht weniger als 200 px von oben". Hier lief das durch, auf dem
Runner fiel es — aus demselben Grund: Die Zahl hängt an Dingen, die mit der
Zusicherung nichts zu tun haben. Der Band setzt `scroll-behavior: smooth`, der Sprung
ist also animiert, und ein Hashwechsel auf der geladenen Seite landet anders als ein
frischer Aufruf mit Anker. Isoliert nachgemessen waren es 260 px statt der
behaupteten 200. Jetzt wird gewartet, bis die Position **stehen bleibt**, und geprüft
wird die Sache selbst: Klappe offen, Überschrift im Fenster. Eine Pixelzahl war die
falsche Form der Behauptung.

## Google Maps: was geht und was nicht

Gefragt war eine Schnittstelle, die die Karte in der Maps-App automatisch aktuell
hält. **Die gibt es nicht.** Google hat keine Schreib-Schnittstelle für My Maps —
die Maps Engine API, die das konnte, wurde Anfang 2016 abgeschaltet —, und für die
gespeicherten Listen in der App hat es nie eine gegeben. Niemand kann Orte in eine
fremde Maps-App schreiben. Was es gibt, sind **Maps URLs**: dokumentiert,
kostenlos, ohne Schlüssel, und sie öffnen auf dem Telefon die App.

Daraus sind zwei Wege gebaut, und beide sind manuell — das ist die Grenze, nicht
eine Bequemlichkeit:

**1. Die Tagesroute als Link** (`src/lib/mapsexport.ts`, `routenLinks()`). Im
Tagesplan stehen an jedem Tag mit mindestens zwei Orten zwei Links, „zu Fuß" und
„ÖPNV" — in Japan ist der zweite meist der richtige. Sie öffnen Googles
`dir`-Endpunkt mit den geplanten Orten in der geplanten Reihenfolge.

- **Geteilt bei langen Tagen.** Das URL-Format nimmt neun Zwischenziele, also elf
  Halte je Link. Ein Tag mit vierzehn Orten wird zu „Teil 1 / Teil 2", und die
  Teile **überlappen**: Der letzte Halt von Teil 1 ist der Start von Teil 2. Ohne
  diese Überlappung fehlte genau das Wegstück dazwischen — eine Lücke, die man
  erst merkt, wenn man davorsteht. Die Neun steht als `MAX_ZWISCHENZIELE` an einer
  Stelle; sie ist aus dem Gedächtnis, weil der Proxy dieser Umgebung Google
  vollständig sperrt, und wenn sie falsch ist, ist dort die einzige Zeile.
- **Nur Koordinaten, keine `place_id`.** Googles `waypoint_place_ids` verlangt
  genauso viele Einträge wie `waypoints`; eigene Orte haben nie eine, Nr. 98
  („Ashinoko Club") auch nicht. Eine Liste mit Lücken würde Google verwerfen oder
  die Reihenfolge verschieben. Für einen **einzelnen** Ort nimmt `maps()` in
  `paths.ts` die `placeId` weiterhin mit — dort ist sie richtig.

**2. Eine KML aus dem aktuellen Stand** (`kml()`, Knopf auf `/orte/`). Der
Unterschied zur verlinkten `public/Japan-Karte-2026.kml` ist der ganze Zweck: Die
statische Datei ist bytegleich mit dem ursprünglichen My-Maps-Export und kennt
**keinen** eigenen Ort, keine Korrektur und keine Ausblendung. Die erzeugte kennt
alle drei. Gegliedert nach Station als `<Folder>`, dazu `<ExtendedData>` mit `nr`,
`station`, `kategorie`, `reisetag`, `freundestipp`, `buch`, `schliesstag` — Google
Earth achtet auf die Ordner, My Maps flacht beim Import ab und färbt über eine
Spalte, deshalb beides. Ein Import in My Maps **ergänzt** eine Ebene; die alte muss
dort gelöscht werden.

**Zwei Umkehrungen, an denen man sich schneidet**, und beide werden in vitest in
beide Richtungen geprüft: Maps-URLs wollen `lat,lng`, KML will `lng,lat`. Und CSS
ist `#rrggbb`, KML ist `aabbggrr` — Alpha vorn, Rot und Blau getauscht. Ein
verdrehtes Paar sieht plausibel aus und landet im Meer vor Somalia; ein
verdrehtes Zinnoberrot wird blau.

**Was von hier aus nicht prüfbar ist und deshalb nicht behauptet wird:** dass
Google die URLs annimmt und die App sich öffnet, dass die Grenze wirklich bei neun
Zwischenzielen liegt, und wie My Maps den Import darstellt. Der Proxy sperrt Google
vollständig — dieselbe Sperre wie bei den Kachelhosts. Prüfbar ist restlos, was
**vor** dem Absenden passiert, und das prüft `npm run test:maps`: Anzahl der Links,
Reihenfolge und Koordinatenrichtung der Halte, die Naht zwischen den Teilen, und
dass die erzeugte KML den eigenen Ort enthält und den ausgeblendeten nicht.

**Am Telefon abzunehmen:** ein Tagesroutenlink öffnet die Maps-App mit der
richtigen Reihenfolge, und die erzeugte KML importiert in My Maps ohne Fehler.

## Wo etwas steht — und warum dort

Die Startseite trug unter dem Reiseband einmal drei Zusammenfassungsblöcke. Zwei
sind weitergezogen, weil sie beim Planen gebraucht werden und hinter ~14.650
Wörtern Bandtext niemand sie dort sucht:

- **Die fünf Etappen** stehen im Tagesplan, am jeweiligen Umzugstag — mit
  Richtung, Verbindung, Dauer **und dem Buchungsstand der Fahrt**. Der Haken dort
  schreibt in `plan.bookings`, also denselben Zustand, den die
  Organisation-Ansicht setzt: ein Zustand, nicht zwei. Die Zuordnung Etappe →
  Buchung steht als `booking`-Feld in `src/data/legs.json` und nennt die `id` aus
  `bookings.json`. Ausdrücklich als Referenz und nicht über `due === date`
  hergeleitet — die vier Fristen treffen heute zufällig die Etappentage, aber ein
  zweiter Transporteintrag mit derselben Frist tauchte dann still im Etappenblock
  auf. `test/legs.test.ts` prüft die Verknüpfung in **beide** Richtungen, auch die
  wichtigere: Kommt eine Transportbuchung dazu, deren Frist ein Umzugstag ist,
  muss die Etappe sie nennen.
- **Die Ortszahlen** sind im Ortspool des Planers zu Werkzeug geworden: Die
  Kategoriechips tragen ihre Anzahl, ein ★-Chip filtert die Freundestipps, und die
  Zählzeile nennt, wie viele der Vorschläge **an diesem Wochentag** geschlossen
  haben. Nicht „wie viele irgendwann einen Schließtag haben" — das stand so auf
  der Startseite und ist vor einem Klick keine Entscheidungshilfe.
- **Die zwei Erklärtexte** („141 von 164 Orten", „Nummern wie im Buch") stehen auf
  `/orte/`, wo sie die Zahl erklären, die dort steht. Und zwar in `orte.astro`
  statt in `PlaceExplorer.svelte`: Die Insel läuft `client:only`, ihr Markup ist
  nicht im ausgelieferten HTML — der KML-Download wäre von JavaScript abhängig.
  Er war repoweit die **einzige** Stelle, die `trip.kmlFile` verlinkt; wäre er mit
  der Section verschwunden, hätte niemand die Datei mehr erreicht und kein Test
  hätte angeschlagen.

Bei Facettenzählern gilt eine Regel, die leicht bricht: **jede Facette ignoriert
ihre eigene Dimension und beachtet die anderen.** Zählte die Chipzahl auf `pool`
statt auf `poolBasis`, stünde nach dem ersten Klick auf allen anderen Chips eine
Null — die Liste wird ja korrekt kürzer, nur die Zahlen lügen.
`test/browser-plan.mjs` wählt deshalb einen Chip ab und sieht danach wieder hin.

### Totes CSS

`src/pages/index.astro` hatte nach zwei Umbauten rund 160 Zeilen CSS für Elemente,
die es nicht mehr gibt — erst der App-Hero, dann die Kapitelkacheln. Im Build fällt
das nicht auf: Astro und Vite entfernen unbenutzte Regeln nicht, und anders als bei
Svelte-Komponenten warnt niemand über unbenutzte Selektoren in einer `.astro`-Datei.

`test/startseite-css.test.ts` vergleicht die Klassenselektoren im lokalen
`<style>`-Block mit den Klassen im Markup und nennt die Differenz. Ausgenommen sind
`:global(…)`-Regeln — die binden Klassen aus dem Reiseband, das über `set:html`
hereinkommt; das ist die Grenze der Prüfung und steht dort so.

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
npm run test:karte       # Kartenhintergrund: Fehlerfall, Rückfall, Hinweis
npm run test:suche       # Suche gegen die Filter, Bildwahl
npm run test:korrekturen # Orte bearbeiten und ausblenden
npm run test:band        # das Reiseband auf der Startseite
npm run test:plan        # Tagesplan: Etappen, Buchungshaken, Chipzahlen
npm run test:buch        # Freundebuch, angemeldet
npm run test:tagebuch    # die öffentliche Gästeansicht
npm run test:maps        # Tagesroute als Maps-Link, KML aus dem Live-Stand
npm run wache:daten      # nur die Ortsdaten — ohne Netz, ohne Browser, in Sekunden
npm run test:wache       # die Selbstprüfseite /wache/
```

Die Browsertests laufen mit Playwright im iPhone-13-Format gegen den Dev-Server.
Sie prüfen, was nur ein Browser zeigt: Querscrollen, Größe der Tippziele,
Leaflet überhaupt.

Drei Eigenheiten des Dev-Servers, über die man dabei stolpert:

1. Er hängt eine `astro-dev-toolbar` in die Seite, und darin stecken
   Eingabefelder und eine Auswahlliste. Playwrights Selektoren durchstoßen
   Shadow-Grenzen und finden sie — Prüfungen auf „kein `input` auf der Seite"
   laufen deshalb über `document.querySelectorAll`.
2. `MapView` setzt `zoomControl: !L.Browser.mobile`: im iPhone-Profil gibt es
   keine Zoomknöpfe, und eine Zweifingergeste lässt sich mit Playwright nicht
   sinnvoll nachbilden.
3. **`npm run build` nicht laufen lassen, während der Dev-Server läuft.** Der
   Build schreibt `node_modules/.vite` neu, der laufende Server behält seinen alten
   Modulgraph, und die Islands scheitern an „Failed to fetch dynamically imported
   module". Das sieht nach einem Fehler in der Sache aus — die Seite lädt, die
   Insel bleibt leer, der Test meldet fehlende Elemente. Abhilfe: Server neu
   starten. Derselbe Stolperstein hat schon einmal zu einer falschen Diagnose
   geführt („neue Knöpfe verdrängen den Umschalter" — es war Vites „504 Outdated
   Optimize Dep").

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
