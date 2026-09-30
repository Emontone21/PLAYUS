// "pisteando el sunny": un Nissan Sunny acelera solo por una ruta en zigzag
// que flota en el vacío. Se dobla manteniendo apretada una mitad de la
// pantalla (o las flechas); a velocidad derrapa. Si se sale de la ruta, se
// cae. El puntaje son los metros por el eje de la ruta.
//
// Mismo esquema técnico que los otros juegos de acción: simulación pura a 60
// ticks (rules.ts) avanzada por el reloj de games/lib, y una traza con los
// cambios del control que `validate` vuelve a jugar entera. El dibujo es 3D
// low-poly con three (scene.ts), cargado con import() dinámico solo acá: la
// excepción a la estética de pixel art de Frog (decisión 189).
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { autoPolicy, check, DURATION_MS, generateCourse, initialState, kmh, MAX_SCORE, slipOf, step, TICKS_PER_S, validate, type Course, type EndReason, type SimState, type Steer, type SteerEvent, type TraceEvent } from "./rules";
import { createVisuals, FALL_TICKS, updateVisuals } from "./visuals";
import type { GameScene, Spinner } from "./scene";

/** la caída se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;
/** si el renderer no cargó en este tiempo, la partida arranca igual */
const LOAD_GRACE_MS = 4_000;

/** el degradé del cielo (el mismo de scene.ts, sin importarlo: three solo se carga con import()) */
const SKY_CSS = "linear-gradient(180deg, #5FA8E6 0%, #C9E6FB 100%)";

export interface SunnyDevOptions {
  overlay?: boolean;
  /** las cajas de choque de los obstáculos */
  hitboxes?: boolean;
  slow?: boolean;
  /** arrancar en estos metros, con el conductor automático hasta ahí */
  startMeters?: number;
  /** el conductor automático maneja */
  auto?: boolean;
}

type Hud = { meters: number; kmh: number; end: EndReason | null };

/** carga el renderer 3D una sola vez (three entra en un chunk aparte, solo de este juego) */
let sceneModule: Promise<typeof import("./scene")> | null = null;
function loadScene() {
  if (!sceneModule) sceneModule = import("./scene");
  return sceneModule;
}

