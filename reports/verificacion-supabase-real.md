# Reporte: verificación contra Supabase real (tarea 1)
Estado: completa
Fecha: 2026-09-27

## Qué hice

Corrí la app por primera vez contra Supabase de verdad: el stack local del CLI en Docker (Postgres 17, GoTrue, PostgREST, Realtime, Studio, Mailpit), en una PC con Windows 11, un i3 de 4 núcleos y 8 GB. Las cuatro migraciones y el seed aplicaron sin un solo error, tanto con `supabase start` como con `supabase db reset`. El trigger sobre `auth.users`, la publicación `supabase_realtime` con `replica identity full` en `attempts` y el job `playus-reminders` de `pg_cron` (cada 15 minutos) quedaron creados. El seed tiene lo esperado: "los del barrio", código `JUEGA7`, 4 integrantes, 7 rondas y 49 intentos. Los tests pgTAP pasaron sin tocar nada: los helpers `pg_temp.login` y `pg_temp.logout` funcionan con el rol `postgres` del stack.

Aparecieron tres diferencias reales con el emulador, y las tres están resueltas.

1. **El email se vinculaba sin confirmar.** Con `enable_confirmations = false` en `config.toml`, GoTrue real le asigna el email a la cuenta anónima en el acto, confirmado y sin mandar ningún link. El magic link del paso 1.6.8 nunca llegaba a Mailpit y cualquiera podía quedarse con un email ajeno. Lo pasé a `true`, que es el default de un proyecto en la nube: ahora el email queda pendiente en `email_change`, llega a Mailpit ("Confirm your new email address"), y al abrir el link la cuenta pasa a `is_anonymous = false` y conserva nombre, avatar, grupo y apodo (verificado a mano). Perfil muestra "tu cuenta ya está vinculada a …". De paso: si el email ya es de otra cuenta, Perfil ahora lo dice en lugar del genérico "probá más tarde", y el E2E de perfil usa un email distinto en cada corrida, porque la base de Supabase persiste entre corridas y el email fijo chocaba la segunda vez (`422 email_exists`).

2. **El recordatorio diario no se podía configurar.** `alter database postgres set app.settings.reminder_url = …` (paso 2.1.5 y README) falla con "permission denied to set parameter": en Supabase el rol `postgres` no es superusuario, tampoco en la nube. El job de `pg_cron` corría, pero `call_reminders()` nunca tenía URL ni secreto. Una migración nueva (la 5) reescribe la función para leerlos de Supabase Vault, con `app.settings.*` como respaldo. Probé la cadena entera: secretos en Vault → `call_reminders()` → `pg_net` → `/api/push/reminders` en `next start` → 200 `{"ok":true}`.

3. **Los E2E daban falsos negativos por tiempo.** En `next dev` contra Supabase en Docker, crear un grupo (acción de servidor, redirect y render de `/grupo`) tarda de 3 a 7 segundos en esta máquina, y el `expect` de Playwright corta a los 5. La API de Supabase responde en 10 a 70 ms; lo lento es el render de desarrollo con varias consultas encadenadas. Subí `expect.timeout` a 15 segundos en la config sin tocar ninguna aserción, y las 8 pruebas pasan.

**Realtime anda, y es Realtime, no el refresco de respaldo.** Lo medí con una prueba temporal: A espera en Hoy con el ranking abierto y B termina una partida. El evento `postgres_changes` llegó al websocket de A 95 ms y 228 ms después del `/finish` de B (dos corridas), y la fila de B apareció en el ranking de A a los 1,9 s y 2,4 s sin recargar. El resto del tiempo es `router.refresh()` renderizando en modo desarrollo. El refresco de respaldo es cada 15 s, así que no fue el que actuó. Borré la prueba temporal después de usarla.

**PWA contra el build.** `npm run build` genera `public/sw.js`, y `e2e/pwa.spec.ts` pasa contra `next start` en :3001. A mano: el SW queda `activated`, y el manifest tiene `standalone`, `start_url=/hoy` e íconos de 192 y 512 normales y maskable. Para "activar avisos" usé Chrome real con Playwright: la fila quedó en `push_subscriptions` con un endpoint de FCM real (`https://fcm.googleapis.com/fcm/send/…`), y le mandé una notificación con nuestras claves VAPID: FCM respondió 201. El endpoint de recordatorios responde 200 con el secreto y 401 sin él.

