// "Dale un trago al pibe": una grilla de caños entre la damajuana "Vinaken
// del pari" y la boca del pibe rasta. Tocar un caño lo gira; cuando se acaba
// el tiempo (o al tocar la damajuana) el vino corre: si llega a la boca, el
// puzzle cuenta y viene el siguiente; si se derrama, se termina. 150 s; gana
// el que suma más puntos (100 por puzzle más 10 por segundo que sobró si
// largaste el vino antes).
//
// Es el primer juego con `seedScope: 'player'` (decisión 265): cada jugador
// recibe una semilla distinta y los puzzles controlan su dificultad por
// tabla. Sin ticks: una máquina de estados en ms desde onReady (rules.ts), la
// misma que vuelve a jugar `validate` con los puzzles rearmados.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { integerScale, sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { createPointerTracker } from "../lib/taps";
import { drawScene, hitTest, viewFor } from "./draw";
import { advance, check, DURATION_MS, isSolved, MAX_SCORE, newRun, pour, rotate, SPILL_HOLD_MS, validate, type PipeEvent, type Run } from "./rules";
import { damajuanaSprite, fingerSprite, rastaSprite, TILE } from "./sprites";

export const SPILL_SIGN = "¡se derramó todo!";
export const WINE_NAME = "Vinaken del pari";

export interface TragoDevOptions {
  solution?: boolean;
  slow?: boolean;
  /** arrancar en este puzzle (desde 1) */
  firstPuzzle?: number;
}

type Hud = { score: number; puzzle: number; phase: Run["phase"]; gain: { base: number; bonus: number } | null };

/** de la pantalla a las unidades de la vista */
export function toView(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, W: number, H: number): { x: number; y: number } {
  return { x: ((clientX - rect.left) / rect.width) * W, y: ((clientY - rect.top) / rect.height) * H };
}

