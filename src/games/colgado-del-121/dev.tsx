"use client";

// Solo desarrollo: el gráfico de la inclinación y del ancho de la base a lo
// largo del tiempo, x, velocidad y empuje en pantalla, cámara lenta, saltos
// a los 20, 45 y 80 s, y el jugador automático con demora configurable.
// Deja las reglas en window.__colgado para el E2E.
// /dev/juego/colgado-del-121?seed=…&desde=45&datos=1&lento=1&auto=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { ColgadoGame, colgadoDel121, type ColgadoDevOptions } from "./index";
import { autoTrace, baseHalfAt, BASE_START, check, END_TICK, generateCourse, simulate, SUB, TICKS_PER_S, TILT_MAX, validate } from "./rules";

const JUMPS = [0, 20, 45, 80] as const;

export function ColgadoDev({ seed, from = 0, debug = false, slow = false, auto = false }: { seed: string; from?: number; debug?: boolean; slow?: boolean; auto?: boolean }) {
  const [opts, setOpts] = React.useState({ debug, slow, auto, autoDelayMs: 250 });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<ColgadoDevOptions>({});
  optsRef.current = { ...opts, startTick: start * TICKS_PER_S };
  const course = React.useMemo(() => generateCourse(seed), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevColgado(p: GameProps) {
      return <ColgadoGame {...p} dev={optsRef.current} />;
    }
    return { ...colgadoDel121, Component: DevColgado };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __colgado: unknown }).__colgado = { generateCourse, simulate, autoTrace, check, validate };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="colgado-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.debug} onChange={(e) => setOpts((o) => ({ ...o, debug: e.target.checked }))} data-testid="dev-debug" />
          x, velocidad y empuje
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.auto} onChange={(e) => setOpts((o) => ({ ...o, auto: e.target.checked }))} data-testid="dev-auto" />
          jugador automático, demora
          <input type="number" min={0} max={1000} step={50} value={opts.autoDelayMs} onChange={(e) => setOpts((o) => ({ ...o, autoDelayMs: Math.max(0, Number(e.target.value) || 0) }))} className="w-16 rounded px-1 text-tinta" style={{ background: "var(--superficie-2)" }} data-testid="dev-delay" />
          ms
        </label>
        {JUMPS.map((s) => (
          <button
            key={s}
            type="button"
            className={s === start ? "btn-primary-sm" : "btn-secondary-sm"}
            onClick={() => {
              setStart(s);
              setRun((r) => r + 1);
            }}
            data-testid={`dev-from-${s}`}
          >
            desde {s} s
          </button>
        ))}
      </div>
      <TiltGraph seed={seed} />
      <p className="text-xs text-tinta-suave">
        los saltos usan el jugador automático (con la demora elegida) hasta ese segundo. Esta inclinación tiene {course.segments.length} tramos
{" "}y {course.shakes.length} sacudones{course.relax === 0 ? "; ninguno necesitó ajuste" : `; ${course.relax} ${course.relax === 1 ? "ajuste" : "ajustes"} para que el jugador automático de 250 ms aguante 15 s`}.
      </p>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
    </div>
  );
}

/** la inclinación (celeste) y el medio ancho de la base (verde) a lo largo de los 120 s */
function TiltGraph({ seed }: { seed: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const W = 600;
    const H = 120;
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const course = generateCourse(seed);
    ctx.fillStyle = "#0f2a22";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#2f5a4a";
    for (let s = 0; s <= 120; s += 10) {
      const x = (s / 120) * W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    // los sacudones: una banda rosa
    ctx.fillStyle = "rgba(255,111,145,0.45)";
    for (const sh of course.shakes) ctx.fillRect((sh.from / END_TICK) * W, 0, Math.max(2, ((sh.to - sh.from) / END_TICK) * W), H);
    // la inclinación
    ctx.strokeStyle = "#6FD3E0";
    ctx.beginPath();
    for (let t = 0; t <= END_TICK; t += 2) {
      const x = (t / END_TICK) * W;
      const y = H / 2 - (course.tilts[t]! / TILT_MAX) * (H / 2 - 4);
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // el medio ancho de la base, de 40 (arriba) a 12
    ctx.strokeStyle = "#8EDC66";
    ctx.beginPath();
    for (let t = 0; t <= END_TICK; t += 10) {
      const x = (t / END_TICK) * W;
      const y = H - (baseHalfAt(t) / SUB / BASE_START) * (H - 8) - 4;
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [seed]);
  return (
    <figure className="flex flex-col gap-1" data-testid="dev-graph">
      <canvas ref={ref} className="w-full rounded-lg" style={{ border: "2px solid var(--contorno)", imageRendering: "auto" }} aria-label="la inclinación y el ancho de la base a lo largo del tiempo" role="img" />
      <figcaption className="text-xs text-tinta-suave">celeste: la inclinación (de -1600 a 1600); rosa: los sacudones; verde: el medio ancho de la base (de 40 a 8 unidades); una raya cada 10 s.</figcaption>
    </figure>
  );
}
