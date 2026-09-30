# Reporte: noveno juego real, "pisteando el sunny"
Estado: parcial
Fecha: 2026-09-30

## Segunda versión: ruta en zigzag y 3D low-poly

El mismo día cambió la forma de la ruta y la estética (decisiones 185 a 190). Lo que no cambió: id, duración, unidad, la física del derrape, el control, la traza y `validate`, la caída con margen de medio auto y el conductor automático como garantía.

- **La ruta en zigzag.** Tramos rectos unidos por esquinas en ángulo: rectas de 60 a 30 m, esquinas de 30° al arrancar a 110° pedidos a los 3.000 m, zigzags encadenados cada vez más seguidos, ningún tramo a más de 70° de la vertical. La losa son cuadriláteros por tramo con las puntas en el bisector de cada esquina: piso continuo, la esquina en punta del lado de afuera, y "¿está sobre la ruta?" es punto en cuadrilátero (el tramo y sus dos vecinos), que funciona justo en la punta. El eje es la poligonal de esquinas; los metros son el máximo de la proyección: cortar una esquina no retrocede.
- **Justicia.** Cada esquina nace acotada por lo que el auto puede doblar a la velocidad que trae ahí, y los tramos con el largo que pide el radio de giro; encima, si el conductor automático se cae, esa esquina se achica y el tramo anterior se alarga. En 1.000 semillas no hizo falta ningún ajuste (el test lo exige). Las esquinas llegan a 100° entre los 2.000 y 3.000 m y quedan en 86° a 140 km/h: los 110° son el techo pedido, no el alcanzado.
- **Calibración nueva** (188): giro 12 direcciones por tick, tope de giro del movimiento 12 → 11, agarre 110 − 60·velocidad − 20·calor con piso 16. Radio de giro 3,8 m a 60 km/h y 9,6 m a 140. El derrape necesario a 140 km/h: 20° de deslizamiento (33° con el giro caliente). Conductor automático: derrapa hasta 60 direcciones, completa las 1.000 rutas. Jugadores simulados con 100 a 200 ms de reacción: 24 a 60 s. Un jugador que no dobla se cae a los 3 s.
- **3D low-poly con `three`** (189): cámara en perspectiva fija en diagonal que sigue al auto sin girar; cielo con degradé azul (CSS detrás del canvas transparente) y niebla del color del cielo; la ruta como losa gruesa color pizarra con el costado visible, líneas y carteles de metros; el sunny como autito de juguete rojo de tres volúmenes con el baúl marcado, ruedas gorditas, faros y luces, sin logos; al derrapar la carrocería se inclina, marcas de goma y humo low-poly; la caída con el auto cayendo y girando al vacío. Con `prefers-reduced-motion`: sin humo, sin inclinación, cámara sin suavizado. `devicePixelRatio` con tope 2 y todo liberado al desmontar. La previa: el sunny girando despacio sobre un pedazo de losa. El HUD: metros grandes arriba al centro en Fredoka 700 blanca con contorno, el velocímetro debajo.
- **`three` solo en este juego** (190): `scene.ts` es el único archivo que lo importa; el juego y la herramienta lo cargan con `import()`. Un test recorre `src/` y lo comprueba, y en el build de producción `three` queda en dos chunks aparte (350 KB la escena, 210 KB el visor con OrbitControls) que solo referencia el runtime de webpack: ninguna ruta los carga hasta que empieza la partida. **"¡récord tuyo!" quedó afuera:** el juego solo recibe la semilla y no puede saber la mejor marca del día sin salirse del contrato.
- **Herramienta:** eje, límite de caída y vectores como líneas sobre la losa; el visor 3D del modelo con cámara libre reemplaza a las rotaciones.
- **El documento actualizado** (`PROMPT-PISTEANDO-EL-SUNNY.md`) no estaba en el repo ni en la carpeta del proyecto; se siguió el documento de cambios, que manda.
- **Capturas nuevas** en `reports/pisteando-el-sunny/`: `previa.png` (el sunny girando sobre la losa, y abajo el visor 3D), `derrape-500m.png` (a los 515 m en una esquina, en cámara lenta: la carrocería inclinada, las marcas de goma y el humo), `zigzag-2000m.png` (un zigzag encadenado a los 1.900 m), `caida.png` (el auto cayendo al vacío con el cartel) y `resultado.png`.
- **Tests:** `rules.test.ts` reescrito: fuera los de curvas suaves y sprites; en 1.000 semillas, tramos dentro de 70°, giros entre 30° y 110° acotados por la capacidad del auto, piso continuo en todas las esquinas, la prueba de ruta correcta en la punta de afuera (y falsa 3 unidades más allá del margen), el eje que nunca retrocede y el conductor automático 120 s sin caerse; se mantienen el determinismo, la tabla sin `Math.sin`, las reglas de derrape y los casos de `validate`; nuevo `bundle.test.ts` para el aislamiento de `three`. `npm test`: 202 de 202 (en una corrida completa falló una vez el test de intentos contra la base local, que pasa solo y volvió a pasar: es el que comparte la base local con otros). E2E: `e2e/sunny.spec.ts` 3 de 3 y `e2e/ronda.spec.ts` en local con el 3D. `npm run build`, `typecheck` y `lint` limpios.
- **Publicación:** publicada en el día por decisión del usuario (191): se anuló la sección 4 porque los datos de producción son de prueba. `scripts/sunny-gate.ts AAAA-MM-DD` queda para comprobar, cuando haga falta, qué grupos tendrían el sunny un día dado (para el 1 de octubre eran 5). Producción: la ronda real de `e2e/sunny.spec.ts` contra https://playus-lake.vercel.app pasó con el 3D (dos jugadores, los metros validados llegan al ranking); `/dev/juego/pisteando-el-sunny` da 404 allá.

