// "los deseos de Larry": Larry camina por la vereda y agarra lo que cae.
// Hamburguesas y vapos suman (cada uno que llega al piso le saca una vida, y
// tiene 3); una verdura o la bandera del Frente Amplio terminan la partida.
// Todo cae cada vez más rápido y más seguido. Gana el que agarra más.
//
// La partida es una simulación pura a 60 ticks por segundo (rules.ts): el
// requestAnimationFrame la avanza según el tiempo transcurrido y dibuja el
// estado interpolado. La traza son los cambios de objetivo del dedo, por tick.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { drawScene, scaleFor } from "./draw";
import {
  check,
  DURATION_MS,
  FIELD_H,
  FIELD_W,
  generateRain,
  greedyTarget,
  initialState,
  LARRY_START,
  MAX_SCORE,
  START_LIVES,
  step,
  TICKS_PER_S,
  validate,
  type EndReason,
  type InputEvent,
  type SimState,
  type TraceEvent,
} from "./rules";
import { dropSprite, greyed, larrySprite, type Face, type Sprite } from "./sprites";

/** el final (cara y cartel) se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;

export interface LarryDevOptions {
  /** cajas de colisión */
  hitboxes?: boolean;
  /** cámara lenta, ×0,25 */
  slow?: boolean;
  /** arrancar en este tick, con el jugador perfecto hasta ahí */
  startTick?: number;
}

type Hud = { score: number; lives: number; end: EndReason | null };

export function LarryGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: LarryDevOptions }) {
  const rain = React.useMemo(() => generateRain(seed), [seed]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pending = React.useRef(LARRY_START);
  const pointer = React.useRef<number | null>(null);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ score: 0, lives: START_LIVES, end: null });
  const startTick = dev?.startTick ?? 0;

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
    const dpr = window.devicePixelRatio || 1;
    canvas.width = FIELD_W * k;
    canvas.height = FIELD_H * k;
    canvas.style.width = `${(FIELD_W * k) / dpr}px`;
    canvas.style.height = `${(FIELD_H * k) / dpr}px`;
    kRef.current = k;
  }, [k]);

  // la partida: simulación a paso fijo, avanzada por el tiempo transcurrido
  React.useEffect(() => {
    const s: SimState = initialState();
    const inputs: InputEvent[] = [];
    // herramienta de desarrollo: el jugador perfecto juega hasta el tick pedido
    while (s.tick < startTick && !s.end) {
      const x = greedyTarget(s, rain);
      if (x !== s.target) inputs.push({ tick: s.tick, x });
      step(s, rain, x);
    }
    pending.current = s.target;
    const base = s.tick;
    let simMs = 0;
    let last = performance.now();
    let raf = 0;
    let reportedTick = -1;
    let finishTimer: number | undefined;
    const resultNow = (): GameResult => {
      const events: TraceEvent[] = [...inputs, { tick: s.end ? s.end.tick : s.tick, fin: true }];
      return { score: s.score, events };
    };

    const frame = () => {
      const now = performance.now();
      simMs += Math.max(0, now - last) * (devRef.current?.slow ? 0.25 : 1);
      last = now;
      const exact = (simMs * TICKS_PER_S) / 1000;
      const want = base + Math.floor(exact);
      // si la pestaña estuvo en segundo plano, se pone al día de una (5.400 ticks son nada)
      while (s.tick < want && !s.end) {
        const x = pending.current;
        if (x !== s.target) inputs.push({ tick: s.tick, x });
        step(s, rain, x);
      }
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, s, rain, kRef.current, { alpha: s.end ? 1 : exact - Math.floor(exact), reduced: reducedRef.current, hitboxes: devRef.current?.hitboxes });
      // el tick en curso, para los E2E (sin re-render: se escribe directo)
      if (rootRef.current) rootRef.current.dataset.tick = String(s.tick);
      if (s.tick !== reportedTick) {
        reportedTick = s.tick;
        const result = resultNow();
        onProgress(result);
        setHud((h) => (h.score === s.score && h.lives === s.lives && h.end === (s.end?.reason ?? null) ? h : { score: s.score, lives: s.lives, end: s.end?.reason ?? null }));
        if (s.end && finishTimer === undefined) {
          // el final se ve un segundo; a los 90 s el contenedor corta antes, con el mismo resultado
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
  }, [rain, startTick, onReady, onProgress, onFinish]);

  // un solo dedo: manda el primer puntero apoyado; en escritorio, el mouse con el botón apretado
  const toUnits = (clientX: number) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return pending.current;
    return Math.max(0, Math.min(FIELD_W, Math.round(((clientX - r.left) / r.width) * FIELD_W)));
  };
  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointer.current !== null) return;
    pointer.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pending.current = toUnits(e.clientX);
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerId !== pointer.current) return;
    pending.current = toUnits(e.clientX);
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  const banner = hud.end === "verdura" ? "¡puaj!" : hud.end === "bandera" ? "¡eso no!" : hud.end === "sin-vidas" ? "sin vidas" : null;

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
      data-testid="larry-area"
      data-score={hud.score}
      data-lives={hud.lives}
      data-end={hud.end ?? ""}
    >
      <div className="flex items-center justify-between px-1">
        <span className="display text-xl text-tinta" data-testid="larry-score" aria-live="off">
          {hud.score} {hud.score === 1 ? "deseo" : "deseos"}
        </span>
        <span className="flex items-center gap-1" data-testid="larry-lives" aria-label={`${hud.lives} ${hud.lives === 1 ? "vida" : "vidas"}`} role="img">
          {Array.from({ length: START_LIVES }, (_, i) => (
            <SpriteSvg key={i} sprite={i < hud.lives ? dropSprite("hamburguesa") : GREY_BURGER} height={22} />
          ))}
        </span>
      </div>
      <div ref={areaRef} className="relative flex min-h-0 flex-1 items-center justify-center" data-testid="larry-field">
        <canvas
          ref={canvasRef}
          className="pointer-events-none [image-rendering:pixelated]"
          style={{ border: "3px solid var(--contorno)", borderRadius: 8 }}
          aria-label="la calle, Larry y lo que cae"
          role="img"
        />
        {banner ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span className={hud.end === "sin-vidas" ? "speech display text-2xl" : "note-alert display text-3xl"} role="status" data-testid="larry-banner">
              {banner}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const GREY_BURGER = greyed(dropSprite("hamburguesa"));

// ---------------------------------------------------------------------------
// SVG nítidos para la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

export function SpriteSvg({ sprite, height, label }: { sprite: Sprite; height: number; label?: string }) {
  return (
    <svg
      viewBox={`0 0 ${sprite.w} ${sprite.h}`}
      width={(height * sprite.w) / sprite.h}
      height={height}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {sprite.px.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={1} height={1} fill={p.c} />
      ))}
    </svg>
  );
}

