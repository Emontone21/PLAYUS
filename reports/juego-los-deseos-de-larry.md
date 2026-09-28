# Reporte: tercer juego real, "los deseos de Larry"
Estado: parcial
Fecha: 2026-09-28

## Qué hice

El tercer juego real está construido, probado y publicado en **https://playus-lake.vercel.app**. Desde la próxima ronda, el mazo de cada grupo reparte "encontrá a la piba del IPA", "quedó re tarado" y "los deseos de Larry"; la ronda de hoy no cambia. El estado es parcial por lo de siempre: "se juega cómodo con un pulgar" y "los objetos se distinguen a toda velocidad" piden un teléfono de verdad. Todo lo demás está hecho y verificado, incluida una partida en producción.

**El juego.** Larry camina por la vereda de una calle de noche y solo se mueve para los costados. Desde arriba caen dos tipos de cosas:
- Hamburguesas y vapos: suman un punto cada uno. Cada uno que llega al piso hace "plaf" y apaga una de las 3 hamburguesitas de vida.
- Lechuga, zanahoria, brócoli y la bandera del Frente Amplio: si agarra uno, la partida termina en el acto, con cara de asco y el cartel "¡puaj!" o "¡eso no!".

Con la tercera vida perdida, la partida termina con cara de bajón y "sin vidas". El final se ve un segundo y después aparece el resultado propio: la cara final, el número de deseos y el motivo. A los 90 s corta el contenedor, como en los otros juegos. Gana el que agarra más (`scoring: 'high'`).

**Simulación determinística (`rules.ts`).** Es una función pura, sin DOM ni React, que usan el cliente y el servidor por igual:
- 60 ticks por segundo y posiciones en enteros: 16 subunidades por unidad, sobre un campo de 90 × 160.
- Nada de `Math.sin` ni parecidos: el azar sale solo de `rngFromSeed` con la semilla del intento.
- `generateRain(seed)` fija de una vez qué cae, dónde, cuándo y a qué velocidad. `step` avanza un tick y `simulate(seed, entradas, hastaTick)` juega la partida entera.
- Larry camina hacia el dedo a una velocidad máxima de 2,25 unidades por tick: no se teletransporta.
- Un objeto se agarra si su caja (8 × 8) se superpone con la zona de agarre de Larry (12 de ancho, la parte de arriba del sprite) en el tick en que la cruza. Si pasa de largo, sigue cayendo hasta el piso.
- El cliente calcula el tick que corresponde al tiempo transcurrido, simula hasta ahí y dibuja el estado interpolado entre ticks. Así la partida no depende del frame rate del teléfono, y si la pestaña estuvo en segundo plano se pone al día de una.

**Garantías de justicia (decisión 123).** Se definen con un "jugador perfecto" que solo usa lo que ve en pantalla: va a toda velocidad al próximo deseo y lo espera ahí. La generación asegura cuatro cosas:
- Los objetos cruzan de a uno, en orden.
- Cada deseo se alcanza desde el anterior con 3/4 de la velocidad máxima, contando desde que aparece.
- Ese jugador nunca queda a menos de 14 unidades de un objeto malo cuando este cruza. Es 4 más de lo que haría falta para tocarlo.
- Un objeto malo que cruza a menos de 12 ticks de un deseo nunca cae a menos de 14 unidades de él.

En 1.000 semillas, ese jugador agarra todos los deseos, no toca nada malo y llega a los 90 s con las 3 vidas. Hamburguesas y vapos salen 50/50. Los objetos malos siguen el cronograma: 14,3 %, 21,9 % y 27,6 % por tramo de 30 s, contra 14 %, 21,5 % y 27,5 % esperados.

**Cronograma y calibración (decisión 124).** Quedó el de la tabla: cada 54, 36, 24 y 17 ticks; caídas de 2,1, 1,5, 1,1 y 0,85 s hasta Larry; 10, 18, 25 y 30 % de objetos malos. Se interpola en ticks con enteros y cada objeto varía un poco. Lo calibré con un jugador simulado que sigue al próximo deseo con retraso de reacción y puntería imprecisa, sin esquivar:

| reacción | cuartil 1 | mediana | cuartil 3 |
|---|---|---|---|
| 200 ms | 37 s | 47 s | 55 s |
| 300 ms | 22 s | 28 s | 34 s |

Como la partida típica ya cae entre 30 y 60 s, no toqué nada. Falta confirmarlo con dedos reales.

**Control.** Arrastrar en cualquier parte del área del juego fija el objetivo de Larry en la x del dedo, redondeada a unidades enteras de 0 a 90. Manda el primer puntero apoyado, con captura, y los demás se ignoran. En escritorio funciona el mouse con el botón izquierdo apretado. El área tiene `touch-action: none`, `user-select: none` y no abre el menú contextual.

