"use client";

// Solo desarrollo: la partida con cajas de choque y camino seguro, cámara
// lenta, saltos a los 200, 500 y 1.000 m (el bot del camino seguro rema hasta
// ahí tomando todas las botellas) y ×2 forzado. También deja las reglas en window.__remar, para que el
// E2E compare la simulación del navegador con la de Node.
// /dev/juego/remar-vuelve-a-casa?seed=…&desde=500&cajas=1&lento=1&x2=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { RemarGame, remarVuelveACasa, type RemarDevOptions } from "./index";
import { check, drunkTrace, generateCourse, simulate, soberTrace, validate } from "./rules";

const JUMPS = [0, 200, 500, 1000] as const;

export function RemarDev({ seed, from = 0, hitboxes = false, slow = false, x2 = false }: { seed: string; from?: number; hitboxes?: boolean; slow?: boolean; x2?: boolean }) {
  const [opts, setOpts] = React.useState({ hitboxes, slow, x2 });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<RemarDevOptions>({});
  optsRef.current = { ...opts, startMeters: start };

  // un componente estable que lee las opciones vigentes en cada render
  const game = React.useMemo<GameModule>(() => {
    function DevRemar(p: GameProps) {
      return <RemarGame {...p} dev={optsRef.current} />;
    }
    return { ...remarVuelveACasa, Component: DevRemar };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __remar: unknown }).__remar = { generateCourse, simulate, soberTrace, drunkTrace, check, validate };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="remar-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.hitboxes} onChange={(e) => setOpts((o) => ({ ...o, hitboxes: e.target.checked }))} data-testid="dev-hitboxes" />
          cajas y camino
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        <label className="chip flex items-center gap-1">
          <input
            type="checkbox"
            checked={opts.x2}
            onChange={(e) => {
              setOpts((o) => ({ ...o, x2: e.target.checked }));
              setRun((r) => r + 1);
            }}
            data-testid="dev-x2"
          />
          ×2
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
