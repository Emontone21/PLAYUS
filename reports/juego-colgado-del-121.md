# Reporte: juego nuevo, "colgado del 121"
Estado: parcial
Fecha: 2026-10-01

## Segunda versión: más brusco, base más chica y sacudones

Quedó fácil; el mismo día se endureció la simulación, sin tocar el arte ni el control (decisiones 204 y 205).

- **Movimientos más bruscos:** inclinación ×1,6 en todo el cronograma (amplitud de 832 a 1600, tope 1600; 1000 sigue siendo 12° en el dibujo), puntos clave el doble de juntos (cada 50 a 18 ticks) y límite de cambio por tick al doble (28 a 70).
- **Sacudones:** desde los 10 s, un golpe corto y fuerte hacia un lado (900 a 1400, de 300 a 500 ms) cada 4 a 8 s al principio y cada 2 a 4 s a los 60 s, sin aviso, sumado a la curva suave. En la herramienta, el gráfico los marca con bandas rosas.
- **La base** baja de 40 a 12 en los primeros 30 s y después despacio hasta 8 a los 60 s.
- **Justicia:** el jugador automático de 250 ms tiene que aguantar 15 s; si se cae, se suaviza el sacudón que estaba pegando (no la base). En 1.000 semillas no hizo falta ningún ajuste: aguanta de 15,6 a 32 s.
- **Calibración:** el empuje de la inclinación baja de 18 a 15 por cada 1000. Sin tocar, se cae a los 1,8 s (5,6 en el peor caso). Jugadores simulados con 300 ms de reacción: 17,6 s de mediana (15 a 20); con 350 ms, 10,8 s. La partida típica queda entre 15 y 30 s para quien reacciona en 300 ms.
- **Tests:** el nuevo cronograma de la base, los sacudones desde los 10 s con su frecuencia creciente (y que pegan de verdad), el límite de cambio por tick sobre la curva suave (la inclinación es la curva más los sacudones), y el umbral de 15 s del jugador automático. `npm test`: 219 de 219. E2E del juego: 3 de 3 en local con la versión nueva. Build, typecheck y lint limpios.
- **Capturas nuevas:** `grafico-sacudones.png` (el gráfico con las bandas rosas), `sacudon.png` (en el primer sacudón, con el jugador automático) y `partida-20s.png` (la base ya angosta a los 20 s). Las de la primera versión (10 s, 50 s y la caída) quedan como referencia del arte.
- **Publicación:** publicada en el día por decisión del usuario (205). Producción: la ronda real de `e2e/colgado.spec.ts` contra https://playus-lake.vercel.app pasó con la segunda versión; `/dev/juego/colgado-del-121` da 404 allá.

Lo que sigue es el reporte de la primera versión, que vale para todo lo que no cambió.

## Qué hice

El juego está construido, probado y publicado en **https://playus-lake.vercel.app**. Desde la próxima ronda, el mazo de cada grupo reparte los once juegos; la ronda de hoy no cambia. El estado es parcial por lo de siempre: "se juega cómodo con un pulgar" y "mantener al pasajero en el medio exige atención todo el tiempo" piden un teléfono y una persona de verdad. Todo lo demás está hecho y verificado, incluida una partida en producción.

**El juego.** Un pasajero parado en el pasillo de un ómnibus que se inclina a los costados sin avisar. Mantener apretada una mitad de la pantalla lo empuja para ese lado; hay que mantenerlo en el medio sobre una base que arranca en 40 unidades de cada lado y se achica hasta 12 a los 90 s. Si sale de la base, "¡al piso!". El puntaje es el tiempo aguantado, en segundos con un decimal ("34,7 s"). 120 s como máximo; casi nadie llega.

**Simulación (`rules.ts`, decisiones 200 a 202).** Todo entero, 60 ticks, sin seno ni coseno de `Math`. La inclinación de cada tick sale de la semilla: puntos clave al azar unidos con 3u² − 2u³ en Q10 y un límite de cambio por tick; con el tiempo suben la amplitud (520 → 1000) y la frecuencia (cada 100 → 36 ticks). El pasajero es un péndulo invertido chico: la inclinación lo empuja, lejos del centro se va más, el dedo empuja constante y hay rozamiento. Valores finales: inclinación × 18/1000, x/2048, dedo 34, rozamiento 18/256 (subunidades por tick²). **Justicia:** un jugador automático con 250 ms de demora, que estima dónde va a estar el pasajero y aprieta al revés, tiene que aguantar 30 s; si no, la generación frena ese tramo. En 1.000 semillas no hizo falta: aguanta de 71 a 89 s.

**Calibración.** Sin tocar, se cae a los 2,5 s (2,9 en el peor caso de 1.000 semillas). Jugadores simulados con 300 ms de demora duran 49 s de mediana; con 350 ms, 24 s; con 400 ms, 8 s. La partida típica queda entre 25 y 50 s según la reacción.

**Control.** El del sunny: la mitad apretada manda, un solo dedo, arrastrar cambia de lado, flechas en escritorio, `touch-action: none`, marcas ‹ y › abajo.

**Traza y validación (decisión 203).** `{ tick, push }` por cambio de empuje y el cierre; `validate` vuelve a correr la partida y rechaza ms distintos (con la tolerancia de un tick), ticks fuera de orden o después del cierre, `push` inválido, un cierre que no coincide con la caída y una duración incoherente con el intento.

**Puntaje en segundos (decisión 203).** El mecanismo de unidades del ranking no admitía "34,7 s" a partir de ms, así que se extendió de forma general: `GameModule.formatScore?(score)` devuelve el texto entero y `scoreText(game, score)` lo usa en el ranking, en Hoy (tu mejor, ayer ganó, te pasó por), en el resultado por defecto del contenedor y en el aviso de "te pasaron". Los otros juegos no cambian.

