# Reporte: etapa 6 (PWA y notificaciones)
Estado: parcial
Fecha: 2026-09-24

## Qué hice

Convertí la app en PWA instalable con service worker y pantalla sin conexión, y armé Web Push completo: suscripción desde el navegador, envío desde el servidor con VAPID, recordatorio diario por grupo con un scheduler, y aviso de "te pasaron" desde el endpoint que guarda el puntaje. Todo lo que se puede probar sin un teléfono real está probado: el manifest, el service worker y la pantalla sin conexión en un build de producción con Playwright; el envío de push cifrado contra un push service falso; el endpoint de recordatorios contra la base; y las políticas de la tabla nueva con pgTAP. Lo que no se puede probar acá es el criterio literal de la etapa: instalar y recibir un push en un Android y un iPhone reales sobre un deploy con HTTPS. Por eso el estado es parcial: el código está completo y verificado hasta donde llega este entorno, y la última milla queda para vos con un teléfono en la mano.

PWA. El manifest se genera con `app/manifest.ts` y se sirve en `/manifest.webmanifest`: nombre, `display: standalone`, `orientation: portrait`, `start_url` en Hoy, colores de la paleta, íconos de 192 y 512 normales y maskable (renderizados con Chromium desde dos SVG del repo), y tres capturas para el diálogo de instalación. El layout declara el manifest, el ícono de Apple y `apple-mobile-web-app-capable`. El service worker es Serwist (`src/app/sw.ts`, compilado por el plugin en el build a `public/sw.js`): precachea el esqueleto (chunks con hash y archivos públicos) y la página `/~offline`; en tiempo de ejecución, `/api/*`, cualquier URL de Supabase, las navegaciones y los payloads RSC son `NetworkOnly` (nunca un puntaje desde caché), `/_next/static/` es CacheFirst y las imágenes, fuentes y scripts StaleWhileRevalidate. Sin red, una navegación cae a la pantalla "sin señal", que explica que no hay nada viejo para mostrar y que un intento en curso ya se gastó. En desarrollo el SW está apagado (Turbopack no corre el plugin), así que la PWA se prueba con `next build` + `next start`.

Instalación. `InstallCard` captura `beforeinstallprompt` en Android/Chrome y muestra un botón "instalar la app"; en iOS/Safari, donde ese evento no existe, detecta el navegador y muestra tres pasos ilustrados (compartir → agregar a inicio → abrir desde el ícono, que es lo que habilita las notificaciones en iPhone). Si la app ya corre instalada no aparece. Está en Perfil siempre y en Hoy (descartable) después de jugar.

Web Push. Migración nueva: `push_subscriptions` (una fila por navegador, RLS estricta: cada uno ve, crea, edita y borra solo las suyas; endpoint `https` obligatorio; claves con largo válido), `group_reminders` (solo servidor; clave `(group_id, play_date)` para no mandar dos veces) y `groups.reminder_time` (hora local del grupo, default 20:00, null = apagado; solo el owner la edita, desde "ajustes del grupo" en la pestaña Grupo). Del lado del cliente, `push-client.ts` pide el permiso recién cuando la persona toca "activar avisos" (la tarjeta aparece después de la primera partida, nunca al entrar; en Perfil hay un interruptor para activar y desactivar), se suscribe con la clave pública VAPID y guarda la suscripción con `upsert` por endpoint. Del lado del servidor, `push.ts` manda con `web-push` a todas las suscripciones de los perfiles indicados y borra las que el push service da por vencidas (404/410). El service worker muestra la notificación y al tocarla abre o enfoca la app en `/hoy`.

Recordatorio diario. `/api/push/reminders` (GET o POST, con `Authorization: Bearer CRON_SECRET`) recorre los grupos con hora configurada, calcula si la hora local del grupo cae en la ventana de 15 minutos, reserva el envío del día en `group_reminders`, asegura la ronda para saber qué juego toca y avisa solo a los integrantes que todavía no completaron una partida ("los del barrio: hoy toca reflejo. todavía no jugaste. si no jugás hoy, mañana ya no vale."). El scheduler es `pg_cron` + `pg_net`, como decía la decisión 7: la migración crea el job cada 15 minutos si las extensiones están disponibles (en un Postgres común no lo están y la migración pasa igual), y la función `call_reminders` lee la URL y el secreto de dos settings de la base que se configuran una sola vez con `alter database`. Verifiqué la alternativa del cron de Vercel: en el plan Hobby corre como máximo una vez por día, así que no alcanza; en Pro sí, con un `vercel.json` de una línea que dejé documentado en el README pero no incluí para no romper el deploy en Hobby.

