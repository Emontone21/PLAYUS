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