Lo que sigue es el reporte de la primera versión, que vale para todo lo que no cambió.

## Qué hice

El noveno juego real está construido, probado y publicado en **https://playus-lake.vercel.app**. Desde la próxima ronda, el mazo de cada grupo reparte los nueve juegos; la ronda de hoy no cambia. El estado es parcial por lo de siempre: "se juega cómodo con un pulgar", "el derrape se siente, es necesario y se puede controlar" y "la ruta da vértigo" piden un teléfono de verdad. Todo lo demás está hecho y verificado, incluida una partida en producción.

**El juego.** Un Nissan Sunny acelera solo (de 60 a 140 km/h en 90 s) por una ruta llena de curvas que flota en el vacío. Se dobla manteniendo apretada la mitad izquierda o derecha de la pantalla (o las flechas). A velocidad derrapa: la trompa gira pero el auto sigue deslizando un rato para donde venía. Si el centro sale de la ruta más allá de medio auto, "¡se fue el sunny!" y se termina. La ruta se angosta (de 5 a 2,5 anchos de auto a los 3.000 m) y las curvas se cierran y se encadenan en eses. El puntaje son los metros por el eje de la ruta; a los 120 s corta el contenedor.

**Simulación (`rules.ts`, `trig.ts`, decisiones 179 a 182).** Todo entero: posiciones en subunidades, rumbos de 0 a 1023 y seno y coseno de una tabla de 1.024 enteros guardada como constante; un test lee el código y comprueba que no hay Math.sin ni Math.cos en la simulación. Un tick: el rumbo gira 4 direcciones si se aprieta (sin separarse más de 45° del movimiento), el calor del giro sube o baja, el agarre se calcula con la velocidad y el calor, la dirección de movimiento sigue al rumbo con ese agarre (y con un tope de giro por tick que baja con la velocidad), el auto avanza, se busca el metro del eje más cercano y la distancia lateral, y se decide la caída. Valores finales: giro 4/tick, agarre 110 − 90·velocidad − 40·calor con piso 8 (Q8), tope de giro del movimiento 4 → 3 por tick, deslizamiento máximo 128. Radio mínimo del auto: 11 m a 60 km/h, 35 m a 140.

