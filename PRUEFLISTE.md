# Was die App behauptet, ohne dass es wörtlich in den Quellen steht

Alles hier ist **abgeleitet** — aus Namensvergleich oder aus Textmustern im
Reiseband. Jede Zeile kann falsch sein.

Auf der Reise ist ein falsch markierter Ort schlimmer als ein fehlender.
Deshalb steht hier jede Ableitung einzeln, zum Nachprüfen.

## Noch offen

- **Chion-in Wajun Kaikan** (Kyoto, Nacht 1) steht in `stations.json`, aber
  nicht in den 164 Orten. Der Ort, an dem ihr die erste Nacht schlaft, ist
  also nicht auf der Karte. Sobald die Koordinate da ist, lege ich ihn an.
- **Kōya-san**: Die fünf Tempelherbergen Nr. 34–38 sind als erledigte
  Vorschläge eingestuft. Falls eine Nacht dort geplant ist, stimmt das nicht.
- **Die 📖-Liste unten** wird gerade gegen das Buch geprüft. Auffällig:
  Nr. 47 To-ji unter Erlebnis 26 „Arashiyama" — To-ji liegt rund 8 km
  südlich davon.
- **Eure Unterkünfte** in Kanazawa, Takayama und Hakone trägst du selbst
  über die Erfassungsmaske ein, mit dem Haken „hier schlafen wir".

Korrekturen trage ich in die kuratierten Dateien ein
(`data/source/buch-erlebnisse.json`, `data/source/unterkunft.json`); danach
`npm run data && npm run pruefliste`.

## 📖 Reiseführer-Kennzeichnung (72 Orte, 30 Erlebnisse)

Zugeordnet über den Namen. Ein falsches 📖 heißt: Der Ort steht im Buch gar nicht.

