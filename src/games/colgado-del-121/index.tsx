// "colgado del 121": un pasajero parado en el pasillo de un ómnibus que se
// inclina sin avisar. Mantener apretada una mitad de la pantalla lo empuja
// para ese lado; hay que mantenerlo en el medio sobre una base que se achica.
// El puntaje es el tiempo que aguantó parado.
//
// Mismo esquema técnico que los otros juegos de acción: simulación pura a 60
// ticks (rules.ts) avanzada por el reloj de games/lib, y una traza con los
// cambios del empuje que `validate` vuelve a jugar entera. El control es el
// del sunny: la mitad apretada manda, un solo dedo, flechas en escritorio.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { drawScene, FALL_TICKS, scaleFor } from "./draw";
import { check, delayedPolicy, DURATION_MS, FIELD_H, FIELD_W, formatMs, generateCourse, initialState, msAt, nearEdge, step, TICKS_PER_S, validate, type Course, type EndReason, type Push, type PushEvent, type SimState, type TraceEvent } from "./rules";
import { passengerSprite } from "./sprites";

/** la caída se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;

export interface ColgadoDevOptions {
  debug?: boolean;
  slow?: boolean;
  /** arrancar en este tick, con el jugador automático hasta ahí */
  startTick?: number;
  /** el jugador automático maneja, con esta demora en ms */
  auto?: boolean;
  autoDelayMs?: number;
}

type Hud = { ms: number; end: EndReason | null; near: boolean };

