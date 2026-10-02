// "servila justa": ocho whiskys con coca. Mantener apretado sirve la cola de
// una botella de Nix cola y soltar corta; la espuma sigue subiendo un poco
// después de soltar y hay que quedar lo más cerca posible de la raya. Cada
// vaso tiene otra forma; se sirve una sola vez por vaso.
//
// Mismo esquema técnico que los otros juegos de acción: simulación entera a
// 60 ticks (rules.ts) avanzada por el reloj de games/lib, y una traza con los
// apretar/soltar que `validate` vuelve a jugar entera.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { composeSprite } from "../lib/sprites";
import { drawScene, scaleFor } from "./draw";
import { applyAction, botTrace, check, DURATION_MS, END_TICK, endTickOf, GLASSES, initialState, levels, lineLevel, MAX_SCORE, step, SUB, TICKS_PER_S, validate, type Action, type GlassResult, type Outcome, type PourEvent, type SimState, type TraceEvent } from "./rules";
import { glassDef, SHAPE_NAMES } from "./glasses";
import { bottleSprite, FIELD_H, FIELD_W, filledGlassSprite } from "./sprites";

/** el resumen se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;

export interface ServilaDevOptions {
  debug?: boolean;
  slow?: boolean;
  predict?: boolean;
  /** arrancar en este vaso (índice), con el jugador automático hasta ahí */
  startGlass?: number;
}

type Hud = { glass: number; score: number; results: Outcome[]; last: GlassResult | null; end: boolean };

export const OUTCOME_TEXT: Record<Outcome, string> = { justa: "¡justa!", casi: "casi", falta: "le falta", pasado: "te pasaste", rebalso: "¡se rebalsó!", vacio: "sin servir" };
export const OUTCOME_COLOR: Record<Outcome, string> = { justa: "#8EDC66", casi: "#FFD34E", falta: "#FF6F91", pasado: "#FF6F91", rebalso: "#B23A5A", vacio: "#B23A5A" };

