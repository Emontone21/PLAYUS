// "Big Bro afila": arriba gira una horma de queso; cada toque, Big Bro tira
// una cuchilla que se clava por el punto más bajo. Si choca con otra, se
// termina. Pegarle a los ingredientes del borde da puntos extra; clavar toda
// la tanda parte la horma y viene otra, más difícil.
//
// Mismo esquema técnico que los otros juegos de acción: simulación entera a
// 60 ticks (rules.ts) avanzada por el reloj de games/lib, y una traza con el
// tick de cada tiro que `validate` vuelve a jugar. Big Bro y la cocina vienen
// de games/lib (decisión 249).
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { integerScale, sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { createPointerTracker } from "../lib/taps";
import { composeSprite } from "../lib/sprites";
import { bigBroSprite } from "../lib/big-bro";
import { drawScene } from "./draw";
import {
  botTrace,
  broSays,
  check,
  CRASH_HOLD_TICKS,
  DURATION_MS,
  END_TICK,
  initialState,
  LINES,
  MAX_SCORE,
  simulate,
  step,
  throwKnife,
  TICKS_PER_S,
  validate,
  type BroFace,
  type SimState,
  type TraceEvent,
} from "./rules";
import { FIELD_H, FIELD_W, ingredientSprite, knifeSprite } from "./sprites";

export interface AfilaDevOptions {
  /** herramienta: ángulos, margen de choque y rango de cada ingrediente */
  debug?: boolean;
  slow?: boolean;
  /** arrancar en este tick (el jugador automático justo jugó hasta ahí) */
  startTick?: number;
  /** el jugador automático juega solo */
  auto?: boolean;
}

type Hud = { score: number; wheel: number; text: string | null; face: BroFace; pop: number; done: number; big: boolean; end: boolean };

export function AfilaGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: AfilaDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pendingRef = React.useRef(0);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const trackerRef = React.useRef(createPointerTracker());
  const [k, setK] = React.useState(1);
  const [hud, setHud] = React.useState<Hud>({ score: 0, wheel: 1, text: null, face: "espera", pop: 0, done: 0, big: false, end: false });
  const startTick = dev?.startTick ?? 0;
  const auto = !!dev?.auto;

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
    let s: SimState = initialState(seed);
    const throws: number[] = [];
    // la herramienta: el jugador automático justo (siempre el mismo) hasta el tick de arranque, y después si se lo pide
    const fair = startTick > 0 || auto ? botTrace(seed).events.filter((e): e is { tick: number } => !("fin" in e)).map((e) => e.tick) : [];
    if (startTick > 0) {
      const before = fair.filter((t) => t < startTick);
      const r = simulate(seed, before, startTick);
      if (r.ok) s = r.state;
      throws.push(...before);
    }
    let autoK = auto ? fair.findIndex((t) => t >= s.tick) : -1;
    pendingRef.current = 0;
    const clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
    let raf = 0;
    let reported = -1;
    let finished = false;
    const resultNow = (endTick: number): GameResult => ({ score: s.score, events: [...throws.map((tick) => ({ tick })), { tick: endTick, fin: true }] as TraceEvent[] });
    const tryThrow = () => {
      if (throwKnife(s) === "ok") throws.push(s.tick);
    };
    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      for (; pendingRef.current > 0; pendingRef.current--) tryThrow();
      const endAt = s.phase === "crash" ? Math.min(END_TICK, s.crashAt + CRASH_HOLD_TICKS) : END_TICK;
      while (s.tick < want && s.tick < endAt) {
        if (autoK >= 0 && autoK < fair.length && fair[autoK] === s.tick) {
          tryThrow();
          autoK++;
        }
        step(s);
      }
      const say = broSays(s);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, kRef.current, s, { alpha, reduced: reducedRef.current, face: say.face, debug: devRef.current?.debug });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.tick = String(s.tick);
        d.score = String(s.score);
        d.phase = s.phase;
        d.wheel = String(s.wheel.spec.n);
        d.angle = String(s.wheel.spin.angle);
        d.vel = String(s.wheel.spin.vel);
        d.flying = s.flying === null ? "" : "1";
        d.stuck = s.wheel.stuck.map((x) => x.rel).join(",");
      }
      if (s.tick !== reported) {
        reported = s.tick;
        const end = s.tick >= endAt;
        onProgress(resultNow(Math.max(1, s.tick)));
        setHud((h) =>
          h.score === s.score && h.wheel === s.wheel.spec.n && h.text === say.text && h.face === say.face && h.done === s.done && h.end === end
            ? h
            : { score: s.score, wheel: s.wheel.spec.n, text: say.text, face: say.face, pop: s.lastWheelPoints, done: s.done, big: s.wheel.spec.big, end },
        );
        if (end && !finished) {
          finished = true;
          onFinish(resultNow(endAt));
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow(Math.max(1, s.tick)));
    onReady();
    return () => cancelAnimationFrame(raf);
  }, [seed, startTick, auto, onReady, onProgress, onFinish]);

  // la barra espaciadora también tira (sin repetir si se mantiene apretada)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      e.preventDefault();
      if (!e.repeat) pendingRef.current++;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // tocar en cualquier parte tira: un solo dedo
  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!trackerRef.current.down(e.pointerId)) return;
    pendingRef.current++;
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    trackerRef.current.up(e.pointerId);
  }

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full select-none flex-col gap-1"
      style={{ touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="afila-area"
      data-end={hud.end ? "1" : ""}
    >
      <div className="flex flex-col px-1">
        <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="afila-score" aria-live="off">
          {hud.score}
        </span>
        <span className="text-sm text-tinta-suave" data-testid="afila-wheel">
          horma {hud.wheel}
          {hud.big ? " · la grande" : ""}
        </span>
      </div>
      <div ref={areaRef} className="flex min-h-0 flex-1 items-start justify-center">
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ borderRadius: 8 }} role="img" aria-label="la horma de queso girando, con las cuchillas clavadas, y Big Bro abajo" data-testid="afila-canvas" />
          {hud.text ? (
            <div className="pointer-events-none absolute flex justify-center" style={{ left: "8%", right: "8%", bottom: "26%" }} key={hud.text}>
              <span className={`display text-sm ${hud.face === "enojado" ? "note-alert" : "speech"}`} style={{ padding: "4px 10px" }} role="status" data-testid="afila-say">
                {hud.text}
              </span>
            </div>
          ) : null}
          {hud.text === LINES.done ? (
            <span className="afila-pop display pointer-events-none absolute text-4xl text-rana" key={`pop-${hud.done}`} style={{ left: "50%", top: "30%" }} data-testid="afila-pop">
              +{hud.pop}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

/** la horma con un par de cuchillas clavadas y un ingrediente (para la previa) */
function introWheel() {
  const r = 14;
  const px: { x: number; y: number; c: string }[] = [];
  const c = 22;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d <= r + 0.5) px.push({ x: c + x, y: c + y, c: d > r - 0.6 ? "#141414" : d > r - 2 ? "#D9A21E" : "#F7D23E" });
  }
  const base = { w: 44, h: 44, px };
  const knife = knifeSprite();
  return composeSprite(44, 44, [
    { sprite: base, x: 0, y: 0 },
    { sprite: { ...knife, px: knife.px.filter((p) => p.y < 10) }, x: c - 1, y: 0 },
    { sprite: ingredientSprite("tomate"), x: c + r - 3, y: c - 4 },
    { sprite: { ...knife, px: knife.px.filter((p) => p.y < 10).map((p) => ({ ...p, x: p.y, y: p.x })) }, x: 0, y: c - 1 },
  ]);
}

