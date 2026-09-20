# Prüfvorlagen

## `liberty-stil.json`

Der **echte** OpenFreeMap-Liberty-Stil, 111 Ebenen, davon 23 mit `text-field`.

**Herkunft:** `hyperknot/openfreemap-styles`, Datei `styles/liberty/style.json`,
geholt am 20.09.2026 über `raw.githubusercontent.com`. Das ist die Quellfassung;
die unter `https://tiles.openfreemap.org/styles/liberty` ausgelieferte ersetzt
darin nur den Platzhalter `__TILEJSON_DOMAIN__` durch den Kacheldienst. Die
Ebenen und ihre `text-field`-Ausdrücke sind dieselben, und nur um die geht es
hier.

**Warum er im Repo liegt und nicht geholt wird:** `tiles.openfreemap.org` ist aus
der Entwicklungsumgebung gesperrt (`connect_rejected` am Egress-Proxy), und eine
Prüfung, die das Netz braucht, ist keine Prüfung. Der Umweg über github hat
einmal funktioniert — das reicht für einen Schnappschuss, nicht für einen
Testlauf bei jedem Push.

**Was er beweist, was der erfundene Stil vorher nicht konnte:** Keine einzige der
23 Beschriftungsebenen hat die Form `['get', X]` oder `'{name}'`, die der alte
Handstil geprüft hat. Alle tragen `['case', …]` oder `['to-string', …]`. Die
alte Prüfung hat also eine Form zugesichert, die in der Wirklichkeit nicht
vorkommt.

**Er veraltet.** Ändert OpenFreeMap seinen Stil, prüft diese Datei den Stand von
2026. Das ist bewusst in Kauf genommen: Ein alter echter Stil sagt mehr als ein
erfundener neuer. Wer ihn auffrischt, sollte die Zahlen in `karte.test.ts`
(111 Ebenen, 23 Beschriftungen, 3 `ref`-Schilder) mit anpassen — sie stehen dort
ausdrücklich, damit eine Auffrischung auffällt statt durchzurutschen.
