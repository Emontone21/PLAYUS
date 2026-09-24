# Reporte: etapa 5 (rondas, intentos, puntos, rankings y temporadas)
Estado: completa
Fecha: 2026-09-24

## Qué hice

Conecté todo lo anterior en el ciclo diario completo: la ronda de cada día se crea sola, el juego del día sale del mazo barajado por temporada, la partida consume el intento al empezar y el servidor valida el resultado antes de guardarlo, el ranking del día se ve en vivo y solo después de jugar, los puntos suman a la tabla de la temporada, el historial y las estadísticas del perfil se llenan, y las temporadas de 30 días se cierran solas con un campeón que lleva corona en la siguiente. El criterio "listo cuando" del brief corre de punta a punta en un test de Playwright con dos navegadores y el día siguiente simulado.

Rondas y temporadas. `ensureRound(group, today)` busca la ronda de hoy y, si falta, asegura la temporada (crea la primera; si la última venció, la cierra calculando el campeón y abre la siguiente arrancando hoy), calcula el índice del día dentro de la temporada, saca el juego del mazo (`gameForDay`: se baraja el registry ordenado alfabéticamente con semilla `hash(group + season + vuelta)`, se reparte uno por día, y si la primera carta de una vuelta coincide con la última de la anterior se intercambia con la segunda), arma la semilla `hash(group + play_date + game)` y hace el `INSERT` sobre `unique(group_id, play_date)`; si otro pedido ganó la carrera, lee la que quedó. Todo con el cliente `service_role` en el servidor. "Hoy" es la fecha en la zona horaria del grupo (`todayInTz`), con `DEV_FAKE_TODAY` o la cookie de `/dev/hoy` por encima solo en desarrollo.

Antitrampas. `POST /api/rounds/:id/start` verifica sesión y membresía, que la ronda sea la de hoy (una pasada devuelve "ya cerró"), marca `abandoned` los intentos colgados de más de 5 minutos y cualquier intento propio en curso, cuenta los usados (el número más alto, sin importar el estado) contra `max_attempts`, y crea el intento `in_progress` con `started_at = now()`; devuelve id, semilla, juego y duración. `POST /api/attempts/:id/finish` rechaza si el intento no existe, no es tuyo o ya terminó; si el tiempo transcurrido queda fuera de `[minDurationMs, durationMs + 10 s]`; si el puntaje queda fuera de `[minPlausibleScore, maxPlausibleScore]`; o si el `validate` del juego falla sobre la traza. Cualquier rechazo deja el intento `abandoned`: se pierde igual que recargar. Si pasa, guarda `completed` con el puntaje. En la pantalla previa de la primera partida aparece el aviso: "el intento se gasta al tocar jugar. si recargás o cerrás la app en medio de la partida, se pierde igual."

Puntos. `src/lib/scoring.ts` es puro: `rankRound` ordena por mejor puntaje respetando la dirección del juego y reparte 10/7/5/3 y 1 para el resto; en un empate todos llevan el mismo puesto y puntos y se saltea el siguiente (1, 1, 3). `standings` acumula rondas y desempata por victorias; `champion` toma al primero. Tests con vitest para todos los casos, incluidos los empates.

Pantallas. Hoy muestra arriba "ayer ganó X con N en juego" cuando existe la ronda de ayer, y después: si no jugaste, el juego del día grande con nombre, tagline e instrucciones, el botón "jugar", cuántos intentos quedan, y quiénes ya jugaron con "???" en lugar del puntaje (vía la RPC `round_participants`); si ya jugaste, el ranking del día con tu fila marcada, tu mejor puntaje, los puntos que suma cada puesto, y "jugar de nuevo" si quedan intentos. El ranking se refresca por Realtime (suscripción a `attempts` de la ronda, que respeta RLS) más un refresco cada 15 segundos de respaldo. `/hoy/jugar` monta el contenedor de la etapa 4 con `onStart` → `/start` y `onSubmit` → `/finish`; "listo" vuelve a Hoy. Grupo muestra la tabla de la temporada (puntos de los días cerrados, con "N×1º" para las victorias y la corona del campeón anterior), el historial de días con juego, ganador, cuántos jugaron, tu puntaje y tu puesto, la lista de integrantes (cada uno linkea a su perfil en `/grupo/integrante/[id]`) y el botón de invitar. Perfil ya llena "tus números": rondas jugadas, victorias, mejor racha de días seguidos, temporadas ganadas y el juego donde mejor te va, calculados al vuelo con lo que RLS deja ver.