export function SunnyGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: SunnyDevOptions }) {
  const course = React.useMemo<Course>(() => generateCourse(seed), [seed]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  /** el control vigente: lo que el dedo o el teclado piden ahora */
  const steerRef = React.useRef<Steer>(0);
  const pointerRef = React.useRef<number | null>(null);
  const keysRef = React.useRef<Steer[]>([]);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [hud, setHud] = React.useState<Hud>({ meters: 0, kmh: 60, end: null });
  const startMeters = dev?.startMeters ?? 0;

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => (reducedRef.current = mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // la partida: simulación a paso fijo, avanzada por el tiempo transcurrido; el renderer se carga aparte
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const s: SimState = initialState();
    const inputs: SteerEvent[] = [];
    let current: Steer = 0;
    const apply = (steer: Steer) => {
      if (steer !== current) {
        inputs.push({ tick: s.tick, steer });
        current = steer;
      }
      step(s, course, steer);
    };
    const bot = autoPolicy();
    // herramienta de desarrollo: el conductor automático maneja hasta los metros pedidos
    while (s.meters < startMeters && !s.end) apply(bot(s, course));
    const vis = createVisuals();
    steerRef.current = 0;
    keysRef.current = [];
    pointerRef.current = null;

    let scene: GameScene | null = null;
    let disposed = false;
    let clock: ReturnType<typeof createTickClock> | null = null;
    let raf = 0;
    let reportedTick = -1;
    let finishTimer: number | undefined;
    let ready = false;
    const resultNow = (): GameResult => {
      const events: TraceEvent[] = [...inputs, { tick: s.end ? s.end.tick : s.tick, fin: true }];
      return { score: s.meters, events };
    };
    const start = () => {
      if (ready || disposed) return;
      ready = true;
      clock = createTickClock(TICKS_PER_S, s.tick, performance.now());
      onProgress(resultNow());
      onReady();
      raf = requestAnimationFrame(frame);
    };

    const frame = () => {
      if (!clock) return;
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      while (s.tick < want) {
        if (s.end) {
          // la caída sigue animándose un rato
          if (vis.lastTick >= s.end.tick + FALL_TICKS) break;
          vis.lastTick++;
          updateVisuals(vis, { ...s, tick: vis.lastTick }, reducedRef.current);
          continue;
        }
        apply(devRef.current?.auto ? bot(s, course) : steerRef.current);
        updateVisuals(vis, s, reducedRef.current);
      }
      scene?.render(s, alpha, vis, { reduced: reducedRef.current, overlay: !!devRef.current?.overlay, hitboxes: !!devRef.current?.hitboxes });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.tick = String(s.tick);
        d.meters = String(s.meters);
        d.steer = String(s.steer);
        d.slip = String(slipOf(s));
        d.kmh = String(kmh(s.v));
        d.scene = scene ? "1" : "";
      }
      if (s.tick !== reportedTick) {
        reportedTick = s.tick;
        const result = resultNow();
        onProgress(result);
        const end = s.end?.reason ?? null;
        const speed = kmh(s.v);
        setHud((h) => (h.meters === s.meters && h.end === end && h.kmh === speed ? h : { meters: s.meters, kmh: speed, end }));
        if (s.end && finishTimer === undefined) finishTimer = window.setTimeout(() => onFinish(result), END_HOLD_MS);
      }
      raf = requestAnimationFrame(frame);
    };

    // el renderer: three se carga recién acá; la partida arranca cuando está (o a los 4 s, pase lo que pase)
    const grace = window.setTimeout(start, LOAD_GRACE_MS);
    loadScene()
      .then((mod) => {
        if (disposed) return;
        scene = mod.createGameScene(stage, course);
        start();
      })
      .catch(() => start());
    const ro = new ResizeObserver(() => scene?.resize());
    ro.observe(stage);

    // las flechas del teclado: la última apretada manda
    const keyOf = (e: KeyboardEvent): Steer | null => (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : null);
    const syncKeys = () => {
      if (pointerRef.current === null) steerRef.current = keysRef.current[keysRef.current.length - 1] ?? 0;
    };
    const onDown = (e: KeyboardEvent) => {
      const d = keyOf(e);
      if (d === null) return;
      e.preventDefault();
      if (!keysRef.current.includes(d)) keysRef.current.push(d);
      syncKeys();
    };
    const onUp = (e: KeyboardEvent) => {
      const d = keyOf(e);
      if (d === null) return;
      keysRef.current = keysRef.current.filter((x) => x !== d);
      syncKeys();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      disposed = true;
      window.clearTimeout(grace);
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
      scene?.dispose();
      scene = null;
    };
  }, [course, startMeters, onReady, onProgress, onFinish]);

  // un solo dedo: la mitad donde está apretado manda; si se arrastra a la otra mitad, cambia
  const sideOf = (e: React.PointerEvent<HTMLDivElement>): Steer => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return e.clientX - r.left < r.width / 2 ? -1 : 1;
  };
  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointerRef.current !== null) return;
    pointerRef.current = e.pointerId;
    rootRef.current?.setPointerCapture(e.pointerId);
    steerRef.current = sideOf(e);
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== e.pointerId) return;
    steerRef.current = sideOf(e);
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    steerRef.current = keysRef.current[keysRef.current.length - 1] ?? 0;
  }

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full select-none overflow-hidden rounded-lg"
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", background: SKY_CSS, border: "3px solid var(--contorno)", minHeight: 320 }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="sunny-area"
      data-end={hud.end ?? ""}
    >
      <div ref={stageRef} className="absolute inset-0" data-testid="sunny-stage" role="img" aria-label="la ruta en zigzag flotando en el cielo y el sunny" />
      {/* los metros bien grandes y el velocímetro debajo */}
      <div className="pointer-events-none absolute inset-x-0 top-2 flex flex-col items-center">
        <span className="display leading-none text-white" style={{ fontSize: 52, fontWeight: 700, WebkitTextStroke: "2px #1B1B1B", paintOrder: "stroke fill", textShadow: "0 3px 0 rgba(0,0,0,0.25)" }} data-testid="sunny-meters" aria-live="off">
          {hud.meters} m
        </span>
        <span className="display text-white" style={{ fontSize: 20, fontWeight: 700, WebkitTextStroke: "1px #1B1B1B", paintOrder: "stroke fill" }} data-testid="sunny-kmh">
          {hud.kmh} km/h
        </span>
      </div>
      {/* dónde tocar: una marca sutil abajo de cada mitad */}
      <span className="pointer-events-none absolute bottom-2 left-4 text-3xl text-white opacity-60" aria-hidden="true">
        ‹
      </span>
      <span className="pointer-events-none absolute bottom-2 right-4 text-3xl text-white opacity-60" aria-hidden="true">
        ›
      </span>
      {hud.end === "caida" || hud.end === "choque" ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
          <span className="note-alert display text-3xl" role="status" data-testid="sunny-banner">
            {hud.end === "choque" ? "¡chocaste el sunny!" : "¡se fue el sunny!"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

/** el sunny girando despacio sobre un pedazo de losa (three, cargado aparte) */
export function SunnyPreview({ height = 150, label = "el sunny girando sobre un pedazo de losa" }: { height?: number; label?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let spinner: Spinner | null = null;
    let disposed = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    loadScene().then((mod) => {
      if (disposed) return;
      spinner = mod.createPreview(el, reduced);
    });
    return () => {
      disposed = true;
      spinner?.dispose();
    };
  }, []);
  return <div ref={ref} className="w-full overflow-hidden rounded-lg" style={{ height, background: SKY_CSS }} role="img" aria-label={label} data-testid="sunny-preview" />;
}

function Intro() {
  return (
    <div className="card card-c flex flex-col gap-3" data-testid="sunny-card">
      <SunnyPreview />
      <ul className="flex flex-col gap-2 text-sm text-tinta-media">
        <li>el sunny acelera solo</li>
        <li>‹ y › doblan mientras apretás; esquivá los conos y barriles</li>
        <li>los metros por la ruta son el puntaje</li>
      </ul>
    </div>
  );
}

function Result({ result, seed, cutByTimer }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const reason: EndReason | null = v.ok ? (v.endReason ?? (cutByTimer ? "tiempo" : null)) : null;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="sunny-result" data-reason={reason ?? ""}>
      <p className="display-lg text-tinta" style={{ fontSize: 88 }}>
        <span data-testid="game-score">{result.score}</span>
        <span className="ml-2 text-3xl text-tinta-suave">m</span>
      </p>
      <p className="text-lg text-tinta-media">{reason === "caida" ? "se fue el sunny." : reason === "choque" ? "chocaste el sunny." : reason === "tiempo" ? "llegaste a los 2 minutos sin caerte ni chocar." : null}</p>
    </div>
  );
}

export const pisteandoElSunny: GameModule = {
  id: "pisteando-el-sunny",
  name: "pisteando el sunny",
  tagline: "la cola afuera, las ruedas adentro.",
  howTo: ["mantené apretado a la izquierda o a la derecha para doblar", "a velocidad el sunny derrapa: doblá antes de la esquina", "esquivá los conos y barriles; si te salís de la ruta, te caés"],
  durationMs: DURATION_MS,
  // caerse lleva al menos un par de segundos, más la cuenta regresiva y el segundo de la caída
  minDurationMs: 3_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  unit: "m",
  validate,
  Component: SunnyGame,
  Intro,
  Result,
};
