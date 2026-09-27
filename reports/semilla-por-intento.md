# Reporte: semilla por intento, limpieza de producción y fuentes locales
Estado: completa
Fecha: 2026-09-27

## Qué hice

**Semilla por intento.** `POST /api/rounds/:roundId/start` ya no devuelve la semilla de la ronda sino `hash(round.seed + ':' + attempt_number)` (`attemptSeed` en `src/lib/deck.ts`, con el mismo `hashHex` de siempre). Todos los integrantes ven la misma secuencia en el mismo número de intento, y cada intento propio es distinto. `/finish` llama al punto de extensión `validate(result, seed)` con la semilla del intento, no la de la ronda: una traza armada con la semilla de la ronda ahora se rechaza (`invalid_events`) y el intento se pierde. El contrato de juegos no cambió: el juego sigue recibiendo solo `seed`. Del lado del cliente, la página de la partida ya no manda la semilla de la ronda al navegador: el contenedor arranca sin semilla, `onStart` (que llama a `/start`) devuelve la del intento, y recién con eso monta el juego; si `/start` no la trae, muestra un error en lugar de jugar con una semilla vieja. `/dev/juego/[id]?seed=` sigue igual (recibe la semilla por la URL). Reflejo y tap race no se tocaron.

**Tests.** En `src/lib/attempts.test.ts` (contra la base local): con un grupo aparte y dos personas nuevas, el intento 1 de las dos da la misma semilla, que no es la de la ronda y coincide con `attemptSeed(round.seed, 1)`; una traza armada con la semilla de la ronda no pasa `validate` (cuando el juego del día valida); el intento 2 da otra semilla (`attemptSeed(round.seed, 2)`); con la semilla del intento el resultado se guarda; y ni la fila de la ronda ni la del intento contienen la semilla del intento (sin iniciarlo no hay de dónde leerla). Los tests anteriores pasaron a usar la semilla que devuelve `startAttempt`. En `deck.test.ts`, `attemptSeed` es determinística, de 8 hex, distinta de la de la ronda, distinta entre cinco intentos y distinta entre grupos. Un E2E nuevo (`e2e/semilla.spec.ts`) hace lo mismo desde el navegador: dos personas tocan "jugar" y reciben la misma semilla de `/start` en el intento 1; una recarga y empieza de nuevo y recibe otra en el intento 2; y el HTML de `/hoy/jugar` capturado antes de tocar "jugar" no contiene ninguna de las dos.

**README de juegos.** Explica que la semilla es por intento y de dónde sale, y tiene una sección nueva "pautas para juegos reales": que saber cómo viene la partida (porque alguien lo contó o porque ya jugaste otro intento) dé la menor ventaja posible, con ejemplos de qué diseño ayuda, y que cada juego use `validate` sobre `events` para frenar puntajes imposibles, recomputando el puntaje desde la traza y la semilla del intento.

**Limpieza de producción.** Borré del proyecto de Supabase en la nube los grupos **"prueba frog"** (código `3APAXN`) y **"prueba deploy"** (`2G8TAT`) con todo lo que cuelga de ellos (temporadas, rondas, intentos, membresías) y sus **4 usuarios** de prueba, que no pertenecían a ningún otro grupo: "Prueba A", "Prueba B", "Prueba Frog A" y "Prueba Frog B". Para verificar la publicación creé un grupo "prueba semilla" con 2 usuarios y lo borré en la misma corrida. Quedan en producción tus grupos **"Sape", "Prueba Claude" y "Prueba Claude 2"** con sus 5 usuarios y 7 intentos, sin tocar.

**Fuentes locales (imprevisto).** A mitad de la ejecución, `next dev` empezó a responder 500 en todas las páginas: Google Fonts pasó a servir los archivos por URLs dinámicas (`/l/font?kit=…`) y el `?` de adentro rompe el resolvedor de `next/font/google` en Turbopack; el build de producción (webpack) no se veía afectado. Apliqué el fallback previsto en la decisión 75: los dos archivos variables del subconjunto latino (Fredoka 600–700 e Instrument Sans 400–600, ~30 KB cada uno, licencia OFL) están en `src/app/fonts/` y `layout.tsx` usa `next/font/local`. Son exactamente los archivos que `next/font/google` había bajado en el build anterior (los comparé byte a byte por tamaño y origen; las primeras descargas directas de Google venían reducidas, de 4 a 11 KB, y las descarté). Ni el desarrollo ni el build dependen ya de Google.

**Publicación.** `npm run build` y `npx vercel deploy --prod`. La app está en **https://playus-lake.vercel.app**. Verificado en producción: las dos fuentes se sirven desde el propio dominio (29.704 y 29.904 bytes) y no hay ninguna referencia a Google en el HTML; dos jugadores reales recibieron la misma semilla en el intento 1 (`7a2f577a`) y el primero recibió otra en el intento 2 (`11fcb7da`); ninguna aparecía en la página antes de tocar "jugar". No hubo migraciones nuevas: la base no cambió.