Dos hallazgos importantes en el camino. El primero afecta a Supabase real: Next memoiza los `fetch` GET idénticos dentro de un mismo render, así que "¿existe la ronda? → no → la creo → ¿existe?" devolvía el "no" memoizado y la app fallaba con "no se pudo crear la ronda". Lo resolví dándoles a los clientes de servidor un `fetch` con `signal` propio y `cache: "no-store"`. El segundo era del emulador local: devolvía las columnas `date` como timestamps y respondía los `INSERT` antes del `commit`; las dos cosas están corregidas y documentadas.

Verificación: el test E2E nuevo crea un grupo desde un navegador, entra por el link desde otro, comprueba que Hoy muestra el juego del día y "te quedan 3 intentos", que el aviso de recargar aparece antes de la primera partida, juega lo que toque (tap-race o reflejo), ve el ranking con su fila y "te quedan 2 intentos"; el segundo navegador ve que el primero jugó pero no su puntaje, juega, y ve el ranking con los dos; el primero, sin tocar nada, ve aparecer al segundo; el primero del ranking lleva +10; el perfil ya tiene números; se adelanta un día con `/dev/hoy/set?adelantar=1` en los dos navegadores y Hoy muestra el otro juego, "ayer ganó …" y otra vez 3 intentos; la tabla de la temporada y el historial tienen el día cerrado; y el perfil del otro integrante abre desde la lista. Además, un test de vitest contra la base local prueba el consumo de intentos: la ronda se crea una sola vez; recargar a mitad de partida cuesta el intento; tiempo demasiado corto, demasiado largo y puntaje imposible se rechazan y el intento se pierde; el cuarto intento se rechaza; un intento válido se guarda y no se puede terminar dos veces ni por otra persona; una ronda pasada no se puede jugar; la temporada cierra con campeón y la siguiente abre; un intento colgado más de 5 minutos queda abandonado al empezar otro.

## Archivos

- creados: `src/lib/time.ts` y `time.test.ts`: fecha de hoy por zona horaria, `addDays`, `daysBetween`, formato corto.
- creados: `src/lib/deck.ts` y `deck.test.ts`: mazo por temporada, `gameForDay`, `roundSeed`; tests de no repetición, decisión 5 y determinismo.
- creados: `src/lib/scoring.ts` y `scoring.test.ts`: puntos 10/7/5/3/1 con empates, mejores puntajes, tabla y campeón.
- creados: `src/lib/rounds.ts`: `ensureRound`, `ensureSeason`, `closeSeason`, `seasonStandings`, `rankedRound`, `abandonStale`, `groupToday`.
- creados: `src/lib/attempts.ts` y `attempts.test.ts`: `startAttempt`, `finishAttempt`, `AttemptError`; test de integración contra la base local (se saltea sin stack).
- creados: `src/lib/api.ts`: usuario de la sesión, fecha simulada (`DEV_FAKE_TODAY` y cookie), errores JSON.
- creados: `src/app/api/rounds/[roundId]/start/route.ts` y `src/app/api/attempts/[attemptId]/finish/route.ts`: los dos endpoints.
- creados: `src/lib/supabase/admin.ts`: cliente `service_role` solo de servidor.
- creados: `src/lib/supabase/fetch.ts`: `fetch` fuera de la memoización de Next (decisión 52).
- creados: `src/lib/today.ts`: todo lo que necesita Hoy (ronda, intentos, ranking, participantes, ganador de ayer, campeón).
- creados: `src/lib/group-summary.ts`: tabla de la temporada e historial para Grupo.
- creados: `src/lib/stats.ts`: estadísticas del perfil al vuelo.
- creados: `src/components/ranking.tsx` y `crown.tsx`: filas de ranking (tu fila con borde en agua, puestos por peso y color) y la corona.
- creados: `src/app/(app)/hoy/page.tsx`, `live-refresh.tsx`, `jugar/page.tsx`, `jugar/play.tsx`: la pestaña Hoy y la partida conectada a los endpoints.
- creados: `src/app/(app)/grupo/integrante/[id]/page.tsx`: perfil de otro integrante.
- creados: `src/app/dev/hoy/page.tsx` y `dev/hoy/set/route.ts`: fecha simulada (solo desarrollo).
- creados: `e2e/ronda.spec.ts`: el "listo cuando" del brief de punta a punta.
- creados: `reports/etapa-5.md`: este reporte.
- modificados: `src/app/(app)/grupo/page.tsx`: tabla de la temporada, historial, corona y links a los perfiles.
- modificados: `src/app/(app)/perfil/page.tsx` y `src/components/profile-stats.tsx`: estadísticas reales.
- modificados: `src/lib/supabase/server.ts`: usa el `fetch` sin memoización.
- modificados: `src/lib/supabase/types.ts`: tipos de inserción y actualización de `seasons`, `rounds` y `attempts` para el servidor.
- modificados: `scripts/mini-supabase/server.mjs`: `date` como texto, respuesta después del commit, filtro `not.is.null`, `MINI_DEBUG=1`.
- modificados: `scripts/mini-supabase/keys.mjs` y `.env.example`: `NEXT_PUBLIC_DISABLE_REALTIME`.
- modificados: `vitest.config.ts`: JSX para los tests que importan el registry (vite 8 usa oxc).
- modificados: `README.md` y `DECISIONS.md` (decisiones 52 a 63).