export function ColgadoGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: ColgadoDevOptions }) {
  const course = React.useMemo<Course>(() => generateCourse(seed), [seed]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pushRef = React.useRef<Push>(0);
  const pointerRef = React.useRef<number | null>(null);
  const keysRef = React.useRef<Push[]>([]);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ ms: 0, end: null, near: false });
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
    const inputs: PushEvent[] = [];
    let current: Push = 0;
    const apply = (push: Push) => {
      if (push !== current) {
        inputs.push({ tick: s.tick, push });
        current = push;
      }
      step(s, course, push);
    };
    let bot = delayedPolicy(Math.round(((devRef.current?.autoDelayMs ?? 250) * TICKS_PER_S) / 1000));
    // herramienta de desarrollo: el jugador automático juega hasta el tick pedido
    while (s.tick < startTick && !s.end) apply(bot(s, course));
    pushRef.current = 0;
    keysRef.current = [];
    pointerRef.current = null;
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finishTimer: number | undefined;
    let fallT = 0;
    let lastDelay = devRef.current?.autoDelayMs ?? 250;
    const resultNow = (): GameResult => {
      const events: TraceEvent[] = [...inputs, { tick: s.end ? s.end.tick : s.tick, fin: true }];
      return { score: msAt(s.end ? s.end.tick : s.tick), events };
    };

    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      const delay = devRef.current?.autoDelayMs ?? 250;
      if (delay !== lastDelay) {
        lastDelay = delay;
        bot = delayedPolicy(Math.round((delay * TICKS_PER_S) / 1000));
      }
      while (s.tick < want) {
        if (s.end) {
          if (fallT >= FALL_TICKS) break;
          fallT++;
          continue;
        }
        apply(devRef.current?.auto ? bot(s, course) : pushRef.current);
      }
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, s, course, kRef.current, fallT, { alpha, reduced: reducedRef.current, debug: devRef.current?.debug });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.tick = String(s.tick);
        d.x = String(s.x);
        d.v = String(s.v);
        d.push = String(s.push);
        d.ms = String(msAt(s.end ? s.end.tick : s.tick));
      }
      if (s.tick !== reportedTick) {
        reportedTick = s.tick;
        const result = resultNow();
        onProgress(result);
        const end = s.end?.reason ?? null;
        const near = nearEdge(s);
        setHud((h) => (h.ms === result.score && h.end === end && h.near === near ? h : { ms: result.score, end, near }));
        if (s.end && finishTimer === undefined) finishTimer = window.setTimeout(() => onFinish(result), END_HOLD_MS);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow());
    onReady();

    // las flechas del teclado: la última apretada manda
    const keyOf = (e: KeyboardEvent): Push | null => (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : null);
    const syncKeys = () => {
      if (pointerRef.current === null) pushRef.current = keysRef.current[keysRef.current.length - 1] ?? 0;
    };
    const onDown = (e: KeyboardEvent) => {
      const d = keyOf(e);
      if (d === null) return;
      e.preventDefault();
      if (!keysRef.current.includes(d)) keysRef.current.push(d);
      syncKeys();
    };
    const onUp = (e: KeyboardEvent) => {
      const d = keyOf(e);
      if (d === null) return;
      keysRef.current = keysRef.current.filter((x) => x !== d);
      syncKeys();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [course, startTick, onReady, onProgress, onFinish]);

  // un solo dedo: la mitad donde está apretado manda; si se arrastra a la otra mitad, cambia
  const sideOf = (e: React.PointerEvent<HTMLDivElement>): Push => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return e.clientX - r.left < r.width / 2 ? -1 : 1;
  };
  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointerRef.current !== null) return;
    pointerRef.current = e.pointerId;
    rootRef.current?.setPointerCapture(e.pointerId);
    pushRef.current = sideOf(e);
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== e.pointerId) return;
    pushRef.current = sideOf(e);
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    pushRef.current = keysRef.current[keysRef.current.length - 1] ?? 0;
  }

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full select-none flex-col gap-2"
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="colgado-area"
      data-end={hud.end ?? ""}
      data-near={hud.near ? "1" : ""}
    >
      <div className="flex items-baseline justify-between px-1">
        <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="colgado-time" aria-live="off">
          {formatMs(hud.ms)}
        </span>
        <span className="eyebrow">agarrate que dobla</span>
      </div>
      <div ref={areaRef} className="relative flex min-h-0 flex-1 items-center justify-center" data-testid="colgado-field">
        <canvas ref={canvasRef} className="pointer-events-none [image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} aria-label="el pasillo del ómnibus, el pasajero y la base" role="img" />
        <span className="pointer-events-none absolute bottom-3 left-4 text-3xl text-tinta-suave opacity-50" aria-hidden="true">
          ‹
        </span>
        <span className="pointer-events-none absolute bottom-3 right-4 text-3xl text-tinta-suave opacity-50" aria-hidden="true">
          ›
        </span>
        {hud.end === "caida" ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span className="note-alert display text-3xl" role="status" data-testid="colgado-banner">
              ¡al piso!
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

function Intro() {
  return (
    <div className="card card-c flex items-center gap-5" data-testid="colgado-card">
      <div className="flex flex-col items-center gap-1">
        <SpriteSvg sprite={passengerSprite("parado")} height={104} label="el pasajero, parado en el pasillo" />
        <div className="h-1.5 w-20 rounded-full" style={{ background: "var(--agua)" }} aria-hidden="true" />
      </div>
      <ul className="flex flex-col gap-2 text-sm text-tinta-media">
        <li>el bondi se inclina sin avisar</li>
        <li>‹ y › lo empujan mientras apretás</li>
        <li>la franja celeste es la base: se achica</li>
      </ul>
    </div>
  );
}

function Result({ result, seed, cutByTimer }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const reason: EndReason | null = v.ok ? (v.endReason ?? (cutByTimer ? "tiempo" : null)) : null;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="colgado-result" data-reason={reason ?? ""}>
      <SpriteSvg sprite={passengerSprite(reason === "caida" ? "piso-der" : "parado")} height={reason === "caida" ? 56 : 96} label="el pasajero" />
      <p className="display-lg text-tinta" style={{ fontSize: 80, fontVariantNumeric: "tabular-nums" }} data-testid="game-score">
        {formatMs(result.score)}
      </p>
      <p className="text-lg text-tinta-media">{reason === "caida" ? "te fuiste al piso." : reason === "tiempo" ? "aguantaste los 2 minutos parado." : null}</p>
    </div>
  );
}

export const colgadoDel121: GameModule = {
  id: "colgado-del-121",
  name: "colgado del 121",
  tagline: "agarrate que dobla.",
  howTo: ["mantené apretado a la izquierda o a la derecha para mover al pasajero para ese lado", "el bondi se inclina: mantenelo en el medio", "la base se achica: si se sale, se cae"],
  durationMs: DURATION_MS,
  // sin jugar se cae a los 2,5 s; con la cuenta regresiva y el segundo de la caída, más de 4
  minDurationMs: 2_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: DURATION_MS,
  unit: "s",
  formatScore: formatMs,
  validate,
  Component: ColgadoGame,
  Intro,
  Result,
};

