"use client";

// Solo desarrollo: los ángulos de las cuchillas, el margen de choque y el
// rango de cada ingrediente; la velocidad de giro de las hormas 1 a 8 a lo
// largo del tiempo; cámara lenta ×0,25; saltos a la horma 1, 4, 5 y 8 (el
// jugador automático justo juega hasta ahí); y el jugador automático. Deja
// las reglas en window.__afila para el E2E.
// /dev/juego/big-bro-afila?seed=…&cajas=1&lento=1&auto=1&desde=5

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { bigBroSprite } from "../lib/big-bro";
import { AfilaGame, bigBroAfila, type AfilaDevOptions } from "./index";
import { BREAK_TICKS, botTrace, check, INGREDIENT_KINDS, initialState, LINES, MAX_SPEED, simulate, speedProfile, step, throwKnife, validate, wheelSpec } from "./rules";
import { ingredientSprite, knifeSprite } from "./sprites";

const JUMPS = [1, 4, 5, 8] as const;
const GRAPH_TICKS = 1200;

/** el tick en que empieza la horma n con el jugador automático justo */
function startOf(seed: string, n: number): number {
  if (n <= 1) return 0;
  return botTrace(seed, { stopAtWheel: n }).state.tick;
}

export function AfilaDev({ seed, from = 1, debug = false, slow = false, auto = false }: { seed: string; from?: number; debug?: boolean; slow?: boolean; auto?: boolean }) {
  const [opts, setOpts] = React.useState({ debug, slow, auto });
  const [wheel, setWheel] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<AfilaDevOptions>({});
  const startTick = React.useMemo(() => startOf(seed, wheel), [seed, wheel]);
  optsRef.current = { debug: opts.debug, slow: opts.slow, auto: opts.auto, startTick };
  const profiles = React.useMemo(() => Array.from({ length: 8 }, (_, i) => ({ n: i + 1, v: speedProfile(wheelSpec(seed, i + 1), GRAPH_TICKS) })), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevAfila(p: GameProps) {
      return <AfilaGame {...p} dev={optsRef.current} />;
    }
    return { ...bigBroAfila, Component: DevAfila };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __afila: unknown }).__afila = { botTrace, check, validate, simulate, initialState, step, throwKnife, wheelSpec };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="afila-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.debug} onChange={(e) => setOpts((o) => ({ ...o, debug: e.target.checked }))} data-testid="dev-debug" />
          ángulos
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        <label className="chip flex items-center gap-1">
          <input
            type="checkbox"
            checked={opts.auto}
            onChange={(e) => {
              setOpts((o) => ({ ...o, auto: e.target.checked }));
              setRun((r) => r + 1);
            }}
            data-testid="dev-auto"
          />
          automático
        </label>
        {JUMPS.map((n) => (
          <button
            key={n}
            type="button"
            className={n === wheel ? "btn-primary-sm" : "btn-secondary-sm"}
            onClick={() => {
              setWheel(n);
              setRun((r) => r + 1);
            }}
            data-testid={`dev-from-${n}`}
          >
            horma {n}
          </button>
        ))}
      </div>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      {/* la velocidad de giro de cada horma en sus primeros 20 s */}
      <div className="panel" data-testid="dev-speed">
        <p className="display-bold text-tinta">velocidad de giro (primeros 20 s de cada horma; arriba, un sentido; abajo, el otro)</p>
        {profiles.map(({ n, v }) => (
          <div key={n} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-tinta-suave">
              horma {n}
              {n === 5 ? " (grande)" : ""}
            </span>
            <svg viewBox={`0 0 ${GRAPH_TICKS} ${2 * MAX_SPEED}`} preserveAspectRatio="none" className="h-8 w-full rounded bg-superficie-2" role="img" aria-label={`velocidad de la horma ${n}`}>
              <line x1={0} x2={GRAPH_TICKS} y1={MAX_SPEED} y2={MAX_SPEED} stroke="#2a5c4b" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <polyline points={v.map((x, i) => `${i},${MAX_SPEED - x}`).join(" ")} fill="none" stroke="#ffd34e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        ))}
        <p className="text-xs text-tinta-suave">el cambio de horma dura {BREAK_TICKS} ticks; la línea del medio es velocidad 0.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3" data-testid="dev-art">
        <SpriteSvg sprite={knifeSprite()} height={80} label="la cuchilla" />
        {INGREDIENT_KINDS.map((kind) => (
          <div key={kind} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={ingredientSprite(kind)} height={42} label={kind} />
            <span className="text-[10px] text-tinta-suave">{kind}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4" data-testid="dev-faces">
        {(
          [
            ["espera", "entre tiros"],
            ["tira", "tirando"],
            ["contento", LINES.done],
            ["enojado", LINES.crash],
          ] as const
        ).map(([pose, text]) => (
          <div key={pose} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={bigBroSprite(pose)} height={64} label={`Big Bro ${text}`} />
            <span className="text-xs text-tinta-suave">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

