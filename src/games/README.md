# Cómo agregar un juego

Un juego es **un archivo** en `src/games/` que exporta un `GameModule`, más **una línea** en `src/games/index.ts`. Nada más del sistema se toca: la rotación diaria, la semilla, el cronómetro, el envío del puntaje, la validación y el ranking ya están.

## El contrato en cuatro reglas

1. **La semilla manda.** Todo lo aleatorio sale de `seed` con `rngFromSeed(seed)` de `src/lib/rng.ts`. Nunca `Math.random()`. La semilla es **por intento**: `hash(semilla de la ronda + ':' + número de intento + ':' + un secreto del servidor)`. Dos jugadores del mismo grupo, el mismo día y en el mismo número de intento ven exactamente el mismo tablero; el segundo intento de cada uno es otro tablero (el mismo para todos en su segundo intento). El juego no se entera de nada de esto: recibe `seed` y listo. La semilla la entrega solo `/api/rounds/:id/start` al empezar la partida; no viaja en la página ni se guarda en la base.
2. **El juego no sabe nada del resto.** Recibe `seed`, devuelve `score`. No conoce grupos, usuarios, rankings ni base de datos.
3. **El cronómetro es del sistema.** El contenedor arranca a contar cuando llamás a `onReady()` y corta la partida cuando se acaba `durationMs`. Cuando corta, usa el último resultado que informaste con `onProgress(...)`. Si tu juego puede ser cortado por tiempo, llamá a `onProgress` cada vez que cambie el puntaje; si siempre termina antes por su cuenta, alcanza con `onFinish`.
4. **Hooks como `React.useState`, no `import { useState }`.** El servidor importa tu módulo para leer los límites y Next rechaza los hooks importados por nombre fuera de un Client Component. Escribí `import * as React from "react"` y usá `React.useState`, `React.useEffect`, etc.

## Paso a paso

1. Creá `src/games/mi-juego.tsx` (ver el ejemplo de abajo).
2. Agregá una línea en `src/games/index.ts`:
   ```ts
   import { miJuego } from "./mi-juego";
   const ALL: GameModule[] = [pibaDelIpa, miJuego];
   ```

3. Probalo sin servidor en `http://localhost:3000/dev/juego/mi-juego?seed=loquesea`. Cambiá la semilla y confirmá que cambia el tablero; repetí la misma semilla en otra ventana y confirmá que es idéntico.
4. Listo. Desde mañana entra en el mazo de todos los grupos (el mazo se calcula sobre los ids ordenados alfabéticamente; los días pasados no cambian).

## Pautas para juegos reales

Los juegos que hay son `piba-del-ipa` (el ejemplo de referencia, ver abajo), `quedo-re-tarado` (un solo dedo, 200 toques, con `Result` propio y un `validate` que mira el ritmo) `los-deseos-de-larry` (una simulación entera a 60 ticks por segundo que corre igual en el navegador y en Node; la traza son los cambios de objetivo del dedo por tick y `validate` vuelve a jugar la partida entera) `remar-vuelve-a-casa` (el mismo esquema, con el río generado por distancia y `unit: "m"`) `la-parrilla-del-bro` (un cronograma puro por semilla que el cliente recorre con el reloj, toques de un solo dedo y `validate` que lo vuelve a recorrer) `pegandole-al-jota` (un juego de interfaz sin canvas: DOM, teclado propio y pixel art en SVG; la serie sale de la semilla y `validate` revisa respuestas y tiempos) `caminando-por-18` (el esquema de Larry y remar con toques de un dedo: la calle se genera con garantías de justicia y `validate` vuelve a jugar los toques) `rastitas-rastotas` (un snake: la grilla, los sorteos que dependen del estado y las oleadas de piojos con conexión comprobada viven en `rules.ts`, `validate` vuelve a jugar los giros, y las rastas se rasterizan como un tubo continuo en `rasta.ts`) y `pisteando-el-sunny` (un auto que derrapa por una ruta en zigzag en el vacío: simulación en enteros con una tabla de senos, la ruta generada con garantía de que el conductor automático la completa, `validate` que vuelve a correr los cambios del control, y la única excepción al pixel art: 3D low-poly con `three`, cargado con `import()` solo en ese juego). Las piezas compartidas están en `src/games/lib/`: reloj de paso fijo, arrastre con un dedo, toques de un dedo con los controles contra autoclickers (`taps.ts`), escala del canvas, traza, sprites y una fuente de 3 × 5. Un juego nuevo puede usarlas tal cual. Para los que vengan, dos cosas más allá del contrato:

1. **Que saber cómo viene la partida dé la menor ventaja posible.** Alguien puede haber jugado ya ese mismo número de intento y contarte cómo viene, o vos podés haber jugado tu primer intento y saber qué esperar del segundo (no: es otra semilla, pero el *tipo* de desafío se repite). Diseñá para que conocer la secuencia ayude poco: que el puntaje dependa de ejecutar (velocidad, precisión, memoria en el momento) más que de saber de antemano; que la información útil aparezca recién cuando hace falta; que no haya un "camino correcto" memorizable de principio a fin. Un juego de reacción donde el verde aparece a los 3, 5 y 4 segundos se gana con un cronómetro en la otra mano; uno donde hay que tocar el objetivo que se enciende entre varios, no tanto.

2. **Usá `validate` sobre `events` para frenar puntajes imposibles.** Las cotas (`minPlausibleScore`, `maxPlausibleScore`) son la red gruesa; `validate(result, seed)` es la fina. Guardá en `events` lo mínimo para recomputar el puntaje desde la traza y comprobarlo contra la semilla del intento (la misma que recibió el juego): que la cantidad de eventos cierre con el puntaje, que los tiempos sean crecientes y humanos, que cada respuesta corresponda a algo que la semilla realmente generó. Si `validate` devuelve `false`, el servidor rechaza el resultado y el intento se pierde igual. Cuanto más recomputable sea tu puntaje desde `events` + `seed`, menos vale mandar un número inventado.

