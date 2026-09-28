# Reporte: segundo juego real, "quedó re tarado"
Estado: parcial
Fecha: 2026-09-27

## Qué hice

El segundo juego real está construido, probado y publicado en **https://playus-lake.vercel.app**. Desde la próxima ronda, el mazo de cada grupo alterna "encontrá a la piba del IPA" y "quedó re tarado" (la ronda de hoy no cambia). El estado es parcial por lo de siempre: "se juega cómodo con un pulgar" y la calibración de los umbrales con dedos reales piden un teléfono; todo lo demás está hecho y verificado, incluida una partida de dos jugadores en producción.

**El juego.** Una cara de frente en pixel art con un cigarro en la comisura; cada toque lo consume. Son 200 toques y gana quien lo termina más rápido (`scoring: 'low'`). Al toque 200 el juego llama a `onFinish` con el tiempo en milisegundos desde `onReady`; si el cronómetro corta a los 40 s, el contenedor usa el último parcial informado con `onProgress` (el mismo mecanismo que la piba) y el puntaje es `40.000 + (200 − toques) × 100`: toda partida terminada queda por delante de cualquiera no terminada, y entre las no terminadas queda mejor quien consumió más. El resultado muestra la cara final y "26,0 s" (un decimal) o "te faltaron N toques"; la pantalla previa muestra la cara del intento con el cigarro entero.

**Un solo dedo.** `createPointerTracker` (puro, en `rules.ts`) cuenta un `pointerdown` solo si no hay otro puntero apretado; `pointerup` y `pointercancel` lo liberan. En escritorio vale el botón izquierdo del mouse; el teclado no dispara nada porque el área no es un botón. Toda el área del juego es zona de toque, con `touch-action: manipulation`, `user-select: none` y `preventDefault` en `contextmenu`.

**Dibujo.** `face.ts` (puro): la semilla del intento elige tono de piel (4), pelo (corto, largo, parado, rulos, pelado, en 6 colores), un accesorio (anteojos, gorro de lana, vincha, bigote o ninguno) y el fondo entre cinco tonos de la paleta; solo cambia la apariencia. El lienzo mide 46 × 34 unidades: la cara de frente ocupa 32 × 32 y el cigarro sale de la comisura derecha (filtro de 2 más 14 de papel, que baja un píxel cada ~14 toques hasta la colilla de 2), con la brasa en la punta que se enciende 120 ms en cada toque, la ceniza que se acumula hasta 3 unidades y cada 20 toques cae una durante 450 ms, y el humo que suma un penacho por cada 20 % consumido y sube en tres cuadros. Los cinco estados de la cara son los de la tabla: normal; ojos entrecerrados; ojos rojos y sonrisa boba; ojos en espiral con color en los cachetes; y al 100 %, colilla sola, espiral y el cartel "quedó re tarado". "quedan N" arriba a la derecha. Con `prefers-reduced-motion`, el humo queda quieto y la ceniza desaparece sin caer; el destello de la brasa se mantiene. `draw.ts` dibuja en `<canvas>` con `imageSmoothingEnabled = false` y escalado entero por `devicePixelRatio`; en un Pixel 7 da 21 píxeles del dispositivo por unidad (8 px CSS): la cara ocupa 368 × 272 px CSS.

**Traza y validación.** `TapEvent = { t }`, solo los toques que contaron. `validate` (en `rules.ts`, compartido con el cliente) rechaza más de 200 toques; `t` negativo, fuera de orden o mayor a 40.000 + 2.000; un toque 200 después de los 40.000 (el cronómetro corta ahí, así que no es legítimo, y eso es lo que garantiza que toda partida terminada quede por delante de toda no terminada: 40.000 < 40.100); puntaje que no coincide con el recalculado; algún intervalo menor a 35 ms; y ritmo demasiado parejo: desvío estándar menor a 4 ms en cualquier ventana de 30 intervalos seguidos. Calibración: 20 trazas humanas simuladas con intervalos uniformes entre 55 y 160 ms pasan (desvío ≈ 30 ms); un ritmo fijo de 60 ms y uno de 60 ± 1 ms caen; 29 intervalos parejos seguidos de ritmo humano pasan. En producción, 200 clics de Playwright con esos intervalos pasaron el filtro del servidor real. Un autoclicker con variación al azar puede pasar; el objetivo era frenar lo obvio.

