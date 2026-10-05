# Juego nuevo: hij@ de p\*\*

Publicado en producción (https://playus-lake.vercel.app) el 2026-10-05, deploy `playus-crab2s9i2`. Id estable `hdp`. Está en el registro activo (entra al mazo), pero no se puso como juego del día de ningún grupo: eso va aparte.

## Qué es

El jugador es asistente en hdp, la hamburguesería de Big Bro ("hamburguesas hijas de remil puta"). En la plancha hay 4 hamburguesas en 2 × 2; cuando una está a punto aparece una flecha y hay que deslizar sobre ella hacia ese lado antes de que se queme. Cada vuelta bien dada suma 1; si se quema no suma y aparece otra cruda; la dirección equivocada no penaliza. 60 segundos, gana el que más dio vuelta.

- Módulo `src/games/hdp/` (`rules.ts` simulación, Big Bro, traza, `validate` y jugador automático; `sprites.ts`; `draw.ts`; `index.tsx`; `dev.tsx`). Decisiones 239 a 241.
- Simulación entera a 60 ticks, igual en el navegador y en Node, con un generador por lugar desde la semilla del intento. Ciclo: cocinándose → a punto (flecha y ventana) → vuelta (otra cara) o quemada (600 ms carbonizada); después de las dos caras se sirve (se desliza fuera) y aparece una cruda.
- Justicia: dos flechas nunca a menos de 350 ms (se corre la que choca), ventana nunca menor a 1 s, arranque desfasado 600 ms por lugar. Comprobado en 1.000 semillas.
- Dirección equivocada: no suma ni quema, pero bloquea esa hamburguesa 350 ms (solo esa), para que deslizar en las cuatro direcciones a lo loco no sirva (decisión 239).
- Calibración (decisión 240): la ventana es la de la tabla (1,5 → 1,0 s). Primero se alargaron las cocciones (4–6 s al arrancar; mediana 37), pero el dueño lo encontró demasiado fácil y se volvió a la tabla original: **2,5–4 s** al arrancar, **1,8–3 s** a los 20 s, **1,2–2,2 s** a los 40 s y **0,9–1,6 s** a los 60 s. Jugador modelo (reacción 0,6–1 s, 600 ms entre deslizamientos, 20 % de errores): p25/mediana/p75 **46/49/52**, 20 quemadas de mediana, se le quema alguna antes de los 20 s en 58 de 60 semillas; lento 27, rápido 83, perfecto hasta ~105.
- Big Bro: el mismo sprite de clase con el bro, más dos poses nuevas armadas con sus piezas: "grita" (rojo, señalando la plancha) para "¡¡LA VUELTAAA!!" y "enojado" (rojo, brazos cruzados) para "¿me estás jodiendo?". Pulgar arriba con 5 seguidas. Las frases están en `LINES` y salen del estado y la semilla.
- Control: un dedo; donde se apoya elige el cuadrante; a los 30 px en el eje dominante sale el deslizamiento. `touch-action: none`, sin selección ni menú contextual; con mouse vale el arrastre.
- Arte: canvas de 144 × 184 escalado entero; pared de azulejos, cartel de neón "hdp" (con letras propias: la p cuelga) y el nombre completo, campana, Big Bro asomado con su globo, y la plancha en la mitad de abajo. Hamburguesa, flecha, espátula y humo al doble, para que se lean en un teléfono. La barrita pasa a `--lengua` y sale humito en el último 30 %. Respeta `prefers-reduced-motion`.
- Traza `{ tick, slot, dir }` por deslizamiento (también los equivocados) más el cierre; `validate` vuelve a jugar y rechaza vueltas infladas, ticks fuera de orden, `slot`/`dir` inválidos, deslizamientos a menos de 60 ms, ticks después del fin y un fin incoherente con la duración del intento.
- Herramienta `/dev/juego/hdp?seed=…&cajas=1&lento=1&desde=N` (solo admin en producción): barra de tiempo por lugar, cuadrantes, ×0,25, saltos a 20, 40 y 55 s, los estados de la hamburguesa, las flechas y las cuatro caras.
- Lo que encontré a medio hacer de la sesión anterior y cambié: la calibración (daba 49), dos tests que fallaban, la pose de "¡¡LA VUELTAAA!!" (era la de la cuchilla), el tamaño de la plancha y las hamburguesas (se veían chicas), la "p" del cartel y la cara del resultado.

## Comprobaciones

- `vitest`: 13 tests del juego (determinismo; el ciclo completo con vuelta, segunda cara, servida y cruda nueva; quemada; reglas de vuelta, dirección equivocada con bloqueo por lugar y deslizar sin flecha; control; tabla, separación de 350 ms y ventana mínima en 1.000 semillas; superposición creciente; cota; calibración; frases de Big Bro; `validate` con todos los rechazos; sprites), más el intento de prueba en `attempts.test.ts`. Suite completa en verde (364 tests); `eslint`, `tsc` y `next build` limpios.
- E2E local (`e2e/hdp.spec.ts`, 3 en verde): la simulación da exactamente lo mismo en el navegador y en Node en 6 semillas (partidas enteras, estado final, cronograma y frases); previa, caras y estados, `touch-action` y `user-select`, un deslizamiento en la dirección equivocada que no suma y la correcta después sí; ronda real que da vuelta las primeras, deja quemar alguna, llega al ranking con el puntaje correcto y `check` en Node reproduce la traza enviada.
- En producción: `/dev/juego/hdp` da **404** (sin sesión de admin). `E2E_BASE_URL=https://playus-lake.vercel.app npx playwright test e2e/hdp.spec.ts -g "ronda real"`: en verde (1,7 min), con un grupo nuevo de prueba.

## Capturas

- `reports/hdp/previa.png`: la pantalla previa (Big Bro "¿estás listo, asistente?", la hamburguesa con su flecha y el dedo deslizando, instrucciones).
- `reports/hdp/dos-flechas.png`: la plancha con dos flechas a la vez.
- `reports/hdp/por-quemarse.png`: una por quemarse (barrita roja, humito) con Big Bro gritando y señalando.
- `reports/hdp/quemada.png`: una quemada, con humo y "¿me estás jodiendo?".
- `reports/hdp/cartel.png`: el cartel de neón "hdp".
- `reports/hdp/resultado.png`, `caras.png` y `estados.png`: el resultado, las cuatro caras de Big Bro y los estados de la hamburguesa y las flechas.
