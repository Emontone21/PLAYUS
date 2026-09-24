# Reporte: etapa 4 (contrato de juegos, contenedor y juegos de relleno)
Estado: completa
Fecha: 2026-09-24

## Qué hice

Armé la parte del sistema que hace que agregar un juego sea crear un archivo y sumar una línea: el contrato, la fuente de azar determinística, el contenedor de partida, el registry, una ruta de desarrollo para probar juegos sueltos, y los dos juegos de relleno que el brief pide para demostrar que todo eso funciona.

El contrato está en `src/games/types.ts` y es el del brief con tres agregados del plan (`validate?`, `minPlausibleScore?`, `minDurationMs?`) más uno propio: `onProgress` en las props del juego. Hacía falta porque el cronómetro es del sistema y corta la partida cuando se acaba el tiempo, y en ese momento el contenedor necesita un puntaje: el juego informa su resultado parcial cada vez que cambia y el contenedor usa el último. Un juego que siempre termina antes por su cuenta (reflejo) puede ignorarlo. También hay una función `gameLimits(game)` que aplica los defaults de las cotas (duración mínima = duración menos 2 segundos, máxima = duración más 10, puntaje mínimo 0) para que el servidor de la etapa 5 no repita la regla.

La aleatoriedad está en `src/lib/rng.ts`: `hash32` convierte la semilla (texto) en un entero de 32 bits (FNV-1a con una mezcla final) y `mulberry32` genera números en [0, 1) a partir de ese entero. `rngFromSeed(seed)` devuelve un generador con `int`, `range`, `pick` y `shuffle`. Está fijado con tests unitarios (vitest): el hash es estable, la misma semilla da la misma secuencia, los rangos se respetan, el barajado es una permutación determinística. Cambiar `hash32` cambiaría los tableros de los días futuros, así que el test lo protege.

El contenedor (`src/games/container.tsx`) es una máquina de estados: instrucciones (nombre grande, tagline, dos o tres pasos numerados, cuánto dura, quién gana, y el botón "jugar") → cuenta regresiva de 3 → carga del juego → partida con el cronómetro arriba a la derecha → envío → resultado con el puntaje enorme (y "ms" si el juego es de puntaje bajo) y el botón "listo". El cronómetro arranca cuando el juego llama a `onReady` y corre con `requestAnimationFrame`; cuando llega a cero el contenedor corta y muestra "se acabó el tiempo". Tiene dos ganchos opcionales, `onStart` (se llama al tocar "jugar", antes de la cuenta regresiva: ahí la etapa 5 conecta `/start`, que consume el intento) y `onSubmit` (con el resultado y el tiempo transcurrido: ahí va `/finish`), más `note` y `warning` para la pantalla previa. Sin los ganchos, muestra el resultado y avisa "partida de prueba: no se guardó". El juego que se renderiza adentro no recibe nada más que `seed` y los tres callbacks.

Los dos juegos de relleno están marcados `// TEMPORAL` y son feos a propósito. `tap-race`: quince segundos, se cuentan los toques, puntaje alto gana, cota máxima 200, y `validate` comprueba que la traza (el instante de cada toque) tenga tantos toques como puntaje y esté en orden. `reflejo`: cinco rondas; la pantalla está rosa, se pone verde después de una espera que sale de la semilla (entre 1 y 4 segundos), y se mide el tiempo de reacción; el puntaje es el promedio redondeado a entero, gana el más bajo; una salida en falso repite la ronda con la misma espera; si nadie toca en 2 segundos la ronda vale 2000. Tiene `minDurationMs` de 5 segundos (termina antes por diseño), `minPlausibleScore` 100 y `validate` recalcula las esperas desde la semilla y comprueba que la traza y el promedio coincidan.

El registry (`src/games/index.ts`) exporta `GAMES`, `GAME_IDS` (ordenados alfabéticamente, para el mazo) y `getGame(id)`, y falla al cargar si un id no cumple el mismo formato que exige la base o si hay repetidos. La ruta `/dev/juego/[id]?seed=…` (con un índice en `/dev/juego`) devuelve 404 en producción y en desarrollo muestra el contenedor con el juego elegido y esa semilla, sin servidor ni ronda; al tocar "listo" vuelve a empezar.

Sobre la decisión 8 (importar el módulo del juego desde el servidor para leer sus límites): la probé apenas empecé, como pedía el plan, haciendo que la página de `/dev/juego/[id]` (un Server Component) importe el registry. Con `import { useState } from "react"` en los juegos, `next build` falla con "You're importing a component that needs useEffect… mark the file with use client". Con `import * as React from "react"` y `React.useState` compila y anda. Los archivos de juego no llevan `"use client"`, porque entonces el objeto que exportan llegaría al servidor como referencia de cliente y no se podrían leer los límites. Quedó documentado en `src/games/README.md` como regla número cuatro.

