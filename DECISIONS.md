# Decisiones

Cada decisión tomada por cuenta propia, con el porqué. Las primeras nueve vienen del plan (`PLAN.md`) y se fijaron antes de escribir código; las siguientes se agregaron durante las etapas.

## Del plan

1. **Ventana de tiempo vs. terminar antes.** `GameModule` tiene `minDurationMs?` opcional; si falta, vale `durationMs - 2000`. El límite superior es `durationMs + 10s`. `started_at` se fija al tocar "jugar", antes de la cuenta regresiva.

2. **Cota inferior para juegos `low`.** `GameModule` tiene `minPlausibleScore?` opcional (para `reflejo`, 100). `/finish` rechaza si el puntaje queda fuera de `[minPlausibleScore, maxPlausibleScore]`.

3. **Puntajes tapados en la base, no solo en la interfaz.** Una política RLS permite leer los puntajes de otros en la ronda de hoy solo si el usuario ya tiene un attempt `completed` en esa ronda. Las rondas pasadas son visibles para todo el grupo. Realtime respeta RLS.

4. **Sin escritura de `attempts` desde el cliente.** No hay políticas de INSERT ni UPDATE para clientes en `attempts`. Solo escriben `/start` y `/finish` desde el servidor.

5. **Semilla del rebarajado.** Cada vuelta del mazo usa `hash(group_id + season.number + vuelta)`. Si la primera carta de una vuelta coincide con la última de la anterior, se intercambia con la segunda.

6. **Registry cambiante.** El mazo se calcula con los ids del registry ordenados alfabéticamente. Un juego nuevo solo afecta los días futuros; `rounds.game_id` queda persistido.

7. **Único cron del proyecto: el recordatorio push.** Rondas y temporadas se crean de forma perezosa. El recordatorio usa `pg_cron` + `pg_net` cada 15 minutos contra un endpoint protegido con secreto (a confirmar en la etapa 6 si el cron de Vercel alcanza).

8. **Contrato de un solo archivo vs. route handlers.** Si Next se queja por los hooks al importar el módulo del juego desde `/finish`, los juegos usan `import * as React from 'react'`. Se resuelve en la etapa 4.

9. **Menores.** `reflejo` redondea el promedio a entero. En Hoy, con la ronda de ayer cerrada, se muestra arriba quién ganó. Iniciar un intento pasa a `abandoned` cualquier intento propio `in_progress` de esa ronda. Una temporada dura 30 días: `ends_on = starts_on + 29`. El cierre de temporada es perezoso.

## Etapa 1

10. **Grupos y membresías se escriben solo por RPC.** `groups` y `group_members` no tienen políticas de INSERT ni DELETE para el cliente. `create_group(p_name, p_timezone)` crea el grupo y al owner en una sola transacción; `join_group(p_code)` agrega al member. Motivo: crear un grupo son dos escrituras que tienen que ir juntas, y un no-miembro no puede leer `groups` para encontrar el código. Ambas son `security definer` y devuelven la fila del grupo, que el usuario ya puede leer porque acaba de quedar adentro.

11. **Edición por columnas con `grant update (columna)`.** Además de RLS, el rol `authenticated` solo tiene UPDATE sobre `groups(name, timezone, max_attempts)` y `group_members(nickname)`. Así `invite_code`, `created_by` y `role` no se pueden tocar aunque una política futura se relaje por error. La política decide quién (owner para el grupo, cada uno para su apodo); el grant decide qué.

12. **`rounds` y `seasons` son solo lectura desde el cliente.** Extiende la decisión 4: las crea y cierra el servidor con `service_role`. Los privilegios de INSERT/UPDATE/DELETE se revocaron para `authenticated`, además de no existir políticas.

13. **`anon` no lee nada.** Se revocaron todos los privilegios de `anon` sobre las seis tablas y las RPC. La app siempre abre una sesión anónima de Supabase (que llega como `authenticated`), así que el rol `anon` solo representa peticiones sin sesión, y esas no tienen nada que ver.

14. **`seasons.closed_at`.** Columna extra respecto del brief. `winner_profile_id` puede quedar null si nadie jugó, así que hacía falta una marca de cierre idempotente para el cierre perezoso. Check: hay ganador solo si hay cierre.

15. **`round_participants(round_id)`.** RPC `security definer` que devuelve `(profile_id, completed_attempts)` de una ronda, solo para miembros del grupo. Por construcción no expone puntajes. Sirve para que la pantalla Hoy muestre "ya jugaron Nico y Flor" con los puntajes tapados, cosa que la política de `attempts` (que oculta filas enteras) no permite.

16. **El perfil se crea por trigger en `auth.users`.** `handle_new_user` inserta la fila en `profiles` con `display_name` vacío (o el de `raw_user_meta_data.display_name`). El cliente después la completa con nombre y avatar; también tiene política de INSERT propia para que un `upsert` funcione.

17. **Alfabeto del código de invitación: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.** Mayúsculas sin I ni O, dígitos sin 0 ni 1, 32 símbolos. `join_group` normaliza con `upper(btrim(...))`, así el código dictado por voz o escrito en minúscula funciona. Un código con formato inválido y uno inexistente dan el mismo error (`invalid_invite_code`, SQLSTATE `P0002`), para no dar pistas.

18. **Zona horaria validada en la base.** `groups.timezone` tiene un check con `is_valid_timezone(text)`, que intenta `at time zone` y captura el error. Un nombre inválido rompería el cálculo del "hoy" del grupo en las políticas.

19. **`attempts` en la publicación `supabase_realtime` con `replica identity full`.** Necesario para que el ranking del día escuche cambios con RLS aplicado también en UPDATE.

20. **Helpers de RLS `security definer` con `search_path = ''`.** `is_member`, `is_owner`, `shares_group_with`, `group_today` y `can_view_round_scores` leen las tablas sin pasar por sus políticas (evita el bucle de `group_members` sobre sí misma). Todas responden preguntas sobre el propio usuario, nunca sobre terceros, así que no filtran información aunque el cliente las llame directo.

21. **Verificación sin Docker.** Este entorno no tiene daemon de Docker, así que `supabase test db` no se puede correr. `scripts/db-test-local.sh` reproduce lo mínimo del entorno de Supabase (roles, `auth.uid()`, `auth.users`, privilegios por defecto, `extensions`) con `scripts/supabase-shim.sql` sobre un Postgres 16 común y corre los mismos tests con `pg_prove`. En una máquina con Docker, `supabase db reset && supabase test db` es el camino oficial y los archivos son los mismos.

22. **Las rondas del seed no siguen el mazo.** El seed alterna `tap-race` y `reflejo` a mano. El algoritmo del mazo llega en la etapa 5 y no tendría sentido duplicarlo en SQL.

## Etapa 2

23. **Los flujos de invitación y de creación de grupo son de cliente.** `signInAnonymously` tiene que escribir las cookies de sesión, y un Server Component no puede. Las pantallas `/g/[code]` y `/crear` son componentes de cliente que abren la sesión, guardan el perfil y llaman a la RPC; el resto de la app lee con el cliente de servidor.