**Traza y validación.** La traza lleva los cambios de objetivo por tick (`{ tick, x }`) y un cierre `{ tick, fin: true }` con el tick en que terminó la partida (decisión 121). `validate` rechaza en estos casos:
- ticks que no crecen o que llegan después del final;
- `x` fuera del campo o no entera;
- traza sin cierre o mal armada;
- un fin que no sale de la partida: por ejemplo, dice 90 s pero se quedó sin vidas a los 12;
- un puntaje distinto del recalculado;
- un fin incoherente con la duración real del intento: la partida no puede durar más que el intento, y el intento no puede durar más de 10 s por encima de la partida.

Para esto último, el contrato suma un tercer parámetro opcional a `validate` con la duración que ya medía `/finish` (decisión 120); los otros juegos no cambian. En `DECISIONS.md` quedó anotado que un bot que juegue en tiempo real con la semilla no se puede frenar del todo (decisión 127).

**Arte (`sprites.ts` y `draw.ts`).** Pixel art hecho con mapas de letras; los mismos dibujos van al canvas, a la pantalla previa, al resultado y a las vidas.
- **Larry**: 14 × 22, de piel blanca, con gorra roja de visera plana (con la calcomanía dorada), buzo oversize, cadena de oro, pantalón ancho, zapatillas grandes y el vapo asomando del bolsillo. Tiene 2 cuadros de caminata y cuatro gestos: normal, feliz al agarrar un deseo, asco y bajón.
- **Objetos**: seis siluetas bien distintas. La bandera tiene tres franjas (roja, azul y blanca) en un mástil chico.
- **Fondo**: una calle de noche apagada, con edificios, luna, farol y vereda.
- **Canvas**: `imageSmoothingEnabled = false`, escalado entero por `devicePixelRatio` y sprites pintados una sola vez por escala.
- **Movimiento reducido**: el sacudón al perder una vida y las migas del "plaf" se apagan con `prefers-reduced-motion`.

**Rotación.** `src/games/index.ts` tiene los tres juegos.

**Herramientas de desarrollo.** `/dev/juego/los-deseos-de-larry?seed=…` tiene casillas de "cajas" y "×0,25" y botones "desde 0/30/60/80 s": el jugador perfecto juega hasta ese momento y ahí toma el control tu dedo. También funciona por URL: `&desde=60&cajas=1&lento=1`. Da 404 en producción.

**Capturas** en `reports/los-deseos-de-larry/`:
- `previa.png`: la pantalla previa.
- `partida-10s.png` y `partida-60s.png`: la partida a los 10 y a los 60 s.
- `fin-sin-vidas.png`, `fin-verdura.png` y `fin-bandera.png`: los tres finales.
- `resultado-verdura.png` y `resultado-bandera.png`: la pantalla de resultado.

## Archivos

- creados: `src/games/los-deseos-de-larry/rules.ts`, `sprites.ts`, `draw.ts`, `index.tsx` y `dev.tsx`: el juego.
- creados: `src/games/los-deseos-de-larry/rules.test.ts` (23 tests).
- creados: `e2e/larry.spec.ts` (3 pruebas) y `e2e/helpers/larry.ts`.
- creados: las capturas de `reports/los-deseos-de-larry/` y este reporte.
- modificados:
  - `src/games/types.ts`: `validate` recibe `meta?: { elapsedMs }`.
  - `src/lib/attempts.ts`: se la pasa.
  - `src/games/index.ts`: los tres juegos.
  - `src/app/dev/juego/[id]/page.tsx` y `src/app/dev/juego/page.tsx`: la herramienta de Larry.
  - `src/lib/attempts.test.ts`: un resultado válido de Larry.
  - `e2e/ronda.spec.ts`: sabe jugar a Larry.
  - `e2e/helpers/group.ts`: 14 intentos.
  - `README.md`, `src/games/README.md` y `DECISIONS.md` (120 a 131).

## Decisiones nuevas

- **120.** `validate` recibe la duración real del intento (tercer parámetro opcional del contrato).
- **121.** La traza cierra con `{ tick, fin: true }`, por el corte del cronómetro.
- **122.** Simulación entera a 60 ticks, avanzada por el tiempo transcurrido, y cómo se revisa el agarre.
- **123.** La lluvia se genera entera, y las garantías se definen con un jugador perfecto que solo usa lo que ve.
- **124.** El cronograma quedó como el de la tabla, y cómo se calibró.
- **125.** `maxPlausibleScore = 246`, una cota del cronograma (el máximo real en 1.000 semillas fue 169).
- **126.** `minDurationMs: 5_000`.
- **127.** Un bot que juegue en tiempo real con la semilla no se puede frenar del todo.
- **128.** Cajas iguales para todo lo que cae; el sprite de Larry y su zona de agarre.
- **129.** Lo que el documento no decía: el cartel "sin vidas", el resultado propio y el ranking sin unidad.
- **130.** La herramienta de desarrollo, `window.__larry` y el import relativo de `rng`.
- **131.** `createGroupWithGame` hace hasta 14 intentos.

## Desvíos del plan o del brief