**La ruta (decisión 181).** Rectas y curvas de la semilla muestreadas cada metro: radio mínimo 50 m al arrancar y 40 a los 3.000 (por 1 a 1,7), rectas de 70 a 20 m, eses del 15 % al 70 %. Nunca gira más de 75° respecto de la vertical y siempre sube. **Garantía de justicia:** la generación corre el conductor automático y, si se cae, abre los radios un 20 % y vuelve a generar (en el cliente y en el servidor por igual). En 1.000 semillas nunca hizo falta.

**Conductor automático.** Apunta la trompa a un punto del eje 10 a 34 m adelante (según la velocidad), con el rumbo corregido por la mitad de lo que ya desliza y una zona muerta de 6 direcciones; el mismo control de tres estados. Completa los 120 s en las 1.000 semillas con 3.700 m, derrapando hasta 15° en las curvas cerradas.

**Control y traza (decisión 183).** Un dedo: la mitad donde apoya manda mientras está apretado, y si se arrastra a la otra mitad cambia; flechas en escritorio. Marcas `‹` y `›` abajo de cada mitad. La traza son los cambios del control `{ tick, steer }` y el cierre; `validate` vuelve a correr la partida y rechaza metros distintos, ticks fuera de orden, `steer` inválido, un cierre que no coincide con la caída y una duración incoherente.

**Arte (`sprites.ts`, `draw.ts`, decisión 184).** Cámara que sigue al auto en el tercio de abajo y no rota. La ruta se rasteriza fila por fila (asfalto gris punteado, bordes blancos, corte oscuro del precipicio, línea amarilla discontinua, cartel de metros cada 100 m) sobre el vacío azul negro con estrellas de paralaje lento. El sunny: un sedán de tres volúmenes bordó, 10 × 16, sin logos, en 32 rotaciones precalculadas. Marcas de goma en las ruedas de atrás y humito mientras desliza (más de 12 direcciones), solo visuales. La caída: sigue deslizando, se achica, gira y se desvanece en el vacío. Con `prefers-reduced-motion`: estrellas quietas y sin humo; la ruta, el auto y las marcas quedan.

**Pantallas.** Arriba los metros ("842 m") y el velocímetro ("112 km/h"). La previa: el sunny cruzado sobre un tramo de ruta con marcas y humo. El resultado: los metros y el motivo.

**Calibración.** Con jugadores simulados (el conductor automático con retraso de reacción y decisiones sostenidas): con 100 a 200 ms de reacción y decisiones cada 4 a 12 ticks, la partida dura unos 60 s (1.300 a 1.600 m) y nadie llega a los 120 s; con 300 ms o más y decisiones sostenidas 10 a 20 ticks, el modelo se cae en la primera curva (oscila: es un controlador de encendido y apagado sin ver la ruta, no un pulgar). Un jugador que no dobla se cae a los 7 s; uno que aprieta la mitad del tiempo, a los 90 s. La sensibilidad del giro (4 direcciones por tick) es lo primero a retocar con el teléfono en la mano.

**Rotación.** `src/games/index.ts` tiene los nueve.

**Herramientas de desarrollo (decisión 184).** `/dev/juego/pisteando-el-sunny?seed=…` con el eje, el margen de caída y los vectores de rumbo y movimiento; cámara lenta; saltos a los 500, 1.500 y 3.000 m con el conductor automático; el conductor automático al volante (se prende y apaga en plena partida); y las 32 rotaciones del sunny. Por URL: `&desde=1500&eje=1&lento=1&auto=1`. Da 404 en producción.

**Capturas** en `reports/pisteando-el-sunny/`: `previa.png`, `derrape-500m.png` (en la primera recta casi vertical después de los 500 m, a los 718 m, con un zigzag sostenido en cámara lenta: el rumbo cruzado, las marcas de goma y el humo), `curva-en-s-2000m.png` (con el conductor automático), `caida.png` y `resultado.png`.

## Archivos

