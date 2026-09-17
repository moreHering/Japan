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

echo "Setze Schema zurück …"
lauf -c "drop schema if exists public cascade; create schema public;" > /dev/null
lauf -c "drop schema if exists auth cascade;" > /dev/null

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
echo "Gegenprobe — schlägt der Test bei abgeschalteter RLS an?"
lauf -c "alter table public.plan_days disable row level security;" > /dev/null
if lauf -f test/schema-test.sql > /dev/null 2>&1; then
  echo "  FEHLER: Der Test bemerkt fehlende RLS nicht." >&2
  exit 1
fi
echo "  · ja — der Test erkennt fehlende RLS"
lauf -c "alter table public.plan_days enable row level security;" > /dev/null

echo ""
echo "Fertig."
