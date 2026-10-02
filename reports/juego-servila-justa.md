# Reporte: servila justa
Estado: completo y publicado
Fecha: 2026-10-02

## Qué hice

- **Vasos y física** (`src/games/servila-justa/glasses.ts`, `rules.ts`): seis formas definidas por el ancho interior de cada fila, de las que sale el mapa de pixel art (dibujo y perfil son lo mismo; un test lo comprueba). Simulación entera a 60 ticks: caudal que arranca suave y sube durante el primer segundo (más fuerte en cada vaso siguiente), nivel por el volumen y el perfil, espuma que crece con el caudal, sigue subiendo al soltar según el caudal y el factor del vaso (los angostos más) y se asienta en un segundo; medición contra la raya; rebalse 0; 6 s sin apretar 0; pausa de 600 ms; puntaje 100 − 5 × filas (decisión 225).
- **Calibración** (decisión 226): el jugador modelo (suelta 150 ms después de que la espuma predicha llega a la raya, ±4 ticks) suma 624; el lento 576; el cauto con dos filas de margen 759; el perfecto 800. La partida dura unos 25 s.
- **Traza y `validate`**: `{ tick, action }` y el cierre; rechaza todo lo pedido (decisión 227).
- **Arte**: barra de noche, vaso grande con whisky, cola, espuma con burbujitas, cubitos y brillo; raya punteada con flechita; botella de Nix cola con etiqueta propia que se inclina con el caudal y suelta un chorro; carteles por vaso; HUD con "vaso N de 8", total y ocho puntitos; resumen con los ocho vasos; previa; `prefers-reduced-motion` sin burbujitas ni chorreo.
- **Control**: mantener apretado con un dedo (soltar, cancelar o salir del área corta), clic sostenido y barra espaciadora; `touch-action: none`.
- **Herramienta** (`/dev/juego/servila-justa`): perfiles, números, cámara lenta, salto a cualquier vaso y el modo de predicción de la espuma; `window.__servila` para el E2E.

## Archivos

- nuevos: `src/games/servila-justa/{glasses,rules,sprites,draw}.ts`, `index.tsx`, `dev.tsx`, `rules.test.ts`; `e2e/servila.spec.ts`, `e2e/helpers/servila.ts`; `reports/servila-justa/*.png`.
- modificados: `src/games/index.ts` (registro), `src/games/lib/font.ts` (letras l y x), `src/games/README.md`, `src/app/dev/juego/[id]/page.tsx`, `src/lib/attempts.test.ts` (resultado válido), `e2e/ronda.spec.ts` (ramas de servila y Nach), `e2e/helpers/group.ts` (el id), `DECISIONS.md` (225 a 227).

## Tests

- `src/games/servila-justa/rules.test.ts` (17): determinismo (sin `Math.random`; misma semilla y traza, mismo resultado; replay igual); los perfiles (el volumen coincide con el mapa; el nivel sube más rápido en la parte angosta; el caudal arranca suave y sube); la espuma (sigue subiendo al soltar y se asienta en un segundo; sube más con más caudal; los vasos angostos hacen más; la predicción acierta exacto); el puntaje (100 en la raya, corto y pasado iguales, 95 a 1 fila, 50 a 10; rebalsar 0 y corta; 6 s sin servir 0 y pasa); la secuencia (sin repetir forma, whisky y raya en rango); servir una sola vez y nada en la pausa; `validate` (acepta partidas reales con su duración; rechaza total inflado, dos servidos, eventos en la pausa, sin alternar, fuera de orden, otra semilla, fin fuera de rango o incoherente; acepta un corte por tiempo con los vasos que faltan en 0); la calibración; el arte (la botella dice nix cola).
- `e2e/servila.spec.ts`: la simulación da exactamente lo mismo en el navegador y en Node (6 semillas: los vasos, la traza del jugador modelo, el total y el resultado de cada vaso); la previa, el área, los seis perfiles en la herramienta, el mouse sostenido que sirve y suelta, y que el vaso ya servido no se sirve de nuevo; en una ronda real, servir los 8 vasos soltando cuando la predicción llega a la raya llega al ranking con el total exacto, y la traza se rearma en Node.
- `npm test`: 316 de 316 (27 archivos). `typecheck`, `lint` y `npm run build`: limpios.

## Capturas

En `reports/servila-justa/`: `previa.png` (la previa con la herramienta), `perfiles.png` (los seis vasos), `sirviendo.png` (un vaso sirviéndose con espuma y el chorro), `justa.png` (un "¡justa!"), `rebalso.png` (un "¡se rebalsó!" con la espuma por el costado) y `resumen.png` (el resumen final).

## Publicación

Publicado en https://playus-lake.vercel.app (commit COMMIT). Comprobado en producción con el E2E de la ronda real contra producción (un grupo de prueba con el juego puesto como juego de hoy): los 8 vasos llegan al ranking con el total, y `/dev/juego/servila-justa` da 404.

## Cómo verificarlo

1. Hoy, con servila justa como juego del día: mantener apretado sirve, soltar corta; la espuma sigue un poco; cartel por vaso y el total en el ranking.
2. En local: `http://localhost:3000/dev/juego/servila-justa?seed=abc&datos=1&prediccion=1` (y `&lento=1`, `&desde=4`); `npx vitest run src/games/servila-justa`; `npx playwright test e2e/servila.spec.ts`.

## Problemas y deuda

- La predicción exacta de la espuma está en la herramienta y en el dataset del área del juego (`data-predict`, para el E2E); un jugador que inspeccione la página puede leerla. Como la traza se valida igual y el puntaje máximo es 800, el daño es que alguien haga 800 sin aprender; para un juego entre amigos alcanza, y sacarlo del dataset es una línea si molesta.
- Los cubitos son decorativos y no cambian el volumen, como pide el documento.
