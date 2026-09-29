// "la parrilla del bro": un "luz roja, luz verde" en un parrillero. Cada
// toque en la pantalla es un toque del bro a la parrilla y suma uno; cuando
// el canario (un chef de espaldas) se da vuelta hay que parar: si te ve
// tocando, se termina y conservás lo que tenías. Antes de girar avisa con un
// gesto, y con el tiempo avisa menos, gira más rápido y empieza a amagar.
//
// El cronograma del canario sale entero de la semilla (timeline.ts) y el
// cliente lo recorre con el tiempo transcurrido desde onReady, medido con
// performance.now(). La traza son los toques que contaron ({ t }) y
// `validate` la vuelve a recorrer sobre el mismo cronograma.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createPointerTracker } from "../lib/taps";
import { sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { composeSprite } from "../lib/sprites";
import { textSprite } from "../lib/font";
import { drawScene, scaleFor } from "./draw";
import { check, DURATION_MS, MAX_SCORE, validate, type TapEvent } from "./rules";
import { CANARIO_H, CANARIO_W, canarioSprite, FIELD_H, FIELD_W, type CanarioLook } from "./sprites";
import { canarioTimeline, isSafe, segmentAt, type CanarioState } from "./timeline";

/** el final ("¡te vi, bro!") se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;

export interface ParrillaDevOptions {
  /** cámara lenta, ×0,25 */
  slow?: boolean;
  /** arrancar en este instante del cronograma (ms) */
  startMs?: number;
}

type Hud = { taps: number; seen: boolean };

export function ParrillaGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: ParrillaDevOptions }) {
  const timeline = React.useMemo(() => canarioTimeline(seed), [seed]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const tracker = React.useRef(createPointerTracker()).current;
  const events = React.useRef<TapEvent[]>([]);
  const readyAt = React.useRef<number | null>(null);
  const lastTap = React.useRef<number>(-Infinity);
  const done = React.useRef(false);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ taps: 0, seen: false });
  const startMs = dev?.startMs ?? 0;

  /** ms del cronograma transcurridos desde onReady (con cámara lenta y salto en desarrollo) */
  const elapsed = React.useCallback(() => {
    if (readyAt.current === null) return 0;
    const rate = devRef.current?.slow ? 0.25 : 1;
    return (performance.now() - readyAt.current) * rate + startMs;
  }, [startMs]);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => (reducedRef.current = mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // tamaño: escalado entero ajustado a devicePixelRatio, a lo ancho
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

  // listo al montar; el dibujo sigue el cronograma con el tiempo transcurrido
  React.useEffect(() => {
    readyAt.current = performance.now();
    onProgress({ score: 0, events: [] });
    onReady();
    let raf = 0;
    const frame = () => {
      const now = elapsed();
      const seg = segmentAt(timeline, Math.min(now, DURATION_MS - 1));
      const look: CanarioState | "visto" = done.current ? "visto" : (seg?.state ?? "espaldas");
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        drawScene(ctx, { look, now, sinceTap: now - lastTap.current, sinceState: seg ? now - seg.start : 0, reduced: reducedRef.current }, kRef.current);
      }
      if (rootRef.current) {
        rootRef.current.dataset.state = look;
        rootRef.current.dataset.t = String(Math.floor(now));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [timeline, elapsed, onReady, onProgress]);

  function down(e: React.PointerEvent<HTMLDivElement>) {
    // el teclado no cuenta; en escritorio vale el clic izquierdo; un solo dedo
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const counts = tracker.down(e.pointerId);
    if (!counts || done.current || readyAt.current === null) return;
    const t = Math.round(elapsed());
    if (t >= DURATION_MS) return;
    const state = segmentAt(timeline, t)!.state;
    events.current.push({ t });
    lastTap.current = t;
    if (isSafe(state)) {
      const n = hud.taps + 1;
      setHud({ taps: n, seen: false });
      onProgress({ score: n, events: [...events.current] });
    } else {
      done.current = true;
      const result: GameResult = { score: hud.taps, events: [...events.current] };
      setHud((h) => ({ taps: h.taps, seen: true }));
      onProgress(result);
      window.setTimeout(() => onFinish(result), END_HOLD_MS);
    }
  }
  const release = (e: React.PointerEvent<HTMLDivElement>) => tracker.up(e.pointerId);

  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full select-none flex-col gap-2"
      style={{ touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      onPointerDown={down}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="parrilla-area"
      data-taps={hud.taps}
      data-seen={hud.seen ? "1" : ""}
    >
      <div className="flex items-center justify-between px-1">
        <span className="display text-xl text-tinta" data-testid="parrilla-taps" aria-live="off">
          {hud.taps} {hud.taps === 1 ? "toque" : "toques"}
        </span>
      </div>
      <div ref={areaRef} className="relative flex min-h-0 flex-1 items-start justify-center" data-testid="parrilla-field">
        <canvas
          ref={canvasRef}
          className="pointer-events-none [image-rendering:pixelated]"
          style={{ border: "3px solid var(--contorno)", borderRadius: 8 }}
          aria-label="el parrillero, el bro y el canario"
          role="img"
        />
        {hud.seen ? (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
            <span className="note-alert display text-3xl" role="status" data-testid="parrilla-banner">
              ¡te vi, bro!
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

/** el canario con el "¿eh?" del aviso, para la pantalla previa */
function introSprite(look: CanarioLook) {
  if (look !== "aviso") return canarioSprite(look);
  return composeSprite(CANARIO_W + 8, CANARIO_H, [
    { sprite: canarioSprite("aviso"), x: 8, y: 0 },
    { sprite: textSprite("¿eh?", "#1B1B1B"), x: 0, y: 0 },
  ]);
}

function Intro() {
  return (
    <div className="card card-c flex items-start justify-around gap-3" data-testid="parrilla-card">
      {(
        [
          ["espaldas", "de espaldas: tocá"],
          ["aviso", "se mueve: frená"],
          ["mirando", "te mira: quieto"],
        ] as const
      ).map(([look, text]) => (
        <div key={look} className="flex flex-col items-center gap-1 text-center">
          <SpriteSvg sprite={introSprite(look)} height={90} label={text} />
          <p className="text-xs text-tinta-media">{text}</p>
        </div>
      ))}
    </div>
  );
}

function Result({ result, seed, cutByTimer }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const seen = v.ok ? v.endReason === "visto" : !cutByTimer;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="parrilla-result" data-reason={seen ? "visto" : "tiempo"}>
      <SpriteSvg sprite={canarioSprite(seen ? "visto" : "espaldas")} height={150} label={seen ? "el canario, señalándote" : "el canario, de espaldas"} />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }} data-testid="game-score">
        {result.score}
      </p>
      <p className="text-lg text-tinta-media">
        {result.score === 1 ? "toque" : "toques"}. {seen ? "te vio, bro." : "aguantaste los 90 segundos."}
      </p>
    </div>
  );
}

export const laParrillaDelBro: GameModule = {
  id: "la-parrilla-del-bro",
  name: "la parrilla del bro",
  tagline: "que no te vea el canario.",
  howTo: ["tocá la pantalla para tocar la parrilla mientras el canario está de espaldas", "cuando se mueve, frená: si te ve tocando, se termina", "ojo, que a veces amaga"],
  durationMs: DURATION_MS,
  // el primer giro llega a los ~3,2 s; con la cuenta regresiva y el segundo de cierre, una partida honesta dura más de 5 s
  minDurationMs: 5_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  Component: ParrillaGame,
  Intro,
  Result,
};
