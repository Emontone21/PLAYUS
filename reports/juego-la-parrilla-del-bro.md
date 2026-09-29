# Reporte: quinto juego real, "la parrilla del bro"
Estado: parcial
Fecha: 2026-09-29

## Qué hice

El quinto juego real está construido, probado y publicado en **https://playus-lake.vercel.app**. Desde la próxima ronda, el mazo de cada grupo reparte los cinco juegos; la ronda de hoy no cambia. El estado es parcial por lo de siempre: "se juega cómodo con un pulgar", "el aviso se nota a tiempo" y "los amagues engañan de verdad" piden un teléfono y dedos reales. Todo lo demás está hecho y verificado, incluida una partida en producción.

**El juego.** Un "luz roja, luz verde" en un parrillero. El bro está al lado del asador y el canario, un chef con un porro en la boca, cocina de espaldas en la mesada. Cada toque en la pantalla es un toque del bro a la parrilla y suma uno. Antes de darse vuelta, el canario avisa (frena de cocinar, se le sacude el gorro, larga una bocanada grande y dice "¿eh?"); si te ve tocando, "¡te vi, bro!", un segundo de pausa y el resultado con los toques que tenías. Con el tiempo avisa menos, gira más rápido, se queda menos mirando y empieza a amagar: el mismo gesto, y no se da vuelta. A los 90 s corta el contenedor. Gana el que junta más toques.

**Piezas compartidas (decisión 144).** Los controles contra autoclickers y el rastreo de un solo dedo del tarado se movieron a `src/games/lib/taps.ts` (`createPointerTracker`, `parseTaps`, `tooRegular`, `stdDev`, `humanTrace` y los umbrales: 35 ms de intervalo mínimo, desvío menor a 4 ms en 30 intervalos seguidos). El tarado los reexporta y sus 9 tests pasan sin tocarlos. La fuente de 3 × 5 de remar también pasó a la lib (`font.ts`), con las letras para "tss" y "¿eh?".

**El cronograma (`timeline.ts`, decisiones 145 a 147).** `canarioTimeline(seed)` devuelve la lista de segmentos `{ start, end, state }` que cubre los 90 s sin huecos ni superposiciones, generada entera con la semilla del intento. Cada ciclo: `espaldas` un rato al azar y después un `amague` (que dura exactamente lo que duraría un aviso en ese instante, y sigue de espaldas) o `aviso → girando → mirando → volviendo`. Las duraciones salen de la fila de dificultad interpolada con enteros; el aviso nunca baja de 300 ms y no hay amagues antes de los 10 s (topes explícitos, no consecuencias de la tabla). Los segmentos son `[start, end)`: el instante en que empieza `girando` ya es peligroso.

**Calibración (decisión 147).** Con la tabla del documento (filas a los 0, 10, 45 y 90 s), un jugador simulado que ve el gesto con un retraso de 280 ± 60 ms duraba 86 s de mediana y el 44 % llegaba a los 90; con 340 ms, 60 s. Adelanté las dos últimas filas a los 30 y 60 s (desde ahí queda plana):

| reacción | cuartil 1 | mediana | cuartil 3 | llegan a 90 s |
|---|---|---|---|---|
| 220 ± 50 ms | 90 s | 90 s | 90 s | 79 % |
| 280 ± 60 ms | 55 s | 67 s | 82 s | 16 % |
| 340 ± 70 ms | 38 s | 45 s | 51 s | 0 % |

El jugador simulado toca cada 90 a 220 ms, frena cuando percibe el aviso (lo que había hace `retraso` ms) y no cuenta la latencia motriz del dedo, que en la vida real suma. Falta confirmarlo con dedos reales. Valores finales: espaldas 2,5–4 s → 2–3,5 → 1,2–2,2 → 0,8–1,6 s; aviso 700 → 600 → 400 → 300 ms; giro 350 → 300 → 200 → 150 ms; mirando 1,5–2,5 → 1,5–2,5 → 1–2 → 1–1,8 s; amagues 0 → 10 → 25 → 30 %, a los 0, 10, 30 y 60 s.

**Toques.** Un solo dedo con el registro compartido; en escritorio el clic izquierdo; el teclado no cuenta. Toda el área es zona de toque, con `touch-action: manipulation`, sin selección de texto ni menú contextual. El cliente mide `t` con `performance.now()` desde `onReady` (decisión 150); el dibujo corre en `requestAnimationFrame` pero el estado sale del reloj.

