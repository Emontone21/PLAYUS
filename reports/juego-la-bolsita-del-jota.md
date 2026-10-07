# Juego nuevo: la bolsita del jota

Publicado en producción (https://playus-lake.vercel.app) el 2026-10-06, deploy `playus-jn5id4ycb`. Id estable `la-bolsita-del-jota`. Está en el registro activo y, a pedido del dueño, es el juego de hoy (2026-10-06) en los 12 grupos de producción.

## Qué es

El jota esconde una bolsita de tussi bajo uno de 3 vasos rojos idénticos, los mezcla y, si adivinás dónde quedó, te la regala; si le errás, se termina. El puntaje son las rondas acertadas.

- Módulo `src/games/la-bolsita-del-jota/` (`rules.ts` mezclas, rondas, el jota, traza, `validate` y jugador automático; `sprites.ts` el vaso; `draw.ts`; `index.tsx`; `dev.tsx`). Decisiones 255 a 257.
- **Reutilización (decisión 255):** el jota (con dos caras nuevas, burlón y concentrado), su mano y la tussi pasaron a `src/games/lib/jota.ts`. "Pegándole al jota" los toma de ahí, sin copias, y sus tests y su E2E siguen en verde.
- **Mezclas:** `jotaShuffles(semilla)` da 40 rondas con intercambios, amagues (desde la 4), ráfagas (5), saltos (7), cambios de bolsita a la vista (8, como mucho uno por ronda, con al menos 350 ms de viaje visible) y rotaciones (10). Movimientos, duración y proporción de jugadas siguen la tabla; cada mezcla se acelera hasta el 55 % del primer movimiento, con pisos de 180, 220 y 350 ms que nunca se bajan, y nunca hay dos jugadas seguidas.
- **Calibración (decisión 256):** el jugador modelo, que a veces le pierde el rastro a la bolsita según la velocidad y lo tramposo de cada jugada, llega a la ronda **6/9/12** (p25/mediana/p75). La cota es de **24** rondas (el perfecto hace 21).
- **Control:** el área partida en tres columnas, una por vaso; un solo dedo; en escritorio, el clic y las teclas 1, 2 y 3.
- **Traza:** `{ round, t, cup }` por ronda. `validate` rearma las mezclas y rechaza rondas infladas, eventos después de un error, rondas salteadas, elecciones antes de que termine la mezcla, tiempos fuera de orden y otra semilla.
- **Herramienta:** `/dev/juego/la-bolsita-del-jota?seed=…&cajas=1&lento=1&desde=10` (solo admin en producción): la bolsita a través de los vasos, los movimientos de cada ronda, ×0,25, saltos a las rondas 1, 6, 10 y 15, y las caras del jota.

## Comprobaciones

- `vitest`: 11 tests del juego, más el intento de prueba en `attempts.test.ts`: determinismo, la posición de la bolsita con cada tipo de movimiento, en 1.000 semillas la tabla (cantidades, proporción de jugadas, aceleración, pisos, cada jugada desde su ronda, nunca dos seguidas, un cambio de bolsita como mucho), las reglas, el jota, `validate` con todos los rechazos, la cota, la calibración y la reutilización. Suite completa: 400 en verde y 3 en rojo, los de `admin.test.ts` en la base local ("URI too long", deuda ya anotada en el reporte de "Nach salta"). `eslint`, `tsc` y `next build` limpios.
- E2E local (`e2e/bolsita.spec.ts`, 3 en verde; también el de "pegándole al jota"): las mezclas y partidas enteras dan lo mismo en el navegador y en Node en 6 semillas; la previa, las caras, el área, los toques durante la mezcla que no cuentan y un acierto tocando la columna; en la ronda real, con la posición tomada de `jotaShuffles` en el test, acierta tres rondas, erra la cuarta (el jota se burla) y llega al ranking con 3.
- En producción: `/dev/juego/la-bolsita-del-jota` da **404** sin sesión de admin, y la ronda real pasa (47 s).
- Juego de hoy: aplicado con `admin_set_today_game` en los 12 grupos, con la semilla de siempre; después, los 12 tienen `la-bolsita-del-jota` con 0 intentos.

## Capturas

- `reports/la-bolsita-del-jota/previa.png`: la pantalla previa.
- `reports/la-bolsita-del-jota/escondiendo.png`: el jota escondiendo la bolsita.
- `reports/la-bolsita-del-jota/intercambio.png`: un intercambio a mitad de camino.
- `reports/la-bolsita-del-jota/salto.png`: un salto.
- `reports/la-bolsita-del-jota/cambio-de-bolsita.png`: un cambio de bolsita, con la bolsita viajando.
- `reports/la-bolsita-del-jota/acierto.png`: un acierto, "tomá, bro, es tuya".
- `reports/la-bolsita-del-jota/error.png`: un error, con el jota burlándose: "uh, casi, bro".
- `reports/la-bolsita-del-jota/caras.png`: las caras del jota.
