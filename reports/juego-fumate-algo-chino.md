# Juego nuevo: fumate algo chino

Publicado en producción (https://playus-lake.vercel.app) el 2026-10-02.

## Qué es

Tres tiros con una gomera: arrastrar hacia atrás apunta y elige la fuerza, soltar tira, y el cigarro vuela con gravedad y viento hasta la boca abierta de El chino. Cada tiro tiene su distancia y su viento (suave, medio y fuerte, que se ve en la manga); cuanto más cerca del centro de la boca pasa el cigarro, más puntos. Cuenta el mejor de los 3.

- Módulo `src/games/fumate-algo-chino/` (`rules.ts` simulación y validación, `sprites.ts`, `draw.ts`, `index.tsx`, `dev.tsx`).
- Simulación entera en punto fijo (1/4.096 dm) a 60 ticks y 4 subpasos; la distancia mínima a la boca se mide en cada subpaso. Decisiones 229 a 231.
- Puntaje por tiro: 1.000 − 50 × dm a la boca (borde 900, 1 m 500). "adentro" ≤ 2 dm, "casi" ≤ 5 dm, "ni cerca" el resto.
- Justicia: un resolvedor en forma cerrada encuentra, en 1.000 semillas, un vector dentro del rango de fuerza que pasa por el centro (lo peor, 0,02 dm).
- Calibración (100 semillas): perfecto 1.000; jugador modelo (±6 % en el vector) 957 de mediana, 1,3 tiros adentro por partida; flojo (±12 %) 912.
- Traza `{ shot, tick, vx, vy }` + `fin`; `validate` vuelve a volar cada tiro y rechaza más de 3, fuera de orden, en vuelo o en la pausa, fuerza fuera de rango, fin incoherente y duración incoherente.
- Control: vector opuesto al arrastre, 150 px para la fuerza máxima, menos de 20 px no cuenta; se ve la banda y el primer 25 % de la trayectoria.
- Herramienta `/dev/juego/fumate-algo-chino?seed=…&todo=1&datos=1&resolver=1&desde=N` (404 en producción): trayectoria entera, radio de la boca y distancia mínima, vector del resolvedor, salto a cualquier tiro y las cuatro caras.

## Comprobaciones

- `vitest`: 13 tests del juego (determinismo, rangos, simetría sin viento y deriva con viento, tope de fuerza, control de 20 px, subpasos, puntajes, ritmo y pausa, justicia en 1.000 semillas, validate, calibración, arte), más el intento de prueba en `attempts.test.ts`. Suite completa en verde; `eslint`, `tsc` y `next build` limpios.
- E2E local (`e2e/chino.spec.ts`): simulación y resolvedor idénticos en navegador y Node en 6 semillas; previa, área (`touch-action`, `user-select`), caras, arrastre corto que no gasta el tiro y uno largo que tira; ronda real con los tres vectores calculados en el test (uno con el resolvedor): llega al ranking con el mejor puntaje, el resumen marca un solo mejor, y `check` en Node reproduce la traza.
- E2E en producción (`ronda.spec.ts -g "ronda real"`): ver abajo.
- `/dev/juego/fumate-algo-chino` responde 404 en producción.

## Capturas

- `reports/fumate-algo-chino/previa.png`: la pantalla previa.
- `reports/fumate-algo-chino/apuntando.png`: apuntando, con la banda, el cigarro y la trayectoria parcial.
- `reports/fumate-algo-chino/adentro.png`: "¡adentro! +1000".
- `reports/fumate-algo-chino/ni-cerca.png`: "ni cerca +0".
- `reports/fumate-algo-chino/resumen.png`: el resumen final con el mejor en amarillo.
- `reports/fumate-algo-chino/caras.png`: las cuatro caras de El chino en la herramienta.
