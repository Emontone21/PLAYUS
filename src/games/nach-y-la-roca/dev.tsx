"use client";

// Solo desarrollo: la vista desde arriba de las filas que vienen (con el
// carril libre marcado), las cajas de choque, cámara lenta, saltos a 200,
// 600 y 1.000 m, y The Nach y las rocas por separado. Deja las reglas en
// window.__nach para el E2E.
// /dev/juego/nach-y-la-roca?seed=…&cajas=1&lento=1&desde=600

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { NachGame, nachYLaRoca, type NachDevOptions } from "./index";
import { drawTopDown } from "./draw";
import { botTrace, check, DIST, END_TICK, generateCourse, initialState, simulate, step, validate, type Course, type SimState } from "./rules";
import { nachDownSprite, nachSprite, rockSprite, vinylSprite } from "./sprites";

const JUMPS = [0, 200, 600, 1000] as const;

export function NachDev({ seed, from = 0, hitboxes = false, slow = false }: { seed: string; from?: number; hitboxes?: boolean; slow?: boolean }) {
  const [opts, setOpts] = React.useState({ hitboxes, slow });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<NachDevOptions>({});
  optsRef.current = { ...opts, startMeters: start };
  const course = React.useMemo(() => generateCourse(seed), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevNach(p: GameProps) {
      return <NachGame {...p} dev={optsRef.current} />;
    }
    return { ...nachYLaRoca, Component: DevNach };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __nach: unknown }).__nach = { generateCourse, simulate, botTrace, check, validate, initialState, step };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="nach-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.hitboxes} onChange={(e) => setOpts((o) => ({ ...o, hitboxes: e.target.checked }))} data-testid="dev-hitboxes" />
          cajas de choque
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        {JUMPS.map((m) => (
          <button
            key={m}
            type="button"
            className={m === start ? "btn-primary-sm" : "btn-secondary-sm"}
            onClick={() => {
              setStart(m);
              setRun((r) => r + 1);
            }}
            data-testid={`dev-from-${m}`}
          >
            desde {m} m
          </button>
        ))}
      </div>
      <div className="flex items-end gap-4" data-testid="dev-sprites">
        <SpriteSvg sprite={nachSprite("a")} height={72} label="The Nach, cuadro a" />
        <SpriteSvg sprite={nachSprite("b")} height={72} label="The Nach, cuadro b" />
        <SpriteSvg sprite={nachSprite("der")} height={72} label="The Nach inclinado" />
        <SpriteSvg sprite={nachDownSprite()} height={72} label="The Nach en el piso" />
        <SpriteSvg sprite={rockSprite(0)} height={24} label="roca chica" />
        <SpriteSvg sprite={rockSprite(1)} height={32} label="roca mediana" />
        <SpriteSvg sprite={rockSprite(2)} height={40} label="roca grande" />
        <SpriteSvg sprite={vinylSprite()} height={36} label="vinilo" />
      </div>
      <TopDown course={course} seed={seed} />
      <p className="text-xs text-tinta-suave">
        el curso tiene {course.rows.length} filas ({course.rows.filter((r) => r.kind === "doble").length} dobles, {course.rows.filter((r) => r.kind === "par").length} pares, {course.rows.filter((r) => r.kind === "rodante").length} rodantes); {course.pushed} se corrieron para dar el tiempo de reacción. Los saltos usan el jugador automático hasta esos metros.
      </p>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
    </div>
  );
}

/** la vista desde arriba: sigue al área del juego leyendo su tick (data-tick) */
function TopDown({ course, seed }: { course: Course; seed: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 240;
    c.height = 160;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const s: SimState = initialState();
    const draw = () => {
      const area = document.querySelector('[data-testid="nach-area"]') as HTMLElement | null;
      const tick = Math.min(END_TICK, Number(area?.dataset.tick ?? 0));
      // sigue el tick y el carril del juego, sin simular choques: la distancia es función del tick
      s.tick = tick;
      s.dist = DIST[tick] ?? 0;
      s.lane = (Number(area?.dataset.lane ?? 1) as 0 | 1 | 2) || 0;
      while (s.nextRow < course.rows.length && course.rows[s.nextRow]!.dist <= s.dist) s.nextRow++;
      drawTopDown(ctx, s, course, c.width, c.height);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [course, seed]);
  return (
    <figure className="flex flex-col gap-1" data-testid="dev-topdown">
      <canvas ref={ref} className="w-full max-w-[240px] rounded-lg" style={{ border: "2px solid var(--contorno)", imageRendering: "auto" }} aria-label="las filas que vienen, vistas desde arriba" role="img" />
      <figcaption className="text-xs text-tinta-suave">desde arriba: los próximos 120 m; gris, roca; verde, carril libre; amarillo, hacia dónde cruza una rodante.</figcaption>
    </figure>
  );
}
