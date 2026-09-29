# frog

PWA para que un grupo de amigos juegue un juego distinto cada día, el mismo para todo el grupo, y compita por el ranking. La marca se escribe siempre en minúscula: `frog`. El repo, el proyecto de Vercel, las cookies, las claves de `localStorage` y los nombres de caché del service worker conservan el nombre anterior (`playus`): son internos y renombrarlos no aporta nada.

Estado: **etapa 7** (pasada de diseño). Las siete etapas del brief están hechas; falta la verificación en teléfonos reales de las etapas 6 y 7. Ver `PLAN.md` para las etapas y `DECISIONS.md` para las decisiones tomadas.

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
  games/                    contrato (types.ts), registry (index.ts), contenedor y README
  games/piba-del-ipa/       encontrá a la piba del IPA: mapa puro (map.ts), reglas cliente/servidor (rules.ts), canvas (draw.ts)
  games/quedo-re-tarado/    quedó re tarado: la cara (face.ts), reglas y un solo dedo (rules.ts), canvas (draw.ts)
  games/los-deseos-de-larry/ los deseos de Larry: lluvia y simulación a 60 ticks (rules.ts), pixel art (sprites.ts), canvas (draw.ts)
  games/remar-vuelve-a-casa/ remar vuelve a casa: río por distancia y simulación a 60 ticks (rules.ts), pixel art (sprites.ts), canvas (draw.ts)
  games/lib/                piezas compartidas: reloj de paso fijo, arrastre de un dedo, escala del canvas, traza y sprites
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
    20260924000004_push.sql     push_subscriptions, group_reminders, pg_cron
    20260927000005_reminders_vault.sql  call_reminders lee la URL y el secreto de Vault
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
npx supabase start -x logflare,vector,storage-api,imgproxy,edge-runtime   # Postgres, Auth, PostgREST, Realtime, Studio y Mailpit
npx supabase db reset       # aplica migraciones y seed
npx supabase test db        # corre los tests pgTAP de supabase/tests
```

Si el arranque corta por el chequeo de salud de Studio, agregar `--ignore-health-check` (decisión 85). Después de cambiar `supabase/config.toml` hay que hacer `npx supabase stop` y `start` de nuevo. Studio queda en `http://127.0.0.1:54323` y Mailpit (los emails de Auth) en `http://127.0.0.1:54324`. Ahí se ven las tablas y el seed (grupo "los del barrio", código `JUEGA7`).

Copiá `.env.example` a `.env.local` y completá `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` con lo que imprime `npx supabase status`. `SEED_PEPPER` (el secreto de la semilla de los intentos, decisión 105) es obligatorio en producción y en los preview de Vercel; en desarrollo puede faltar. Después:

```bash
npm run dev                 # http://localhost:3000
npm test                    # tests unitarios (vitest)
npm run e2e                 # tests Playwright (con la app y Supabase levantados)
```

Para probar un juego suelto: `http://localhost:3000/dev/juego/piba-del-ipa?seed=abc` (con `&map=N`, la vista previa del mapa N con la opción de resaltar; la hoja de sprites está en `/dev/piba/sprites`). Para el tarado, `/dev/juego/quedo-re-tarado?seed=abc&estado=50` muestra la cara con un control de estados. Para Larry, `/dev/juego/los-deseos-de-larry?seed=abc` trae cajas de colisión, cámara lenta y saltos a los 30, 60 y 80 s (también `&desde=60&cajas=1&lento=1`). Para remar, `/dev/juego/remar-vuelve-a-casa?seed=abc` trae cajas y camino seguro, cámara lenta, ×2 forzado y saltos a los 200, 500 y 1.000 m (también `&desde=500&cajas=1&lento=1&x2=1`). Para agregar uno: `src/games/README.md`. Para simular el día siguiente: `http://localhost:3000/dev/hoy` (o `DEV_FAKE_TODAY=AAAA-MM-DD` en `.env.local`).

## PWA y notificaciones

El service worker se genera solo en el build (`npm run build` → `public/sw.js`); en `npm run dev` no hay SW, así que instalación y push se prueban con `npm run build && npm run start` o en un deploy con HTTPS. Los datos nunca se sirven desde caché: `/api/*`, Supabase y las páginas van siempre a la red; sin conexión aparece `/~offline`.

Web Push necesita claves VAPID en `.env.local` (`npx web-push generate-vapid-keys`, una sola vez: cambiarlas invalida las suscripciones) y `CRON_SECRET`. El recordatorio diario lo dispara un scheduler cada 15 minutos llamando a `/api/push/reminders` con `Authorization: Bearer <CRON_SECRET>`:

- **Supabase (default):** la migración crea el job de `pg_cron` si la extensión está disponible. Falta guardar la URL y el secreto en Vault, una sola vez, en el SQL Editor (`alter database ... set app.settings.*` no sirve: Supabase no lo permite, decisión 84):
  ```sql
  select vault.create_secret('https://<tu-app>/api/push/reminders', 'playus_reminder_url');
  select vault.create_secret('<CRON_SECRET>', 'playus_cron_secret');
  ```
  Para cambiarlos: `select vault.update_secret(id, '<nuevo>') from vault.secrets where name = 'playus_reminder_url';`. Para probar sin esperar al cron: `select public.call_reminders();` y mirar `net._http_response`.
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

## Diseño

Paleta del brief como tokens en `src/app/globals.css` (`--fondo`, `--superficie`, `--oro`, `--rosa`, `--agua`, `--tinta`), dos familias vía `next/font` (Bricolage Grotesque para puntajes, nombres y títulos; Instrument Sans para el resto), cifras tabulares en todo, y un sistema chico de clases (`btn-primary`, `input`, `note`, `panel`, `chip`, `eyebrow`, `display`, ver `globals.css`). El único movimiento es el FLIP del ranking al volver de una partida (`src/components/ranking-reveal.tsx`), que respeta `prefers-reduced-motion`.

## Modelo de datos en dos líneas

Un `group` tiene `group_members`, `seasons` de 30 días y una `round` por día. Cada `round` fija el `game_id` y la `seed` de ese día; cada jugador tiene hasta `max_attempts` `attempts` por ronda. RLS: se lee solo lo de los grupos propios, los puntajes de hoy se ven recién después de completar un intento, y `attempts`, `rounds` y `seasons` los escribe solo el servidor.
