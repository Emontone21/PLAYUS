# Cómo agregar un juego

Un juego es **un archivo** en `src/games/` que exporta un `GameModule`, más **una línea** en `src/games/index.ts`. Nada más del sistema se toca: la rotación diaria, la semilla, el cronómetro, el envío del puntaje, la validación y el ranking ya están.

## El contrato en cuatro reglas

1. **La semilla manda.** Todo lo aleatorio sale de `seed` con `rngFromSeed(seed)` de `src/lib/rng.ts`. Nunca `Math.random()`. Dos jugadores del mismo grupo el mismo día tienen que ver exactamente el mismo tablero.
2. **El juego no sabe nada del resto.** Recibe `seed`, devuelve `score`. No conoce grupos, usuarios, rankings ni base de datos.
3. **El cronómetro es del sistema.** El contenedor arranca a contar cuando llamás a `onReady()` y corta la partida cuando se acaba `durationMs`. Cuando corta, usa el último resultado que informaste con `onProgress(...)`. Si tu juego puede ser cortado por tiempo, llamá a `onProgress` cada vez que cambie el puntaje; si siempre termina antes por su cuenta, alcanza con `onFinish`.
4. **Hooks como `React.useState`, no `import { useState }`.** El servidor importa tu módulo para leer los límites y Next rechaza los hooks importados por nombre fuera de un Client Component. Escribí `import * as React from "react"` y usá `React.useState`, `React.useEffect`, etc.

## Paso a paso

1. Creá `src/games/mi-juego.tsx` (ver el ejemplo de abajo).
2. Agregá una línea en `src/games/index.ts`:
   ```ts
   import { miJuego } from "./mi-juego";
   const ALL: GameModule[] = [tapRace, reflejo, miJuego];
   ```
3. Probalo sin servidor en `http://localhost:3000/dev/juego/mi-juego?seed=loquesea`. Cambiá la semilla y confirmá que cambia el tablero; repetí la misma semilla en otra ventana y confirmá que es idéntico.
4. Listo. Desde mañana entra en el mazo de todos los grupos (el mazo se calcula sobre los ids ordenados alfabéticamente; los días pasados no cambian).

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
| `validate?(result, seed)` | chequeo propio sobre `events`. Devolvé `false` para rechazar. El servidor lo llama después de las cotas. |
| `Component` | el juego. Recibe `GameProps`. |

`GameProps`: `seed`, `onReady()`, `onFinish(result)`, `onProgress(result)`. `GameResult`: `{ score, events }`. `events` es tu traza para validar: un arreglo con lo mínimo para que `validate` pueda comprobar que el puntaje es coherente.

## Ejemplo comentado: `tap-race`

```tsx
// src/games/tap-race.tsx
import * as React from "react";                       // (regla 4)
import type { GameModule, GameProps, GameResult } from "./types";

function TapRace({ onReady, onProgress }: GameProps) {
  const [taps, setTaps] = React.useState(0);
  const startedAt = React.useRef<number | null>(null);
  const events = React.useRef<number[]>([]);          // la traza: ms de cada toque

  React.useEffect(() => {
    startedAt.current = performance.now();
    onReady();                                        // sin nada que cargar: listo al montar
  }, [onReady]);

  function tap() {
    events.current.push(Math.round(performance.now() - (startedAt.current ?? 0)));
    const next = taps + 1;
    setTaps(next);
    onProgress({ score: next, events: [...events.current] }); // el sistema corta por tiempo
  }                                                            // y usa este último parcial

  return (
    <button type="button" onPointerDown={tap} className="h-full w-full">
      {taps}
    </button>
  );
}

function validate(result: GameResult): boolean {     // coherencia de la traza
  const events = result.events as unknown[];
  return events.length === result.score;
}

export const tapRace: GameModule = {
  id: "tap-race",                                     // estable, va a la base
  name: "tap race",
  tagline: "quince segundos. tocá lo más rápido que puedas.",
  howTo: ["tocá la pantalla todas las veces que puedas", "se cuenta cada toque", "gana el que más toca"],
  durationMs: 15_000,
  scoring: "high",
  maxPlausibleScore: 200,
  validate,
  Component: TapRace,
};
```

`reflejo` (`src/games/reflejo.tsx`) muestra el otro caso: termina antes por su cuenta con `onFinish`, deriva sus esperas de la semilla con `rngFromSeed`, usa `scoring: 'low'`, `minDurationMs` y `minPlausibleScore`, y su `validate` recalcula las esperas desde la semilla para comprobar la traza.

## Qué evitar

- `Math.random()`, `Date.now()` como fuente de azar, o cualquier cosa que cambie entre dos jugadores con la misma semilla.
- Cronómetros propios que "terminen" la partida por tiempo: eso lo hace el contenedor. Sí podés medir tiempos internos (reacciones, etc.).
- Guardar estado fuera del componente (módulo, `localStorage`): cada partida monta el componente de cero.
- Cambiar `id`, `durationMs` o `scoring` de un juego que ya se jugó: rompe la comparación con las rondas pasadas. Si hace falta, es un juego nuevo con otro id.
