"use client";

// Solo desarrollo: posición, velocidad y límites de la zona sobre el canvas,
// cámara lenta, saltos a los 15, 30 y 50 s, y las tres caras de Remar.
// Deja las reglas en window.__mayo para el E2E.
// /dev/juego/la-mayo?seed=…&datos=1&lento=1&desde=30

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { MayoGame, laMayo, type MayoDevOptions } from "./index";
import { botTrace, check, initialState, simulate, step, TICKS_PER_S, validate } from "./rules";
import { remarAtTable, type Face } from "./sprites";

const JUMPS = [0, 15, 30, 50] as const;
const FACES: [Face, string][] = [
  ["espera", "esperando"],
  ["contento", "contento"],
  ["enojado", "enojado"],
];

export function MayoDev({ seed, from = 0, debug = false, slow = false }: { seed: string; from?: number; debug?: boolean; slow?: boolean }) {
  const [opts, setOpts] = React.useState({ debug, slow });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<MayoDevOptions>({});
  optsRef.current = { ...opts, startTick: start * TICKS_PER_S };

  const game = React.useMemo<GameModule>(() => {
    function DevMayo(p: GameProps) {
      return <MayoGame {...p} dev={optsRef.current} />;
    }
    return { ...laMayo, Component: DevMayo };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __mayo: unknown }).__mayo = { simulate, botTrace, check, validate, initialState, step };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="mayo-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.debug} onChange={(e) => setOpts((o) => ({ ...o, debug: e.target.checked }))} data-testid="dev-debug" />
          posición, velocidad y zona
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
      <div className="flex items-end gap-4" data-testid="dev-faces">
        {FACES.map(([face, text]) => (
          <div key={face} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={remarAtTable(face, face === "contento" ? "justo" : face === "enojado" ? "mucha" : "nada")} height={72} label={`Remar ${text}`} />
            <span className="text-xs text-tinta-suave">{text}</span>
          </div>
        ))}
      </div>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
    </div>
  );
}
