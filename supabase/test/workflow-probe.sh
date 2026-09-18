#!/usr/bin/env bash
#
# Fährt die psql-Schritte aus .github/workflows/migrate.yml gegen den lokalen
# Postgres — mit demselben Connection String in URI-Form.
#
# Was das prüft: dass die Aufrufe im Workflow syntaktisch stimmen und die
# Prüfabfragen wirklich laufen. Was es **nicht** prüft: Supabase. Dort gibt es
# zusätzlich das storage-Schema und eine andere auth-Implementierung; die
# Abfrage darauf ist deshalb im Workflow so gebaut, dass sie fehlen darf.
#
#   supabase/test/workflow-probe.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

PORT=${PORT:-55432}
SOCK=/tmp
ZIEL="postgresql://postgres@localhost:${PORT}/postgres"

if ! pg_isready -h "$SOCK" -p "$PORT" -q 2>/dev/null; then
  echo "Postgres läuft nicht. Erst 'npm run db:test' ausführen." >&2
  exit 1
fi

echo "Schritt „Verbindung aufbauen\":"
psql "$ZIEL" -v ON_ERROR_STOP=1 -tAc \
  "select 'verbunden mit ' || current_database() || ', ' || split_part(version(), ' on ', 1);" \
  | sed 's/^/  /'

echo ""
echo "Schritt „Migrationen einspielen\":"
for datei in migrations/*.sql; do
  echo "  ── $datei"
  psql "$ZIEL" -v ON_ERROR_STOP=1 -v pw="probe-passwort" -f "$datei" 2>&1 \
    | grep -E "NOTICE:.*(Konten|Bilderablage|Zugriffsregeln)" | sed 's/^/     /' || true
done

echo ""
echo "Schritt „Ergebnis prüfen\":"
psql "$ZIEL" -v ON_ERROR_STOP=1 -c "
  select c.relname as tabelle,
         c.relrowsecurity as rls,
         (select count(*) from pg_policies p
           where p.schemaname='public' and p.tablename=c.relname) as policies
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relkind='r'
   order by c.relname;" | sed 's/^/  /'

psql "$ZIEL" -v ON_ERROR_STOP=1 -c \
  "select name, farbe from public.profiles order by name;" | sed 's/^/  /'

echo "  Bilderablage:"
psql "$ZIEL" -tAc "
  select coalesce(
    (select 'vorhanden, ' || coalesce(file_size_limit, 0) / 1048576 || ' MB je Datei'
       from storage.buckets where id = 'freundebuch'),
    'FEHLT');" 2>/dev/null | sed 's/^/    /' \
  || echo "    storage-Schema nicht lesbar (lokal erwartet)"

OFFEN=$(psql "$ZIEL" -tAc "
  select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;")

echo ""
if [ "$OFFEN" != "0" ]; then
  echo "  $OFFEN Tabelle(n) ohne Row Level Security — der Workflow würde hier abbrechen." >&2
  exit 1
fi
echo "  Alle Tabellen haben Row Level Security."
echo ""
echo "Die Schritte des Workflows laufen durch."
