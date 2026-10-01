# Reporte: colillas, nuevo reparto y gráfica de la temporada
Estado: completo y publicado
Fecha: 2026-10-01

## Qué hice

1. **Colillas.** "Puntos" pasa a "colillas" en toda la interfaz: el ranking del día (chip "+25" con el ícono y el texto "jugar suma 5 colillas. el 1.º suma 20 más, el 2.º 15, el 3.º 11, el 4.º 8, el 5.º 6, el 6.º 4 y del 7.º en adelante, 2."), la tabla de la temporada ("50 colillas" con el ícono y "N días ganados"), el perfil (el texto del mail) y los estados vacíos. El ícono es una colilla en pixel art (16 × 7, pucho aplastado con filtro naranja) hecha con el sistema de mapas de píxeles de la rana (`src/components/colilla.tsx`). En el código siguen siendo `points` (decisión 214). Los "puntos" que quedan son los del snake, que son puntaje del juego, no de la temporada.
2. **El reparto nuevo** en una sola tabla (`POINTS_RULES` en `src/lib/scoring.ts`): 5 por jugar más 20 / 15 / 11 / 8 / 6 / 4 por el puesto y 2 del 7.º en adelante; empates como antes. Como las colillas nunca se guardan (se calculan desde los intentos), la temporada en curso quedó con el reparto nuevo desde el día 1 sin tocar la base; las cerradas antes del cambio se leen con el reparto viejo (`rulesForSeason`, decisión 215). Días ganados y desempate: ya existían (más días ganados); el título compartido se agregó para la vista de temporada cerrada (`champions()`, decisión 216).
3. **La gráfica de la temporada** arriba de la tabla en Grupo: SVG propio sin librerías (`src/components/season-chart.tsx`) con la geometría y los datos en `src/lib/chart.ts` (puro): todos los días de la temporada en X con marca cada 5 y las fechas cortas, Y con 3 o 4 marcas redondas, una línea por integrante con las colillas acumuladas por día cerrado (la tuya más gruesa, encima, con el punto final en `--agua`), interpolación monótona (Fritsch–Carlson), paleta de 8 colores por orden de ingreso sin `--agua`, la línea de hoy, la ficha al tocar o arrastrar (un dedo; el scroll vertical sigue), el `aria-label` con el resumen, el encabezado con "quedan X días", el selector de temporadas anteriores con la corona del campeón y el estado vacío con la rana dormida. Sin animación. Detalles en la decisión 217.
4. **Datos:** sin migración. `src/lib/season-series.ts` lee rondas, intentos e integrantes con el cliente del usuario, así RLS decide: alguien de otro grupo obtiene una gráfica vacía; solo entran los días anteriores a hoy (nada de hoy se muestra). La tabla de abajo lleva la flecha de subida o bajada respecto del día anterior, el color de la línea al lado del nombre, "N días ganados" y las colillas con el ícono.

## Archivos

- nuevos: `src/lib/chart.ts`, `src/lib/chart.test.ts`, `src/lib/season-series.ts`, `src/components/season-chart.tsx`, `src/components/colilla.tsx`, `src/app/(app)/grupo/season-picker.tsx`, `e2e/temporada.spec.ts`, `reports/colillas/*.png`.
- modificados: `src/lib/scoring.ts` (la tabla `POINTS_RULES`, `rulesForSeason`, `champions`), `src/lib/scoring.test.ts`, `src/lib/rounds.ts` (`seasonRounds`, el reparto por temporada), `src/lib/group-summary.ts` (temporada elegida, series, selector), `src/components/ranking.tsx` (ícono, color, flecha), `src/app/(app)/grupo/page.tsx`, `src/app/(app)/hoy/page.tsx`, `src/app/(app)/perfil/link-email.tsx`, `src/app/globals.css` (comentario), `src/lib/attempts.test.ts` (RLS de la gráfica), `e2e/{ronda,larry,remar,tarado}.spec.ts` ("+25"), `DECISIONS.md` (214 a 217).

## Tests

- **Reparto** (`scoring.test.ts`): puestos del 1 al 9 según la tabla; no jugar da 0; jugar y salir último da al menos 7; dos empatados en el 1.º se llevan 25 y el siguiente es 3.º con 16; tres empatados en el 2.º se llevan 20 y el siguiente es 5.º con 11; el reparto viejo para las temporadas cerradas antes del cambio y el vigente para la en curso.
- **Días ganados y desempate**: cuentan los empates en el 1.º; por días ganados y, si persiste, título compartido.
- **Gráfica** (`chart.test.ts`): la interpolación monótona nunca da menos que el punto anterior ni más que el siguiente y pasa por los puntos; quien entró a mitad de temporada arranca en su día de ingreso (en 0 si no jugó); el día de hoy no aparece; una temporada cerrada cuenta todos sus días; la flecha; los colores estables por orden de ingreso, 8 distintos y sin `--agua`; las marcas del eje; las fechas cortas; el resumen del `aria-label`.
- **RLS** (`attempts.test.ts`, contra la base local): un integrante lee la gráfica; alguien de otro grupo no ve rondas ni integrantes y la gráfica queda vacía. Los pgTAP de aislamiento ya existentes cubren las tablas de base.
- **E2E** (`e2e/temporada.spec.ts`, con fecha simulada): el estado vacío; el ranking del día con "+25" y el ícono y sin "puntos"; con dos días cerrados la gráfica con dos líneas (la tuya marcada), la línea de hoy, el `aria-label`, la tabla con colillas, ícono, color y días ganados; la ficha al tocar un día (y se oculta al soltar); 30 días después la temporada se cierra y se consulta "temporada 1" con la corona.
- `npm test`: 266 de 266 (24 archivos). `typecheck`, `lint` y `npm run build`: limpios. `e2e/ronda.spec.ts` (el flujo completo de un día): pasa.

## Capturas

En `reports/colillas/`: `grafica.png` (la gráfica con datos y la tabla), `ficha.png` (la ficha al tocar un día), `vacio.png` (el estado vacío), `cerrada.png` (una temporada cerrada con la corona) y `ranking-dia.png` (el ranking del día con los chips de colillas).

## Publicación

Publicado en https://playus-lake.vercel.app. Comprobado en producción que Grupo carga con la gráfica y la tabla en colillas.

## Cómo verificarlo

1. Grupo: la gráfica arriba, tocar un día muestra la ficha; la tabla dice colillas con el ícono y "N días ganados"; "temporada N" con los días que quedan. Si hay una temporada cerrada, el selector la muestra con la corona.
2. Hoy, después de jugar: el chip "+25" (o lo que corresponda) con el ícono, y el texto del reparto.
3. En local: `npx vitest run src/lib/scoring.test.ts src/lib/chart.test.ts`; `npx playwright test e2e/temporada.spec.ts` (con `CAPTURAS=1` guarda las capturas).

## Problemas y deuda

- El título compartido se muestra en la vista de la temporada cerrada, pero la corona de la temporada siguiente la lleva uno solo (la columna `winner_profile_id` guarda un campeón). Si hace falta, es una migración chica.
- La gráfica de una temporada cerrada deja las líneas planas en los días en que nadie abrió la app (no hay ronda): es correcto, pero se nota en grupos poco activos.