"te pasaron". `finishAttempt` ahora acepta un gancho que recibe el ranking de la ronda antes del puntaje nuevo; el endpoint `/finish` calcula el ranking después y `overtakenBy` (pura, con tests) devuelve a quienes tenían mejor puesto y quedaron detrás; a cada uno le llega "Vale te pasó en tap race: hizo 9. todavía podés responder si te quedan intentos." Un error de push nunca hace fallar el guardado del puntaje.

Verificación. Además de las 8 pruebas E2E anteriores (que siguen pasando con las tarjetas nuevas), una prueba nueva corre contra `next start`: comprueba el manifest (standalone, portrait, íconos maskable, capturas), que `sw.js` se sirve y precachea `/~offline`, registra el service worker, corta la red con Playwright y comprueba que navegar a `/hoy` muestra la pantalla sin señal. El test de vitest nuevo levanta un servidor HTTPS local con certificado autofirmado que hace de push service, inserta dos suscripciones con claves ECDH válidas y comprueba que `sendPushToProfiles` manda un cuerpo cifrado `aes128gcm` con cabecera `vapid` y TTL, y que un 410 borra la fila; después pone la hora del grupo en "ahora", llama al endpoint de recordatorios sin secreto (401) y con secreto (manda 1, crea la ronda y la fila de `group_reminders`) y una segunda vez (no repite). pgTAP suma 17 aserciones para la tabla nueva.

## Archivos

- creados: `supabase/migrations/20260924000004_push.sql`: `push_subscriptions` con RLS, `group_reminders`, `groups.reminder_time`, `call_reminders()` y el job de `pg_cron` si está disponible.
- creados: `supabase/tests/06_push.sql`: 17 aserciones (RLS propia, endpoint https, `group_reminders` inaccesible, hora del recordatorio solo owner).
- creados: `src/app/manifest.ts`: el manifest de la PWA.
- creados: `src/app/sw.ts`: el service worker (Serwist): precache, reglas de caché, fallback sin conexión, `push` y `notificationclick`.
- creados: `src/app/~offline/page.tsx`: pantalla sin señal.
- creados: `public/icons/*` (SVG fuente y PNG 192/512/180, normal y maskable) y `public/screenshots/*`.
- creados: `src/components/install-card.tsx`: instalar en Android (botón) y en iOS (pasos ilustrados).
- creados: `src/components/push-card.tsx`: ofrecer avisos después de la primera partida; interruptor en Perfil.
- creados: `src/lib/push-client.ts`: estado, suscripción y baja de Web Push en el navegador.
- creados: `src/lib/push.ts`: envío con VAPID y limpieza de suscripciones vencidas.
- creados: `src/lib/reminders.ts` y `reminders.test.ts`: ventana del recordatorio en la zona del grupo.
- creados: `src/lib/overtake.ts`: el aviso "te pasaron".
- creados: `src/app/api/push/reminders/route.ts`: el endpoint del scheduler.
- creados: `src/app/(app)/grupo/reminder-time.tsx`: hora del recordatorio (owner).
- creados: `src/lib/push.test.ts`: envío real contra un push service falso y el endpoint de recordatorios.
- creados: `e2e/pwa.spec.ts`: manifest, service worker y sin conexión contra un build (`E2E_PROD=1`).
- creados: `src/test/server-only.ts`: sustituto de `server-only` para vitest.
- creados: `reports/etapa-6.md`: este reporte.
- modificados: `next.config.ts`: plugin de Serwist (apagado en desarrollo, `/~offline` precacheada).
- modificados: `tsconfig.json`: lib `webworker` y typings de Serwist.
- modificados: `src/app/layout.tsx`: manifest, ícono de Apple, `appleWebApp`.
- modificados: `src/middleware.ts`: excluye manifest, `sw.js`, íconos, capturas y `/~offline`.
- modificados: `src/lib/scoring.ts` y `scoring.test.ts`: `overtakenBy` y sus tests.
- modificados: `src/lib/attempts.ts` y `src/app/api/attempts/[attemptId]/finish/route.ts`: gancho `afterSave` con el ranking previo y el aviso.
- modificados: `src/app/(app)/hoy/page.tsx`, `perfil/page.tsx`, `grupo/page.tsx`: tarjetas de avisos e instalación, ajustes del grupo.
- modificados: `src/lib/supabase/types.ts`: tablas nuevas y `reminder_time`.
- modificados: `scripts/mini-supabase/keys.mjs`, `.env.example`: claves VAPID y `CRON_SECRET`.
- modificados: `vitest.config.ts`, `eslint.config.mjs`, `.gitignore`: alias de `server-only`, ignorar `public/sw.js`.
- modificados: `package.json`, `package-lock.json`: `@serwist/next`, `serwist`, `web-push`, `@types/web-push`.
- modificados: `README.md` y `DECISIONS.md` (decisiones 64 a 74).