export function TragoGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: TragoDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const trackerRef = React.useRef(createPointerTracker());
  const gameRef = React.useRef<{ run: Run; events: PipeEvent[]; clock: () => number; spins: Map<number, number>; finishTimer?: number } | null>(null);
  const sizeRef = React.useRef({ W: 0, H: 0, k: 1 });
  const [hud, setHud] = React.useState<Hud>({ score: 0, puzzle: 1, phase: "solving", gain: null });
  const firstPuzzle = dev?.firstPuzzle ?? 1;

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => (reducedRef.current = mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // el canvas se acomoda a la grilla del puzzle en curso (cambia de tamaño entre puzzles)
  const fit = React.useCallback(() => {
    const area = areaRef.current;
    const canvas = canvasRef.current;
    const g = gameRef.current;
    if (!area || !canvas || !g) return;
    const { W, H } = viewFor(g.run.puzzle);
    const dpr = window.devicePixelRatio || 1;
    // el alto que entra: el del área, y nunca más que la ventana (la herramienta no limita el área y la grilla de 4 columnas se iría de la pantalla)
    const availH = Math.min(area.clientHeight > 0 ? area.clientHeight : Number.MAX_SAFE_INTEGER, Math.max(240, window.innerHeight - 150));
    const k = integerScale(area.clientWidth, availH, dpr, W, H);
    if (sizeRef.current.W !== W || sizeRef.current.H !== H || sizeRef.current.k !== k) {
      sizeRef.current = { W, H, k };
      sizeCanvas(canvas, W, H, k, dpr);
    }
  }, []);
  React.useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const ro = new ResizeObserver(fit);
    ro.observe(area);
    return () => ro.disconnect();
  }, [fit]);

  React.useEffect(() => {
    const run = newRun(seed, firstPuzzle);
    const events: PipeEvent[] = [];
    // el reloj del juego: ms enteros desde onReady (con cámara lenta en la herramienta), nunca para atrás
    let virt = 0;
    let last = performance.now();
    const clock = () => {
      const now = performance.now();
      virt += (now - last) * (devRef.current?.slow ? 0.25 : 1);
      last = now;
      return Math.max(run.t, Math.floor(virt));
    };
    const g: NonNullable<typeof gameRef.current> = { run, events, clock, spins: new Map() };
    gameRef.current = g;
    let raf = 0;
    let lastKey = "";
    let lastPuzzle = run.index;
    const frame = () => {
      const t = Math.min(DURATION_MS, clock());
      if (run.phase !== "over") advance(run, t);
      if (run.index !== lastPuzzle) {
        lastPuzzle = run.index;
        g.spins.clear();
      }
      fit();
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, sizeRef.current.k, run, { t, reduced: reducedRef.current, solution: devRef.current?.solution, spins: g.spins });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.t = String(t);
        d.phase = run.phase;
        d.puzzle = String(run.index + 1);
        d.score = String(run.score);
        d.solved = isSolved(run) ? "1" : "0";
        d.cols = String(run.puzzle.cols);
        d.rows = String(run.puzzle.rows);
      }
      const key = `${run.score}|${run.index}|${run.phase}`;
      if (key !== lastKey) {
        lastKey = key;
        setHud({ score: run.score, puzzle: run.index + 1, phase: run.phase, gain: run.phase === "drinking" ? run.lastGain : null });
        onProgress({ score: run.score, events: [...events] });
        if (run.phase === "spilled" && g.finishTimer === undefined) {
          const result: GameResult = { score: run.score, events: [...events] };
          g.finishTimer = window.setTimeout(() => onFinish(result), Math.max(0, SPILL_HOLD_MS - (t - run.spill!.at)));
        }
      }
      raf = requestAnimationFrame(frame);
    };
    fit();
    raf = requestAnimationFrame(frame);
    onProgress({ score: run.score, events: [] });
    onReady();
    return () => {
      cancelAnimationFrame(raf);
      if (g.finishTimer !== undefined) window.clearTimeout(g.finishTimer);
    };
  }, [seed, firstPuzzle, onReady, onProgress, onFinish, fit]);

  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!trackerRef.current.down(e.pointerId)) return;
    const g = gameRef.current;
    const canvas = canvasRef.current;
    if (!g || !canvas) return;
    const { W, H } = sizeRef.current;
    const v = toView(e.clientX, e.clientY, canvas.getBoundingClientRect(), W, H);
    const hit = hitTest(g.run.puzzle, v.x, v.y);
    if (!hit) return;
    const t = Math.min(DURATION_MS, g.clock());
    const puzzle = g.run.index + 1;
    if (hit.kind === "pour") {
      if (pour(g.run, t) === "ok") g.events.push({ t, puzzle, type: "pour" });
      return;
    }
    if (rotate(g.run, t, hit.cell) === "ok") {
      g.events.push({ t, puzzle, type: "rotate", cell: hit.cell });
      g.spins.set(hit.cell, t);
    }
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    trackerRef.current.up(e.pointerId);
  }

  return (
    <div ref={rootRef} className="flex h-full w-full select-none flex-col gap-1" data-testid="trago-area" data-phase={hud.phase}>
      <div className="flex items-end justify-between px-1">
        <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="trago-score" aria-live="off">
          {hud.score}
        </span>
        <span className="display text-xl text-tinta-media" data-testid="trago-puzzle">
          puzzle {hud.puzzle}
        </span>
      </div>
      <div
        ref={areaRef}
        className="flex min-h-0 flex-1 items-start justify-center"
        style={{ touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="trago-field"
      >
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ borderRadius: 8 }} aria-label="la damajuana arriba, la grilla de caños y el pibe abajo con la boca abierta" role="img" data-testid="trago-canvas" />
          {hud.gain ? (
            <div className="pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center gap-1" data-testid="trago-gain">
              <span className="speech display text-2xl" style={{ padding: "4px 10px" }}>
                +{hud.gain.base}
              </span>
              {hud.gain.bonus > 0 ? (
                <span className="speech text-sm" style={{ padding: "2px 8px" }}>
                  +{hud.gain.bonus} de bonus
                </span>
              ) : null}
              <span className="chip display text-sm" data-testid="trago-salud">
                ¡salud!
              </span>
            </div>
          ) : null}
          {hud.phase === "spilled" || (hud.phase === "over" && gameRef.current?.run.spill) ? (
            <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center">
              <span className="note-alert display text-2xl" role="status" data-testid="trago-spill">
                {SPILL_SIGN}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

/** un caño de ejemplo que gira con un dedo */
function TurningTile() {
  const [rot, setRot] = React.useState(0);
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    if (mq.matches) return;
    const id = window.setInterval(() => setRot((r) => r + 1), 1100);
    return () => window.clearInterval(id);
  }, []);
  const s = TILE;
  return (
    <div className="relative" style={{ width: 72, height: 72 }} aria-label="un caño de ejemplo girando con un dedo" role="img">
      <svg viewBox={`0 0 ${s} ${s}`} width={64} height={64} shapeRendering="crispEdges" style={{ transform: `rotate(${rot * 90}deg)`, transition: reduced ? "none" : "transform 160ms ease-out" }}>
        <rect width={s} height={s} fill="#E7DBC3" />
        <rect x={5} y={0} width={10} height={15} fill="#2A2A30" />
        <rect x={5} y={5} width={15} height={10} fill="#2A2A30" />
        <rect x={6} y={0} width={8} height={14} fill="#9AA0A8" />
        <rect x={6} y={6} width={14} height={8} fill="#9AA0A8" />
        <rect x={7} y={0} width={1} height={8} fill="#C9CED4" />
      </svg>
      <div className="absolute" style={{ right: -6, bottom: -4 }}>
        <SpriteSvg sprite={fingerSprite()} height={30} label="" />
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="card card-c flex flex-col gap-3" data-testid="trago-card">
      <div className="flex items-end justify-around gap-2">
        <div className="flex flex-col items-center gap-1">
          <SpriteSvg sprite={damajuanaSprite()} height={70} label="la damajuana Vinaken del pari" />
          <span className="text-[11px] text-tinta-suave">{WINE_NAME}</span>
        </div>
        <TurningTile />
        <SpriteSvg sprite={rastaSprite("espera")} height={78} label="el pibe esperando con la boca abierta" />
      </div>
      <ul className="flex flex-col gap-1 text-sm text-tinta-media">
        <li>cada uno recibe su propio puzzle: no vale pasarse la solución</li>
        <li>largar el vino antes es una apuesta: si el camino no está, se derrama</li>
      </ul>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const solved = v.ok ? v.run.solvedCount : 0;
  const spilled = v.ok ? v.run.spill !== null : false;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="trago-result" data-reason={v.ok ? "ok" : v.reason}>
      <SpriteSvg sprite={rastaSprite(spilled ? "triste" : "salud")} height={96} label="el pibe" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }}>
        <span data-testid="game-score">{result.score}</span>
      </p>
      <p className="text-lg text-tinta-media">
        {solved === 1 ? "1 puzzle resuelto" : `${solved} puzzles resueltos`}
        {spilled ? ". y al final, se derramó todo." : "."}
      </p>
    </div>
  );
}

export const daleUnTragoAlPibe: GameModule = {
  id: "dale-un-trago-al-pibe",
  name: "Dale un trago al pibe",
  tagline: "que llegue el vino.",
  howTo: ["tocá los caños para girarlos y armá el camino hasta la boca", "cuando se acaba el tiempo, larga el vino: si se derrama, perdés", "si terminás antes, tocá la damajuana y ganás puntos extra"],
  seedScope: "player",
  durationMs: DURATION_MS,
  // largar el vino enseguida con el camino sin armar derrama en un segundo; la cuenta regresiva suma 3 más
  minDurationMs: 3_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  recomputeScore: (result, seed) => {
    const v = check(seed, result.events);
    return v.ok ? v.score : null;
  },
  Component: TragoGame,
  Intro,
  Result,
};
