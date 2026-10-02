// "cortalo parejo": Big Bro pone una comida de forma irregular sobre la mesa y
// hay que cortarla en dos partes iguales con un solo deslizamiento recto.
// Tres cortes, cada uno con un objeto más difícil; el puntaje es la suma.
//
// Sin simulación por ticks: el núcleo es geometría exacta (rules.ts), igual en
// el navegador y en Node, y `validate` vuelve a cortar los objetos de la
// semilla con la traza (un evento por corte que contó).
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { sizeCanvas, integerScale } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { drawScene, partCenters, SEPARATION, svgPartPoints, svgPoints, TABLE, toView } from "./draw";
import { applyCut, check, clipSide, CUTS, DURATION_MS, END_HOLD_MS, evaluateCut, GRID, initialState, inPause, isDone, MAX_SCORE, MIN_CUT_PX, PAUSE_MS, sayFor, solveCut, validate, type CutEvent, type CutResult, type GameState, type Line } from "./rules";
import { shapeById, SHAPES } from "./shapes";
import { broSprite, cleaverSprite, FIELD_H, FIELD_W, type Mood } from "./sprites";

/** el destello sobre la recta y la separación de las partes */
const FLASH_MS = 220;
const SEP_MS = 300;

export const GOOD_COLOR = "#8EDC66";
export const BAD_COLOR = "#FF6F91";

export interface CortaloDevOptions {
  vertices?: boolean;
  solver?: boolean;
  areas?: boolean;
  /** arrancar en este corte (índice): el jugador automático hace los anteriores */
  startCut?: number;
}

type Label = { x: number; y: number; text: string };
type Hud = { cut: number; total: number; results: boolean[]; say: { text: string; score: number; good: boolean } | null; labels: Label[]; end: boolean; areas: string };

export function pctText(tenths: number): string {
  return `${Math.floor(tenths / 10)},${tenths % 10}%`;
}