`src/games/README.md` explica cómo agregar un juego en cuatro reglas y cuatro pasos, con la tabla de campos del contrato, `tap-race` como ejemplo comentado, `reflejo` como el otro caso, y una lista de qué evitar.

Verificación: un test E2E abre `/dev/juego/reflejo?seed=abc` en dos navegadores independientes y `?seed=xyz` en un tercero, lee las esperas de las cinco rondas y comprueba que las dos primeras son idénticas y la tercera distinta, y después juega las cinco rondas en uno de ellos hasta la pantalla de resultado. Otro test juega `tap-race`, toca doce veces, espera que el cronómetro corte a los quince segundos y comprueba que el resultado es 12 con "se acabó el tiempo", y que "listo" vuelve a la pantalla previa. Corriendo la suite completa varias veces apareció una falla intermitente en el flujo de crear grupo que no era de esta etapa: en desarrollo, StrictMode monta los efectos dos veces y se disparaban dos registros anónimos en paralelo, así que el perfil se guardaba con el token del otro usuario y RLS lo rechazaba. Lo arreglé haciendo que las llamadas concurrentes a `ensureAnonymousUser` compartan la misma promesa. Después de eso la suite pasó tres veces seguidas sin fallas.

## Archivos

- creados: `src/games/types.ts`: `GameModule`, `GameProps` (con `onProgress`), `GameResult`, `ScoringDirection` y `gameLimits`.
- creados: `src/lib/rng.ts` y `src/lib/rng.test.ts`: `hash32`, `hashHex`, `mulberry32`, `rngFromSeed`, y sus tests unitarios.
- creados: `src/games/container.tsx`: el contenedor de partida como máquina de estados, con cronómetro, corte por tiempo y ganchos `onStart`/`onSubmit`/`onDone`.
- creados: `src/games/tap-race.tsx`: juego de relleno, scoring alto, con `validate` (TEMPORAL).
- creados: `src/games/reflejo.tsx`: juego de relleno, scoring bajo, esperas desde la semilla, con `validate` (TEMPORAL). Exporta `waitsForSeed` para el validador y el test.
- creados: `src/games/index.ts`: registry con `GAMES`, `GAME_IDS`, `getGame` y chequeos de ids.
- creados: `src/games/README.md`: cómo agregar un juego, con `tap-race` como ejemplo comentado.
- creados: `src/app/dev/juego/page.tsx`, `src/app/dev/juego/[id]/page.tsx`, `dev-game.tsx`: ruta de desarrollo (404 en producción).
- creados: `vitest.config.ts`: configuración de vitest con el alias `@`.
- creados: `e2e/juegos.spec.ts`: criterio de la etapa (esperas iguales con la misma semilla en dos navegadores; ambos juegos terminan y muestran resultado).
- creados: `reports/etapa-4.md`: este reporte.
- modificados: `src/lib/session.ts`: las llamadas concurrentes comparten una sola promesa de registro anónimo.
- modificados: `scripts/mini-supabase/server.mjs`: registra en consola las respuestas 4xx/5xx (así se encontró la falla de arriba).
- modificados: `package.json`, `package-lock.json`: `vitest`, `@types/node` 22, scripts `test` y `test:watch`.
- modificados: `README.md` (estructura, `npm test`, ruta de desarrollo) y `DECISIONS.md` (decisiones 42 a 51).

## Decisiones nuevas

42. `onProgress` en `GameProps`: el juego informa su parcial y el contenedor usa el último cuando corta por tiempo. Extensión mínima al contrato del brief.
43. Decisión 8 resuelta: los juegos usan `import * as React` y `React.useState`; no llevan `"use client"`. Con hooks importados por nombre, `next build` falla al importar el módulo desde el servidor.
44. `gameLimits(game)` centraliza los defaults de las cotas para el servidor.
45. El contenedor es dueño del cronómetro y del ciclo; `onStart` y `onSubmit` son los ganchos que la etapa 5 conecta a `/start` y `/finish`.
46. `hash32` es FNV-1a con avalancha final y no se cambia nunca; el test unitario lo fija.
47. El registry falla al cargar si un id es inválido o está repetido.
48. `/dev/juego/[id]` existe solo en desarrollo (404 en producción).
49. En `reflejo`, una salida en falso repite la ronda con la misma espera, para mantener el determinismo.
50. Las llamadas concurrentes a `ensureAnonymousUser` comparten la misma promesa (falla encontrada por los E2E, aplicable también en producción).
51. Vitest desde esta etapa (el plan lo tenía para la 5): el PRNG merece tests ya.

## Desvíos del plan o del brief