## Decisiones nuevas

52. Los clientes de Supabase del servidor usan un `fetch` con `signal` propio y `cache: "no-store"` para salir de la memoización de Next; sin esto la creación perezosa de rondas fallaba también contra Supabase real.
53. La temporada nueva arranca el día que se crea (no se fabrican temporadas vacías); `ends_on = starts_on + 29`; cierre idempotente con campeón por puntos y después victorias.
54. La tabla de la temporada cuenta solo los días cerrados; lo de hoy suma a medianoche.
55. Los intentos rechazados por `/finish` pasan a `abandoned`: cuestan igual que recargar.
56. `/start` abandona los intentos colgados de más de 5 minutos y los propios en curso; los intentos usados son el número más alto sin importar el estado.
57. `DEV_FAKE_TODAY` (variable) y la cookie `playus-fake-today` (`/dev/hoy/set`, un Route Handler) simulan la fecha solo en desarrollo.
58. Ranking en vivo con Realtime (respeta RLS) más refresco cada 15 s; `NEXT_PUBLIC_DISABLE_REALTIME=1` para el emulador.
59. La vista tapada de Hoy usa `round_participants`.
60. Estadísticas calculadas al vuelo con el cliente del usuario que mira; sin tablas de agregados.
61. El perfil de otro integrante en `/grupo/integrante/[id]`.
62. El test de intentos corre contra el stack disponible y se saltea si no hay; inyecta `now` para no esperar partidas reales.
63. El emulador devuelve `date` como texto y responde después del commit; `MINI_DEBUG=1` imprime cada petición.

## Desvíos del plan o del brief

- El aviso de "te pasaron" (push cuando alguien te supera) queda para la etapa 6, como decía el plan. `/finish` no compara rankings antes y después todavía; se agrega ahí.
- El plan pedía que la temporada siguiente arranque tras el cierre; elegí que arranque el día de la primera visita después del vencimiento (decisión 53), para no crear temporadas vacías.
- El perfil de otro integrante no estaba en el plan de esta etapa; lo había dejado pendiente en la etapa 3 y entró acá porque las estadísticas ya existen.
- Verificación contra el emulador local y no contra Supabase real, como en las etapas anteriores. Realtime no se probó de verdad: el "en vivo" del E2E lo cubre el refresco periódico, y la suscripción a `postgres_changes` sigue pendiente de verse con Docker.

## Tests

Unitarios e integración:

```
npm test   (con el emulador levantado)
→ 5 archivos, 29 tests, 29 pasan, 0 fallan
   rng (7), time (2), deck (7), scoring (6), attempts contra la base (7)
   sin stack: attempts.test.ts se saltea → 22 pasan, 7 salteados
```

Etapa 1 (sin cambios en la base): 154 aserciones pgTAP, todas pasan.

Chequeos estáticos y build:

```
npm run typecheck   → sin errores
npm run lint        → sin errores
npm run build       → compila; se suman /hoy/jugar, /grupo/integrante/[id], /dev/hoy, los dos endpoints
```

E2E (con `scripts/dev-local.sh`, `npm run dev:local-stack` y `npm run dev` levantados):

