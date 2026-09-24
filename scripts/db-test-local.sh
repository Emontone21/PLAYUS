#!/usr/bin/env bash
#
# Corre las migraciones, el seed y los tests pgTAP contra un Postgres común,
# sin Docker ni Supabase CLI. Es el respaldo de `supabase test db` para
# entornos donde no se puede levantar el stack local de Supabase.
#
# Requisitos: psql, pg_prove y la extensión pgtap instalados
# (Debian/Ubuntu: apt install postgresql-16 postgresql-16-pgtap).
#
# Variables:
#   PGHOST, PGPORT, PGUSER, PGPASSWORD   conexión (el usuario tiene que ser superusuario)
#   TEST_DB                             nombre de la base efímera (default: playus_test)
#   KEEP_DB=1                           no borra la base al terminar
#   SKIP_SEED=1                         no aplica supabase/seed.sql
#
# Uso:
#   PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=postgres scripts/db-test-local.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DB="${TEST_DB:-playus_test}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"

psql_admin() { psql -v ON_ERROR_STOP=1 -X -q -d postgres "$@"; }
psql_test()  { psql -v ON_ERROR_STOP=1 -X -q -d "$TEST_DB" "$@"; }

echo "→ base efímera $TEST_DB"
psql_admin -c "drop database if exists \"$TEST_DB\" with (force)"
psql_admin -c "create database \"$TEST_DB\""

echo "→ shim de Supabase"
sed "s/\"playus_test\"/\"$TEST_DB\"/" "$ROOT/scripts/supabase-shim.sql" | psql_test -f -

echo "→ migraciones"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "   $(basename "$f")"
  psql_test -f "$f"
done

if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  echo "→ seed"
  psql_test -f "$ROOT/supabase/seed.sql"
fi

echo "→ tests pgTAP"
status=0
pg_prove -d "$TEST_DB" --ext .sql "$ROOT/supabase/tests/" || status=$?

if [[ "${KEEP_DB:-0}" != "1" ]]; then
  psql_admin -c "drop database if exists \"$TEST_DB\" with (force)"
fi

exit $status
