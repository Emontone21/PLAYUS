// "Nach y la roca": un corredor de tres carriles visto desde atrás. The Nach,
// un DJ, avanza solo por una calle de noche cada vez más rápido; las rocas
// vienen en filas y deslizar a los costados lo cambia de carril. Tres vidas;
// el puntaje son los metros.
//
// Mismo esquema técnico que los otros juegos de acción: simulación entera a
// 60 ticks (rules.ts) avanzada por el reloj de games/lib, el curso generado
// entero desde la semilla con garantías de justicia, y una traza con los
// cambios de carril que `validate` vuelve a jugar entera. El detector de
// deslizamientos es el de rastitas (games/lib/swipe).
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { sizeCanvas } from "../lib/canvas-scale";
import { swipeHandlers } from "../lib/swipe";
import { SpriteSvg } from "../lib/sprite-svg";
import { composeSprite } from "../lib/sprites";
import { drawScene, scaleFor } from "./draw";
import { applySwipe, botTrace, check, DURATION_MS, END_TICK, endTickOf, generateCourse, initialState, LIVES, MAX_SCORE, metersOf, step, TICKS_PER_S, validate, type Course, type Dir, type EndReason, type LaneEvent, type SimState, type TraceEvent } from "./rules";
import { FIELD_H, FIELD_W, nachDownSprite, nachSprite, rockSprite, vinylOffSprite, vinylSprite } from "./sprites";

/** el final se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;

export interface NachDevOptions {
  hitboxes?: boolean;
  slow?: boolean;
  /** arrancar en estos metros, con el jugador automático hasta ahí */
  startMeters?: number;
}

type Hud = { meters: number; lives: number; end: EndReason | null; scratch: boolean };

