# Reporte: la torre (apilar con física)
Estado: completo en local, **sin publicar** (falta el nombre y el id definitivos)
Fecha: 2026-10-01

Nombre e id provisorios: "la torre" / `la-torre`. El id queda guardado en la base cuando una ronda lo usa, así que **no se publica hasta tener el definitivo**; cambiar el nombre y el id antes de publicar es tocar `id` y `name` en `src/games/la-torre/index.tsx` (y el texto de los tests E2E que buscan "la torre").

## Primer paso: el determinismo, confirmado

Antes de hacer el juego se comprobó que Rapier 2D determinístico (`@dimforge/rapier2d-deterministic-compat` 0.21, WASM con el binario adentro) da **exactamente lo mismo en Node y en el navegador**. El E2E `e2e/torre.spec.ts` corre el jugador automático en los dos lados para 24 semillas (partidas enteras, con giros, sueltas y la caída final) y 4 partidas de 120 s en modo libre (60 objetos cada una), y compara como texto la foto del mundo entera: posición, ángulo, velocidad lineal y angular y estado de sueño de cada cuerpo. Las 28 comparaciones son bit a bit iguales. Por eso la validación es **completa**: `validate` vuelve a jugar la traza con el mismo motor y exige la altura exacta, sin tolerancia (decisión 207).

## Qué hice

- **Motor** (`physics.ts`): el mundo en píxeles (1 px = 1 cm), gravedad 981, 60 pasos por segundo, la tabla de 60 × 6 como cuerpo fijo; los cuatro objetos como cuerpos dinámicos con formas compuestas que siguen la silueta (cajas y polígonos convexos), densidades y rozamientos pedidos, restitución 0, CCD. El motor se carga con `import()` solo acá (un test lo exige).
- **Reglas** (`rules.ts`): la secuencia y el vaivén desde la semilla (nunca más de dos iguales seguidos; onda triangular entre −38 y 38, cada vez más rápida); girar de a 90° y soltar sin velocidad; el próximo cuando la torre está quieta o a los 2 s; el puntaje como altura máxima en cm con la torre quieta 300 ms; fin cuando algo baja de la tabla (1 s de caída y `onFinish`); 120 s como máximo. La traza `{ tick, action }` y `check`/`validate` con todas las reglas pedidas (altura, orden, soltar antes de que aparezca, girar sin objeto, tick pasado el fin, duración real).
- **Arte** (`draw.ts`, `objects.ts`): pixel art en canvas con cada objeto pintado en un canvas chico y girado con vecino más cercano; tabla de madera, cámara que sube, regla cada 10 cm con la marca `--luciernaga` en la altura máxima quieta, guía punteada, "¡se vino abajo!", altura grande y el objeto siguiente arriba, previa con los cuatro objetos nombrados sobre la tabla; `prefers-reduced-motion` sin suavizado de cámara ni vaivén entre ticks.
- **Herramienta** (`/dev/juego/la-torre`): formas de choque, reposo por cuerpo, cámara lenta y modo libre; `window.__torre` para el E2E.
- **Contrato**: `validate` puede devolver una promesa y el servidor la espera (`src/lib/attempts.ts`).

## Calibración

Lo que el documento no fijaba está en las decisiones 208 a 210. Lo importante:

| jugador simulado | objetos (p25 / mediana / p75 / máx) | cm (mediana) | dura |
| --- | --- | --- | --- |
| modelo: 50 ms de demora, ±2 px + 2 por px/tick de vaivén, acuesta cigarro y botella | 4 / 6 / 8 / 13 | 41 | 10 s |
| flojo: 100 ms, ±3 + 3 | 3 / 4 / 6 / 8 | 25 | 7 s |
| perfecto | 14 / 19 / 24 / 41 | 184 | 26 s |
| sin mirar (suelta lo que venga) | 1 / 2 / 3 / 6 | 20 | 7 s |

La partida típica de 6 a 14 objetos corresponde a quien suelta con 2 o 3 px de error; la precisión es todo (el perfecto apila 19). Tres cosas hicieron falta para que una torre bien apilada aguante: contactos más rígidos (120 Hz: doce vapos se hunden medio px en vez de cinco), el doble de iteraciones del solver y algo de amortiguación; y el vapo pasó a ser la caja llena de 12 × 12 (una boquilla de 4 arriba hacía que todo se balanceara sobre ella).