```
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e

✓ dos personas juegan el juego del día, ven el ranking en vivo y al día siguiente hay otro juego (1.2 min)
✓ reflejo: la misma semilla da las mismas esperas en dos navegadores
✓ tap-race: cuenta los toques y el cronómetro corta a los 15 segundos
✓ armar el avatar, editarlo y verlo igual desde otro navegador
✓ un perfil de la etapa 2 (solo fondo) se sigue dibujando
✓ crear un grupo, invitar por link y ver la lista en los dos lados
✓ un código inexistente avisa y deja probar otro
✓ sin sesión ni grupo, las pestañas mandan a la landing
8 passed (1.6 min)
```

## Cómo verificarlo en el navegador

1. Levantar la app (con Docker: `npx supabase start`, `npx supabase db reset`, `npm run dev`; sin Docker: sección "Sin Docker" del README, que incluye `NEXT_PUBLIC_DISABLE_REALTIME=1`).
2. Ventana normal: crear un grupo. Pestaña "hoy": el juego del día grande, "jugar", "te quedan 3 intentos", "todavía nadie jugó hoy".
3. Tocar "jugar": el aviso de que recargar cuesta el intento, el botón, la cuenta regresiva, la partida, el resultado con "quedó guardado", "listo". Hoy pasa a mostrar el ranking con tu fila y "te quedan 2 intentos".
4. Probar la trampa: tocar "jugar de nuevo" y recargar la página en medio de la partida. Al volver a Hoy quedan 1 intento menos ("las partidas que no terminaste se contaron igual").
5. Ventana de incógnito: entrar por el link (pestaña "grupo", "copiar link"). En Hoy ve "ya jugaron 1" con tu nombre y "???", sin puntaje. Juega. Ve el ranking con los dos.
6. Volver a la ventana normal sin tocar nada: en menos de 15 segundos aparece el segundo (con Supabase real, al instante por Realtime).
7. `http://localhost:3000/dev/hoy` → "+1 día" en las dos ventanas. Hoy muestra el otro juego, "ayer ganó …" arriba y 3 intentos otra vez. Pestaña "grupo": la tabla de la temporada con los puntos del día cerrado, el historial con ese día, y al tocar un integrante se abre su perfil con sus números. Pestaña "perfil": rondas jugadas, victorias, racha.
8. "volver al día real" en `/dev/hoy` al terminar.
9. Con Supabase real: en Studio, `attempts` muestra los intentos `completed` con puntaje y los `abandoned` de las recargas.

## Problemas y deuda

- Realtime no está probado de verdad (el emulador no lo tiene). La suscripción sigue el patrón documentado de `postgres_changes` con filtro por ronda, y `attempts` está en la publicación con `replica identity full` desde la etapa 1, pero hay que verlo andar con Docker.
- El corte por tiempo del contenedor usa `requestAnimationFrame`, que se pausa en segundo plano; el servidor rechaza la partida si se pasa de `durationMs + 10 s`, así que no se puede abusar, pero la experiencia de quien recibe una llamada en medio de la partida es perder el intento sin aviso. Queda para pulir (escuchar `visibilitychange` y avisar).
- Las estadísticas se calculan al vuelo leyendo todos los intentos del perfil y de sus rondas. Con meses de datos y grupos grandes va a convenir una vista materializada o agregados por temporada. Hoy es instantáneo.
- La tabla de la temporada y el historial hacen una consulta de intentos por ronda (hasta 30). Está bien para un grupo; si se nota, se agrupa en una sola consulta con `in`.
- El detalle "N×1º" en la tabla es críptico; la pasada de diseño de la etapa 7 lo revisa junto con el resto de la copia.
- `DEV_FAKE_TODAY` aplica la misma fecha a todos los grupos sin importar su zona horaria; es una herramienta de desarrollo, no una simulación fiel del corte a medianoche.
- El aviso de "te pasaron" y el recordatorio diario van en la etapa 6.

## Preguntas

ninguna

## Siguiente paso propuesto

Etapa 6: `manifest.json` completo (standalone, portrait, íconos 192/512 y maskable, theme color, screenshots); Serwist con caché del esqueleto y assets, `/api/*` y el dominio de Supabase en `NetworkOnly`, pantalla sin conexión; instalación (`beforeinstallprompt` en Android/Chrome con botón propio; instrucciones ilustradas en iOS/Safari); Web Push con VAPID: migración `push_subscriptions` con RLS, recordatorio diario por grupo con `pg_cron` + `pg_net` (verificando antes si el cron de Vercel alcanza), aviso de "te pasaron" desde `/finish` comparando el ranking antes y después, y el permiso pedido después de la primera partida. Criterio: en un deploy preview de Vercel con HTTPS, la app se instala y recibe push en un Android y un iPhone reales.
