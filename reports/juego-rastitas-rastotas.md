# Reporte: octavo juego real, "rastitas rastotas"
Estado: parcial
Fecha: 2026-09-30

## Qué hice

El octavo juego real está construido, probado y publicado en **https://playus-lake.vercel.app**. Desde la próxima ronda, el mazo de cada grupo reparte los ocho juegos; la ronda de hoy no cambia. El estado es parcial por lo de siempre: "se juega cómodo deslizando con un pulgar", "los giros rápidos no se pierden" y "la Red Bull se siente como una apuesta" piden un teléfono de verdad. Todo lo demás está hecho y verificado, incluida una partida en producción.

**El juego.** Un snake en una grilla de 15 × 21: la cabeza de una persona con rastas avanza un casillero cada tanto y se dobla deslizando el dedo (o con las flechas). Cada cigarro alarga las rastas un casillero y suma 1; la Red Bull (desde los 10 s, cada 15 a 25 s, 6 s en el tablero) da 5 s más rápido con cada cigarro a 2; desde los 20 s, en oleadas cada 15 s, algunos casilleros titilan 1,5 s y después se llenan de piojos para siempre. Chocar el borde ("¡pum!"), las propias rastas ("te enredaste") o los piojos ("¡piojos!") termina la partida. A los 180 s corta el contenedor. Gana el que junta más puntos.

**Simulación (`rules.ts`, decisiones 169 a 173).** El esquema de Larry: 60 ticks, enteros, un solo `rng` por partida que se consume en orden de eventos, así los sorteos que dependen del estado (dónde aparece el próximo cigarro) se reproducen igual en el servidor. Un paso cada 9 ticks, un tick menos cada 5 cigarros con piso 5, y con Red Bull `max(3, ceil(base × 2/3))`. `maxPlausibleScore = 7200` (cota gruesa). El cigarro y la lata aparecen siempre en un casillero libre, no pegado a la cabeza y alcanzable desde ella.

**Pulgas y piojos (decisión 172).** Cada oleada marca 2 casilleros (3 desde los 60 s, 4 desde los 120 s), nunca más del 20 % de la grilla, nunca los próximos 4 en la dirección de la cabeza, ni el cigarro ni la lata, ni las rastas. Cada candidato se confirma solo si, bloqueando todo lo avisado más él, todos los casilleros no bloqueados siguen conectados con la cabeza (un recorrido en anchura). El aviso dura 90 ticks y, si al vencer hay rastas encima, el bloqueo espera. Las oleadas se procesan después del movimiento del tick, así "los próximos 4" se miran con la dirección ya girada.

**Control (decisión 174).** Deslizar en cualquier parte del área: cuenta a los 24 px por el eje dominante, y sin soltar se encadenan giros. Cola de hasta 2 giros, uno por paso; se ignoran el opuesto y el repetido. Flechas del teclado en la misma cola y traza. `touch-action: none`, sin selección ni menú contextual.

**Traza y validación (decisión 173).** `{ tick, dir }` por giro que entró a la cola, y el cierre `{ tick, fin: true }`. `validate` vuelve a jugar y rechaza puntos distintos, ticks fuera de orden o después del final, direcciones inválidas, un fin que no sale de la partida y uno incoherente con la duración real. Sin control contra autoclickers.

**Arte (`sprites.ts`, `draw.ts`, decisión 175).** La cabeza mira hacia donde va; las rastas con cuentitas cada tres segmentos y colita al final, que se aclaran con Red Bull; el cigarro con la brasa; la lata azul y plateada sin logo; los piojos semitransparentes con el borde titilando en `--lengua` durante el aviso y llenos y en movimiento cuando el casillero está bloqueado; el fondo, un colchón viejo acolchado con la grilla apenas marcada. El movimiento se interpola entre pasos. Con `prefers-reduced-motion`, sin brillo, bichos quietos y sin titilar.

**Pantallas.** Arriba los puntos y, con Red Bull, la barrita que se vacía con "×2". La previa: la cabeza con rastas y los tres ítems ("+1 y una rasta más", "más rápido y ×2", "no pises"). El resultado propio: los puntos y el motivo.

**Calibración (decisión 171).** No se ajustaron valores: el bot codicioso (camino más corto al cigarro, sin previsión) muere entre los 44 y los 88 s en las semillas de prueba, dentro del rango de 40 a 90 pedido para la partida típica. Falta confirmarlo con dedos reales.

**Rotación.** `src/games/index.ts` tiene los ocho.

**Herramientas de desarrollo (decisión 176).** `/dev/juego/rastitas-rastotas?seed=…` con coordenadas, cámara lenta, saltos a los 30, 60 y 120 s (el bot juega hasta ahí; si choca antes, arranca de cero y la barra dice hasta dónde llegó), Red Bull forzada, y el dato de cuándo empiezan y cada cuánto vienen las oleadas. Por URL: `&desde=60&coords=1&lento=1&redbull=1`. Da 404 en producción.

**Capturas** en `reports/rastitas-rastotas/`: `previa.png`, `partida-rastas-largas.png` (el salto a los 70 s con la herramienta: rastas largas y piojos), `aviso-piojos.png` (los casilleros titilando con el borde rosa), `efecto-red-bull.png` (la barrita con "×2" y las rastas más claras), `final-pum.png`, `final-enredado.png`, `final-piojos.png` y `resultado.png`. Los tres finales se jugaron de verdad en el navegador con giros calculados en Node: el bot para el borde, una "U" cerrada con las rastas largas para enredarse y el camino más corto a un piojo para pisarlo.