## Archivos

- creados: `e2e/semilla.spec.ts`: el E2E de la semilla por intento.
- creados: `src/app/fonts/fredoka-latin-600-700.woff2`, `src/app/fonts/instrument-sans-latin-400-600.woff2`, `src/app/fonts/README.md`: las fuentes y de dónde salen.
- creados: `reports/semilla-por-intento.md`: este reporte.
- modificados: `src/lib/deck.ts`: `attemptSeed`. `src/lib/attempts.ts`: `/start` devuelve la semilla del intento y `/finish` valida con ella.
- modificados: `src/games/container.tsx`: `seed` opcional, `onStart` puede devolver la semilla, error si no llega. `src/app/(app)/hoy/jugar/play.tsx` y `page.tsx`: la semilla viene de `/start`, no de la página.
- modificados: `src/lib/attempts.test.ts`, `src/lib/deck.test.ts`: tests nuevos y los anteriores con la semilla del intento.
- modificados: `src/games/README.md`: semilla por intento y pautas para juegos reales.
- modificados: `src/app/layout.tsx`: `next/font/local`.
- modificados: `DECISIONS.md`: decisiones 103 y 104.

## Decisiones nuevas

- **103. La semilla es por intento: `hash(round.seed + ':' + attempt_number)`.** Solo la devuelve `/start`, `/finish` valida con ella, el contrato de juegos no cambia y la página no manda la semilla de la ronda. Con una salvedad, que va en Preguntas.
- **104. Las fuentes viven en el repo (`next/font/local`).** Por el fallo de Turbopack con las URLs dinámicas de Google Fonts; era el fallback previsto en la decisión 75.

## Desvíos del plan o del brief

- **Fuentes locales:** no estaba pedido; fue necesario para que `next dev` volviera a funcionar y de paso saca a Google del build. Los archivos son los mismos que ya se servían.
- Ninguno más. Reflejo y tap race quedaron intactos.

## Tests

- `npm test` (vitest): **47 de 47** (45 anteriores más 1 de `attemptSeed` y 1 de intentos contra la base local).
- `npm run e2e` contra `npm run dev` y Supabase local: **10 de 10** (9 anteriores más `semilla.spec.ts`; `pwa.spec.ts` salteada a propósito en dev). En la primera corrida después de borrar la caché de Next falló el paso de refresco en vivo de `ronda.spec.ts` por la compilación fría; con el servidor tibio pasó.
- `npx supabase test db`: **192 de 192** (sin cambios en la base).
- `npm run build`, `npm run typecheck`, `npm run lint`: sin errores.
- Producción: semilla igual entre jugadores y distinta entre intentos, fuentes locales, sin referencias a Google.

## Cómo verificarlo en el navegador

1. En https://playus-lake.vercel.app, dos ventanas en el mismo grupo. En las dos, ir a Hoy → "jugar" con DevTools → Network abierto: la respuesta de `POST /api/rounds/…/start` trae `seed` y `attemptNumber: 1`, y `seed` es la misma en las dos ventanas.
2. En una de ellas, recargar a mitad de partida y tocar "jugar" otra vez: `attemptNumber: 2` y otra `seed`.
3. Antes de tocar "jugar", "ver código fuente" de `/hoy/jugar`: la semilla no está.
4. En cualquier pantalla, DevTools → Network → filtro "font": las dos `.woff2` vienen de `playus-lake.vercel.app/_next/static/media/…`, ninguna de `gstatic`.

## Problemas y deuda

- **La semilla del intento es calculable por un integrante decidido.** La semilla de la ronda es legible por los integrantes vía RLS (`rounds.seed`) y la función de hash es pública, así que alguien podría computar la del intento 2 antes de empezarlo. La prueba "no se puede obtener sin haberlo iniciado" vale para lo que la app entrega (la página y `/start`), no contra alguien que consulte la base con su sesión. Ver Preguntas.
- La unificación del cálculo de "te pasaron" sigue anotada como deuda.
- Sin verificar en teléfonos reales (sigue pendiente de la etapa Frog).
- Vercel sigue sin estar conectado a GitHub: cada publicación es un `npx vercel deploy --prod` a mano.

## Preguntas

- ¿Querés cerrar el agujero de la semilla calculable? Dos formas: (a) sumar un secreto del servidor al hash (`hash(round.seed + ':' + n + ':' + SEED_PEPPER)`, una variable de entorno más en Vercel; cambiarla cambia todas las semillas futuras, no las pasadas porque no se guardan); o (b) sacar `seed` de lo que RLS expone de `rounds` (una migración con una vista o una política por columna). La (a) es más chica.
- Sigue abierta la decisión sobre los tiempos del verde en reflejo, aunque dijiste que los juegos de relleno no se corrigen; si es así, la doy por cerrada en "B: quedan como están".

## Siguiente paso propuesto

Probar en los dos teléfonos (lista del reporte anterior) y, si querés, el pepper de la semilla. Después, el primer juego real siguiendo `src/games/README.md`.
