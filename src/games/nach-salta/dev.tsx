"use client";

// Solo desarrollo: las cajas de choque y la curva del salto corto y del
// largo; cámara lenta ×0,25; saltos a 150, 400 y 800 m (el jugador
// automático justo juega hasta ahí); el jugador automático con demora
// configurable; y los sprites nuevos de The Nach de costado. Deja las reglas
// en window.__nachsalta para el E2E.
// /dev/juego/nach-salta?seed=…&cajas=1&lento=1&desde=300&auto=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { headphonesSprite, NACH_SIDE_POSES, nachSideSprite, rockSprite } from "../lib/nach";
import { NachSaltaGame, nachSalta, type NachSaltaDevOptions } from "./index";
import { botTrace, check, generateCourse, LONG, SHORT, simulate, tickAtDist, validate } from "./rules";
import { cartelSprite, palomaSprite, shoeSprite } from "./sprites";

const JUMPS = [0, 150, 300, 800] as const;

export function NachSaltaDev({ seed, from = 0, hitboxes = false, slow = false, auto = false }: { seed: string; from?: number; hitboxes?: boolean; slow?: boolean; auto?: boolean }) {
  const [opts, setOpts] = React.useState({ hitboxes, slow, auto, reaction: 15 });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<NachSaltaDevOptions>({});
  optsRef.current = { hitboxes: opts.hitboxes, slow: opts.slow, startTick: start > 0 ? tickAtDist(start * 1000) : 0, autoReaction: opts.auto ? opts.reaction : undefined };

  const game = React.useMemo<GameModule>(() => {
    function DevNachSalta(p: GameProps) {
      return <NachSaltaGame {...p} dev={optsRef.current} />;
    }
    return { ...nachSalta, Component: DevNachSalta };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __nachsalta: unknown }).__nachsalta = { botTrace, check, validate, simulate, generateCourse };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="nachsalta-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.hitboxes} onChange={(e) => setOpts((o) => ({ ...o, hitboxes: e.target.checked }))} data-testid="dev-hitboxes" />
          cajas y saltos
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
          automático, demora
          <input
            type="number"
            min={0}
            max={60}
            value={opts.reaction}
            onChange={(e) => setOpts((o) => ({ ...o, reaction: Math.max(0, Math.min(60, Number(e.target.value) || 0)) }))}
            className="input-sm w-14 px-1 py-0"
            aria-label="demora del jugador automático en ticks"
            data-testid="dev-reaction"
          />
          ticks
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
            {m === 0 ? "desde el arranque" : `desde ${m} m`}
          </button>
        ))}
      </div>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <p className="text-xs text-tinta-suave">
        salto corto: {SHORT.length} ticks en el aire, hasta {Math.max(...SHORT)} mm · salto largo: {LONG.length} ticks, hasta {Math.max(...LONG)} mm
      </p>
      <div className="flex flex-wrap items-end gap-4" data-testid="dev-sprites">
        {NACH_SIDE_POSES.map((pose) => (
          <div key={pose} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={nachSideSprite(pose)} height={pose === "duck" ? 48 : pose === "fall" ? 48 : 96} label={`The Nach de costado: ${pose}`} />
            <span className="text-[10px] text-tinta-suave">{pose}</span>
          </div>
        ))}
        <SpriteSvg sprite={headphonesSprite()} height={30} label="los auriculares" />
      </div>
      <div className="flex flex-wrap items-end gap-4" data-testid="dev-obstacles">
        <SpriteSvg sprite={rockSprite(1)} height={32} label="roca chica" />
        <SpriteSvg sprite={rockSprite(3)} height={56} label="roca grande" />
        <SpriteSvg sprite={cartelSprite()} height={28} label="cartel de neón" />
        <SpriteSvg sprite={shoeSprite()} height={20} label="zapatilla" />
        <SpriteSvg sprite={palomaSprite(0)} height={44} label="paloma, alas arriba" />
        <SpriteSvg sprite={palomaSprite(1)} height={44} label="paloma, alas abajo" />
      </div>
    </div>
  );
}