export function ServilaGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: ServilaDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pendingRef = React.useRef<Action[]>([]);
  const heldRef = React.useRef(false);
  const pointerRef = React.useRef<number | null>(null);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ glass: 0, score: 0, results: [], last: null, end: false });
  const startGlass = dev?.startGlass ?? 0;

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
      const r = area.getBoundingClientRect();
      setK(scaleFor(r.width, r.height, window.devicePixelRatio || 1));
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
    const inputs: PourEvent[] = [];
    // herramienta de desarrollo: el jugador automático sirve los vasos anteriores
    if (startGlass > 0) {
      const plan = botTrace(seed, { maxGlasses: startGlass }).events.filter((e): e is PourEvent => !("fin" in e));
      let k2 = 0;
      while (!s.end && (s.current?.index ?? 0) < startGlass) {
        while (k2 < plan.length && plan[k2]!.tick === s.tick) {
          if (applyAction(s, plan[k2]!.action)) inputs.push(plan[k2]!);
          k2++;
        }
        step(s);
      }
    }
    pendingRef.current = [];
    heldRef.current = false;
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finishTimer: number | undefined;
    const resultNow = (): GameResult => {
      const events: TraceEvent[] = [...inputs, { tick: endTickOf(s), fin: true }];
      return { score: s.score, events };
    };

    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      const pending = pendingRef.current;
      pendingRef.current = [];
      let changed = false;
      for (const a of pending) {
        if (s.end || s.tick >= END_TICK) break;
        if (applyAction(s, a)) {
          inputs.push({ tick: s.tick, action: a });
          changed = true;
        }
      }
      while (s.tick < want && !s.end && s.tick < END_TICK) step(s);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, s, kRef.current, { alpha, reduced: reducedRef.current, debug: devRef.current?.debug, predict: devRef.current?.predict });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        const lv = levels(s);
        d.tick = String(s.tick);
        d.glass = String(s.current?.index ?? GLASSES);
        d.phase = s.phase;
        d.pressed = s.current?.pressed ? "1" : "";
        d.liquid = String(lv.liquid);
        d.top = String(lv.top);
        d.line = String(lineLevel(s));
        d.score = String(s.score);
      }
      if (s.tick !== reportedTick || changed) {
        reportedTick = s.tick;
        const result = resultNow();
        onProgress(result);
        // el cartel del vaso: mientras dura la pausa (el resultado sigue en el vaso en curso) y al final
        const last = s.current?.result ?? (s.end ? (s.results[s.results.length - 1] ?? null) : null);
        const results = s.results.map((r) => r.outcome);
        const glass = Math.min(GLASSES - 1, s.current?.index ?? GLASSES - 1);
        const end = !!s.end;
        setHud((h) => (h.glass === glass && h.score === s.score && h.last === last && h.end === end && h.results.length === results.length ? h : { glass, score: s.score, results, last, end }));
        if (s.end && finishTimer === undefined) finishTimer = window.setTimeout(() => onFinish(result), END_HOLD_MS);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow());
    onReady();

    // la barra espaciadora mantenida sirve
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat) return;
      e.preventDefault();
      if (pointerRef.current === null) press();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== " ") return;
      if (pointerRef.current === null) release();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [seed, startGlass, onReady, onProgress, onFinish]);

  function press() {
    if (heldRef.current) return;
    heldRef.current = true;
    pendingRef.current.push("down");
  }
  function release() {
    if (!heldRef.current) return;
    heldRef.current = false;
    pendingRef.current.push("up");
  }
  // un solo dedo: manda el primero; levantar, cancelar o salir del área suelta
  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointerRef.current !== null) return;
    pointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press();
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    release();
  }

  const banner = hud.last ? OUTCOME_TEXT[hud.last.outcome] : null;
  return (
    <div
      ref={rootRef}
      className="flex h-full w-full select-none flex-col gap-2"
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="servila-area"
      data-end={hud.end ? "1" : ""}
    >
      <div className="flex items-end justify-between px-1">
        <div className="flex flex-col">
          <span className="text-xs text-tinta-suave" data-testid="servila-glass">
            vaso {hud.glass + 1} de {GLASSES}
          </span>
          <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="servila-score" aria-live="off">
            {hud.score}
          </span>
        </div>
        <span className="flex items-center gap-1" data-testid="servila-dots" aria-label={`${hud.results.length} de ${GLASSES} vasos servidos`}>
          {Array.from({ length: GLASSES }, (_, i) => (
            <span key={i} className="inline-block h-3 w-3 rounded-full" style={{ background: hud.results[i] ? OUTCOME_COLOR[hud.results[i]!] : "var(--superficie-2)", border: "2px solid var(--contorno)" }} />
          ))}
        </span>
      </div>
      <div ref={areaRef} className="flex min-h-0 flex-1 items-start justify-center" data-testid="servila-field">
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} aria-label="la barra, el vaso y la botella de Nix cola" role="img" />
          {banner && hud.last ? (
            <div className="pointer-events-none absolute inset-x-0 top-[12%] flex justify-center" key={hud.results.length}>
              <span className={`display text-2xl ${hud.last.score >= 75 ? "speech" : "note-alert"}`} role="status" data-testid="servila-banner" data-outcome={hud.last.outcome}>
                {banner} {hud.last.outcome !== "vacio" ? `+${hud.last.score}` : ""}
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

/** la botella y un vaso con la raya, para la previa (56 × 52) */
export function introSprite() {
  const d = glassDef("tubo");
  return composeSprite(56, 52, [
    { sprite: filledGlassSprite("tubo", 9, 9 * SUB, 9 * SUB, d.firstRow + 32), x: 22, y: 52 - d.h },
    { sprite: bottleSprite(), x: 0, y: 2 },
  ]);
}

function Intro() {
  return (
    <div className="card card-c flex items-center gap-5" data-testid="servila-card">
      <SpriteSvg sprite={introSprite()} height={104} label="la botella de Nix cola y un vaso con la raya" />
      <ul className="flex flex-col gap-2 text-sm text-tinta-media">
        <li>mantené apretado: sale la cola</li>
        <li>soltá antes de la raya: la espuma sigue</li>
        <li>8 vasos, uno distinto cada vez</li>
      </ul>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const glasses = React.useMemo(() => initialState(seed).glasses, [seed]);
  const results = v.ok ? v.results : [];
  return (
    <div className="flex flex-col items-center gap-3" data-testid="servila-result" data-reason={v.ok ? "ok" : v.reason}>
      <p className="display-lg text-tinta" style={{ fontSize: 80 }} data-testid="game-score">
        {result.score}
      </p>
      <p className="text-lg text-tinta-media">{results.length === GLASSES ? "los 8 vasos servidos." : `${results.length} de 8 vasos; el resto valió 0.`}</p>
      <ul className="flex flex-wrap items-end justify-center gap-2" data-testid="servila-summary">
        {glasses.map((g, i) => {
          const r = results[i];
          const top = r ? r.top : (g.def.firstRow + g.whiskyRows) * SUB;
          const liquid = r ? Math.min(r.top, top) : top;
          return (
            <li key={i} className="flex flex-col items-center gap-0.5">
              <SpriteSvg sprite={filledGlassSprite(g.shape, g.whiskyRows, liquid, top, g.lineRow)} height={44} label={`${SHAPE_NAMES[g.shape]}: ${r ? r.score : 0}`} />
              <span className="display text-sm" style={{ color: r ? OUTCOME_COLOR[r.outcome] : "var(--tinta-suave)" }}>
                {r ? r.score : 0}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const servilaJusta: GameModule = {
  id: "servila-justa",
  name: "servila justa",
  tagline: "ni un dedo de más.",
  howTo: ["mantené apretado para servir la cola y soltá para cortar", "la espuma sigue subiendo después de soltar: cortá antes de la raya", "cada vaso es distinto: son 8, y gana el que queda más cerca"],
  durationMs: DURATION_MS,
  // ocho vasos rebalsados a propósito terminan en unos 25 s; con la cuenta regresiva, más
  minDurationMs: 10_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  Component: ServilaGame,
  Intro,
  Result,
};
