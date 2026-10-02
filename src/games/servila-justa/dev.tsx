"use client";

// Solo desarrollo: los perfiles de los seis vasos, el nivel, la espuma y la
// raya en números, cámara lenta, saltos a cualquier vaso, y el modo que
// muestra dónde termina la espuma si se suelta ahora (solo para calibrar).
// Deja las reglas en window.__servila para el E2E.
// /dev/juego/servila-justa?seed=…&datos=1&lento=1&desde=4&prediccion=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { ServilaGame, servilaJusta, type ServilaDevOptions } from "./index";
import { botTrace, check, generateGlasses, GLASSES, initialState, predictTop, simulate, step, validate } from "./rules";
import { glassDef, glassSprite, SHAPE_NAMES, SHAPES } from "./glasses";

export function ServilaDev({ seed, from = 0, debug = false, slow = false, predict = false }: { seed: string; from?: number; debug?: boolean; slow?: boolean; predict?: boolean }) {
  const [opts, setOpts] = React.useState({ debug, slow, predict });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<ServilaDevOptions>({});
  optsRef.current = { ...opts, startGlass: start };
  const glasses = React.useMemo(() => generateGlasses(seed), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevServila(p: GameProps) {
      return <ServilaGame {...p} dev={optsRef.current} />;
    }
    return { ...servilaJusta, Component: DevServila };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __servila: unknown }).__servila = { generateGlasses, simulate, botTrace, check, validate, initialState, step, predictTop };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="servila-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.debug} onChange={(e) => setOpts((o) => ({ ...o, debug: e.target.checked }))} data-testid="dev-debug" />
          nivel, espuma y raya
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.predict} onChange={(e) => setOpts((o) => ({ ...o, predict: e.target.checked }))} data-testid="dev-predict" />
          dónde termina la espuma
        </label>
        {Array.from({ length: GLASSES }, (_, i) => (
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
            vaso {i + 1}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3" data-testid="dev-profiles">
        {SHAPES.map((shape) => {
          const d = glassDef(shape);
          return (
            <div key={shape} className="flex flex-col items-center gap-1">
              <SpriteSvg sprite={glassSprite(shape)} height={66} label={SHAPE_NAMES[shape]} />
              <span className="text-[10px] text-tinta-suave">
                {shape}: {d.h} filas, {d.cap[d.h]} celdas, espuma ×{(d.foamFactor / 1000).toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-tinta-suave" data-testid="dev-glasses">
        esta partida: {glasses.map((g, i) => `${i + 1} ${g.shape} (whisky ${g.whiskyRows}, raya ${g.lineRow})`).join("; ")}.
      </p>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
    </div>
  );
}