**Arte (`sprites.ts`, `draw.ts`).** El interior del ómnibus (paredes, piso, pasamanos con agarraderas, ventanillas con la calle que pasa, asientos) se pinta en un canvas chico fuera de pantalla a una unidad por píxel, con la base y el pasajero adentro, y se dibuja girado por la inclinación con vecino más cercano. El pasajero parado de frente se inclina hacia donde va y revolea los brazos cerca del borde; la base es una franja en `--agua` que pasa a `--lengua` cerca del borde; en la caída se va al piso hacia ese lado. Arriba, el tiempo bien grande. Con `prefers-reduced-motion`, la calle queda quieta.

**Herramientas de desarrollo.** `/dev/juego/colgado-del-121?seed=…`: gráfico de la inclinación y del ancho de la base, x/velocidad/empuje sobre el canvas, cámara lenta, saltos a 20, 45 y 80 s y el jugador automático con demora configurable (`&desde=45&datos=1&lento=1&auto=1`). Da 404 en producción.

**Capturas** en `reports/colgado-del-121/`: `previa.png`, `partida-10s.png` y `partida-50s.png` (con el jugador automático: el bondi inclinado y la base angosta), `caida.png` y `resultado.png`.

## Archivos

- creados: `src/games/colgado-del-121/rules.ts`, `sprites.ts`, `draw.ts`, `index.tsx` y `dev.tsx`: el juego; `rules.test.ts` (8 tests).
- creados: `e2e/colgado.spec.ts` (3 pruebas) y `e2e/helpers/colgado.ts`.
- creados: las capturas de `reports/colgado-del-121/` y este reporte.
- modificados:
  - `src/games/types.ts`: `formatScore` y `scoreText`; `src/components/ranking.tsx`: `valueText`; `src/app/(app)/hoy/page.tsx`, `src/games/container.tsx` y `src/lib/overtake.ts`: usan `scoreText`.
  - `src/games/index.ts`: los once juegos.
  - `src/app/dev/juego/[id]/page.tsx`: la herramienta.
  - `src/lib/attempts.test.ts`: un resultado válido del juego.
  - `e2e/ronda.spec.ts`: sabe jugarlo; `e2e/helpers/group.ts`: 62 intentos.
  - `README.md`, `src/games/README.md` y `DECISIONS.md` (200 a 203).

## Decisiones nuevas

- **200.** La inclinación: puntos clave con curva suave en enteros, límite por tick, los dos primeros tramos fuertes y para el mismo lado.
- **201.** El pasajero como péndulo invertido chico, y los valores finales de la calibración.
- **202.** Justicia sin avisos: el jugador automático de 250 ms y el freno por tramo.
- **203.** Puntaje en ms con `formatScore`, y lo que el documento no decía.

## Desvíos del plan o del brief

- **El formato del puntaje** pidió extender el contrato (`formatScore`); está anotado y es general.
- **La caída sin tocar** llega a los 2,5 s, bastante antes de los 8 pedidos: la inclinación arranca fuerte a propósito para que no se pueda ganar sin jugar.

## Tests

- `npm test` (vitest): 219 de 219 en 22 archivos (los 8 del juego incluidos; las 1.000 semillas con el jugador automático tardan 2 s).
- `e2e/colgado.spec.ts`: 3 de 3 en local (`simulate` igual en el navegador y en Node; la previa, el área sin scroll, mantener apretado y arrastrar de lado, y una partida que suelta y se cae; la ronda real con dos jugadores y el ranking en "s" con un decimal). La suite entera no se volvió a correr esta vez: este juego no toca a los otros, salvo el formato del puntaje, que los otros no usan.
- `npm run build`, `npm run typecheck` y `npm run lint`: limpios.
- Producción: la ronda real de `e2e/colgado.spec.ts` contra https://playus-lake.vercel.app pasó (dos jugadores, los ms validados por el servidor llegan al ranking como segundos). `/dev/juego/colgado-del-121` da 404 allá.

## Cómo verificarlo en el navegador

1. En https://playus-lake.vercel.app, crear grupos hasta que Hoy diga "colgado del 121". Cada grupo nuevo tiene una chance de once.
2. Tocar "jugar". En la previa, el pasajero parado sobre la franja celeste.
3. Mantener apretada una mitad de la pantalla: el pasajero se mueve para ese lado; el bondi se inclina y lo empuja. La página no se mueve.
4. Ver la base achicarse y ponerse rosa cuando el pasajero se acerca al borde; los brazos se revolean.
5. Caerse: "¡al piso!", el resultado en segundos y el ranking en vivo con "34,7 s".
6. En local, `http://localhost:3000/dev/juego/colgado-del-121?seed=reporte&desde=45&auto=1&datos=1` para ver la base angosta con el jugador automático.

## Problemas y deuda

- **Sin probar en un teléfono real**: si el empuje del dedo se siente bien y si la caída a los 2,5 s sin tocar no resulta brusca para alguien que recién entra.
- **La calibración es con jugadores simulados**: si en el teléfono resulta demasiado, el primer botón es el empuje de la inclinación (18) o la amplitud inicial (520).
- Siguen como deuda: el ranking del tarado en ms crudos (podría usar `formatScore` ahora), la unificación del cálculo de "te pasaron" y Vercel sin conectar a GitHub.

## Preguntas

- ninguna.

## Siguiente paso propuesto

Probar los once juegos en el teléfono; en el 121, la sensibilidad del empuje y la duración típica.
