# Reporte: primer juego real, "encontrá a la piba del IPA"
Estado: parcial
Fecha: 2026-09-27

## Qué hice

El primer juego real está construido, probado y publicado en **https://playus-lake.vercel.app**: desde hoy, todo grupo nuevo tiene como juego del día "encontrá a la piba del IPA" (los grupos que ya tenían creada la ronda de hoy con un juego de relleno la terminan con ese juego; mañana el mazo ya solo reparte la piba). El estado es parcial únicamente porque el criterio "en el teléfono" y "se juega cómodo con una mano" piden un teléfono real; todo lo demás está hecho y verificado, incluida una partida completa en producción.

**El juego.** Un mapa de 120 × 160 unidades lógicas lleno de gente en pixel art; hay que tocar a la única con boina negra con estrella roja **y** pucho en la boca con humo. Cada acierto trae un mapa nuevo, más lleno y con más señuelos. Dura 60 segundos: el juego no termina por su cuenta, informa cada toque con `onProgress` y el contenedor usa el último parcial cuando corta el cronómetro (el mismo mecanismo de siempre). Puntaje = cuántas veces la encontraste, `scoring: 'high'`, tope 40. La pantalla previa suma la ficha "así es ella" con el sprite de la piba en grande, dibujado con el mismo código del juego (en SVG, nítido a cualquier tamaño).

**Arquitectura, como pide el documento.** Todo en `src/games/piba-del-ipa/`:
- `sprites.ts` (puro): las personas de 9 × 13 unidades armadas con piezas (4 tonos de piel, 3 peinados en 5 colores, 8 remeras, 4 pantalones, gorro de lana, gorra o boina, estrella, pucho con humo en 3 cuadros). La columna de más a la derecha queda libre para el humo.
- `map.ts` (puro): `generateMap(attemptSeed, mapIndex)` devuelve escenario y personas (posición, pinta, rol, orden de dibujo). La semilla de cada mapa es `piba:{semilla del intento}:{índice}` por el PRNG del proyecto; nada de `Math.random()`. Cinco escenarios que rotan por la semilla (plaza con árboles y bancos, rambla con mar y muro, feria con toldos rayados, playa con sombrillas, parada con refugio y cartel), todos con formas que no se confunden con una persona. `personAt(x, y)` resuelve el toque a favor de quien está dibujado más arriba; las cajas de toque sobresalen una unidad por lado.
- `rules.ts` (puro): las reglas compartidas por cliente y servidor. `applyTap` (acierto → suma y cambia de mapa; otra persona o el fondo → 2 segundos sin poder tocar), `simulate` (recorre la traza) y `validate` (recalcula y compara). También `legitTrace`, que arma una traza legítima para los tests.
- `draw.ts`: dibujo en `<canvas>` con `imageSmoothingEnabled = false`, escalado entero ajustado a `devicePixelRatio` y centrado. Lo comparten el juego, la vista previa y las capturas.
- `index.tsx`: el componente (canvas, contador "N encontradas", cartel "¡la encontraste!" medio segundo, "esa no es" con el mapa atenuado 2 segundos, humo que sube en tres cuadros cada 400 ms y queda quieto con `prefers-reduced-motion`), la ficha de la pantalla previa y el módulo `pibaDelIpa`.

**Personas y señuelos.** La piba es la única con los tres rasgos. Los cuatro tipos de señuelo son exactamente los del documento (boina negra con estrella sin pucho; pucho con otro gorro o sin gorro; boina negra sin estrella con pucho; boina de otro color con estrella y pucho), y las señuelos llevan peinados de mujer como ella, para que el pelo no sea una pista. La gente común no fuma ni usa boina. La generación garantiza exactamente una piba, ninguna otra persona con los tres rasgos, y que nada tape la cabeza de la piba (gorro, cara y pucho): se la ubica primero y toda persona posterior que se dibuje encima de ella se rechaza si pisa esas seis filas. La misma condición se intenta para todas las cabezas, con tope de intentos; en 1.000 mapas de prueba no hizo falta el respaldo ni una vez, así que el tope de 70 personas quedó como pedía la tabla (18/2, +8/+2 por mapa, tope 70/16).

**Toques y traza.** `TapEvent = { t, map, x, y }`, con `t` en ms desde `onReady` y las coordenadas en unidades lógicas. Se registran todos los toques, incluidos los ignorados por el bloqueo. Un detalle que sale de compartir las reglas: al aparecer un mapa (también el primero) el cliente no toma toques durante 500 ms, que es lo que dura el cartel "¡la encontraste!" del mapa anterior; así ningún acierto legítimo puede caer antes de los 400 ms que el servidor rechaza. `validate(result, attemptSeed)` rearma los mapas con la semilla del intento y recorre la traza aplicando las mismas reglas; rechaza si el puntaje recalculado no coincide, si algún `t` es negativo, no crece o supera 60.000 más 2.000 de margen, si el `map` de un toque no es el del mapa en curso, o si un acierto ocurre a menos de 400 ms de mostrarse su mapa. Los toques durante el bloqueo se ignoran en los dos lados.