24. **Grupo actual en una cookie.** `playus-group` guarda el id del grupo elegido; se fija al crear o unirse, y desde el selector de la pestaña Grupo (visible solo con más de un grupo). Si la cookie no apunta a un grupo propio, se usa el más viejo.

25. **Avatar provisorio: solo un color de fondo más las iniciales.** Se guarda como `{"bg": "#…"}`, la misma clave que va a usar el avatar por piezas de la etapa 3, así los perfiles creados ahora no se rompen.

26. **La zona horaria del grupo es la del navegador de quien lo crea.** `Intl.DateTimeFormat().resolvedOptions().timeZone`, con reintento a `America/Montevideo` si la base la rechaza. Configurable por grupo más adelante.

27. **Sin sesión o sin grupo, las pestañas mandan a la landing; con grupo, la landing manda a Hoy.** La landing es la única pantalla que ofrece crear o entrar con código. `getMyGroups` devuelve vacío sin sesión en lugar de consultar como `anon`, porque Next renderiza página y layout en paralelo y la consulta fallaría antes de que el layout redirija.

28. **Consultas planas, sin recursos embebidos de PostgREST.** La lista de integrantes se arma con dos consultas (membresías y perfiles) en vez de `group_members(profiles(*))`. Es más fácil razonar qué política aplica a cada lectura, y es lo que soporta el emulador local (decisión 29).

29. **`mini-supabase` para desarrollar y correr E2E sin Docker.** `scripts/mini-supabase/server.mjs` emula los endpoints de Auth (registro anónimo, usuario, refresh) y de REST (tablas con filtros básicos y RPC) sobre el Postgres local, corriendo cada petición con `set local role` y `request.jwt.claims`, así RLS y las RPC se ejercitan de verdad. No cubre email, realtime, storage ni embebidos, y no reemplaza a Supabase real: en una máquina con Docker se usa `supabase start` y el mismo `.env.local` con las claves que imprime `supabase status`.

30. **Tests de la etapa: Playwright.** `e2e/invitacion.spec.ts` reproduce el criterio "listo cuando" con dos contextos de navegador (uno crea, otro entra por el link), mide que entrar tarde menos de 15 segundos, y cubre código inválido y redirecciones. Corre contra el stack local o contra Supabase real.

31. **Tipos de la base escritos a mano.** `supabase gen types` necesita el stack en Docker. `src/lib/supabase/types.ts` refleja las migraciones; se regenera y compara cuando haya Docker.

32. **Fuentes del sistema por ahora.** `next/font` con Bricolage Grotesque e Instrument Sans llega en la etapa 7 (pasada de diseño); la paleta ya está como tokens en `globals.css`.

## Etapa 3

33. **Ids de piezas 1-based y estables.** `base`, `hair`, `eyes`, `mouth` y `accessory` guardan un entero que es la posición (desde 1) en las listas de `src/avatar/pieces.tsx`. Las piezas nuevas se agregan al final; nunca se reordenan ni se borran, porque el número queda persistido en `profiles.avatar`. `accessory` admite null ("sin extra").

34. **Dos esquemas zod: estricto para guardar, tolerante para leer.** `avatarSchema` rechaza cualquier cosa fuera de rango antes de escribir. `parseAvatar` usa un esquema con `.catch()` por campo: lo que falte o esté mal cae a un default, así los perfiles de la etapa 2 (que solo tenían `bg`) y cualquier dato viejo se siguen dibujando.

35. **Avatar al azar para las cuentas nuevas.** La pantalla de alta arranca con un avatar aleatorio (y un botón "al azar") en lugar de uno neutro: da ganas de tocar y evita que todos queden iguales. Usa `Math.random`; la semilla determinística es solo para los juegos.

36. **Las miniaturas del editor muestran la opción aplicada al avatar actual**, no la pieza suelta. Cuesta más render (ocho SVG por categoría) pero se entiende de un vistazo cómo queda.

37. **Los colores fijos de los extras llevan contorno oscuro.** La gorra y la vincha usan rosa y agua, que también son fondos posibles; el contorno evita que desaparezcan sobre el mismo color.

38. **El apodo se edita en Perfil, con un campo por grupo.** Guarda al salir del campo o con Enter, sobre `group_members.nickname` (la única columna de la membresía que el cliente puede tocar, decisión 11). El brief lo ponía como editable del perfil y acá quedan todos los grupos juntos.

39. **Vincular email con `updateUser({ email })`, escondido en un `<details>`.** Supabase manda un magic link y deja el email pendiente en `new_email` hasta confirmarlo; la interfaz lo dice y muestra el estado. No hay contraseña y nada depende de esto. El emulador local lo guarda directo, sin confirmación.

40. **Las estadísticas del perfil son un componente con datos en null.** `ProfileStats` recibe `{roundsPlayed, wins, bestStreak, seasonsWon, bestGame}` y muestra "—" y un texto de invitación mientras todo sea null. La etapa 5 solo tiene que calcular el objeto.

41. **`data-avatar` en el SVG.** El renderizador escribe el JSON normalizado del avatar como atributo. Es lo que usa el test E2E para comprobar que el avatar guardado en un navegador es exactamente el que ve el otro.

## Etapa 4

42. **`onProgress` en `GameProps`.** El brief define `seed`, `onReady` y `onFinish`, pero el contenedor corta por tiempo y necesita un puntaje en ese momento. Agregué `onProgress(result)`: el juego informa su resultado parcial cada vez que cambia y el contenedor usa el último cuando corta. Un juego que siempre termina antes (reflejo) puede ignorarlo. Es la extensión más chica que resuelve el corte sin que el juego conozca el cronómetro.

43. **Decisión 8 resuelta: `import * as React` en los juegos.** Con `import { useState } from "react"` en un módulo que también importa un Server Component (`/dev/juego/[id]`, y en la etapa 5 `/finish`), `next build` falla: "You're importing a component that needs useEffect... mark the file with use client". Con `React.useState` compila y el contrato de un solo archivo se mantiene. Los archivos de juego **no** llevan `"use client"`: si lo llevaran, el objeto `GameModule` que exportan llegaría al servidor como referencia de cliente y no se podrían leer los límites. Quien los renderiza (el contenedor) sí es de cliente.

44. **`gameLimits(game)`.** Función en `src/games/types.ts` que aplica los defaults (`minDurationMs = durationMs - 2000`, `maxDurationMs = durationMs + 10000`, `minScore = 0`). El servidor de la etapa 5 usa esto y no repite la regla.

45. **El contenedor es dueño del cronómetro y del ciclo.** Estados: intro → countdown → loading → playing → submitting → result | error. El cronómetro arranca en `onReady` y corre con `requestAnimationFrame`; corta solo. `onStart` (antes de la cuenta regresiva) y `onSubmit` (con el resultado) son ganchos opcionales que la etapa 5 conecta a `/start` y `/finish`; sin ellos, el contenedor muestra el resultado sin guardar ("partida de prueba").

