#!/usr/bin/env bash
#
# Prüft die Regionensuche aus .github/workflows/migrate.yml — ohne Netz.
#
# Der Schritt probiert Pooler-Adressen durch, bis eine antwortet. Die Logik
# steckt in Shell mit Anführungszeichen, einer Schleife und Maskierung; genau
# dort passieren Fehler, die man erst im CI-Lauf sieht. Hier läuft sie gegen
# ein psql, das sich wie die echten Pooler verhält:
#
#   falsche Region   → "Tenant or user not found"
#   richtige Region  → je nach Passwort Erfolg oder Authentifizierungsfehler
#
#   supabase/test/regionssuche-probe.sh
#
set -uo pipefail

ARBEIT=$(mktemp -d)
trap 'rm -rf "$ARBEIT"' EXIT

# --------------------------------------------------------------- Pseudo-psql

cat > "$ARBEIT/psql" <<'STUB'
#!/usr/bin/env bash
# Erwartet die Verbindung als erstes Argument. ECHTE_REGION und ECHTES_PW
# kommen aus der Umgebung des Tests.
ZIEL="$1"
echo "$ZIEL" >> "${MITSCHRIFT:-/dev/null}"

if [[ "$ZIEL" != *"aws-0-${ECHTE_REGION}.pooler.supabase.com"* ]]; then
  echo 'psql: error: connection to server failed: FATAL: Tenant or user not found'
  exit 2
fi

# Das Passwort steht umkodiert in der URL; für den Vergleich zurückwandeln.
ROH=$(python3 -c '
import re, sys, urllib.parse
m = re.search(r"://[^:]+:([^@]*)@", sys.argv[1])
print(urllib.parse.unquote(m.group(1)) if m else "")
' "$ZIEL")

if [ "$ROH" != "$ECHTES_PW" ]; then
  echo 'psql: error: connection to server failed: FATAL: password authentication failed for user'
  exit 2
fi

echo 1
STUB
chmod +x "$ARBEIT/psql"
export PATH="$ARBEIT:$PATH"

# ----------------------------------------------- Schritt aus dem Workflow ---

# Wird 1:1 aus migrate.yml gezogen, damit der Test nicht an einer Kopie prüft,
# die inzwischen abgewichen ist.
python3 - "$ARBEIT/schritt.sh" <<'PY'
import re, sys
quelle = open('.github/workflows/migrate.yml', encoding='utf-8').read()
block = re.search(r'- name: Verbindung aufbauen.*?\n        run: \|\n(.*?)\n      - name:', quelle, re.S)
if not block:
    sys.exit('Schritt "Verbindung aufbauen" nicht gefunden')
zeilen = [z[10:] if z.startswith(' ' * 10) else z for z in block.group(1).split('\n')]
open(sys.argv[1], 'w', encoding='utf-8').write('\n'.join(zeilen) + '\n')
PY

lauf() {
  # $1 echte Region, $2 echtes Passwort, $3 Passwort im Secret
  ECHTE_REGION="$1" ECHTES_PW="$2" \
  DB_URL="" DB_PASSWORD="$3" REGION="eu-central-1" PROJECT_REF="testprojekt" \
  GITHUB_OUTPUT="$ARBEIT/out" MITSCHRIFT="$ARBEIT/versuche" \
    bash "$ARBEIT/schritt.sh" 2>&1
}

fehler=0
pruefe() {
  if [ "$1" = "ja" ]; then echo "  ok    $2"; else echo "  FEHL  $2 — $3"; fehler=$((fehler + 1)); fi
}

echo "Regionensuche:"

# --- 1) Projekt liegt in der vorbelegten Region
: > "$ARBEIT/out"; : > "$ARBEIT/versuche"
AUSGABE=$(lauf eu-central-1 "geheim" "geheim")
pruefe "$([ $? -eq 0 ] && echo ja || echo nein)" "findet die vorbelegte Region" "$AUSGABE"
pruefe "$(grep -qc 'Region gefunden: eu-central-1' <<< "$AUSGABE" >/dev/null && echo ja || echo nein)" \
  "meldet die gefundene Region" "$AUSGABE"
pruefe "$([ "$(wc -l < "$ARBEIT/versuche")" = "2" ] && echo ja || echo nein)" \
  "hört nach dem Treffer auf zu suchen" "$(wc -l < "$ARBEIT/versuche") Versuche"

# --- 2) Projekt liegt woanders
: > "$ARBEIT/out"; : > "$ARBEIT/versuche"
AUSGABE=$(lauf ap-northeast-1 "geheim" "geheim")
pruefe "$(grep -q 'Region gefunden: ap-northeast-1' <<< "$AUSGABE" && echo ja || echo nein)" \
  "findet eine ferne Region" "$AUSGABE"
pruefe "$(grep -q 'dort liegt das Projekt nicht' <<< "$AUSGABE" && echo ja || echo nein)" \
  "nennt die erfolglosen Regionen beim Namen" ""
pruefe "$(grep -q '::notice::Region ist ap-northeast-1' <<< "$AUSGABE" && echo ja || echo nein)" \
  "schlägt vor, die Region festzuschreiben" ""

# --- 3) Richtige Region, falsches Passwort
: > "$ARBEIT/out"; : > "$ARBEIT/versuche"
AUSGABE=$(lauf eu-west-1 "richtig" "falsch")
pruefe "$(grep -q 'das Passwort nicht' <<< "$AUSGABE" && echo ja || echo nein)" \
  "unterscheidet falsches Passwort von falscher Region" "$AUSGABE"

# --- 4) Sonderzeichen im Passwort
: > "$ARBEIT/out"; : > "$ARBEIT/versuche"
AUSGABE=$(lauf eu-central-1 'p@ss:wort/#1' 'p@ss:wort/#1')
pruefe "$(grep -q 'Region gefunden' <<< "$AUSGABE" && echo ja || echo nein)" \
  "kommt mit @ : / # im Passwort zurecht" "$AUSGABE"
pruefe "$(grep -q '%40' "$ARBEIT/versuche" && echo ja || echo nein)" \
  "und kodiert sie für die URL um" "$(sed 's/:[^@]*@/:***@/' "$ARBEIT/versuche" | head -1)"

# --- 5) Projekt gibt es nirgends
: > "$ARBEIT/out"; : > "$ARBEIT/versuche"
AUSGABE=$(lauf gibtsnicht "geheim" "geheim")
pruefe "$(grep -q 'In keiner der geprüften Regionen' <<< "$AUSGABE" && echo ja || echo nein)" \
  "gibt auf, statt endlos zu suchen" ""
pruefe "$(grep -q 'pausiert' <<< "$AUSGABE" && echo ja || echo nein)" \
  "und nennt mögliche Gründe" ""

# --- 6) Das Passwort darf nicht im Klartext in der Ausgabe stehen
: > "$ARBEIT/out"; : > "$ARBEIT/versuche"
AUSGABE=$(lauf eu-central-1 "streng-geheim-42" "streng-geheim-42")
pruefe "$(grep -q 'streng-geheim-42' <<< "$(grep -v '^::add-mask::' <<< "$AUSGABE")" && echo nein || echo ja)" \
  "das Passwort steht in keiner Zeile außer der Maskierungsanweisung" ""

echo ""
if [ "$fehler" != "0" ]; then
  echo "$fehler Prüfung(en) fehlgeschlagen." >&2
  exit 1
fi
echo "Die Regionensuche verhält sich wie vorgesehen."
