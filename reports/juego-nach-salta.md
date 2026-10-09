# Juego nuevo: Nach salta

Publicado en producción (https://playus-lake.vercel.app) el 2026-10-06, deploy `playus-50njbe67m`. Id estable `nach-salta`. Está en el registro activo (entra al mazo) y, a pedido del dueño, es el juego de hoy (2026-10-06) en todos los grupos de producción.

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

## Juego de hoy en producción

Se puso "Nach salta" como juego de hoy (2026-10-06, hora de Montevideo) en los 10 grupos de producción, con el mismo procedimiento que el panel de admin (decisión 237): `admin_set_today_game` por grupo, con la temporada vigente, la fecha de hoy del grupo y la semilla `hash(round:<grupo>:<fecha>:nach-salta)` calculada con `roundSeed`. Antes se comprobó la fórmula contra tres rondas existentes: dio igual. Cada llamada, en su transacción, borró los intentos de hoy de ese grupo (4 en total, todos de pruebas), creó la ronda donde no existía (2 grupos) y dejó registro en `admin_actions`. Comprobado después: los 10 grupos tienen `nach-salta` hoy, con 0 intentos, y hay 10 registros nuevos.

## Deuda

- `src/lib/attempts.test.ts` falla de forma intermitente según qué juego le asigna el mazo al grupo del test: las trazas de prueba de "fumate algo chino" (dura más que el intento simulado) y, a veces, "buscá los Paris" o "pisteando el sunny" (puntaje 0). No es de "Nach salta"; quedó como tarea aparte.
- `src/lib/admin.test.ts` falla en la base local con "URI too long": la lista de grupos del panel de admin arma una consulta con todos los ids, y la base local tiene unos 450 grupos de tests. Es un límite real del panel con muchos grupos; quedó como tarea aparte.

## Cambios del 2026-10-09: más difícil y de borde a borde

Pedido del dueño: estaba muy fácil y la pantalla quedó chica. Decisiones 276 y 277.

- **Velocidad continua, sin mesetas:** 10 m/s al arrancar, 20 a los 30 s, 28 a los 60 s y después despacio hasta 32 m/s a los 120 s (antes 9 → 22 a los 90 s). Cota: 2.966 m.
- **Espacio entre obstáculos al azar con mínimo según la velocidad:** cada grupo se ubica por el tick en que llega, nunca antes del tiempo de reacción (600 ms a 10 m/s bajando a 450 ms desde los 28 m/s) ni antes de que termine el salto por el anterior (desde el despegue más tardío que lo pasa) más el despegue que pide este; lo alto nunca con un salto en el aire, y nada que haga despegar debajo de lo alto. Más un extra al azar de 0–40 ticks que baja a 0–14 a velocidad alta.
- **Grupos de 2 o 3 rocas juntas, de distinto tamaño, desde los 150 m**, mientras el salto largo las pase enteras a la velocidad del momento. Reemplazan al par de antes.
- **Lo del aire desde los 300 m (antes 400), a tres alturas:** bajo (se salta como a una chica), a la altura de la cabeza (hay que agacharse) y alto (no molesta parado ni agachado; saltando debajo, choca). Las dos mitades y "¡ahora agachate!" pasan a los 300 m.
- **Justicia:** el jugador automático con 250 ms llega a los 600 m en 1.000 de 1.000 semillas; el perfecto nunca choca en 200: no hay combinaciones imposibles a la velocidad del momento (el test de generación comprueba cada condición de espacio en 1.000 semillas).
- **Calibración:** el jugador modelo dura p25/mediana/p75 21/28/38 s (antes 33/41/55), 408 m de mediana. Los carteles "Nach no caigas en la roca" y "no denuevo nach" siguen igual, y la primera roca sigue sin aparecer antes de los 2,5 s.
- **De borde a borde:** el contrato suma `fullBleed?: boolean` (el contenedor le saca al área los márgenes laterales de la página; el cronómetro y los carteles quedan donde están), documentado en el README junto al `fullscreen` de "Saca el Sunny". Nach salta lo declara: el canvas se escala al ancho con fracción, la vista pasa a 240 × 160 unidades con The Nach a un 20 % del borde (19,2 m de calle adelante), el piso más abajo y más cielo arriba. En 360 px el canvas mide 360 × 240; en escritorio sigue en la columna de 480.
- Comprobado: suite completa, `eslint`, `tsc` y `next build` limpios; E2E local de Nach salta en verde (3 tests); en 360 px el canvas arranca en x = 0 y mide 360 px de ancho.
- Capturas: `reports/nach-salta/nuevo-10s.png`, `nuevo-30s.png` y `nuevo-60s.png` (el jugador automático perfecto a los 10, 30 y 60 s) y `borde-a-borde-360.png` (la ronda real en un teléfono de 360 px).
- Publicación: como cambia `simulate`, una partida empezada antes no validaría; el plan era publicar pasada la medianoche, pero el usuario pidió publicar en el día. Publicado el 2026-10-09 a la tarde (deploy `playus-6ib55i0v7`): `/dev/juego/nach-salta` da 404 en producción y el E2E de la ronda real en producción pasó (37 s). Juego de hoy puesto con `admin_set_today_game` en los 2 grupos de producción (2 rondas cambiadas, 3 intentos de prueba borrados); verificado en la base: todas las rondas de hoy con `nach-salta`.

## Capturas

- `reports/nach-salta/previa.png`: la pantalla previa: The Nach corriendo con una roca adelante, y las instrucciones.
- `reports/nach-salta/arranque.png`: el cartel "Nach no caigas en la roca".
- `reports/nach-salta/salto-largo.png`: un salto largo sobre una roca grande.
- `reports/nach-salta/agachate.png`: el cartel "¡ahora agachate!", con las marcas de las dos mitades.
- `reports/nach-salta/agachado.png`: The Nach agachado bajo el cable con zapatillas.
- `reports/nach-salta/final.png`: el final, con "no denuevo nach".
- `reports/nach-salta/sprites.png`: los sprites nuevos de The Nach de costado.