46. **`hash32` es FNV-1a con avalancha final, y no se cambia nunca.** Todas las semillas de rondas y mazos van a salir de acá; cambiarlo cambiaría los tableros de los días futuros y rompería `validate` de las rondas pasadas. El test unitario lo fija.

47. **Registry con chequeos al cargar.** `src/games/index.ts` falla al arrancar si un id no cumple `^[a-z0-9][a-z0-9-]{0,39}$` (el mismo check que `rounds.game_id`) o si hay ids repetidos. Mejor romper en desarrollo que guardar un id que la base rechaza.

48. **Ruta `/dev/juego/[id]` solo en desarrollo.** Devuelve 404 con `NODE_ENV=production`. Es donde se prueba un juego nuevo sin ronda ni servidor.

49. **`reflejo`: salida en falso repite la ronda con la misma espera.** Mantiene el determinismo (las esperas salen de la semilla por ronda) y penaliza sin inventar un número. La traza guarda cuántas salidas en falso hubo por ronda.

50. **Las llamadas concurrentes a `ensureAnonymousUser` comparten la misma promesa.** Apareció en los E2E: StrictMode monta los efectos dos veces en desarrollo, se disparaban dos registros anónimos y el perfil se guardaba con el token del otro usuario (RLS lo rechaza). Vale también para una navegación rápida en producción.

51. **Vitest desde esta etapa.** El plan lo ponía en la etapa 5; el PRNG merece tests unitarios ya (estabilidad del hash, secuencias iguales con la misma semilla, rangos). `npm test` los corre.

## Etapa 5

52. **Los clientes de Supabase del servidor usan un `fetch` sin memoización.** Next memoiza los `fetch` GET idénticos dentro de un mismo render. Con Supabase eso rompe el patrón "¿existe la ronda de hoy? → no → la creo → la leo": la segunda lectura devolvía el "no" memoizado. `src/lib/supabase/fetch.ts` pasa un `AbortController.signal` propio (la forma documentada de salir de la memoización) y `cache: "no-store"`. Aplica al cliente admin y al cliente SSR. Sin esto, la app fallaba también contra Supabase real.

53. **La temporada nueva arranca el día que se crea, no el día después de la anterior.** Si nadie abre la app durante semanas después de que venció una temporada, no se fabrican temporadas vacías: la siguiente empieza en el `today` de la primera visita. `ends_on = starts_on + 29`. El cierre es idempotente (`closed_at`) y el campeón se calcula con `standings` (puntos, después victorias; null si nadie jugó).

54. **La tabla de la temporada cuenta solo los días cerrados (hasta ayer).** Los puntos de hoy se ven en Hoy y suman a medianoche. Así la tabla no depende de qué puntajes de hoy puede ver cada uno (RLS los tapa hasta jugar) y todos ven la misma tabla.

55. **Los intentos rechazados por `/finish` pasan a `abandoned`.** Un puntaje imposible, un tiempo fuera de rango o una traza inválida cuestan el intento igual que recargar. Si no, se podría reintentar el envío hasta acertar.

56. **`/start` marca `abandoned` los intentos colgados de más de 5 minutos y también cualquier intento propio en curso de esa ronda** (decisión 9). Nada de esto devuelve intentos: `attempts_used` es el `attempt_number` más alto, sin importar el estado.

57. **`DEV_FAKE_TODAY` y la cookie `playus-fake-today`.** La variable de entorno fija la fecha al arrancar; la cookie (que fija `/dev/hoy/set`) permite cambiar de día sin reiniciar Next y por navegador, que es lo que necesitan los E2E. Las dos se ignoran en producción. La escribe un Route Handler porque una página no puede escribir cookies.

58. **Ranking en vivo: Realtime más un refresco periódico.** `LiveRefresh` se suscribe a `postgres_changes` de `attempts` filtrado por ronda (Realtime respeta RLS, así que a cada uno le llegan solo las filas que puede leer) y llama a `router.refresh()`. Además refresca cada 15 segundos por si el socket no conecta. `NEXT_PUBLIC_DISABLE_REALTIME=1` apaga la suscripción: el emulador local no tiene Realtime, y los E2E prueban el "en vivo" con el refresco.

59. **`round_participants` alimenta la vista tapada.** Antes de jugar, Hoy muestra quiénes ya jugaron con "???" en lugar del puntaje. Los datos vienen de la RPC de la etapa 1, no de `attempts` (que RLS oculta).

60. **Las estadísticas se calculan al vuelo con el cliente del usuario que mira.** Sin tablas de agregados: se leen los intentos completados del perfil, las rondas y los intentos de esas rondas, y se calcula rondas jugadas, victorias (solo en rondas con más de un jugador), mejor racha de días seguidos, temporadas ganadas y el juego con mejor proporción de victorias. RLS decide qué entra; una ronda de hoy que todavía está tapada no cuenta para victorias.

61. **El perfil de otro integrante vive en `/grupo/integrante/[id]`** y muestra el nombre en ese grupo, el avatar, la corona si corresponde y las mismas estadísticas. Se entra desde la lista de integrantes.

62. **El test de intentos corre contra la base que haya.** `src/lib/attempts.test.ts` usa el stack de `SUPABASE_TEST_URL` (default `http://127.0.0.1:54321`, sea Supabase real o el emulador) y se saltea si no responde. Inyecta `now` en `finishAttempt` para no esperar 15 segundos reales por partida.

63. **El emulador devuelve `date` como texto y responde después del commit.** Dos diferencias con PostgREST que salieron en esta etapa: `pg` convertía las columnas `date` a `Date` (y salían como timestamp ISO), y el `INSERT` respondía antes del `commit`, con lo que una lectura inmediata por otra conexión no veía la fila. Las dos están corregidas; `MINI_DEBUG=1` imprime cada petición.

## Etapa 6

64. **Serwist solo en el build; en desarrollo no hay service worker.** El plugin corre con webpack (`next build`); `next dev --turbopack` no lo ejecuta y, además, un SW en desarrollo confunde (cachea chunks viejos). Consecuencia: instalación y push solo se prueban con `next build && next start` (o en un deploy). `e2e/pwa.spec.ts` corre solo con `E2E_PROD=1`.

65. **Páginas y datos, siempre de la red; el fallback es una pantalla, no un ranking viejo.** En el SW, `/api/*`, cualquier URL de Supabase (`/rest|auth|realtime|storage|functions/v1/`), las navegaciones y los payloads RSC son `NetworkOnly`. Se cachean solo `/_next/static/` (CacheFirst, inmutable por hash) y assets (imágenes, fuentes, estilos, scripts). Sin red, una navegación cae a `/~offline`, precacheada. Es más estricto que el `defaultCache` de Serwist (que sirve páginas con NetworkFirst) y cumple "nunca sirvas puntajes desde caché".

