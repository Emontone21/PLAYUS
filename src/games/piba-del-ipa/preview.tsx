"use client";

// Solo desarrollo: un mapa de una semilla, con la opción de resaltar a la piba
// (rojo) y a los señuelos (amarillo). /dev/juego/piba-del-ipa?seed=…&map=N

import * as React from "react";
import { generateMap, MAP_H, MAP_W } from "./map";
import { drawMap, scaleFor } from "./draw";

export function MapPreview({ seed, mapIndex }: { seed: string; mapIndex: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [highlight, setHighlight] = React.useState(false);
  const map = React.useMemo(() => generateMap(seed, mapIndex), [seed, mapIndex]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const k = scaleFor(Math.min(window.innerWidth - 40, 420), window.innerHeight - 200, dpr);
    canvas.width = MAP_W * k;
    canvas.height = MAP_H * k;
    canvas.style.width = `${(MAP_W * k) / dpr}px`;
    canvas.style.height = `${(MAP_H * k) / dpr}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) drawMap(ctx, map, k, { smokeFrame: 1, highlight });
  }, [map, highlight]);

  const piba = map.people[map.pibaIndex]!;
  return (
    <div className="flex flex-col gap-3" data-testid="map-preview" data-scene={map.scene.kind}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} data-testid="preview-highlight" />
          resaltar a la piba y a los señuelos
        </label>
        <span className="text-tinta-suave">
          mapa {map.index}, {map.scene.kind}, {map.people.length} personas, {map.people.filter((p) => p.role === "senuelo").length} señuelos. piba en ({piba.x}, {piba.y}).
        </span>
      </div>
      <canvas ref={canvasRef} className="[image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} data-testid="preview-canvas" />
      <p className="text-xs text-tinta-suave">
        otros mapas de esta semilla:{" "}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <a key={i} href={`?seed=${encodeURIComponent(seed)}&map=${i}`} className="mr-2 text-agua">
            {i}
          </a>
        ))}
      </p>
    </div>
  );
}