**Relleno fuera de rotación.** `src/games/index.ts` tiene `ACTIVE` (solo la piba) y `RETIRED` (tap race y reflejo). El mazo se arma sobre los activos; `getGame` resuelve los dos grupos, así que el historial, "donde mejor te va" y una ronda de hoy ya creada con un juego de relleno siguen funcionando. Conservé el módulo entero de los retirados (no solo id, nombre y scoring) porque una ronda ya creada se juega y se valida con él. Los tests del mazo ya usaban juegos de prueba propios.

**Herramientas de desarrollo.** `/dev/juego/piba-del-ipa?seed=…&map=N` muestra el mapa N de esa semilla con la casilla "resaltar a la piba y a los señuelos" (rojo y amarillo) y links a los mapas 1 a 8; `/dev/piba/sprites` es la hoja de sprites con la piba, un señuelo de cada tipo y 16 personas comunes. Las dos dan 404 en producción (verificado).

**Capturas** de los mapas 1, 3 y 6 de la semilla `reporte`, en `reports/piba-del-ipa/`: `mapa-1.png` (feria, 18 personas, 2 señuelos), `mapa-3.png` (parada, 34 y 6) y `mapa-6.png` (parada, 58 y 12).

**Verificación.** Además de los tests, revisé en capturas de un Pixel 7 emulado la pantalla previa con la ficha, el mapa en juego (8 píxeles del dispositivo por unidad, 3 px CSS: el mapa ocupa 366 × 488 px CSS y cada persona 27 × 39 con una caja de toque de 33 × 45), el cartel de acierto y la penalización con el mapa atenuado, la vista previa con resaltado y la hoja de sprites. En producción, con un grupo de prueba que borré al terminar: el juego de hoy es la piba, la pantalla previa muestra la ficha, una partida completa de 60 segundos con 3 aciertos terminó con "se acabó el tiempo", "quedó guardado", y el ranking muestra 3.

## Archivos

- creados: `src/games/piba-del-ipa/sprites.ts`, `map.ts`, `rules.ts`, `draw.ts`, `index.tsx`, `preview.tsx`: el juego (ver arriba).
- creados: `src/games/piba-del-ipa/map.test.ts` (4 tests, 1.000 mapas) y `rules.test.ts` (10 tests).
- creados: `src/app/dev/piba/sprites/page.tsx`: la hoja de sprites.
- creados: `e2e/helpers/piba.ts` (jugar desde el navegador con las coordenadas de `generateMap`) y `e2e/piba.spec.ts` (2 pruebas).
- creados: `reports/piba-del-ipa/mapa-1.png`, `mapa-3.png`, `mapa-6.png` y este reporte.
- modificados: `src/games/index.ts`: `ACTIVE` y `RETIRED`, `RETIRED_GAME_IDS`.
- modificados: `src/games/types.ts`: campo opcional `Intro`. `src/games/container.tsx`: lo muestra en la pantalla previa.
- modificados: `src/app/dev/juego/[id]/page.tsx` (`?map=N`) y `src/app/dev/juego/page.tsx` (lista los retirados aparte).
- modificados: `src/lib/attempts.test.ts`: arma una traza legítima de la piba cuando es el juego del día. `e2e/ronda.spec.ts`: sabe jugar la piba y acepta que mañana toque el mismo juego si hay uno solo activo.
- modificados: `playwright.config.ts`: `workers: 1`.
- modificados: `src/games/README.md`, `README.md`, `DECISIONS.md` (107 a 113).

## Decisiones nuevas

- **107.** Mapa en 120 × 160 unidades lógicas; canvas con escalado entero por `devicePixelRatio`, sin zoom ni desplazamiento.
- **108.** Tap race y reflejo salen del mazo (`ACTIVE` / `RETIRED`) pero conservan el módulo entero, porque una ronda ya creada se juega con él.
- **109.** `Intro?` es un campo opcional nuevo del contrato, para la ficha "así es ella".
- **110.** Las reglas viven en un solo módulo puro compartido por cliente y servidor; el cliente no toma toques en los primeros 500 ms de cada mapa.
- **111.** La ubicación garantiza la cabeza de la piba y trata de cuidar las demás; el tope de 70 quedó.
- **112.** La traza guarda solo toques; los mapas se rearman con la semilla del intento.
- **113.** Los E2E corren de a uno: con varios archivos en paralelo, un refresco transitorio que falla hace que el overlay de desarrollo de Next tumbe la página ("frame.join is not a function"); en producción no existe.

