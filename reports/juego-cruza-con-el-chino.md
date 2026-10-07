# Juego nuevo: Cruza con el chino

Publicado en producción (https://playus-lake.vercel.app) el 2026-10-07.

## Qué es

Un Frogger: El chino va montado arriba de la rana de Frog y tienen que cruzar calles llenas de tránsito. Tocar salta un carril hacia adelante, deslizar a los costados mueve de lado; cada tanto hay una vereda segura; si los atropellan se termina. 120 segundos; el puntaje son los carriles avanzados, con la unidad "carriles" en el ranking.

- Módulo `src/games/cruza-con-el-chino/` (`rules.ts` simulación, curso, buscador de caminos, traza y `validate`; `sprites.ts`, `draw.ts`, `index.tsx`, `dev.tsx`). Decisiones 258 a 261.
- Piezas compartidas: El chino pasó a `src/games/lib/chino.ts` (fumate algo chino lo reexporta) con las variantes montado y sentado; la rana vista de atrás es nueva en `src/games/lib/frog.ts` con los colores de la mascota; el puntero único viene de `games/lib/taps`.
- Control resuelto al soltar: toque (< 20 px) adelante, deslizamiento horizontal (≥ 30 px) de costado, vertical nada; cola de 1; teclado en escritorio.
- Simulación entera a 60 ticks; salto de 8 ticks con la caja de choque en el origen los primeros 4 y en el destino los últimos 4; calles como anillos de celdas con vehículos a velocidad constante que salen por un lado y vuelven por el otro; vías con tren y semáforo que titila 1 s antes; dificultad por carril según la tabla; vías desde el 60.
- Justicia: todo bloque se comprueba al generarlo con un buscador en anchura sobre (fila, columna, tick) con 250 ms de margen al aterrizar, desde tres ticks de salida; si no hay camino, el bloque se abre (más lento y con más espacio). En 1.000 semillas, todos los bloques hasta el carril 100 tienen camino.
- Calibración: jugador justo 556 carriles sin chocar; modelo (500 ms de reacción, 2 s por vereda, 400 ms entre saltos) 67 de mediana (61 a 78); lento 36.
- Traza `{ tick, dir }` + `fin`; `validate` vuelve a jugar y rechaza carriles inflados, ticks fuera de orden, `dir` inválido, cierre fuera de rango o distinto del choque, y duración incoherente.
- Herramienta `/dev/juego/cruza-con-el-chino?seed=…&cajas=1&camino=1&lento=1&desde=30` (404 en producción salvo para el admin).

## Comprobaciones

- `vitest`: 13 tests del juego (determinismo; control: toque, deslizamiento, vertical, borde y cola; salto de 8 ticks con la caja en origen y destino; tránsito: velocidad y sentido constantes, salida y reentrada por el anillo, máscara igual a la ocupación; tren con aviso de 1 s; dificultad según la tabla incluidas vías, motos y el sunny; justicia en 1.000 semillas hasta el carril 100 con margen en cada salto; calibración; chocar termina y esperar en la vereda no penaliza; `validate` con todos los rechazos; arte). El de justicia tarda unos 4 minutos. Suite completa en verde; `eslint`, `tsc` y `next build` limpios.
- E2E local (`e2e/cruza.spec.ts`): curso, máscaras, buscador y partidas idénticos en navegador y Node en 6 semillas; previa, herramienta con sus sprites, área (`touch-action`, `user-select`), un deslizamiento vertical que no hace nada, uno de costado que mueve una columna y un toque que avanza; ronda real que cruza los dos primeros bloques con los saltos del buscador calculados en el test, se queda en una calle hasta que lo atropellan y llega al ranking con los carriles correctos y la unidad.
- E2E en producción (`e2e/cruza.spec.ts -g "ronda real"`): ver abajo.
- `/dev/juego/cruza-con-el-chino` responde 404 en producción sin sesión de admin.

## Capturas

- `reports/cruza-con-el-chino/previa.png`: la pantalla previa.
- `reports/cruza-con-el-chino/bloque-colectivos-motos.png`: un bloque de 3 calles con colectivos y motos.
- `reports/cruza-con-el-chino/tren-semaforo.png`: la vía con el semáforo titilando antes del tren.
- `reports/cruza-con-el-chino/sunny.png`: el sunny rojo pasando.
- `reports/cruza-con-el-chino/de-a-pie.png`: el final "el chino quedó de a pie".
- `reports/cruza-con-el-chino/sprites.png`: los sprites en la herramienta.
