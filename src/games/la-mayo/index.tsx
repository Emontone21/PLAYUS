// "la mayo": Remar quiere su mayonesa en el punto justo. Una barrita (el
// pomo) va y viene por el tubo; tocar la frena: adentro de la zona del medio
// suma uno, afuera Remar se enoja ("no seas sopa") y se pierde una vida. Con
// el tiempo la barrita va más rápido y la zona se achica. 60 segundos o tres
// vidas; gana el que más emboca.
//
// Mismo esquema técnico que los otros juegos de acción: simulación entera a
// 60 ticks (rules.ts) avanzada por el reloj de games/lib, y una traza con los
// toques que contaron que `validate` vuelve a jugar entera.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import { hash32 } from "@/lib/rng";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { createPointerTracker } from "../lib/taps";
import { sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { drawScene, scaleFor } from "./draw";
import { applyTap, check, DURATION_MS, END_TICK, endTickOf, initialState, isFrozen, LIVES, MAX_SCORE, posUnits, step, TICKS_PER_S, validate, type EndReason, type SimState, type TapEvent, type TraceEvent } from "./rules";
import { FIELD_H, FIELD_W, pomoOffSprite, pomoSprite, remarAtTable } from "./sprites";

/** Remar enojado se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;

export interface MayoDevOptions {
  debug?: boolean;
  slow?: boolean;
  /** arrancar en este tick (la barrita viene moviéndose desde el 0) */
  startTick?: number;
}

type Hud = { score: number; lives: number; end: EndReason | null; say: string | null };

/** lo que dice Remar al embocar: "¡eso!" o "punto justo", al azar con la semilla y el tick */
export function hitLine(seed: string, tick: number): string {
  return hash32(`${seed}:${tick}`) & 1 ? "¡eso!" : "punto justo";
}
export const MISS_LINE = "no seas sopa";

