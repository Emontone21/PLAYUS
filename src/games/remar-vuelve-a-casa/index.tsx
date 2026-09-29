// "remar vuelve a casa": un marinero rema por un río de mayonesa. Los
// cubiertos que flotan terminan la partida; cada botella de whisky lo acelera
// para siempre (más metros, pero menos tiempo para esquivar). El puntaje son
// los metros recorridos y gana el que llega más lejos.
//
// Mismo esquema técnico que Larry: simulación pura a 60 ticks (rules.ts),
// avanzada por el tiempo transcurrido con el reloj de games/lib, control
// arrastrando con un solo dedo y una traza de cambios de objetivo que
// `validate` vuelve a jugar entera.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { cheeksFor, drawScene, scaleFor } from "./draw";
import {
  BOAT_START,
  check,
  D_PER_M,
  DURATION_MS,
  FIELD_H,
  FIELD_W,
  generateCourse,
  initialState,
  MAX_SCORE,
  MULT_MAX,
  MULT_START,
  safePath,
  step,
  TICKS_PER_S,
  validate,
  waypoints,
  type EndReason,
  type SimState,
  type TraceEvent,
  type Waypoint,
} from "./rules";
import { boatWithOars, itemSprite } from "./sprites";
import { createTickClock } from "../lib/tick-clock";
import { singlePointerDrag } from "../lib/pointer-drag";
import { sizeCanvas } from "../lib/canvas-scale";
import { TraceRecorder } from "../lib/trace";
import { SpriteSvg } from "../lib/sprite-svg";

/** el choque se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;

export interface RemarDevOptions {
  /** cajas de choque y camino seguro */
  hitboxes?: boolean;
  /** cámara lenta, ×0,25 */
  slow?: boolean;
  /** arrancar en estos metros, con el bot del camino seguro hasta ahí */
  startMeters?: number;
  /** forzar ×2 de velocidad desde el principio */
  x2?: boolean;
}

type Hud = { meters: number; bottles: number; end: EndReason | null };

