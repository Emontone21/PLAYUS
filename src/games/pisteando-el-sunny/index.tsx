// "pisteando el sunny": un Nissan Sunny acelera solo por una ruta llena de
// curvas que flota en el vacío. Se dobla manteniendo apretada una mitad de la
// pantalla (o las flechas); a velocidad derrapa. Si se sale de la ruta, se
// cae. El puntaje son los metros por el eje de la ruta.
//
// Mismo esquema técnico que los otros juegos de acción: simulación pura a 60
// ticks (rules.ts) avanzada por el reloj de games/lib, y una traza con los
// cambios del control que `validate` vuelve a jugar entera.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { createVisuals, drawScene, scaleFor, updateVisuals } from "./draw";
import { autoPolicy, check, DURATION_MS, FIELD_H, FIELD_W, generateCourse, initialState, kmh, MAX_SCORE, slipOf, step, TICKS_PER_S, validate, type EndReason, type SimState, type Steer, type SteerEvent, type TraceEvent } from "./rules";
import { carSprite, introSprite } from "./sprites";

/** la caída se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;

export interface SunnyDevOptions {
  overlay?: boolean;
  slow?: boolean;
  /** arrancar en estos metros, con el conductor automático hasta ahí */
  startMeters?: number;
  /** el conductor automático maneja */
  auto?: boolean;
}

type Hud = { meters: number; kmh: number; end: EndReason | null };

