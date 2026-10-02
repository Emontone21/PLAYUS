"use client";

// Solo desarrollo: la trayectoria completa al apuntar, el radio de la boca y
// la menor distancia de cada tiro, el vector del resolvedor, saltos a
// cualquiera de los 3 tiros y las caras de El chino. Deja las reglas en
// window.__chino para el E2E.
// /dev/juego/fumate-algo-chino?seed=…&todo=1&datos=1&resolver=1&desde=2

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { ChinoGame, fumateAlgoChino, vectorFromDrag, type ChinoDevOptions } from "./index";
import { botTrace, check, fly, generateShots, initialState, SHOTS, simulate, solveShot, step, validate } from "./rules";
import { chinoSprite, type Face } from "./sprites";

const FACES: [Face, string][] = [
  ["espera", "esperando"],
  ["adentro", "adentro"],
  ["casi", "casi"],
  ["quehaces", "¿qué hacés?"],
];

export function ChinoDev({ seed, from = 0, fullPath = false, debug = false, solver = false }: { seed: string; from?: number; fullPath?: boolean; debug?: boolean; solver?: boolean }) {
  const [opts, setOpts] = React.useState({ fullPath, debug, solver });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<ChinoDevOptions>({});
  optsRef.current = { ...opts, startShot: start };
  const shots = React.useMemo(() => generateShots(seed), [seed]);
  const solutions = React.useMemo(() => shots.map((s) => solveShot(s)), [shots]);

  const game = React.useMemo<GameModule>(() => {
    function DevChino(p: GameProps) {
      return <ChinoGame {...p} dev={optsRef.current} />;
    }
    return { ...fumateAlgoChino, Component: DevChino };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __chino: unknown }).__chino = { generateShots, simulate, botTrace, check, validate, initialState, step, solveShot, fly, vectorFromDrag };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="chino-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.fullPath} onChange={(e) => setOpts((o) => ({ ...o, fullPath: e.target.checked }))} data-testid="dev-fullpath" />
          toda la trayectoria
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.debug} onChange={(e) => setOpts((o) => ({ ...o, debug: e.target.checked }))} data-testid="dev-debug" />
          radio de la boca y distancia
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.solver} onChange={(e) => setOpts((o) => ({ ...o, solver: e.target.checked }))} data-testid="dev-solver" />
          vector del resolvedor
        </label>
        {Array.from({ length: SHOTS }, (_, i) => (
          <button
            key={i}
            type="button"
            className={i === start ? "btn-primary-sm" : "btn-secondary-sm"}
            onClick={() => {
              setStart(i);
              setRun((r) => r + 1);
            }}
            data-testid={`dev-from-${i}`}
          >
            tiro {i + 1}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-4" data-testid="dev-faces">
        {FACES.map(([face, text]) => (
          <div key={face} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={chinoSprite(face)} height={80} label={`El chino ${text}`} />
            <span className="text-xs text-tinta-suave">{text}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-tinta-suave" data-testid="dev-shots">
        {shots.map((s, i) => `tiro ${i + 1}: ${(s.dist / 10).toFixed(1)} m, viento ${s.wind > 0 ? "→" : "←"} ${Math.abs(s.wind)}; el resolvedor emboca con (${solutions[i]!.v.vx}, ${solutions[i]!.v.vy}) a ${(solutions[i]!.minDist / 4096).toFixed(2)} dm`).join(". ")}.
      </p>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
    </div>
  );
}
