# Reporte: séptimo juego real, "caminando por 18"
Estado: parcial
Fecha: 2026-09-29 (segunda versión, mismo día)

## Segunda versión: un toque y perdés

La primera versión quedó demasiado fácil y se cambió el mismo día (decisión 168):

- **Un contacto y se termina.** Sin vidas ni invulnerabilidad: si un pastoso o don pasta alcanza al personaje, "te frenaron" en el acto. Se sacaron las zapatillas; arriba dice "un toque y perdés". `howTo` nuevo: "tocá a los pastosos antes de que te alcancen", "si uno te toca, perdés", "a don pasta, el dorado, hay que tocarlo 4 veces".
- **Por los cuatro lados.** De adelante entran asomando por el borde de arriba y su velocidad relativa suma la caminata; de los costados salen de las puertas; de atrás (desde los 10 s) entran asomando por abajo y son más rápidos que el personaje. El personaje subió a y = 100 para que se vea venir a los de atrás. Don pasta puede venir de cualquier lado. Los que suben se dibujan de espaldas y los que bajan de frente.
- **Más denso desde el arranque:** 1,4 → 2 → 2,6 → 3,2 pastosos por segundo a los 0, 10, 30 y 60 s (el documento daba 1 → 1,4 → 2 → 2,6 como punto de partida). Tipos: promotor y firmas desde el arranque, volantes desde los 10 s, planes desde los 30 s.
- **Garantías nuevas:** 700 ms desde que asoma hasta que llega, 6 toques por segundo como máximo, nadie en el segundo de don pasta, y nunca dos desde lados opuestos a menos de 400 ms. Se cumplen por construcción y se prueban en 1.000 calles.
- **Frases:** cada pastoso común dice al aparecer una de tres al azar con la semilla ("¿tenés fuego, mano?", "manito, ¿qué andás?", "¿tenés un minutito?"); don pasta sigue con las suyas. Dibujos sin cambios: pesados de 18, nadie en situación de calle.
- **Calibración** con el jugador simulado (reacciona con retraso, un toque cada tanto, a veces al aire):

| jugador simulado | cuartil 1 | mediana | cuartil 3 | llega a 120 s |
|---|---|---|---|---|
| 300 ms, un toque cada 250 ms, 10 % al aire | 120 s | 120 s | 120 s | 91 % |
| 400 ms, un toque cada 300 ms, 15 % al aire | 28 s | 40 s | 55 s | 1 % |
| 500 ms, un toque cada 350 ms, 20 % al aire | 7 s | 13 s | 22 s | 0 % |

  La típica queda entre 20 y 40 s. Un jugador con puntería perfecta y 3 o 4 toques por segundo sigue sin perder: el techo lo pone la garantía de 6 toques por segundo.
- **Capturas nuevas** en `reports/caminando-por-18/`: `entra-por-arriba.png`, `entra-por-el-costado.png`, `entra-por-abajo.png`, `partida-30s.png`, `don-pasta.png`, `te-frenaron.png` y `resultado.png` (más `previa.png` y `pastosos.png`).
- **Tests:** `npm test` 164 de 164 (los 19 de 18 reescritos: un solo contacto termina la partida venga de donde venga, apariciones por los cuatro lados con los de atrás desde los 10 s, don pasta por cualquier lado, las tres frases, las cuatro garantías en 1.000 calles con la de lados opuestos, la llegada prevista igual a la real, el jugador perfecto llega a los 120 s, `validate` rearma la partida). E2E de 18: 3 de 3 en local (la ronda real falló una vez por el refresco en vivo en desarrollo, decisión 113, y pasó al repetirla) y `ronda.spec` en verde; no se volvió a correr la suite completa (tarda 18 minutos con la máquina cargada y solo cambió este juego). Build, typecheck y lint sin errores. Producción: `npx vercel deploy --prod --yes` y la ronda real contra https://playus-lake.vercel.app pasó (grupo al intento 11): el servidor aceptó la traza, el ranking mostró los metros y el jugador que no toca a nadie quedó detrás; `/dev/juego/caminando-por-18` da 404. Quedaron más grupos de prueba "caminando po N" en producción.

Lo que sigue es el reporte de la primera versión, que vale para todo lo que no cambió.


## Qué hice

