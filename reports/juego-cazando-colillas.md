# Juego nuevo: Cazando Colillas

Publicado en producción (https://playus-lake.vercel.app) el 2026-10-08. Nombre provisorio durante el desarrollo: "la rana caza colillas".

## Qué es

La rana de Frog en el centro de un estanque de noche. Alrededor vuelan colillas con alitas y, mezclados, vapeadores. Tocar un punto tira la lengua hacia ahí: la punta agarra lo primero que toca; colilla, +1; vapeador, "¡puaj, un vapo!" y se termina; nada, vuelve vacía sin penalizar. 60 segundos; gana el que come más colillas.

- Módulo `src/games/cazando-colillas/` (`rules.ts` simulación, trayectorias, generación con justicia, traza y `validate`; `sprites.ts`, `draw.ts`, `index.tsx`, `dev.tsx`). Decisiones 262 a 264.
- Reutiliza la rana de la mascota (`components/frog/frog-grid`, al triple, con la boca cerrada, abierta, masticando y tosiendo) y el ícono de la colilla de la moneda (`components/colilla`), con alitas. El vapeador es un vape de bolsillo violeta con nubecita y alitas, de otra forma y color.
- Simulación entera a 60 ticks sin `Math.sin`/`cos`: las trayectorias son curvas de Bézier cuadráticas enteras de 2 o 3 tramos, suaves, de borde a borde. Lengua a 200 unidades por tick (el alcance máximo en 150 ms), punta revisada en 4 subpasos por tick contra las cajas de las cosas donde están en ese subpaso, primero lo más cercano. Dificultad según la tabla (3-4 cosas y 10 % de vapeadores al principio, 8-9 y 40 % al final, cada vez más rápidas y curvas), escoltas desde los 30 s.
- Justicia, comprobada al generar: ningún vapeador queda nunca encima ni pegado de una colilla (ni al revés); toda colilla tiene al menos un momento al alcance con el camino recto libre de vapeadores, con los vapeadores donde van a estar. El jugador automático con 250 ms de demora come 15 o más en 1.000 de 1.000 semillas (el peor, 39) y nunca agarra un vapeador.
- Calibración: el modelo (350 ms de reacción, sin anticipación, ±160 de puntería, 300 ms de pausa) come 33 de mediana (p25 21, p75 45); el lento (500 ms, ±220, 500 ms), 31.
- Control: tocar en cualquier punto del área (`touch-action: manipulation`, un solo dedo); los toques con la lengua afuera se ignoran. Arriba, "N colillas" con el ícono.
- Traza `{ tick, x, y }` por lengüetazo + `fin`; `validate` vuelve a jugar y rechaza colillas infladas, toques con la lengua afuera, ticks fuera de orden, coordenadas fuera del área, otra semilla, cierre fuera de rango o distinto del tick del vapeador, y duración incoherente.
- Herramienta `/dev/juego/cazando-colillas?seed=…&cajas=1&lento=1&desde=40&auto=1`: cajas, alcance y trayectorias que vienen; cámara lenta ×0,25; saltos a 20, 40 y 55 s; jugador automático; sprites; `window.__rana`.

## Comprobaciones

- `vitest`: 13 tests del juego (determinismo; la lengua llega al alcance máximo en 9 ticks y a puntos cercanos en menos, agarra lo primero que toca y vuelve en lo que tardó la ida, los subpasos agarran una colilla que entre ticks se perdería, vuelve vacía sin penalizar e ignora toques con la lengua afuera; el vapeador termina; el toque pasa al campo lógico; generación en 1.000 semillas según la tabla, sin vapeadores sobre colillas, toda colilla con momento libre, sin escoltas antes de los 30 s; justicia ≥ 15 en el 99 % de 1.000 semillas; calibración; `validate` acepta partidas reales y rechaza todo lo demás; arte). Suite completa en verde (429 tests); `eslint`, `tsc` y `next build` limpios.
- El test de intentos contra la base local ahora hace durar el intento de prueba lo que dura la partida del jugador automático cuando el juego lo pide (acá el primer vapeador puede tardar de 1 a 35 s según la semilla).
- E2E local (`e2e/rana.spec.ts`, 3 tests en 31 s): generación, geometría, momentos libres, caminos bloqueados y partidas del modelo idénticos en navegador y Node en 6 semillas; previa con "comé" y "ni loco", herramienta con sus 8 sprites, área (`touch-action`, `user-select`), un lengüetazo al vacío que vuelve sin penalizar y uno que come; ronda real que come las primeras colillas con los toques del jugador justo calculados en el test, agarra un vapeador, ve "¡puaj, un vapo!" y llega al ranking con el puntaje, con la traza reproducida en Node.

- E2E en producción (`SUPABASE_CLI=supabase@2.119.0 E2E_BASE_URL=https://playus-lake.vercel.app npx playwright test e2e/rana.spec.ts -g "ronda real"`): en verde (35 s) contra el deploy `playus-d9q9srpgj`: grupo nuevo con el juego del día puesto en la base, las primeras colillas comidas con los toques del jugador justo, un vapeador agarrado, el puntaje en el ranking y la traza reproducida en Node.
- `/dev/juego/cazando-colillas` responde 404 en producción sin sesión de admin.
- Juego de hoy (2026-10-08) en todos los grupos de producción: puesto con `admin_set_today_game` (una transacción por grupo, registro en `admin_actions`), 14 grupos, 13 rondas creadas y 1 cambiada (1 intento borrado, en Elgurpe); verificado en la base: 15 rondas de hoy con `cazando-colillas` (las 14 más la del grupo del E2E), la semilla de la fórmula.

## Capturas

- `reports/cazando-colillas/previa.png`: la pantalla previa.
- `reports/cazando-colillas/lengua-colilla.png`: la lengua trayendo una colilla, con la boca abierta y el +1.
- `reports/cazando-colillas/escolta.png`: a los 40 s, con cajas, alcance y trayectorias; un vapeador escoltando a una colilla arriba.
- `reports/cazando-colillas/puaj.png`: el final "¡puaj, un vapo!", la rana verde oscuro tosiendo vapor.
- `reports/cazando-colillas/resultado.png`: la pantalla de resultado.
- `reports/cazando-colillas/sprites.png`: los sprites en la herramienta.
