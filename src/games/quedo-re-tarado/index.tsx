// "quedó re tarado": una cara de frente con un cigarro; cada toque lo consume.
// Son 200 toques y gana quien lo termina más rápido. Un solo dedo. Si se acaba
// el tiempo, vale 40.000 + 100 por toque que faltó (el contenedor corta y usa
// el último parcial, como con la piba).
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { FACE_H, FACE_W, faceFor, MOUTH_CORNER, cigLength, stageFor, type FaceLook } from "./face";
import { drawFace, scaleFor, type FallingAsh } from "./draw";
import { createPointerTracker, DURATION_MS, finished, MAX_SCORE, MIN_SCORE, scoreFor, TAPS_TO_FINISH, validate, type TapEvent } from "./rules";

const EMBER_FLASH_MS = 120;
const ASH_EVERY = 20;
const ASH_FALL_MS = 450;
const SMOKE_TICK_MS = 350;

function QuedoReTarado({ seed, onReady, onFinish, onProgress }: GameProps) {
  const look = React.useMemo(() => faceFor(seed), [seed]);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const tracker = React.useRef(createPointerTracker()).current;
  const events = React.useRef<TapEvent[]>([]);
  const readyAt = React.useRef<number | null>(null);
  const done = React.useRef(false);
  const falling = React.useRef<FallingAsh[]>([]);
  const [taps, setTaps] = React.useState(0);
  const [ember, setEmber] = React.useState(false);
  const [smoke, setSmoke] = React.useState(0);
  const [k, setK] = React.useState(1);
  const [reduced, setReduced] = React.useState(false);
  const [, bump] = React.useState(0);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // tamaño: escalado entero por devicePixelRatio, aprovechando el alto
  React.useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => {
      const r = area.getBoundingClientRect();
      setK(scaleFor(r.width, r.height, window.devicePixelRatio || 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);

  const progress = Math.min(1, taps / TAPS_TO_FINISH);

  // dibujar
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = FACE_W * k;
    canvas.height = FACE_H * k;
    canvas.style.width = `${(FACE_W * k) / dpr}px`;
    canvas.style.height = `${(FACE_H * k) / dpr}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFace(ctx, look, { progress, ember, smokeFrame: reduced ? 1 : smoke, ash: taps % ASH_EVERY >= 14 ? 3 : taps % ASH_EVERY >= 7 ? 2 : taps % ASH_EVERY > 0 ? 1 : 0 }, k, reduced ? [] : falling.current);
  });

  // el humo sube; la ceniza cae
  React.useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setSmoke((f) => (f + 1) % 3), SMOKE_TICK_MS);
    return () => window.clearInterval(id);
  }, [reduced]);
  React.useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const tick = () => {
      if (falling.current.length > 0) {
        const now = performance.now();
        falling.current = falling.current.map((a) => ({ ...a, progress: Math.min(1, a.progress + (now - (a as FallingAsh & { at: number }).at) / ASH_FALL_MS) })).filter((a) => a.progress < 1);
        for (const a of falling.current) (a as FallingAsh & { at: number }).at = now;
        bump((n) => n + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // listo al montar: un corte sin toques vale 40.000 + 200 × 100
  React.useEffect(() => {
    readyAt.current = performance.now();
    onProgress({ score: scoreFor([]), events: [] });
    onReady();
  }, [onReady, onProgress]);

  // brasa: se apaga sola
  React.useEffect(() => {
    if (!ember) return;
    const id = window.setTimeout(() => setEmber(false), EMBER_FLASH_MS);
    return () => window.clearTimeout(id);
  }, [ember]);

  function down(e: React.PointerEvent<HTMLDivElement>) {
    // el teclado no cuenta; en escritorio vale el clic izquierdo
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const counts = tracker.down(e.pointerId);
    if (!counts || done.current || readyAt.current === null) return;
    const t = Math.round(performance.now() - readyAt.current);
    events.current.push({ t });
    const n = events.current.length;
    setTaps(n);
    setEmber(true);
    if (n % ASH_EVERY === 0 && !reduced) {
      const tipX = MOUTH_CORNER.x + 2 + cigLength(n / TAPS_TO_FINISH) - 1;
      falling.current = [...falling.current, { x: tipX + 1, y: MOUTH_CORNER.y, progress: 0, at: performance.now() } as FallingAsh];
    }
    const result: GameResult = { score: scoreFor(events.current), events: [...events.current] };
    if (finished(events.current)) {
      done.current = true;
      onFinish(result);
    } else {
      onProgress(result);
    }
  }
  const release = (e: React.PointerEvent<HTMLDivElement>) => tracker.up(e.pointerId);

  const left = Math.max(0, TAPS_TO_FINISH - taps);
  return (
    <div
      ref={areaRef}
      className="relative flex h-full w-full select-none flex-col items-center justify-center"
      style={{ touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none" }}
      onPointerDown={down}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="tarado-area"
      data-taps={taps}
      data-stage={stageFor(progress)}
    >
      <canvas ref={canvasRef} className="pointer-events-none [image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} aria-hidden="true" />
      <span className="pointer-events-none absolute right-2 top-2 eyebrow" data-testid="tarado-left" aria-live="off">
        quedan {left}
      </span>
      {progress >= 1 ? (
        <span className="speech pointer-events-none absolute left-1/2 top-4 -translate-x-1/2" data-testid="tarado-done">
          quedó re tarado
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// la cara en SVG, para la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

export function FaceSvg({ look, progress, size = 200, label }: { look: FaceLook; progress: number; size?: number; label?: string }) {
  const px = React.useMemo(() => {
    // sin React: facePixels es puro
    return facePixelsFor(look, progress);
  }, [look, progress]);
  return (
    <svg
      viewBox={`0 0 ${FACE_W} ${FACE_H}`}
      width={size}
      height={(size * FACE_H) / FACE_W}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ background: look.bg, border: "3px solid var(--contorno)", borderRadius: 8 }}
    >
      {px.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={1} height={1} fill={p.c} />
      ))}
    </svg>
  );
}

function facePixelsFor(look: FaceLook, progress: number) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { facePixels } = require("./face") as typeof import("./face");
  return facePixels(look, { progress, smokeFrame: 1 });
}

function Intro({ seed }: { seed?: string }) {
  const look = faceFor(seed ?? "previa");
  return (
    <div className="card card-c flex items-center gap-4" data-testid="tarado-card">
      <FaceSvg look={look} progress={0} size={150} label="la cara de este intento, con el cigarro entero" />
      <p className="text-sm text-tinta-media">200 toques, un solo dedo. el cigarro se va consumiendo y la cara… también.</p>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const look = faceFor(seed);
  const events = result.events as TapEvent[];
  const isDone = finished(events);
  const progress = Math.min(1, events.length / TAPS_TO_FINISH);
  return (
    <div className="flex flex-col items-center gap-3" data-testid="tarado-result">
      <FaceSvg look={look} progress={progress} size={220} label={isDone ? "quedó re tarado" : "no llegó a terminar"} />
      {isDone ? (
        <>
          <p className="display-lg text-tinta" style={{ fontSize: 72 }} data-testid="game-score">
            {formatSeconds(result.score)}
          </p>
          <p className="speech">quedó re tarado</p>
        </>
      ) : (
        <p className="display-lg text-tinta" style={{ fontSize: 40 }} data-testid="game-score">
          te faltaron {TAPS_TO_FINISH - events.length} toques
        </p>
      )}
    </div>
  );
}

/** 18400 → "18,4 s" */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

export const quedoReTarado: GameModule = {
  id: "quedo-re-tarado",
  name: "quedó re tarado",
  tagline: "dale que se apaga.",
  howTo: [
    "tocá la pantalla para consumir el cigarro",
    "son 200 toques: gana el que lo termina más rápido",
    "se juega con un solo dedo: si tocás con dos, no cuenta",
  ],
  durationMs: DURATION_MS,
  // se puede terminar en 11 s; sin esto, /finish rechazaría una partida rápida por duración
  minDurationMs: MIN_SCORE,
  scoring: "low",
  minPlausibleScore: MIN_SCORE,
  maxPlausibleScore: MAX_SCORE,
  validate,
  Component: QuedoReTarado,
  Intro,
  Result,
};
