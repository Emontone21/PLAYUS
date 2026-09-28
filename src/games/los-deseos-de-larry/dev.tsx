"use client";

// Solo desarrollo: la partida con cajas de colisión, cámara lenta y saltos al
// cronograma (el jugador perfecto juega hasta ahí). También deja las reglas en
// window.__larry, para que el E2E compare la simulación del navegador con la
// de Node. /dev/juego/los-deseos-de-larry?seed=…&desde=60&cajas=1&lento=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { LarryGame, losDeseosDeLarry, type LarryDevOptions } from "./index";
import { check, generateRain, greedyTrace, simulate, TICKS_PER_S, validate } from "./rules";

const JUMPS = [0, 30, 60, 80] as const;

export function LarryDev({ seed, from = 0, hitboxes = false, slow = false }: { seed: string; from?: number; hitboxes?: boolean; slow?: boolean }) {
  const [opts, setOpts] = React.useState({ hitboxes, slow });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<LarryDevOptions>({});
  optsRef.current = { ...opts, startTick: start * TICKS_PER_S };

  // un componente estable que lee las opciones vigentes en cada render
  const game = React.useMemo<GameModule>(() => {
    function DevLarry(p: GameProps) {
      return <LarryGame {...p} dev={optsRef.current} />;
    }
    return { ...losDeseosDeLarry, Component: DevLarry };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __larry: unknown }).__larry = { generateRain, simulate, greedyTrace, check, validate };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="larry-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.hitboxes} onChange={(e) => setOpts((o) => ({ ...o, hitboxes: e.target.checked }))} data-testid="dev-hitboxes" />
          cajas
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
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
      <GameContainer
        key={run}
        game={game}
        seed={seed}
        autoStart={run > 0}
        onDone={() => setRun((r) => r + 1)}
        note="modo desarrollo: no consume intentos ni guarda nada."
      />
    </div>
  );
}
