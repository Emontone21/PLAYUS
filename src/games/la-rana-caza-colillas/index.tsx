// "la rana caza colillas": la rana de Frog en el centro del estanque; a su
// alrededor vuelan colillas y, mezclados, vapeadores. Tocar un punto tira la
// lengua hacia ahí: si la punta agarra una colilla, suma 1; si agarra un
// vapeador, se termina. 60 segundos; gana el que come más.
//
// Mismo esquema técnico que los otros juegos de acción: simulación entera a
// 60 ticks (rules.ts) avanzada por el reloj de games/lib, y una traza con
// cada toque que tiró la lengua que `validate` vuelve a jugar. La rana es la
// grilla de la mascota y la colilla es el ícono de la moneda (decisión 262).
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { integerScale, sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { createPointerTracker } from "../lib/taps";
import { Colilla } from "@/components/colilla";
import { drawScene } from "./draw";
import { applyLick, botTrace, check, CRASH_HOLD_TICKS, DURATION_MS, END_TICK, FIELD, initialState, MAX_SCORE, simulate, step, TICKS_PER_S, validate, type LickEvent, type Pt, type SimState, type TraceEvent } from "./rules";
import { colillaSprite, FIELD_PX, frogSprite, UNITS_PER_PX, vapoSprite } from "./sprites";

/** el cartel del final */
export const CRASH_SIGN = "¡puaj, un vapo!";

export interface RanaDevOptions {
  debug?: boolean;
  slow?: boolean;
  /** arrancar en este tick (el jugador automático jugó hasta ahí) */
  startTick?: number;
  /** el jugador automático juega solo */
  auto?: boolean;
}

type Hud = { score: number; crashed: boolean; end: boolean };

/** de la pantalla al campo lógico (enteros, recortados al área) */
export function toField(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Pt {
  const x = Math.round(((clientX - rect.left) / rect.width) * FIELD);
  const y = Math.round(((clientY - rect.top) / rect.height) * FIELD);
  return { x: Math.max(0, Math.min(FIELD, x)), y: Math.max(0, Math.min(FIELD, y)) };
}

export function RanaGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: RanaDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pendingRef = React.useRef<Pt[]>([]);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ score: 0, crashed: false, end: false });
  const startTick = dev?.startTick ?? 0;
  const auto = !!dev?.auto;

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
    const measure = () => setK(integerScale(area.clientWidth, area.clientHeight, window.devicePixelRatio || 1, FIELD_PX, FIELD_PX));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    sizeCanvas(canvas, FIELD_PX, FIELD_PX, k, window.devicePixelRatio || 1);
    kRef.current = k;
  }, [k]);

  React.useEffect(() => {
    let s: SimState = initialState(seed);
    const licks: LickEvent[] = [];
    // la herramienta: el jugador automático juega hasta el tick de arranque, o toda la partida si está en automático
    const plan = startTick > 0 || auto ? botTrace(seed).events.filter((e): e is LickEvent => !("fin" in e)) : [];
    let planK = 0;
    if (startTick > 0) {
      const before = plan.filter((e) => e.tick < startTick);
      const r = simulate(seed, before, startTick);
      if (!("ok" in r)) {
        s = r.state;
        licks.push(...before);
      }
      while (planK < plan.length && plan[planK]!.tick < startTick) planK++;
    }
    pendingRef.current = [];
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finished = false;
    // el parpadeo, como en la app: cada 3,4 a 4,6 s, 160 ms con los ojos planos (de la semilla, no del azar)
    let blinkAt = s.tick + 200;
    const resultNow = (endTick: number): GameResult => ({ score: s.score, events: [...licks, { tick: endTick, fin: true }] as TraceEvent[] });

    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      const pending = pendingRef.current;
      pendingRef.current = [];
      let changed = false;
      for (const p of pending) {
        if (finished || s.crashed || s.tick >= END_TICK) break;
        if (applyLick(s, p) === "lengua") {
          licks.push({ tick: s.tick, x: p.x, y: p.y });
          changed = true;
        }
      }
      while (s.tick < want && s.tick < END_TICK + CRASH_HOLD_TICKS) {
        if (s.crashed && s.tick - s.crashTick >= CRASH_HOLD_TICKS) break;
        if (!s.crashed && s.tick >= END_TICK) break;
        if (auto) {
          while (planK < plan.length && plan[planK]!.tick === s.tick) {
            const e = plan[planK++]!;
            if (applyLick(s, { x: e.x, y: e.y }) === "lengua") licks.push({ tick: s.tick, x: e.x, y: e.y });
          }
        }
        step(s);
      }
      const blink = !reducedRef.current && s.tick >= blinkAt && s.tick < blinkAt + 10;
      if (s.tick >= blinkAt + 10) blinkAt = s.tick + 204 + ((s.tick * 7919) % 72);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, kRef.current, s, { alpha, reduced: reducedRef.current, blink, debug: devRef.current?.debug });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.tick = String(s.tick);
        d.score = String(s.score);
        d.tongue = s.tongue ? "1" : "0";
        d.licks = String(s.licks);
        d.crashed = s.crashed ? "1" : "0";
      }
      if (s.tick !== reportedTick || changed) {
        reportedTick = s.tick;
        const end = s.crashed ? s.tick - s.crashTick >= CRASH_HOLD_TICKS : s.tick >= END_TICK;
        onProgress(resultNow(s.crashed ? s.crashTick : Math.max(1, s.tick)));
        setHud((h) => (h.score === s.score && h.crashed === s.crashed && h.end === end ? h : { score: s.score, crashed: s.crashed, end }));
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
  }, [seed, startTick, auto, onReady, onProgress, onFinish]);

  // tocar en cualquier parte tira la lengua hacia ahí; un solo dedo
  const tracker = React.useRef(createPointerTracker()).current;
  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!tracker.down(e.pointerId)) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    pendingRef.current.push(toField(e.clientX, e.clientY, canvas.getBoundingClientRect()));
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    tracker.up(e.pointerId);
  }

  return (
    <div ref={rootRef} className="flex h-full w-full select-none flex-col gap-2" data-testid="rana-area" data-end={hud.end ? "1" : ""}>
      <div className="flex items-center gap-2 px-1">
        <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="rana-score" aria-live="off">
          {hud.score}
        </span>
        <span className="display text-xl text-tinta-media">{hud.score === 1 ? "colilla" : "colillas"}</span>
        <Colilla size={26} />
      </div>
      <div
        ref={areaRef}
        className="flex min-h-0 flex-1 items-start justify-center"
        style={{ touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="rana-field"
      >
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ borderRadius: 8 }} aria-label="el estanque de noche con la rana en el centro, colillas y vapeadores volando" role="img" data-testid="rana-canvas" />
          {hud.crashed ? (
            <div className="pointer-events-none absolute inset-x-0 top-[12%] flex justify-center">
              <span className="note-alert display text-2xl" role="status" data-testid="rana-crash">
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

function Intro() {
  return (
    <div className="card card-c flex flex-col gap-3" data-testid="rana-card">
      <div className="flex items-end justify-around gap-2">
        <SpriteSvg sprite={frogSprite("cerrada")} height={84} label="la rana de Frog sobre su nenúfar" />
        <div className="flex flex-col items-center gap-1">
          <SpriteSvg sprite={colillaSprite(0)} height={30} label="una colilla con alitas" />
          <span className="speech text-xs" style={{ padding: "3px 6px" }}>
            comé
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <SpriteSvg sprite={vapoSprite(0)} height={36} label="un vapeador con alitas" />
          <span className="note-alert text-xs" style={{ padding: "3px 6px" }}>
            ni loco
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-1 text-sm text-tinta-media">
        <li>tocá y la lengua va hasta ahí</li>
        <li>las colillas suman; el vapo termina todo</li>
      </ul>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const crashed = v.ok ? v.crashed : false;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="rana-result" data-reason={v.ok ? "ok" : v.reason}>
      <SpriteSvg sprite={frogSprite(crashed ? "abierta" : "masticando", { dark: crashed })} height={96} label="la rana" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }}>
        <span data-testid="game-score">{result.score}</span>
      </p>
      <p className="flex items-center gap-2 text-lg text-tinta-media">
        {result.score === 1 ? "colilla comida" : "colillas comidas"} <Colilla size={18} />
        {crashed ? ". y un vapo, puaj." : "."}
      </p>
    </div>
  );
}

export const laRanaCazaColillas: GameModule = {
  id: "la-rana-caza-colillas",
  name: "la rana caza colillas",
  tagline: "colillas sí, vapos no.",
  howTo: ["tocá una colilla y la rana le tira la lengua", "si la lengua agarra un vapeador, se termina", "gana el que come más colillas en 60 segundos"],
  durationMs: DURATION_MS,
  // un vapeador puede aparecer al alcance a los pocos segundos; la cuenta regresiva suma 3 más
  minDurationMs: 3_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  recomputeScore: (result, seed) => {
    const v = check(seed, result.events);
    return v.ok ? v.score : null;
  },
  Component: RanaGame,
  Intro,
  Result,
};

void UNITS_PER_PX;
