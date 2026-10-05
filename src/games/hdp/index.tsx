// "hij@ de p**": el jugador es asistente en hdp, la hamburguesería de Big
// Bro. Cuatro hamburguesas en la plancha; cuando una está a punto aparece una
// flecha y hay que deslizar sobre ella hacia ese lado antes de que se queme.
// 60 segundos; gana el que da vuelta más.
//
// Mismo esquema técnico que los otros juegos de acción: simulación entera a
// 60 ticks (rules.ts) avanzada por el reloj de games/lib, y una traza con
// cada deslizamiento (también los equivocados) que `validate` vuelve a jugar.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { integerScale, sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { composeSprite } from "../lib/sprites";
import { drawScene } from "./draw";
import { applySwipe, botTrace, broLine, check, DURATION_MS, END_TICK, initialState, LINES, MAX_SCORE, remaining, simulate, step, TICKS_PER_S, validate, type Dir, type Mood, type SimState, type SwipeEvent, type TraceEvent } from "./rules";
import { arrowSprite, broSprite, FIELD_H, FIELD_W, fingerSprite, pattySprite, SPLIT_X, SPLIT_Y } from "./sprites";

/** el deslizamiento se decide a los 30 px, en el eje dominante */
export const SWIPE_PX = 30;

export interface HdpDevOptions {
  quadrants?: boolean;
  slow?: boolean;
  /** arrancar en este tick, con el jugador automático perfecto hasta ahí */
  startTick?: number;
}

type Hud = { score: number; text: string; mood: Mood; end: boolean };

/** a qué lugar le habla un punto de la vista (unidades): el cuadrante de la plancha */
export function slotAt(vx: number, vy: number): 0 | 1 | 2 | 3 {
  const col = vx < SPLIT_X ? 0 : 1;
  const row = vy < SPLIT_Y ? 0 : 2;
  return (row + col) as 0 | 1 | 2 | 3;
}

/** la dirección de un arrastre, o null si todavía no llegó al umbral */
export function swipeDir(dx: number, dy: number, threshold = SWIPE_PX): Dir | null {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
}

export function HdpGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: HdpDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pendingRef = React.useRef<{ slot: 0 | 1 | 2 | 3; dir: Dir }[]>([]);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ score: 0, text: LINES.normal[0], mood: "espera", end: false });
  const startTick = dev?.startTick ?? 0;

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
    const swipes: SwipeEvent[] = [];
    if (startTick > 0) {
      // la herramienta: el jugador automático perfecto juega hasta el tick de arranque
      const plan = botTrace(seed, { untilTick: startTick }).events.filter((e): e is SwipeEvent => !("fin" in e) && e.tick < startTick);
      s = simulate(seed, plan, startTick).state;
      swipes.push(...plan);
    }
    pendingRef.current = [];
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finished = false;
    const resultNow = (endTick: number): GameResult => ({ score: s.score, events: [...swipes, { tick: endTick, fin: true }] as TraceEvent[] });

    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      const pending = pendingRef.current;
      pendingRef.current = [];
      let changed = false;
      for (const p of pending) {
        if (finished || s.tick >= END_TICK) break;
        // también los equivocados y los que no hacen nada van a la traza: validate los vuelve a jugar igual
        if (swipes.length === 0 || s.tick - swipes[swipes.length - 1]!.tick >= 4) {
          applySwipe(s, p.slot, p.dir);
          swipes.push({ tick: s.tick, slot: p.slot, dir: p.dir });
          changed = true;
        }
      }
      while (s.tick < want && s.tick < END_TICK) step(s);
      const ctx = canvasRef.current?.getContext("2d");
      const line = broLine(s, seed);
      if (ctx) drawScene(ctx, kRef.current, s, { alpha, reduced: reducedRef.current, mood: line.mood, quadrants: devRef.current?.quadrants });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.tick = String(s.tick);
        d.score = String(s.score);
        d.burns = String(s.burns);
        s.slots.forEach((slot, i) => {
          d[`s${i}`] = `${slot.phase}:${slot.dir}:${remaining(slot, s.tick)}:${s.tick < slot.blockedUntil ? 1 : 0}`;
        });
      }
      if (s.tick !== reportedTick || changed) {
        reportedTick = s.tick;
        const end = s.tick >= END_TICK;
        onProgress(resultNow(Math.max(1, s.tick)));
        setHud((h) => (h.score === s.score && h.text === line.text && h.mood === line.mood && h.end === end ? h : { score: s.score, text: line.text, mood: line.mood, end }));
        if (end && !finished) {
          finished = true;
          onFinish(resultNow(END_TICK));
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow(Math.max(1, s.tick)));
    onReady();
    return () => cancelAnimationFrame(raf);
  }, [seed, startTick, onReady, onProgress, onFinish]);

  // un solo dedo: donde apoya elige el lugar; a los 30 px en el eje dominante, desliza (uno por gesto)
  const pointerRef = React.useRef<{ id: number; x: number; y: number; slot: 0 | 1 | 2 | 3; fired: boolean } | null>(null);
  function toView(clientX: number, clientY: number): [number, number] {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const r = canvas.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * FIELD_W, ((clientY - r.top) / r.height) * FIELD_H];
  }
  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointerRef.current !== null) return;
    const [vx, vy] = toView(e.clientX, e.clientY);
    pointerRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, slot: slotAt(vx, vy), fired: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    if (!p || e.pointerId !== p.id || p.fired) return;
    const dir = swipeDir(e.clientX - p.x, e.clientY - p.y);
    if (!dir) return;
    p.fired = true;
    pendingRef.current.push({ slot: p.slot, dir });
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    if (!p || e.pointerId !== p.id) return;
    pointerRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div ref={rootRef} className="flex h-full w-full select-none flex-col gap-2" data-testid="hdp-area" data-end={hud.end ? "1" : ""}>
      <div className="flex items-baseline gap-2 px-1">
        <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="hdp-score" aria-live="off">
          {hud.score}
        </span>
        <span className="display text-xl text-tinta-media">{hud.score === 1 ? "dada vuelta" : "dadas vuelta"}</span>
      </div>
      <div
        ref={areaRef}
        className="flex min-h-0 flex-1 items-start justify-center"
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="hdp-field"
      >
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ borderRadius: 8 }} aria-label="la cocina de hdp: la plancha con cuatro hamburguesas y Big Bro" role="img" data-testid="hdp-canvas" />
          {/* el globo de Big Bro, sobre la pared, a la izquierda de él */}
          <div className="pointer-events-none absolute flex justify-end" style={{ left: "2%", right: "34%", top: "29%" }} key={hud.text}>
            <span className={`display text-sm ${hud.mood === "enojado" || hud.mood === "grita" ? "note-alert" : "speech"}`} style={{ padding: "4px 8px" }} role="status" data-testid="hdp-say" data-mood={hud.mood}>
              {hud.text}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

