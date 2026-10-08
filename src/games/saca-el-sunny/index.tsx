// "Saca el Sunny": el sunny rojo está estacionado en Aguada, trabado entre
// autos negros, y hay que sacarlo por la salida de su fila antes de que cierre
// la hdp. Cada auto se desliza solo en su dirección; cuando el sunny sale,
// viene otro estacionamiento más trabado. 120 s; 100 puntos por
// estacionamiento más un bonus por usar pocos movimientos.
//
// Semilla por jugador (`seedScope: 'player'`, decisión 265): cada integrante
// recibe estacionamientos distintos, de dificultad pareja por tabla. Sin
// ticks: una máquina de estados en ms desde onReady (rules.ts), la misma que
// vuelve a jugar `validate` con los estacionamientos rearmados y los mínimos
// recalculados con el resolvedor. El neón y Big Bro vienen de games/lib.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { integerScale, sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { singlePointerDrag } from "../lib/pointer-drag";
import { neonSprite, KITCHEN } from "../lib/hdp-kitchen";
import { bigBroSprite } from "../lib/big-bro";
import { carAtCell, cellAt, drawScene, H, W, type Drag } from "./draw";
import { advance, check, DURATION_MS, legalRange, MAX_SCORE, move, newRun, puzzleAt, reset, solve, validate, type Move, type ParkingEvent, type Run } from "./rules";
import { carSprite, CELL, sunnySprite, swipeArrowSprite } from "./sprites";

export const CLOSED_SIGN = "cerró la hdp";

export interface SunnyDevOptions {
  /** la solución óptima, paso a paso */
  hint?: boolean;
  slow?: boolean;
  /** arrancar en este estacionamiento (desde 1) */
  firstPuzzle?: number;
  /** arrancar con el reloj en estos ms (para ver el cierre sin esperar) */
  startMs?: number;
}

type Hud = { score: number; solved: number; moves: number; puzzle: number; phase: Run["phase"]; gain: Run["lastGain"] };

/** de la pantalla a las unidades de la vista */
export function toView(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  return { x: ((clientX - rect.left) / rect.width) * W, y: ((clientY - rect.top) / rect.height) * H };
}

/** cuánto va corrido un auto, en casillas, según el dedo: sobre su eje, recortado a lo que puede moverse; lo perpendicular se ignora */
export function dragOffset(horizontal: boolean, from: { x: number; y: number }, to: { x: number; y: number }, range: { min: number; max: number }): number {
  const raw = (horizontal ? to.x - from.x : to.y - from.y) / CELL;
  return Math.max(range.min, Math.min(range.max, raw));
}

type Game = { run: Run; events: ParkingEvent[]; clock: () => number; drag: (Drag & { from: { x: number; y: number }; range: { min: number; max: number } }) | null; hint: Move[] | null; hintKey: string };

