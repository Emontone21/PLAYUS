// "la bolsita del jota": el jota esconde una bolsita de tussi bajo uno de 3
// vasos, los mezcla y, si adivinás dónde quedó, te la regala; si le errás, se
// termina. El puntaje son las rondas acertadas.
//
// Sin ticks: una máquina de estados en ms desde onReady (rules.ts), la misma
// que vuelve a jugar `validate` con las mezclas rearmadas desde la semilla.
// El jota y la tussi vienen de games/lib/jota (decisión 255).
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { integerScale, sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { composeSprite } from "../lib/sprites";
import { createPointerTracker } from "../lib/taps";
import { jotaSprite, tussiSprite } from "../lib/jota";
import { drawScene } from "./draw";
import {
  advance,
  botTrace,
  check,
  DURATION_MS,
  jotaSays,
  jotaShuffles,
  LINES,
  MAX_SCORE,
  newRun,
  OVER_HOLD_MS,
  pick,
  pickOpen,
  validate,
  type Phase,
  type PickEvent,
  type Pos,
  type Run,
} from "./rules";
import { cupSprite, FIELD_H, FIELD_W } from "./sprites";

export interface BolsitaDevOptions {
  /** la bolsita a través de los vasos */
  xray?: boolean;
  slow?: boolean;
  /** arrancar en esta ronda (desde 1): el jugador automático acierta las anteriores */
  startRound?: number;
}

type Hud = { score: number; round: number; phase: Phase; text: string | null };

export function BolsitaGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: BolsitaDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const trackerRef = React.useRef(createPointerTracker());
  const gameRef = React.useRef<{ run: Run; events: PickEvent[]; clock: () => number; finishTimer?: number } | null>(null);
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ score: 0, round: 1, phase: "show", text: null });
  const startRound = dev?.startRound ?? 1;

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
    const run = newRun(jotaShuffles(seed));
    const events: PickEvent[] = [];
    let base = 0;
    if (startRound > 1) {
      // la herramienta: el jugador automático acierta las rondas anteriores, en el pasado
      const b = botTrace(seed, { react: [300, 300], stopAtRound: startRound });
      for (const e of b.events) pick(run, e.t, e.cup);
      advance(run, b.run.phaseAt);
      events.push(...b.events);
      base = b.run.phaseAt;
    }
    // el reloj del juego: ms enteros desde onReady (con cámara lenta en la herramienta), nunca para atrás
    let virt = base;
    let last = performance.now();
    const clock = () => {
      const now = performance.now();
      virt += (now - last) * (devRef.current?.slow ? 0.25 : 1);
      last = now;
      return Math.max(run.t, Math.floor(virt));
    };
    const g: NonNullable<typeof gameRef.current> = { run, events, clock };
    gameRef.current = g;
    let raf = 0;
    let lastKey = "";
    const frame = () => {
      const t = Math.min(DURATION_MS, clock());
      if (run.phase !== "over") advance(run, t);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, kRef.current, run, { t, reduced: reducedRef.current, xray: devRef.current?.xray });
      const says = jotaSays(run, t);
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.t = String(t);
        d.phase = run.phase;
        d.round = String(run.index + 1);
        d.score = String(run.score);
      }
      const key = `${run.score}|${run.index}|${run.phase}|${says.text}`;
      if (key !== lastKey) {
        lastKey = key;
        setHud({ score: run.score, round: run.index + 1, phase: run.phase, text: says.text });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress({ score: run.score, events: [...events] });
    onReady();
    return () => {
      cancelAnimationFrame(raf);
      if (g.finishTimer !== undefined) window.clearTimeout(g.finishTimer);
    };
  }, [seed, startRound, onReady, onProgress]);

  // tocar un vaso: solo cuando los vasos quedaron quietos (los toques en mostrar, mezclar y revelar se ignoran)
  function choose(cup: Pos) {
    const g = gameRef.current;
    if (!g) return;
    const t = g.clock();
    if (t >= DURATION_MS || !pickOpen(g.run, t)) return;
    advance(g.run, t);
    const round = g.run.index + 1;
    const out = pick(g.run, t, cup);
    if (out !== "bien" && out !== "mal") return;
    g.events.push({ round, t, cup });
    const result: GameResult = { score: g.run.score, events: [...g.events] };
    onProgress(result);
    if (out === "mal" && g.finishTimer === undefined) g.finishTimer = window.setTimeout(() => onFinish(result), OVER_HOLD_MS);
  }
  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!trackerRef.current.down(e.pointerId)) return;
    // la columna entera de cada vaso, de arriba a abajo del área
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    choose((fx < 1 / 3 ? 0 : fx < 2 / 3 ? 1 : 2) as Pos);
  }
  function release(e: React.PointerEvent) {
    trackerRef.current.up(e.pointerId);
  }
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0) choose(i as Pos);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div ref={rootRef} className="flex h-full w-full select-none flex-col gap-1" data-testid="bolsita-area">
      <div className="flex items-baseline justify-between px-1">
        <div className="flex items-baseline gap-2">
          <span key={hud.score} className={`display inline-block text-5xl text-tinta ${hud.score > 0 ? "bolsita-pop" : ""}`} style={{ fontVariantNumeric: "tabular-nums" }} data-testid="bolsita-score" aria-live="off">
            {hud.score}
          </span>
          <span className="display text-2xl text-tinta-media">{hud.score === 1 ? "bolsita" : "bolsitas"}</span>
        </div>
        <span className="text-sm text-tinta-suave" data-testid="bolsita-round">
          ronda {hud.round}
        </span>
      </div>
      <div
        ref={areaRef}
        className="relative flex min-h-0 flex-1 items-start justify-center"
        style={{ touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        onPointerDown={down}
        onPointerUp={release}
        onPointerCancel={release}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="bolsita-field"
        data-open={hud.phase === "pick" ? "1" : ""}
      >
        <div className="pointer-events-none relative">
          <canvas ref={canvasRef} className="block [image-rendering:pixelated]" style={{ borderRadius: 8 }} role="img" aria-label="el jota detrás de una mesita con tres vasos rojos dados vuelta" data-testid="bolsita-canvas" />
          {hud.text ? (
            <div className="absolute flex justify-center" style={{ left: "4%", right: "4%", top: "3%" }} key={hud.text}>
              <span className={`display text-sm ${hud.phase === "over" ? "note-alert" : "speech"}`} style={{ padding: "4px 10px" }} role="status" data-testid="bolsita-say">
                {hud.text}
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
  const cup = cupSprite();
  const cups = composeSprite(cup.w * 3 + 8, cup.h, [
    { sprite: cup, x: 0, y: 0 },
    { sprite: cup, x: cup.w + 4, y: 0 },
    { sprite: cup, x: 2 * cup.w + 8, y: 0 },
  ]);
  const jota = composeSprite(30, 18, [
    { sprite: jotaSprite("contento"), x: 0, y: 0 },
    { sprite: tussiSprite(), x: 17, y: 6 },
  ]);
  return (
    <div className="card card-c flex flex-col items-center gap-3" data-testid="bolsita-card">
      <div className="flex items-end gap-2">
        <SpriteSvg sprite={jota} height={84} label="el jota con la bolsita en la mano" />
        <span className="speech text-sm" style={{ padding: "3px 8px" }}>
          {LINES.intro}
        </span>
      </div>
      <SpriteSvg sprite={cups} height={64} label="los tres vasos rojos, iguales, dados vuelta" />
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const lost = v.ok ? v.lost : false;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="bolsita-result" data-reason={v.ok ? "ok" : v.reason}>
      <SpriteSvg sprite={jotaSprite(lost ? "burlon" : "contento")} height={120} label="el jota" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }} data-testid="game-score">
        {result.score}
      </p>
      <p className="text-lg text-tinta-media">{result.score === 1 ? "bolsita ganada." : "bolsitas ganadas."}</p>
    </div>
  );
}

export const laBolsitaDelJota: GameModule = {
  id: "la-bolsita-del-jota",
  name: "la bolsita del jota",
  tagline: "si adivinás, es tuya.",
  howTo: ["mirá bajo qué vaso esconde el jota la bolsita", "seguila mientras mezcla y, cuando pare, tocá el vaso", "si le errás, se termina: gana el que más rondas acierta"],
  durationMs: DURATION_MS,
  // errar lo antes posible: mostrar y la primera mezcla (unos 3 s), más el segundo del final
  minDurationMs: 3_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  recomputeScore: (result, seed) => {
    const v = check(seed, result.events);
    return v.ok ? v.score : null;
  },
  Component: BolsitaGame,
  Intro,
  Result,
};
