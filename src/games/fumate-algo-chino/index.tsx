// "fumate algo chino": tirarle un cigarro a la boca a El chino con una
// gomera. Arrastrar hacia atrás apunta y elige la fuerza, soltar tira; el
// cigarro vuela con gravedad y viento. Tres tiros, y cuenta el mejor.
//
// Mismo esquema técnico que los otros juegos de acción: simulación entera a
// 60 ticks (rules.ts) avanzada por el reloj de games/lib, y una traza con un
// evento por tiro (el vector de lanzamiento) que `validate` vuelve a jugar.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { composeSprite } from "../lib/sprites";
import { useLogicalPointer } from "../lib/orientation-context";
import { cameraFor, drawScene, followDy, scaleFor, type Camera } from "./draw";
import { applyThrow, botTrace, check, clampVector, DURATION_MS, END_TICK, endTickOf, initialState, MAX_SCORE, SHOTS, solveShot, step, SUB, TICKS_PER_S, validate, V_MAX, V_MIN, type Outcome, type ShotResult, type SimState, type ThrowEvent, type TraceEvent, type Vector } from "./rules";
import { chinoSprite, FIELD_H, FIELD_W, handSprite, sockSprite } from "./sprites";

/** el resumen se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;
/** un arrastre más corto no gasta el tiro */
export const MIN_DRAG_PX = 20;
/** a este largo de arrastre (px) se llega a la fuerza máxima */
export const MAX_DRAG_PX = 150;

export interface ChinoDevOptions {
  fullPath?: boolean;
  debug?: boolean;
  solver?: boolean;
  /** arrancar en este tiro (índice), con el jugador automático hasta ahí */
  startShot?: number;
}

type Hud = { shot: number; best: number; results: Outcome[]; last: ShotResult | null; end: boolean };

export const OUTCOME_TEXT: Record<Outcome, string> = { adentro: "¡adentro!", casi: "casi", lejos: "ni cerca" };
export const OUTCOME_COLOR: Record<Outcome, string> = { adentro: "#8EDC66", casi: "#FFD34E", lejos: "#FF6F91" };

/** del arrastre en px al vector de lanzamiento (opuesto, limitado al tope) */
export function vectorFromDrag(dx: number, dy: number): Vector | null {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < MIN_DRAG_PX) return null;
  const f = (Math.min(len, MAX_DRAG_PX) / MAX_DRAG_PX) * V_MAX;
  // opuesto al arrastre; en pantalla y crece hacia abajo
  const v = clampVector((-dx / len) * f, (dy / len) * f);
  const s2 = v.vx * v.vx + v.vy * v.vy;
  if (s2 < V_MIN * V_MIN) {
    const g = (V_MIN + 1) / Math.sqrt(s2 || 1);
    return clampVector(v.vx * g, v.vy * g);
  }
  return v;
}