66. **Manifest generado con `app/manifest.ts`.** Se sirve en `/manifest.webmanifest`; `start_url` e `id` son `/hoy`. Los íconos se renderizan desde dos SVG del repo (normal y maskable con más margen) con Chromium, y las capturas del manifest son las de los E2E.

67. **Instalación: botón propio en Android/Chrome, instrucciones ilustradas en iOS/Safari.** `InstallCard` captura `beforeinstallprompt`; en iOS detecta Safari y muestra tres pasos (compartir → agregar a inicio → abrir desde el ícono, que es lo que habilita las notificaciones). Si la app ya corre standalone, no aparece. En Hoy se puede descartar (localStorage); en Perfil está siempre.

68. **El permiso de notificaciones se ofrece después de la primera partida, nunca al entrar.** `PushCard` en la vista de ranking de Hoy (descartable) y como interruptor en Perfil. `Notification.requestPermission` se llama solo al tocar "activar avisos". Cada navegador guarda su propia fila en `push_subscriptions` (RLS: solo la propia) con `upsert` por `endpoint`.

69. **Las suscripciones vencidas se borran al mandar.** Un 404 o 410 del push service borra la fila; otros errores se registran y se cuentan. Sin claves VAPID el envío no hace nada y lo dice.

70. **Recordatorio diario: `reminder_time` por grupo, un endpoint y un scheduler cada 15 minutos.** `groups.reminder_time` (hora local del grupo, default 20:00, null = apagado) la edita el owner desde la pestaña Grupo. `/api/push/reminders` (Bearer `CRON_SECRET`) recorre los grupos "en hora" (ventana `[hora, hora + 15 min)` en la zona del grupo), reserva el envío del día en `group_reminders` (clave primaria `(group_id, play_date)`: la segunda corrida no repite), asegura la ronda para saber el juego, y avisa solo a quienes no completaron una partida. El scheduler es `pg_cron` + `pg_net` (decisión 7): la migración los crea solo si están disponibles y lee la URL y el secreto de `app.settings.reminder_url` y `app.settings.cron_secret`, que se configuran una vez con `alter database`.

71. **Cron de Vercel: alcanza solo en el plan Pro.** Verificado para la decisión 7: en el plan Hobby los cron jobs corren como mucho una vez por día, y el recordatorio necesita una corrida cada 15 minutos para respetar la hora de cada grupo. En Pro se puede reemplazar `pg_cron` por un `vercel.json` con `{"crons":[{"path":"/api/push/reminders","schedule":"*/15 * * * *"}]}` (Vercel manda `CRON_SECRET` solo). No lo incluí por defecto para no romper el deploy en Hobby.

72. **"te pasaron" se calcula en `/finish` con el ranking antes y después.** `overtakenBy(before, after, finisher)` (pura, con tests) devuelve a quienes tenían mejor puesto y quedaron detrás; a cada uno le llega un push con el nombre en el grupo, el juego y el puntaje. Falla silenciosamente: un error de push nunca hace fallar el guardado del puntaje.

73. **El envío se prueba de verdad contra un push service falso.** `src/lib/push.test.ts` levanta un servidor HTTPS local con certificado autofirmado, inserta suscripciones con claves ECDH válidas y comprueba que llega un cuerpo cifrado `aes128gcm` con cabecera `vapid`, que un 410 borra la fila, y que el endpoint de recordatorios avisa una vez por día y exige el secreto. Lo único que no se puede probar acá es un teléfono real recibiendo la notificación.

74. **`server-only` se aliasa a un módulo vacío en vitest.** El paquete tira al importarse fuera de React Server; los tests importan `push.ts` y el endpoint, que lo usan como guarda.

## Etapa 7

75. **Fuentes con `next/font/google`, servidas desde el propio dominio.** Bricolage Grotesque 700/800 para puntajes, nombres y títulos (clase `.display`: tracking cerrado, interlínea 0.95) e Instrument Sans 400/600/700 para el resto. Dos familias, no más. Se descargan en el build, así que un build sin salida a Google Fonts falla; si alguna vez hace falta, el fallback es `next/font/local` con los archivos en el repo.

76. **Un sistema de clases chico en `globals.css`, no un framework de componentes.** `btn-primary`, `btn-primary-sm`, `btn-secondary`, `btn-secondary-sm`, `btn-quiet`, `input`, `input-sm`, `note`, `note-alert`, `note-ok`, `panel`, `chip`, `eyebrow`, `display` y `display-bold`, con `@apply` de Tailwind 4. Antes las mismas cadenas de clases estaban repetidas en 45 lugares; ahora un cambio de diseño se hace en un archivo.

77. **Radios distintos según la pieza.** El CTA principal es la única forma muy redondeada (`rounded-2xl`); botones secundarios e inputs son `rounded-lg`; chips, redondos; los bloques de texto (notas, avisos, paneles) son planos, sin radio, como tiza sobre el pizarrón. Es la respuesta a "todo con el mismo border-radius" de la lista de evitá.

78. **Sin puntos medios ni flechas en la interfaz.** Los metadatos van en frases separadas por comas o puntos ("los del barrio, jue 24 set", "tu mejor: 286 ms. te quedan 2 intentos."); los links de volver dicen "volver", "volver al perfil", "volver a los del barrio", sin flechita. Las etiquetas de sección (`.eyebrow`) van en minúscula, nunca en mayúsculas.

79. **La animación FLIP vive en un componente de cliente que envuelve al ranking.** Al volver de una partida, la URL trae `?reveal=1`; `RankingReveal` muestra el orden viejo (tu fila donde estaba antes, según el puesto guardado en `sessionStorage` antes de jugar, o abajo de todo si es tu primera), mide, cambia al orden real y anima los `translateY` con una transición de 600 ms. Con `prefers-reduced-motion` se muestra el orden final directo. Después del reveal, las filas que llegan por el refresco en vivo se toman tal cual. Nada más se anima en la app.

80. **El puntaje es el héroe.** En el resultado ocupa 7rem en display; en las filas del ranking va en display 4xl con la unidad chica al lado y los puntos (+10) más chicos todavía. Los puestos se distinguen por peso y color (el 1º en oro, del 2º al 3º en tinta, el resto en tinta suave), sin medallas ni emojis; la única excepción es la corona del campeón, que pide el brief.

81. **La revisión visual en un teléfono real queda para vos.** Lo que se pudo hacer acá fue revisar cada pantalla en capturas de un Pixel 7 emulado (viewport, fuentes y tamaños reales). El criterio "listo cuando" de la etapa pide un teléfono de verdad.

## Verificación contra Supabase real

82. **Los E2E esperan hasta 15 segundos por aserción, no 5.** Contra Supabase real en Docker y `next dev`, una acción de servidor más el redirect y el render de la página siguiente tarda de 3 a 7 segundos en una máquina modesta (i3 de 4 núcleos, 8 GB): cada página con sesión encadena varias consultas a Supabase y el middleware llama a `getUser`. La API de Supabase responde en 10 a 70 ms; lo lento es el render de desarrollo. Con el emulador en proceso no pasaba. Se cambió solo `expect.timeout` en `playwright.config.ts`; ninguna aserción se aflojó.