| Nr. | Ort | Erlebnis | Titel im Buch |
|---|---|---|---|
| 1 | Osaka-jo | 30 | Osaka-jo |
| 5 | Glico Running Man (Dotonbori) | 31 | Dotonbori und Kuromon |
| 7 | Kuromon-Markt | 31 | Dotonbori und Kuromon |
| 19 | Danjo Garan | 32 | Koyasan |
| 20 | Himeji-jo | 35 | Himeji-jo |
| 23 | Kongobu-ji | 32 | Koyasan |
| 24 | Nyonin-do | 32 | Koyasan |
| 25 | Okunoin-Friedhof | 32 | Koyasan |
| 29 | Akame-48-Wasserfälle (Fallback) | 33 | Akame |
| 30 | Akameguchi (Bahnhof für Akame) | 33 | Akame |
| 32 | Kobe Nunobiki Kräutergarten & Seilbahn | 34 | Kobe Nunobiki |
| 40 | Fushimi Inari Taisha | 23 | Fushimi Inari |
| 41 | Gion Corner | 25 | Gion und Kiyomizu-dera |
| 42 | Kinkaku-ji | 24 | Kinkaku-ji und Ryoan-ji |
| 43 | Kiyomizu-dera | 25 | Gion und Kiyomizu-dera |
| 45 | Ryoan-ji | 24 | Kinkaku-ji und Ryoan-ji |
| 46 | Tenryu-ji | 26 | Arashiyama |
| 47 | To-ji | 26 | Arashiyama |
| 54 | Arashiyama Bambushain | 26 | Arashiyama |
| 55 | Iwatayama-Affenpark | 26 | Arashiyama |
| 58 | Byodo-in (Uji) | 28 | Uji |
| 59 | Heijo-Palast (Nara) | 29 | Nara |
| 61 | Todai-ji (Nara) | 29 | Nara |
| 62 | Byodo-in Omotesando (Uji) | 28 | Uji |
| 64 | Tsuen Tea (Uji) | 28 | Uji |
| 65 | Taihoan (Uji) | 28 | Uji |
| 66 | Nara-Park (Rehe) | 29 | Nara |
| 73 | Nagamachi (Samurai-Viertel) | 18 | Kanazawa Samurai-Viertel |
| 74 | Nomura-Samurai-Haus | 18 | Kanazawa Samurai-Viertel |
| 79 | Sanmachi-Suji | 20 | Takayama Altstadt |
| 90 | Shirakawa-go (Ogimachi) | 19 | Shirakawa-go |
| 93 | Hakone-Schrein | 15 | Hakone |
| 97 | Ashi-See | 15 | Hakone |
| 107 | Gotoku-ji | 08 | Gotokuji und Soba |
| 108 | Meiji-Jingu | 05 | Meiji-Jingu und Shinjuku Gyoen |
| 112 | Senso-ji | 02 | Senso-ji und Nakamise |
| 113 | teamLab Borderless | 07 | teamLab |
| 114 | teamLab Planets | 07 | teamLab |
| 115 | 2D Café | 09 | Themen-Cafés |
| 116 | DAWN Avatar Robot Café | 09 | Themen-Cafés |
| 117 | First Airlines Ikebukuro | 09 | Themen-Cafés |
| 118 | Fukumuro-an (Soba) | 08 | Gotokuji und Soba |
| 119 | Nakamise-dori | 02 | Senso-ji und Nakamise |
| 124 | Pokémon Café Nihonbashi | 09 | Themen-Cafés |
| 125 | Samurai Restaurant Time | 09 | Themen-Cafés |
| 126 | Yadorigi Café (Katzencafé) | 09 | Themen-Cafés |
| 128 | at-home cafe Akihabara (Maid Café) | 09 | Themen-Cafés |
| 130 | Cat Street | 06 | Harajuku |
| 137 | STREET KART Shibuya | 10 | Street Kart |
| 138 | TAITO Station Akihabara | 03 | Akihabara |
| 139 | Takeshita-Straße | 06 | Harajuku |
| 140 | MAGNET by Shibuya109 (Dachterrasse) | 01 | Shibuya |
| 141 | Rathaus Shinjuku - Aussichtsplattform | 04 | Aussicht über Tokio |
| 142 | Shibuya Crossing | 01 | Shibuya |
| 143 | Shibuya Hikarie Sky Lobby | 01 | Shibuya |
| 144 | Shibuya Sky | 01 | Shibuya |
| 145 | Shinjuku Gyoen | 05 | Meiji-Jingu und Shinjuku Gyoen |
| 146 | Tokyo Skytree | 04 | Aussicht über Tokio |
| 150 | Cup Noodles Museum (Yokohama) | 12 | Yokohama |
| 152 | Kamakura: Hase-dera | 13 | Kamakura |
| 153 | Kamakura: Tsurugaoka Hachimangu | 13 | Kamakura |
| 154 | Kotoku-in (Kamakura) | 13 | Kamakura |
| 155 | Nikko Tosho-gu | 14 | Nikko |
| 156 | Nikko: Futarasan-Schrein | 14 | Nikko |
| 157 | Nikko: Shinkyo-Brücke | 14 | Nikko |
| 158 | Takao 599 Museum | 11 | Berg Takao |
| 159 | Yokohama: Kanteibyo-Tempel | 12 | Yokohama |
| 160 | Straw Hat Café (Ghibli Museum) | 09 | Themen-Cafés |
| 161 | Yokohama Chinatown: Zenrinmon-Tor | 12 | Yokohama |
| 162 | Mt. Takao | 11 | Berg Takao |
| 163 | Nikko: Kegon-Wasserfall | 14 | Nikko |
| 164 | Takao: Onsen Gokurakuyu | 11 | Berg Takao |

## Schließtage (11)

Aus Formulierungen wie „Di geschlossen" im Ortstext erkannt. Der Tagesplan
**warnt**, wenn ihr so einen Ort auf diesen Wochentag legt — ein falscher
Eintrag warnt also grundlos oder, schlimmer, gar nicht.

| Nr. | Ort | erkannt | Textstelle |
|---|---|---|---|
| 8 | New Matsuzaka Umeda 32 | Mi | NUR MIT RESERVIERUNG, MITTWOCHS GESCHLOSSEN |
| 16 | Semba Center Building | So | ACHTUNG: SONNTAGS GESCHLOSSEN, sonst 9-22 Uhr |
| 52 | Modoribashi Shashinkan | Do | 13-18 Uhr, Do geschlossen |
| 76 | Kanazawa Kominge Kaikan | Di | nur Bargeld, Di geschlossen |
| 110 | Schwertmuseum Ryogoku | Mo | Mo geschlossen |
| 118 | Fukumuro-an (Soba) | Mo | Mo geschlossen |
| 126 | Yadorigi Café (Katzencafé) | Mo | Mo geschlossen |
| 141 | Rathaus Shinjuku - Aussichtsplattform | Mo | Mo geschlossen |
| 145 | Shinjuku Gyoen | Mo | Mo geschlossen, ~500 Yen |
| 150 | Cup Noodles Museum (Yokohama) | Di | Di geschlossen, vorab buchen |
| 151 | Ghibli Museum | Di | Di geschlossen |