export function SacaSunnyGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: SunnyDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const gameRef = React.useRef<Game | null>(null);
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ score: 0, solved: 0, moves: 0, puzzle: 1, phase: "playing", gain: null });
  const firstPuzzle = dev?.firstPuzzle ?? 1;

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => (reducedRef.current = mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  React.useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    // el alto que entra: el del área, y nunca más que la ventana (la herramienta no limita el área)
    const measure = () => setK(integerScale(area.clientWidth, Math.min(area.clientHeight > 0 ? area.clientHeight : Number.MAX_SAFE_INTEGER, Math.max(240, window.innerHeight - 170)), window.devicePixelRatio || 1, W, H));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    sizeCanvas(canvas, W, H, k, window.devicePixelRatio || 1);
    kRef.current = k;
  }, [k]);

  // la solución óptima desde donde está el estacionamiento (herramienta): el primer paso, recalculado cuando cambia la posición
  const nextHint = React.useCallback((g: Game): Move | null => {
    const key = `${g.run.index}:${g.run.pos.join(",")}`;
    if (g.hintKey !== key) {
      g.hintKey = key;
      g.hint = solve(g.run.puzzle.cars, g.run.pos)?.path ?? null;
    }
    return g.hint?.[0] ?? null;
  }, []);

  React.useEffect(() => {
    const run = newRun(seed, firstPuzzle);
    const events: ParkingEvent[] = [];
    // el reloj del juego: ms enteros desde onReady (con cámara lenta en la herramienta), nunca para atrás
    let virt = devRef.current?.startMs ?? 0;
    let last = performance.now();
    const clock = () => {
      const now = performance.now();
      virt += (now - last) * (devRef.current?.slow ? 0.25 : 1);
      last = now;
      return Math.max(run.t, Math.floor(virt));
    };
    const g: Game = { run, events, clock, drag: null, hint: null, hintKey: "" };
    gameRef.current = g;
    let raf = 0;
    let lastKey = "";
    let primed = -1;
    const frame = () => {
      const t = Math.min(DURATION_MS, clock());
      if (run.phase !== "over") advance(run, t);
      // el estacionamiento siguiente se arma mientras el sunny sale manejando (el resolvedor tarda hasta medio segundo)
      if (run.phase === "leaving" && primed !== run.index) {
        primed = run.index;
        puzzleAt(run.seed, run.index + 2);
      }
      const ctx = canvasRef.current?.getContext("2d");
      const hint = devRef.current?.hint && run.phase === "playing" ? nextHint(g) : null;
      if (ctx) drawScene(ctx, kRef.current, run, { t, reduced: reducedRef.current, drag: g.drag, hint });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.t = String(t);
        d.phase = run.phase;
        d.puzzle = String(run.index + 1);
        d.score = String(run.score);
        d.moves = String(run.moves);
        d.pos = run.pos.join(",");
      }
      const key = `${run.score}|${run.index}|${run.phase}|${run.moves}`;
      if (key !== lastKey) {
        lastKey = key;
        setHud({ score: run.score, solved: run.solvedCount, moves: run.moves, puzzle: run.index + 1, phase: run.phase, gain: run.phase === "leaving" ? run.lastGain : null });
        onProgress({ score: run.score, events: [...events] });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress({ score: run.score, events: [] });
    onReady();
    return () => cancelAnimationFrame(raf);
  }, [seed, firstPuzzle, onReady, onProgress, nextHint]);

  const drag = React.useRef(
    singlePointerDrag(
      (clientX, clientY) => {
        const canvas = canvasRef.current;
        return canvas ? toView(clientX, clientY, canvas.getBoundingClientRect()) : { x: -1, y: -1 };
      },
      (v) => {
        const g = gameRef.current;
        if (!g) return;
        if (!g.drag) {
          // apoyar el dedo: el auto que está debajo
          if (g.run.phase !== "playing") return;
          const cell = cellAt(v.x, v.y);
          if (!cell) return;
          const car = carAtCell(g.run.puzzle, g.run.pos, cell.col, cell.row);
          if (car < 0) return;
          g.drag = { car, offset: 0, from: v, range: legalRange(g.run.puzzle.cars, g.run.pos, car) };
          return;
        }
        g.drag.offset = dragOffset(g.run.puzzle.cars[g.drag.car]!.horizontal, g.drag.from, v, g.drag.range);
      },
      () => {
        const g = gameRef.current;
        if (!g || !g.drag) return;
        const d = g.drag;
        g.drag = null;
        const delta = Math.round(d.offset);
        if (delta === 0) return;
        const t = Math.min(DURATION_MS, g.clock());
        const puzzle = g.run.index + 1;
        if (move(g.run, t, d.car, delta) === "ok") g.events.push({ t, puzzle, type: "move", car: d.car, delta });
      },
    ),
  ).current;

  function restart() {
    const g = gameRef.current;
    if (!g) return;
    const t = Math.min(DURATION_MS, g.clock());
    const puzzle = g.run.index + 1;
    if (reset(g.run, t) === "ok") g.events.push({ t, puzzle, type: "reset" });
  }

  const finishedRef = React.useRef(false);
  React.useEffect(() => {
    // el cierre lo hace el contenedor a los 120 s; por si su reloj va atrás del nuestro, avisamos una vez al llegar
    if (hud.phase === "over" && !finishedRef.current && gameRef.current) {
      finishedRef.current = true;
      onFinish({ score: gameRef.current.run.score, events: [...gameRef.current.events] });
    }
  }, [hud.phase, onFinish]);

  return (
    <div ref={rootRef} className="flex h-full w-full select-none flex-col gap-1" data-testid="saca-area" data-phase={hud.phase}>
      <div className="flex items-end justify-between px-1">
        <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="saca-score" aria-live="off">
          {hud.score}
        </span>
        <span className="display text-xl text-tinta-media" data-testid="saca-solved">
          {hud.solved === 1 ? "1 sacado" : `${hud.solved} sacados`}
        </span>
      </div>
      <div
        ref={areaRef}
        className="flex min-h-0 flex-1 items-start justify-center"
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        {...drag}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="saca-field"
      >
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ borderRadius: 8 }} aria-label="el estacionamiento de Aguada visto desde arriba, con el sunny rojo entre autos negros y la hdp al fondo" role="img" data-testid="saca-canvas" />
          {hud.gain ? (
            <div className="pointer-events-none absolute inset-x-0 top-[45%] flex flex-col items-center gap-1" data-testid="saca-gain">
              <span className="speech display text-2xl" style={{ padding: "4px 10px" }}>
                +{hud.gain.base + hud.gain.bonus}
              </span>
              <span className="speech text-xs" style={{ padding: "2px 8px" }}>
                {hud.gain.moves} {hud.gain.moves === 1 ? "movimiento" : "movimientos"} (mínimo {hud.gain.minMoves})
              </span>
            </div>
          ) : null}
          {hud.phase === "over" ? (
            <div className="pointer-events-none absolute inset-x-0 top-[45%] flex flex-col items-center gap-1">
              <span className="note-alert display text-2xl" role="status" data-testid="saca-closed">
                {CLOSED_SIGN}
              </span>
              <span className="speech text-sm" style={{ padding: "2px 8px" }}>
                {hud.solved === 1 ? "1 sunny sacado" : `${hud.solved} sunnys sacados`}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-tinta-media" data-testid="saca-moves">
          {hud.moves === 1 ? "1 movimiento" : `${hud.moves} movimientos`} · estacionamiento {hud.puzzle}
        </span>
        <button type="button" className="btn-secondary-sm" onClick={restart} disabled={hud.phase !== "playing"} data-testid="saca-reset">
          empezar de nuevo
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

function Intro() {
  const black = carSprite({ len: 2, horizontal: false, look: 0 });
  const truck = carSprite({ len: 3, horizontal: false, look: 2 });
  return (
    <div className="card card-c flex flex-col gap-3" data-testid="saca-card">
      <div className="flex items-center justify-around gap-2">
        <div className="flex items-end gap-1" role="img" aria-label="el sunny rojo trabado entre autos negros">
          <SpriteSvg sprite={black} height={54} label="" />
          <SpriteSvg sprite={sunnySprite()} height={28} label="" />
          <SpriteSvg sprite={truck} height={70} label="" />
        </div>
        <SpriteSvg sprite={swipeArrowSprite()} height={20} label="una flecha de deslizar" />
        <div className="flex flex-col items-center gap-1" style={{ background: KITCHEN.board, padding: "6px 10px", borderRadius: 6 }}>
          <SpriteSvg sprite={neonSprite(KITCHEN.neon)} height={28} label="el neón de la hdp" />
          <span className="text-[10px]" style={{ color: KITCHEN.neonSoft }}>
            cierra en 2:00
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-1 text-sm text-tinta-media">
        <li>cada uno recibe sus propios estacionamientos, de la misma dificultad</li>
        <li>100 por estacionamiento, y hasta 50 más si lo sacás con los movimientos justos</li>
      </ul>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const solved = v.ok ? v.run.solvedCount : 0;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="saca-result" data-reason={v.ok ? "ok" : v.reason}>
      <div className="flex items-end gap-3">
        <div className="flex flex-col items-center gap-1" style={{ background: KITCHEN.board, padding: "6px 10px", borderRadius: 6 }}>
          <SpriteSvg sprite={neonSprite("#3A3F4C")} height={28} label="el neón apagado" />
          <span className="text-[10px] text-tinta-suave">{CLOSED_SIGN}</span>
        </div>
        <SpriteSvg sprite={bigBroSprite("tira")} height={72} label="Big Bro bajando la persiana" />
      </div>
      <p className="display-lg text-tinta" style={{ fontSize: 88 }}>
        <span data-testid="game-score">{result.score}</span>
      </p>
      <p className="text-lg text-tinta-media">{solved === 1 ? "1 sunny sacado" : `${solved} sunnys sacados`} antes de que cerrara.</p>
    </div>
  );
}

export const sacaElSunny: GameModule = {
  id: "saca-el-sunny",
  name: "Saca el Sunny",
  tagline: "antes de que cierre la hdp.",
  howTo: ["deslizá los autos negros para abrirle paso al sunny", "cada auto se mueve solo en su dirección", "sacá todos los que puedas antes de que cierre la hdp: menos movimientos, más puntos"],
  seedScope: "player",
  durationMs: DURATION_MS,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  recomputeScore: (result, seed) => {
    const v = check(seed, result.events);
    return v.ok ? v.score : null;
  },
  Component: SacaSunnyGame,
  Intro,
  Result,
};
