// "rastitas rastotas": un snake. La cabeza de una persona con rastas se
// mueve por una grilla de 15 × 21; cada cigarro alarga las rastas un
// casillero y suma un punto; la Red Bull acelera 5 s y duplica los puntos; en
// oleadas, algunos casilleros titilan y después se llenan de piojos para
// siempre. Chocar el borde, las propias rastas o los piojos termina la partida.
//
// Mismo esquema técnico que Larry: simulación pura a 60 ticks (rules.ts)
// avanzada por el reloj de games/lib, y una traza con los giros que entraron
// a la cola que `validate` vuelve a jugar entera. Se controla deslizando en
// cualquier parte (24 px, eje dominante, encadenable) o con las flechas.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { drawScene, scaleFor } from "./draw";
import { BOOST_TICKS, check, DURATION_MS, FIELD_H, FIELD_W, greedyPolicy, initialState, MAX_SCORE, rngFor, step, TICKS_PER_S, validate, type Dir, type EndReason, type SimState, type TraceEvent, type TurnEvent } from "./rules";
import { canSprite, cigSprite, headSprite, liceSprite, rastaSprite } from "./sprites";
import { composeSprite } from "../lib/sprites";

/** el final se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;
/** un deslizamiento cuenta desde estos px */
const SWIPE_PX = 24;

export interface RastasDevOptions {
  coords?: boolean;
  slow?: boolean;
  /** arrancar en este tick, con el bot jugando hasta ahí (o hasta donde llegue) */
  startTick?: number;
  /** forzar la Red Bull al arrancar */
  forceRedbull?: boolean;
}

type Hud = { score: number; boostLeft: number; end: EndReason | null; redbull: boolean };

const KEY_DIRS: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