## Los campos de `GameModule`

| campo | qué es |
| --- | --- |
| `id` | slug estable (`^[a-z0-9][a-z0-9-]{0,39}$`). Queda guardado en la base: **nunca lo cambies**. |
| `name`, `tagline`, `howTo` | lo que ve el jugador en la pantalla previa. `howTo` son 2 o 3 pasos cortos, en voseo y minúscula. |
| `durationMs` | duración máxima. El contenedor corta ahí. |
| `minDurationMs?` | si el juego termina antes por diseño, cuánto dura como mínimo una partida honesta. Default: `durationMs - 2000`. |
| `scoring` | `'high'` gana el más alto, `'low'` gana el más bajo. |
| `maxPlausibleScore` | cota superior: el servidor rechaza puntajes mayores. |
| `minPlausibleScore?` | cota inferior (ej. 100 ms de reacción). Default 0. |
| `unit?` | unidad del puntaje para el ranking, el historial y los avisos (ej. `"m"`). Si falta, los de `'low'` muestran `ms` y los de `'high'` nada. |
| `validate?(result, seed, meta?)` | chequeo propio sobre `events`. Devolvé `false` para rechazar. El servidor lo llama después de las cotas, con la **semilla del intento** (la misma que recibió tu componente) y `meta.elapsedMs`, la duración real del intento medida en el servidor (desde `/start`, con la cuenta regresiva). |
| `Component` | el juego. Recibe `GameProps`. |
| `Intro?` | opcional: un bloque extra para la pantalla previa, debajo de las instrucciones (la piba muestra la ficha "así es ella"; el tarado, la cara del intento). Recibe `seed`. |
| `Result?` | opcional: la pantalla de resultado propia, en lugar del puntaje grande (el tarado muestra "18,4 s" o "te faltaron N toques" con la cara final). Recibe `result`, `seed` y `cutByTimer`. |

`GameProps`: `seed` (la del intento), `onReady()`, `onFinish(result)`, `onProgress(result)`. `GameResult`: `{ score, events }`. `events` es tu traza para validar: un arreglo con lo mínimo para que `validate` pueda comprobar que el puntaje es coherente.

## El ejemplo de referencia: `piba-del-ipa`

Es el modelo para los que vengan (`src/games/piba-del-ipa/`):

- `map.ts`: la generación **pura** del tablero a partir de `seed` (`generateMap(seed, índice)`), sin DOM ni React, en unidades lógicas. La usan el cliente para dibujar y el servidor para validar.
- `rules.ts`: las reglas de la partida, también puras y **compartidas**: `applyTap` (qué pasa con cada toque), `simulate` (recorre la traza) y `validate` (el punto de extensión del contrato: recalcula el puntaje desde `events` y la semilla del intento, y compara). Una sola implementación para los dos lados.
- `draw.ts`: el dibujo en `<canvas>` con escalado entero.
- `index.tsx`: el componente (`React.useState`, nunca `import { useState }`), la ficha de la pantalla previa (`Intro`) y el módulo exportado. Llama a `onReady()` al montar, informa cada toque con `onProgress`, y deja que el contenedor corte a los 60 s.
- `map.test.ts` y `rules.test.ts`: la generación es determinística y respeta sus garantías en 1.000 mapas; `validate` acepta la traza real y rechaza cada forma de inventar un puntaje.

Un esqueleto mínimo, para arrancar:

```tsx
// src/games/mi-juego.tsx
import * as React from "react";
import { rngFromSeed } from "@/lib/rng";
import type { GameModule, GameProps, GameResult } from "./types";

function MiJuego({ seed, onReady, onProgress }: GameProps) {
  const rng = React.useRef(rngFromSeed(seed)).current; // todo el azar sale de acá
  const startedAt = React.useRef<number | null>(null);
  const events = React.useRef<number[]>([]);
  const [score, setScore] = React.useState(0);

  React.useEffect(() => {
    startedAt.current = performance.now();
    onProgress({ score: 0, events: [] }); // un corte sin jugar vale 0
    onReady();                             // acá arranca el cronómetro
  }, [onReady, onProgress]);

  function act() {
    events.current.push(Math.round(performance.now() - (startedAt.current ?? 0)));
    const next = score + 1;
    setScore(next);
    onProgress({ score: next, events: [...events.current] }); // el contenedor usa el último parcial
  }

  return <button type="button" onPointerDown={act} className="h-full w-full">{score}</button>;
}

function validate(result: GameResult, seed: string): boolean {
  // recomputá el puntaje desde events + seed y compará; devolvé false para rechazar
  return Array.isArray(result.events) && result.events.length === result.score;
}

export const miJuego: GameModule = {
  id: "mi-juego",
  name: "mi juego",
  tagline: "una línea.",
  howTo: ["paso uno", "paso dos"],
  durationMs: 30_000,
  scoring: "high",
  maxPlausibleScore: 100,
  validate,
  Component: MiJuego,
};
```

## Qué evitar

- `Math.random()`, `Date.now()` como fuente de azar, o cualquier cosa que cambie entre dos jugadores con la misma semilla.
- Cronómetros propios que "terminen" la partida por tiempo: eso lo hace el contenedor. Sí podés medir tiempos internos (reacciones, etc.).
- Guardar estado fuera del componente (módulo, `localStorage`): cada partida monta el componente de cero.
- Cambiar `id`, `durationMs` o `scoring` de un juego que ya se jugó: rompe la comparación con las rondas pasadas. Si hace falta, es un juego nuevo con otro id.