**La trampa.** Empezar una partida y recargar a mitad: Hoy pasa de "te quedan 3 intentos" a "te quedan 2 intentos. las partidas que no terminaste se contaron igual." (Chrome contra el build).

Los pasos 1 a 5, 7 y 9 del recorrido manual los cubren las pruebas E2E contra Supabase real: invitación por link, la lista de integrantes en los dos lados, puntajes tapados antes de jugar, ranking en vivo, perfil con avatar y apodo, y el día siguiente con `/dev/hoy`. Además hice el paso 1 y el paso 8 a mano en el navegador.

## Archivos

- creados: `supabase/migrations/20260927000005_reminders_vault.sql`: `call_reminders()` lee la URL y el secreto de Vault (`playus_reminder_url`, `playus_cron_secret`), con `app.settings.*` como respaldo.
- creados: `supabase/tests/07_reminders_vault.sql`: 5 aserciones (sigue siendo security definer, ni `anon` ni `authenticated` la ejecutan, lee de Vault, sin secretos no falla).
- creados: `reports/verificacion-supabase-real.md`: este reporte.
- creados (no van al repo): `.env.local` con las claves del stack local, las claves VAPID generadas hoy y un `CRON_SECRET` al azar.
- modificados: `supabase/config.toml`: `[auth.email] enable_confirmations = true`.
- modificados: `src/app/(app)/perfil/link-email.tsx`: mensaje propio para `email_exists`.
- modificados: `e2e/perfil.spec.ts`: email único por corrida.
- modificados: `playwright.config.ts`: `expect: { timeout: 15_000 }`.
- modificados: `README.md`: comando de arranque con `-x`, Mailpit, la migración 5 en la lista, y Vault en lugar de `alter database` para el recordatorio.
- modificados: `DECISIONS.md`: decisiones 82 a 85.

## Decisiones nuevas

- **82.** Los E2E esperan hasta 15 s por aserción: con Supabase real y `next dev`, acción de servidor, redirect y render tardan de 3 a 7 s en una máquina modesta. No se aflojó ninguna aserción.
- **83.** Vincular un email exige confirmarlo (`enable_confirmations = true`): con `false`, Supabase asigna el email sin link y cualquiera se queda con un email ajeno. Es además el default en la nube.
- **84.** La URL y el secreto del recordatorio van en Supabase Vault: `alter database … set app.settings.*` no está permitido en Supabase.
- **85.** El stack local se levanta con `-x logflare,vector,storage-api,imgproxy,edge-runtime`: sin eso, el arranque no pasaba los chequeos de salud en esta máquina, y la app no usa esos servicios.

## Desvíos del plan o del brief

- **Paso 2.1.5 de `PROXIMOS-PASOS.md`**: los dos `alter database` no funcionan en Supabase. En su lugar, en el SQL Editor del proyecto en la nube:
  ```sql
  select vault.create_secret('https://<dominio-del-deploy>/api/push/reminders', 'playus_reminder_url');
  select vault.create_secret('<el mismo CRON_SECRET que va en Vercel>', 'playus_cron_secret');
  ```
  y `select public.call_reminders();` para probarlo sin esperar al cron (la respuesta queda en `net._http_response`).
- **`npx supabase start`** necesitó `-x …` (decisión 85). Studio tardó en quedar sano pero anda.
- **No hubo commit ni push:** la carpeta de trabajo es un zip de la rama, no un clon de git (ver Preguntas).

## Tests

- `npx supabase test db`: **176 de 176** (las 171 originales, que pasaron sin cambios, más 5 nuevas de `07_reminders_vault.sql`).
- `npm test` (vitest): **37 de 37**. `attempts.test.ts` y `push.test.ts` corrieron contra el stack en :54321, sin saltearse.
- `npm run e2e` contra `npm run dev`: **8 de 8**, más 1 salteada a propósito (`pwa.spec.ts`, que corre solo con `E2E_PROD=1`). Antes de las correcciones fallaban 3: dos por tiempo (decisión 82) y la de perfil por el email repetido (decisión 83). Una corrida intermedia tuvo una partida trabada en la cuenta regresiva "1" durante 15 s, que atribuyo a la máquina sin memoria libre (unos 400 MB). No se repitió en las corridas siguientes.
- `E2E_PROD=1 E2E_BASE_URL=http://127.0.0.1:3001 npm run e2e -- e2e/pwa.spec.ts`: **1 de 1**.
- `npm run typecheck` y `npm run lint`: sin errores.