El séptimo juego real está construido, probado y publicado en **https://playus-lake.vercel.app**. Desde la próxima ronda, el mazo de cada grupo reparte los siete juegos; la ronda de hoy no cambia. El estado es parcial por lo de siempre: "se juega cómodo con un pulgar" y "los pastosos y don pasta se distinguen al toque" piden un teléfono y dedos reales. Todo lo demás está hecho y verificado, incluida una partida en producción.

**El juego.** El personaje camina por 18 de Julio a 5 m/s y de las puertas de los costados salen los pastosos: el promotor de tarjetas ("¿tenés un minutito?"), el de las firmas ("firmá acá, es un segundo"), el de los volantes ("¡tomá, tomá!", en zigzag) y el de los planes de celular ("¿con qué compañía estás?", desde más cerca y más tarde). Tocarlos los saca de encima ("¡uh, bueno!" y vuelven a su puerta); si uno lo alcanza, lo agarra del brazo, se apaga una zapatilla y el personaje queda un segundo invulnerable. Cada tanto viene don pasta, el de traje dorado: cuatro toques, retrocede y cambia la cara con cada uno, y al cuarto "bueno, bueno". Con la tercera vida, "te frenaron". El puntaje son los metros ("m" en el ranking). Todos los pastosos son pesados de la calle bien vestidos a su manera; ninguno se dibuja ni se nombra como persona en situación de calle.

**Simulación (`rules.ts`, decisiones 160 a 163).** El esquema de Larry y remar con las piezas de `src/games/lib/` (reloj de paso fijo, escala del canvas, sprites, fuente) y los toques de un dedo de `taps.ts`. 60 ticks, enteros, 12 ticks por metro (`maxPlausibleScore = 600`). Los pastosos se mueven en pantalla hacia el personaje fijo con el mismo código que usa la generación para saber cuándo llegan, así la llegada prevista es exactamente la real.

**Garantías (decisión 162).** La calle se genera entera con la semilla, y cada pastoso se coloca solo donde (a) tarda 900 ms o más en llegar, (b) ninguna ventana de un segundo pasa de 5 toques necesarios (1 por común, 4 don pasta) y (c) mientras don pasta está en pantalla nadie más llega en su mismo segundo. Los tests lo comprueban en 1.000 calles (300 con las llegadas medidas por la simulación) y con el jugador perfecto, que llega a los 120 s con las tres vidas en 300 semillas.

**Calibración (decisión 164).** Con la tabla del documento, un jugador simulado lento (500 ms de reacción, un toque cada 350 ms, 20 % al aire) llegaba a los 120 s el 77 % de las veces, así que el cronograma se apretó a 0,6 → 1,5 → 3 → 4,6 pastosos por segundo (a los 0, 20, 45 y 90 s). Con eso:

| jugador simulado | cuartil 1 | mediana | cuartil 3 | llega a 120 s |
|---|---|---|---|---|
| 300 ms, un toque cada 250 ms, 10 % al aire | 120 s | 120 s | 120 s | 100 % |
| 400 ms, un toque cada 300 ms, 15 % al aire | 120 s | 120 s | 120 s | 93 % |
| 500 ms, un toque cada 350 ms, 20 % al aire | 51 s | 62 s | 72 s | 1 % |

La garantía de 5 toques por segundo pone el techo: un jugador preciso que sostenga 3 o 4 toques por segundo no pierde. La dificultad real vendrá de la puntería y de seguir varios blancos con un pulgar; falta confirmarlo con dedos reales. Velocidades finales (subunidades por tick): promotor 14, firmas 11, volantes 8 con zigzag, celular 12, don pasta 6.

**Toques.** Un solo dedo con el registro compartido; en escritorio el clic izquierdo. Un toque le pega al pastoso cuya caja (3 unidades más grande que el dibujo) contiene el punto; si hay varios, al más cercano al personaje; el vacío no penaliza. `touch-action: manipulation`, sin selección ni menú contextual. Los toques se juntan entre cuadros y entran en el próximo tick.

**Traza y validación (decisión 165).** `{ tick, x, y }` por toque que contó y `{ tick, fin: true }`. `validate` vuelve a jugar y rechaza metros distintos, ticks fuera de orden o después del final, coordenadas fuera del campo, dos toques a menos de 35 ms, un toque al vacío, un fin que no sale de la partida y uno incoherente con la duración real. Sin el control de ritmo parejo, como pide el documento. `minDurationMs: 5_000`.