export function MayoGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: MayoDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const tracker = React.useRef(createPointerTracker()).current;
  const pendingRef = React.useRef(0);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ score: 0, lives: LIVES, end: null, say: null });
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
    const s: SimState = initialState(seed);
    const taps: TapEvent[] = [];
    // herramienta de desarrollo: la barrita viene moviéndose desde el 0 hasta el tick pedido
    while (s.tick < startTick) step(s);
    pendingRef.current = 0;
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finishTimer: number | undefined;
    let prevPos = s.pos;
    const resultNow = (): GameResult => {
      const events: TraceEvent[] = [...taps, { tick: endTickOf(s), fin: true }];
      return { score: s.score, events };
    };

    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      // los toques pedidos desde el último cuadro, en el tick actual (solo cuenta uno; los demás caen congelados)
      let tapped = false;
      if (pendingRef.current > 0) {
        pendingRef.current = 0;
        if (!s.end && s.tick < END_TICK && applyTap(s) !== "ignored") {
          taps.push({ tick: s.tick });
          tapped = true;
        }
      }
      while (s.tick < want && !s.end && s.tick < END_TICK) {
        prevPos = s.pos;
        step(s);
      }
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, s, prevPos, kRef.current, { alpha, reduced: reducedRef.current, debug: devRef.current?.debug });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.tick = String(s.tick);
        d.pos = String(posUnits(s));
        d.dir = String(s.dir);
        d.speed = String(s.speed);
        d.frozen = isFrozen(s) ? "1" : "";
        d.score = String(s.score);
        d.lives = String(s.lives);
      }
      // un toque cambia el puntaje (o termina la partida) sin que avance el tick: también se informa
      if (s.tick !== reportedTick || tapped) {
        reportedTick = s.tick;
        const result = resultNow();
        onProgress(result);
        const end = s.end?.reason ?? null;
        const say = s.lastTap && (isFrozen(s) || s.end) ? (s.lastTap.hit ? hitLine(seed, s.lastTap.tick) : MISS_LINE) : null;
        setHud((h) => (h.score === s.score && h.lives === s.lives && h.end === end && h.say === say ? h : { score: s.score, lives: s.lives, end, say }));
        if (s.end && finishTimer === undefined) finishTimer = window.setTimeout(() => onFinish(result), END_HOLD_MS);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow());
    onReady();

    // la barra espaciadora frena (sin repetir si se mantiene apretada)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat) return;
      e.preventDefault();
      pendingRef.current++;
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [seed, startTick, onReady, onProgress, onFinish]);

  // un solo dedo: cuenta el toque solo si no hay otro puntero apretado; en escritorio vale el clic izquierdo
  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!tracker.down(e.pointerId)) return;
    pendingRef.current++;
  }
  const release = (e: React.PointerEvent<HTMLDivElement>) => tracker.up(e.pointerId);

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full select-none flex-col gap-2"
      style={{ touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      onPointerDown={down}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="mayo-area"
      data-end={hud.end ?? ""}
    >
      <div className="flex items-center justify-between px-1">
        <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="mayo-score" aria-live="off">
          {hud.score} {hud.score === 1 ? "embocada" : "embocadas"}
        </span>
        <span className="flex items-center gap-1" data-testid="mayo-lives" data-lives={hud.lives} role="img" aria-label={`${hud.lives} ${hud.lives === 1 ? "vida" : "vidas"}`}>
          {Array.from({ length: LIVES }, (_, i) => (
            <SpriteSvg key={i} sprite={i < hud.lives ? pomoSprite() : pomoOffSprite()} height={30} />
          ))}
        </span>
      </div>
      <div ref={areaRef} className="flex min-h-0 flex-1 items-start justify-center" data-testid="mayo-field">
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} aria-label="Remar a la mesa, el plato y el tubo de mayonesa" role="img" />
          {/* el globo va sobre la mesa, entre el plato y el tubo: no tapa a Remar ni el chorro */}
          {hud.say ? (
            <div className="pointer-events-none absolute inset-x-0 top-[46%] flex justify-center">
              <span className={`display text-2xl ${hud.say === MISS_LINE ? "note-alert" : "speech"}`} role="status" data-testid="mayo-say">
                {hud.say}
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
    <div className="card card-c flex flex-col gap-3" data-testid="mayo-card">
      <div className="flex items-center justify-around">
        <SpriteSvg sprite={remarAtTable("espera")} height={96} label="Remar a la mesa, esperando la mayonesa" />
        <div className="flex flex-col items-center gap-1">
          <svg viewBox="0 0 100 14" width={150} height={21} shapeRendering="crispEdges" aria-hidden="true">
            <defs>
              <linearGradient id="mayo-tubo" x1="0" x2="1">
                <stop offset="0" stopColor="#FBF8EC" />
                <stop offset="1" stopColor="#E6B93A" />
              </linearGradient>
            </defs>
            <rect x="0" y="2" width="100" height="10" fill="url(#mayo-tubo)" stroke="#141414" strokeWidth="1" />
            <rect x="44" y="2" width="12" height="10" fill="#FFD34E" />
            <rect x="47" y="0" width="6" height="4" fill="#F4F4F4" stroke="#141414" strokeWidth="1" />
          </svg>
          <span className="text-[11px] text-luciernaga">punto justo</span>
        </div>
      </div>
      <ul className="flex flex-col gap-1 text-sm text-tinta-media">
        <li>tocá para frenar el pomo en el medio</li>
        <li>si le errás, Remar se enoja: tenés 3 vidas</li>
        <li>cada vez va más rápido y la zona se achica</li>
      </ul>
    </div>
  );
}

function Result({ result, seed, cutByTimer }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const outOfLives = v.ok ? v.endReason === "vidas" : !cutByTimer;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="mayo-result" data-reason={outOfLives ? "vidas" : "tiempo"}>
      <SpriteSvg sprite={remarAtTable(outOfLives ? "enojado" : "contento", outOfLives ? "mucha" : "justo")} height={120} label={outOfLives ? "Remar enojado" : "Remar contento con el plato lleno"} />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }} data-testid="game-score">
        {result.score}
      </p>
      <p className="text-lg text-tinta-media">
        {result.score === 1 ? "embocada" : "embocadas"}. {outOfLives ? "no seas sopa." : "aguantaste los 60 segundos."}
      </p>
    </div>
  );
}

export const laMayo: GameModule = {
  id: "la-mayo",
  name: "la mayo",
  tagline: "ni poca ni mucha: el punto justo.",
  howTo: ["tocá para frenar la barrita en el punto justo del medio", "si le errás, Remar se enoja y perdés una vida: tenés 3", "cada vez va más rápido: gana el que más emboca en 60 segundos"],
  durationMs: DURATION_MS,
  // tres toques seguidos errados terminan la partida en poco más de un segundo; con la cuenta regresiva y el segundo final, más de 3
  minDurationMs: 2_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  Component: MayoGame,
  Intro,
  Result,
};
