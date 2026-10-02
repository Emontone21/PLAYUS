# Reporte: Nach y la roca
Estado: completo y publicado
Fecha: 2026-10-02

## Qué hice

- **Simulación** (`src/games/nach-y-la-roca/rules.ts`): entera, a 60 ticks, compartida. La distancia es función del tick (velocidad de 8 a 20 m/s a los 90 s); el curso de filas de rocas se genera entero desde la semilla por distancia, con los tipos de la tabla (simple, doble desde los 200 m, par desde los 600, rodante desde los 1.000) y las garantías de justicia: siempre un carril libre (también mientras cruza una rodante), siempre 400 ms más 8 ticks por cambio entre fila y fila, y rodantes que avisan 1,2 s antes y nunca cierran el único carril libre. Cambio de carril de 8 ticks con la caja en origen y destino por mitades, cola de 1, tres vidas, invulnerabilidad de 1,5 s, traza `{ tick, dir }` y `validate` que la vuelve a jugar (decisiones 221 y 222).
- **Calibración** (decisión 223): espacio entre filas de 16 m a 5 m a los 600 m. El jugador modelo (reacciona 500 ms después de pasar la fila anterior, 3 % de errores) llega a 506 m y pierde las vidas a los 46 s; el lento (600 ms), 460 m a los 43 s; el de 400 ms y el perfecto aguantan los 120 s (1.854 m); sin moverse, 161 m a los 18 s.
- **Arte** (`sprites.ts`, `draw.ts`): perspectiva de corredor en un canvas chico fuera de pantalla escalado con vecino más cercano; calle de noche con carriles, cordones, edificios con neón y faroles que pasan; The Nach de espaldas con pinta de DJ (auriculares, gorra para atrás, campera oversize, mochila-parlante), caminata de dos cuadros, inclinación al cambiar, notitas; rocas grises con volumen y sombra, la rodante girando con su flechita; pedazos y "¡scratch!" al topar, parpadeo invulnerable; HUD con metros y tres vinilos; final sentado con "se le rayó el disco"; previa con The Nach y una roca; `prefers-reduced-motion` sin notas, pedazos ni saltito (decisión 224).
- **Control**: el detector de deslizamientos de rastitas pasó a `src/games/lib/swipe.ts` (rastitas lo usa desde ahí), con eje horizontal dominante y 24 px; flechas en la misma cola; `touch-action: none`.
- **Herramienta** (`/dev/juego/nach-y-la-roca`): vista desde arriba con el carril libre marcado, cajas de choque, cámara lenta, saltos a 200, 600 y 1.000 m, y los sprites por separado; `window.__nach` para el E2E.

## Archivos

- nuevos: `src/games/nach-y-la-roca/{rules,sprites,draw}.ts`, `index.tsx`, `dev.tsx`, `rules.test.ts`; `src/games/lib/swipe.ts`; `e2e/nach.spec.ts`, `e2e/helpers/nach.ts`; `reports/nach-y-la-roca/*.png`.
- modificados: `src/games/index.ts` (registro), `src/games/rastitas-rastotas/index.tsx` (usa el detector compartido), `src/games/README.md`, `src/app/dev/juego/[id]/page.tsx`, `src/lib/attempts.test.ts` (resultado válido), `e2e/helpers/group.ts` (el id del juego), `DECISIONS.md` (221 a 224).

## Tests

- `src/games/nach-y-la-roca/rules.test.ts` (16): determinismo (sin `Math.random`/`sin`/`cos`; misma semilla y traza, mismo resultado; replay igual); la velocidad y la tabla de distancia; en 1.000 semillas: toda fila con un carril libre (también mientras cruza la rodante), siempre el tiempo de 400 ms más 8 ticks por cambio (con el mínimo exacto), las rodantes a 1,2 s y sin cerrar el único libre, los tipos según la tabla y los pares a lo justo más 6 ticks; las reglas (8 ticks con la caja por mitades, el borde, la cola de 1, topar resta una vida y rompe la roca, 1,5 s de invulnerabilidad, tres vidas terminan en ese tick, esquivar y la rodante en su destino); `validate` (acepta trazas reales con su duración; rechaza metros inflados, ticks fuera de orden, `dir` inválido, otra semilla, fin fuera de rango o incoherente, y acepta un corte por tiempo); la calibración; el arte.
- `e2e/nach.spec.ts`: el curso y `simulate` dan exactamente lo mismo en el navegador y en Node (6 semillas: las primeras 20 filas, la traza del jugador modelo, metros, vidas, tick de fin, carril y rocas rotas); la previa, el área (`touch-action: none`, sin selección), los sprites y la vista desde arriba en la herramienta, las flechas (y contra el borde nada) y un deslizamiento con el mouse; en una ronda real, esquivar las primeras seis filas con la traza calculada en el test y toparse con tres rocas llega al ranking con los metros exactos ("N m"), y la traza se rearma en Node.
- `npm test`: 299 de 299 (26 archivos). `typecheck`, `lint` y `npm run build`: limpios. `e2e/rastas.spec.ts` sigue pasando con el detector compartido.

## Capturas

En `reports/nach-y-la-roca/`: `previa.png` (la pantalla previa con la herramienta), `sprites.png` (The Nach y las rocas por separado), `300m.png` (a los 300 m), `1000m.png` (a los 1.000 m con una rodante cruzando), `vida-perdida.png` (el "¡scratch!" con el vinilo apagado), `final.png` y `resultado.png` ("se le rayó el disco"), `desde-arriba.png` (la vista desde arriba de la herramienta).

## Publicación

Publicado en https://playus-lake.vercel.app (commit `7f91cf8`). Comprobado en producción con el E2E de la ronda real contra producción (un grupo de prueba con el juego puesto como juego de hoy): la partida llega al ranking con los metros, y `/dev/juego/nach-y-la-roca` da 404.

## Cómo verificarlo

1. Hoy, con Nach y la roca como juego del día: deslizar cambia de carril; las rocas se ven venir con su sombra; al topar, "¡scratch!" y un vinilo apagado; a la tercera, "se le rayó el disco" y los metros en el ranking.
2. En local: `http://localhost:3000/dev/juego/nach-y-la-roca?seed=abc&cajas=1` (y `&lento=1`, `&desde=1000`); `npx vitest run src/games/nach-y-la-roca`; `npx playwright test e2e/nach.spec.ts`.

## Problemas y deuda

- La justicia garantiza 400 ms más el tiempo de los cambios, pero la caja de choque se mueve a los 4 ticks del cambio, así que en la práctica hay ~70 ms más de margen; un jugador que reacciona en 400 ms no pierde nunca. Si el juego resulta fácil para los buenos, el espacio entre filas (`GAP_*`) se ajusta y el test de calibración lo mide.
- Las rocas rodantes recién aparecen a los 1.000 m (unos 65 s): solo las ven los jugadores que reaccionan en menos de medio segundo.