**Arte (`sprites.ts`, `draw.ts`, decisión 166).** 18 de Julio desde arriba: calzada con la línea del medio, veredas con edificios, ventanas, puertas y galerías, kioscos, una parada y árboles; el mosaico baja con los metros y cada 100 m hay un cartel azul de esquina con el número de cuadra (sin nombres de calles, para no inventar el orden). El personaje de espaldas con auriculares y mochila, tres cuadros; los cuatro pastosos con el cuerpo común y su accesorio (credencial y folleto, tablita con lapicera, pila de volantes, remera de compañía con tablet), de espaldas al irse; don pasta dorado con corbata roja y cuatro caras. Los globos van con texto de la fuente de la app sobre el canvas. Con `prefers-reduced-motion`, sin sacudón ni parpadeo ni cuadros de los pastosos.

**Pantallas.** Arriba, los metros y las tres zapatillas. La previa: el personaje, los cuatro pastosos con su nombre corto (tarjetas, firmas, volantes, planes) y don pasta aparte con "×4". El resultado propio: los metros con "m" y "te frenaron." o "llegaste a los 2 minutos sin que te paren.".

**Rotación.** `src/games/index.ts` tiene los siete.

**Herramientas de desarrollo (decisión 167).** `/dev/juego/caminando-por-18?seed=…` con cajas de toque, cámara lenta, saltos a los 20, 45 y 90 s, "don pasta ya" y cada pastoso solo. Por URL: `&desde=45&cajas=1&lento=1&donpasta=1`. Da 404 en producción.

**Capturas** en `reports/caminando-por-18/`: `previa.png`, `pastosos.png`, `partida-10s.png`, `partida-60s.png`, `don-pasta.png`, `vida-perdida.png`, `te-frenaron.png` y `resultado.png`.

## Archivos

- creados: `src/games/caminando-por-18/rules.ts`, `sprites.ts`, `draw.ts`, `index.tsx` y `dev.tsx`: el juego; `rules.test.ts` (19 tests).
- creados: `e2e/caminando.spec.ts` (3 pruebas) y `e2e/helpers/caminando.ts`.
- creados: las capturas de `reports/caminando-por-18/` y este reporte.
- modificados:
  - `src/games/index.ts`: los siete juegos.
  - `src/app/dev/juego/[id]/page.tsx` y `src/app/dev/juego/page.tsx`: la herramienta.
  - `src/lib/attempts.test.ts`: un resultado válido del juego.
  - `e2e/ronda.spec.ts`: sabe jugarlo; `e2e/helpers/group.ts`: 38 intentos.
  - `README.md`, `src/games/README.md` y `DECISIONS.md` (160 a 167).

## Decisiones nuevas

- **160.** Unidades: 12 ticks por metro, `maxPlausibleScore = 600`.
- **161.** Los pastosos se mueven en pantalla con el mismo código que usa la generación para prever la llegada.
- **162.** Las tres garantías por construcción, y cómo se prueban.
- **163.** Vidas, invulnerabilidad, don pasta y las cajas de toque.
- **164.** El cronograma se apretó, y la calibración con su techo.
- **165.** Traza y `validate`, sin el control de ritmo.
- **166.** Arte, y ningún pastoso como persona en situación de calle.
- **167.** Lo que el documento no decía: zapatillas, cartel, resultado, herramienta y 38 intentos de grupo.

## Desvíos del plan o del brief

- **El cronograma se apretó** (164): con el del documento la partida típica se iba a los 120 s.
- **La velocidad de planes de celular es 12 (no más rápida que el promotor, 14)**: saliendo desde más cerca, a más velocidad no llegaba a los 900 ms desde casi ninguna puerta (161).
- **Los globos son texto, no pixel art** (166): son frases largas y cambian por tipo.
- **Un toque al vacío no va a la traza, y `validate` rechaza una traza que lo traiga** (165): es lo mínimo recomputable.

## Tests

