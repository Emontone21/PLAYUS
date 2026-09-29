# Reporte: cuarto juego real, "remar vuelve a casa"
Estado: parcial
Fecha: 2026-09-28

## Qué hice

El cuarto juego real está construido, probado y publicado en **https://playus-lake.vercel.app**. Desde la próxima ronda, el mazo de cada grupo reparte los cuatro juegos; la ronda de hoy no cambia. El estado es parcial por lo de siempre: "se juega cómodo con un pulgar", "los cubiertos y el whisky se distinguen a toda velocidad" y "tomar whisky se siente como un riesgo real" piden un teléfono de verdad. Todo lo demás está hecho y verificado, incluida una partida en producción.

**Antes de empezar: las piezas compartidas (sección 0, decisión 132).** Larry tenía cuatro piezas fáciles de separar y las moví a `src/games/lib/`, como funciones sin estado de juego:
- `tick-clock.ts`: el reloj de paso fijo con acumulador (tiempo real → hasta qué tick simular, y la fracción del tick para interpolar).
- `pointer-drag.ts`: la captura de arrastre con un solo puntero (manda el primero, los demás se ignoran; en escritorio el mouse con el botón apretado).
- `canvas-scale.ts`: la escala entera y el tamaño del canvas por `devicePixelRatio`.
- `trace.ts`: los tipos de la traza, la revisión de su forma (con los mismos motivos de rechazo que tenía Larry), el chequeo del tick de fin contra la duración real y un grabador de cambios de objetivo.
- Y de yapa `sprites.ts` y `sprite-svg.tsx`: los mapas de letras, la composición, el espejo, los grises, los canvas cacheados por escala y el SVG nítido de las pantallas previa y de resultado.

Larry sigue exactamente igual: sus 23 tests pasan sin tocarlos, y además tomé una huella de 40 semillas (la lluvia, las trazas de tres bots, el estado final y la salida de `check`, 840 KB de JSON) antes del refactor y la comparé después: byte a byte lo mismo.

**El juego.** Un marinero rema por un río de mayonesa que baja por la pantalla. Los cubiertos que flotan (tenedores, cuchillos, cucharas y algún cucharón, en horizontal o en diagonal) terminan la partida al primer choque, con el bote inclinado, "¡clanc!" y un segundo de pausa. Cada botella de whisky suma un 10 % permanente de velocidad (tope ×2): más metros por segundo, pero los cubiertos llegan antes y la velocidad lateral no cambia. No hay meta: el puntaje son los metros, con la unidad "m" en el ranking, en Hoy y en el aviso "te pasaron". A los 120 s corta el contenedor; casi nadie debería llegar.

**Simulación (`rules.ts`, decisiones 134 y 135).** El mismo esquema que Larry: 60 ticks por segundo, aritmética entera, el azar solo de `rngFromSeed` con la semilla del intento, y una sola implementación para el cliente y el servidor.
- Lo lateral va en subunidades (16 por unidad, campo de 90); el avance en "distancia": 600 por metro y 100 por unidad de pantalla (1 m son 6 unidades; el río muestra 21 m por delante).
- Velocidad base de 60 a 100 por tick (6 a 10 m/s) en 90 s, interpolada con enteros. Cada botella suma 10 al multiplicador (tope 200); vale desde el tick siguiente.
- El bote va fijo en y = 130, caja de 8 × 12 (el sprite mide 10 × 16), y se mueve hacia el dedo a 36 subunidades por tick como máximo.
- Los cubiertos tienen una caja 2 unidades más angosta que el dibujo y 4 de alto: un roce visual no mata. La botella se agarra con el dibujo entero.
- `maxPlausibleScore = 2031`: los metros de un bote a ×2 desde el tick 0. El bot que toma todo llega a unos 1.600 m; el que no toma nada, a unos 1.000.

**El río (decisión 136).** Se genera entero con la semilla, **por distancia**: filas de cubiertos pegados con un hueco garantizado, cada 12 m al empezar, 7 m a los 500 m y 6 m desde los 900; el hueco mide 30 unidades al empezar y 18 desde los 600 m. Como es por distancia, ir más rápido trae más cubiertos por segundo solo. Desde los 100 m hay cubiertos sueltos entre filas, siempre fuera del corredor que va de un hueco al siguiente; desde los 400 m, uno de cada cuatro cubiertos de fila deriva de costado, en una banda que nunca toca el hueco.

