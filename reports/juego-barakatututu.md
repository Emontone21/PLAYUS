# Juego nuevo: Barakatututu

Publicado en producción (https://playus-lake.vercel.app) el 2026-10-09.

## Qué es

El negro toto toca un patrón de candombe en su tambor y hay que repetirlo tocando la pantalla con el mismo tiempo. Cada ronda es más larga y más rápida; errar (adelantarse, atrasarse, un golpe de menos o de más) termina la partida con "quedate quieto mano". Visual, sin sonido: el pulso se ve en la lonja y en la regla del compás. 180 segundos; el puntaje son las rondas superadas.

- Módulo `src/games/barakatututu/` (`rules.ts` biblioteca de frases, rondas, ventanas, corrección, partida en ms, traza y `validate`; `sprites.ts`, `draw.ts`, `index.tsx`, `dev.tsx`). Decisiones 272 a 274.
- Patrones: una biblioteca de 12 frases de un compás en semicorcheas, simplificaciones inspiradas en los toques del candombe (la madera, y versiones reducidas del chico, el repique y el piano), no transcripciones; dicho en el código y en DECISIONS. Cada ronda encadena frases según la tabla (1–2: 1 compás, 3–4 golpes, 95 bpm; 3–5: 5–6, semicorcheas, 105; 6–8: 2 compases, 7–9, contratiempos, 115; 9–12: 10–12, madera, 125; 13+: 12–14, combinaciones, 128 subiendo 3 por ronda hasta 140). Semilla de grupo: todos ven los mismos patrones en el mismo intento.
- Margen: ±85 ms por golpe (`WINDOW_MS`); se juzga en orden contra el primer golpe esperado sin usar; "justo" a menos de 42 ms. Error: fuera de toda ventana o una ventana que pasa sin tocar.
- Corrección por dispositivo: la cuenta inicial se repite hasta que el jugador toca 4 veces con los pulsos; la mediana de las diferencias (tope ±60) se le resta a todos sus toques; los 4 toques van en la traza y `validate` calcula la misma corrección. Las ventanas se miden en tiempo corregido también para el golpe que falta.
- Tramos: El negro toto toca, la cuenta "1, 2, 3, 4", tu turno (los compases más 85 ms) y el resultado (800 ms). Los toques fuera del turno se ignoran. Errar muestra a El negro toto enojado 1 s y llama a `onFinish`; a los 180 s la ronda en curso no cuenta.
- Calibración: el modelo (25 ms de demora, ±55 ms de desvío que crece 4 ms por ronda) pasa 8 rondas de mediana (p10 6, p90 10); el fino 15; el torpe 4. Cota 18.
- Control: tocar en cualquier parte cuenta en el `pointerdown`; un dedo; clic y barra espaciadora en escritorio (sin repetir); `touch-action: manipulation`.
- Arte: calle de Barrio Sur de noche (fachadas de conventillo, banderas de comparsa, guirnaldas), la regla con los pulsos, el cursor y las marcas (las de El negro toto mientras toca; las tuyas en agua, luciérnaga o lengua), El negro toto con su tambor colgado y el tambor grande cuya lonja destella (amarillo para él, más fuerte en los tiempos; agua para vos) con un anillo chico que se expande. Con reducir movimiento, sin anillos ni guirnaldas animadas. El personaje es un tamborilero de comparsa dibujado como el resto de la app, con dignidad y sin caricatura.
- Herramienta `/dev/juego/barakatututu?seed=…&cajas=1&lento=1&desde=N`: biblioteca, patrones en semicorcheas, ventanas sobre la regla, cámara lenta ×0,5, saltos a la ronda 1, 6, 9 y 13, caras.

## Comprobaciones

- `vitest`: 13 tests del juego (biblioteca; `candombeRounds` determinística y la tabla en 1.000 semillas; ventanas: 84 bien y 86 error, de más y faltó; corrección: 40 ms consistentes dan 40 y el patrón atrasado pasa, tope ±60, mediana; reglas: tramos, toques fuera de turno ignorados, pasar suma 1, errar termina, cierre a los 180 s y cota; `validate` acepta partidas reales y rechaza cada caso pedido; calibración; arte). Suite completa en verde; `eslint`, `tsc` y `next build` limpios.
- E2E local (`e2e/baraka.spec.ts`, 3 tests): patrones y partida del modelo idénticos en navegador y Node en 5 semillas; previa, herramienta, área (`touch-action`), la cuenta con la barra espaciadora (sin repetir al mantenerla) y un toque fuera de turno ignorado; ronda real que hace la cuenta, pasa tres rondas con los toques calculados en el test desde `candombeRounds`, erra la cuarta con un golpe de más y llega al ranking con puntaje 3, la traza reproducida en Node.
- E2E en producción (`SUPABASE_CLI=supabase@2.119.0 E2E_BASE_URL=https://playus-lake.vercel.app npx playwright test e2e/baraka.spec.ts -g "ronda real"`): en verde (59 s) contra el deploy `playus-iaklbyt3d`: grupo nuevo con el juego del día puesto en la base, la cuenta de ajuste, tres rondas pasadas con los toques del test, la cuarta errada, puntaje 3 en el ranking y la traza reproducida en Node.
- `/dev/juego/barakatututu` responde 404 en producción sin sesión de admin.
- Juego de hoy (2026-10-09) en todos los grupos de producción: puesto con `admin_set_today_game` (una transacción por grupo, registro en `admin_actions`), 21 grupos, 1 ronda cambiada (1 intento borrado, en "asd") y 20 creadas; verificado en la base: 22 rondas de hoy con `barakatututu` (las 21 más la del grupo del E2E de producción, con su intento), la semilla de la fórmula.

## Capturas

- `reports/barakatututu/previa.png`: la pantalla previa.
- `reports/barakatututu/toto-toca.png`: El negro toto tocando, con las marcas del patrón en la regla.
- `reports/barakatututu/cuenta.png`: la cuenta 1, 2, 3, 4.
- `reports/barakatututu/tu-turno.png`: tu turno, con las marcas de colores y la lonja en agua.
- `reports/barakatututu/eso-mano.png`: "¡eso, mano!" al pasar la ronda.
- `reports/barakatututu/quedate-quieto.png`: el final "quedate quieto mano".
- `reports/barakatututu/sprites.png`: las caras de El negro toto y el tambor.