## Decisiones nuevas

64. Serwist solo en el build; en desarrollo no hay service worker. La PWA se prueba con `next build && next start`.
65. Páginas y datos siempre de la red (`NetworkOnly` para `/api/*`, Supabase, navegaciones y RSC); se cachean solo chunks y assets; sin red, la pantalla `/~offline`. Más estricto que el `defaultCache` de Serwist.
66. Manifest con `app/manifest.ts`; íconos renderizados desde SVG del repo; capturas de los E2E.
67. Instalación: botón propio con `beforeinstallprompt`; en iOS/Safari, tres pasos ilustrados. Oculta si ya está instalada.
68. El permiso de notificaciones se ofrece después de la primera partida (descartable) y como interruptor en Perfil; nunca al entrar.
69. Las suscripciones que el push service da por vencidas (404/410) se borran al mandar.
70. Recordatorio: `reminder_time` por grupo, endpoint con `CRON_SECRET`, ventana de 15 minutos en la zona del grupo, `group_reminders` para no repetir, aviso solo a quien no jugó; scheduler `pg_cron` + `pg_net` con URL y secreto en settings de la base.
71. El cron de Vercel alcanza solo en Pro (Hobby: una vez por día); documentado, no incluido.
72. "te pasaron" se calcula en `/finish` con el ranking antes y después (`overtakenBy`); un error de push nunca frena el guardado.
73. El envío se prueba contra un push service HTTPS falso con certificado autofirmado.
74. `server-only` aliasado a un módulo vacío en vitest.

## Desvíos del plan o del brief

- El criterio "listo cuando" de la etapa (instalar y recibir push en un Android y un iPhone reales sobre un deploy preview de Vercel con HTTPS) no se pudo cumplir desde este entorno: no hay teléfonos ni deploy. Por eso el estado es parcial. Todo lo demás está hecho y probado con lo que sí se puede probar acá.
- El plan pedía verificar si el cron de Vercel alcanza: alcanza en Pro, no en Hobby. Quedó `pg_cron` como default y la alternativa documentada.
- El scheduler necesita dos settings en la base (`app.settings.reminder_url` y `app.settings.cron_secret`) que hay que configurar a mano una vez; no vi forma de meterlos en una migración sin exponer el secreto en el repo.

## Tests

Unitarios e integración (con el emulador levantado):

```
npm test
→ 7 archivos, 37 tests, 37 pasan, 0 fallan
   rng (7), time (2), deck (7), scoring (9, con overtakenBy), reminders (3),
   attempts contra la base (7), push contra un push service falso + endpoint de recordatorios (2)
```

Base (pgTAP): 6 archivos, 171 aserciones, todas pasan (17 nuevas en `06_push.sql`).

Chequeos estáticos y build:

```
npm run typecheck   → sin errores
npm run lint        → sin errores
npm run build       → compila y genera public/sw.js con /~offline precacheada
```

E2E contra `npm run dev`: las 8 pruebas anteriores pasan (la de PWA se saltea porque en dev no hay SW).

E2E contra `npm run build && npm run start -- --port 3001`:

```
E2E_PROD=1 E2E_BASE_URL=http://127.0.0.1:3001 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e -- e2e/pwa.spec.ts
✓ el manifest y el service worker se sirven, y sin red aparece la pantalla de sin conexión (1 s)
```