**Garantías de justicia (decisiones 137 y 138).** La cota es la velocidad de avance más alta posible al llegar a cada punto: la base del tick en que llegaría un bote sin whisky (nadie llega más tarde) por el multiplicador de todas las botellas anteriores, incluida la del corredor (hasta quien no la quiere puede llevársela por delante). El tiempo entre terminar de pasar una fila y entrar en la siguiente se convierte en unidades laterales con 3/4 de la velocidad y dos ticks de resto, y el hueco nuevo se elige entre los que se alcanzan así. Una botella va al medio del corredor con tres presupuestos (llegar a ella antes de que pase; ir de ella al hueco desde que aparece, con el whisky nuevo; y el camino entero ida y vuelta), y el hueco siguiente prefiere quedar a 10 o más de la botella, así tomarla es un desvío y no un choque de casualidad. El 45 % son "arriesgadas" (al borde de lo alcanzable) y el resto "cómodas".

En 1.000 semillas, el bot que sigue los huecos llega a los 120 s sin tomar nada, tomando todo, forzado a ×2 desde el tick 0 y con tres políticas mixtas de botellas. También se comprueba fila por fila que los tramos entran en los presupuestos, que ningún cubierto (quieto o derivando) pisa el hueco y que las botellas salen cada 80 a 120 m.

El primer modelo de botellas era demasiado conservador y, pasados los 600 m, dejaba casi todas exactamente sobre el camino: ni el bot sobrio podía evitarlas. Lo cambié por el de los tres presupuestos antes de seguir (decisión 138).

**Calibración (decisión 139).** Con los valores del documento (filas cada 15 → 8 m, huecos de 34 → 20) un jugador simulado de 200 ms de reacción llegaba a los 120 s sin tomar nada, y el de 300 ms duraba 86 s. Apreté la separación y el hueco a los valores de arriba. Con eso, el jugador simulado (ve la fila cuando entra en pantalla, reacciona con retraso, apunta con error de ±2 y toma la mitad de las botellas) dura:

| reacción | cuartil 1 | mediana | cuartil 3 |
|---|---|---|---|
| 200 ms | 54 s | 60 s | 71 s |
| 300 ms | 44 s | 51 s | 55 s |
| 400 ms | 30 s | 40 s | 47 s |

Sin tomar nada, el de 200 ms dura 87 s; tomando todas, el de 300 ms dura 39 s y el de 400 ms, 29 s. La típica cae entre 30 y 60 s. Falta confirmarlo con dedos reales.

**Control.** Igual que Larry, con la pieza compartida: arrastrar en cualquier parte del área fija el objetivo horizontal; manda el primer puntero; `touch-action: none`, sin selección ni menú contextual; en escritorio el mouse apretado.

**Traza y validación (decisión 140).** `{ tick, x }` por cambio de objetivo y `{ tick, fin: true }` al final. `validate` rearma la partida y rechaza metros distintos, ticks fuera de orden o después del final, `x` fuera del campo, una traza de otra semilla, un fin que no sale de la partida y un fin incoherente con la duración real del intento (mismo margen de 10 s). `minDurationMs: 5_000`.

**Arte (`sprites.ts`, `draw.ts`, decisión 141).** Vista desde atrás y arriba. El marinero mira al frente con gorra blanca de cinta azul y remera a rayas; los remos son sprites aparte con tres poses cuyo ritmo sube con la velocidad; con cada botella se le ponen más rojos los cachetes y sale un "hic!" sobre la cabeza. Cubiertos plateados, botella ámbar con etiqueta clara. El río es un mosaico fijo con remolinos y brillos que baja con el avance, orillas de pasto y un cartel de madera cada 100 m con los metros (fuente de 3 × 5). Arriba, los metros y una botellita con "×N". Con `prefers-reduced-motion` no hay sacudón ni salto del "hic!"; el río sigue bajando.

**Pantallas.** La previa muestra el bote con remos y dos grupos: "esquivá" (tenedor, cuchillo y cuchara) y "agarrá si te animás" (la botella). El resultado propio: el bote con los cachetes que correspondan, los metros con "m" y "sin tomar nada / con N botellas. chocaste un cubierto. / aguantaste los 2 minutos."

**Contrato (decisión 133).** `unit?` es un campo opcional nuevo y `scoreUnit(game)` lo resuelve: el contenedor, Hoy (dos lugares) y el aviso "te pasaron" lo usan en vez del `scoring === 'low' ? 'ms' : ''` repetido. Los otros tres juegos no cambian.

