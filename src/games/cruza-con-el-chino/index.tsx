// "Cruza con el chino": un Frogger. El chino va montado arriba de la rana de
// Frog y tienen que cruzar calles llenas de tránsito. Tocar salta un carril
// hacia adelante, deslizar a los costados mueve de lado; cada tanto hay una
// vereda segura; si los atropellan, se termina. 120 s; el puntaje son los
// carriles avanzados.
//
// Mismo esquema técnico que los otros juegos de acción: simulación entera a
// 60 ticks (rules.ts) avanzada por el reloj de games/lib, y una traza con
// cada salto que `validate` vuelve a jugar. La rana de atrás viene de
// games/lib/frog y El chino de games/lib/chino (decisión 258).
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { integerScale, sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { composeSprite } from "../lib/sprites";
import { createPointerTracker } from "../lib/taps";
import { cameraTarget, drawScene } from "./draw";
import { applyInput, botTrace, check, CRASH_HOLD_TICKS, DURATION_MS, END_TICK, initialState, MAX_ROWS, nextSidewalk, score, simulate, solveFrom, step, TICKS_PER_S, validate, type Dir, type HopEvent, type PlannedHop, type SimState, type TraceEvent } from "./rules";
import { FIELD_H, FIELD_W, riderSprite, vehicleSprite } from "./sprites";

/** un toque: el dedo se movió menos de esto */
export const TAP_PX = 20;
/** un deslizamiento: se movió esto o más con el eje horizontal dominante */
export const SWIPE_PX = 30;
/** el cartel del final */
export const CRASH_SIGN = "el chino quedó de a pie";

export interface CruzaDevOptions {
  hitboxes?: boolean;
  path?: boolean;
  slow?: boolean;
  /** arrancar en esta fila (el jugador justo jugó hasta ahí) */
  startRow?: number;
}

/** qué hace un gesto al soltar: toque (adelante), deslizamiento horizontal (de costado) o nada */
export function gestureDir(dx: number, dy: number): Dir | null {
  if (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) return "up";
  if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return null;
}

type Hud = { rows: number; crashed: boolean; end: boolean };

export function CruzaGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: CruzaDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pendingRef = React.useRef<Dir[]>([]);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ rows: 0, crashed: false, end: false });
  const startRow = dev?.startRow ?? 0;

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
    const measure = () => setK(integerScale(area.clientWidth, area.clientHeight, window.devicePixelRatio || 1, FIELD_W, FIELD_H));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    sizeCanvas(canvas, FIELD_W, FIELD_H, k, window.devicePixelRatio || 1);
    kRef.current = k;
  }, [k]);

  React.useEffect(() => {
    let s: SimState = initialState(seed);
    const hops: HopEvent[] = [];
    if (startRow > 0) {
      // la herramienta: el jugador justo cruza hasta la primera vereda a partir de esa fila (y aterriza ahí)
      const plan = botTrace(seed).events.filter((e): e is HopEvent => !("fin" in e));
      const t = initialState(seed);
      let k2 = 0;
      while (t.tick < END_TICK && (t.maxRow < startRow || t.hop || t.course.lanes[t.row]!.kind !== "sidewalk")) {
        while (k2 < plan.length && plan[k2]!.tick === t.tick) applyInput(t, plan[k2++]!.dir);
        step(t);
      }
      const until = t.tick;
      hops.push(...plan.filter((h) => h.tick < until));
      s = simulate(seed, hops, until).state;
    }
    pendingRef.current = [];
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finished = false;
    let camRow = cameraTarget(s, 0);
    let path: PlannedHop[] | null = null;
    let pathAt = -1;
    const resultNow = (endTick: number): GameResult => ({ score: score(s), events: [...hops, { tick: endTick, fin: true }] as TraceEvent[] });

    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      const pending = pendingRef.current;
      pendingRef.current = [];
      let changed = false;
      for (const dir of pending) {
        if (finished || s.crashed || s.tick >= END_TICK) break;
        applyInput(s, dir);
        hops.push({ tick: s.tick, dir });
        changed = true;
      }
      while (s.tick < want && s.tick < END_TICK + CRASH_HOLD_TICKS) {
        if (s.crashed && s.tick - s.crashTick >= CRASH_HOLD_TICKS) break;
        if (!s.crashed && s.tick >= END_TICK) break;
        step(s);
      }
      // la cámara sigue a la rana hacia arriba y nunca baja
      const targetCam = cameraTarget(s, alpha);
      if (targetCam > camRow) camRow = reducedRef.current ? targetCam : camRow + Math.min(targetCam - camRow, 0.25 + (targetCam - camRow) * 0.12);
      if (devRef.current?.path && !s.crashed && (pathAt < 0 || s.tick - pathAt > 30 || !s.hop)) {
        if (!s.hop && pathAt !== s.tick) {
          path = solveFrom(s.course, s.row, s.col, s.tick, nextSidewalk(s.course, s.row));
          pathAt = s.tick;
        }
      }
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, kRef.current, s, { alpha, reduced: reducedRef.current, camRow, hitboxes: devRef.current?.hitboxes, path: devRef.current?.path ? path : null });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.tick = String(s.tick);
        d.row = String(s.row);
        d.col = String(s.col);
        d.rows = String(score(s));
        d.hop = s.hop ? "1" : "0";
        d.crashed = s.crashed ? "1" : "0";
        d.lane = s.course.lanes[s.row]?.kind ?? "";
      }
      if (s.tick !== reportedTick || changed) {
        reportedTick = s.tick;
        const end = s.crashed ? s.tick - s.crashTick >= CRASH_HOLD_TICKS : s.tick >= END_TICK;
        onProgress(resultNow(s.crashed ? s.crashTick : Math.max(1, s.tick)));
        setHud((h) => (h.rows === score(s) && h.crashed === s.crashed && h.end === end ? h : { rows: score(s), crashed: s.crashed, end }));
        if (end && !finished) {
          finished = true;
          onFinish(resultNow(s.crashed ? s.crashTick : END_TICK));
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow(Math.max(1, s.tick)));
    onReady();
    return () => cancelAnimationFrame(raf);
  }, [seed, startRow, onReady, onProgress, onFinish]);

  // un solo dedo; el gesto se resuelve al soltar (decisión 259): toque = adelante, deslizar = de costado
  const tracker = React.useRef(createPointerTracker()).current;
  const startRef = React.useRef<{ id: number; x: number; y: number } | null>(null);
  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!tracker.down(e.pointerId)) return;
    startRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    tracker.up(e.pointerId);
    const st = startRef.current;
    if (!st || st.id !== e.pointerId) return;
    startRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const dir = gestureDir(e.clientX - st.x, e.clientY - st.y);
    if (dir) pendingRef.current.push(dir);
  }
  function cancel(e: React.PointerEvent<HTMLDivElement>) {
    tracker.cancel(e.pointerId);
    if (startRef.current?.id === e.pointerId) startRef.current = null;
  }
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir: Dir | null = e.code === "ArrowUp" || e.code === "Space" ? "up" : e.code === "ArrowLeft" ? "left" : e.code === "ArrowRight" ? "right" : null;
      if (!dir || e.repeat) return;
      e.preventDefault();
      pendingRef.current.push(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={rootRef} className="flex h-full w-full select-none flex-col gap-2" data-testid="cruza-area" data-end={hud.end ? "1" : ""}>
      <div className="flex items-baseline gap-2 px-1">
        <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="cruza-rows" aria-live="off">
          {hud.rows}
        </span>
        <span className="display text-xl text-tinta-media">{hud.rows === 1 ? "carril" : "carriles"}</span>
      </div>
      <div
        ref={areaRef}
        className="flex min-h-0 flex-1 items-start justify-center"
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="cruza-field"
      >
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ borderRadius: 8 }} aria-label="las calles, con la rana y El chino cruzando" role="img" data-testid="cruza-canvas" />
          {hud.crashed ? (
            <div className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center">
              <span className="note-alert display text-2xl" role="status" data-testid="cruza-crash">
                {CRASH_SIGN}
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

/** la rana con El chino en la vereda, frente a la primera calle con un auto (48 × 40) */
export function introSprite() {
  const tiles = { w: 48, h: 16, px: [] as { x: number; y: number; c: string }[] };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 48; x++) tiles.px.push({ x, y, c: y === 0 || y === 15 ? "#8A8F99" : x % 8 === 0 || y === 8 ? "#B5AE9C" : "#CFC9B8" });
  const road = { w: 48, h: 24, px: [] as { x: number; y: number; c: string }[] };
  for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) road.px.push({ x, y, c: y === 12 && x % 8 < 4 ? "#6B6F80" : "#2A2D3A" });
  return composeSprite(48, 40, [
    { sprite: road, x: 0, y: 0 },
    { sprite: vehicleSprite({ kind: "auto", len: 2, look: 2 }, 1), x: 10, y: 2 },
    { sprite: tiles, x: 0, y: 24 },
    { sprite: riderSprite("quieta"), x: 16, y: 16 },
  ]);
}