**Traza y validación (decisión 149).** La traza son solo los toques que contaron, incluido el que te vio. `validate` rearma el cronograma con la semilla y lo recorre: el puntaje son los toques seguros antes del primer peligroso; si hay uno peligroso tiene que ser el último; si no hay ninguno, ningún `t` supera 92.000 (los de 90.000 en adelante no cuentan). Rechaza puntaje distinto, toques después del peligroso, `t` fuera de orden, intervalos menores a 35 ms y ritmo fijo. `maxPlausibleScore = 2571` (decisión 148). En `DECISIONS.md` quedó anotado que un bot que conozca el cronograma puede jugar perfecto.

**Arte (`sprites.ts`, `draw.ts`, decisión 151).** Escena de 96 × 64 de costado: asador de ladrillo con brasas que titilan, chorizos y humo; el bro (remera lisa verde, pelo corto) que estira el brazo con una chispita y un "tss" en cada toque; el canario de chef (gorro alto, chaqueta blanca, porro con humo) detrás de la mesada. Estados: de espaldas pica; aviso y amague son el mismo sprite (gorro sacudido, bocanada grande, "¿eh?"), y el test lo comprueba con igualdad estricta; girando y volviendo son el perfil; mirando, de frente con los ojos entrecerrados; visto, de frente con los ojos abiertos y señalando, más el cartel en HTML. La pantalla previa muestra "de espaldas: tocá", "se mueve: frená" (con el "¿eh?") y "te mira: quieto". Con `prefers-reduced-motion` no hay humo animado, chispas ni sacudón; los cambios de estado se mantienen. Sin sonido.

**Rotación.** `src/games/index.ts` tiene los cinco.

**Herramientas de desarrollo (decisión 152).** `/dev/juego/la-parrilla-del-bro?seed=…` muestra la barra del cronograma pintada por estado, cámara lenta (×0,25), saltos a 10, 45 y 80 s y cada estado del canario en su escena. Por URL: `&desde=45&lento=1`. Da 404 en producción.

**Capturas** en `reports/la-parrilla-del-bro/`: `previa.png`, `estado-espaldas.png`, `estado-aviso.png`, `estado-amague.png`, `estado-girando.png`, `estado-mirando.png`, `estado-volviendo.png`, `estado-visto.png`, `dev-cronograma.png`, `partida-tocando.png`, `partida-aviso.png`, `te-vi-bro.png` y `resultado.png`.

## Archivos

- creados: `src/games/lib/taps.ts` y `src/games/lib/font.ts`: las piezas compartidas.
- creados: `src/games/la-parrilla-del-bro/timeline.ts`, `rules.ts`, `sprites.ts`, `draw.ts`, `index.tsx` y `dev.tsx`: el juego; `rules.test.ts` (13 tests).
- creados: `e2e/parrilla.spec.ts` (2 pruebas) y `e2e/helpers/parrilla.ts`.
- creados: las capturas de `reports/la-parrilla-del-bro/` y este reporte.
- modificados:
  - `src/games/quedo-re-tarado/rules.ts`: usa y reexporta `games/lib/taps` (mismo comportamiento).
  - `src/games/remar-vuelve-a-casa/sprites.ts`: la fuente sale de `games/lib/font`.
  - `src/games/index.ts`: los cinco juegos.
  - `src/app/dev/juego/[id]/page.tsx` y `src/app/dev/juego/page.tsx`: la herramienta de la parrilla.
  - `src/lib/attempts.test.ts`: un resultado válido de la parrilla.
  - `e2e/ronda.spec.ts`: sabe jugar a la parrilla; `e2e/helpers/group.ts`: 26 intentos.
  - `README.md`, `src/games/README.md` y `DECISIONS.md` (144 a 152).

## Decisiones nuevas

- **144.** Toques de un dedo y controles contra autoclickers en `games/lib/taps.ts`; la fuente en `games/lib/font.ts`.
- **145.** El cronograma: segmentos `[start, end)`, un ciclo por vuelta, el amague dura lo que el aviso.
- **146.** El aviso nunca baja de 300 ms y no hay amagues antes de los 10 s, como topes explícitos.
- **147.** La tabla se adelantó a 30 y 60 s, y la calibración.
- **148.** `maxPlausibleScore = 2571`.
- **149.** La traza y `validate`; `minDurationMs: 5_000`; el bot que conoce el cronograma.
- **150.** El reloj es `performance.now()`, no los cuadros.
- **151.** Arte.
- **152.** Lo que el documento no decía: el contador, el resultado, 26 intentos de grupo y la herramienta.

## Desvíos del plan o del brief

- **La tabla de dificultad se adelantó** (147): con la del documento, la partida típica pasaba de los 60 s.
- **Los toques desde los 90.000 ms no cuentan** aunque entren en el margen (149): el cronómetro ya cortó.
- **Aviso y amague comparten el sprite** en vez de ser dos dibujos iguales (151): así es imposible que se distingan.

## Tests

