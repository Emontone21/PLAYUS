// "Larry en la hdp": Larry llega al mostrador de la hdp y pide una
// hamburguesa. La comanda se ve un instante, se da vuelta, y hay que armarla
// de memoria tocando los ingredientes en orden, de abajo hacia arriba. Bien:
// 100 más un bonus de rapidez. Un ingrediente equivocado: al tacho en el
// acto y una vida menos (hay 3). 90 segundos o hasta quedarse sin vidas.
//
// Sin ticks: una máquina de estados en ms desde onReady (rules.ts), la misma
// que vuelve a jugar `validate` con la traza de toques. La cocina, Big Bro y
// Larry vienen de games/lib (decisión 242).
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { integerScale, sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { createPointerTracker } from "../lib/taps";
import { greyedSprite } from "../lib/sprites";
import { larrySprite } from "../lib/larry";
import type { BigBroPose } from "../lib/big-bro";
import { dropSprite } from "../los-deseos-de-larry/sprites";
import { drawScene } from "./draw";
import {
  advance,
  botTrace,
  broLine,
  check,
  currentOrder,
  DURATION_MS,
  INGREDIENTS,
  larryLine,
  LINES,
  LIVES,
  MAX_SCORE,
  MIN_GAP_MS,
  NAMES,
  newRun,
  larryOrders,
  OVER_HOLD_MS,
  tap,
  trayOpen,
  validate,
  type Ingredient,
  type Phase,
  type Run,
  type TapEvent,
} from "./rules";
import { FIELD_H, FIELD_W, iconSprite } from "./sprites";

export interface LarryHdpDevOptions {
  /** arrancar en este pedido (desde 1): el jugador automático arma los anteriores */
  startOrder?: number;
}

type Hud = {
  score: number;
  lives: number;
  order: number;
  phase: Phase;
  built: number;
  total: number;
  layers: Ingredient[];
  bro: string | null;
  larry: string | null;
  points: number;
  served: number;
};

/** la pose de Big Bro según su frase */
export function broPose(line: string | null): BigBroPose {
  return line === LINES.error ? "enojado" : line === LINES.streak ? "contento" : line === LINES.queue ? "grita" : "espera";
}

/** el borde dentado de arriba del papelito */
const TEETH = `polygon(${Array.from({ length: 13 }, (_, i) => `${(i * 100) / 12}% ${i % 2 ? 0 : 7}px`).join(", ")}, 100% 100%, 0% 100%)`;

/** la comanda: la hamburguesa por capas, de abajo hacia arriba, con los mismos íconos que la bandeja */
export function Comanda({ layers, iconPx, testId = "larryhdp-comanda" }: { layers: readonly Ingredient[]; iconPx: number; testId?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#FFF8E7] px-2 pb-2 pt-4" style={{ clipPath: TEETH }} data-testid={testId}>
      <div className="flex flex-col-reverse items-center" role="img" aria-label={`comanda: ${layers.map((l) => NAMES[l]).join(", ")}`}>
        {layers.map((l, i) => (
          <SpriteSvg key={i} sprite={iconSprite(l)} height={iconPx} />
        ))}
      </div>
    </div>
  );
}

export function LarryHdpGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: LarryHdpDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const trackerRef = React.useRef(createPointerTracker());
  const gameRef = React.useRef<{ run: Run; events: TapEvent[]; readyAt: number; finishTimer?: number } | null>(null);
  const [k, setK] = React.useState(1);
  /** dónde empieza la escena y cuánto mide todo el área (px), para la comanda grande */
  const [box, setBox] = React.useState({ top: 0, h: 0 });
  const first = React.useMemo(() => larryOrders(seed)[0]!, [seed]);
  const [hud, setHud] = React.useState<Hud>({ score: 0, lives: LIVES, order: 1, phase: "view", built: 0, total: first.layers.length, layers: first.layers, bro: LINES.start, larry: null, points: 0, served: 0 });
  const startOrder = dev?.startOrder ?? 1;

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
      setK(integerScale(area.clientWidth, area.clientHeight, window.devicePixelRatio || 1, FIELD_W, FIELD_H));
      setBox({ top: area.offsetTop, h: rootRef.current?.clientHeight ?? 0 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    if (rootRef.current) ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    sizeCanvas(canvas, FIELD_W, FIELD_H, k, dpr);
    kRef.current = k;
  }, [k]);

  /** el reloj del juego: ms enteros desde onReady, nunca para atrás */
  function clock(g: NonNullable<typeof gameRef.current>): number {
    return Math.max(g.run.t, Math.floor(performance.now() - g.readyAt));
  }

  React.useEffect(() => {
    const run = newRun(larryOrders(seed));
    const events: TapEvent[] = [];
    let readyAt = performance.now();
    if (startOrder > 1) {
      // la herramienta: el jugador automático arma los pedidos anteriores, en el pasado
      const b = botTrace(seed, { firstTap: [300, 300], tapGap: [250, 250], maxOrders: startOrder - 1 });
      for (const e of b.events) tap(run, e.t, e.ingredient);
      advance(run, b.run.phaseAt);
      events.push(...b.events);
      readyAt -= b.run.phaseAt;
    }
    const g: NonNullable<typeof gameRef.current> = { run, events, readyAt };
    gameRef.current = g;
    let raf = 0;
    let lastKey = "";
    const frame = () => {
      const t = Math.min(DURATION_MS, clock(g));
      if (g.run.phase !== "over") advance(g.run, t);
      const r = g.run;
      const bro = broLine(r, t);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, kRef.current, r, { t, reduced: reducedRef.current, bro: broPose(bro) });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.t = String(t);
        d.phase = r.phase;
        d.index = String(r.index);
        d.built = String(r.built.length);
        d.score = String(r.score);
        d.lives = String(r.lives);
      }
      const order = currentOrder(r);
      const larry = larryLine(r, t);
      const key = `${r.score}|${r.lives}|${r.index}|${r.phase}|${r.built.length}|${bro}|${larry}`;
      if (key !== lastKey) {
        lastKey = key;
        setHud({ score: r.score, lives: r.lives, order: r.index + 1, phase: r.phase, built: r.built.length, total: order.layers.length, layers: order.layers, bro, larry, points: r.lastPoints, served: r.served });
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
  }, [seed, startOrder, onReady, onProgress]);

  // un toque de la bandeja: cuenta solo con la bandeja abierta, un dedo y 80 ms después del anterior
  function press(ing: Ingredient) {
    const g = gameRef.current;
    if (!g) return;
    const t = clock(g);
    if (t >= DURATION_MS || !trayOpen(g.run, t)) return;
    const last = g.events[g.events.length - 1];
    if (last && t - last.t < MIN_GAP_MS) return;
    const out = tap(g.run, t, ing);
    g.events.push({ t, ingredient: ing });
    const result: GameResult = { score: g.run.score, events: [...g.events] };
    onProgress(result);
    if (out === "error" && g.run.phase === "over" && g.finishTimer === undefined) g.finishTimer = window.setTimeout(() => onFinish(result), OVER_HOLD_MS);
  }
  function down(e: React.PointerEvent<HTMLButtonElement>, ing: Ingredient) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!trackerRef.current.down(e.pointerId)) return;
    press(ing);
  }
  function release(e: React.PointerEvent) {
    trackerRef.current.up(e.pointerId);
  }

  const open = hud.phase === "build";
  // la comanda a la vista ocupa la escena y la bandeja (que igual no responde), al lado de Larry
  const iconPx = Math.max(20, Math.min(52, Math.floor((box.h - box.top - 56) / hud.layers.length)));
  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full select-none flex-col gap-2"
      style={{ touchAction: "manipulation", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="larryhdp-area"
    >
      {/* arriba: el puntaje grande y las 3 vidas; debajo, el pedido */}
      <div className="flex items-start justify-between px-1">
        <div className="flex flex-col">
          <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="larryhdp-score" aria-live="off">
            {hud.score}
          </span>
          <span className="text-sm text-tinta-suave" data-testid="larryhdp-order">
            pedido {hud.order}
          </span>
        </div>
        <div className="flex gap-1" role="img" aria-label={`${hud.lives} de ${LIVES} vidas`} data-testid="larryhdp-lives" data-lives={hud.lives}>
          {Array.from({ length: LIVES }, (_, i) => (
            <SpriteSvg key={i} sprite={i < hud.lives ? dropSprite("hamburguesa") : greyedSprite(dropSprite("hamburguesa"))} height={26} />
          ))}
        </div>
      </div>
      <div ref={areaRef} className="flex min-h-0 flex-1 items-start justify-center">
        <div className="relative">
          <canvas ref={canvasRef} className="pointer-events-none block [image-rendering:pixelated]" style={{ borderRadius: 8 }} role="img" aria-label="la hdp: Larry en el mostrador, Big Bro al fondo y la plancha" data-testid="larryhdp-canvas" />
          {/* después de taparse: el dorso con "hdp", chico, al lado de Larry */}
          {hud.phase === "build" ? (
            <div className="larry-flip pointer-events-none absolute" key={`dorso-${hud.order}`} style={{ left: "29%", width: "16%", top: "6%", height: "30%", filter: "drop-shadow(2px 3px 0 #071611)" }} data-testid="larryhdp-dorso">
              <div className="flex h-full w-full items-center justify-center bg-[#FFF8E7]" style={{ clipPath: TEETH }}>
                <span className="display text-lg text-lengua">hdp</span>
              </div>
            </div>
          ) : null}
          {hud.larry ? (
            <span className="speech pointer-events-none absolute text-xs" style={{ left: "1%", top: "1%", fontSize: 12 }} data-testid="larryhdp-larry-say">
              {hud.larry}
            </span>
          ) : null}
          {hud.bro ? (
            <div className="pointer-events-none absolute z-10 flex justify-end" style={{ right: "1%", top: "3%", width: "34%" }} key={hud.bro}>
              <span className={`display text-xs ${hud.bro === LINES.error || hud.bro === LINES.queue ? "note-alert" : "speech"}`} style={{ padding: "3px 6px", fontSize: 12 }} role="status" data-testid="larryhdp-say">
                {hud.bro}
              </span>
            </div>
          ) : null}
          {hud.phase === "build" || hud.phase === "eat" ? (
            <span className="chip pointer-events-none absolute" style={{ left: "4%", bottom: "4%", fontSize: 12, padding: "1px 8px" }} data-testid="larryhdp-count">
              {hud.phase === "eat" ? hud.total : hud.built} de {hud.total}
            </span>
          ) : null}
          {hud.phase === "eat" ? (
            <span className="larry-pop display pointer-events-none absolute text-2xl text-rana" key={`pop-${hud.served}`} style={{ left: "44%", top: "52%" }} data-testid="larryhdp-pop">
              +{hud.points}
            </span>
          ) : null}
        </div>
      </div>
      {/* la bandeja: 3 × 3, cada botón de 96 px o más; atenuada mientras no se puede tocar */}
      <div className={`grid grid-cols-3 gap-2 transition-opacity ${open ? "" : "opacity-40"}`} role="group" aria-label="ingredientes" data-testid="larryhdp-tray" data-open={open ? "1" : ""}>
        {INGREDIENTS.map((ing) => (
          <button
            key={ing}
            type="button"
            className="flex min-h-[96px] flex-col items-center justify-center gap-1 bg-superficie-2 text-tinta"
            style={{ border: "3px solid var(--contorno)", borderRadius: "16px 16px 16px 6px", boxShadow: "0 4px 0 var(--contorno)" }}
            aria-disabled={!open}
            aria-label={NAMES[ing]}
            onPointerDown={(e) => down(e, ing)}
            onClick={(e) => e.detail === 0 && press(ing)}
            data-testid={`larryhdp-${ing}`}
          >
            <SpriteSvg sprite={iconSprite(ing)} height={48} />
            <span className="text-xs text-tinta-media">{NAMES[ing]}</span>
          </button>
        ))}
      </div>
      {hud.phase === "view" ? (
        <div className="pointer-events-none absolute" style={{ left: "33%", right: "3%", top: box.top + 6, bottom: 4, filter: "drop-shadow(4px 5px 0 #071611)" }}>
          <Comanda layers={hud.layers} iconPx={iconPx} />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

const EXAMPLE: Ingredient[] = ["pan", "carne", "queso", "panceta", "pan"];

function Intro() {
  return (
    <div className="card card-c flex flex-col gap-3" data-testid="larryhdp-card">
      <div className="flex items-end justify-center gap-3">
        <SpriteSvg sprite={larrySprite("normal")} height={110} label="Larry en el mostrador, esperando su hamburguesa" />
        <div className="h-[132px] w-[78px]" style={{ filter: "drop-shadow(2px 3px 0 #071611)" }}>
          <Comanda layers={EXAMPLE} iconPx={22} testId="larryhdp-ejemplo" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 self-center" role="img" aria-label="la bandeja con los 9 ingredientes">
        {INGREDIENTS.map((ing) => (
          <div key={ing} className="flex flex-col items-center rounded-lg bg-superficie-2 px-1 py-1">
            <SpriteSvg sprite={iconSprite(ing)} height={26} />
            <span className="text-[10px] text-tinta-suave">{NAMES[ing]}</span>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-tinta-suave">de abajo hacia arriba: pan, carne, queso, panceta, pan</p>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const served = v.ok ? v.served : 0;
  const errors = v.ok ? v.errors : 0;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="larryhdp-result" data-reason={v.ok ? "ok" : v.reason}>
      <SpriteSvg sprite={larrySprite(errors >= LIVES ? "bajon" : served >= 8 ? "feliz" : "normal")} height={110} label="Larry" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }} data-testid="game-score">
        {result.score}
      </p>
      <p className="text-lg text-tinta-media">
        {served} {served === 1 ? "hamburguesa armada" : "hamburguesas armadas"}
        {errors > 0 ? `, ${errors} al tacho` : ", ninguna al tacho"}.
      </p>
    </div>
  );
}

export const larryEnLaHdp: GameModule = {
  id: "larry-en-la-hdp",
  name: "Larry en la hdp",
  tagline: "acordate lo que pidió Larry.",
  howTo: [
    "mirá el pedido de Larry antes de que se tape",
    "armá la hamburguesa tocando los ingredientes en orden, de abajo hacia arriba",
    "si le errás a un ingrediente, perdés una vida (tenés 3): cuanto más rápido, más puntos",
  ],
  durationMs: DURATION_MS,
  // tres errores lo antes posible: 3 s + 0,8 + 3 s + 0,8 + 2,8 s, más el segundo de bajón
  minDurationMs: 10_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  recomputeScore: (result, seed) => {
    const v = check(seed, result.events);
    return v.ok ? v.score : null;
  },
  Component: LarryHdpGame,
  Intro,
  Result,
};