export function SunnyGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: SunnyDevOptions }) {
  const course = React.useMemo(() => generateCourse(seed), [seed]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  /** el control vigente: lo que el dedo o el teclado piden ahora */
  const steerRef = React.useRef<Steer>(0);
  const pointerRef = React.useRef<number | null>(null);
  const keysRef = React.useRef<Steer[]>([]);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ meters: 0, kmh: 60, end: null });
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
    const inputs: SteerEvent[] = [];
    let current: Steer = 0;
    const apply = (steer: Steer) => {
      if (steer !== current) {
        inputs.push({ tick: s.tick, steer });
        current = steer;
      }
      step(s, course, steer);
    };
    const bot = autoPolicy();
    // herramienta de desarrollo: el conductor automático maneja hasta los metros pedidos
    while (s.meters < startMeters && !s.end) apply(bot(s, course));
    const vis = createVisuals();
    steerRef.current = 0;
    keysRef.current = [];
    pointerRef.current = null;
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finishTimer: number | undefined;
    const resultNow = (): GameResult => {
      const events: TraceEvent[] = [...inputs, { tick: s.end ? s.end.tick : s.tick, fin: true }];
      return { score: s.meters, events };
    };

    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      while (s.tick < want) {
        if (s.end) {
          // la caída sigue animándose un rato
          if (vis.lastTick >= s.end.tick + 60) break;
          vis.lastTick++;
          updateVisuals(vis, { ...s, tick: vis.lastTick }, reducedRef.current);
          continue;
        }
        apply(devRef.current?.auto ? bot(s, course) : steerRef.current);
        updateVisuals(vis, s, reducedRef.current);
      }
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, s, course, kRef.current, vis, { alpha, reduced: reducedRef.current, overlay: devRef.current?.overlay });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.tick = String(s.tick);
        d.meters = String(s.meters);
        d.steer = String(s.steer);
        d.slip = String(slipOf(s));
        d.kmh = String(kmh(s.v));
      }
      if (s.tick !== reportedTick) {
        reportedTick = s.tick;
        const result = resultNow();
        onProgress(result);
        const end = s.end?.reason ?? null;
        const speed = kmh(s.v);
        setHud((h) => (h.meters === s.meters && h.end === end && h.kmh === speed ? h : { meters: s.meters, kmh: speed, end }));
        if (s.end && finishTimer === undefined) finishTimer = window.setTimeout(() => onFinish(result), END_HOLD_MS);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow());
    onReady();

    // las flechas del teclado: la última apretada manda
    const keyOf = (e: KeyboardEvent): Steer | null => (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : null);
    const syncKeys = () => {
      if (pointerRef.current === null) steerRef.current = keysRef.current[keysRef.current.length - 1] ?? 0;
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
  }, [course, startMeters, onReady, onProgress, onFinish]);

  // un solo dedo: la mitad donde está apretado manda; si se arrastra a la otra mitad, cambia
  const sideOf = (e: React.PointerEvent<HTMLDivElement>): Steer => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return e.clientX - r.left < r.width / 2 ? -1 : 1;
  };
  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointerRef.current !== null) return;
    pointerRef.current = e.pointerId;
    rootRef.current?.setPointerCapture(e.pointerId);
    steerRef.current = sideOf(e);
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== e.pointerId) return;
    steerRef.current = sideOf(e);
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    steerRef.current = keysRef.current[keysRef.current.length - 1] ?? 0;
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
      data-testid="sunny-area"
      data-end={hud.end ?? ""}
    >
      <div className="flex items-center justify-between px-1">
        <span className="display text-xl text-tinta" data-testid="sunny-meters" aria-live="off">
          {hud.meters} m
        </span>
        <span className="display text-base text-tinta-media" data-testid="sunny-kmh">
          {hud.kmh} km/h
        </span>
      </div>
      <div ref={areaRef} className="relative flex min-h-0 flex-1 items-center justify-center" data-testid="sunny-field">
        <canvas ref={canvasRef} className="pointer-events-none [image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} aria-label="la ruta en el vacío y el sunny" role="img" />
        {/* dónde tocar: una marca sutil abajo de cada mitad */}
        <span className="pointer-events-none absolute bottom-3 left-4 text-3xl text-tinta-suave opacity-50" aria-hidden="true">
          ‹
        </span>
        <span className="pointer-events-none absolute bottom-3 right-4 text-3xl text-tinta-suave opacity-50" aria-hidden="true">
          ›
        </span>
        {hud.end === "caida" ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span className="note-alert display text-3xl" role="status" data-testid="sunny-banner">
              ¡se fue el sunny!
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
    <div className="card card-c flex items-center gap-5" data-testid="sunny-card">
      <SpriteSvg sprite={introSprite()} height={140} label="el sunny derrapando sobre la ruta, con el vacío alrededor" />
      <ul className="flex flex-col gap-3 text-sm text-tinta-media">
        <li className="flex items-center gap-2">
          <SpriteSvg sprite={carSprite(0)} height={40} label="el sunny" /> acelera solo
        </li>
        <li>‹ y › doblan mientras apretás</li>
        <li>los metros por la ruta son el puntaje</li>
      </ul>
    </div>
  );
}

function Result({ result, seed, cutByTimer }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const reason: EndReason | null = v.ok ? (v.endReason ?? (cutByTimer ? "tiempo" : null)) : null;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="sunny-result" data-reason={reason ?? ""}>
      <SpriteSvg sprite={carSprite(reason === "caida" ? 5 : 0)} height={90} label="el sunny" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }}>
        <span data-testid="game-score">{result.score}</span>
        <span className="ml-2 text-3xl text-tinta-suave">m</span>
      </p>
      <p className="text-lg text-tinta-media">{reason === "caida" ? "se fue el sunny." : reason === "tiempo" ? "llegaste a los 2 minutos sin caerte." : null}</p>
    </div>
  );
}

export const pisteandoElSunny: GameModule = {
  id: "pisteando-el-sunny",
  name: "pisteando el sunny",
  tagline: "la cola afuera, las ruedas adentro.",
  howTo: ["mantené apretado a la izquierda o a la derecha para doblar", "a velocidad el sunny derrapa: doblá antes de la curva", "si te salís de la ruta, te caés"],
  durationMs: DURATION_MS,
  // caerse lleva al menos un par de segundos, más la cuenta regresiva y el segundo de la caída
  minDurationMs: 3_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  unit: "m",
  validate,
  Component: SunnyGame,
  Intro,
  Result,
};
