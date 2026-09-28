"use client";

// Solo desarrollo: la cara de una semilla con un control para saltar a cada
// estado (0, 25, 50, 75 y 100 %). /dev/juego/quedo-re-tarado?seed=…&estado=50

import * as React from "react";
import { faceFor, FACE_H, FACE_W, stageFor } from "./face";
import { drawFace, scaleFor } from "./draw";

const STATES = [0, 25, 50, 75, 100] as const;

export function FacePreview({ seed, initial = 0 }: { seed: string; initial?: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [pct, setPct] = React.useState<number>(STATES.includes(initial as (typeof STATES)[number]) ? initial : 0);
  const look = React.useMemo(() => faceFor(seed), [seed]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const k = scaleFor(Math.min(window.innerWidth - 40, 440), window.innerHeight - 220, dpr);
    canvas.width = FACE_W * k;
    canvas.height = FACE_H * k;
    canvas.style.width = `${(FACE_W * k) / dpr}px`;
    canvas.style.height = `${(FACE_H * k) / dpr}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) drawFace(ctx, look, { progress: pct / 100, smokeFrame: 1, ash: pct > 0 && pct < 100 ? 2 : 0 }, k);
  }, [look, pct]);

  return (
    <div className="flex flex-col gap-3" data-testid="face-preview" data-stage={stageFor(pct / 100)}>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="estado de la cara">
        {STATES.map((s) => (
          <button key={s} type="button" onClick={() => setPct(s)} className={s === pct ? "btn-primary-sm" : "btn-secondary-sm"} data-testid={`preview-state-${s}`}>
            {s}%
          </button>
        ))}
        <span className="text-sm text-tinta-suave">
          {look.hair}, {look.accessory}, piel {look.skin}
        </span>
      </div>
      <canvas ref={canvasRef} className="[image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} data-testid="preview-canvas" />
    </div>
  );
}
