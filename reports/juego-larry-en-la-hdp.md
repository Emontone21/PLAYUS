# Juego nuevo: Larry en la hdp

Publicado en producción (https://playus-lake.vercel.app) el 2026-10-06, deploy `playus-f1zwm441x`. Id estable `larry-en-la-hdp`. Está en el registro activo (entra al mazo), pero no se puso como juego del día de ningún grupo: eso va aparte.

## Qué es

Larry llega al mostrador de la hdp y pide una hamburguesa. La comanda se ve un instante, se da vuelta, y hay que armarla de memoria tocando los ingredientes en orden, de abajo hacia arriba. Cada hamburguesa bien armada suma 100 más un bonus de rapidez (de 0 a 100); un ingrediente equivocado la tira al tacho en el acto y resta una de 3 vidas. 90 segundos o hasta quedarse sin vidas.

- Módulo `src/games/larry-en-la-hdp/` (`rules.ts` pedidos, máquina de estados, Big Bro, traza, `validate` y jugador automático; `sprites.ts` los 9 ingredientes en ícono y en feta, y el tacho; `draw.ts`; `index.tsx`; `dev.tsx`). Decisiones 242 a 245.
- **Reutilización (decisión 242):** Larry, Big Bro y la cocina de la hdp pasaron a `src/games/lib/` (`larry.ts`, `big-bro.ts` con cinco poses, `hdp-kitchen.ts` con la pared, la campana, el neón, la plancha y la carne). "Los deseos de Larry", "clase con el bro" y "hij@ de p\*\*" los importan de ahí; no queda ninguna copia (un test lo comprueba). La carne de la bandeja es la de la plancha de hdp, y las vidas son las hamburguesitas de "los deseos de Larry".
- **Pedidos:** `larryOrders(semilla)` da 40 pedidos: pan, las capas del medio al azar entre los otros 8, y pan; nunca tres iguales seguidos. Las capas del medio van de 2 a 7 y el tiempo a la vista, de 3 s a 1,5 s, según la tabla.
- **Tiempos:** sin ticks. Una máquina de estados en ms (comanda a la vista → armando → comiendo 600 ms o al tacho 800 ms → pedido siguiente), la misma en el cliente y en `validate`.
- **Puntaje:** `100 + 100 × (1 − armado / (capas × 1.200 ms))`, sin bajar de 0 y redondeado (5 capas en 3 s: 150). La cota es **5.630**: lo que hace el jugador perfecto, siempre igual porque las capas y los tiempos no dependen de la semilla.
- **Calibración (decisión 244):** el jugador modelo arma **8/11/12** hamburguesas (p25/mediana/p75), con 1.695 puntos de mediana. Reacciona entre 0,5 y 0,9 s, deja 380–650 ms entre toques y se acuerda mal un 1 % de cada capa del medio por capa del medio del pedido. El lento arma 8, el rápido 14 y el perfecto 29. La tabla del documento no se tocó.
- **Big Bro:** "atendé a Larry, asistente" al empezar, "eso, así se labura" con 3 seguidas, "¿me estás jodiendo?" al errar y "¡dale que hay cola!" desde los 60 s, cada una con su pose. Larry pone cara normal, feliz comiendo, asco al errar y bajón sin vidas; a los 10 s armando la misma dice "¿y mi hamburguesa, bro?". Las frases están en `LINES`.
- **Control:** bandeja de 3 × 3 con botones de 96 px o más, un solo dedo y 80 ms mínimos entre toques. Mientras se ve la comanda o en las pausas, la bandeja se ve atenuada y no responde. `touch-action: manipulation`, sin selección ni menú contextual.
- **Arte:**
  - La comanda es un papelito con borde dentado que ocupa la escena y la bandeja mientras se ve, y después se da vuelta y muestra el dorso con "hdp".
  - La hamburguesa crece feta por feta en la plancha, con un contador "N de M".
  - Bien: Larry se la come y salta "+N". Error: lo armado cae al tacho.
  - Con `prefers-reduced-motion` no hay caída, ni giro, ni salto de puntaje.
- **Traza:** `{ t, ingredient }` por toque. `validate` rearma los pedidos y vuelve a jugar. Rechaza:
  - un puntaje distinto del recalculado;
  - toques con la comanda a la vista o en las pausas, o después de la tercera vida;
  - intervalos de menos de 80 ms, tiempos fuera de orden o después de 90,5 s;
  - ingredientes que no existen;
  - un último toque posterior a la duración del intento.
- **Herramienta:** `/dev/juego/larry-en-la-hdp?seed=…&desde=N` (solo admin en producción). Muestra los 40 pedidos con capas y tiempos, salta a los pedidos 1, 5, 10 y 15, y tiene los íconos en grande y en tamaño de botón, las caras de Larry y las frases de Big Bro.

## Comprobaciones

- `vitest`: 14 tests del juego, más el intento de prueba en `attempts.test.ts`. Suite completa en verde (378 tests); `eslint`, `tsc` y `next build` limpios. Cubren:
  - el determinismo de los pedidos;
  - en 1.000 semillas: pan en las dos puntas, nunca tres iguales seguidos, la tabla de capas y tiempos, y los 8 ingredientes del medio entre el 11 % y el 14 % cada uno;
  - el puntaje: 150, 100 sin bonus y 0 con un error;
  - las reglas: comer y pedido siguiente a los 600 ms, error al tacho en el acto con una vida menos, tres errores terminan, la bandeja no responde con la comanda a la vista, y la paciencia de Larry no corta la hamburguesa;
  - las frases de Big Bro, `validate` con todos los rechazos, la cota, la calibración, las medidas de los sprites y la reutilización.
- E2E local (`e2e/larry-hdp.spec.ts`, 3 en verde):
  - los pedidos y partidas enteras dan exactamente lo mismo en el navegador y en Node, en 6 semillas;
  - la previa, la herramienta, `touch-action` y los botones de 96 px; la bandeja no responde con la comanda a la vista; el dorso, el contador "2 de 4" y un error con el tacho, la vida apagada y Big Bro quejándose;
  - en la ronda real, con los pedidos tomados de `larryOrders` en el test: tres bien y tres errores llegan al ranking con el puntaje correcto, y `check` en Node reproduce la traza.
- También en verde, después de la mudanza a `lib/`: los E2E de "hij@ de p\*\*" y "clase con el bro".
- En producción:
  - `/dev/juego/larry-en-la-hdp` da **404** sin sesión de admin;
  - la ronda real de Larry en la hdp pasa (58 s) y la de "hij@ de p\*\*" también (1,4 min).

## Capturas

- `reports/larry-en-la-hdp/previa.png`: la pantalla previa: Larry en el mostrador con una comanda de ejemplo, la bandeja y las instrucciones.
- `reports/larry-en-la-hdp/comanda.png`: una comanda a la vista, con la bandeja atenuada.
- `reports/larry-en-la-hdp/medio-armar.png`: una hamburguesa a medio armar ("4 de 6") con el dorso de la comanda.
- `reports/larry-en-la-hdp/tacho.png`: un error, la hamburguesa cayendo al tacho, Larry con asco, una vida apagada y Big Bro con "¿me estás jodiendo?".
- `reports/larry-en-la-hdp/comiendo.png`: Larry comiendo, con "+150" y Big Bro con el pulgar arriba.
- `reports/larry-en-la-hdp/ingredientes.png` y `caras.png`: los 9 ingredientes en grande y en tamaño de botón, y las cuatro caras de Larry.