- creados: `src/games/pisteando-el-sunny/trig.ts`, `rules.ts`, `sprites.ts`, `draw.ts`, `index.tsx` y `dev.tsx`: el juego; `rules.test.ts` (15 tests).
- creados: `e2e/sunny.spec.ts` (3 pruebas) y `e2e/helpers/sunny.ts`.
- creados: las capturas de `reports/pisteando-el-sunny/` y este reporte.
- modificados:
  - `src/games/index.ts`: los nueve juegos.
  - `src/app/dev/juego/[id]/page.tsx`: la herramienta.
  - `src/lib/attempts.test.ts`: un resultado válido del juego.
  - `e2e/ronda.spec.ts`: sabe jugarlo; `e2e/helpers/group.ts`: 50 intentos.
  - `README.md`, `src/games/README.md` y `DECISIONS.md` (179 a 184).

## Decisiones nuevas

- **179.** Enteros, subunidades y la tabla de senos.
- **180.** La física del derrape y sus valores.
- **181.** La ruta y la garantía de justicia (abrir curvas si el conductor automático no la completa).
- **182.** Caída con margen de medio auto y metros por el eje.
- **183.** Control de un dedo o flechas, traza y `validate`.
- **184.** Arte, cámara, herramienta y lo que el documento no decía.

## Desvíos del plan o del brief

- **El derrape y el radio.** En el modelo, el deslizamiento es un retraso de la dirección de movimiento respecto del rumbo, más un tope de giro por tick que baja con la velocidad. Eso da "la cola afuera" y "doblá antes de la curva", pero el retraso solo no agranda el radio: lo que obliga a derrapar en las curvas cerradas es el tope (180). Anotado como valor a retocar.
- **El cierre antes de la caída se acepta** (183): el cronómetro puede cortar en cualquier tick y cortar antes solo quita metros.
- **`&desde=` en metros** en vez de segundos, como pide el documento (saltos a 500, 1.500 y 3.000 m).

## Tests

- `npm test` (vitest): 200 de 200 en 19 archivos (los 15 del juego incluidos; las 1.000 semillas con el conductor automático tardan unos 5 s).
- `e2e/sunny.spec.ts`: 3 de 3 en local (`simulate` igual en el navegador y en Node; la previa, el área sin scroll, mantener apretado y arrastrar de lado, y una partida que suelta y se cae; la ronda real con dos jugadores). `e2e/ronda.spec.ts` (el juego del día con los nueve juegos): pasó. La suite entera no se volvió a correr esta vez: este juego no toca a los otros.
- `npm run build`, `npm run typecheck` y `npm run lint`: limpios.
- Producción: la ronda real de `e2e/sunny.spec.ts` contra https://playus-lake.vercel.app pasó (dos jugadores, los metros validados por el servidor llegan al ranking con "m"). `/dev/juego/pisteando-el-sunny` da 404 allá.

## Cómo verificarlo en el navegador

1. En https://playus-lake.vercel.app, crear grupos hasta que Hoy diga "pisteando el sunny". Cada grupo nuevo tiene una chance de nueve.
2. Tocar "jugar". En la previa, el sunny cruzado sobre la ruta y las instrucciones.
3. Mantener apretada una mitad de la pantalla: el auto dobla mientras está apretado; arrastrar a la otra mitad cambia de lado. La página no se mueve.
4. Ver que a más velocidad el auto sigue de largo un rato al doblar (marcas negras y humito), y que en las curvas cerradas hay que doblar antes.
5. Salirse: el cartel "¡se fue el sunny!", el auto cayendo, y el resultado en metros. En el ranking, los metros con "m".
6. En local, `http://localhost:3000/dev/juego/pisteando-el-sunny?seed=reporte&desde=1500&eje=1&auto=1` para ver la ruta con el eje y el conductor automático.

## Problemas y deuda

- **Sin probar en un teléfono real**: la comodidad de sostener el pulgar, si el derrape se siente bien y si 4 direcciones por tick de giro es mucho o poco.
- **La calibración es con controladores simulados**, que oscilan si reaccionan tarde; un pulgar que ve la ruta modula. Si en el teléfono la primera curva mata, bajar el giro a 3 y ver.
- Siguen como deuda: el ranking del tarado en ms crudos, la unificación del cálculo de "te pasaron" y Vercel sin conectar a GitHub.

## Preguntas

- ninguna.

## Siguiente paso propuesto

Probar los nueve juegos en el teléfono; en el sunny, la sensibilidad del giro y si la partida típica queda entre 40 y 90 s.