export function ChinoGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: ChinoDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pendingRef = React.useRef<Vector[]>([]);
  const aimRef = React.useRef<Vector | null>(null);
  const pointerRef = React.useRef<{ id: number; x: number; y: number } | null>(null);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ shot: 0, best: 0, results: [], last: null, end: false });
  const startShot = dev?.startShot ?? 0;
  // los punteros llegan en el sistema que ve el jugador (el área puede estar rotada 90°)
  const toLogical = useLogicalPointer();

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
    const measure = () => {
      // clientWidth/Height: el tamaño sin la rotación del contenedor (getBoundingClientRect daría la caja girada)
      setK(scaleFor(area.clientWidth, area.clientHeight, window.devicePixelRatio || 1));
    };
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

  // la partida: simulación a paso fijo, avanzada por el tiempo transcurrido
  React.useEffect(() => {
    const s: SimState = initialState(seed);
    const throws: ThrowEvent[] = [];
    if (startShot > 0) {
      const plan = botTrace(seed, { maxShots: startShot, aimTicks: 30 }).events.filter((e): e is ThrowEvent => !("fin" in e));
      let k2 = 0;
      while (!s.end && s.current < startShot) {
        while (k2 < plan.length && plan[k2]!.tick === s.tick) {
          if (applyThrow(s, { vx: plan[k2]!.vx, vy: plan[k2]!.vy })) throws.push(plan[k2]!);
          k2++;
        }
        step(s);
      }
    }
    pendingRef.current = [];
    aimRef.current = null;
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finishTimer: number | undefined;
    let cam: Camera = cameraFor(s.shots[s.current]!);
    let camDy = 0;
    let solver: Vector | null = null;
    let solverFor = -1;
    const resultNow = (): GameResult => {
      const events: TraceEvent[] = [...throws, { tick: endTickOf(s), fin: true }];
      return { score: s.best, events };
    };

    const frame = () => {
      const { want, alpha } = clock.advance(performance.now());
      const pending = pendingRef.current;
      pendingRef.current = [];
      let changed = false;
      for (const v of pending) {
        if (s.end || s.tick >= END_TICK) break;
        if (applyThrow(s, v)) {
          throws.push({ shot: s.current + 1, tick: s.tick, vx: v.vx, vy: v.vy });
          changed = true;
        }
      }
      while (s.tick < want && !s.end && s.tick < END_TICK) step(s);
      // la cámara: se acomoda al tiro, y sigue al cigarro si se sale por arriba
      const target = cameraFor(s.shots[s.current]!);
      if (reducedRef.current) cam = target;
      else cam = { s: cam.s + (target.s - cam.s) * 0.12, left: cam.left + (target.left - cam.left) * 0.12, dy: 0 };
      const wantDy = followDy(s, cam, alpha);
      camDy = reducedRef.current ? wantDy : camDy + (wantDy - camDy) * 0.2;
      cam = { ...cam, dy: camDy };
      if (devRef.current?.solver && solverFor !== s.current) {
        solverFor = s.current;
        solver = solveShot(s.shots[s.current]!).v;
      }
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, s, cam, kRef.current, { alpha, reduced: reducedRef.current, aim: aimRef.current, fullPath: devRef.current?.fullPath, debug: devRef.current?.debug, solver: devRef.current?.solver ? solver : null });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.tick = String(s.tick);
        d.shot = String(Math.min(SHOTS - 1, s.current));
        d.phase = s.phase;
        d.best = String(s.best);
        d.dist = String(s.shots[s.current]!.dist);
        d.wind = String(s.shots[s.current]!.wind);
      }
      if (s.tick !== reportedTick || changed) {
        reportedTick = s.tick;
        const result = resultNow();
        onProgress(result);
        const last = s.phase === "pause" || s.end ? (s.results[s.results.length - 1] ?? null) : null;
        const results = s.results.map((r) => r.outcome);
        const shot = Math.min(SHOTS - 1, s.current);
        const end = !!s.end;
        setHud((h) => (h.shot === shot && h.best === s.best && h.last === last && h.end === end && h.results.length === results.length ? h : { shot, best: s.best, results, last, end }));
        if (s.end && finishTimer === undefined) finishTimer = window.setTimeout(() => onFinish(result), END_HOLD_MS);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow());
    onReady();
    return () => {
      cancelAnimationFrame(raf);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [seed, startShot, onReady, onProgress, onFinish]);

  // la gomera: el primer puntero manda; arrastrar apunta (el vector es el opuesto), soltar tira; menos de 20 px no cuenta
  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointerRef.current !== null) return;
    const l = toLogical(e);
    pointerRef.current = { id: e.pointerId, x: l.x, y: l.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    aimRef.current = null;
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    if (!p || e.pointerId !== p.id) return;
    const l = toLogical(e);
    aimRef.current = vectorFromDrag(l.x - p.x, l.y - p.y);
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    if (!p || e.pointerId !== p.id) return;
    pointerRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const l = toLogical(e);
    const v = vectorFromDrag(l.x - p.x, l.y - p.y);
    aimRef.current = null;
    if (v) pendingRef.current.push(v);
  }
  function cancel(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    if (!p || e.pointerId !== p.id) return;
    pointerRef.current = null;
    aimRef.current = null;
  }

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full select-none flex-row gap-3"
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="chino-area"
      data-end={hud.end ? "1" : ""}
    >
      <div className="flex w-20 shrink-0 flex-col justify-between py-1">
        <div className="flex flex-col">
          <span className="text-xs text-tinta-suave" data-testid="chino-shot">
            tiro {hud.shot + 1} de {SHOTS}
          </span>
          <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="chino-best" aria-live="off">
            {hud.best}
          </span>
        </div>
        <span className="flex items-center gap-1" data-testid="chino-dots" aria-label={`${hud.results.length} de ${SHOTS} tiros`}>
          {Array.from({ length: SHOTS }, (_, i) => (
            <span key={i} className="inline-block h-3 w-3 rounded-full" style={{ background: hud.results[i] ? OUTCOME_COLOR[hud.results[i]!] : "var(--superficie-2)", border: "2px solid var(--contorno)" }} />
          ))}
        </span>
      </div>
      <div ref={areaRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center" data-testid="chino-field">
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} aria-label="la placita, la mano con la gomera, El chino y la manga de viento" role="img" />
          {hud.last ? (
            <div className="pointer-events-none absolute inset-x-0 top-[8%] flex justify-center" key={hud.results.length}>
              <span className={`display text-2xl ${hud.last.outcome === "adentro" ? "speech" : "note-alert"}`} role="status" data-testid="chino-banner" data-outcome={hud.last.outcome}>
                {OUTCOME_TEXT[hud.last.outcome]} +{hud.last.score}
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

/** El chino con la boca abierta, la gomera y la manga de viento (48 × 34) */
export function introSprite() {
  return composeSprite(48, 34, [
    { sprite: handSprite(), x: 0, y: 20 },
    { sprite: sockSprite(2, true), x: 14, y: 22 },
    { sprite: chinoSprite("espera"), x: 32, y: 2 },
  ]);
}

function Intro() {
  return (
    <div className="card card-c flex items-center gap-5" data-testid="chino-card">
      <SpriteSvg sprite={introSprite()} height={100} label="la gomera, la manga de viento y El chino con la boca abierta" />
      <ul className="flex flex-col gap-2 text-sm text-tinta-media">
        <li>arrastrá hacia atrás y soltá</li>
        <li>mirá la manga: el viento cambia</li>
        <li>3 tiros, cuenta el mejor</li>
      </ul>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const results = v.ok ? v.results : [];
  const best = Math.max(0, ...results.map((r) => r.score));
  return (
    <div className="flex flex-col items-center gap-3" data-testid="chino-result" data-reason={v.ok ? "ok" : v.reason}>
      <SpriteSvg sprite={chinoSprite(results.some((r) => r.outcome === "adentro") ? "adentro" : results.length ? "quehaces" : "espera")} height={110} label="El chino" />
      <p className="display-lg text-tinta" style={{ fontSize: 80 }} data-testid="game-score">
        {result.score}
      </p>
      <ul className="flex items-end justify-center gap-4" data-testid="chino-summary">
        {Array.from({ length: SHOTS }, (_, i) => {
          const r = results[i];
          const isBest = !!r && r.score === best && results.length > 0;
          return (
            <li key={i} className="flex flex-col items-center gap-0.5">
              <span className="text-xs text-tinta-suave">tiro {i + 1}</span>
              <span className="display text-2xl" style={{ color: isBest ? "var(--luciernaga)" : r ? OUTCOME_COLOR[r.outcome] : "var(--tinta-suave)" }} data-best={isBest ? "1" : undefined}>
                {r ? r.score : "—"}
              </span>
              <span className="text-[11px] text-tinta-suave">{r ? OUTCOME_TEXT[r.outcome] : "sin tirar"}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-tinta-media">{results.length === SHOTS ? "los 3 tiros hechos." : `${results.length} de 3 tiros.`}</p>
    </div>
  );
}

export const fumateAlgoChino: GameModule = {
  id: "fumate-algo-chino",
  name: "fumate algo chino",
  tagline: "apuntale a la boca.",
  howTo: ["arrastrá hacia atrás para apuntar y elegir la fuerza, y soltá para tirar", "fijate el viento: cambia en cada tiro, igual que la distancia", "son 3 tiros y cuenta el mejor: cuanto más cerca de la boca, más puntos"],
  durationMs: DURATION_MS,
  // se juega con el teléfono de costado: el contenedor rota el área si hace falta
  orientation: "landscape",
  // tres tiros al toque, con sus vuelos y pausas, llevan unos 6 s; con la cuenta regresiva, más
  minDurationMs: 5_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  recomputeScore: (result, seed) => {
    const v = check(seed, result.events);
    return v.ok ? v.best : null;
  },
  Component: ChinoGame,
  Intro,
  Result,
};

void SUB;
