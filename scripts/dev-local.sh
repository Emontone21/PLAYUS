#!/usr/bin/env bash
#
# Arma la base de desarrollo `playus_dev` en un Postgres común (sin Docker):
# shim de Supabase + migraciones + seed. Después:
#
#   npm run dev:local-stack   # mini-supabase en :54321
#   npm run dev               # Next en :3000
#
# Variables: PGHOST, PGPORT, PGUSER, PGPASSWORD, DEV_DB (default playus_dev).
# `--reset` borra la base y la vuelve a crear.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DB="${DEV_DB:-playus_dev}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"

psql_admin() { psql -v ON_ERROR_STOP=1 -X -q -d postgres "$@"; }
psql_dev()   { psql -v ON_ERROR_STOP=1 -X -q -d "$DEV_DB" "$@"; }

if [[ "${1:-}" == "--reset" ]]; then
  echo "→ borrando $DEV_DB"
  psql_admin -c "drop database if exists \"$DEV_DB\" with (force)"
fi

if psql_admin -tAc "select 1 from pg_database where datname = '$DEV_DB'" | grep -q 1; then
  echo "→ $DEV_DB ya existe (usá --reset para rehacerla)"
  exit 0
fi

echo "→ creando $DEV_DB"
psql_admin -c "create database \"$DEV_DB\""
sed "s/\"playus_test\"/\"$DEV_DB\"/" "$ROOT/scripts/supabase-shim.sql" | psql_dev -f -
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "   $(basename "$f")"
  psql_dev -f "$f"
done
echo "→ seed"
psql_dev -f "$ROOT/supabase/seed.sql"
echo "→ listo. claves para .env.local:"
node "$ROOT/scripts/mini-supabase/keys.mjs"