function Intro() {
  return (
    <div className="card card-c flex items-center gap-4" data-testid="larry-card">
      <SpriteSvg sprite={larrySprite("normal")} height={150} label="Larry, con gorra de visera plana, cadena de oro y el vapo en el bolsillo" />
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-rana">sí</p>
          <div className="flex items-end gap-3">
            <SpriteSvg sprite={dropSprite("hamburguesa")} height={32} label="hamburguesa" />
            <SpriteSvg sprite={dropSprite("vapo")} height={40} label="vapo" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-lengua">no</p>
          <div className="flex flex-wrap items-end gap-3">
            <SpriteSvg sprite={dropSprite("lechuga")} height={32} label="lechuga" />
            <SpriteSvg sprite={dropSprite("zanahoria")} height={40} label="zanahoria" />
            <SpriteSvg sprite={dropSprite("brocoli")} height={36} label="brócoli" />
            <SpriteSvg sprite={dropSprite("bandera")} height={40} label="la bandera del Frente Amplio" />
          </div>
        </div>
      </div>
    </div>
  );
}

const REASON_TEXT: Record<EndReason, string> = {
  verdura: "agarraste verdura.",
  bandera: "agarraste la bandera.",
  "sin-vidas": "se te cayeron tres.",
  tiempo: "aguantaste los 90 segundos.",
};
const REASON_FACE: Record<EndReason, Face> = { verdura: "asco", bandera: "asco", "sin-vidas": "bajon", tiempo: "feliz" };

function Result({ result, seed, cutByTimer }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const reason: EndReason | null = v.ok ? (v.endReason ?? (cutByTimer ? "tiempo" : null)) : null;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="larry-result" data-reason={reason ?? ""}>
      <SpriteSvg sprite={larrySprite(reason ? REASON_FACE[reason] : "normal")} height={170} label="Larry" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }} data-testid="game-score">
        {result.score}
      </p>
      <p className="text-lg text-tinta-media">
        {result.score === 1 ? "deseo agarrado" : "deseos agarrados"}. {reason ? REASON_TEXT[reason] : null}
      </p>
    </div>
  );
}

export const losDeseosDeLarry: GameModule = {
  id: "los-deseos-de-larry",
  name: "los deseos de Larry",
  tagline: "hamburguesas y vapos sí. verdura no.",
  howTo: [
    "arrastrá el dedo para mover a Larry",
    "agarrá hamburguesas y vapos: cada uno que se cae te saca una vida, y tenés 3",
    "si agarrás verdura o la bandera del Frente Amplio, se termina",
  ],
  durationMs: DURATION_MS,
  // puede terminar a los pocos segundos (el primer objeto malo cruza a los ~2,5 s,
  // más la cuenta regresiva); la coherencia fina con la duración la mira validate
  minDurationMs: 5_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  Component: LarryGame,
  Intro,
  Result,
};
