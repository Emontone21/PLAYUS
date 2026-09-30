"use client";

// Solo desarrollo: el eje, el margen de caída y los vectores; cámara lenta;
// saltos a los 500, 1.500 y 3.000 m (el conductor automático maneja hasta
// ahí); el conductor automático al volante; y el sunny en sus 32 rotaciones.
// Deja las reglas en window.__sunny para el E2E.
// /dev/juego/pisteando-el-sunny?seed=…&desde=500&eje=1&lento=1&auto=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SunnyGame, pisteandoElSunny, type SunnyDevOptions } from "./index";
import { autoTrace, check, generateCourse, simulate, validate } from "./rules";
import { SpriteSvg } from "../lib/sprite-svg";
import { CAR_STEPS, carSprite } from "./sprites";

const JUMPS = [0, 500, 1500, 3000] as const;

export function SunnyDev({ seed, from = 0, overlay = false, slow = false, auto = false }: { seed: string; from?: number; overlay?: boolean; slow?: boolean; auto?: boolean }) {
  const [opts, setOpts] = React.useState({ overlay, slow, auto });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<SunnyDevOptions>({});
  optsRef.current = { ...opts, startMeters: start };
  const relax = React.useMemo(() => generateCourse(seed).relax, [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevSunny(p: GameProps) {
      return <SunnyGame {...p} dev={optsRef.current} />;
    }
    return { ...pisteandoElSunny, Component: DevSunny };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __sunny: unknown }).__sunny = { generateCourse, simulate, autoTrace, check, validate };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="sunny-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.overlay} onChange={(e) => setOpts((o) => ({ ...o, overlay: e.target.checked }))} data-testid="dev-overlay" />
          eje y vectores
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.auto} onChange={(e) => setOpts((o) => ({ ...o, auto: e.target.checked }))} data-testid="dev-auto" />
          conductor automático
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
      <p className="text-xs text-tinta-suave">
        los saltos usan el conductor automático hasta esos metros. La ruta de esta semilla se generó con {relax === 0 ? "las curvas previstas" : `las curvas abiertas ${relax} ${relax === 1 ? "vez" : "veces"}`} para que el conductor automático la complete.
      </p>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <div className="flex flex-col gap-2" data-testid="dev-rotations">
        <h2 className="display text-lg">el sunny en sus 32 rotaciones</h2>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: CAR_STEPS }, (_, i) => (
            <SpriteSvg key={i} sprite={carSprite(i)} height={60} label={`rotación ${i}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
