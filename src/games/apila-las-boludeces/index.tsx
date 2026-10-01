// "apila las boludeces" (antes "la torre"): apilar con física. Los objetos bajan de a uno sobre una tabla;
// el que espera se hamaca de lado a lado, "girar" lo da vuelta de a 90° y un
// toque en cualquier otro lado lo suelta donde está. El puntaje es la altura
// máxima (en cm) que alcanzó la torre estando quieta; si algo se cae de la
// tabla, se termina.
//
// La física es Rapier 2D determinístico (WASM), cargado con import() solo en
// este juego (physics.ts); las reglas (rules.ts) corren igual en el
// navegador y en Node, y `validate` vuelve a jugar la traza entera con el
// mismo motor. El renderer (draw.ts) solo lee la física.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { createTickClock } from "../lib/tick-clock";
import { sizeCanvas } from "../lib/canvas-scale";
import { SpriteSvg } from "../lib/sprite-svg";
import { KIND_NAMES, KINDS, objectSprite, type Kind } from "./objects";
import { loadRapier, rememberPrev, type Rapier } from "./physics";
import { Camera, cameraTarget, drawScene, scaleFor } from "./draw";
import { applyAction, createSim, destroySim, DURATION_MS, END_TICK, endTickOf, FIELD_H, FIELD_W, formatCm, MAX_SCORE, step, stepVisual, TICKS_PER_S, validate, waitingX, type Action, type ActionEvent, type EndReason, type Sim, type TraceEvent } from "./rules";

/** la caída se ve un segundo antes de pasar al resultado */
const END_HOLD_MS = 1_000;

export interface TorreDevOptions {
  colliders?: boolean;
  rest?: boolean;
  slow?: boolean;
  /** modo libre: lo que se cae se saca y la partida sigue */
  free?: boolean;
}

type Hud = { best: number; next: Kind | null; waiting: Kind | null; end: EndReason | null; dropped: number };

