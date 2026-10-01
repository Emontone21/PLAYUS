"use client";

// Solo desarrollo: las formas de choque, el estado de reposo de cada cuerpo,
// cámara lenta y el modo libre (lo que se cae se saca y la partida sigue).
// Deja las reglas en window.__torre para el E2E de determinismo.
// /dev/juego/apila-las-boludeces?seed=…&cajas=1&reposo=1&lento=1&libre=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { TorreGame, apilaLasBoludeces, type TorreDevOptions } from "./index";
import { autoTrace, check, generatePlan, simulate, swayX, validate } from "./rules";
import { loadRapier } from "./physics";
import { KINDS, shapeArea, siluetteArea } from "./objects";

export function TorreDev({ seed, colliders = false, rest = false, slow = false, free = false }: { seed: string; colliders?: boolean; rest?: boolean; slow?: boolean; free?: boolean }) {
  const [opts, setOpts] = React.useState<TorreDevOptions>({ colliders, rest, slow, free });
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<TorreDevOptions>({});
  optsRef.current = opts;
  const plan = React.useMemo(() => generatePlan(seed), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevTorre(p: GameProps) {
      return <TorreGame {...p} dev={optsRef.current} />;
    }
    return { ...apilaLasBoludeces, Component: DevTorre };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __torre: unknown }).__torre = { generatePlan, simulate, autoTrace, check, validate, swayX, loadRapier };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="torre-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={!!opts.colliders} onChange={(e) => setOpts((o) => ({ ...o, colliders: e.target.checked }))} data-testid="dev-colliders" />
          formas de choque
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={!!opts.rest} onChange={(e) => setOpts((o) => ({ ...o, rest: e.target.checked }))} data-testid="dev-rest" />
          reposo por cuerpo
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={!!opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        <label className="chip flex items-center gap-1">
          <input
            type="checkbox"
            checked={!!opts.free}
            onChange={(e) => {
              setOpts((o) => ({ ...o, free: e.target.checked }));
              setRun((r) => r + 1);
            }}
            data-testid="dev-free"
          />
          modo libre
        </label>
      </div>
      <p className="text-xs text-tinta-suave" data-testid="dev-plan">
        secuencia: {plan.kinds.slice(0, 16).join(", ")}… · áreas forma/silueta: {KINDS.map((k) => `${k} ${shapeArea(k)}/${siluetteArea(k)}`).join(", ")} · reposo: verde dormido, amarillo quieto, rojo en movimiento.
      </p>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
    </div>
  );
}