83. **Vincular un email exige confirmarlo (`enable_confirmations = true`).** Con `false`, Supabase real le asigna el email a la cuenta anónima en el acto, confirmado y sin mandar ningún link: cualquiera podía quedarse con un email ajeno, y el magic link nunca llegaba a Mailpit. Con `true` (que es el default de un proyecto en la nube: "Confirm email" prendido) el email queda en `email_change` hasta tocar el link, y la pantalla ya contemplaba ese estado. Además, si el email ya es de otra cuenta, Perfil lo dice ("ese email ya está vinculado a otra cuenta.") en lugar del genérico, y el E2E usa un email distinto en cada corrida porque la base de Supabase persiste entre corridas.

84. **La URL y el secreto del recordatorio viven en Supabase Vault, no en `app.settings`.** `alter database postgres set app.settings.*` falla en Supabase ("permission denied to set parameter": el rol `postgres` no es superusuario, tampoco en la nube), así que el job de `pg_cron` nunca iba a tener a dónde llamar. La migración 5 reescribe `call_reminders()` para leer `playus_reminder_url` y `playus_cron_secret` de `vault.decrypted_secrets` (cifrados en reposo; es lo que Supabase recomienda para `pg_cron` + `pg_net`), con `app.settings.*` como respaldo para un Postgres propio. Sigue siendo `security definer` y sin `execute` para `anon` ni `authenticated`. Se configura una vez con `select vault.create_secret('<url>', 'playus_reminder_url')` y `select vault.create_secret('<CRON_SECRET>', 'playus_cron_secret')`.

85. **El stack local se levanta sin logs, storage ni edge functions.** `npx supabase start` a secas no terminó en esta máquina: `analytics`, `storage` y `studio` no pasaban el chequeo de salud a tiempo. La app no usa ninguno de los tres primeros, así que el comando documentado es `npx supabase start -x logflare,vector,storage-api,imgproxy,edge-runtime`. Studio tarda en quedar sano pero funciona; si el chequeo corta el arranque, `--ignore-health-check`.

## Correcciones de la prueba en teléfonos

86. **En reflejo, quedarse sin tiempo da un puntaje, no un intento rechazado.** Si el cronómetro de 35 s corta antes de la quinta ronda (por ejemplo, después de varias salidas en falso), el contenedor usaba el último parcial, que tenía menos de cinco rondas o puntaje 0, y el servidor lo rechazaba como "puntaje no posible". Ahora reflejo informa desde el arranque el resultado "si cortaran ahora": las rondas que faltan valen el tope de 2000 ms, igual que no tocar. El puntaje es válido y malo, y la pantalla dice "se acabó el tiempo". No da ventaja: el tope es el peor valor posible.

87. **Los rechazos de `/finish` no acusan.** "ese puntaje no es posible. el intento se perdió." pasó a "no pudimos validar este puntaje. el intento cuenta igual." (y lo mismo con la duración, el cuerpo y la traza). Hoy dice "los intentos que empezaste cuentan aunque no se hayan guardado." en lugar de "las partidas que no terminaste". El criterio antitrampa no cambió.

88. **Entre rondas de reflejo, el texto va en claro.** El fondo entre rondas es oscuro y el tiempo de la ronda iba en `text-fondo` (contraste de 1,2 a 1). Ahora el color del texto depende de la fase: oscuro sobre rosa y verde, claro sobre el fondo oscuro.

89. **En pantallas de menos de 420 px, la fila del ranking cede lugar al nombre.** El puntaje baja de `text-4xl` a `text-3xl` y los puntos (+10) van debajo en lugar de al lado; el nombre baja a `text-base`. A 360 px entra "Valentina Rodríguez" completo. De 420 px para arriba queda igual que antes. El puntaje sigue siendo lo más grande de la fila (decisión 80).

90. **Las victorias cuentan solo días cerrados.** Como la tabla de la temporada (decisión 54), una ronda suma a "victorias" y a "donde mejor te va" recién cuando pasó la medianoche del grupo; hasta entonces el puesto puede cambiar. "rondas jugadas" y la racha sí cuentan el día de hoy.

91. **El link de invitación pide confirmar si ya usás la app.** Quien ya tiene nombre y abre el link de un grupo en el que no está ve "vas a entrar como …" con "entrar al grupo" y "ahora no". Si ya está en ese grupo (se puede saber porque RLS le deja leerlo), entra directo como antes. Quien llega por primera vez sigue igual: nombre, avatar y adentro.

92. **Guardar el recordatorio avisa al lado del campo.** "guardado" aparece junto a la hora, como en el apodo, en lugar de al final del texto chico. Guarda con una pausa de 600 ms para no escribir por cada dígito, y si la actualización no toca ninguna fila (RLS: no sos owner) lo muestra como error.

93. **Sin barra de scroll en la fila de categorías del avatar, y lugar reservado para la del documento.** La fila sigue deslizándose; la barra se oculta. `scrollbar-gutter: stable` en `html` evita que el contenido se corra unos píxeles entre páginas con y sin scroll en escritorio.

## Etapa extra: rediseño Frog

94. **Cambio de dirección visual: Frog.** La app pasa a llamarse `frog` (siempre en minúscula) y cambia de identidad. Cuatro cambios respecto del brief original:
    - **Paleta:** índigo → estanque de noche (`--fondo #0E2620`, `--superficie #163A2F`, acción en `--rana #86E05A`, primer puesto en `--luciernaga #FFD34E`, alertas en `--lengua #FF6F91`, tu fila en `--agua #6FD3E0`).
    - **Tipografía:** Bricolage Grotesque → Fredoka 600/700 para títulos, nombres, números, botones y la marca; Instrument Sans 400/500/600 para el resto. Como Instrument no se carga en 700, `font-bold` de Tailwind se remapea a 600.
    - **Estilo:** plano con contornos de 3 px y sombras duras (nunca difuminadas), esquinas desparejas (tres grandes y una chica, distinta según la tarjeta), estética de caricatura. Estados vacíos con borde punteado y sin fondo.
    - **Movimiento:** el brief permitía una sola animación (el FLIP del ranking). Ahora también hay parpadeo y saltito de la rana mascota, y el hundimiento de los botones al presionar (feedback táctil). Todo lo decorativo se apaga con `prefers-reduced-motion`: la rana queda quieta y con los ojos abiertos.

95. **La rana es un componente de pixel art calculado desde un mapa de letras.** `src/components/frog/frog-grid.ts` arma la grilla de 15×15 (mapa base de 12×8, siete poses aplicadas con `put`, borde de sticker y sombra) sin React, y `Frog.tsx` la dibuja como un `<path>` por color. Así se testea con vitest y el mismo dibujo genera los íconos de la PWA (`scripts/frog-icons.ts`, con `sharp` y vecino más cercano, que ya viene con Next). La rana es decorativa: el SVG va con `aria-hidden`; donde significa algo (la corona del campeón) el significado va en el contenedor con `role="img"`.