export function RemarGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: RemarDevOptions }) {
  const course = React.useMemo(() => generateCourse(seed), [seed]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pending = React.useRef(BOAT_START);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ meters: 0, bottles: 0, end: null });
  const startMeters = dev?.startMeters ?? 0;
  const x2 = dev?.x2 ?? false;

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => (reducedRef.current = mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // tamaño: escalado entero ajustado a devicePixelRatio, aprovechando el alto
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
    const s: SimState = initialState(x2 ? MULT_MAX : MULT_START);
    const trace = new TraceRecorder(s.target);
    // herramienta de desarrollo: el bot del camino seguro rema hasta los metros pedidos, tomando todas las botellas
    const bot = safePath(() => true);
    while (s.dist < startMeters * D_PER_M && !s.end) {
      step(s, course, trace.set(s.tick, bot(s, course)));
    }
    pending.current = s.target;
    const path: Waypoint[] | undefined = devRef.current?.hitboxes ? waypoints(course) : undefined;
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finishTimer: number | undefined;
    const resultNow = (): GameResult => {
      const events: TraceEvent[] = trace.events(s.end ? s.end.tick : s.tick);
      return { score: Math.floor(s.dist / D_PER_M), events };
    };

    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      // si la pestaña estuvo en segundo plano, se pone al día de una
      while (s.tick < want && !s.end) {
        step(s, course, trace.set(s.tick, pending.current));
      }
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        drawScene(ctx, s, course, kRef.current, {
          alpha,
          reduced: reducedRef.current,
          hitboxes: devRef.current?.hitboxes,
          safePath: devRef.current?.hitboxes ? (path ?? waypoints(course)) : undefined,
        });
      }
      // el tick en curso, para los E2E (sin re-render: se escribe directo)
      if (rootRef.current) {
        rootRef.current.dataset.tick = String(s.tick);
        rootRef.current.dataset.dist = String(s.dist);
      }
      if (s.tick !== reportedTick) {
        reportedTick = s.tick;
        const result = resultNow();
        onProgress(result);
        const end = s.end?.reason ?? null;
        setHud((h) => (h.meters === result.score && h.bottles === s.bottles && h.end === end ? h : { meters: result.score, bottles: s.bottles, end }));
        if (s.end && finishTimer === undefined) {
          // el final se ve un segundo; a los 120 s el contenedor corta antes, con el mismo resultado
          finishTimer = window.setTimeout(() => onFinish(result), END_HOLD_MS);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    // el ciclo del juego se registra antes que el cronómetro del contenedor:
    // en cada cuadro, la simulación avanza antes de que el contenedor mire
    raf = requestAnimationFrame(frame);
    onProgress(resultNow());
    onReady();
    return () => {
      cancelAnimationFrame(raf);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [course, startMeters, x2, onReady, onProgress, onFinish]);

  // un solo dedo: manda el primer puntero apoyado; en escritorio, el mouse con el botón apretado
  const drag = React.useRef(
    singlePointerDrag<number>(
      (clientX) => {
        const r = canvasRef.current?.getBoundingClientRect();
        if (!r || r.width === 0) return pending.current;
        return Math.max(0, Math.min(FIELD_W, Math.round(((clientX - r.left) / r.width) * FIELD_W)));
      },
      (x) => (pending.current = x),
    ),
  ).current;

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full select-none flex-col gap-2"
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      {...drag}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="remar-area"
      data-meters={hud.meters}
      data-bottles={hud.bottles}
      data-end={hud.end ?? ""}
    >
      <div className="flex items-center justify-between px-1">
        <span className="display text-xl text-tinta" data-testid="remar-meters" aria-live="off">
          {hud.meters} m
        </span>
        <span className="flex items-center gap-1 display text-lg text-tinta" data-testid="remar-bottles" aria-label={`${hud.bottles} ${hud.bottles === 1 ? "botella" : "botellas"}`} role="img">
          <SpriteSvg sprite={itemSprite("botella")} height={22} />
          <span aria-hidden="true">×{hud.bottles}</span>
        </span>
      </div>
      <div ref={areaRef} className="relative flex min-h-0 flex-1 items-center justify-center" data-testid="remar-field">
        <canvas
          ref={canvasRef}
          className="pointer-events-none [image-rendering:pixelated]"
          style={{ border: "3px solid var(--contorno)", borderRadius: 8 }}
          aria-label="el río, el bote y lo que flota"
          role="img"
        />
        {hud.end === "choque" ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span className="note-alert display text-3xl" role="status" data-testid="remar-banner">
              ¡clanc!
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
    <div className="card card-c flex items-center gap-4" data-testid="remar-card">
      <SpriteSvg sprite={boatWithOars(0, 0)} height={120} label="el marinero en su bote, con gorra y remera a rayas" />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-lengua">esquivá</p>
          <div className="flex flex-col items-start gap-1">
            <SpriteSvg sprite={itemSprite("tenedor")} height={14} label="tenedor" />
            <SpriteSvg sprite={itemSprite("cuchillo")} height={14} label="cuchillo" />
            <SpriteSvg sprite={itemSprite("cuchara")} height={14} label="cuchara" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-rana">agarrá si te animás</p>
          <SpriteSvg sprite={itemSprite("botella")} height={40} label="botella de whisky" />
        </div>
      </div>
    </div>
  );
}

const REASON_TEXT: Record<EndReason, string> = {
  choque: "chocaste un cubierto.",
  tiempo: "aguantaste los 2 minutos.",
};

function Result({ result, seed, cutByTimer }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const bottles = v.ok ? v.bottles : 0;
  const reason: EndReason | null = v.ok ? (v.endReason ?? (cutByTimer ? "tiempo" : null)) : null;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="remar-result" data-reason={reason ?? ""} data-bottles={bottles}>
      <SpriteSvg sprite={boatWithOars(cheeksFor(bottles), 0)} height={130} label="el marinero" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }}>
        <span data-testid="game-score">{result.score}</span>
        <span className="ml-2 text-3xl text-tinta-suave">m</span>
      </p>
      <p className="text-lg text-tinta-media">
        {bottles === 0 ? "sin tomar nada" : bottles === 1 ? "con una botella" : `con ${bottles} botellas`}. {reason ? REASON_TEXT[reason] : null}
      </p>
    </div>
  );
}

export const remarVuelveACasa: GameModule = {
  id: "remar-vuelve-a-casa",
  name: "remar vuelve a casa",
  tagline: "mayonesa hasta donde da la vista.",
  howTo: ["arrastrá el dedo para mover el bote", "esquivá los cubiertos: si chocás uno, se termina", "el whisky te acelera: más metros, pero más difícil"],
  durationMs: DURATION_MS,
  // puede terminar a los pocos segundos (la primera fila llega a los ~3,3 s,
  // más la cuenta regresiva); la coherencia fina con la duración la mira validate
  minDurationMs: 5_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  unit: "m",
  validate,
  Component: RemarGame,
  Intro,
  Result,
};
