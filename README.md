# playus

PWA para que un grupo de amigos juegue un minijuego distinto cada día y compita por el ranking del grupo.

Estado: **etapa 1** (esquema, RLS y tests de políticas). Todavía no hay app de Next.js; eso arranca en la etapa 2. Ver `PLAN.md` para las etapas y `DECISIONS.md` para las decisiones tomadas.

## Qué hay

```
supabase/
  config.toml               configuración del stack local (auth anónima habilitada)
  migrations/
    20260924000001_schema.sql   tablas, checks, índices, trigger de perfil, realtime
    20260924000002_rls.sql      helpers security definer, privilegios y políticas
    20260924000003_rpc.sql      create_group, join_group, round_participants
  seed.sql                  grupo de prueba con 4 integrantes falsos y puntajes
  tests/                    tests pgTAP de esquema y políticas
scripts/
  db-test-local.sh          corre migraciones + seed + tests sin Docker
  supabase-shim.sql         lo mínimo de Supabase para un Postgres común
```

## Levantarlo desde cero (con Docker)

Requisitos: Docker y Node 20 o más nuevo. El CLI de Supabase se usa con `npx`.

```bash
npx supabase start          # levanta Postgres, Auth, PostgREST, Realtime y Studio
npx supabase db reset       # aplica migraciones y seed
npx supabase test db        # corre los tests pgTAP de supabase/tests
```

Studio queda en `http://127.0.0.1:54323`. Ahí se ven las tablas y el seed (grupo "los del barrio", código `JUEGA7`).

Las credenciales locales las imprime `npx supabase status`. Copiá `.env.example` a `.env.local` y completá `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` con esos valores (la app las usa a partir de la etapa 2).

## Correr los tests sin Docker

Si no hay Docker, alcanza con un Postgres local con pgTAP:

```bash
# Debian/Ubuntu
sudo apt install postgresql-16 postgresql-16-pgtap
sudo -u postgres psql -c "alter user postgres password 'postgres'"

PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=postgres scripts/db-test-local.sh
```

El script crea una base efímera `playus_test`, aplica `scripts/supabase-shim.sql` (roles `anon`/`authenticated`/`service_role`, `auth.uid()`, `auth.users`, privilegios por defecto), las migraciones y el seed, y corre `pg_prove` sobre `supabase/tests`. `KEEP_DB=1` deja la base para mirarla; `SKIP_SEED=1` la deja sin seed.

## Modelo de datos en dos líneas

Un `group` tiene `group_members`, `seasons` de 30 días y una `round` por día. Cada `round` fija el `game_id` y la `seed` de ese día; cada jugador tiene hasta `max_attempts` `attempts` por ronda. RLS: se lee solo lo de los grupos propios, los puntajes de hoy se ven recién después de completar un intento, y `attempts`, `rounds` y `seasons` los escribe solo el servidor.
