# playus

PWA para que un grupo de amigos juegue un minijuego distinto cada día y compita por el ranking del grupo.

Estado: **etapa 6** (PWA y notificaciones). Ver `PLAN.md` para las etapas y `DECISIONS.md` para las decisiones tomadas.

## Qué hay

```
src/
  app/
    page.tsx                landing: crear grupo o entrar con código
    g/[code]/               link de invitación → sesión anónima → nombre + avatar → adentro
    crear/                  crear un grupo
    (app)/hoy               juego del día, partida (/hoy/jugar) y ranking en vivo
    (app)/grupo             tabla de la temporada, historial, integrantes (+ /integrante/[id]) e invitar
    (app)/perfil            nombre, avatar, estadísticas, apodos y email
    api/rounds/[id]/start   consume el intento y devuelve la semilla
    api/attempts/[id]/finish valida tiempo, cotas y traza, guarda el puntaje y avisa "te pasaron"
    api/push/reminders      recordatorio diario (lo llama el scheduler con CRON_SECRET)
    manifest.ts, sw.ts, ~offline  PWA: manifest, service worker (Serwist) y pantalla sin conexión
    dev/juego/[id]          solo desarrollo: probar un juego con una semilla, sin servidor
    dev/hoy                 solo desarrollo: simular el día siguiente
  avatar/                   piezas SVG, esquema zod, renderizador y editor del avatar
  games/                    contrato (types.ts), registry (index.ts), contenedor, juegos y README
  lib/rng.ts                hash de 32 bits + mulberry32: todo el azar de los juegos
  lib/deck.ts, scoring.ts   mazo por temporada y puntos 10/7/5/3/1 (puros, con tests)
  lib/rounds.ts, attempts.ts  rondas y temporadas perezosas; start/finish antitrampas
  lib/push.ts, push-client.ts, reminders.ts  Web Push: envío (VAPID), suscripción y recordatorios
  components/install-card.tsx, push-card.tsx  instalar la app y activar avisos
public/icons, screenshots   íconos (normal y maskable) y capturas del manifest
  components/               avatar, formulario de alta, invitar, barra, estadísticas
  lib/supabase/             clientes (browser, server, middleware) y tipos de la base
  lib/groups*.ts            grupo actual (cookie) y acción de servidor
  middleware.ts             refresca la sesión en cada petición
e2e/                        tests Playwright (invitación, perfil, juegos, ronda completa)
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
npm test                    # tests unitarios (vitest)
npm run e2e                 # tests Playwright (con la app y Supabase levantados)
```

Para probar un juego suelto: `http://localhost:3000/dev/juego/reflejo?seed=abc`. Para agregar uno: `src/games/README.md`. Para simular el día siguiente: `http://localhost:3000/dev/hoy` (o `DEV_FAKE_TODAY=AAAA-MM-DD` en `.env.local`).

## PWA y notificaciones

El service worker se genera solo en el build (`npm run build` → `public/sw.js`); en `npm run dev` no hay SW, así que instalación y push se prueban con `npm run build && npm run start` o en un deploy con HTTPS. Los datos nunca se sirven desde caché: `/api/*`, Supabase y las páginas van siempre a la red; sin conexión aparece `/~offline`.

Web Push necesita claves VAPID en `.env.local` (`npx web-push generate-vapid-keys`, una sola vez: cambiarlas invalida las suscripciones) y `CRON_SECRET`. El recordatorio diario lo dispara un scheduler cada 15 minutos llamando a `/api/push/reminders` con `Authorization: Bearer <CRON_SECRET>`:

- **Supabase (default):** la migración crea el job de `pg_cron` si la extensión está disponible. Falta configurar la URL y el secreto, una sola vez, en el SQL Editor:
  ```sql
  alter database postgres set app.settings.reminder_url = 'https://<tu-app>/api/push/reminders';
  alter database postgres set app.settings.cron_secret = '<CRON_SECRET>';
  ```
- **Vercel Pro:** alternativa sin `pg_cron`: un `vercel.json` con `{"crons":[{"path":"/api/push/reminders","schedule":"*/15 * * * *"}]}`. En el plan Hobby no alcanza (una corrida por día como máximo).

Para probar la PWA sin teléfono: `npm run build`, `npm run start -- --port 3001` y `E2E_PROD=1 E2E_BASE_URL=http://127.0.0.1:3001 npm run e2e -- e2e/pwa.spec.ts`.

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

Con el emulador, `npm test` corre también `src/lib/attempts.test.ts` (consumo de intentos contra la base); sin stack, ese archivo se saltea.

`scripts/db-test-local.sh` crea una base efímera, aplica `scripts/supabase-shim.sql` (roles, `auth.uid()`, `auth.users`, privilegios por defecto), las migraciones y el seed, y corre `pg_prove` sobre `supabase/tests`. `KEEP_DB=1` deja la base para mirarla; `SKIP_SEED=1` la deja sin seed. `scripts/dev-local.sh --reset` rehace la base de desarrollo.

## Modelo de datos en dos líneas

Un `group` tiene `group_members`, `seasons` de 30 días y una `round` por día. Cada `round` fija el `game_id` y la `seed` de ese día; cada jugador tiene hasta `max_attempts` `attempts` por ronda. RLS: se lee solo lo de los grupos propios, los puntajes de hoy se ven recién después de completar un intento, y `attempts`, `rounds` y `seasons` los escribe solo el servidor.