## Archivos

- creados: `src/games/rastitas-rastotas/rules.ts`, `sprites.ts`, `draw.ts`, `index.tsx` y `dev.tsx`: el juego; `rules.test.ts` (15 tests).
- creados: `e2e/rastas.spec.ts` (3 pruebas) y `e2e/helpers/rastas.ts`.
- creados: las capturas de `reports/rastitas-rastotas/` y este reporte.
- modificados:
  - `src/games/index.ts`: los ocho juegos.
  - `src/app/dev/juego/[id]/page.tsx` y `src/app/dev/juego/page.tsx`: la herramienta.
  - `src/lib/attempts.test.ts`: un resultado válido del juego.
  - `e2e/ronda.spec.ts`: sabe jugarlo; `e2e/helpers/group.ts`: 44 intentos.
  - `README.md`, `src/games/README.md` y `DECISIONS.md` (169 a 176).

## Decisiones nuevas

- **169.** Grilla de 15 × 21 (no hizo falta bajar), casilleros de 8 unidades, el arranque.
- **170.** Un `rng` por partida consumido en orden de eventos; `pickCell`.
- **171.** Velocidad, Red Bull y `maxPlausibleScore = 7200`; calibración con el bot.
- **172.** Las oleadas: después del paso, con el recorrido de conexión y la espera si hay rastas encima.
- **173.** Cola de giros, traza y `validate`; `minDurationMs: 5_000`.
- **174.** Deslizar (24 px, encadenable) y flechas.
- **175.** Arte.
- **176.** Lo que el documento no decía: pantallas, saltos con el bot, las oleadas no se pueden anticipar, 44 intentos de grupo.

## Desvíos del plan o del brief

- **"Mostrar las próximas oleadas antes del aviso"** no se implementó tal cual: el sorteo depende del estado y no se puede anticipar sin simular el futuro. La herramienta muestra cuándo empiezan y cada cuánto vienen (176).
- **Los saltos "con rastas largas simuladas"** usan el bot codicioso: las rastas crecen de verdad; si el bot choca antes del tick pedido, la partida arranca de cero (176).
- **La conexión se comprueba sin contar las rastas** (172): las rastas se mueven; contar el cuerpo como pared haría imposible confirmar oleadas con rastas largas.

## Tests

- `npm test` (vitest): 179 de 179 en 18 archivos (los 15 del juego incluidos; la auditoría de 1.000 semillas tarda unos 30 s).
- `e2e/rastas.spec.ts`: 3 de 3 en local (`simulate` igual en el navegador y en Node; la previa, el área sin scroll, el deslizamiento y una partida de tres cigarros; la ronda real con dos jugadores). La suite entera no se volvió a correr esta vez: la de "caminando" ya la había dejado en verde y este juego no toca a los otros.
- `npm run build`, `npm run typecheck` y `npm run lint`: limpios.
- Producción: la ronda real de `e2e/rastas.spec.ts` contra https://playus-lake.vercel.app pasó (dos jugadores, el puntaje validado por el servidor llega al ranking). `/dev/juego/rastitas-rastotas` da 404 allá. La primera corrida contra producción dio 0 puntos: el primer giro del plan caía antes del primer paso y el navegador llegó tarde; ahora los primeros cuatro pasos van derecho y el helper tiene ese margen.

## Cómo verificarlo en el navegador

1. En https://playus-lake.vercel.app, crear grupos hasta que Hoy diga "rastitas rastotas". Cada grupo nuevo tiene una chance de ocho; mañana, tu grupo de siempre puede tocarlo.
2. Tocar "jugar". En la pantalla previa, la cabeza con rastas y los tres ítems.
3. Deslizar el pulgar en cualquier parte para doblar; encadenar dos giros sin soltar hace una "U". La página no se mueve.
4. Comer cigarros: las rastas crecen y el contador sube. Agarrar la Red Bull: las rastas brillan, la barrita se vacía y cada cigarro vale 2.
5. Desde los 20 s, ver titilar casilleros con bichitos: pasar por encima mientras titilan no pasa nada; después se llenan y hay que esquivarlos.
6. Chocar el borde, las rastas o los piojos: el cartel del final y el resultado.
7. En local, `http://localhost:3000/dev/juego/rastitas-rastotas?seed=reporte&desde=60&coords=1&lento=1` para ver rastas largas y piojos en cámara lenta con coordenadas.

## Problemas y deuda

- **Sin probar en un teléfono real**: la comodidad de deslizar con el pulgar, si los giros rápidos se sienten bien y si la Red Bull tienta.
- **La calibración es con un bot sin previsión.** Si con dedos reales las partidas pasan de los 90 s, el primer ajuste es el intervalo inicial (9) o el piso (5).
- Siguen como deuda: el ranking del tarado en ms crudos, la unificación del cálculo de "te pasaron" y Vercel sin conectar a GitHub.

## Preguntas

- ninguna.

## Siguiente paso propuesto

Probar los ocho juegos en el teléfono; en las rastas, la sensibilidad del deslizamiento (24 px) y si la partida típica cae entre 40 y 90 s.
