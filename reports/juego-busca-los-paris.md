# Reporte: décimo juego real, "buscá los Paris"
Estado: parcial
Fecha: 2026-10-01

## Qué hice

El décimo juego real está construido, probado y publicado en **https://playus-lake.vercel.app**. Desde la próxima ronda, el mazo de cada grupo reparte los diez juegos; la ronda de hoy no cambia. El estado es parcial por lo de siempre: "las cartas giran rápido y sin esperas" y "los pares parecidos confunden un poco" piden un teléfono y una persona de verdad. Todo lo demás está hecho y verificado, incluida una partida en producción.

**El juego.** Un memotest: cartas boca abajo, tocás dos y, si son iguales, quedan descubiertas y sumás un par; si no, se ven 600 ms y se tapan (o al instante si tocás una tercera). Al completar un tablero, "¡completo!" 400 ms y viene otro más grande: 2 × 3, 3 × 4, 4 × 4 y 4 × 5 de ahí en más. 60 segundos; gana el que más pares junta. Un par a medias al cortar no cuenta.

**Los dibujos (`drawings.ts`, decisión 196).** Diez dibujos de 16 × 16 como mapas de letras con colores, en una lista; el contorno oscuro se agrega solo alrededor de lo pintado, así agregar un dibujo es sumar una entrada (hay un comentario arriba de la lista que explica cómo, y un test lo prueba con un dibujo de prueba). Porro con brasa y humo, vapo con nubecita, gorro de chef con pliegues, hongo rojo con puntos, 24 grueso en amarillo, mema con tetina y leche, clipper de color sin marca, Sunny rojo de costado sin logos, vinilo con etiqueta amarilla y la fórmula en dos renglones ("C21H" / "30O2", en verde: los subíndices no entran en 16 píxeles). Los pares que se confunden a propósito: gorro y hongo, vapo y clipper, 24 y fórmula.

**Tableros (`boards.ts`, decisión 197).** `memoBoards(semilla)`: 12 tableros; cada uno baraja los ids con la semilla, se queda con los que necesita (el 4 × 5 lleva los diez; con más dibujos elegiría) y baraja las posiciones. Todo el grupo ve lo mismo en el mismo intento.

**Reglas y validación (`rules.ts`, decisiones 197 y 198).** `flip` es la simulación pura: carta inválida, descubierta o ya dada vuelta no cuentan; un par distinto a la vista se tapa en cuanto se toca otra (los 600 ms son solo del cliente); completar pasa al siguiente. La traza es cada carta dada vuelta, `{ t, board, card }`. `validate` rearma los tableros y vuelve a jugar: rechaza pares distintos del puntaje, cartas inválidas, tablero equivocado, tiempos fuera de orden o después de los 62 s, intervalos menores a 80 ms y demasiados aciertos a ciegas. **Aciertos a ciegas:** ninguna de las dos cartas vista antes de ese par. Umbral: 3 por partida más uno cada 3 pares, calibrado con jugadores honestos simulados (memoria perfecta, 70 % y 40 %, 20.000 partidas cada uno): mediana de 2 a 3 por partida, percentil 99,9 de 9, máximo 11; un honesto lo supera en el 0,00 % al 0,01 % de las partidas. Quien conoce el tablero acumula uno por par y queda afuera en el primer tablero. `maxPlausibleScore = 387` (62 s a dos toques de 80 ms por par).

**Interfaz (`index.tsx`, decisión 199).** DOM y los componentes de la app: cartas como botones con giro `rotateY` de 150 ms (al instante con `prefers-reduced-motion`), dorso en `--superficie` con la rana quieta y contorno grueso, frente claro con el dibujo, par descubierto con borde `--agua` y brillo. Las cartas miden de 64 a 84 px, calculadas para que el tablero entre entero: en 360 px el 4 × 5 queda de 76 px. Arriba "N pares" grande y "tablero N" chico. Un solo dedo (el registro de punteros compartido); un toque a menos de 80 ms del anterior no cuenta. La previa: dos cartas tapadas y un par de sunnys. El resultado: los pares y cuántos tableros completó.

**Rotación.** `src/games/index.ts` tiene los diez.

**Herramientas de desarrollo.** `/dev/juego/busca-los-paris?seed=…`: los dibujos en grande y en tamaño de carta, cualquier tablero descubierto y saltos al tablero 1 a 4 (`&desde=3`). Da 404 en producción.

