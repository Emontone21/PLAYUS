# Juego nuevo: Big Bro afila

Publicado en producción (https://playus-lake.vercel.app) el 2026-10-06, deploy `playus-77r520nay`. Id estable `big-bro-afila`. Está en el registro activo (entra al mazo), pero no se puso como juego del día de ningún grupo: eso va aparte.

## Qué es

Arriba gira una horma de queso; cada toque, Big Bro tira una cuchilla que se clava por el punto más bajo. Si choca contra otra (a menos de 9°), se termina. Los ingredientes del borde dan +5; al clavar toda la tanda la horma se parte (+10) y viene otra, más difícil. Cada 5 hormas viene la grande (+25). 120 segundos, aunque casi nadie llega.

- Módulo `src/games/big-bro-afila/` (`rules.ts` hormas, giro, simulación, Big Bro, traza, `validate` y jugador automático; `sprites.ts`; `draw.ts`; `index.tsx`; `dev.tsx`). Decisiones 246 a 249.
- **Simulación:** entera a 60 ticks, con ángulos en décimas de grado (la vuelta son 3.600). La cuchilla vuela 6 ticks y se clava en `(900 − ángulo de la horma) mod 3.600`. A 89 unidades de otra choca; a 90, no. Los ingredientes no bloquean.
- **Hormas:** las cantidades de la tabla, desde la semilla.
  - Las cuchillas ya clavadas, con huecos de 300 o más.
  - Los ingredientes, a 150 o más de cualquier cuchilla.
  - El total ocupa como mucho el 40 % de la vuelta (el tope era el 75 %).
  - El giro va en tramos con una velocidad objetivo y aceleración limitada, sin pasar nunca de 270°/s. La 1 es constante, la 2 y la 3 cambian de velocidad, la 4 cambia de sentido y la grande frena y arranca.
- **Justicia:** el jugador automático que tira cuando un hueco con margen pasa por abajo completa 5 hormas en al menos el 99 % de 1.000 semillas (en una muestra de 300, en todas).
  - La versión literal ("cuando pasa el hueco más grande") se trababa en la horma 4: si la horma va y viene, el centro de ese hueco puede tardar mucho en pasar por abajo. Queda anotado en la decisión 247.
- **Calibración (decisión 248):** con un error de tiempo de ±4 ticks (unos ±67 ms), el jugador modelo llega a la horma **4/5/5** (p25/mediana/p75), con 97 puntos de mediana. Con ±2 ticks llega a la 11 y con ±6, a la 4.
  - La cota es **2.217**: lo más que permite el cronograma de 120 s.
- **Big Bro:** el sprite compartido de `lib/big-bro`, con una pose nueva "tira" (la cara de siempre y los brazos en alto con la cuchilla). Frases, en `LINES`:
  - "Despegado bro", con el pulgar arriba, al partir una horma;
  - "Sos un sopa bro", con la cara roja, al chocar;
  - "¡afilá esa muñeca!" cada tanto, y desde la horma grande también "¡esta es la difícil!".
- **Control:** tocar en cualquier parte, con un solo dedo; en escritorio, clic o la barra espaciadora, que no repite si se mantiene apretada. `touch-action: manipulation`, sin selección ni menú contextual.
- **Arte:**
  - La cocina de la hdp de fondo, atenuada.
  - La horma, con sus cuchillas e ingredientes, se pinta sin rotar en un canvas chico y se gira entera con vecino más cercano, como en "colgado del 121". Las cuchillas clavadas son radiales, píxel por píxel.
  - La grande es más grande y tiene una etiqueta "hdp".
  - Las cuchillas que le quedan a Big Bro van en fila a su izquierda y se apagan.
  - Al partir la horma, salen volando 6 cuñas con sus cuchillas. Al chocar hay chispas, la cuchilla rebota girando y hay un sacudón.
  - Con `prefers-reduced-motion` no hay cuñas, ni chispas, ni sacudón.
- **Traza:** `{ tick }` por tiro, más el cierre. `validate` vuelve a jugar y rechaza:
  - un tiro con otra cuchilla en vuelo, en el cambio de horma o después del choque;
  - ticks fuera de orden o fuera de rango;
  - un puntaje distinto del recalculado;
  - un cierre que no coincide con la duración del intento.
- **Herramienta:** `/dev/juego/big-bro-afila?seed=…&cajas=1&lento=1&auto=1&desde=N` (solo admin en producción). Muestra los ángulos, los márgenes de choque y el rango de los ingredientes; la velocidad de giro de las hormas 1 a 8; tiene ×0,25, saltos a las hormas 1, 4, 5 y 8, y el jugador automático.

## Comprobaciones

- `vitest`: 14 tests del juego, más el intento de prueba en `attempts.test.ts`. Suite completa en verde (392 tests); `eslint`, `tsc` y `next build` limpios. Cubren:
  - el determinismo;
  - la geometría: el ángulo relativo en los dos sentidos y al pasar por 0 / 3.600, y el choque a 89 contra no choque a 90;
  - los ingredientes: +5, desaparece y no bloquea;
  - el puntaje: +1, +5, +10 y +25, y el cambio de horma sin tiros;
  - en 1.000 semillas, la tabla de cantidades, el margen del 75 %, la separación de las cuchillas ya clavadas, los ingredientes despegados de las cuchillas, y la velocidad (máximo, aceleración y forma de cada horma);
  - la justicia, la cota, la calibración, Big Bro y `validate` con todos los rechazos.
- E2E local (`e2e/afila.spec.ts`, 3 en verde):
  - la simulación da exactamente lo mismo en el navegador y en Node, en 6 semillas: hormas y partidas enteras;
  - la previa, la herramienta, `touch-action`, la barra mantenida que tira una sola vez y el toque en el canvas;
  - en la ronda real, con los momentos de tiro calculados en el test a partir del estado de la horma: completa la primera horma, después choca y llega al ranking con el puntaje correcto, y `check` en Node reproduce la traza.
- En producción:
  - `/dev/juego/big-bro-afila` da **404** sin sesión de admin;
  - la ronda real pasa (50 s).

## Capturas

- `reports/big-bro-afila/previa.png`: la pantalla previa: Big Bro con la cuchilla en alto, la horma con dos cuchillas clavadas y un tomate, y las instrucciones.
- `reports/big-bro-afila/mitad-de-tanda.png`: la horma 4 a mitad de tanda, con un ingrediente en el borde y las cuchillas que quedan.
- `reports/big-bro-afila/partiendose.png`: la horma partiéndose en cuñas, con "+10" y "Despegado bro".
- `reports/big-bro-afila/horma-grande.png`: la horma grande, con su etiqueta, tres ingredientes y tres cuchillas ya clavadas.
- `reports/big-bro-afila/choque.png`: el choque: chispas, la cuchilla rebotando y Big Bro rojo con "Sos un sopa bro".
- `reports/big-bro-afila/velocidades.png` y `caras.png`: la velocidad de giro de las hormas 1 a 8, y las caras de Big Bro.