## Desvíos del plan o del brief

- **`Intro?` en el contrato:** el documento pide la ficha en la pantalla previa y el contrato no tenía dónde ponerla; agregué un campo opcional en vez de meter la ficha en el contenedor con un `if` por juego.
- **Retirados con módulo entero:** el documento pedía conservar la metadata mínima; conservé el módulo completo por la ronda de hoy ya creada (decisión 108). No cambia nada visible.
- **Bloqueo de 500 ms al aparecer cada mapa:** no estaba pedido; hace falta para que la regla de los 400 ms del servidor nunca rechace una partida legítima (decisión 110).
- **`workers: 1` en Playwright:** no estaba pedido; ver decisión 113.

## Tests

- `npm test` (vitest): **63 de 63** (49 anteriores más 14 de la piba: `generateMap` determinística, tabla de dificultad, 1.000 mapas con una piba, sin señuelos de tres rasgos, cabeza libre, todos adentro y las cantidades correctas, toque superpuesto; `validate` acepta la traza real, rechaza puntaje inflado, toques fuera de orden y después del final, acierto en coordenadas equivocadas, aciertos durante el bloqueo, aciertos a menos de 400 ms, mapa equivocado, semilla de la ronda en vez de la del intento, trazas mal armadas, y la penalización de 2 segundos exactos). Los tests de intentos contra la base local juegan la piba de verdad cuando es el juego del día.
- `npm run e2e` contra `npm run dev` y Supabase local: **12 de 12** (`pwa.spec.ts` salteada a propósito en dev). Nuevos: la partida completa desde la pantalla previa hasta el ranking (con un error y su bloqueo en el medio) y el escalado entero con el mapa entero en pantalla. Tarda unos 6 minutos: dos de las pruebas juegan partidas de 60 segundos.
- `npx supabase test db`: **192 de 192** (sin cambios en la base).
- `npm run build`, `npm run typecheck`, `npm run lint`: sin errores.
- Producción: partida completa con 3 aciertos guardada y en el ranking; rutas de desarrollo en 404.

## Cómo verificarlo en el navegador

1. https://playus-lake.vercel.app, crear un grupo: en Hoy, el juego es "encontrá a la piba del IPA". Tocar "jugar": la pantalla previa tiene la ficha "así es ella".
2. Jugar: tocar a la piba. Al acertar, "¡la encontraste!" y el mapa siguiente, más lleno. Tocar a otra persona: "esa no es", el mapa se atenúa dos segundos y los toques no cuentan. A los 60 segundos corta solo con el puntaje.
3. En local, `npm run dev` y `http://localhost:3000/dev/juego/piba-del-ipa?seed=reporte&map=3`: marcar "resaltar" para ver a la piba en rojo y a los señuelos en amarillo. `/dev/piba/sprites` para el arte.
4. Para ver a `validate` frenar un puntaje inventado: `npm test -- rules` corre los diez casos.

## Problemas y deuda

- **Sin verificar en un teléfono real:** si se juega cómodo con una mano y si la estrella (un píxel rojo, 3 px CSS en un Pixel 7) se distingue bien en pantallas más chicas. Si hace falta, la estrella puede pasar a 2 píxeles sin tocar nada más.
- **La ubicación de la gente es por rechazo con tope de intentos.** Con el tope de 70 no hizo falta el respaldo en 1.000 mapas, pero si alguien subiera la tabla habría que revisarlo.
- **Los E2E tardan 6 minutos** por las partidas de 60 segundos y el worker único.
- La unificación del cálculo de "te pasaron" sigue anotada como deuda. Vercel sigue sin estar conectado a GitHub.

## Preguntas

- ninguna.

## Siguiente paso propuesto

Probar la piba en un Android y un iPhone (comodidad con una mano, visibilidad de la estrella y del pucho en la pantalla más chica que tengas) y, con eso, cerrar el estado de esta etapa y de las pendientes (Frog, 6 y 7). Después, el segundo juego real: con dos activos, el mazo vuelve a alternar.

## Actualización (misma fecha)

A pedido, tap race y reflejo se **borraron** del código (decisión 114): ya no hay lista de retirados y el registry tiene un solo juego. En producción, las tres rondas de hoy que se habían creado con ellos ("Sape", "Prueba Claude" y "Prueba Claude 2") se movieron a la piba con la semilla de ronda recalculada, y sus 8 intentos de prueba se borraron: desde ahora esos grupos juegan la piba hoy mismo. Tests: vitest 61/61 (se fueron los 2 de reflejo), e2e 10/10 (se fue `juegos.spec.ts`). Publicado.
