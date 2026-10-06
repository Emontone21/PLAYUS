# Juego nuevo: Nach salta

Publicado en producción (https://playus-lake.vercel.app) el 2026-10-06, deploy `playus-50njbe67m`. Id estable `nach-salta`. Está en el registro activo (entra al mazo), pero no se puso como juego del día de ningún grupo: eso va aparte.

## Qué es

La versión de costado de "Nach y la roca". The Nach corre solo hacia la derecha por una calle de noche con neones, cada vez más rápido (de 9 a 22 m/s a los 90 s):

- **Rocas:** hay que saltarlas. Tocar es un salto corto; mantener, uno alto y largo.
- **Desde los 400 m:** viene lo que está en el aire (un cartel colgado, zapatillas de un cable, una paloma) y hay que agacharse.
- **Chocar** termina la partida. El puntaje son los metros, con la unidad "m" en el ranking.

**Módulo** `src/games/nach-salta/` (decisiones 250 a 253):

- `rules.ts`: la velocidad y la distancia, el salto, los obstáculos, la simulación, la traza, `validate` y el jugador automático;
- `sprites.ts`: lo que está en el aire;
- `draw.ts`, `index.tsx` y `dev.tsx`.

**Reutilización (decisión 250):** The Nach, las rocas y la paleta de la calle con sus neones pasaron a `src/games/lib/nach.ts`. "Nach y la roca" los toma de ahí y se ve igual (sus tests y su E2E siguen en verde). En la misma lib están los sprites nuevos de The Nach de costado, con la misma ropa: 4 cuadros corriendo, salto, agachado y tirado en el piso, más los auriculares que salen volando.

**Control (decisión 251):** dos mitades y no deslizar hacia abajo, para que el salto arranque en el instante de apoyar.

- Antes de los 400 m toda la pantalla salta.
- Desde ahí la izquierda agacha, con las marcas ↓ ↑ y el cartel "¡ahora agachate!".
- Un solo dedo, y arrastrar a la otra mitad cambia de acción.
- En escritorio: flecha arriba o espacio para saltar, flecha abajo para agacharse.

**Física:**

| salto | duración en el aire | altura máxima |
|---|---|---|
| corto (un toque) | 41 ticks | 1,05 m |
| largo (mantener 250 ms) | 57 ticks | 1,86 m |

- El salto corto pasa la roca chica (caja de 0,7 m) y no la grande (1,3 m).
- El largo pasa la grande y el par de chicas.
- Lo que está en el aire empieza a 1,25 m de caja: agachado (1,1 m) pasa por abajo, y ningún salto pasa por encima.

**Justicia:**

- Entre que un obstáculo entra en pantalla y llega a The Nach hay al menos 638 ms, aun a la velocidad máxima.
- Las combinaciones dejan 350 ms entre saltar y agacharse.
- La primera roca no aparece antes de los 2,5 s.
- El jugador automático, con 250 ms de demora, llega a los 1.000 m en al menos el 99 % de 1.000 semillas (en una muestra de 300, en todas).

**Calibración (decisión 252):** el jugador modelo reacciona en 300 ms, se equivoca de tiempo hasta ±4 ticks y salta corto ante una grande o un par el 6 % de las veces. Dura p25/mediana/p75 **33/41/55 s**, con 482 m de mediana. La cota es **2.053 m**, la distancia a los 120 s.

- La primera versión del salto (más brusco) daba 21 s de mediana, por debajo de los 30 a 60 pedidos. Con una gravedad más suave, el salto corto deja más margen y siguen valiendo las reglas de arriba.

**Arte:**

- La calle en capas con paralaje: edificios lejanos, neones en el medio y la vereda con los metros pintados cada 100 m.
- Al chocar, The Nach tropieza, los auriculares salen volando, hay un sacudón y aparece "no denuevo nach".
- Al arrancar, "Nach no caigas en la roca", en Fredoka 700 con contorno, entra con un rebote y se va a los 1,8 s.
- Con `prefers-reduced-motion` el fondo va en una sola capa, la paloma no aletea y no hay sacudón ni rebote.

**Traza:** cada cambio de control (`jump-down`, `jump-up`, `duck-down`, `duck-up`), más el cierre. `validate` vuelve a jugar y rechaza:

- metros distintos de los recalculados;
- eventos mal alternados;
- ticks para atrás, eventos después del cierre y un cierre fuera de rango;
- un cierre que no coincide con la duración del intento.

**Herramienta:** `/dev/juego/nach-salta?seed=…&cajas=1&lento=1&desde=400&auto=1` (solo admin en producción). Tiene las cajas de choque, las curvas de los dos saltos, ×0,25, saltos a 150, 400 y 800 m, el jugador automático con demora configurable y los sprites de costado.

## Comprobaciones

- `vitest`: 16 tests del juego, más el intento de prueba en `attempts.test.ts`. `eslint`, `tsc` y `next build` limpios. Cubren:
  - el determinismo y la velocidad;
  - el salto (el corto pasa la chica y no la grande; el largo, la grande y el par; ningún salto pasa lo del aire, probando todos los despegues);
  - agacharse (pasa todo lo del aire y cae más rápido);
  - en 1.000 semillas: la tabla de obstáculos, nada en el aire antes de los 400 m, 600 ms de reacción, 350 ms en las combinaciones y la primera roca después de los 2,5 s;
  - que vienen más seguidos con la distancia, la justicia, la cota, la calibración, el control, los carteles, que los sprites vienen de la lib sin copias, y `validate` con todos los rechazos.
- **Dos arreglos en `attempts.test.ts`:**
  - El intento de prueba de "hij@ de p\*\*" duraba 60 s, más que el intento simulado (58,5 s), y fallaba cuando el mazo le daba hdp al grupo del test. Ahora se corta a los 58 s.
  - El de "Larry en la hdp" usa un jugador sin errores, para que siempre sume.
- **Dos fallas de la suite que no son de este juego** (quedaron como tareas aparte):
  - `attempts.test.ts` todavía falla a veces cuando al grupo del test le toca "fumate algo chino" (su traza dura más que el intento simulado), y quizás "buscá los Paris" o "pisteando el sunny" (a veces dan 0 puntos).
  - `admin.test.ts` falla en la base local con "URI too long": las corridas repetidas dejaron 457 grupos (431 de tests), y la lista del panel de admin arma una consulta con todos los ids. En producción hay pocos grupos, pero es un límite real del panel. No borré datos de la base local.
- E2E local (`e2e/nach-salta.spec.ts`, 3 en verde; también el de "Nach y la roca"):
  - la simulación da exactamente lo mismo en el navegador y en Node, en 6 semillas;
  - la previa, los sprites, `touch-action`, el cartel de arranque que se va, y que antes de los 400 m la mitad izquierda también salta;
  - en la ronda real, con los ticks de despegue calculados en el test: salta las tres primeras rocas, choca, se ve "no denuevo nach", y llega al ranking con los metros correctos.
- En producción:
  - `/dev/juego/nach-salta` da **404** sin sesión de admin;
  - la ronda real pasa (37 s).
  - **Para correrla:** npx actualizó solo la CLI de Supabase a la 2.120.0, y Windows bloquea su binario nuevo (Control de aplicaciones). El helper del E2E ahora acepta `SUPABASE_CLI`, y la verificación se corrió con `SUPABASE_CLI=supabase@2.119.0` (de la caché de npm, sin descargar nada).

## Capturas

- `reports/nach-salta/previa.png`: la pantalla previa: The Nach corriendo con una roca adelante, y las instrucciones.
- `reports/nach-salta/arranque.png`: el cartel "Nach no caigas en la roca".
- `reports/nach-salta/salto-largo.png`: un salto largo sobre una roca grande.
- `reports/nach-salta/agachate.png`: el cartel "¡ahora agachate!", con las marcas de las dos mitades.
- `reports/nach-salta/agachado.png`: The Nach agachado bajo el cable con zapatillas.
- `reports/nach-salta/final.png`: el final, con "no denuevo nach".
- `reports/nach-salta/sprites.png`: los sprites nuevos de The Nach de costado.
