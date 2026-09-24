// TEMPORAL: juego de relleno. Existe para probar el contrato, la rotación
// diaria y la validación con scoring 'high'. Se reemplaza por un juego real.
// Es también el ejemplo comentado de src/games/README.md.

// Los juegos usan `React.useState` y no `import { useState }`: el servidor
// importa este módulo para leer los límites (decisión 8) y Next rechaza los
// hooks importados por nombre fuera de un Client Component.
import * as React from "react";
import type { GameModule, GameProps, GameResult } from "./types";

function TapRace({ onReady, onProgress }: GameProps) {
  const [taps, setTaps] = React.useState(0);
  // la traza: el instante (ms desde el inicio) de cada toque
  const startedAt = React.useRef<number | null>(null);
  const events = React.useRef<number[]>([]);

  // Este juego no carga nada: está listo al montarse.
  React.useEffect(() => {
    startedAt.current = performance.now();
    onReady();
  }, [onReady]);

  function tap() {
    const t = Math.round(performance.now() - (startedAt.current ?? performance.now()));
    events.current.push(t);
    const next = taps + 1;
    setTaps(next);
    // el contenedor usa el último parcial cuando corta por tiempo
    onProgress({ score: next, events: [...events.current] });
  }

  return (
    <button
      type="button"
      onPointerDown={tap}
      className="flex h-full w-full select-none flex-col items-center justify-center gap-2 bg-superficie"
      data-testid="tap-area"
    >
      <span className="text-8xl font-extrabold tabular-nums" data-testid="tap-count">
        {taps}
      </span>
      <span className="text-tinta-suave">tocá, tocá, tocá</span>
    </button>
  );
}

// Validación mínima sobre la traza: tantos toques como puntaje, en orden.
function validate(result: GameResult): boolean {
  const events = result.events as unknown[];
  if (events.length !== result.score) return false;
  let prev = -1;
  for (const e of events) {
    if (typeof e !== "number" || e < prev) return false;
    prev = e;
  }
  return true;
}

export const tapRace: GameModule = {
  id: "tap-race",
  name: "tap race",
  tagline: "quince segundos. tocá lo más rápido que puedas.",
  howTo: ["tocá la pantalla todas las veces que puedas", "se cuenta cada toque", "gana el que más toca"],
  durationMs: 15_000,
  scoring: "high",
  // 13 toques por segundo es el récord mundial con un dedo; nadie hace 200
  maxPlausibleScore: 200,
  validate,
  Component: TapRace,
};