- `GameProps` tiene un callback más que el brief (`onProgress`), por la razón de la decisión 42.
- Vitest entró una etapa antes de lo planeado.
- Los juegos no se probaron todavía dentro de una ronda real (eso es la etapa 5); se probaron por la ruta de desarrollo, que es lo que el plan pedía para esta etapa.

## Tests

Unitarios:

```
npm test
→ 1 archivo, 7 tests, 7 pasan, 0 fallan (src/lib/rng.test.ts)
```

Etapa 1 (sin cambios en la base): 154 aserciones pgTAP, todas pasan.

Chequeos estáticos y build:

```
npm run typecheck   → sin errores
npm run lint        → sin errores
npm run build       → compila; se suman /dev/juego y /dev/juego/[id]
```

E2E (con `scripts/dev-local.sh`, `npm run dev:local-stack` y `npm run dev` levantados), tres corridas seguidas:

```
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run e2e

✓ reflejo: la misma semilla da las mismas esperas en dos navegadores (22 s)
✓ tap-race: cuenta los toques y el cronómetro corta a los 15 segundos (19 s)
✓ armar el avatar, editarlo y verlo igual desde otro navegador
✓ un perfil de la etapa 2 (solo fondo) se sigue dibujando
✓ crear un grupo, invitar por link y ver la lista en los dos lados
✓ un código inexistente avisa y deja probar otro
✓ sin sesión ni grupo, las pestañas mandan a la landing
7 passed (≈43 s) × 3
```

## Cómo verificarlo en el navegador

1. `npm run dev` (no hace falta Supabase para esta etapa: la ruta de desarrollo no toca el servidor).
2. Abrir `http://localhost:3000/dev/juego/reflejo?seed=abc` en una ventana y la misma URL en una de incógnito. En las dos: "jugar", cuenta regresiva de 3, y la pantalla rosa. Las esperas hasta el verde tienen que coincidir ronda por ronda en las dos ventanas (se ven en el atributo `data-waits` del área, o a ojo con las dos ventanas lado a lado). Con `?seed=xyz` las esperas cambian.
3. Jugar las cinco rondas tocando cuando se pone verde. Aparece el resultado con el promedio en ms y el botón "listo". Tocar antes del verde muestra "muy pronto. de nuevo…" y repite la ronda.
4. `http://localhost:3000/dev/juego/tap-race?seed=abc`: "jugar", tocar la pantalla; el contador sube y el cronómetro baja de 15. Al llegar a cero, el sistema corta y muestra el puntaje con "se acabó el tiempo". "listo" vuelve a la pantalla previa.
5. `http://localhost:3000/dev/juego` lista los juegos del registry.
6. `npm run build` compila (la prueba de la decisión 8).

## Problemas y deuda

- El corte por tiempo depende de `requestAnimationFrame`; en una pestaña en segundo plano el navegador lo pausa. En la etapa 5 el servidor valida la duración igual (`gameLimits`), así que una partida "pausada" se rechaza; conviene además escuchar `visibilitychange` en el contenedor para cortar al volver. Anotado para la etapa 5.
- `tap-race` cuenta `pointerdown`; en algunos navegadores un toque rápido con dos dedos genera dos eventos. Es un juego de relleno: no lo pulí.
- El emulador local no interviene en esta etapa; la verificación contra Supabase real sigue pendiente desde la etapa 2.
- La ruta de desarrollo aparece en el build como página (404 en producción); si molesta, se puede excluir del build con una regla de `next.config.ts` más adelante.
- Los estilos de los juegos y del contenedor son funcionales; la pasada de diseño de la etapa 7 los revisa (fuentes, tracking, tamaños).

## Preguntas

ninguna

## Siguiente paso propuesto

Etapa 5: `ensureRound(group)` (temporada perezosa con cierre y campeón, mazo barajado con `hash(group_id + season.number + vuelta)` y el intercambio de la decisión 5, semilla `hash(group_id + play_date + game_id)`, `INSERT … ON CONFLICT DO NOTHING`); `POST /api/rounds/:roundId/start` y `POST /api/attempts/:attemptId/finish` con `service_role`, `gameLimits`, `validate` y el abandono perezoso a los 5 minutos; el aviso de que recargar cuesta el intento; `src/lib/scoring.ts` (10/7/5/3/1 con empates); la pestaña Hoy con el juego del día, el contenedor conectado a `/start` y `/finish`, y el ranking en vivo con Realtime; tabla de la temporada, historial, corona y estadísticas del perfil; `DEV_FAKE_TODAY`; tests con vitest (puntos con empates, rotación del mazo sin repetidos incluida la decisión 5, consumo de intentos contra la base local, incluido que recargar a mitad de partida cuesta el intento). Criterio: el "listo cuando" del brief de punta a punta, usando `DEV_FAKE_TODAY` para el día siguiente.
