"use client";

// Solo desarrollo: coordenadas de la grilla, cámara lenta, la cuenta regresiva
// de la próxima oleada, saltos a los 30, 60 y 120 s (el bot juega hasta ahí,
// o hasta donde llegue) y la Red Bull forzada. Deja las reglas en
// window.__rastas para el E2E. /dev/juego/rastitas-rastotas?seed=…&desde=60&coords=1&lento=1&redbull=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { RastasGame, rastitasRastotas, type RastasDevOptions } from "./index";
import { check, greedyTrace, simulate, TICKS_PER_S, validate, WAVE_EVERY, WAVE_FROM_TICK } from "./rules";

const JUMPS = [0, 30, 60, 120] as const;

export function RastasDev({ seed, from = 0, coords = false, slow = false, redbull = false }: { seed: string; from?: number; coords?: boolean; slow?: boolean; redbull?: boolean }) {
  const [opts, setOpts] = React.useState({ coords, slow, forceRedbull: redbull });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<RastasDevOptions>({});
  optsRef.current = { ...opts, startTick: start * TICKS_PER_S };

  const game = React.useMemo<GameModule>(() => {
    function DevRastas(p: GameProps) {
      return <RastasGame {...p} dev={optsRef.current} />;
    }
    return { ...rastitasRastotas, Component: DevRastas };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __rastas: unknown }).__rastas = { simulate, greedyTrace, check, validate };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="rastas-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.coords} onChange={(e) => setOpts((o) => ({ ...o, coords: e.target.checked }))} data-testid="dev-coords" />
          coordenadas
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        <label className="chip flex items-center gap-1">
          <input
            type="checkbox"
            checked={opts.forceRedbull}
            onChange={(e) => {
              setOpts((o) => ({ ...o, forceRedbull: e.target.checked }));
              setRun((r) => r + 1);
            }}
            data-testid="dev-redbull"
          />
          Red Bull ya
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
      <p className="text-xs text-tinta-suave">
        las oleadas de piojos empiezan a los {WAVE_FROM_TICK / TICKS_PER_S} s y vienen cada {WAVE_EVERY / TICKS_PER_S} s más o menos; los casilleros marcados titilan 1,5 s antes de bloquearse. Los saltos usan el bot codicioso: si choca antes, la partida arranca de cero.
      </p>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
    </div>
  );
}
