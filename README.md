# Japan 2026 — Reiseplaner

Website zum Verwalten des Reiseplans für die Japanreise vom 26.09. bis 15.10.2026:
sechs Stationen, 19 Nächte, 164 Orte.

**Live:** https://morehering.github.io/Japan/

| Seite | Adresse | Zweck |
|---|---|---|
| Startseite | `/` | Tageszählung, **der Reiseband als Volltext** — elf Kapitel, direkt lesbar — und die sechs Stationen |
| Tagesplan | `/plan/` | 20 Reisetage — Orte zuordnen, sortieren, Notizen; warnt bei Schließtagen; am Umzugstag Etappe und Buchungsstand der Fahrt |
| Orte | `/orte/` | Alle Orte, filterbar, mit Karte im selben Bild; anlegen, bearbeiten, ausblenden; KML-Download |
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