- **El contrato cambió**: `validate` tiene un tercer parámetro opcional (120). Es la forma más chica de cumplir "tick de fin coherente con la duración".
- **La traza tiene un evento más** que `InputEvent`: el cierre (121).
- **"Nunca cae un objeto malo en una posición que obligue a tocarlo"** se garantiza de forma más fuerte que "en el mismo tick": ningún objeto cruza a la vez que otro, y existe siempre un camino humano que agarra todo sin tocar nada malo (123).
- **`minDurationMs: 5_000`** en lugar del default (126).

## Tests

- `npm test` (vitest): **95 de 95**, de los cuales 23 son de Larry:
  - determinismo;
  - paso a paso contra de una;
  - en 1.000 semillas: el jugador perfecto agarra todo, cada deseo es alcanzable con margen, ningún objeto malo cae pegado a un deseo, los cruces son de a uno, todo cae dentro del campo, las proporciones siguen el cronograma, cae cada vez más seguido y más rápido, y `MAX_SCORE` es una cota;
  - reglas: tres vidas perdidas de a una, un objeto malo termina en el acto, los 90 s terminan la partida, y Larry camina a velocidad máxima;
  - `validate`: acepta trazas reales (terminada sola, cortada, a los 90 s) y rechaza puntaje inflado, ticks fuera de orden o repetidos, entradas después del final, `x` fuera del campo o no entera, otra semilla, un fin que no sale de la partida y una duración incoherente;
  - sprites.
- `npm run e2e`: **16 de 16**, con `pwa.spec.ts` salteada a propósito en desarrollo; tardó 8,1 minutos. Entre ellas, las 3 de Larry: el navegador y Node dan exactamente el mismo JSON (lluvia, traza del jugador perfecto, estado final) en 5 semillas; la pantalla previa y el área sin scroll; una partida jugada con el mouse apretado. Y en la ronda real: `/finish` acepta la traza, el cuerpo enviado se valida en Node, A queda primero con su puntaje exacto y B lo ve aparecer sin recargar. `ronda.spec` ahora sabe jugar a Larry. La corrida anterior (la de 12 de 13) queda cerrada.
- `npm run build`, `npm run typecheck` y `npm run lint`: sin errores.
- Producción: `npx vercel deploy --prod` (el primer intento respondió "Not authorized" y el segundo salió bien). Contra https://playus-lake.vercel.app corrí la prueba de la ronda real de `larry.spec.ts`: el primer grupo nuevo ya tenía a Larry como juego del día; un jugador quieto perdió las tres vidas, el otro jugó con el dedo; el servidor aceptó la traza con la duración real del intento, y el ranking en vivo lo mostró arriba. `/dev/juego/los-deseos-de-larry` da 404. Esa prueba dejó en la base de producción un grupo "los deseos d 1" con dos usuarios de prueba ("Larry" y "Quieto"); no los borré. No hubo migraciones.

## Cómo verificarlo en el navegador

1. En https://playus-lake.vercel.app, crear grupos hasta que Hoy diga "los deseos de Larry". Cada grupo nuevo tiene una chance de tres; mañana, tu grupo de siempre puede tocarlo.
2. Tocar "jugar". En la pantalla previa aparece Larry en grande, y abajo "sí" (hamburguesa y vapo) y "no" (las tres verduras y la bandera).
3. Arrastrar el pulgar en cualquier parte del área: Larry camina hacia el dedo, sin saltar, y la página no se mueve. Con un segundo dedo no cambia nada.
4. Al agarrar un deseo, sonríe y el contador sube. Si dejás caer uno, hace "plaf" y se apaga una hamburguesita; con tres, "sin vidas". Si agarrás una verdura, "¡puaj!"; si agarrás la bandera, "¡eso no!".
5. En el ranking, el puntaje aparece enseguida para los demás, sin recargar.
6. En local, `http://localhost:3000/dev/juego/los-deseos-de-larry?seed=reporte&desde=60&cajas=1` para ver la lluvia fuerte con las cajas de colisión.

## Problemas y deuda

- **Sin probar en un teléfono real**: si se juega cómodo con un pulgar (el dedo tapa un poco a Larry; se puede arrastrar más arriba, porque solo cuenta la x), si los objetos se leen a toda velocidad y si la dificultad se siente pareja.
- **La calibración es con un jugador simulado.** Si con dedos reales las partidas duran mucho más de 60 s, el primer ajuste es acelerar la fila de 60 s del cronograma.
- **La suite E2E tarda más**: suma unos 2 minutos de Larry.
- Siguen como deuda: el ranking del tarado en ms crudos, la unificación del cálculo de "te pasaron" y Vercel sin conectar a GitHub.

## Preguntas

- ninguna.

## Siguiente paso propuesto

Probar los tres juegos en el teléfono: la comodidad con el pulgar, que el filtro del tarado no rechace partidas reales y que la lluvia de Larry sea justa y pareja. Con eso se cierran los estados parciales.