**Contrato.** Dos cosas nuevas, opcionales: `Result?` (la pantalla de resultado propia; el contenedor la usa si existe, y si no, el puntaje grande de siempre) e `Intro` ahora recibe `seed` (para mostrar la cara del intento). Y `minDurationMs: 11_000`: el default del contrato (38 s) habría hecho que `/finish` rechazara por duración cualquier partida rápida.

**Rotación.** `src/games/index.ts` tiene los dos juegos; el mazo se baraja por grupo y temporada, así que cada grupo nuevo arranca con uno u otro y alterna. Los E2E que necesitan un juego concreto en la ronda real crean grupos hasta que toque (`e2e/helpers/group.ts`).

**Herramientas de desarrollo.** `/dev/juego/quedo-re-tarado?seed=…&estado=50` muestra la cara con botones para saltar a 0, 25, 50, 75 y 100 %. Da 404 en producción (verificado).

**Capturas** de la cara en los cinco estados para la semilla `reporte`, en `reports/quedo-re-tarado/`: `estado-0.png`, `estado-25.png`, `estado-50.png`, `estado-75.png` y `estado-100.png`.

**Un arreglo de paso.** El color de los párrafos estaba fuera de capa en `globals.css` y le ganaba a las clases de componentes: el texto del globo "quedó re tarado" y el del banner rosa "te pasó" salían lavados. Pasó a `@layer base`.

**Verificación.** Además de los tests, capturas en un Pixel 7 emulado de la pantalla previa con la cara, el juego, la cara a la mitad (etapa 2, "quedan 80") y el resultado ("26,8 s", "quedó re tarado"). En producción, con un grupo de prueba que borré al terminar: un jugador que dio 60 toques y esperó el corte terminó con "te faltaron 140 toques" y 54.000 ms; otro que dio 200 a ritmo humano terminó en "26,0 s" (25.956 ms), el servidor aceptó la traza, y el ranking lo puso primero con +10 y al otro segundo con +7.

## Archivos

- creados: `src/games/quedo-re-tarado/face.ts`, `rules.ts`, `draw.ts`, `index.tsx`, `preview.tsx`: el juego.
- creados: `src/games/quedo-re-tarado/face.test.ts` (3 tests, 300 caras) y `rules.test.ts` (8 tests: puntaje, `validate`, un solo dedo).
- creados: `e2e/helpers/tarado.ts`, `e2e/helpers/group.ts`, `e2e/tarado.spec.ts` (3 pruebas).
- creados: `reports/quedo-re-tarado/estado-{0,25,50,75,100}.png` y este reporte.
- modificados: `src/games/index.ts`: los dos juegos. `src/games/types.ts`: `Result?` e `Intro` con `seed`. `src/games/container.tsx`: los usa.
- modificados: `src/app/dev/juego/[id]/page.tsx` (`?estado=N`) y `src/app/dev/juego/page.tsx`.
- modificados: `src/app/globals.css`: el color de `p` en `@layer base`.
- modificados: `src/lib/attempts.test.ts` (traza humana del tarado), `e2e/piba.spec.ts` y `e2e/ronda.spec.ts` (saben con qué juego tocó).
- modificados: `src/games/README.md`, `README.md`, `DECISIONS.md` (115 a 119).

## Decisiones nuevas

- **115.** `Result?` es otro campo opcional del contrato; `Intro` recibe `seed`. En el ranking y el historial el tarado sigue mostrando ms crudos ("25956 ms"); un formateador por juego queda como deuda.
- **116.** `minDurationMs: 11_000` en el tarado, el mismo umbral que `minPlausibleScore`.
- **117.** Umbrales de `validate` (35 ms, desvío 4 ms en 30 intervalos, toque 200 antes de los 40.000) y cómo se calibraron; el primer ajuste si rechaza partidas reales es bajar el desvío a 3 ms.
- **118.** Un solo dedo con un registro de punteros puro; el teclado no cuenta.
- **119.** El lienzo de 46 × 34 y cómo se dibujan cigarro, ceniza, humo y accesorios sin tapar ojos ni cigarro.

## Desvíos del plan o del brief

