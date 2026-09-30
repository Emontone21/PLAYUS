"use client";

// Solo desarrollo: coordenadas de la grilla, cámara lenta, la cuenta regresiva
// de la próxima oleada, saltos a los 30, 60 y 120 s (el bot juega hasta ahí,
// o hasta donde llegue) y la Red Bull forzada. Deja las reglas en
// window.__rastas para el E2E. /dev/juego/rastitas-rastotas?seed=…&desde=60&coords=1&lento=1&redbull=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { RastasGame, rastitasRastotas, type RastasDevOptions } from "./index";
import { cellOf, check, FIELD_H, FIELD_W, greedyTrace, initialState, rngFor, simulate, TICKS_PER_S, validate, WAVE_EVERY, WAVE_FROM_TICK, type SimState } from "./rules";
import { drawScene, scaleFor } from "./draw";
import { sizeCanvas } from "../lib/canvas-scale";

/** un estado armado a mano: rastas largas con curvas en las cuatro direcciones, para revisar el dibujo */
export function vistaState(boost: boolean, pari: boolean): SimState {
  const s = initialState(rngFor("vista"));
  const walk: [number, number][] = [[1, 3]];
  const go = (dx: number, dy: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const [x, y] = walk[walk.length - 1]!;
      walk.push([x + dx, y + dy]);
    }
  };
  go(1, 0, 8); // derecha
  go(0, 1, 6); // abajo
  go(-1, 0, 6); // izquierda
  go(0, -1, 3); // arriba
  go(1, 0, 3); // derecha
  go(0, 1, 2); // abajo: la cabeza termina bajando
  const body = walk.reverse().map(([x, y]) => cellOf(x, y));
  const tick = 1000;
  Object.assign(s, { tick, body, prevBody: [...body], dir: "down" as const, lastMove: tick - 9, nextMove: tick, cig: cellOf(12, 15), redbull: null, boostUntil: boost ? tick + 290 : 0, lastEat: pari ? tick - 10 : -1 });
  s.warned.clear();
  s.blocked.clear();
  return s;
}

function VistaRastas() {
  const box = React.useRef<HTMLDivElement>(null);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const [boost, setBoost] = React.useState(false);
  const [pari, setPari] = React.useState(true);
  React.useEffect(() => {
    const el = canvas.current;
    const wrap = box.current;
    if (!el || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const k = scaleFor(Math.min(wrap.clientWidth, 360), 504, dpr);
    sizeCanvas(el, FIELD_W, FIELD_H, k, dpr);
    drawScene(el.getContext("2d")!, vistaState(boost, pari), k, { alpha: 1, reduced: false });
  }, [boost, pari]);
  return (
    <div className="flex flex-col gap-2" data-testid="rastas-vista">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-tinta-suave">vista de rastas (curvas en las cuatro direcciones):</span>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={boost} onChange={(e) => setBoost(e.target.checked)} data-testid="dev-vista-boost" />
          con Red Bull
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={pari} onChange={(e) => setPari(e.target.checked)} data-testid="dev-vista-pari" />
          ¡PARI!
        </label>
      </div>
      <div ref={box} className="w-full">
        <canvas ref={canvas} className="[image-rendering:pixelated]" style={{ border: "3px solid var(--contorno)", borderRadius: 8 }} aria-label="rastas largas de muestra" role="img" />
      </div>
    </div>
  );
}

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
      <VistaRastas />
    </div>
  );
}