**Capturas** en `reports/busca-los-paris/`: `previa.png`, `dibujos.png` (los diez en grande y en tamaño de carta), `tablero-2-a-mitad.png` (tres pares hechos, uno distinto a la vista) y `tablero-4-casi-completo.png` (nueve de diez pares).

## Archivos

- creados: `src/games/busca-los-paris/drawings.ts`, `boards.ts`, `rules.ts`, `index.tsx` y `dev.tsx`: el juego; `rules.test.ts` (8 tests).
- creados: `e2e/paris.spec.ts` (2 pruebas) y `e2e/helpers/paris.ts`.
- creados: las capturas de `reports/busca-los-paris/` y este reporte.
- modificados:
  - `src/games/index.ts`: los diez juegos.
  - `src/games/lib/font.ts`: las letras C, H y O.
  - `src/app/dev/juego/[id]/page.tsx`: la herramienta.
  - `src/lib/attempts.test.ts`: un resultado válido del juego.
  - `e2e/ronda.spec.ts`: sabe jugarlo; `e2e/helpers/group.ts`: 56 intentos.
  - `README.md`, `src/games/README.md` y `DECISIONS.md` (196 a 199).

## Decisiones nuevas

- **196.** Los dibujos como lista de mapas con contorno automático; la fórmula en dos renglones.
- **197.** Tableros y reglas: la simulación no depende del tiempo; cota 387.
- **198.** Aciertos a ciegas: 3 más uno cada 3 pares, calibrado con 60.000 partidas simuladas.
- **199.** Lo que el documento no decía (tamaños, dorso, previa, herramienta) y la limitación conocida.

## Desvíos del plan o del brief

- **La fórmula** va como texto en dos renglones en vez de "C₂₁H₃₀O₂" con subíndices o el hexágono de benceno: ninguna de las dos entra legible en 16 píxeles (196).
- **El salto a un tablero** en la herramienta arranca la simulación ahí: esa traza no valida (es solo para mirar).
- **"Tenés 60 segundos"**: el contenedor corta a los 60 s; el último toque se acepta hasta 2 s después, como en los otros juegos.

## Tests

- `npm test` (vitest): 211 de 211 en 21 archivos (los 8 del juego incluidos; las 1.000 semillas de tableros tardan 3 s).
- `e2e/paris.spec.ts`: 2 de 2 en local (la previa, los tableros iguales en el navegador y en Node, el primer tablero completo con cartas de 64 px o más; la ronda real con dos jugadores, que espera los 60 s). La suite entera no se volvió a correr esta vez: este juego no toca a los otros.
- `npm run build`, `npm run typecheck` y `npm run lint`: limpios.
- Producción: la ronda real de `e2e/paris.spec.ts` contra https://playus-lake.vercel.app pasó (dos jugadores, los pares validados por el servidor llegan al ranking). `/dev/juego/busca-los-paris` da 404 allá. El primer intento de deploy devolvió "Not authorized" (como otras veces) y el segundo salió.

## Cómo verificarlo en el navegador

1. En https://playus-lake.vercel.app, crear grupos hasta que Hoy diga "buscá los Paris". Cada grupo nuevo tiene una chance de diez.
2. Tocar "jugar". En la previa, dos cartas tapadas y un par de sunnys.
3. Tocar dos cartas: giran; si son iguales quedan con borde celeste; si no, se tapan a los 600 ms, o al instante si tocás otra.
4. Completar el tablero de 2 × 3: "¡completo!" y aparece el de 3 × 4. Arriba suben los pares.
5. A los 60 s, el resultado con los pares y los tableros completos, y el ranking en vivo.
6. En local, `http://localhost:3000/dev/juego/busca-los-paris?seed=reporte` para ver los dibujos y los tableros descubiertos.

## Problemas y deuda

- **Sin probar en un teléfono real**: si las cartas de 76 px se tocan cómodo, si el giro de 150 ms se siente rápido y si los pares parecidos confunden lo justo.
- **Los aciertos a ciegas** están calibrados con jugadores simulados; si en el uso real aparece un rechazo injusto, subir la base de 3 a 4 cuesta una línea.
- Siguen como deuda: el ranking del tarado en ms crudos, la unificación del cálculo de "te pasaron" y Vercel sin conectar a GitHub.

## Preguntas

- ninguna.

## Siguiente paso propuesto

Probar los diez juegos en el teléfono; en los Paris, el tamaño de las cartas y la velocidad del giro.