- `npm test` (vitest): **164 de 164**, de los cuales 19 son de 18: determinismo y paso a paso; en 1.000 calles (300 con las llegadas medidas por la simulación): 900 ms o más desde que aparece, la llegada prevista es exactamente la real, ninguna ventana de 1 s pasa de 5 toques, nadie llega en el segundo de don pasta, los tipos se suman según la tabla, don pasta desde los 20 s cada 25 a 35 s, salen cada vez más seguido, y el jugador perfecto llega a los 120 s con las tres vidas; reglas: un toque saca a un común y el vacío no hace nada, don pasta necesita exactamente 4 y retrocede, un pastoso que llega resta una vida y se va, la invulnerabilidad evita perder dos en el mismo segundo (también con dos que llegan casi juntos), tres vidas terminan, 12 ticks por metro, el más cercano gana el toque y las cajas tienen margen; `validate`: acepta trazas reales (cortada, frenada, entera) y rechaza metros inflados, ticks fuera de orden o después del final, coordenadas fuera del campo o no enteras, un intervalo de 20 ms, otra semilla, un toque al vacío, un fin que no sale de la partida y una duración incoherente; sprites.
- `npm run e2e`: **24 de 26** en la corrida completa, con `pwa.spec.ts` salteada a propósito. La primera corrida se colgó (más de 20 minutos sin terminar) y se cortó; la segunda tardó 17,8 minutos (la máquina estaba muy cargada: cada prueba tardó el doble que otros días) y fallaron la ronda real del jota (el ranking no apareció a tiempo) y la piba (el resultado no llegó a tiempo); las dos pasaron al repetirlas solas (4 minutos), así que fueron tiempos de espera bajo carga, no fallas del código. Las 3 de 18 pasaron en la corrida completa: la simulación del navegador y la de Node dan el mismo JSON (calle, traza del jugador perfecto, estado final, partida sin tocar) en 5 semillas; la pantalla previa con los pastosos y don pasta ×4, el área sin scroll, tocar el vacío no penaliza, una partida que toca a 4 y después deja pasar tres termina con "te frenaron"; y la ronda real: `/finish` acepta la traza, se valida en Node, el ranking muestra los metros con "m" y el segundo jugador, que no toca a nadie, queda detrás. `ronda.spec` sabe jugar a 18.
- `npm run build`, `npm run typecheck` y `npm run lint`: sin errores.
- Producción: `npx vercel deploy --prod --yes` (salió bien al primer intento). Contra https://playus-lake.vercel.app corrí la prueba de la ronda real de `caminando.spec.ts`: la primera corrida falló al crear el grupo (la acción del servidor tardó más de 15 s en producción; hoy se crearon decenas de grupos de prueba), la segunda pasó (grupo al intento 4): el servidor aceptó la traza con la duración real, el ranking mostró los metros con "m" y el jugador que no toca a nadie quedó detrás. `/dev/juego/caminando-por-18` da 404. Esas pruebas dejaron en la base de producción grupos "caminando po N" con usuarios de prueba ("Peatona" y "Pastoso"); no los borré. No hubo migraciones.

## Cómo verificarlo en el navegador

1. En https://playus-lake.vercel.app, crear grupos hasta que Hoy diga "caminando por 18". Cada grupo nuevo tiene una chance de siete; mañana, tu grupo de siempre puede tocarlo.
2. Tocar "jugar". En la pantalla previa, el personaje, los cuatro pastosos con su nombre y don pasta con "×4".
3. Tocar a los pastosos cuando salen de las puertas: dicen "¡uh, bueno!" y se vuelven. Dejar pasar a uno: lo agarra, se apaga una zapatilla y el personaje parpadea un segundo.
4. Desde los 20 s, don pasta: cuatro toques, retrocede y cambia la cara; al cuarto, "bueno, bueno".
5. Con la tercera zapatilla, "te frenaron" y el resultado en metros.
6. En el ranking, los metros con "m", enseguida para los demás.
7. En local, `http://localhost:3000/dev/juego/caminando-por-18?seed=reporte&desde=45&cajas=1&lento=1` para ver la calle densa con las cajas.

## Problemas y deuda

- **Sin probar en un teléfono real**: si con el pulgar se llega a los pastosos de los dos lados a tiempo, si don pasta se distingue de lejos y si la partida típica cae entre 30 y 60 s. La garantía de 5 toques por segundo hace que un jugador preciso no pierda (164); si resulta fácil, el primer ajuste es bajar el mínimo de 900 ms del que sale de más cerca.
- Siguen como deuda: el ranking del tarado en ms crudos, la unificación del cálculo de "te pasaron" y Vercel sin conectar a GitHub.

## Preguntas

- ninguna.

## Siguiente paso propuesto

Probar los siete juegos en el teléfono; en 18, si la dificultad sube parejo y si los pastosos de los dos lados se llegan con un pulgar.