function Intro() {
  return (
    <div className="card card-c flex items-center justify-center gap-4" data-testid="afila-card">
      <div className="flex flex-col items-center gap-1">
        <span className="speech text-xs" style={{ padding: "3px 6px" }}>
          {LINES.intro}
        </span>
        <SpriteSvg sprite={bigBroSprite("tira")} height={84} label="Big Bro, con una cuchilla en alto" />
      </div>
      <SpriteSvg sprite={introWheel()} height={110} label="la horma de queso con dos cuchillas clavadas y un tomate en el borde" />
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const done = v.ok ? v.done : 0;
  const crashed = v.ok ? v.crashed : false;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="afila-result" data-reason={v.ok ? "ok" : v.reason}>
      <SpriteSvg sprite={bigBroSprite(done >= 4 ? "contento" : crashed ? "enojado" : "espera")} height={100} label="Big Bro" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }} data-testid="game-score">
        {result.score}
      </p>
      <p className="text-lg text-tinta-media">
        {done === 1 ? "1 horma partida" : `${done} hormas partidas`}
        {crashed ? ", y chocó una cuchilla." : "."}
      </p>
    </div>
  );
}

export const bigBroAfila: GameModule = {
  id: "big-bro-afila",
  name: "Big Bro afila",
  tagline: "clavala donde no hay otra.",
  howTo: ["tocá para que Big Bro tire una cuchilla a la horma que gira", "si choca contra otra cuchilla, se termina", "pegale a los ingredientes del borde para sumar extra"],
  durationMs: DURATION_MS,
  // chocar lo antes posible: dos tiros seguidos en la primera horma (el segundo llega al tick 12), más el segundo del choque
  minDurationMs: 1_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  recomputeScore: (result, seed) => {
    const v = check(seed, result.events);
    return v.ok ? v.score : null;
  },
  Component: AfilaGame,
  Intro,
  Result,
};