**Rotación.** `src/games/index.ts` tiene los cuatro.

**Herramientas de desarrollo (decisión 143).** `/dev/juego/remar-vuelve-a-casa?seed=…` con "cajas y camino" (cajas de choque, la línea del camino seguro y los huecos), "×0,25", "×2" y "desde 0/200/500/1.000 m" (el bot rema hasta ahí tomando todas las botellas y ahí toma el control tu dedo). Por URL: `&desde=500&cajas=1&lento=1&x2=1`. Da 404 en producción.

**Capturas** en `reports/remar-vuelve-a-casa/`: `previa.png`, `partida-100m.png`, `partida-600m.png` (con las botellas que fue tomando el bot), `choque.png`, `resultado.png` y `dev-cajas-200m.png` (la herramienta con cajas y camino seguro).

## Archivos

- creados: `src/games/lib/tick-clock.ts`, `pointer-drag.ts`, `canvas-scale.ts`, `trace.ts`, `sprites.ts` y `sprite-svg.tsx`: las piezas compartidas.
- creados: `src/games/remar-vuelve-a-casa/rules.ts`, `sprites.ts`, `draw.ts`, `index.tsx` y `dev.tsx`: el juego; `rules.test.ts` (26 tests).
- creados: `e2e/remar.spec.ts` (3 pruebas) y `e2e/helpers/remar.ts`.
- creados: las capturas de `reports/remar-vuelve-a-casa/` y este reporte.
- modificados:
  - `src/games/los-deseos-de-larry/rules.ts`, `sprites.ts`, `draw.ts` e `index.tsx`: usan las piezas compartidas (mismo comportamiento).
  - `src/games/types.ts`: `unit?` y `scoreUnit`.
  - `src/games/container.tsx`, `src/app/(app)/hoy/page.tsx`, `src/lib/overtake.ts`: la unidad sale de `scoreUnit`.
  - `src/games/index.ts`: los cuatro juegos.
  - `src/app/dev/juego/[id]/page.tsx` y `src/app/dev/juego/page.tsx`: la herramienta de remar.
  - `src/lib/attempts.test.ts`: un resultado válido de remar.
  - `e2e/ronda.spec.ts`: sabe jugar a remar; `e2e/helpers/group.ts` y `e2e/larry.spec.ts`: 20 intentos.
  - `README.md`, `src/games/README.md` y `DECISIONS.md` (132 a 143).

## Decisiones nuevas

- **132.** Las piezas compartidas viven en `src/games/lib/`; Larry las usa sin cambiar un resultado.
- **133.** `unit?` en el contrato y `scoreUnit`.
- **134.** Unidades de la simulación (600 por metro, 100 por unidad de pantalla).
- **135.** Velocidad de avance, whisky y `maxPlausibleScore = 2031`.
- **136.** El río por distancia: filas, huecos, sueltos y deriva, con los valores finales.
- **137.** La garantía con la velocidad más alta posible, probada con bots.
- **138.** La botella al medio del corredor con tres presupuestos; el hueco lejos de ella.
- **139.** Calibración: la típica entre 30 y 60 s, y por qué se apretó.
- **140.** Traza, cierre y `validate`; `minDurationMs: 5_000`.
- **141.** Arte.
- **142.** Lo que el documento no decía.
- **143.** Herramienta de desarrollo, `window.__remar` y 20 intentos de grupo.

## Desvíos del plan o del brief

- **Los números de la sección 3 se ajustaron** (filas cada 12 → 7 → 6 m, huecos de 30 → 18) porque con los del documento la partida típica pasaba de los 60 s (139). La velocidad base (6 → 10 m/s a los 90 s), el 10 % por botella y el tope ×2 quedaron como estaban.
- **El contrato suma `unit?`** (133): era la forma más chica de mostrar "m" con "el mismo mecanismo de unidades", porque el mecanismo era una condición repetida en cuatro lugares.
- **La botella no es "una fila más"** en la garantía (138): con ese modelo no había decisión posible más allá de los 600 m.
- **Los saltos de la herramienta de desarrollo toman todas las botellas** (143), para que a los 500 o 1.000 m se vea el whisky acumulado.

## Tests

