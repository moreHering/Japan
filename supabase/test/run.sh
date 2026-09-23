#!/usr/bin/env bash
#
# Prüft Schema, Nummernvergabe und Zugriffsregeln gegen einen lokalen Postgres.
#
# Die Migrationen laufen in der Produktion gegen Supabase, wo auth.users und
# auth.uid() vorhanden sind. Hier bildet local-auth-stub.sql beides nach, damit
# die Row-Level-Security wirklich geprüft wird und nicht nur plausibel aussieht.
#
#   supabase/test/run.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

PGDATA=${PGDATA:-/tmp/japan-pgdata}
PORT=${PORT:-55432}
SOCK=/tmp
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)

if [ -z "$BIN" ]; then
  echo "Kein Postgres gefunden. Installieren mit: apt-get install -y postgresql" >&2
  exit 1
fi

lauf() { psql -h "$SOCK" -p "$PORT" -U postgres -d postgres -q "$@"; }

# Server starten, falls er nicht bereits läuft
if ! pg_isready -h "$SOCK" -p "$PORT" -q 2>/dev/null; then
  echo "Starte Postgres auf Port $PORT …"
  rm -rf "$PGDATA"
  mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA" 2>/dev/null || true
  su postgres -c "$BIN/initdb -D $PGDATA -A trust -U postgres" > /dev/null
  su postgres -c "$BIN/pg_ctl -D $PGDATA -o '-p $PORT -k $SOCK' -l $PGDATA/log start" > /dev/null
  sleep 2
fi

# Setzt die Datenbank auf den Stand „frisch migriert".
#
# Muss vor **jeder** Gegenprobe laufen, und das ist kein Luxus: schema-test.sql
# prüft als Erstes, dass die Nummernsequenz bei 1001 beginnt. Ein zweiter Lauf auf
# derselben Datenbank scheitert deshalb immer an dieser Prüfung — eine Gegenprobe,
# die bloß den Rückgabewert ansieht, hätte also aus dem falschen Grund bestanden
# und die Löcher nie geprüft. (Genau so lief die RLS-Gegenprobe vorher.)
frisch() {
  # `2>&1` überall: psql schreibt die „drop cascades to …"-Meldungen auf stderr,
  # und ohne Umleitung übertönen sie das Ergebnis der Gegenproben vollständig.
  lauf -c "drop schema if exists public cascade; create schema public;" > /dev/null 2>&1
  lauf -c "drop schema if exists auth cascade;" > /dev/null 2>&1
  lauf -c "drop schema if exists storage cascade;" > /dev/null 2>&1
  lauf -f test/local-auth-stub.sql > /dev/null 2>&1
  for datei in migrations/*.sql; do
    lauf -v pw=test-passwort -f "$datei" > /dev/null 2>&1
  done
}

echo "Setze Schema zurück …"
lauf -c "drop schema if exists public cascade; create schema public;" > /dev/null
lauf -c "drop schema if exists auth cascade;" > /dev/null
lauf -c "drop schema if exists storage cascade;" > /dev/null

echo "Spiele Stub und Migrationen ein …"
lauf -f test/local-auth-stub.sql > /dev/null

for datei in migrations/*.sql; do
  echo "  $datei"
  lauf -v pw=test-passwort -f "$datei" 2>&1 \
    | grep -E "NOTICE:.*(Konten|Passwort)" | sed 's/^/    /' || true
done

echo ""
echo "Prüfungen:"
lauf -f test/schema-test.sql 2>&1 | grep -E "NOTICE:|Alle Prüfungen|FEHL" | sed 's/psql:[^ ]* //; s/NOTICE:  /  · /'

echo ""
echo "Gegenproben — schlagen die Prüfungen an, wenn man ein Loch reißt?"

# Sieht auf die **Meldung**, nicht auf den Rückgabewert. Ein Fehlschlag allein
# beweist nichts: schema-test.sql kann an einer ganz anderen Prüfung scheitern,
# und dann bestätigt die Gegenprobe etwas, das sie nie gemessen hat.
loch() {
  # $1 Beschreibung · $2 erwartete Meldung · $3 Loch aufreißen · $4 schließen
  frisch
  # `|| true` ist hier Pflicht, nicht Schlamperei: Das Skript läuft mit `set -e`,
  # und eine Zuweisung aus einem fehlschlagenden Befehl beendet es sofort. Genau
  # dieser Fehlschlag ist aber das, was die Gegenprobe messen will — ohne das
  # brach der Lauf still mit psql-Rückgabewert 3 ab, noch vor der ersten Ausgabe.
  lauf -c "$3" > /dev/null 2>&1 || true
  AUSGABE=$(lauf -f test/schema-test.sql 2>&1 || true)
  lauf -c "$4" > /dev/null 2>&1 || true

  if grep -q "$2" <<< "$AUSGABE"; then
    echo "  · ja — $1"
    return 0
  fi
  if grep -q "Alle Prüfungen bestanden" <<< "$AUSGABE"; then
    echo "  FEHLER: $1 fällt nicht auf — der Test bleibt grün." >&2
  else
    echo "  FEHLER: $1 — der Test scheitert, aber mit einer anderen Meldung:" >&2
    grep -E "FEHLGESCHLAGEN|ERROR|^    - " <<< "$AUSGABE" | head -4 >&2
  fi
  exit 1
}

loch "abgeschaltete RLS" \
  "Tabelle(n) ohne RLS" \
  "alter table public.plan_days disable row level security;" \
  "alter table public.plan_days enable row level security;"

loch "anon darf den Plan lesen" \
  "Gast konnte plan_days lesen" \
  "grant select on public.plan_days to anon;
   create policy tmp_loch on public.plan_days for select to anon using (true);" \
  "drop policy if exists tmp_loch on public.plan_days;
   revoke all on public.plan_days from anon;"

loch "anon darf Beiträge schreiben" \
  "Gast konnte einen Beitrag anlegen" \
  "grant insert on public.guestbook_post to anon;
   create policy tmp_schreib on public.guestbook_post for insert to anon with check (true);" \
  "drop policy if exists tmp_schreib on public.guestbook_post;
   revoke insert on public.guestbook_post from anon;"

# Eine Policy **ohne** to-Klausel gilt für PUBLIC und damit auch für anon. Das
# ist die Falle, die man beim Schreiben einer Policy am leichtesten übersieht.
loch "eine Policy ohne to-Klausel erreicht Gäste" \
  "Policy erreicht Gäste unerwartet" \
  "create policy tmp_public on public.expenses for select using (true);" \
  "drop policy if exists tmp_public on public.expenses;"

loch "die Bilderablage ist wieder privat" \
  "Bucket freundebuch ist nicht öffentlich" \
  "update storage.buckets set public = false where id = 'freundebuch';" \
  "update storage.buckets set public = true where id = 'freundebuch';"

echo ""
echo "Fertig."