## Cómo verificarlo en el navegador

Lo que se puede hacer sin teléfono:

1. `npm run build && npm run start -- --port 3001` (con Supabase o el emulador levantado y las claves VAPID y `CRON_SECRET` en `.env.local`; `node scripts/mini-supabase/keys.mjs` las genera).
2. Abrir `http://127.0.0.1:3001/manifest.webmanifest`: JSON con standalone, portrait, íconos y capturas. `http://127.0.0.1:3001/sw.js` se sirve.
3. En Chrome de escritorio: DevTools → Application → Service Workers muestra `sw.js` activo; Application → Manifest muestra el ícono y permite "instalar". Marcar "Offline" y navegar a `/hoy`: aparece "sin señal".
4. Crear un grupo y jugar; al volver a Hoy aparece "¿te avisamos cuando te pasen?". Tocar "activar avisos": Chrome pide permiso, y en `push_subscriptions` aparece la fila. Perfil muestra "activadas en este teléfono" y el botón "desactivar".
5. Con dos navegadores, que el segundo pase al primero en el ranking: Chrome muestra la notificación "X te pasó en …" (en escritorio funciona con Chrome real; no con el emulador, que no tiene push service, ni con Playwright headless).
6. Pestaña Grupo (siendo owner): "recordatorio diario a las" con la hora; cambiarla guarda. Llamar a mano al endpoint: `curl -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3001/api/push/reminders` devuelve qué grupos estaban en hora y cuántos avisos mandó.

Lo que queda para un teléfono real (el criterio de la etapa):

7. Deploy preview en Vercel con las variables de `.env.example`. En Supabase, `alter database postgres set app.settings.reminder_url / cron_secret`.
8. Android/Chrome: abrir el link, jugar, "instalar la app" desde la tarjeta; abrir desde el ícono; "activar avisos". Que otro te pase: llega la notificación. A la hora del grupo: llega el recordatorio si no jugaste.
9. iPhone/Safari (iOS 16.4 o más nuevo): seguir los tres pasos de la tarjeta (compartir → agregar a inicio → abrir desde el ícono); recién ahí "activar avisos" pide permiso.

## Problemas y deuda

- El criterio de la etapa en teléfonos reales sigue pendiente (ver arriba). El envío está probado con cifrado y VAPID reales contra un servidor falso; lo que falta ver es la entrega por FCM/APNs y el comportamiento de iOS.
- Cambiar las claves VAPID invalida todas las suscripciones. `keys.mjs` las regenera cada vez que se corre: en desarrollo no importa; en producción se generan una vez y se guardan.
- `push_subscriptions.last_seen_at` se actualiza solo al suscribirse. Podría refrescarse en cada visita para depurar suscripciones de teléfonos abandonados; los 404/410 ya cubren la mayoría.
- El recordatorio usa `ensureRound`, así que a la hora del recordatorio se crea la ronda aunque nadie haya abierto la app. Es coherente con "el juego del día es el mismo para todos", pero cambia el "lazy": ahora la ronda puede nacer por el cron.
- La detección de iOS/Safari es por user agent; un iPad con Safari de escritorio o un navegador raro pueden no ver la tarjeta.
- Serwist no corre en desarrollo, así que el flujo de push no se puede probar con `npm run dev`; hay que hacer build. Está avisado en la propia tarjeta ("acá no hay service worker") y en el README.
- El `defaultCache` de Serwist no se usa: si en el futuro se agregan rutas con datos públicos que convenga cachear, hay que sumarlas a mano.

## Preguntas

- ¿Tenés un Android y un iPhone a mano para la verificación final sobre un deploy preview? Es lo único de esta etapa que no pude cerrar desde acá. Con eso confirmado, la etapa pasa a completa.

## Siguiente paso propuesto

Etapa 7: tokens de la paleta (ya están) más Bricolage Grotesque e Instrument Sans vía `next/font` con cifras tabulares en todos los números; el ranking en filas con línea divisoria y tu fila con borde en agua (ya está) con el puntaje enorme; animación FLIP al revelar el puntaje con `prefers-reduced-motion`; textos de estados vacíos y revisión de toda la copia en voseo y minúscula; chequear la lista de "evitá" del brief. Criterio: todas las pantallas pasan la revisión visual en un teléfono real.