96. **Los nombres internos siguen siendo `playus`.** Cookies (`playus-group`, `playus-fake-today`), claves de `localStorage`, nombres de caché del service worker, el proyecto de Vercel y el repo conservan el nombre anterior. Renombrarlos no le aporta nada a quien usa la app y algunos (las cookies) cerrarían la sesión de todo el mundo.

97. **El aviso "te pasó por X" se calcula con `finished_at`.** Para saber si alguien te pasó *después* de tu mejor partida, Hoy lee una columna más (`finished_at`) en la misma consulta de `attempts` que ya hacía, y busca a quien tiene mejor puesto y cuyo mejor puntaje llegó después del tuyo. No se tocó ningún endpoint, política ni regla de rondas. La diferencia se muestra con la unidad del juego ("ms" en reflejo; sin unidad en tap race).

98. **Quien todavía no jugó aparece en las listas con la rana dormida.** En Hoy antes de jugar, "los demás" lista a todos los integrantes: quien ya jugó lleva el puntaje tapado con una píldora con una ola; quien no, la rana dormida. En el ranking, los que faltan van al final con "todavía no", sin puesto ni puntaje. Antes solo se listaba a quienes habían jugado.

99. **Los avatares de "{A} y {B} ya están adentro" en la invitación quedan afuera de esta etapa.** Quien abre el link todavía no es integrante, y RLS no le deja leer los integrantes del grupo. Mostrarlos exige una RPC `security definer` nueva (una migración), que esta etapa prohíbe. Queda como pregunta.

100. **`invite_preview(code)`: lo mínimo para que la invitación diga quiénes están adentro.** Quien abre el link no es integrante y RLS no le deja leer nada del grupo, así que una RPC `security definer` devuelve `{ total, members: [{ name, avatar }] }` con hasta 5 integrantes por orden de ingreso (`name` es el apodo en el grupo o el `display_name`). Sin ids ni fechas. Un código inexistente o mal formado devuelve `{ total: 0, members: [] }`, lo mismo que un grupo vacío, para no dar pistas (decisión 17). Solo `authenticated` la ejecuta (la invitación abre la sesión anónima antes de llamarla); `anon` no. Los 16 tests de `08_invite_preview.sql` comprueban las claves exactas de la respuesta, el corte en 5, la normalización del código y los privilegios. Reemplaza a la decisión 99.

101. **La rana asomada sobre la tarjeta del juego se achica un 20% por debajo de 360px.** La rana y su globo escalan desde la esquina superior derecha (`origin-top-right scale-[0.8]`), así quedan por encima del título en vez de pisarlo, el título reserva lugar a la derecha (`pr-20` / `pr-32` desde 360px) y su tamaño es `clamp(40px, 15vw, 58px)`. Verificado a 320, 360 y 412px: las cajas del título, la rana y el globo no se cruzan y no hay scroll horizontal.

102. **`sharp` pasa a `devDependencies`.** El generador de íconos lo usaba como dependencia transitiva de Next; ahora está declarado (`^0.35.4`, la misma versión instalada) para que un cambio de Next no lo rompa.

103. **La semilla es por intento: `hash(round.seed + ':' + attempt_number)`.** Antes todos los intentos de una ronda compartían la semilla de la ronda, y quien jugaba una vez ya sabía cómo venía la partida en los siguientes. Ahora `/start` devuelve `attemptSeed(round.seed, attempt_number)` y `/finish` llama a `validate` con esa misma semilla. Todos los integrantes ven la misma secuencia en el mismo número de intento (sigue valiendo "el mismo tablero para todos") y cada intento propio es distinto. El contrato de juegos no cambia: el juego recibe solo `seed`. La página de la partida ya no manda la semilla de la ronda al cliente: la semilla llega recién en la respuesta de `/start` y no se guarda en ninguna tabla. Reflejo y tap race quedan como están (son de relleno). Salvedad: la semilla de la ronda sí es legible por los integrantes vía RLS (`rounds`), y la función de hash es pública, así que alguien decidido podría calcular la del intento 2 antes de empezarlo; frenarlo de verdad exige un secreto del servidor en el hash o sacar `seed` de lo que RLS expone. Va como pregunta en el reporte.

104. **Las fuentes viven en el repo (`next/font/local`), no se bajan de Google.** A mitad de esta ejecución, `next dev` con Turbopack empezó a fallar con 500 en todas las páginas: Google Fonts pasó a servir las fuentes por URLs dinámicas (`/l/font?kit=…`) cuyo propio `?` rompe el resolvedor de `next/font/google` en Turbopack ("next/font/google queries have exactly one entry"); webpack (el build de producción) las aguantaba. Es el fallback que ya preveía la decisión 75: los dos archivos variables del subconjunto latino (Fredoka 600–700 e Instrument Sans 400–600, ~30 KB cada uno, licencia OFL) están en `src/app/fonts/` y `layout.tsx` usa `next/font/local`. Ni el desarrollo ni el build dependen de Google. Ojo al actualizarlas: css2 a veces devuelve versiones reducidas de 4 a 11 KB; las buenas pesan unos 30 KB.

105. **Un secreto del servidor (`SEED_PEPPER`) entra en la semilla de cada intento.** `attemptSeed` es `hash(round.seed + ':' + attempt_number + ':' + SEED_PEPPER)`. Cierra la salvedad de la decisión 103: la semilla de la ronda es legible por los integrantes vía RLS y el hash es público, así que sin el pepper cualquiera podía calcular la de su próximo intento antes de empezarlo. Va en `.env.example`, en el `.env.local` y en Vercel (producción y preview). En producción, si falta, `/start` falla con `seed_pepper_missing` (500) antes de consumir el intento, en lugar de usar un valor por defecto; en desarrollo y tests vale un fijo (`dev-pepper`). **No se cambia nunca salvo que se filtre**: como las semillas no se guardan sino que se recalculan, cambiarlo a mitad de un día les da tableros distintos a los que juegan antes y después (y `validate` rechazaría las partidas en curso). Si hay que cambiarlo, justo después de medianoche, cuando no hay partidas en curso.

106. **Reflejo queda como está (opción B).** Los tiempos del verde salen de la semilla del intento y son iguales para todos en el mismo número de intento; con la semilla por intento (103), el segundo intento ya no repite el primero. Reflejo y tap race son de relleno y no se corrigen más: cerrado.

## Primer juego real: encontrá a la piba del IPA

107. **El mapa vive en 120 × 160 unidades lógicas y todo lo demás se deriva de ahí.** Posiciones, cajas de toque y toques registrados van en esas unidades; el canvas se escala por un entero de píxeles del dispositivo por unidad (`floor(min(ancho·dpr/120, alto·dpr/160))`), con `imageSmoothingEnabled = false` y centrado. En un Pixel 7 da 8 píxeles por unidad (3 px CSS): un sprite de 9 × 13 mide 27 × 39 px CSS y su caja de toque (una unidad más por lado) 33 × 45. Sin zoom ni desplazamiento.