**Replay en Node:** una partida de 120 s en modo libre (60 objetos soltados) se vuelve a jugar en 450 a 620 ms; una partida normal (6 a 13 objetos, 10 a 25 s) en menos de 100 ms.

## Archivos

- nuevos: `src/games/la-torre/{objects,physics,rules,draw}.ts`, `index.tsx`, `dev.tsx`, `rules.test.ts`; `e2e/torre.spec.ts`, `e2e/helpers/torre.ts`; `reports/la-torre/*.png`.
- modificados: `src/games/index.ts` (registro), `src/games/types.ts` y `src/lib/attempts.ts` (`validate` async), `src/games/README.md`, `src/app/dev/juego/[id]/page.tsx`, `src/lib/attempts.test.ts` (resultado válido de la torre), `e2e/ronda.spec.ts`, `e2e/helpers/group.ts` (68 intentos), `package.json` (Rapier), `DECISIONS.md` (207 a 211).

## Tests

- `src/games/la-torre/rules.test.ts` (25): determinismo Node contra Node (foto del mundo y traza iguales dos veces, replay igual); el motor solo con `import()` y el renderer sin tocar la física; replay de 120 s en menos de 2 s; área de cada forma contra los píxeles del mapa (menos del 15 %) y las medidas del documento; masas y rozamientos; secuencia sin tres iguales y vaivén dentro del rango; girar/soltar; el próximo objeto; el puntaje con la torre quieta 300 ms; el máximo no baja; la caída termina; el modo libre; casos de física a mano (doce vapos y ocho plantas en pie y dormidos, cigarro acostado aguanta, vapo con el centro fuera del borde se vuelca, fuera de la tabla se cae); `validate` acepta la traza real y rechaza altura ±1, otra semilla, ticks fuera de orden, acción después del fin, fin fuera de rango, sin cierre, acción inválida, soltar antes de que aparezca el próximo, girar sin objeto, fin que no es el de la caída, duración incoherente; la calibración (el modelo entre 6 y 14).
- `e2e/torre.spec.ts`: el determinismo navegador/Node (arriba) y la partida completa: previa, área sin scroll, el botón de girar de 64 px o más que gira de a 90°, y en una ronda real apilar tres objetos bien y tirar el cuarto al vacío: la altura que se ve es la que `/finish` mandó y la que Node recalcula, el servidor la acepta y llega al ranking como "N cm".
- `npm test`: 248 de 248 (23 archivos; el de intentos contra la base local ahora también cubre la torre con un resultado válido). `npm run build`, `typecheck` y `lint`: limpios. El E2E de la ronda real tardó 3 minutos (43 grupos hasta que tocó la torre).

## Capturas

En `reports/la-torre/`: `previa.png` (la pantalla previa con los cuatro objetos), `torre-8.png` (una torre de ocho objetos, con el cigarro y la botella acostados), `bamboleo.png` (la torre bamboleándose después de una suelta a un costado) y `caida.png` (la caída con el cartel).

## Cómo verificarlo

1. `http://localhost:3000/dev/juego/la-torre?seed=abc`: la previa con los cuatro objetos; jugar: tocar suelta, "girar" da vuelta; `&cajas=1&reposo=1` muestra las formas y el reposo; `&libre=1` deja seguir después de una caída; `&lento=1` cámara lenta.
2. `npx vitest run src/games/la-torre` y `npx playwright test e2e/torre.spec.ts` (con el stack local).

## Problemas y deuda

- **Sin publicar**: falta el nombre y el id definitivos. Cuando lleguen: cambiar `id` y `name` en `index.tsx` (y "la torre" en `e2e/torre.spec.ts`, `e2e/ronda.spec.ts`), correr los tests, publicar con `npx vercel deploy --prod --yes` y comprobar que `/dev/juego/<id>` da 404 en producción.
- El chunk del motor pesa unos 3,5 MB sin comprimir (el WASM en base64 adentro del paquete compat; comprimido queda en torno a 1 MB); se pide al empezar la partida y queda en caché. Si molesta, la variante no-compat carga el `.wasm` aparte, pero necesita configurar el bundler.
- Quien calcule la secuencia con la semilla del intento sabe qué objetos vienen; la altura depende de ejecutar (apuntar el vaivén), no de saber la secuencia.
