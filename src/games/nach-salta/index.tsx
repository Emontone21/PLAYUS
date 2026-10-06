// "Nach salta": The Nach corre solo hacia la derecha, visto de costado, por
// una calle de noche, cada vez más rápido. Hay que saltar las rocas (tocar
// es un salto corto; mantener, uno alto y largo) y, desde los 400 m,
// agacharse ante lo que está en el aire. Si choca, se termina. El puntaje son
// los metros.
//
// Mismo esquema técnico que los otros juegos de acción: simulación entera a
// 60 ticks (rules.ts) avanzada por el reloj de games/lib, y una traza con
// cada cambio de control que `validate` vuelve a jugar. The Nach, las rocas y
// la calle vienen de games/lib/nach (decisión 250).
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { integerScale, sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { composeSprite } from "../lib/sprites";
import { nachSideSprite, rockSprite } from "../lib/nach";
import { drawScene } from "./draw";
import {
  applyInput,
  BANNER_TICKS,
  botTrace,
  check,
  CRASH_HOLD_TICKS,
  DURATION_MS,
  END_TICK,
  generateCourse,
  initialState,
  MAX_METERS,
  score,
  simulate,
  splitActive,
  step,
  TICKS_PER_S,
  validate,
  type Input,
  type InputEvent,
  type SimState,
  type TraceEvent,
} from "./rules";
import { FIELD_H, FIELD_W } from "./sprites";

export interface NachSaltaDevOptions {
  hitboxes?: boolean;
  slow?: boolean;
  /** arrancar en este tick (el jugador automático jugó hasta ahí) */
  startTick?: number;
  /** el jugador automático juega solo, con esta demora (ticks); undefined: no */
  autoReaction?: number;
}

/** los carteles, fáciles de cambiar (copiados tal cual) */
export const SIGNS = {
  start: "Nach no caigas en la roca",
  duck: "¡ahora agachate!",
  crash: "no denuevo nach",
} as const;
/** el cartel de "agachate" se ve 2 s */
export const DUCK_SIGN_TICKS = 120;

type Hud = { meters: number; split: boolean; start: boolean; duckSign: boolean; crash: boolean; end: boolean };

/** el estado de los carteles en un tick: puro, para el juego y los tests */
export function signsAt(s: SimState): { start: boolean; duck: boolean; crash: boolean } {
  return {
    start: s.tick < BANNER_TICKS && !s.crashed,
    duck: s.splitAt >= 0 && s.tick - s.splitAt < DUCK_SIGN_TICKS && !s.crashed,
    crash: s.crashed,
  };
}

/** qué hace un toque en la x relativa `fx` (0 a 1) del área: antes de los 400 m todo salta */
export function zoneFor(s: SimState, fx: number): "jump" | "duck" {
  return splitActive(s) && fx < 0.5 ? "duck" : "jump";
}

export function NachSaltaGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: NachSaltaDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  /** los controles pedidos desde el último cuadro, en orden */
  const pendingRef = React.useRef<{ kind: "jump" | "duck"; down: boolean; source: string }[]>([]);
  const stateRef = React.useRef<SimState | null>(null);
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ meters: 0, split: false, start: true, duckSign: false, crash: false, end: false });
  const startTick = dev?.startTick ?? 0;
  const autoReaction = dev?.autoReaction;

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
    const course = generateCourse(seed);
    let s: SimState = initialState();
    const events: InputEvent[] = [];
    if (startTick > 0) {
      // la herramienta: el jugador automático justo juega hasta el tick de arranque
      const b = botTrace(seed, { reaction: 15, untilTick: startTick });
      const before = b.events.filter((e): e is InputEvent => !("fin" in e) && e.tick < startTick);
      s = simulate(seed, before, startTick, course);
      events.push(...before);
    }
    stateRef.current = s;
    const auto = autoReaction !== undefined ? botTrace(seed, { reaction: autoReaction }).events.filter((e): e is InputEvent => !("fin" in e) && e.tick >= s.tick) : [];
    let autoK = 0;
    // quién tiene apretado cada control (el dedo, el teclado): el evento sale al primero y al último
    const holders = { jump: new Set<string>(), duck: new Set<string>() };
    pendingRef.current = [];
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reported = -1;
    let finished = false;
    const record = (input: Input) => {
      if (s.crashed) return;
      events.push({ tick: s.tick, input });
      applyInput(s, input);
    };
    const resultNow = (endTick: number): GameResult => ({ score: score(s), events: [...events, { tick: endTick, fin: true }] as TraceEvent[] });
    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      for (const p of pendingRef.current) {
        const set = holders[p.kind];
        const was = set.size > 0;
        if (p.down) set.add(p.source);
        else set.delete(p.source);
        const is = set.size > 0;
        if (is !== was) record(`${p.kind}-${is ? "down" : "up"}` as Input);
      }
      pendingRef.current = [];
      const endAt = s.crashed ? Math.min(END_TICK, s.crashAt + CRASH_HOLD_TICKS) : END_TICK;
      while (s.tick < want && s.tick < endAt) {
        while (autoK < auto.length && auto[autoK]!.tick <= s.tick) record(auto[autoK++]!.input);
        step(s, course);
      }
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, kRef.current, s, course, { alpha, reduced: reducedRef.current, hitboxes: devRef.current?.hitboxes });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.tick = String(s.tick);
        d.dist = String(s.dist);
        d.y = String(s.y);
        d.ground = s.ground ? "1" : "";
        d.duck = s.duckHeld ? "1" : "";
        d.crashed = s.crashed ? "1" : "";
        d.split = splitActive(s) ? "1" : "";
      }
      if (s.tick !== reported) {
        reported = s.tick;
        const end = s.tick >= endAt;
        const sg = signsAt(s);
        const next: Hud = { meters: score(s), split: splitActive(s), start: sg.start, duckSign: sg.duck, crash: sg.crash, end };
        setHud((h) => (h.meters === next.meters && h.split === next.split && h.start === next.start && h.duckSign === next.duckSign && h.crash === next.crash && h.end === next.end ? h : next));
        onProgress(resultNow(Math.max(1, s.tick)));
        if (end && !finished) {
          finished = true;
          onFinish(resultNow(endAt));
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow(Math.max(1, s.tick)));
    onReady();
    return () => cancelAnimationFrame(raf);
  }, [seed, startTick, autoReaction, onReady, onProgress, onFinish]);

  // el teclado: flecha arriba o espacio saltan, flecha abajo agacha; mantener funciona igual
  React.useEffect(() => {
    const kindOf = (e: KeyboardEvent): "jump" | "duck" | null => (e.code === "ArrowUp" || e.code === "Space" ? "jump" : e.code === "ArrowDown" ? "duck" : null);
    const down = (e: KeyboardEvent) => {
      const kind = kindOf(e);
      if (!kind) return;
      e.preventDefault();
      if (!e.repeat) pendingRef.current.push({ kind, down: true, source: `kb:${e.code}` });
    };
    const up = (e: KeyboardEvent) => {
      const kind = kindOf(e);
      if (!kind) return;
      e.preventDefault();
      pendingRef.current.push({ kind, down: false, source: `kb:${e.code}` });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // un solo dedo: manda el primer puntero; si se arrastra a la otra mitad, cambia de acción
  const pointerRef = React.useRef<{ id: number; kind: "jump" | "duck" } | null>(null);
  function zoneAt(clientX: number): "jump" | "duck" {
    const s = stateRef.current;
    const el = areaRef.current;
    if (!s || !el) return "jump";
    const r = el.getBoundingClientRect();
    return zoneFor(s, (clientX - r.left) / r.width);
  }
  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointerRef.current) return;
    const kind = zoneAt(e.clientX);
    pointerRef.current = { id: e.pointerId, kind };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pendingRef.current.push({ kind, down: true, source: "dedo" });
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    if (!p || p.id !== e.pointerId) return;
    const kind = zoneAt(e.clientX);
    if (kind === p.kind) return;
    pendingRef.current.push({ kind: p.kind, down: false, source: "dedo" }, { kind, down: true, source: "dedo" });
    p.kind = kind;
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointerRef.current;
    if (!p || p.id !== e.pointerId) return;
    pointerRef.current = null;
    pendingRef.current.push({ kind: p.kind, down: false, source: "dedo" });
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const outline = { textShadow: "0 3px 0 var(--contorno), 3px 0 0 var(--contorno), -3px 0 0 var(--contorno), 0 -3px 0 var(--contorno), 3px 3px 0 var(--contorno), -3px 3px 0 var(--contorno), 3px -3px 0 var(--contorno), -3px -3px 0 var(--contorno)" };
  return (
    <div ref={rootRef} className="flex h-full w-full select-none flex-col gap-1" data-testid="nachsalta-area" data-end={hud.end ? "1" : ""}>
      <div className="flex items-baseline gap-1 px-1">
        <span className="display text-5xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="nachsalta-meters" aria-live="off">
          {hud.meters}
        </span>
        <span className="display text-2xl text-tinta-media">m</span>
      </div>
      <div
        ref={areaRef}
        className="relative flex min-h-0 flex-1 items-center justify-center"
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="nachsalta-field"
      >
        <div className="pointer-events-none relative">
          <canvas ref={canvasRef} className="block [image-rendering:pixelated]" style={{ borderRadius: 8 }} role="img" aria-label="The Nach corriendo de costado por una calle de noche con neones" data-testid="nachsalta-canvas" />
        </div>
        {hud.start ? (
          <p className="nach-bounce display pointer-events-none absolute text-center text-3xl text-luciernaga" style={{ left: "50%", top: "4%", width: "92%", ...outline }} data-testid="nachsalta-start">
            {SIGNS.start}
          </p>
        ) : null}
        {hud.duckSign ? (
          <p className="nach-bounce display pointer-events-none absolute text-center text-3xl text-agua" style={{ left: "50%", top: "4%", width: "92%", ...outline }} data-testid="nachsalta-duck-sign">
            {SIGNS.duck}
          </p>
        ) : null}
        {hud.crash ? (
          <p className="nach-bounce display pointer-events-none absolute text-center text-4xl text-lengua" style={{ left: "50%", top: "8%", width: "92%", ...outline }} data-testid="nachsalta-crash">
            {SIGNS.crash}
          </p>
        ) : null}
        {/* las marcas de las dos mitades, desde los 400 m */}
        {hud.split ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-between px-6 text-3xl text-tinta-suave/60" data-testid="nachsalta-split" aria-hidden>
            <span>↓</span>
            <span>↑</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

/** The Nach corriendo en el lugar, con una roca adelante */
function IntroRunner() {
  const [f, setF] = React.useState(0);
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setF((x) => (x + 1) % 4), 130);
    return () => window.clearInterval(id);
  }, []);
  const pose = (["run0", "run1", "run2", "run3"] as const)[f]!;
  const ground = { w: 56, h: 1, px: Array.from({ length: 56 }, (_, x) => ({ x, y: 0, c: "#3C4050" })) };
  const sprite = composeSprite(56, 26, [
    { sprite: nachSideSprite(pose), x: 4, y: 1 },
    { sprite: rockSprite(1), x: 38, y: 17 },
    { sprite: ground, x: 0, y: 25 },
  ]);
  return <SpriteSvg sprite={sprite} height={96} label="The Nach corriendo de costado, con una roca adelante" />;
}

function Intro() {
  return (
    <div className="card card-c flex flex-col items-center gap-2" data-testid="nachsalta-card">
      <IntroRunner />
      <p className="text-center text-xs text-tinta-suave">tocar: salto corto · mantener: salto alto y largo</p>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const crashed = v.ok ? v.crashed : false;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="nachsalta-result" data-reason={v.ok ? "ok" : v.reason}>
      <SpriteSvg sprite={nachSideSprite(crashed ? "fall" : "run0")} height={90} label="The Nach" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }} data-testid="game-score">
        {result.score} m
      </p>
      <p className="text-lg text-tinta-media">{crashed ? SIGNS.crash : "llegaste al final."}</p>
    </div>
  );
}

export const nachSalta: GameModule = {
  id: "nach-salta",
  name: "Nach salta",
  tagline: "saltá, DJ.",
  howTo: ["tocá la derecha para saltar: mantené apretado para saltar más alto", "más adelante, mantené apretada la izquierda para agacharte", "si chocás, se termina: gana el que llega más lejos"],
  durationMs: DURATION_MS,
  // chocar lo antes posible: la primera roca llega después de los 2,5 s, y la caída se ve 1 s
  minDurationMs: 3_000,
  scoring: "high",
  unit: "m",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_METERS,
  validate,
  recomputeScore: (result, seed) => {
    const v = check(seed, result.events);
    return v.ok ? v.score : null;
  },
  Component: NachSaltaGame,
  Intro,
  Result,
};
