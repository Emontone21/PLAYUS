"use client";

// Solo desarrollo: las cajas de choque, el alcance de la lengua y las
// trayectorias que vienen; cámara lenta a ×0,25; saltos a los 20, 40 y 55 s;
// el jugador automático; y los sprites de la rana, la colilla y el vapeador.
// Deja las reglas en window.__rana para el E2E.
// /dev/juego/la-rana-caza-colillas?seed=…&cajas=1&lento=1&desde=40&auto=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { RanaGame, laRanaCazaColillas, toField, type RanaDevOptions } from "./index";
import { botTrace, check, difficultyAt, generateCourse, hasFreeMoment, initialState, lickBlocked, posAt, simulate, step, validate } from "./rules";
import { colillaSprite, frogSprite, vapoSprite } from "./sprites";

const JUMPS = [0, 20, 40, 55] as const;

export function RanaDev({ seed, from = 0, debug = false, slow = false, auto = false }: { seed: string; from?: number; debug?: boolean; slow?: boolean; auto?: boolean }) {
  const [opts, setOpts] = React.useState({ debug, slow, auto });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<RanaDevOptions>({});
  optsRef.current = { debug: opts.debug, slow: opts.slow, auto: opts.auto, startTick: start * 60 };
  const course = React.useMemo(() => generateCourse(seed), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevRana(p: GameProps) {
      return <RanaGame {...p} dev={optsRef.current} />;
    }
    return { ...laRanaCazaColillas, Component: DevRana };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __rana: unknown }).__rana = { botTrace, check, validate, simulate, initialState, step, generateCourse, posAt, lickBlocked, hasFreeMoment, difficultyAt, toField };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="rana-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.debug} onChange={(e) => setOpts((o) => ({ ...o, debug: e.target.checked }))} data-testid="dev-debug" />
          cajas, alcance y trayectorias
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
          jugador automático
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
      <p className="text-xs text-tinta-suave" data-testid="dev-course">
        {course.things.length} cosas en la partida: {course.things.filter((t) => t.kind === "colilla").length} colillas y {course.things.filter((t) => t.kind === "vapo").length} vapeadores ({course.things.filter((t) => t.escortOf !== null).length} escoltas).
      </p>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <div className="flex flex-wrap items-end gap-4" data-testid="dev-sprites">
        {(["cerrada", "abierta", "masticando"] as const).map((m) => (
          <div key={m} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={frogSprite(m)} height={60} label={`la rana con la boca ${m}`} />
            <span className="text-[10px] text-tinta-suave">{m}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1">
          <SpriteSvg sprite={frogSprite("abierta", { dark: true })} height={60} label="la rana tosiendo" />
          <span className="text-[10px] text-tinta-suave">tos</span>
        </div>
        {([0, 1] as const).map((f) => (
          <div key={f} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={colillaSprite(f)} height={30} label={`colilla con alitas, cuadro ${f + 1}`} />
            <span className="text-[10px] text-tinta-suave">colilla {f + 1}</span>
          </div>
        ))}
        {([0, 1] as const).map((f) => (
          <div key={f} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={vapoSprite(f)} height={36} label={`vapeador con alitas, cuadro ${f + 1}`} />
            <span className="text-[10px] text-tinta-suave">vapo {f + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
