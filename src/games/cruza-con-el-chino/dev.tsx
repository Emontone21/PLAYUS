"use client";

// Solo desarrollo: la grilla y las cajas de choque, el camino seguro que
// encuentra el buscador desde donde está la rana, cámara lenta a ×0,25,
// saltos a los carriles 10, 30 y 60, y los sprites de la rana con El chino y
// de los vehículos. Deja las reglas en window.__cruza para el E2E.
// /dev/juego/cruza-con-el-chino?seed=…&cajas=1&camino=1&lento=1&desde=30

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { CruzaGame, cruzaConElChino, gestureDir, type CruzaDevOptions } from "./index";
import { botTrace, check, createCourse, difficultyAt, initialState, nextSidewalk, occupancyMask, simulate, solveBlock, solveFrom, step, validate } from "./rules";
import { chinoSeatedSprite, frogBackSprite, riderSprite, semaphoreSprite, trainSprite, vehicleSprite } from "./sprites";

const JUMPS = [0, 10, 30, 60] as const;

export function CruzaDev({ seed, from = 0, hitboxes = false, path = false, slow = false }: { seed: string; from?: number; hitboxes?: boolean; path?: boolean; slow?: boolean }) {
  const [opts, setOpts] = React.useState({ hitboxes, path, slow });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<CruzaDevOptions>({});
  optsRef.current = { ...opts, startRow: start };
  const game = React.useMemo<GameModule>(() => {
    function DevCruza(p: GameProps) {
      return <CruzaGame {...p} dev={optsRef.current} />;
    }
    return { ...cruzaConElChino, Component: DevCruza };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __cruza: unknown }).__cruza = { botTrace, check, validate, simulate, initialState, step, createCourse, solveBlock, solveFrom, nextSidewalk, occupancyMask, difficultyAt, gestureDir };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="cruza-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.hitboxes} onChange={(e) => setOpts((o) => ({ ...o, hitboxes: e.target.checked }))} data-testid="dev-hitboxes" />
          grilla y cajas
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.path} onChange={(e) => setOpts((o) => ({ ...o, path: e.target.checked }))} data-testid="dev-path" />
          camino seguro
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        {JUMPS.map((r) => (
          <button
            key={r}
            type="button"
            className={r === start ? "btn-primary-sm" : "btn-secondary-sm"}
            onClick={() => {
              setStart(r);
              setRun((x) => x + 1);
            }}
            data-testid={`dev-from-${r}`}
          >
            carril {r}
          </button>
        ))}
      </div>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((x) => x + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <div className="flex flex-wrap items-end gap-3" data-testid="dev-sprites">
        {(["quieta", "estirada", "achatada", "panqueque"] as const).map((pose) => (
          <div key={pose} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={pose === "panqueque" ? frogBackSprite(pose) : riderSprite(pose)} height={56} label={`la rana con El chino, ${pose}`} />
            <span className="text-[10px] text-tinta-suave">{pose}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1">
          <SpriteSvg sprite={chinoSeatedSprite()} height={56} label="El chino sentado en el piso" />
          <span className="text-[10px] text-tinta-suave">de a pie</span>
        </div>
        {(
          [
            ["moto", 1, 0],
            ["moto", 1, 1],
            ["auto", 2, 0],
            ["auto", 2, 1],
            ["auto", 2, 2],
            ["colectivo", 3, 0],
            ["colectivo", 4, 1],
          ] as const
        ).map(([kind, len, look]) => (
          <div key={`${kind}-${len}-${look}`} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={vehicleSprite({ kind, len, look }, 1)} height={kind === "moto" ? 30 : 36} label={`${kind} ${look === 2 ? "(el sunny)" : look}`} />
            <span className="text-[10px] text-tinta-suave">{kind === "auto" && look === 2 ? "el sunny" : kind}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1">
          <SpriteSvg sprite={trainSprite()} height={30} label="el tren" />
          <span className="text-[10px] text-tinta-suave">tren</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <SpriteSvg sprite={semaphoreSprite(true)} height={36} label="el semáforo de la vía" />
          <span className="text-[10px] text-tinta-suave">semáforo</span>
        </div>
      </div>
    </div>
  );
}