- `npm test` (vitest): **131 de 131**, de los cuales 13 son de la parrilla:
  - `canarioTimeline` determinística, cubre los 90 s sin huecos ni superposiciones;
  - en 1.000 semillas: todo girando viene de un aviso (y sigue mirando y volviendo), ningún aviso dura menos de 300 ms, sin amagues antes de los 10 s, amague y aviso duran lo que dice la fila en su instante, y la frecuencia de amagues sigue la tabla (dentro del 2 % en tres franjas);
  - la dificultad sube de forma pareja (los valores interpolados en varios puntos);
  - bordes: un toque en el `start` de girando es peligroso y uno 1 ms antes es seguro; lo mismo al final de volviendo;
  - `validate`: acepta una partida por tiempo (con toques de más dentro del margen) y una al ser visto (mirando o girando), y rechaza puntaje inflado, toques después del peligroso, fuera de orden, un intervalo de 20 ms, un ritmo fijo, una traza mal armada y una de otra semilla;
  - `MAX_SCORE` es una cota; sprites (aviso y amague idénticos, los demás distintos).
- Los 9 tests del tarado pasan igual después de mover los controles a la lib.
- `npm run e2e`: **20 de 21** en la corrida completa (8,6 minutos), con `pwa.spec.ts` salteada a propósito en desarrollo; la que falló fue una de remar que cayó en 112 ms al navegar (carga transitoria) y pasó sola al repetirla. Las 2 de la parrilla: la pantalla previa con los tres dibujos, la barra del cronograma con los mismos segmentos que Node, el teclado que no cuenta, una partida que toca en los tramos seguros y después en "mirando" (te vi, bro, con el puntaje exacto); y la ronda real: `/finish` acepta la traza (20 toques seguros más el peligroso), el cuerpo se valida en Node, el ranking muestra el puntaje exacto y el segundo jugador queda segundo con el suyo. `ronda.spec` sabe jugar a la parrilla y las 3 del tarado pasan con los controles movidos a la lib.
- `npm run build`, `npm run typecheck` y `npm run lint`: sin errores.
- Producción: `npx vercel deploy --prod --yes` (el primer intento respondió "Not authorized" y el segundo salió bien). Contra https://playus-lake.vercel.app corrí la prueba de la ronda real de `parrilla.spec.ts`: el sexto grupo nuevo tenía a la parrilla como juego del día; el servidor aceptó la traza, el ranking mostró el puntaje exacto y el segundo jugador quedó segundo. `/dev/juego/la-parrilla-del-bro` da 404. Esa prueba dejó en la base de producción seis grupos "la parrilla N" con dos usuarios de prueba ("Bro" y "Canario"); no los borré. No hubo migraciones.

## Cómo verificarlo en el navegador

1. En https://playus-lake.vercel.app, crear grupos hasta que Hoy diga "la parrilla del bro". Cada grupo nuevo tiene una chance de cinco; mañana, tu grupo de siempre puede tocarlo.
2. Tocar "jugar". En la pantalla previa, los tres dibujos: "de espaldas: tocá", "se mueve: frená" y "te mira: quieto".
3. Tocar con el pulgar mientras el canario pica de espaldas: el bro toca la parrilla, salta la chispita y el contador sube. Con dos dedos, el segundo no cuenta.
4. Cuando el gorro se sacude, sube la bocanada y aparece "¿eh?", frenar. A veces vuelve a cocinar (amague); a veces gira, mira con los ojos entrecerrados y vuelve.
5. Si tocás cuando gira o mira: "¡te vi, bro!", un segundo, y el resultado con los toques que tenías.
6. En el ranking, el puntaje aparece enseguida para los demás.
7. En local, `http://localhost:3000/dev/juego/la-parrilla-del-bro?seed=reporte&desde=45&lento=1` para ver el cronograma pintado, la partida en cámara lenta desde los 45 s y cada estado del canario.

## Problemas y deuda

- **Sin probar en un teléfono real**: si el aviso se nota a tiempo, si los amagues engañan y si la dificultad se siente pareja.
- **La calibración es con un jugador simulado.** Si con dedos reales las partidas pasan de los 60 s, el primer ajuste es adelantar la fila de 60 s a los 45; si no llegan a los 30, el aviso de la fila de 30 s (400 ms).
- **El filtro de ritmo es el del tarado.** En la parrilla los toques vienen en tandas cortas, así que la ventana de 30 intervalos parejos casi nunca se llena; el intervalo mínimo de 35 ms es el control que trabaja.
- Siguen como deuda: el ranking del tarado en ms crudos, la unificación del cálculo de "te pasaron" y Vercel sin conectar a GitHub.

## Preguntas

- ninguna.

## Siguiente paso propuesto

Probar los cinco juegos en el teléfono; en la parrilla, si el aviso de 300 ms al final se puede frenar con el pulgar y si las partidas caen entre 30 y 60 s.