export function TorreGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: TorreDevOptions }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pendingRef = React.useRef<Action[]>([]);
  const kRef = React.useRef(1);
  const reducedRef = React.useRef(false);
  const devRef = React.useRef(dev);
  devRef.current = dev;
  const [k, setK] = React.useState(1);
  const [R, setR] = React.useState<Rapier | null>(null);
  const [hud, setHud] = React.useState<Hud>({ best: 0, next: null, waiting: null, end: null, dropped: 0 });

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

  // el motor: se carga una vez (WASM); hasta que no está, no arranca el cronómetro
  React.useEffect(() => {
    let alive = true;
    loadRapier().then((r) => {
      if (alive) setR(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  // la partida: simulación a paso fijo, avanzada por el tiempo transcurrido
  React.useEffect(() => {
    if (!R) return;
    const free = !!devRef.current?.free;
    const sim: Sim = createSim(R, seed, { free });
    const inputs: ActionEvent[] = [];
    pendingRef.current = [];
    const cam = new Camera();
    cam.y = cameraTarget(sim);
    const clock = createTickClock(TICKS_PER_S, 0, performance.now());
    let raf = 0;
    let reportedTick = -1;
    let finishTimer: number | undefined;
    let visualAfterEnd = 0;
    const resultNow = (): GameResult => {
      const events: TraceEvent[] = [...inputs, { tick: endTickOf(sim), fin: true }];
      return { score: sim.best, events };
    };

    const frame = () => {
      const { want, alpha } = clock.advance(performance.now(), devRef.current?.slow ? 0.25 : 1);
      // las acciones pedidas desde el último cuadro, en el tick actual
      const pending = pendingRef.current;
      pendingRef.current = [];
      for (const a of pending) {
        if (sim.end || sim.tick >= END_TICK) break;
        if (applyAction(sim, a)) inputs.push({ tick: sim.tick, action: a });
      }
      while (sim.tick < want && !sim.end && sim.tick < END_TICK) {
        rememberPrev(sim.bodies);
        step(sim);
      }
      if (sim.end && visualAfterEnd < 90) {
        // la caída se ve: la física sigue un rato, sin tocar el tick ni el puntaje
        rememberPrev(sim.bodies);
        stepVisual(sim);
        visualAfterEnd++;
      }
      cam.follow(cameraTarget(sim), reducedRef.current);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawScene(ctx, sim, cam.y, kRef.current, { alpha, reduced: reducedRef.current, colliders: devRef.current?.colliders, rest: devRef.current?.rest });
      if (rootRef.current) {
        const d = rootRef.current.dataset;
        d.tick = String(sim.tick);
        d.best = String(sim.best);
        d.dropped = String(sim.dropped);
        d.waiting = sim.waiting ? sim.waiting.kind : "";
        d.rot = sim.waiting ? String(sim.waiting.rot) : "";
        const x = waitingX(sim);
        d.x = x === null ? "" : x.toFixed(2);
        d.bodies = String(sim.bodies.length);
      }
      if (sim.tick !== reportedTick) {
        reportedTick = sim.tick;
        const result = resultNow();
        onProgress(result);
        const end = sim.end?.reason ?? null;
        const next = sim.plan.kinds[sim.dropped + 1] ?? null;
        const waiting = sim.waiting?.kind ?? null;
        setHud((h) => (h.best === result.score && h.end === end && h.next === next && h.waiting === waiting && h.dropped === sim.dropped ? h : { best: result.score, end, next, waiting, dropped: sim.dropped }));
        if (sim.end && finishTimer === undefined) finishTimer = window.setTimeout(() => onFinish(result), END_HOLD_MS);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    onProgress(resultNow());
    onReady();

    // teclado: girar con ↑ o R, soltar con espacio, Enter o ↓
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "ArrowUp" || e.key === "r" || e.key === "R") {
        e.preventDefault();
        pendingRef.current.push("rotate");
      } else if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        pendingRef.current.push("drop");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
      destroySim(sim);
    };
  }, [R, seed, onReady, onProgress, onFinish]);

  function drop(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pendingRef.current.push("drop");
  }
  function rotate(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    pendingRef.current.push("rotate");
  }

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full select-none flex-col gap-2"
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      onPointerDown={drop}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="torre-area"
      data-end={hud.end ?? ""}
      data-loaded={R ? "1" : ""}
    >
      <div className="flex items-center justify-between px-1">
        <span className="display text-4xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="torre-height" aria-live="off">
          {formatCm(hud.best)}
        </span>
        <span className="flex items-center gap-2 text-xs text-tinta-suave" data-testid="torre-next" data-kind={hud.next ?? ""}>
          después
          {hud.next ? <SpriteSvg sprite={objectSprite(hud.next)} height={26} label={KIND_NAMES[hud.next]} /> : <span className="inline-block h-[26px] w-[26px]" aria-hidden="true" />}
        </span>
      </div>
      <div ref={areaRef} className="relative flex min-h-0 flex-1 items-center justify-center" data-testid="torre-field">
        <canvas ref={canvasRef} className="pointer-events-none [image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} aria-label="la tabla, la torre y el objeto que espera" role="img" />
        {!R ? (
          <p className="absolute inset-x-0 top-1/2 text-center text-sm text-tinta-suave" role="status">
            cargando la física…
          </p>
        ) : null}
        <button
          type="button"
          className="btn-secondary absolute bottom-3 left-3 flex items-center justify-center"
          style={{ minWidth: 72, minHeight: 64, touchAction: "none" }}
          onPointerDown={rotate}
          onClick={(e) => e.preventDefault()}
          data-testid="torre-rotate"
          aria-label="girar el objeto 90 grados"
        >
          girar ↻
        </button>
        {hud.end === "caida" ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span className="note-alert display text-3xl" role="status" data-testid="torre-banner">
              ¡se vino abajo!
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
    <div className="card card-c flex flex-col gap-3" data-testid="torre-card">
      <div className="flex items-end justify-around px-2">
        {KINDS.map((kind) => (
          <div key={kind} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={objectSprite(kind)} height={kind === "cigarro" ? 54 : kind === "vapo" ? 36 : 60} label={KIND_NAMES[kind]} />
            <span className="text-[11px] text-tinta-suave">{KIND_NAMES[kind]}</span>
          </div>
        ))}
      </div>
      <div className="h-2 w-full rounded-sm" style={{ background: "#8B5A2B", borderBottom: "2px solid #6B4220" }} aria-hidden="true" />
      <ul className="flex flex-col gap-1 text-sm text-tinta-media">
        <li>el objeto se hamaca: tocá para soltarlo</li>
        <li>girar lo da vuelta de a 90°</li>
        <li>cuenta la altura con la torre quieta</li>
      </ul>
    </div>
  );
}

function Result({ result, cutByTimer }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const last = result.events[result.events.length - 1] as { tick?: number } | undefined;
  const fell = !cutByTimer && typeof last?.tick === "number" && last.tick < END_TICK;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="torre-result" data-reason={fell ? "caida" : "tiempo"}>
      <p className="display-lg text-tinta" style={{ fontSize: 80, fontVariantNumeric: "tabular-nums" }} data-testid="game-score">
        {formatCm(result.score)}
      </p>
      <p className="text-lg text-tinta-media">{fell ? "se vino abajo." : "se acabó el tiempo con la torre en pie."}</p>
    </div>
  );
}

export const apilaLasBoludeces: GameModule = {
  id: "apila-las-boludeces",
  name: "apila las boludeces",
  tagline: "apilá lo que venga sin que se caiga.",
  howTo: ["el objeto se hamaca arriba de la torre: tocá la pantalla para soltarlo", "girar lo da vuelta de a 90°", "vale la altura máxima con la torre quieta; si algo se cae de la tabla, se terminó"],
  durationMs: DURATION_MS,
  // soltar todo sin mirar se cae en pocos segundos; con la cuenta regresiva y el segundo de la caída, más de 3
  minDurationMs: 2_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  unit: "cm",
  formatScore: formatCm,
  validate,
  Component: TorreGame,
  Intro,
  Result,
};