export function CortaloGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: CortaloDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ cut: 0, total: 0, results: [], say: null, labels: [], end: false, areas: "" });
  const startCut = dev?.startCut ?? 0;
  // lo que comparten los handlers y el cuadro
  const gameRef = React.useRef<{
    s: GameState;
    events: CutEvent[];
    readyAt: number;
    drag: { x: number; y: number; px: number; py: number; cx: number; cy: number } | null;
    lastCut: { at: number; result: CutResult } | null;
    finishTimer: number | undefined;
  } | null>(null);

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

  // la partida: estado puro, el reloj en ms desde onReady, un cuadro por rAF
  React.useEffect(() => {
    const s = initialState(seed);
    const events: CutEvent[] = [];
    let readyAt = performance.now();
    if (startCut > 0) {
      // la herramienta: los cortes anteriores los hace el resolvedor, en el pasado
      readyAt -= startCut * PAUSE_MS + 10;
      for (let i = 0; i < startCut && i < CUTS; i++) {
        const line = solveCut(s.objects[i]!.verts).line;
        const r = applyCut(s, line, i * PAUSE_MS);
        if (r.ok) events.push({ cut: i + 1, t: i * PAUSE_MS, ...line });
      }
    }
    const g: NonNullable<typeof gameRef.current> = { s, events, readyAt, drag: null, lastCut: null, finishTimer: undefined };
    gameRef.current = g;
    let raf = 0;
    let lastKey = "";
    const resultNow = (): GameResult => ({ score: g.s.total, events: [...g.events] });

    const frame = () => {
      const now = performance.now();
      const t = now - g.readyAt;
      const done = isDone(g.s);
      const pause = inPause(g.s, t);
      const last = g.lastCut;
      const showCut = (pause || done) && last ? last.result : null;
      const since = last ? now - last.at : Infinity;
      const sep = showCut ? (reducedRef.current ? SEPARATION : Math.min(1, since / SEP_MS) * SEPARATION) : 0;
      const mood: Mood = showCut ? (showCut.outcome.good ? "contento" : "enojado") : "espera";
      const index = showCut ? showCut.cut - 1 : Math.min(CUTS - 1, g.s.cuts.length);
      const aim = g.drag && !pause && !done ? { x1: g.drag.x, y1: g.drag.y, x2: g.drag.cx, y2: g.drag.cy } : null;
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        drawScene(ctx, kRef.current, {
          objects: g.s.objects,
          index,
          cut: showCut ? showCut.line : null,
          sep,
          flash: since < FLASH_MS,
          mood,
          aim,
          reduced: reducedRef.current,
          devVerts: devRef.current?.vertices,
          solverLine: devRef.current?.solver && !showCut ? solveCut(g.s.objects[index]!.verts).line : null,
        });
      }
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.cut = String(Math.min(CUTS - 1, g.s.cuts.length));
        d.phase = done ? "done" : pause ? "pause" : "aim";
        d.total = String(g.s.total);
      }
      // el HUD y los carteles, solo cuando cambia algo
      let labels: Label[] = [];
      if (showCut) {
        const canvas = canvasRef.current;
        const f = canvas ? canvas.clientWidth / FIELD_W : 1;
        const c = partCenters(g.s.objects[showCut.cut - 1]!.verts, showCut.line, SEPARATION);
        labels = [
          { x: c.left[0] * f, y: c.left[1] * f, text: pctText(showCut.outcome.leftPct10) },
          { x: c.right[0] * f, y: c.right[1] * f, text: pctText(showCut.outcome.rightPct10) },
        ];
      }
      let areas = "";
      if (devRef.current?.areas && aim) {
        const o = evaluateCut(g.s.objects[index]!.verts, aim);
        areas = o ? `izquierda ${pctText(o.leftPct10)} · derecha ${pctText(o.rightPct10)} · ${o.score}` : "la recta no toca el objeto";
      }
      const key = `${g.s.cuts.length}|${g.s.total}|${showCut ? showCut.cut : 0}|${done}|${areas}|${labels.length}`;
      if (key !== lastKey) {
        lastKey = key;
        setHud({
          cut: Math.min(CUTS - 1, g.s.cuts.length),
          total: g.s.total,
          results: g.s.cuts.map((c) => c.outcome.good),
          say: showCut ? { text: sayFor(showCut.outcome.score), score: showCut.outcome.score, good: showCut.outcome.good } : null,
          labels,
          end: done,
          areas,
        });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow());
    onReady();
    return () => {
      cancelAnimationFrame(raf);
      if (g.finishTimer !== undefined) window.clearTimeout(g.finishTimer);
    };
  }, [seed, startCut, onReady, onProgress]);

  /** de la pantalla a la grilla de la mesa (enteros) */
  function toTable(clientX: number, clientY: number): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * FIELD_W;
    const vy = ((clientY - r.top) / r.height) * FIELD_H;
    return { x: Math.round(((vx - TABLE.x) * GRID) / TABLE.w), y: Math.round(((vy - TABLE.y) * GRID) / TABLE.w) };
  }

  // un solo dedo: apoyar, arrastrar (se ve la recta) y soltar corta
  const pointerRef = React.useRef<number | null>(null);
  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointerRef.current !== null) return;
    const g = gameRef.current;
    if (!g) return;
    pointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toTable(e.clientX, e.clientY);
    g.drag = { x: p.x, y: p.y, px: e.clientX, py: e.clientY, cx: p.x, cy: p.y };
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    const g = gameRef.current;
    if (e.pointerId !== pointerRef.current || !g?.drag) return;
    const p = toTable(e.clientX, e.clientY);
    g.drag.cx = p.x;
    g.drag.cy = p.y;
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    const g = gameRef.current;
    if (e.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const d = g?.drag;
    if (!g || !d) return;
    g.drag = null;
    const p = toTable(e.clientX, e.clientY);
    const line: Line = { x1: d.x, y1: d.y, x2: p.x, y2: p.y };
    // menos de 40 px no cuenta (y la regla en unidades de la mesa la pone applyCut)
    if (Math.hypot(e.clientX - d.px, e.clientY - d.py) < MIN_CUT_PX) return;
    const now = performance.now();
    const t = Math.max(0, Math.round(now - g.readyAt));
    const r = applyCut(g.s, line, t);
    if (!r.ok) return;
    g.events.push({ cut: r.result.cut, t, ...line });
    g.lastCut = { at: now, result: r.result };
    const result: GameResult = { score: g.s.total, events: [...g.events] };
    onProgress(result);
    if (isDone(g.s) && g.finishTimer === undefined) g.finishTimer = window.setTimeout(() => onFinish(result), END_HOLD_MS);
  }
  function cancel(e: React.PointerEvent<HTMLDivElement>) {
    const g = gameRef.current;
    if (e.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    if (g) g.drag = null;
  }

  return (
    <div ref={rootRef} className="flex h-full w-full select-none flex-col gap-2" data-testid="cortalo-area" data-end={hud.end ? "1" : ""}>
      <div className="flex items-end justify-between px-1">
        <div className="flex flex-col">
          <span className="text-xs text-tinta-suave" data-testid="cortalo-cut">
            corte {hud.cut + 1} de {CUTS}
          </span>
          <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="cortalo-total" aria-live="off">
            {hud.total}
          </span>
        </div>
        <span className="flex items-center gap-1" data-testid="cortalo-dots" aria-label={`${hud.results.length} de ${CUTS} cortes`}>
          {Array.from({ length: CUTS }, (_, i) => (
            <span key={i} className="inline-block h-3 w-3 rounded-full" style={{ background: i < hud.results.length ? (hud.results[i] ? GOOD_COLOR : BAD_COLOR) : "var(--superficie-2)", border: "2px solid var(--contorno)" }} />
          ))}
        </span>
      </div>
      <div
        ref={areaRef}
        className="flex min-h-0 flex-1 items-start justify-center"
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="cortalo-table"
      >
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ borderRadius: 8 }} aria-label="la mesa de la cocina, Big Bro y la comida para cortar" role="img" data-testid="cortalo-canvas" />
          {hud.labels.map((l, i) => (
            <span key={`${hud.cut}-${i}`} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded px-1 text-sm font-semibold text-white" style={{ left: l.x, top: l.y, background: "rgba(20,20,20,0.7)", fontVariantNumeric: "tabular-nums" }} data-testid="cortalo-pct">
              {l.text}
            </span>
          ))}
          {hud.say ? (
            <div className="pointer-events-none absolute inset-x-0 top-[17%] flex flex-col items-center gap-1" key={hud.results.length}>
              <span className={`display text-2xl ${hud.say.good ? "speech" : "note-alert"}`} role="status" data-testid="cortalo-say" data-good={hud.say.good ? "1" : "0"}>
                {hud.say.text}
              </span>
              <span className="display text-xl text-tinta" style={{ textShadow: "0 1px 0 #141414, 0 0 4px #141414" }} data-testid="cortalo-cut-score">
                +{hud.say.score}
              </span>
            </div>
          ) : null}
          {hud.areas ? (
            <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1 text-xs text-white" data-testid="dev-areas">
              {hud.areas}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

/** Big Bro con una pizza sobre la mesa y una línea de corte de ejemplo */
function Intro() {
  const pizza = SHAPES[0]!;
  const pts = pizza.verts.map(([x, y]) => `${x / 10},${y / 10}`).join(" ");
  return (
    <div className="card card-c flex items-center gap-4" data-testid="cortalo-card">
      <div className="flex items-end gap-1">
        <SpriteSvg sprite={broSprite("espera")} height={96} label="Big Bro, el chef, con los brazos cruzados" />
        <svg viewBox="0 0 100 100" width={84} height={84} shapeRendering="crispEdges" role="img" aria-label="una pizza sobre la tabla con una línea de corte punteada">
          <rect x="0" y="0" width="100" height="100" fill="#C49A6C" />
          <polygon points={pts} fill={pizza.fill} stroke="#141414" strokeWidth="2" />
          <circle cx="50" cy="50" r="33" fill={pizza.texture} />
          <circle cx="50" cy="50" r="27" fill="#F2D16B" />
          <line x1="8" y1="92" x2="92" y2="8" stroke="#F7FFF2" strokeWidth="2" strokeDasharray="4 4" />
        </svg>
        <SpriteSvg sprite={cleaverSprite()} height={18} label="" />
      </div>
      <ul className="flex flex-col gap-2 text-sm text-tinta-media">
        <li>deslizá recto para cortar</li>
        <li>dos partes iguales: más puntos</li>
        <li>3 cortes, y Big Bro opina</li>
      </ul>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const state = v.ok ? v.state : initialState(seed);
  const cuts = v.ok ? state.cuts : [];
  const size = 60;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="cortalo-result" data-reason={v.ok ? "ok" : v.reason}>
      <SpriteSvg sprite={broSprite(cuts.length && cuts.every((c) => c.outcome.good) ? "contento" : cuts.some((c) => !c.outcome.good) ? "enojado" : "espera")} height={100} label="Big Bro" />
      <p className="display-lg text-tinta" style={{ fontSize: 80 }} data-testid="game-score">
        {result.score}
      </p>
      <ul className="flex items-start justify-center gap-3" data-testid="cortalo-summary">
        {state.objects.map((o, i) => {
          const c = cuts[i];
          const shape = shapeById(o.shape);
          const sep = 2.5;
          let parts: React.ReactNode;
          if (c) {
            const dx = c.line.x2 - c.line.x1;
            const dy = c.line.y2 - c.line.y1;
            const len = Math.hypot(dx, dy) || 1;
            const n: [number, number] = [(-dy / len) * sep, (dx / len) * sep];
            parts = (
              <>
                <polygon points={svgPartPoints(clipSide(o.verts, c.line, true), size, n)} fill={shape.fill} stroke="#141414" strokeWidth="1.5" />
                <polygon points={svgPartPoints(clipSide(o.verts, c.line, false), size, [-n[0], -n[1]])} fill={shape.fill} stroke="#141414" strokeWidth="1.5" />
              </>
            );
          } else {
            parts = <polygon points={svgPoints(o.verts, size)} fill={shape.fill} stroke="#141414" strokeWidth="1.5" opacity={0.5} />;
          }
          return (
            <li key={i} className="flex flex-col items-center gap-0.5" data-testid="cortalo-summary-cut">
              <svg viewBox={`-4 -4 ${size + 8} ${size + 8}`} width={size + 8} height={size + 8} shapeRendering="crispEdges" role="img" aria-label={`${shape.name}, corte ${i + 1}`}>
                <rect x="-4" y="-4" width={size + 8} height={size + 8} fill="#C49A6C" rx="4" />
                {parts}
              </svg>
              <span className="text-[11px] text-tinta-suave" style={{ fontVariantNumeric: "tabular-nums" }}>
                {c ? `${pctText(c.outcome.leftPct10)} / ${pctText(c.outcome.rightPct10)}` : "sin cortar"}
              </span>
              <span className="display text-xl" style={{ color: c ? (c.outcome.good ? GOOD_COLOR : BAD_COLOR) : "var(--tinta-suave)" }}>
                {c ? c.outcome.score : 0}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-tinta-media">{cuts.length === CUTS ? "los 3 cortes hechos." : `${cuts.length} de 3 cortes.`}</p>
    </div>
  );
}

export const cortaloParejo: GameModule = {
  id: "cortalo-parejo",
  name: "cortalo parejo",
  tagline: "mitad y mitad, bro.",
  howTo: ["deslizá el dedo en línea recta para cortar el objeto en dos", "tienen que quedar dos partes iguales: cuanto más parejas, más puntos", "son 3 cortes, y Big Bro te dice qué le pareció"],
  durationMs: DURATION_MS,
  // tres cortes al toque con sus pausas llevan unos 4 s; con la cuenta regresiva, más
  minDurationMs: 4_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  Component: CortaloGame,
  Intro,
  Result,
};

void toView;
