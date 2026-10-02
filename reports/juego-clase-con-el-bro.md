# Juego nuevo: clase con el bro

Publicado en producción (https://playus-lake.vercel.app) el 2026-10-02. Durante el desarrollo se llamó "cortalo parejo"; el nombre definitivo es "clase con el bro" y el `id` estable, `clase-con-el-bro`.

## Qué es

Big Bro, un chef grandote, pone una comida de forma irregular sobre la mesa y hay que cortarla en dos partes iguales con un solo deslizamiento recto. Son 3 cortes (irregularidad baja, media y alta), cada uno vale de 0 a 1.000 según qué tan parejas quedan las partes, y el total es la suma. Si el corte es bueno (850 o más), Big Bro dice "Despegado"; si no, se enoja: "Sos un sopa bro".

- Módulo `src/games/clase-con-el-bro/` (`shapes.ts` las seis formas y la rotación entera, `rules.ts` geometría exacta, objetos, puntaje, resolvedor, traza y `validate`, `sprites.ts`, `draw.ts`, `index.tsx`, `dev.tsx`).
- Sin simulación por ticks: geometría exacta con enteros y `BigInt` (áreas dobladas, cruces racionales), igual en el navegador y en Node. Decisiones 233 a 235.
- Puntaje: 1000 − 40 × (% del lado mayor − 50): 50/50 1.000, 52/48 920, 60/40 600, 75/25 o peor 0. Umbral de "Despegado" en 850.
- Justicia: el resolvedor encuentra una recta 50/50 (puntaje 1.000) para los 3 objetos de 1.000 semillas.
- Calibración (jugador automático con la recta corrida en paralelo): 1 % de la mesa ≈ 2.790; 2,5 % ≈ 2.480; 5 % ≈ 1.970; perfecto 3.000.
- Traza `{ cut, t, x1, y1, x2, y2 }`; `validate` vuelve a cortar los objetos de la semilla y rechaza total inflado, corte que no toca, corto, de más, fuera de orden, en la pausa, tiempos que no crecen o fuera de rango.
- Control: un dedo, línea punteada mientras se arrastra, se puede apoyar fuera del objeto, menos de 40 px no cuenta; pausa de 1,5 s entre cortes.
- Herramienta `/dev/juego/clase-con-el-bro?seed=…&vertices=1&resolver=1&areas=1&desde=N` (404 en producción): vértices, recta 50/50, áreas al arrastrar, salto a cualquier corte, las tres caras y las seis formas.
- `tsconfig` pasó a `target: ES2020` por los literales `BigInt`.

## Comprobaciones

- `vitest`: 12 tests del juego (determinismo y sin trigonometría en tiempo de ejecución, formas simples con área conocida, cuadrado 50/50 y 60/40, forma cóncava en tres pedazos, recta que no toca o roza, tabla de puntajes, reacción, objetos por nivel sin repetir con rotación y escala en rango y polígonos simples en 1.000 semillas, justicia en 1.000 semillas, partida y pausa, calibración, `validate` con todos los rechazos), más el intento de prueba en `attempts.test.ts`. Suite completa en verde; `eslint`, `tsc` y `next build` limpios.
- E2E local (`e2e/clase.spec.ts`): geometría idéntica en navegador y Node en 6 semillas (áreas de las formas, objetos, rectas del resolvedor, partidas con sus fracciones); previa, caras, formas, área (`touch-action`, `user-select`), un corte que no toca no gasta, la línea y las áreas al arrastrar, la reacción y los porcentajes; ronda real con las tres rectas del resolvedor corridas (calculadas en el test): llega al ranking con el total, el resumen muestra los 3 cortes y `check` en Node reproduce la traza.
- E2E en producción (`E2E_BASE_URL=https://playus-lake.vercel.app npx playwright test e2e/clase.spec.ts -g "ronda real"`): en verde (39 s): grupo nuevo con el juego del día puesto en la base, tres cortes con las rectas del resolvedor corridas, total en el ranking y traza reproducida en Node. Deploy `playus-le6xpbneq`.

## Capturas

- `reports/clase-con-el-bro/previa.png`: la pantalla previa.
- `reports/clase-con-el-bro/trazando.png`: un corte trazándose, con la recta punteada.
- `reports/clase-con-el-bro/despegado.png`: "Despegado" con los porcentajes sobre cada parte.
- `reports/clase-con-el-bro/sopa-bro.png`: "Sos un sopa bro".
- `reports/clase-con-el-bro/resumen.png`: el resumen final.
- `reports/clase-con-el-bro/caras.png` y `formas.png`: las tres caras de Big Bro y las seis formas, en la herramienta.
