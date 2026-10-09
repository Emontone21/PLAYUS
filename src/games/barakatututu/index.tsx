// "Barakatututu": El negro toto toca un patrón en su tambor y hay que
// repetirlo tocando la pantalla con el mismo tiempo. Cada ronda es más larga
// y más rápida; errar termina la partida. Visual, sin sonido: el pulso se ve
// en la lonja y en la regla del compás. 180 s; el puntaje son las rondas
// superadas.
//
// Simulación pura en ms desde onReady (rules.ts), la misma que vuelve a
// jugar `validate` con los patrones rearmados, el horario de cada tramo y la
// corrección por dispositivo (los 4 toques de la cuenta inicial van en la
// traza). Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { integerScale, sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { createPointerTracker } from "../lib/taps";
import { drawScene, H, totoHitsUntil, W, type Flash } from "./draw";
import { advance, beatMs, botTrace, CALIBRATION_TAPS, check, DURATION_MS, FAIL_HOLD_MS, MAX_SCORE, newRun, phaseMs, tap, validate, type BeatEvent, type Run } from "./rules";
import { totoDrumSprite, totoSprite } from "./sprites";

export const LINES = {
  hola: "ayudame con los toques, mano, que tengo que salir a desfilar",
  ajuste: "tocá junto con los 4 pulsos",
  escucha: "mirá el toque",
  turno: "¡dale, te toca!",
  eso: "¡eso, mano!",
  error: "quedate quieto mano",
} as const;

export interface BarakaDevOptions {
  windows?: boolean;
  slow?: boolean;
  /** arrancar en esta ronda (desde 1): el jugador automático pasa las anteriores en el pasado */
  firstRound?: number;
}

type Hud = { round: number; score: number; phase: Run["phase"]; count: number; text: string | null };

/** qué dice El negro toto y qué número de la cuenta va, según el tramo */
export function sayFor(run: Run, t: number): { text: string | null; count: number } {
  const b = beatMs(run.round.bpm);
  const beat = Math.floor(((t - run.phaseStart) % (4 * b)) / b);
  if (run.phase === "calibration") return { text: run.calibrationTaps.length === 0 && t < 2_500 ? LINES.hola : LINES.ajuste, count: beat + 1 };
  if (run.phase === "count") return { text: null, count: beat + 1 };
  if (run.phase === "listen") return { text: LINES.escucha, count: 0 };
  if (run.phase === "turn") return { text: LINES.turno, count: 0 };
  if (run.phase === "result") return { text: LINES.eso, count: 0 };
  if (run.phase === "failed" || (run.phase === "over" && run.fail)) return { text: LINES.error, count: 0 };
  return { text: null, count: 0 };
}

