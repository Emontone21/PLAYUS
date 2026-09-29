// "caminando por 18": el personaje camina por 18 de Julio y de las puertas
// salen los pastosos (el promotor de tarjetas, el de las firmas, el de los
// volantes, el de los planes de celular) a frenarlo, por adelante, por los
// costados y por atrás. Tocarlos los saca de encima; si uno lo alcanza, se
// terminó. Cada tanto viene don pasta, el de traje dorado, que necesita 4
// toques. El puntaje son los metros.
//
// Mismo esquema técnico que Larry y remar: simulación pura a 60 ticks
// (rules.ts) avanzada por el reloj de games/lib, y una traza con los toques
// que contaron que `validate` vuelve a jugar entera. Un solo dedo, como en el
// tarado (games/lib/taps).
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { createPointerTracker } from "../lib/taps";
import { sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { drawScene, scaleFor } from "./draw";
import { check, DURATION_MS, FIELD_H, FIELD_W, generateStreet, initialState, MAX_SCORE, perfectPolicy, step, TICKS_PER_S, validate, type EndReason, type Kind, type SimState, type Spawn, type TapEvent, type TraceEvent } from "./rules";
import { pastosoSprite, walkerSprite } from "./sprites";

/** el final ("te frenaron") se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;

export interface CaminandoDevOptions {
  hitboxes?: boolean;
  slow?: boolean;
  /** arrancar en este tick, con el jugador perfecto hasta ahí */
  startTick?: number;
  /** forzar un don pasta al arrancar */
  forceDonPasta?: boolean;
}

type Hud = { meters: number; end: EndReason | null };