- `npm test` (vitest): **119 de 119**, de los cuales 26 son de remar:
  - determinismo y paso a paso contra de una;
  - en 1.000 semillas: los tres bots (sobrio, borracho, forzado a ×2) llegan a los 120 s; tres políticas mixtas de botellas también; cada fila tiene un hueco ancho y alcanzable según los presupuestos; ningún cubierto pisa el hueco; la deriva empieza a los 400 m y no cierra el hueco; las botellas salen cada 80 a 120 m, cómodas y arriesgadas; los obstáculos se generan por distancia (a ×2 el mismo río se cruza en la mitad de los ticks); todo dentro del río; `MAX_SCORE` es una cota;
  - reglas: chocar termina en el acto, cada botella suma 10 % con tope ×2 (y vale desde el tick siguiente), la velocidad lateral no cambia con el whisky, la base sube de 6 a 10 m/s, los 120 s terminan la partida, las cajas son más chicas que el dibujo;
  - `validate`: acepta trazas reales (cortada, chocada, a los 120 s) y rechaza metros inflados, ticks fuera de orden o después del final, `x` fuera del campo, otra semilla, un fin que no sale de la partida y una duración incoherente;
  - sprites.
- Los 23 tests de Larry pasan igual, y la huella de 40 semillas es idéntica antes y después del refactor.
- `npm run e2e`: PENDIENTE
- `npm run build`, `npm run typecheck` y `npm run lint`: sin errores.
- Producción: `npx vercel deploy --prod --yes` (otra vez el primer intento respondió "Not authorized" y el segundo salió bien). Contra https://playus-lake.vercel.app corrí la prueba de la ronda real de `remar.spec.ts`: el cuarto grupo nuevo tenía a remar como juego del día; un jugador quieto chocó y terminó solo, el otro remó 150 m con el dedo y chocó a propósito; el servidor aceptó la traza con la duración real del intento, el ranking muestra los metros con "m" y el otro lo vio aparecer sin recargar. `/dev/juego/remar-vuelve-a-casa` da 404. Esa prueba dejó en la base de producción cuatro grupos "remar vuelv N" con dos usuarios de prueba ("Remera" y "Quieto"); no los borré. No hubo migraciones.

## Cómo verificarlo en el navegador

1. En https://playus-lake.vercel.app, crear grupos hasta que Hoy diga "remar vuelve a casa". Cada grupo nuevo tiene una chance de cuatro; mañana, tu grupo de siempre puede tocarlo.
2. Tocar "jugar". En la pantalla previa aparece el marinero en su bote, y abajo "esquivá" (tenedor, cuchillo y cuchara) y "agarrá si te animás" (la botella).
3. Arrastrar el pulgar en cualquier parte del área: el bote va hacia el dedo de costado, sin saltar, y la página no se mueve. Con un segundo dedo no cambia nada.
4. Cada fila de cubiertos tiene un hueco; los sueltos entre filas quedan fuera del camino. Al tomar una botella, "hic!", cachetes más rojos, los remos van más rápido y los cubiertos llegan antes. Cada 100 m, un cartel en la orilla.
5. Al chocar, el bote se inclina, "¡clanc!", un segundo, y el resultado con los metros y las botellas.
6. En el ranking, los metros con "m", enseguida para los demás.
7. En local, `http://localhost:3000/dev/juego/remar-vuelve-a-casa?seed=reporte&desde=600&cajas=1` para ver el río denso, con deriva, las cajas y el camino seguro; `&x2=1` para la dificultad máxima.

## Problemas y deuda

- **Sin probar en un teléfono real**: la comodidad con el pulgar (el dedo tapa el bote; se puede arrastrar más arriba, solo cuenta la x), si los cubiertos se leen a toda velocidad, si el whisky se siente como un riesgo y si la dificultad es pareja.
- **La calibración es con un jugador simulado.** Si con dedos reales las partidas pasan de los 60 s, el primer ajuste es el ancho del hueco al empezar (30); si no llegan a los 30, la separación de las filas al empezar (12 m).
- **A ×2 y pasados los 900 m el camino seguro es casi recto** (los presupuestos dejan poco desvío): es lo que garantiza que se pueda esquivar, pero ahí la partida es una prueba de reflejos pura.
- Siguen como deuda: el ranking del tarado en ms crudos (ahora se resolvería con `unit`), la unificación del cálculo de "te pasaron" y Vercel sin conectar a GitHub.

## Preguntas

- ninguna.

## Siguiente paso propuesto

Probar los cuatro juegos en el teléfono: la comodidad con el pulgar y, en remar, si la mayonesa se lee bien, si el whisky tienta y si las partidas caen entre 30 y 60 s.