/** la plancha con una hamburguesa a punto, su flecha (hacia la derecha) y un dedo deslizando con su estela (56 × 40) */
export function introSprite() {
  const plate = { w: 56, h: 40, px: [] as { x: number; y: number; c: string }[] };
  for (let y = 16; y < 40; y++) for (let x = 0; x < 56; x++) plate.px.push({ x, y, c: y === 16 || y === 39 || x === 0 || x === 55 ? "#141414" : y === 17 ? "#A4A8AE" : "#8C9096" });
  const trail = { w: 14, h: 1, px: [0, 3, 6, 9, 12].map((x) => ({ x, y: 0, c: "#FFD34E" })) };
  return composeSprite(56, 40, [
    { sprite: plate, x: 0, y: 0 },
    { sprite: pattySprite("dorando3"), x: 8, y: 24 },
    { sprite: arrowSprite("right"), x: 12, y: 5 },
    { sprite: trail, x: 18, y: 28 },
    { sprite: fingerSprite(), x: 34, y: 22 },
  ]);
}

function Intro() {
  return (
    <div className="card card-c flex items-center gap-4" data-testid="hdp-card">
      <div className="flex flex-col items-center gap-1">
        <span className="speech text-xs" style={{ padding: "3px 6px" }}>
          {LINES.intro}
        </span>
        <SpriteSvg sprite={broSprite("espera")} height={80} label="Big Bro, con los brazos cruzados" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <SpriteSvg sprite={introSprite()} height={88} label="una hamburguesa a punto con su flecha y un dedo deslizando" />
        <ul className="flex flex-col gap-1 text-xs text-tinta-media">
          <li>la flecha dice para dónde deslizar</li>
          <li>si tardás, se quema</li>
        </ul>
      </div>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const burns = v.ok ? v.burns : 0;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="hdp-result" data-reason={v.ok ? "ok" : v.reason}>
      <SpriteSvg sprite={broSprite(result.score >= 30 && burns <= 10 ? "contento" : burns > result.score ? "enojado" : "espera")} height={100} label="Big Bro" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }} data-testid="game-score">
        {result.score}
      </p>
      <p className="text-lg text-tinta-media">
        {result.score === 1 ? "hamburguesa dada vuelta" : "hamburguesas dadas vuelta"}
        {burns > 0 ? `, ${burns} ${burns === 1 ? "quemada" : "quemadas"}` : ", ninguna quemada"}.
      </p>
    </div>
  );
}

export const hdp: GameModule = {
  id: "hdp",
  name: "hij@ de p**",
  tagline: "que no se te quemen esas hijas de remil.",
  howTo: ["cuando aparece la flecha, deslizá sobre esa hamburguesa hacia ese lado", "si tardás, se quema y no suma", "gana el que da vuelta más hamburguesas en 60 segundos"],
  durationMs: DURATION_MS,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  recomputeScore: (result, seed) => {
    const v = check(seed, result.events);
    return v.ok ? v.score : null;
  },
  Component: HdpGame,
  Intro,
  Result,
};
