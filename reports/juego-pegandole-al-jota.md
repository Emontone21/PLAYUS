# Reporte: sexto juego real, "pegándole al jota"
Estado: parcial
Fecha: 2026-09-29

## Qué hice

El sexto juego real está construido, probado y publicado en **https://playus-lake.vercel.app**. Desde la próxima ronda, el mazo de cada grupo reparte los seis juegos; la ronda de hoy no cambia. El estado es parcial por lo de siempre: "se juega cómodo con un pulgar" y "la pista se lee de un vistazo" piden un teléfono de verdad. Todo lo demás está hecho y verificado, incluida una partida en producción.

**El juego.** Memoria. En cada ronda aparece un número grande y el dibujo de una sustancia un rato corto; la pista desaparece y el jota pregunta "¿cuánto querés, bro?" con dos casilleros, `___ de ___`. Hay que escribir el número en un teclado propio y tocar la sustancia en una grilla de 3 columnas; "pedir" se habilita cuando están los dos. Acertar suma una ronda ("joya", 0,9 s) y viene la siguiente con la pista más corta y el número más largo; errar en cualquiera de las dos cosas enoja al jota ("¿me estás jodiendo, bro?", cara roja, y debajo qué era lo correcto) y termina la partida con las rondas que tenías. Si pasan 15 s sin responder, el jota dice "bro?" y nada más. A los 180 s corta el contenedor.

**Interfaz, no canvas (decisión 153).** DOM con las clases de la app y los dibujos en pixel art como SVG (`SpriteSvg`, una celda por unidad), con el mismo criterio que la rana. Botones de 56 px o más; nunca un `input` del sistema (el E2E lo comprueba). El número escrito no limita la longitud: la cantidad de cifras no delata la respuesta.

**La serie (`rounds.ts`, decisión 154).** `jotaRounds(seed)` saca de la semilla del intento 60 rondas: número (2 cifras en las rondas 1 a 3, 3 en las 4 a 6, 4 en las 7 a 9, 5 en las 10 a 12 y 6 desde la 13; sin ceros a la izquierda, sin todas las cifras iguales ni redondos), sustancia (al azar entre las diez, con repetición) y `displayMs` (3.000 ms bajando 200 por ronda, piso 700). Todo el grupo ve la misma serie en el mismo número de intento. La pista muestra el número con separador de miles ("2.450"); la respuesta, solo cifras.

**Las sustancias (decisión 158).** Las diez de la lista, de 12 × 12, con los pares parecidos a propósito: merca y tussi (polvo blanco en línea con tarjeta, polvo rosa en bolsita), keta y popper (frasco ancho con polvo, botellita con tapa roja), marihuana y hachís (cogollo verde, tableta marrón). En la pista va solo el dibujo; en la grilla, con el nombre corto.

**El jota.** Un canguro con capucha, gorra, lentes oscuros y riñonera, de 16 × 18, con cuatro caras: neutral, impaciente ("bro?"), contento ("joya") y enojado (cara roja). La pantalla previa lo muestra con "¿qué vas a llevar?".

**Traza y validación (`rules.ts`, decisiones 155 a 157).** Un evento por ronda respondida: `{ round, hiddenAt, answeredAt, number, substance }`, con los tiempos medidos con `performance.now()` desde `onReady`. `validate` rearma la serie y rechaza: puntaje distinto de los aciertos seguidos desde la primera; eventos después de un error; rondas que no van 1, 2, 3…; tiempos que no crecen; respuestas antes de `400 + 150 × cifras` ms de ocultarse la pista; un `hiddenAt` que no sea el `answeredAt` anterior más la pausa del acierto (900 ms) más el `displayMs` de la ronda, con 400 ms de margen (así la pista no pudo mostrarse más tiempo del debido); y tiempos más allá de 182 s. `maxPlausibleScore = 59`. En `DECISIONS.md` quedó la limitación conocida: desde la web no se puede impedir una captura de pantalla; entre amigos lo aceptamos y la pista de 700 ms lo hace poco práctico.

**Rotación.** `src/games/index.ts` tiene los seis.

**Herramientas de desarrollo (decisión 159).** `/dev/juego/pegandole-al-jota?seed=…` con la serie completa y sus respuestas, saltos a la ronda 1, 7 y 13, las cuatro caras y la grilla de sustancias. Por URL: `&desde=7`. Da 404 en producción.

**Capturas** en `reports/pegandole-al-jota/`: `previa.png`, `pista-2-cifras.png`, `pista-5-cifras.png`, `pregunta-teclado.png`, `grilla.png`, `bro.png`, `enojado.png`, `resultado.png`, `caras.png` y `sustancias.png`.

## Archivos

- creados: `src/games/pegandole-al-jota/rounds.ts`, `rules.ts`, `sprites.ts`, `index.tsx` y `dev.tsx`: el juego; `rules.test.ts` (12 tests).
- creados: `e2e/jota.spec.ts` (2 pruebas) y `e2e/helpers/jota.ts`.
- creados: las capturas de `reports/pegandole-al-jota/` y este reporte.
- modificados:
  - `src/games/index.ts`: los seis juegos.
  - `src/app/dev/juego/[id]/page.tsx` y `src/app/dev/juego/page.tsx`: la herramienta del jota.
  - `src/lib/attempts.test.ts`: un resultado válido del jota.
  - `e2e/ronda.spec.ts`: sabe jugar al jota; `e2e/helpers/group.ts`: 32 intentos.
  - `README.md`, `src/games/README.md` y `DECISIONS.md` (153 a 159).