function Intro() {
  return (
    <div className="card card-c flex items-center gap-4" data-testid="cruza-card">
      <SpriteSvg sprite={introSprite()} height={110} label="la rana con El chino arriba, en la vereda, frente a la primera calle" />
      <ul className="flex flex-col gap-2 text-sm text-tinta-media">
        <li>tocá: salta adelante</li>
        <li>deslizá: se corre de lado</li>
        <li>las veredas son seguras</li>
      </ul>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const crashed = v.ok ? v.crashed : false;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="cruza-result" data-reason={v.ok ? "ok" : v.reason}>
      <SpriteSvg sprite={riderSprite("quieta")} height={88} label="la rana con El chino" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }}>
        <span data-testid="game-score">{result.score}</span>
        <span className="ml-2 text-3xl text-tinta-suave">carriles</span>
      </p>
      <p className="text-lg text-tinta-media">{crashed ? "los atropellaron: el chino quedó de a pie." : "se acabó el tiempo con los dos enteros."}</p>
    </div>
  );
}

export const cruzaConElChino: GameModule = {
  id: "cruza-con-el-chino",
  name: "Cruza con el chino",
  tagline: "mirá para los dos lados.",
  howTo: ["tocá para saltar hacia adelante", "deslizá a los costados para moverte de lado", "si los atropellan, se termina: gana el que avanza más carriles"],
  durationMs: DURATION_MS,
  // un choque en la primera calle puede llegar en unos 3 s; la cuenta regresiva suma 3 más
  minDurationMs: 3_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_ROWS,
  unit: "carriles",
  validate,
  recomputeScore: (result, seed) => {
    const v = check(seed, result.events);
    return v.ok ? v.rows : null;
  },
  Component: CruzaGame,
  Intro,
  Result,
};