export function BarakaGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: BarakaDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const trackerRef = React.useRef(createPointerTracker());
  const gameRef = React.useRef<{ run: Run; events: BeatEvent[]; clock: () => number; flashes: Flash[]; seenToto: number; finishTimer?: number } | null>(null);
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ round: 1, score: 0, phase: "calibration", count: 0, text: LINES.hola });
  const firstRound = dev?.firstRound ?? 1;

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
    const measure = () => setK(integerScale(area.clientWidth, Math.min(area.clientHeight > 0 ? area.clientHeight : Number.MAX_SAFE_INTEGER, Math.max(240, window.innerHeight - 150)), window.devicePixelRatio || 1, W, H));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    sizeCanvas(canvas, W, H, k, window.devicePixelRatio || 1);
    kRef.current = k;
  }, [k]);

  React.useEffect(() => {
    let run = newRun(seed);
    const events: BeatEvent[] = [];
    let base = 0;
    if (firstRound > 1) {
      // la herramienta: el jugador automático hace la cuenta y pasa las rondas anteriores, en el pasado
      const b = botTrace(seed, { device: 0, jitter: 0, failAt: firstRound - 1 });
      const keep = b.events.filter((e) => e.phase === "calibration" || e.round < firstRound);
      run = newRun(seed);
      for (const e of keep) tap(run, e.t);
      events.push(...keep);
      // hasta que arranca la ronda pedida
      while (run.index + 1 < firstRound && run.phase !== "over") advance(run, run.phaseStart + phaseMs(run, run.phase));
      base = run.t;
    }
    // el reloj del juego: ms enteros desde onReady (con cámara lenta en la herramienta), nunca para atrás
    let virt = base;
    let last = performance.now();
    const clock = () => {
      const now = performance.now();
      virt += (now - last) * (devRef.current?.slow ? 0.5 : 1);
      last = now;
      return Math.max(run.t, Math.floor(virt));
    };
    const g: NonNullable<typeof gameRef.current> = { run, events, clock, flashes: [], seenToto: 0 };
    gameRef.current = g;
    let raf = 0;
    let lastKey = "";
    const frame = () => {
      const t = Math.min(DURATION_MS, clock());
      const phaseBefore = run.phase;
      const startBefore = run.phaseStart;
      if (run.phase !== "over") advance(run, t);
      if (run.phase !== phaseBefore || run.phaseStart !== startBefore) g.seenToto = 0;
      // los golpes de El negro toto destellan en la lonja a medida que suenan
      const hits = totoHitsUntil(run, t);
      for (; g.seenToto < hits.length; g.seenToto++) g.flashes.push({ t: hits[g.seenToto]!.t, who: hits[g.seenToto]!.strong ? "toto-fuerte" : "toto" });
      g.flashes = g.flashes.filter((f) => t - f.t < 1_000);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, kRef.current, run, { t, reduced: reducedRef.current, flashes: g.flashes, windows: devRef.current?.windows });
      const say = sayFor(run, t);
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.t = String(t);
        d.phase = run.phase;
        d.round = String(run.index + 1);
        d.score = String(run.score);
        d.turnStart = String(run.turnStart);
        d.phaseStart = String(run.phaseStart);
        d.correction = String(run.correction);
        d.taps = String(run.calibrationTaps.length);
      }
      const key = `${run.score}|${run.index}|${run.phase}|${say.count}|${say.text}`;
      if (key !== lastKey) {
        lastKey = key;
        setHud({ round: run.index + 1, score: run.score, phase: run.phase, count: say.count, text: say.text });
        onProgress({ score: run.score, events: [...events] });
        if (run.phase === "failed" && g.finishTimer === undefined) {
          const result: GameResult = { score: run.score, events: [...events] };
          g.finishTimer = window.setTimeout(() => onFinish(result), Math.max(0, FAIL_HOLD_MS - (t - run.fail!.t)));
        }
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
  }, [seed, firstRound, onReady, onProgress, onFinish]);

  // un golpe: en el pointerdown, para que no haya demora
  const hit = React.useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const t = Math.min(DURATION_MS, g.clock());
    const out = tap(g.run, t);
    if (out === "ajuste") g.events.push({ t, phase: "calibration", round: 0 });
    else if (out === "bien" || out === "error") g.events.push({ t, phase: "turn", round: g.run.index + 1 });
    if (out !== "ignorado") g.flashes.push({ t, who: "vos" });
  }, []);

  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!trackerRef.current.down(e.pointerId)) return;
    hit();
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    trackerRef.current.up(e.pointerId);
  }
  React.useEffect(() => {
    // en escritorio, la barra espaciadora (sin repetir si se mantiene apretada)
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      hit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hit]);

  const calibrating = hud.phase === "calibration";
  return (
    <div ref={rootRef} className="flex h-full w-full select-none flex-col gap-1" data-testid="baraka-area" data-phase={hud.phase}>
      <div className="flex items-end justify-between px-1">
        <span className="display text-4xl text-tinta" data-testid="baraka-round">
          {calibrating ? "ajuste" : `ronda ${hud.round}`}
        </span>
        <span className="display text-xl text-tinta-media" data-testid="baraka-score">
          {hud.score === 1 ? "1 pasada" : `${hud.score} pasadas`}
        </span>
      </div>
      <div
        ref={areaRef}
        className="flex min-h-0 flex-1 items-start justify-center"
        style={{ touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="baraka-field"
      >
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ borderRadius: 8 }} aria-label="una calle de Barrio Sur de noche, El negro toto con su tambor y la regla del compás" role="img" data-testid="baraka-canvas" />
          {hud.count > 0 ? (
            <div className="pointer-events-none absolute inset-x-0 top-[44%] flex justify-center">
              <span className="display-lg text-tinta" style={{ fontSize: 96, lineHeight: 1 }} data-testid="baraka-count" aria-live="off">
                {hud.count}
              </span>
            </div>
          ) : null}
          {hud.text ? (
            <div className="pointer-events-none absolute inset-x-0 top-[2%] flex justify-center px-2">
              <span className={hud.text === LINES.error ? "note-alert display text-xl" : "speech text-sm"} style={{ padding: "4px 10px", maxWidth: "92%" }} role="status" data-testid="baraka-say">
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
  return (
    <div className="card card-c flex flex-col gap-3" data-testid="baraka-card">
      <div className="flex items-end justify-around gap-2">
        <div className="flex items-end" role="img" aria-label="El negro toto con su tambor">
          <SpriteSvg sprite={totoSprite("contento")} height={92} label="" />
          <SpriteSvg sprite={totoDrumSprite()} height={44} label="" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <svg viewBox="0 0 64 12" width={160} height={30} shapeRendering="crispEdges" role="img" aria-label="la regla del compás con un patrón de ejemplo">
            <rect x={0} y={3} width={64} height={6} fill="#3A3F4C" />
            <rect x={0} y={6} width={64} height={1} fill="#5B6170" />
            {[0, 16, 32, 48].map((x) => (
              <rect key={x} x={x + 1} y={5} width={3} height={3} fill="#F2E8D0" />
            ))}
            {[0, 12, 24, 32, 44, 52].map((x) => (
              <rect key={`m${x}`} x={x + 2} y={2} width={1} height={8} fill="#FFD34E" />
            ))}
          </svg>
          <span className="text-[11px] text-tinta-suave">la madera, en semicorcheas</span>
        </div>
      </div>
      <ul className="flex flex-col gap-1 text-sm text-tinta-media">
        <li>sin sonido: el pulso se ve en la lonja y en la regla</li>
        <li>primero tocá 4 veces con la cuenta, para ajustar tu teléfono</li>
      </ul>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const failed = v.ok ? v.run.fail !== null : false;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="baraka-result" data-reason={v.ok ? "ok" : v.reason}>
      <SpriteSvg sprite={totoSprite(failed ? "enojado" : "eso")} height={96} label="El negro toto" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }}>
        <span data-testid="game-score">{result.score}</span>
      </p>
      <p className="text-lg text-tinta-media">
        {result.score === 1 ? "1 ronda pasada" : `${result.score} rondas pasadas`}
        {failed ? ". y después, quedate quieto mano." : "."}
      </p>
    </div>
  );
}

export const barakatututu: GameModule = {
  id: "barakatututu",
  name: "Barakatututu",
  tagline: "ayudalo con los toques.",
  howTo: ["mirá el toque de El negro toto en el tambor", "cuando te toque, repetilo tocando la pantalla con el mismo tiempo", "si le errás al ritmo, se termina: gana el que más rondas pasa"],
  durationMs: DURATION_MS,
  // la cuenta de ajuste lleva un compás; errar en la primera ronda llega a los pocos segundos
  minDurationMs: 5_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  recomputeScore: (result, seed) => {
    const v = check(seed, result.events);
    return v.ok ? v.score : null;
  },
  Component: BarakaGame,
  Intro,
  Result,
};

void CALIBRATION_TAPS;