export function RastasGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: RastasDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pending = React.useRef<Dir[]>([]);
  const pointer = React.useRef<{ id: number; x: number; y: number } | null>(null);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ score: 0, boostLeft: 0, end: null, redbull: false });
  const [reachedTick, setReachedTick] = React.useState<number | null>(null);
  const startTick = dev?.startTick ?? 0;
  const forceRedbull = dev?.forceRedbull ?? false;

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
    const rng = rngFor(seed);
    const s: SimState = initialState(rng);
    const turns: TurnEvent[] = [];
    if (forceRedbull) s.nextRedbull = 30;
    // herramienta de desarrollo: el bot juega hasta el tick pedido (o hasta donde llegue)
    const bot = greedyPolicy();
    while (s.tick < startTick && !s.end) {
      const d = bot(s);
      for (const a of step(s, rng, d ? [d] : [])) turns.push({ tick: s.tick - 1, dir: a });
    }
    if (startTick > 0) setReachedTick(s.tick);
    if (s.end) {
      // el bot no llegó: la partida arranca de cero igual
      turns.length = 0;
      const fresh = initialState(rngFor(seed));
      Object.assign(s, fresh);
      if (forceRedbull) s.nextRedbull = 30;
    }
    pending.current = [];
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finishTimer: number | undefined;
    const resultNow = (): GameResult => {
      const events: TraceEvent[] = [...turns, { tick: s.end ? s.end.tick : s.tick, fin: true }];
      return { score: s.score, events };
    };
    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      while (s.tick < want && !s.end) {
        const now = pending.current;
        pending.current = [];
        for (const a of step(s, rng, now)) turns.push({ tick: s.tick - 1, dir: a });
      }
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, s, kRef.current, { alpha, reduced: reducedRef.current, coords: devRef.current?.coords });
      if (rootRef.current) {
        rootRef.current.dataset.tick = String(s.tick);
        rootRef.current.dataset.moves = String(s.cigs + s.tick); // cambia en cada tick: el E2E usa data-lastmove
        rootRef.current.dataset.lastmove = String(s.lastMove);
        rootRef.current.dataset.head = String(s.body[0]);
        rootRef.current.dataset.dir = s.dir;
      }
      if (s.tick !== reportedTick) {
        reportedTick = s.tick;
        const result = resultNow();
        onProgress(result);
        const end = s.end?.reason ?? null;
        const boostLeft = s.end ? 0 : Math.max(0, s.boostUntil - s.tick);
        setHud((h) => (h.score === s.score && h.end === end && h.boostLeft === boostLeft && h.redbull === !!s.redbull ? h : { score: s.score, end, boostLeft, redbull: !!s.redbull }));
        if (s.end && finishTimer === undefined) finishTimer = window.setTimeout(() => onFinish(result), END_HOLD_MS);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow());
    onReady();
    // las flechas del teclado entran a la misma cola
    const onKey = (e: KeyboardEvent) => {
      const d = KEY_DIRS[e.key];
      if (!d) return;
      e.preventDefault();
      pending.current.push(d);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [seed, startTick, forceRedbull, onReady, onProgress, onFinish]);

  // deslizar: manda el primer puntero; cada 24 px en el eje dominante es un giro, y se encadena sin soltar
  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointer.current !== null) return;
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointer.current;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return;
    const dir: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    pending.current.push(dir);
    p.x = e.clientX;
    p.y = e.clientY;
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointer.current || e.pointerId !== pointer.current.id) return;
    pointer.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const banner = hud.end === "borde" ? "¡pum!" : hud.end === "rastas" ? "te enredaste" : hud.end === "piojos" ? "¡piojos!" : null;

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
      data-testid="rastas-area"
      data-score={hud.score}
      data-end={hud.end ?? ""}
      data-boost={hud.boostLeft > 0 ? "1" : ""}
    >
      <div className="flex items-center justify-between px-1">
        <span className="display text-xl text-tinta" data-testid="rastas-score" aria-live="off">
          {hud.score} {hud.score === 1 ? "punto" : "puntos"}
        </span>
        {hud.boostLeft > 0 ? (
          <span className="flex items-center gap-2" data-testid="rastas-boost">
            <span className="h-2 w-16 overflow-hidden rounded-full" style={{ background: "var(--superficie-2)" }} aria-hidden="true">
              <span className="block h-full rounded-full" style={{ width: `${(100 * hud.boostLeft) / BOOST_TICKS}%`, background: "var(--agua)" }} />
            </span>
            <span className="display text-lg text-agua">×2</span>
          </span>
        ) : reachedTick !== null ? (
          <span className="eyebrow">el bot llegó a los {Math.round(reachedTick / TICKS_PER_S)} s</span>
        ) : null}
      </div>
      <div ref={areaRef} className="relative flex min-h-0 flex-1 items-center justify-center" data-testid="rastas-field">
        <canvas ref={canvasRef} className="pointer-events-none [image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} aria-label="la grilla, la cabeza con rastas y lo que hay en el colchón" role="img" />
        {banner ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span className="note-alert display text-3xl" role="status" data-testid="rastas-banner">
              {banner}
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

/** la cabeza con tres rastas, para las pantallas previa y de resultado */
export function headWithRastas(): ReturnType<typeof composeSprite> {
  return composeSprite(8, 32, [
    { sprite: rastaSprite(true, 0, true), x: 0, y: 24 },
    { sprite: rastaSprite(true, 2), x: 0, y: 16 },
    { sprite: rastaSprite(true, 0), x: 0, y: 8 },
    { sprite: headSprite("up"), x: 0, y: 0 },
  ]);
}

function Intro() {
  return (
    <div className="card card-c flex items-center gap-5" data-testid="rastas-card">
      <SpriteSvg sprite={headWithRastas()} height={128} label="la cabeza con rastas" />
      <ul className="flex flex-col gap-3 text-sm text-tinta-media">
        <li className="flex items-center gap-2">
          <SpriteSvg sprite={cigSprite()} height={28} label="cigarro" /> +1 y una rasta más
        </li>
        <li className="flex items-center gap-2">
          <SpriteSvg sprite={canSprite()} height={28} label="Red Bull" /> más rápido y ×2
        </li>
        <li className="flex items-center gap-2">
          <SpriteSvg sprite={liceSprite(0)} height={28} label="piojos" /> no pises
        </li>
      </ul>
    </div>
  );
}

const REASON_TEXT: Record<EndReason, string> = {
  borde: "chocaste el borde.",
  rastas: "te enredaste con tus rastas.",
  piojos: "pisaste los piojos.",
  tiempo: "aguantaste los 3 minutos.",
};

function Result({ result, seed, cutByTimer }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const reason: EndReason | null = v.ok ? (v.endReason ?? (cutByTimer ? "tiempo" : null)) : null;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="rastas-result" data-reason={reason ?? ""}>
      <SpriteSvg sprite={headWithRastas()} height={120} label="la cabeza con rastas" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }} data-testid="game-score">
        {result.score}
      </p>
      <p className="text-lg text-tinta-media">
        {result.score === 1 ? "punto" : "puntos"}. {reason ? REASON_TEXT[reason] : null}
      </p>
    </div>
  );
}

export const rastitasRastotas: GameModule = {
  id: "rastitas-rastotas",
  name: "rastitas rastotas",
  tagline: "cada pucho, una rasta más.",
  howTo: ["deslizá el dedo para cambiar de dirección", "comé cigarros para alargar las rastas; la Red Bull te acelera y duplica los puntos", "no choques los bordes, tus rastas ni los casilleros con piojos"],
  durationMs: DURATION_MS,
  // se puede chocar el borde de arriba en 17 pasos (2,5 s) más la cuenta regresiva y el segundo de cierre
  minDurationMs: 5_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  Component: RastasGame,
  Intro,
  Result,
};