- **`Result?` y `seed` en `Intro`:** extensiones opcionales del contrato, como la 109.
- **"Aprovechá todo el alto":** el lienzo es apaisado porque el cigarro sale hacia el costado, así que en un teléfono lo limita el ancho, no el alto: la cara ocupa 368 × 272 px CSS en un Pixel 7 y queda aire arriba y abajo. La cara igual es la protagonista (32 unidades × 8 px = 256 px de alto).
- **El toque 200 tiene que caer antes de los 40.000:** el documento daba un margen chico sobre 40.000 para el último toque; lo mantuve para quien no terminó y lo saqué para el toque 200, porque si no una partida "terminada" a los 41.000 quedaría detrás de una no terminada con 199 toques (40.100).
- **Ranking en ms crudos** para el tarado (ver 115).

## Tests

- `npm test` (vitest): **72 de 72** (61 anteriores más 11 del tarado: cara determinística y distinta por semilla, accesorios que no tapan ojos ni cigarro en 300 caras, etapas y largo del cigarro; puntaje con 200 toques, con 150 al llegar a los 40 s = 45.000, terminado siempre por delante de no terminado; `validate` acepta 20 trazas humanas y una parcial, rechaza 20 ms, 60 ms fijo, 60 ± 1 ms, más de 200, puntaje inflado, fuera de orden, mal armadas; el registro de punteros). Los tests de intentos contra la base local juegan el tarado con una traza humana cuando es el juego del día.
- `npm run e2e`: la última corrida completa dio **12 de 13** con la prueba del ranking del tarado fallando por un bug del helper (esperaba el campo "tu nombre" en un segundo intento de crear grupo, cuando la cuenta ya tenía nombre); corregido el helper, `tarado.spec.ts` (3) y `piba.spec.ts` (2) pasan **5 de 5** con el reintento ejercitado (la piba tocó al 5º grupo, el tarado al 2º). `pwa.spec.ts` salteada a propósito en dev. La suite entera tarda unos 14 minutos: hay cuatro pruebas que juegan partidas de 40 o 60 segundos.
- `npx supabase test db`: **192 de 192** (sin cambios en la base).
- `npm run build`, `npm run typecheck`, `npm run lint`: sin errores.
- Producción: partida de dos jugadores (arriba); rutas de desarrollo en 404.

## Cómo verificarlo en el navegador

1. https://playus-lake.vercel.app, crear grupos hasta que Hoy diga "quedó re tarado" (cada grupo nuevo tiene una chance de dos; mañana, tu grupo de siempre cambia de juego).
2. "jugar": la pantalla previa muestra la cara del intento con el cigarro entero. Tocar rápido con un dedo: el cigarro se acorta, la brasa destella, la ceniza cae cada 20 toques, el humo crece, la cara cambia a los 50, 100 y 150 toques, y "quedan N" baja. Con dos dedos a la vez, el segundo no cuenta.
3. Al terminar: la cara con espiral, "N,N s" y el cartel "quedó re tarado". Si dejás pasar los 40 s: "te faltaron N toques". En el ranking, quien terminó va primero.
4. En local, `http://localhost:3000/dev/juego/quedo-re-tarado?seed=reporte&estado=75` y los botones de estado para revisar el arte.

## Problemas y deuda

- **Sin calibrar con dedos reales:** los umbrales (35 ms, desvío 4 ms) salen de simulaciones y de clics de Playwright. Si en el teléfono una partida real se rechaza ("no pudimos validar esta partida"), el primer ajuste es bajar el desvío mínimo a 3 ms (decisión 117).
- **El ranking muestra el tiempo en ms crudos** ("25956 ms"); en la pantalla de resultado se ve "26,0 s". Unificarlo pide un formateador por juego en el contrato.
- **La suite E2E tarda unos 14 minutos** por las partidas de 40 y 60 segundos y el worker único.
- La unificación del cálculo de "te pasaron" sigue como deuda; Vercel sigue sin estar conectado a GitHub.

## Preguntas

- ninguna.

## Siguiente paso propuesto

Probar los dos juegos en el teléfono (comodidad con el pulgar, que el filtro no rechace partidas reales, la estrella de la piba) y con eso cerrar el estado de las etapas pendientes. Después, si querés, el formateador de puntaje por juego para que el ranking diga "26,0 s".
