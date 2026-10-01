# Reporte: la mayo
Estado: completo y publicado
Fecha: 2026-10-01

## Qué hice

- **Simulación** (`src/games/la-mayo/rules.ts`): entera, a 60 ticks, compartida por cliente y servidor. La barra de 1.000 unidades, la zona centrada en 500 que baja de 120 a 50 de ancho a los 60 s (interpolada con enteros, bordes incluidos, evaluada en el tick del toque), la barrita a velocidad constante por pasada con rebote, velocidad del cronograma en cada arranque con ±8 % de variación por semilla, congelamiento de 400 ms tras cada toque y arranque desde un extremo sorteado. Tres vidas, 60 s, fin anticipado al perder la tercera (Remar enojado un segundo y `onFinish`). Traza `{ tick }` más el cierre, y `check`/`validate` con todas las reglas pedidas (decisión 218).
- **Calibración** (decisión 219): el cronograma del documento dejaba sin vidas a un jugador de ±50 ms a los 22 s; quedó en una pasada de 1,6 s al arrancar y 0,6 s a los 60 s. El jugador modelo emboca 15 (13 a 17) y pierde las vidas a los 35 s; el fino, 22 a los 46 s; el cauto, 11 a los 40 s.
- **Arte** (`sprites.ts`, `draw.ts`): Remar reutilizado del bote de remar (misma gorra, remera y paleta), redibujado de frente con tres caras; la mesa, el plato con papas, el tubo con degradé "poca" a "mucha", la zona en `--luciernaga` que se achica a la vista con la leyenda "punto justo", el pomo que se desliza; chorro, hilito o pegote según el toque; globo con "¡eso!" / "punto justo" o "no seas sopa"; HUD con "N embocadas" y los tres pomitos; previa con Remar, la barra y las instrucciones; resultado con Remar enojado o contento con el plato lleno; `prefers-reduced-motion` sin chorro animado ni sacudón (decisión 220).
- **Control**: tocar en cualquier parte, un solo dedo, clic y barra espaciadora sin repetir, `touch-action: manipulation`.
- **Herramienta** (`/dev/juego/la-mayo`): posición, velocidad y zona; cámara lenta; saltos a 15, 30 y 50 s; las tres caras; `window.__mayo` para el E2E.

## Archivos

- nuevos: `src/games/la-mayo/{rules,sprites,draw}.ts`, `index.tsx`, `dev.tsx`, `rules.test.ts`; `e2e/mayo.spec.ts`, `e2e/helpers/mayo.ts`; `reports/la-mayo/*.png`.
- modificados: `src/games/index.ts` (registro), `src/games/lib/font.ts` (letras a, j, n, o, p, u), `src/games/README.md`, `src/app/dev/juego/[id]/page.tsx`, `src/lib/attempts.test.ts` (resultado válido), `e2e/ronda.spec.ts`, `e2e/helpers/group.ts` (el id del juego), `DECISIONS.md` (218 a 220).

## Tests

- `src/games/la-mayo/rules.test.ts` (17): determinismo (sin `Math.sin`/`cos`/`random`; misma semilla y traza, mismo resultado; replay igual); la barrita rebota y no se sale, la velocidad sube parejo según el cronograma (1,6 s a 0,6 s por pasada), la variación queda en ±8 % (al arrancar y después de cada toque), se congela 400 ms y arranca desde un extremo (de los dos lados); la zona (440/560 adentro y 439/561 afuera al arrancar; 475/525 y 474/526 a los 60 s; baja parejo y nunca crece; un punto que es acierto al principio y error después); las reglas (embocar suma, errar resta, no tocar no penaliza, tres errores terminan en ese tick, los toques congelados se ignoran); `validate` (acepta partidas reales con su duración; rechaza embocadas infladas, toque congelado, ticks fuera de orden, toques después de la tercera vida, otra semilla, fin incoherente y una partida cortada por tiempo con toques en el cierre); la calibración; el arte y las frases.
- `e2e/mayo.spec.ts`: la simulación da exactamente lo mismo en el navegador y en Node (6 semillas, traza, puntaje, vidas, tick de fin y estado final); la previa, el área (`touch-action`, sin selección), las caras en la herramienta y la barra espaciadora mantenida que cuenta un solo toque; en una ronda real, tres embocadas con los ticks calculados en el test y tres errores ("no seas sopa") llegan al ranking con 3, y la traza que mandó a `/finish` se rearma en Node con 3.
- `npm test`: 283 de 283 (25 archivos). `typecheck`, `lint` y `npm run build`: limpios.

## Capturas

En `reports/la-mayo/`: `previa.png` (la pantalla previa con la herramienta y las caras), `embocada.png` (el chorro cayendo y "¡eso!"), `error.png` (el pomo en "poca", Remar rojo y "no seas sopa"), `final-vidas.png` (el final por vidas) y `resultado.png` (la pantalla de resultado).

## Publicación

Publicado en https://playus-lake.vercel.app (commit `c2f2615`). Comprobado en producción con el E2E de la ronda real contra producción (un grupo de prueba con la mayo como juego de hoy): tres embocadas y tres errores llegan al ranking con 3, y `/dev/juego/la-mayo` da 404.

## Cómo verificarlo

1. Hoy, con la mayo como juego del día: tocar frena el pomo; en la zona amarilla suma y Remar dice "¡eso!"; afuera, "no seas sopa" y se apaga un pomito. A los tres errores, Remar enojado y el resultado.
2. En local: `http://localhost:3000/dev/juego/la-mayo?seed=abc&datos=1` (y `&lento=1`, `&desde=30`); `npx vitest run src/games/la-mayo`; `npx playwright test e2e/mayo.spec.ts`.

## Problemas y deuda

- El toque se aplica en el cuadro siguiente al evento (hasta 16 ms después): es el mismo criterio que en los otros juegos de acción y entra de sobra en la zona.
- El cronograma de velocidad quedó más lento que el del documento (0,6 s por pasada a los 60 s en vez de 0,35) para cumplir la calibración pedida; si se quiere más exigente, es tocar `PASS_TICKS_END` y volver a correr el test de calibración.