## Cómo verificarlo en el navegador

1. `npx supabase start -x logflare,vector,storage-api,imgproxy,edge-runtime`, `npx supabase db reset`, `npm run dev`.
2. Realtime: en una ventana normal crear un grupo y jugar. En una de incógnito entrar por el link y jugar. Volver a la normal sin tocar nada: el segundo jugador aparece en unos 2 segundos. En DevTools → Network → WS, el socket `realtime/v1/websocket` recibe un mensaje `postgres_changes` en el momento en que el otro termina.
3. Email: en Perfil, "vinculá un email", poner uno y "vincular". En `http://127.0.0.1:54324` aparece "Confirm your new email address". Abrir el link **en el mismo navegador** en que está la app: vuelve a la app, y en Perfil dice "tu cuenta ya está vinculada a …".
4. Recordatorio: con `npm run build && npm run start -- --port 3001`, en Studio → SQL:
   `select vault.create_secret('http://host.docker.internal:3001/api/push/reminders', 'playus_reminder_url');`, lo mismo con el `CRON_SECRET` de `.env.local` como `playus_cron_secret`, `select public.call_reminders();` y después `select status_code, content from net._http_response order by created desc limit 1;` → `200 {"ok":true,…}`.

## Problemas y deuda

- **El link del email vuelve a `site_url`** (`http://127.0.0.1:3000` en local). Si la app se abrió en `localhost:3000`, el link la abre en otro origen, sin sesión: el email se confirma igual (el cambio se aplica en `/verify`), pero la persona cae en la landing. En la nube hay que poner el dominio del deploy como **Site URL** en Authentication → URL Configuration, o los links apuntan a `localhost`. La app no canjea el `?code=` que trae el link. No hace falta para confirmar el email, pero el JWT del navegador sigue diciendo `is_anonymous: true` hasta que se refresca (como mucho una hora). No lo cambié porque nada de la app lee ese claim del token.
- **Las claves VAPID están solo en `.env.local`**, que no va al repo. Hay que guardarlas en un gestor de contraseñas y cargar **las mismas** en Vercel: cambiarlas invalida las suscripciones. `VAPID_SUBJECT` quedó con `mailto:alguien@ejemplo.com`; para producción conviene un email real tuyo.
- **El navegador integrado de la app de escritorio de Claude no sirve para probar la PWA:** con el service worker activo, sus pedidos a Supabase fallan (`net::ERR_FAILED`), y en Chrome y Chromium el mismo caso anda. No es un bug de la app, pero conviene saberlo si alguien prueba ahí.
- **La lentitud de `next dev`** en esta máquina (1 a 4 s por página con sesión) no afecta al build de producción, pero vale mirarla en el teléfono real (tarea 2): cada página con sesión hace varias consultas encadenadas a Supabase.
- El comentario de la migración 4 todavía menciona `alter database`. No lo toqué porque es una migración ya aplicada; la 5 explica el cambio.

## Preguntas

- **Git:** la carpeta `PLAYUS-claude-cool-franklin-fomcz1` es un zip de la rama, no un repositorio, así que no pude hacer commit ni push a `claude/cool-franklin-fomcz1`. ¿Clono el repo y paso estos cambios a la rama? Necesito la URL del remoto y que `git` tenga credenciales para empujar.

## Siguiente paso propuesto

La tarea 2, con tres ajustes a `PROXIMOS-PASOS.md`: (a) en 2.1, dejar "Confirm email" prendido (es el default) y poner el dominio del deploy como Site URL; (b) en 2.1.5, usar `vault.create_secret` en lugar de `alter database`; (c) en 2.2, cargar en Vercel las claves VAPID de `.env.local`, no generar otras.