## Decisiones nuevas

- **153.** Juego de interfaz: DOM, componentes de la app y SVG; sin canvas ni `input` del sistema.
- **154.** La serie: cifras por ronda, sin triviales, pista de 3.000 a 700 ms, separador de miles.
- **155.** Los tiempos: pausa del acierto 900 ms, enojo 1 s, "bro?" a los 15 s, `maxPlausibleScore = 59`.
- **156.** `validate`: qué rechaza y con qué margen.
- **157.** Limitación conocida: la pista se puede capturar o anotar.
- **158.** El jota y las sustancias, con los pares parecidos.
- **159.** Lo que el documento no decía: contador, error, resultado, límite de 9 cifras, herramienta, 32 intentos de grupo.

## Desvíos del plan o del brief

- **El margen de los tiempos es de 400 ms** (156): los temporizadores del navegador y el `requestAnimationFrame` desvían unas decenas de ms; 400 deja lugar sin permitir que una pista se vea de más de forma útil.
- **El número escrito se limita a 9 cifras** (159): no delata nada (el máximo son 6) y evita desbordar el casillero.

## Tests

- `npm test` (vitest): **145 de 145**, de los cuales 12 son del jota: `jotaRounds` determinística y de 60 rondas; en 1.000 semillas las cifras siguen la tabla, sin ceros a la izquierda ni triviales, la pista baja 200 con piso de 700 y las diez sustancias salen parejo (entre 9 y 11 %); los triviales quedan afuera; el separador de miles; `validate` acepta una partida que termina en error (número o sustancia), una por tiempo y una vacía, y rechaza puntaje inflado, eventos después de un error, rondas salteadas o repetidas, tiempos fuera de orden o después del final, respuestas más rápidas que `400 + 150 × cifras`, una pista mostrada más tiempo del debido (y una ocultada antes), trazas mal armadas y de otra semilla; `MAX_SCORE` es la cota y el "bro?" está a los 15 s; sprites (diez sustancias y cuatro caras, todas distintas).
- `npm run e2e`: **23 de 23** en la corrida completa (11,9 minutos), con `pwa.spec.ts` salteada a propósito en desarrollo. Las 2 del jota: la pantalla previa, la serie del navegador igual a la de Node, las cuatro caras y las diez sustancias en la herramienta, la pista con separador de miles y sin nombre, ningún `input` del sistema, "pedir" deshabilitado hasta completar, el "bro?" a los 15 s sin terminar la ronda, borrar y la longitud libre, tres aciertos y un error en el número con "¿me estás jodiendo, bro?" y lo correcto debajo, resultado 3; y la ronda real: `/finish` acepta la traza (cuatro eventos), se valida en Node, el ranking muestra 3 y el segundo jugador aparece sin recargar. `ronda.spec` sabe jugar al jota.
- `npm run build`, `npm run typecheck` y `npm run lint`: sin errores.
- Producción: `npx vercel deploy --prod --yes` (salió bien al primer intento; el segundo, de rutina, también). Contra https://playus-lake.vercel.app corrí la prueba de la ronda real de `jota.spec.ts`. La primera corrida falló porque el bot de Playwright respondió una ronda en 304 ms y el servidor la rechazó con `invalid_events`: `validate` exige 700 ms para 2 cifras, y en local el bot era más lento de casualidad. Es el filtro funcionando; el helper ahora espera el mínimo humano antes de "pedir", y la segunda corrida pasó (grupo al intento 2): el servidor aceptó la traza, el ranking mostró 3 y el segundo jugador quedó segundo. `/dev/juego/pegandole-al-jota` da 404. Esas pruebas dejaron en la base de producción grupos "pegándole al 1" a "7" y "Diag 1" a "5" con usuarios de prueba ("Memoria", "Jota" y "Diag"); no los borré. No hubo migraciones.

## Cómo verificarlo en el navegador

1. En https://playus-lake.vercel.app, crear grupos hasta que Hoy diga "pegándole al jota". Cada grupo nuevo tiene una chance de seis; mañana, tu grupo de siempre puede tocarlo.
2. Tocar "jugar". En la pantalla previa, el jota con "¿qué vas a llevar?".
3. Mirar el número y el dibujo mientras la barra se vacía; después, escribir el número en el teclado, tocar la sustancia y "pedir".
4. Acertar: "joya" y la ronda siguiente, con la pista más corta. Errar: "¿me estás jodiendo, bro?", la cara roja y qué era lo correcto.
5. Dejar pasar 15 s sin responder: "bro?", y se puede seguir.
6. En el ranking, el puntaje aparece enseguida para los demás.
7. En local, `http://localhost:3000/dev/juego/pegandole-al-jota?seed=reporte&desde=13` para las pistas de 6 cifras y 700 ms, y "la serie" para ver las respuestas.

## Problemas y deuda

- **Sin probar en un teléfono real**: si la pista de 700 ms se lee de un vistazo con 6 cifras, si el teclado y la grilla entran cómodos en una pantalla chica sin scroll, y si las sustancias parecidas confunden lo justo.
- **La captura de pantalla** no se puede impedir desde la web (157).
- Siguen como deuda: el ranking del tarado en ms crudos, la unificación del cálculo de "te pasaron" y Vercel sin conectar a GitHub.

## Preguntas

- ninguna.

## Siguiente paso propuesto

Probar los seis juegos en el teléfono; en el jota, si el teclado y la grilla entran en la pantalla de un teléfono chico sin scroll y si la pista corta se lee.