## Reservierung nötig (8)

| Nr. | Ort | Textstelle |
|---|---|---|
| 8 | New Matsuzaka Umeda 32 | NUR MIT RESERVIERUNG, MITTWOCHS GESCHLOSSEN |
| 41 | Gion Corner | vorab buchen |
| 56 | Daishin-in (Tempelübernachtung) | Reservierung NUR telefonisch auf Japanisch: 075-461-5714 |
| 72 | Myoryu-ji (Ninja-Tempel) | Nur mit telefonischer Reservierung |
| 124 | Pokémon Café Nihonbashi | Nur mit Reservierung (Online-Losverfahren, sehr begehrt) |
| 144 | Shibuya Sky | 000 Menschen pro Grünphase überqueren die Kreuzung unter euch — vom offenen Dach auf 229 m das beste Stadt-Panorama (Zeitfenster vorab buchen, Sonnenuntergang zuerst weg) |
| 150 | Cup Noodles Museum (Yokohama) | Di geschlossen, vorab buchen |
| 151 | Ghibli Museum | um 10 Uhr JST buchen |

## Nur Bargeld (5)

| Nr. | Ort |
|---|---|
| 3 | Cascade (Bäckerei) |
| 6 | Kokoro ni Amai Anpanya (Bäckerei) |
| 18 | Yamaka Toki (Geschirr) |
| 76 | Kanazawa Kominge Kaikan |
| 100 | Tenzan Onsen (Tagesbad) |

## Aus der App genommen: Übernachtungsvorschläge (23)

Weil für jede Station etwas gebucht ist. **Das ist meine Annahme, nicht eure
Buchungsbestätigung.** Steht hier eure tatsächliche Unterkunft dabei, gehört
sie zurück — dann sage mir welche.

| Nr. | Ort | Station | Bereich |
|---|---|---|---|
| 34 | Dorogawa Onsen (Ortszentrum) | Osaka | ausflug |
| 35 | Eko-in (Tempelübernachtung) | Osaka | ausflug |
| 36 | Ryokan Kadojin | Osaka | ausflug |
| 37 | Ryokan Misenkan | Osaka | ausflug |
| 38 | Sekishoin (Tempelübernachtung) | Osaka | ausflug |
| 56 | Daishin-in (Tempelübernachtung) | Kyoto | zentrum |
| 57 | Shunko-in (Tempelübernachtung) | Kyoto | zentrum |
| 67 | Jorenge-in (Ohara, Tempelherberge) | Kyoto | ausflug |
| 78 | Ryokan Sumiyoshiya | Kanazawa | zentrum |
| 83 | Antique Inn Sumiyoshi | Takayama | zentrum |
| 84 | Honjin Hiranoya Kofukan | Takayama | zentrum |
| 85 | Hotel Takayama Ouan | Takayama | zentrum |
| 86 | Iroriyado Hidaya | Takayama | zentrum |
| 87 | Minshuku Sosuke | Takayama | zentrum |
| 91 | Wanosato (Minka-Ryokan) | Takayama | ausflug |
| 101 | Bansuiro Fukuzumi (Ryokan) | Hakone | zentrum |
| 102 | Fuji-Hakone Guest House | Hakone | zentrum |
| 103 | Fukuzumiro (historisches Holz-Ryokan) | Hakone | zentrum |
| 104 | Gora Kansuirou | Hakone | zentrum |
| 105 | Kinnotake Tonosawa | Hakone | zentrum |
| 106 | Tonosawa Ichinoyu Honkan (Ryokan) | Hakone | zentrum |
| 148 | Ryokan Katsutaro | Tokio | zentrum |
| 149 | Ryokan Sawanoya (Yanaka) | Tokio | zentrum |

## Unterkünfte, die die App kennt

| Station | Was in stations.json steht | Als Ort in der App |
|---|---|---|
| Osaka | Airbnb, Chūō-ku | — keiner — |
| Kyoto | Nacht 1: Chion-in Wajun Kaikan (Tempel) · Nächte 2–3: Airbnb, Gion | — keiner — |
| Kanazawa | gebucht | — keiner — |
| Takayama | gebucht | — keiner — |
| Hakone | Onsen-Ryokan | — keiner — |
| Tokio | Airbnb, Shin-Ōkubo | Nr. 147 Shin-Ōkubo (Airbnb, gebucht) |
