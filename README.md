# playus

PWA para que un grupo de amigos juegue un minijuego distinto cada día y compita por el ranking del grupo.

Estado: **etapa 2** (auth anónima, grupos e invitaciones). Ver `PLAN.md` para las etapas y `DECISIONS.md` para las decisiones tomadas.

## Qué hay

```
src/
  app/
    page.tsx                landing: crear grupo o entrar con código
    g/[code]/               link de invitación → sesión anónima → nombre + avatar → adentro
    crear/                  crear un grupo
    (app)/hoy|grupo|perfil  las tres pestañas (hoy y perfil son placeholders)
  components/               avatar provisorio, formulario de nombre, botón de invitar, barra
  lib/supabase/             clientes (browser, server, middleware) y tipos de la base
  lib/groups*.ts            grupo actual (cookie) y acción de servidor
  middleware.ts             refresca la sesión en cada petición
e2e/invitacion.spec.ts      test Playwright del flujo completo
supabase/
  config.toml               configuración del stack local (auth anónima habilitada)
  migrations/
    20260924000001_schema.sql   tablas, checks, índices, trigger de perfil, realtime
    20260924000002_rls.sql      helpers security definer, privilegios y políticas
    20260924000003_rpc.sql      create_group, join_group, round_participants
  seed.sql                  grupo de prueba con 4 integrantes falsos y puntajes
  tests/                    tests pgTAP de esquema y políticas
scripts/
  db-test-local.sh          corre migraciones + seed + tests pgTAP sin Docker
  dev-local.sh              arma la base de desarrollo sin Docker
  supabase-shim.sql         lo mínimo de Supabase para un Postgres común
  mini-supabase/            emulador de Auth + REST para desarrollar sin Docker
```

## Levantarlo desde cero (con Docker)

Requisitos: Docker y Node 20 o más nuevo. El CLI de Supabase se usa con `npx`.

```bash
npm install
npx supabase start          # levanta Postgres, Auth, PostgREST, Realtime y Studio
npx supabase db reset       # aplica migraciones y seed
npx supabase test db        # corre los tests pgTAP de supabase/tests
```

Studio queda en `http://127.0.0.1:54323`. Ahí se ven las tablas y el seed (grupo "los del barrio", código `JUEGA7`).

Copiá `.env.example` a `.env.local` y completá `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` con lo que imprime `npx supabase status`. Después:

```bash
npm run dev                 # http://localhost:3000
npm run e2e                 # tests Playwright (con la app y Supabase levantados)
```

## Sin Docker

Alcanza con un Postgres local con pgTAP. El emulador `mini-supabase` cubre lo que la app usa (registro anónimo, tablas con RLS, RPC); no cubre email, realtime ni storage.

```bash
# Debian/Ubuntu
sudo apt install postgresql-16 postgresql-16-pgtap
sudo -u postgres psql -c "alter user postgres password 'postgres'"
export PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=postgres

scripts/db-test-local.sh                          # tests pgTAP (base efímera playus_test)
scripts/dev-local.sh                              # base playus_dev con migraciones y seed
node scripts/mini-supabase/keys.mjs > .env.local  # claves firmadas para el emulador
npm run dev:local-stack                           # emulador en :54321
npm run dev                                       # app en :3000
PW_CHROMIUM_PATH=/ruta/a/chromium npm run e2e     # opcional: usar un Chromium ya instalado
```

`scripts/db-test-local.sh` crea una base efímera, aplica `scripts/supabase-shim.sql` (roles, `auth.uid()`, `auth.users`, privilegios por defecto), las migraciones y el seed, y corre `pg_prove` sobre `supabase/tests`. `KEEP_DB=1` deja la base para mirarla; `SKIP_SEED=1` la deja sin seed. `scripts/dev-local.sh --reset` rehace la base de desarrollo.

## Modelo de datos en dos líneas

Un `group` tiene `group_members`, `seasons` de 30 días y una `round` por día. Cada `round` fija el `game_id` y la `seed` de ese día; cada jugador tiene hasta `max_attempts` `attempts` por ronda. RLS: se lee solo lo de los grupos propios, los puntajes de hoy se ven recién después de completar un intento, y `attempts`, `rounds` y `seasons` los escribe solo el servidor.