export function CaminandoGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: CaminandoDevOptions }) {
  const street = React.useMemo<Spawn[]>(() => {
    const s = generateStreet(seed);
    if (dev?.forceDonPasta) {
      const t = (dev.startTick ?? 0) + 30;
      const extra: Spawn = { kind: "donpasta", tick: t, side: "izq", x: 5, y: 40, arrive: t + 200, phrase: -1 };
      return [...s, extra].sort((a, b) => a.tick - b.tick);
    }
    return s;
  }, [seed, dev?.forceDonPasta, dev?.startTick]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const tracker = React.useRef(createPointerTracker()).current;
  const pendingTaps = React.useRef<{ x: number; y: number }[]>([]);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ meters: 0, end: null });
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
    const taps: TapEvent[] = [];
    // herramienta de desarrollo: el jugador perfecto juega hasta el tick pedido
    const bot = perfectPolicy();
    while (s.tick < startTick && !s.end) {
      const tap = bot(s, street);
      taps.push(...step(s, street, tap ? [tap] : []));
    }
    pendingTaps.current = [];
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finishTimer: number | undefined;
    const resultNow = (): GameResult => {
      const events: TraceEvent[] = [...taps, { tick: s.end ? s.end.tick : s.tick, fin: true }];
      return { score: Math.floor((s.end ? s.end.tick : s.tick) / 12), events };
    };

    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      while (s.tick < want && !s.end) {
        // los toques que llegaron desde el último tick entran en este
        const now = pendingTaps.current;
        pendingTaps.current = [];
        taps.push(...step(s, street, now));
      }
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, s, street, kRef.current, { alpha, reduced: reducedRef.current, hitboxes: devRef.current?.hitboxes });
      if (rootRef.current) {
        rootRef.current.dataset.tick = String(s.tick);
        rootRef.current.dataset.pastosos = JSON.stringify(s.pastosos.filter((p) => p.phase === "viene").map((p) => [p.kind, Math.round(p.x / 16), Math.round(p.y / 16), p.hits, street[p.i]!.side]));
      }
      if (s.tick !== reportedTick) {
        reportedTick = s.tick;
        const result = resultNow();
        onProgress(result);
        const end = s.end?.reason ?? null;
        setHud((h) => (h.meters === result.score && h.end === end ? h : { meters: result.score, end }));
        if (s.end && finishTimer === undefined) finishTimer = window.setTimeout(() => onFinish(result), END_HOLD_MS);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow());
    onReady();
    return () => {
      cancelAnimationFrame(raf);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [street, startTick, onReady, onProgress, onFinish]);

  // un solo dedo: el toque va a la simulación en el próximo tick, en unidades del campo
  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const counts = tracker.down(e.pointerId);
    if (!counts) return;
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const x = Math.round(((e.clientX - r.left) / r.width) * FIELD_W);
    const y = Math.round(((e.clientY - r.top) / r.height) * FIELD_H);
    if (x < 0 || x > FIELD_W || y < 0 || y > FIELD_H) return;
    pendingTaps.current.push({ x, y });
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
      data-testid="caminando-area"
      data-meters={hud.meters}
      data-end={hud.end ?? ""}
    >
      <div className="flex items-center justify-between px-1">
        <span className="display text-xl text-tinta" data-testid="caminando-meters" aria-live="off">
          {hud.meters} m
        </span>
        <span className="eyebrow">un toque y perdés</span>
      </div>
      <div ref={areaRef} className="relative flex min-h-0 flex-1 items-center justify-center" data-testid="caminando-field">
        <canvas ref={canvasRef} className="pointer-events-none [image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} aria-label="18 de Julio, el personaje y los pastosos" role="img" />
        {hud.end === "frenado" ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span className="note-alert display text-3xl" role="status" data-testid="caminando-banner">
              te frenaron
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

export const KIND_NAMES: Record<Kind, string> = { promotor: "tarjetas", firmas: "firmas", volantes: "volantes", celular: "planes", donpasta: "don pasta" };

function Intro() {
  return (
    <div className="card card-c flex flex-col gap-3" data-testid="caminando-card">
      <div className="flex items-center gap-4">
        <SpriteSvg sprite={walkerSprite(0)} height={90} label="el que camina, con auriculares y mochila" />
        <div className="flex flex-wrap items-end gap-3">
          {(["promotor", "firmas", "volantes", "celular"] as const).map((k) => (
            <div key={k} className="flex flex-col items-center gap-1">
              <SpriteSvg sprite={pastosoSprite(k, "viene", 0)} height={56} label={KIND_NAMES[k]} />
              <span className="text-xs text-tinta-media">{KIND_NAMES[k]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SpriteSvg sprite={pastosoSprite("donpasta", "viene", 0)} height={64} label="don pasta, de traje dorado" />
        <span className="display text-lg text-tinta">don pasta ×4</span>
        <span className="text-xs text-tinta-media">se lo saca con cuatro toques.</span>
      </div>
    </div>
  );
}

function Result({ result, seed, cutByTimer }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const reason: EndReason | null = v.ok ? (v.endReason ?? (cutByTimer ? "tiempo" : null)) : null;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="caminando-result" data-reason={reason ?? ""}>
      <SpriteSvg sprite={walkerSprite(0)} height={110} label="el que camina" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }}>
        <span data-testid="game-score">{result.score}</span>
        <span className="ml-2 text-3xl text-tinta-suave">m</span>
      </p>
      <p className="text-lg text-tinta-media">{reason === "frenado" ? "te frenaron." : reason === "tiempo" ? "llegaste a los 2 minutos sin que te paren." : null}</p>
    </div>
  );
}

export const caminandoPor18: GameModule = {
  id: "caminando-por-18",
  name: "caminando por 18",
  tagline: "no te pares, no firmes nada.",
  howTo: ["tocá a los pastosos antes de que te alcancen", "si uno te toca, perdés", "a don pasta, el dorado, hay que tocarlo 4 veces"],
  durationMs: DURATION_MS,
  // el primero llega como muy pronto a los 1,2 s; con la cuenta regresiva y el segundo de cierre, más de 5
  minDurationMs: 5_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  unit: "m",
  validate,
  Component: CaminandoGame,
  Intro,
  Result,
};