108. **Tap race y reflejo salen del mazo, no del código.** `src/games/index.ts` tiene `ACTIVE` (solo la piba) y `RETIRED` (los dos de relleno). `GAME_IDS`, que arma el mazo, sale de `ACTIVE`; `getGame` resuelve los dos grupos. Se conserva el módulo entero de los retirados (no solo id, nombre y scoring) porque una ronda ya creada con uno de ellos se sigue jugando y validando con él; el costo es nulo. Con un solo juego activo, el mazo reparte la piba todos los días.

109. **`Intro?` es un campo opcional nuevo del contrato.** La ficha "así es ella" necesitaba un lugar en la pantalla previa y el contrato no lo tenía. El contenedor lo muestra debajo de las instrucciones. Los juegos que no lo definen no cambian.

110. **Las reglas de la partida viven en un solo módulo puro (`rules.ts`) que usan el cliente y el servidor.** `applyTap` aplica un toque al estado (acierto, error con 2 s de bloqueo, cambio de mapa); `simulate` recorre la traza; `validate` compara. Cualquier diferencia entre cliente y servidor sería un puntaje rechazado, así que no hay dos implementaciones. Detalle que sale de esto: al aparecer un mapa (también el primero) el cliente no toma toques durante 500 ms, que es lo que dura el cartel "¡la encontraste!" del mapa anterior; así ningún acierto legítimo puede caer antes de los 400 ms que el servidor rechaza. Los toques durante la penalización de 2 s sí se registran (y se ignoran en los dos lados).

111. **La ubicación garantiza la cabeza de la piba y trata de cuidar las demás.** Se ubica primero a la piba y cada persona siguiente se rechaza si, dibujada encima de ella (pies más abajo), pisa su cabeza (las 6 filas de arriba: gorro, cara y pucho). La misma condición se intenta para todas las cabezas, con tope de intentos; si no hay lugar limpio se acepta tapar cuerpos ajenos, nunca la cabeza de la piba. En 1.000 mapas de prueba no hizo falta el respaldo ni una vez, así que el tope de 70 personas quedó como pedía la tabla.

112. **La traza guarda solo toques; los mapas se rearman con la semilla.** `TapEvent = { t, map, x, y }` con `t` en ms desde `onReady`. El servidor genera los mapas con la semilla del intento (con pepper, decisión 105) y recorre la traza. Una traza armada con otra semilla cae en mapas distintos y no valida.

113. **Los E2E corren de a uno (`workers: 1`).** Con varios archivos en paralelo, `next dev` compila rutas al mismo tiempo, algún `router.refresh()` del ranking en vivo falla de forma transitoria y el overlay de desarrollo de Next 15.5 se cae al intentar mostrar ese error ("frame.join is not a function"), dejando la página en "Application error". Pasó dos veces en corridas completas y nunca con el archivo solo; el mismo flujo reproducido con captura de consola no dio ningún error. En producción no existe el overlay y un refresco fallido no tumba nada. La suite tarda unos 7 minutos en vez de 4; a cambio, un rojo es un rojo.

114. **Tap race y reflejo se borraron.** Reemplaza a la 108: ya no hay lista de retirados. Los dos eran relleno de la etapa 4 y no se iban a corregir; en producción no había ninguna ronda pasada con ellos, solo las tres de hoy (creadas antes de publicar la piba), que se movieron a la piba con la semilla de ronda recalculada y sin sus 8 intentos de prueba. El registry vuelve a ser una sola lista; `src/games/README.md` toma a la piba como ejemplo de referencia y un esqueleto mínimo como plantilla.

## Segundo juego real: quedó re tarado

115. **`Result?` es otro campo opcional del contrato.** El documento pide que la pantalla de resultado muestre "18,4 s" o "te faltaron N toques" con la cara final; el contenedor solo sabía mostrar el puntaje grande. Como con `Intro` (109), un campo opcional que el contenedor usa si existe. `Intro` pasa a recibir `seed`, para mostrar la cara del intento. En el ranking y el historial el tarado sigue mostrando el puntaje crudo en ms ("18400 ms"): cambiarlo exige un formateador por juego en el contrato; queda como deuda.

116. **`minDurationMs: 11_000` en el tarado.** El default del contrato es `durationMs - 2000` (38 s), pensado para juegos que solo terminan por tiempo. El tarado se puede terminar en 11 s (200 toques a 55 ms) y `/finish` habría rechazado por duración cualquier partida rápida. Es el mismo umbral que `minPlausibleScore`.

117. **Umbrales de `validate` y cómo se calibraron.** Intervalo mínimo 35 ms entre toques; ritmo demasiado parejo = desvío estándar menor a 4 ms en cualquier ventana de 30 intervalos seguidos; tope de 40.000 + 2.000 ms para el último toque de quien no terminó, y el toque 200 tiene que caer antes de los 40.000 (el cronómetro corta ahí; un toque 200 después del corte no es legítimo, y así toda partida terminada queda por delante de toda partida no terminada: 40.000 < 40.100). Calibración: 20 trazas humanas simuladas con intervalos uniformes entre 55 y 160 ms (desvío ≈ 30 ms) pasan todas; un ritmo fijo de 60 ms y uno de 60 ± 1 ms (desvío ≈ 0,8 ms) caen; 29 intervalos parejos seguidos de ritmo humano pasan (la ventana es de 30). En el E2E, 200 clics de Playwright con esos intervalos pasaron el filtro en el servidor real. Falta la calibración con dedos reales en el teléfono: si rechaza partidas de verdad, bajar el desvío mínimo a 3 ms es el primer ajuste.

118. **Un solo dedo, con un registro de punteros puro.** `createPointerTracker` cuenta un `pointerdown` solo si no hay otro puntero apretado; `pointerup` y `pointercancel` lo liberan. En escritorio vale el botón izquierdo del mouse; el teclado no dispara nada porque el área no es un botón. `touch-action: manipulation`, `user-select: none` y `preventDefault` en `contextmenu` en el área.

119. **La cara vive en un lienzo de 46 × 34 unidades:** la cara de frente ocupa 32 × 32 (columnas 4 a 35) y el cigarro sale de la comisura derecha hacia afuera (filtro de 2 más 14 de papel, que baja un píxel cada ~14 toques hasta la colilla de 2). Los accesorios se dibujan alrededor de los ojos y por encima de la boca, nunca sobre los ojos ni sobre la fila del cigarro; el test lo comprueba en 300 caras. La ceniza se acumula hasta 3 unidades y cada 20 toques cae una unidad durante 450 ms; el humo suma un penacho por cada 20 % consumido.

## Tercer juego real: los deseos de Larry

120. **`validate` recibe la duración real del intento.** El documento pide rechazar un tick de fin incoherente con la duración, y `validate(result, seed)` no la conocía. El contrato suma un tercer parámetro opcional, `meta?: { elapsedMs }`, que `/finish` completa con lo que ya medía (desde `started_at`, con la cuenta regresiva incluida). Los otros dos juegos lo ignoran y no cambian. Larry exige `fin ≤ elapsedMs ≤ fin + 10 s`, el mismo margen que `gameLimits` da sobre `durationMs`.