export function NachGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: NachDevOptions }) {
  const course = React.useMemo<Course>(() => generateCourse(seed), [seed]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pendingRef = React.useRef<Dir[]>([]);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ meters: 0, lives: LIVES, end: null, scratch: false });
  const startMeters = dev?.startMeters ?? 0;

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
    const s: SimState = initialState();
    const inputs: LaneEvent[] = [];
    // herramienta de desarrollo: el jugador automático juega hasta los metros pedidos
    if (startMeters > 0) {
      const bot = botTrace(seed);
      const plan = bot.events.filter((e): e is LaneEvent => !("fin" in e));
      let k2 = 0;
      while (metersOf(s) < startMeters && s.tick < END_TICK && !s.end) {
        while (k2 < plan.length && plan[k2]!.tick === s.tick) {
          applySwipe(s, plan[k2]!.dir);
          inputs.push(plan[k2]!);
          k2++;
        }
        step(s, course);
      }
    }
    pendingRef.current = [];
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finishTimer: number | undefined;
    const resultNow = (): GameResult => {
      const events: TraceEvent[] = [...inputs, { tick: endTickOf(s), fin: true }];
      return { score: metersOf(s), events };
    };

    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      // los deslizamientos pedidos desde el último cuadro, en el tick actual (uno por tick: el resto va a la cola de 1)
      const pending = pendingRef.current;
      pendingRef.current = [];
      for (const dir of pending) {
        if (s.end || s.tick >= END_TICK) break;
        if (applySwipe(s, dir)) inputs.push({ tick: s.tick, dir });
      }
      while (s.tick < want && !s.end && s.tick < END_TICK) step(s, course);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, s, course, kRef.current, { alpha, reduced: reducedRef.current, hitboxes: devRef.current?.hitboxes });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.tick = String(s.tick);
        d.meters = String(metersOf(s));
        d.lane = String(s.lane);
        d.lives = String(s.lives);
        d.nextrow = String(s.nextRow);
      }
      if (s.tick !== reportedTick) {
        reportedTick = s.tick;
        const result = resultNow();
        onProgress(result);
        const end = s.end?.reason ?? null;
        const scratch = !!s.lastHit && s.tick - s.lastHit.tick < 45;
        setHud((h) => (h.meters === result.score && h.lives === s.lives && h.end === end && h.scratch === scratch ? h : { meters: result.score, lives: s.lives, end, scratch }));
        if (s.end && finishTimer === undefined) finishTimer = window.setTimeout(() => onFinish(result), END_HOLD_MS);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow());
    onReady();

    // las flechas del teclado entran en la misma cola
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "ArrowLeft") pendingRef.current.push(-1);
      else if (e.key === "ArrowRight") pendingRef.current.push(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [course, seed, startMeters, onReady, onProgress, onFinish]);

  const swipe = React.useRef(
    swipeHandlers<HTMLDivElement>(
      (dir) => {
        if (dir === "left") pendingRef.current.push(-1);
        else if (dir === "right") pendingRef.current.push(1);
      },
      { axis: "horizontal" },
    ),
  ).current;

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full select-none flex-col gap-2"
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      {...swipe}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="nach-area"
      data-end={hud.end ?? ""}
    >
      <div className="flex items-center justify-between px-1">
        <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="nach-meters" aria-live="off">
          {hud.meters} m
        </span>
        <span className="flex items-center gap-1" data-testid="nach-lives" data-lives={hud.lives} role="img" aria-label={`${hud.lives} ${hud.lives === 1 ? "vida" : "vidas"}`}>
          {Array.from({ length: LIVES }, (_, i) => (
            <SpriteSvg key={i} sprite={i < hud.lives ? vinylSprite() : vinylOffSprite()} height={28} />
          ))}
        </span>
      </div>
      <div ref={areaRef} className="flex min-h-0 flex-1 items-start justify-center" data-testid="nach-field">
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} aria-label="la calle de noche, The Nach y las rocas" role="img" />
          {hud.scratch && !hud.end ? (
            <div className="pointer-events-none absolute inset-x-0 top-[40%] flex justify-center">
              <span className="chip display text-lg" role="status" data-testid="nach-scratch">
                ¡scratch!
              </span>
            </div>
          ) : null}
          {hud.end ? (
            <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
              <span className="note-alert display text-2xl" role="status" data-testid="nach-banner">
                se le rayó el disco
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

/** The Nach de espaldas con una roca adelante (28 × 40) */
export function introSprite() {
  return composeSprite(28, 40, [
    { sprite: rockSprite(2), x: 7, y: 2 },
    { sprite: nachSprite("a"), x: 6, y: 16 },
  ]);
}

function Intro() {
  return (
    <div className="card card-c flex items-center gap-5" data-testid="nach-card">
      <div className="rounded-xl px-3 py-2" style={{ background: "#0B1020" }}>
        <SpriteSvg sprite={introSprite()} height={120} label="The Nach de espaldas en la calle, con una roca adelante" />
      </div>
      <ul className="flex flex-col gap-2 text-sm text-tinta-media">
        <li>deslizá a un costado: cambia de carril</li>
        <li>esquivá las rocas: 3 vidas</li>
        <li>cada vez va más rápido</li>
      </ul>
    </div>
  );
}

function Result({ result, seed, cutByTimer }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const outOfLives = v.ok ? v.endReason === "vidas" : !cutByTimer;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="nach-result" data-reason={outOfLives ? "vidas" : "tiempo"}>
      <SpriteSvg sprite={outOfLives ? nachDownSprite() : nachSprite("a")} height={110} label={outOfLives ? "The Nach sentado en el piso con los auriculares torcidos" : "The Nach de espaldas"} />
      <p className="display-lg text-tinta" style={{ fontSize: 80 }} data-testid="game-score">
        {result.score} <span className="text-3xl text-tinta-suave">m</span>
      </p>
      <p className="text-lg text-tinta-media">{outOfLives ? "se le rayó el disco." : "aguantó los 2 minutos sin tropezar."}</p>
    </div>
  );
}

export const nachYLaRoca: GameModule = {
  id: "nach-y-la-roca",
  name: "Nach y la roca",
  tagline: "que no tropiece el DJ.",
  howTo: ["deslizá a la izquierda o a la derecha para cambiar de carril", "esquivá las rocas: si te topás con una, perdés una vida (tenés 3)", "cada vez va más rápido: gana el que llega más lejos"],
  durationMs: DURATION_MS,
  // sin moverse se pierden las tres vidas en unos 30 s; con tres filas seguidas en el carril del medio, antes
  minDurationMs: 2_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  unit: "m",
  validate,
  Component: NachGame,
  Intro,
  Result,
};