121. **La traza cierra con `{ tick, fin: true }`.** Además de los cambios de objetivo `{ tick, x }`, el último evento dice en qué tick terminó la partida. Hace falta por el corte del cronómetro: el contenedor corta a los 90 s de reloj y puede hacerlo uno o dos ticks antes de que la simulación llegue sola al 5.400, así que el servidor no puede adivinar dónde paró. `validate` vuelve a jugar hasta ese tick y rechaza si la partida ya había terminado antes (tres vidas perdidas o algo malo agarrado). Declarar un fin más temprano no da ventaja: el puntaje solo sube con el tiempo.

122. **Simulación entera a 60 ticks, avanzada por el tiempo transcurrido.** Las posiciones van en subunidades (16 por unidad lógica; el campo mide 90 × 160). Cada tick hace, en este orden: Larry camina hacia el dedo a 36 subunidades por tick como máximo (cruza el campo en 0,6 s), aparecen los objetos del tick, caen, y se revisa el agarre en el tick en que la base de cada objeto cruza la altura de agarre (y = 128, la parte de arriba del sprite de Larry): agarra si las cajas se superponen en x (objeto de 8 unidades y Larry de 12). Lo que pasa de largo llega al piso (y = 150). El cliente no usa un acumulador flotante que se desvíe: calcula el tick que corresponde al tiempo transcurrido y simula hasta ahí, sin tope. Si la pestaña estuvo en segundo plano, se pone al día de una (5.400 ticks tardan menos de un milisegundo). El ciclo del juego se registra en `requestAnimationFrame` antes que el cronómetro del contenedor, así que en cada cuadro la simulación avanza primero.

123. **La lluvia se genera entera con la semilla, y las garantías se definen con un jugador perfecto que solo usa lo que ve.** `generateRain` fija de una vez qué cae, dónde, cuándo y a qué velocidad, y garantiza cuatro cosas:
    - Los objetos cruzan la altura de agarre de a uno, en el orden en que aparecen; si hace falta, el que viene cae un poco más despacio.
    - Cada deseo se alcanza desde el anterior con 3/4 de la velocidad máxima, contando desde que aparece en pantalla.
    - Larry yendo a toda velocidad al próximo deseo visible, y esperando ahí, nunca queda a menos de 14 unidades de un objeto malo cuando este cruza. Es 4 más de lo que haría falta para tocarlo.
    - Un objeto malo que cruza a menos de 12 ticks de un deseo cae a 14 unidades o más de él. Tampoco cae a menos de 14 del último deseo, que es donde Larry espera el próximo. Así, el próximo deseo siempre tiene lugar (al menos el mismo x) y ningún hueco de deseo queda vacío. Un objeto malo sin lugar justo se saltea (pasa poquísimo).
    
    Los tests lo comprueban en 1.000 semillas con el bot `greedyTarget`, que agarra todos los deseos, no toca nada malo y llega a los 90 s con las 3 vidas. "Nunca pasa algo injusto" queda definido así: siempre existe una forma humana de jugar perfecto.

124. **El cronograma quedó como el de la tabla.** Intervalo de 54, 36, 24 y 17 ticks; velocidad de 16, 22, 30 y 40 subunidades por tick (hasta Larry en 2,1, 1,5, 1,1 y 0,85 s); objetos malos al 10, 18, 25 y 30 %. Se interpola en ticks con enteros y cada objeto varía ±20 % el intervalo y ±12 % la velocidad. Calibración con un jugador simulado que sigue al próximo deseo con retraso de reacción y puntería con error, sin esquivar: con 200 ms de reacción la partida dura 37, 47 y 55 s (cuartil 1, mediana y cuartil 3); con 300 ms, 22, 28 y 34 s. Como la típica cae entre 30 y 60 s, no se tocó nada. Falta confirmarlo con dedos reales. Si resulta muy fácil, el primer ajuste es la velocidad de la fila de 60 s.

125. **`maxPlausibleScore = 246`.** Es la cantidad de huecos del cronograma en 90 s con el intervalo más corto posible y sin ningún objeto malo; ninguna lluvia puede dar más deseos. En 1.000 semillas, el máximo real fue 169.

126. **`minDurationMs: 5_000`.** El default del contrato (88 s) rechazaría cualquier partida que termina antes, que en este juego es lo normal. Lo más rápido posible es agarrar algo malo en el primer objeto: cruza a los ~2,5 s, más 3 s de cuenta regresiva y 1 s de cierre. La coherencia fina la mira `validate` (120).

127. **Un bot que juegue en tiempo real con la semilla del intento no se puede frenar del todo.** Con la semilla, alguien puede generar la lluvia y mover a Larry perfecto: sería una partida posible. `validate` garantiza que la traza sea una partida que sale de esa semilla, con ese puntaje y en ese tiempo, no que la juegue una persona. Entre amigos alcanza.

128. **Cajas iguales para todo lo que cae (8 × 8) y un sprite de Larry de 14 × 22 con una zona de agarre de 12.** Los objetos se distinguen por la silueta (hamburguesa ancha, vapo alto con nube, lechuga redonda, zanahoria en punta, brócoli en árbol, bandera en mástil), pero todos tienen la misma caja: es más fácil de leer y de explicar. El mapa de letras de `sprites.ts` es el mismo para el canvas, los SVG de la pantalla previa, el resultado y las vidas.

129. **Lo que el documento no decía.**
    - Sin vidas, el cartel dice "sin vidas" y la cara es la de bajón.
    - Por tiempo no hay cartel: corta el contenedor.
    - El resultado propio (`Result`) muestra la cara final, el número y el motivo ("agarraste verdura.", "agarraste la bandera.", "se te cayeron tres.", "aguantaste los 90 segundos.").
    - El ranking muestra el número sin unidad, como la piba.
    - El sacudón de pantalla al perder una vida y las migas del "plaf" son decorativos y se apagan con `prefers-reduced-motion`.

130. **Herramienta de desarrollo y E2E.** `/dev/juego/los-deseos-de-larry` tiene casillas para las cajas de colisión y la cámara lenta (×0,25), y botones "desde 0/30/60/80 s": el jugador perfecto juega hasta ese tick y ahí toma el control el dedo. También van por URL: `&desde=60&cajas=1&lento=1`. En desarrollo, la página deja las reglas en `window.__larry` para que un E2E compare la simulación del navegador con la de Node sobre la misma traza (tienen que dar el mismo JSON). `rules.ts` importa `rng` por ruta relativa, como el mapa de la piba, porque Playwright lo carga sin los alias de Next.

131. **Con tres juegos, `createGroupWithGame` intenta hasta 14 grupos.** Cada grupo nuevo tiene una chance de tres; con 14 intentos, la probabilidad de no encontrarlo es de 0,3 %.
