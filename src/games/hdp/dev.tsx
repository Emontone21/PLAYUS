"use client";

// Solo desarrollo: la barra de tiempo con el estado de cada lugar (sin tocar
// nada), los cuadrantes de toque, cámara lenta, saltos a los 20, 40 y 55 s,
// y cada estado de la hamburguesa, las flechas y las caras de Big Bro. Deja
// las reglas en window.__hdp para el E2E.
// /dev/juego/hdp?seed=…&cajas=1&lento=1&desde=40

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { HdpGame, hdp, slotAt, swipeDir, type HdpDevOptions } from "./index";
import { botTrace, broLine, check, difficultyAt, DIRS, END_TICK, idleTimeline, initialState, simulate, step, validate, type Phase } from "./rules";
import { arrowSprite, broSprite, PATTY_LOOKS, pattySprite } from "./sprites";

const JUMPS = [0, 20, 40, 55] as const;
const COLORS: Record<Phase, string> = { cooking: "#8C9096", ready: "#FFD34E", burnt: "#FF6F91", serving: "#6FD3E0" };
const MOODS = [
  ["espera", "esperando"],
  ["contento", "eso, así se labura"],
  ["grita", "¡¡LA VUELTAAA!!"],
  ["enojado", "¿me estás jodiendo?"],
] as const;

export function HdpDev({ seed, from = 0, quadrants = false, slow = false }: { seed: string; from?: number; quadrants?: boolean; slow?: boolean }) {
  const [opts, setOpts] = React.useState({ quadrants, slow });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<HdpDevOptions>({});
  optsRef.current = { ...opts, startTick: start * 60 };
  const timeline = React.useMemo(() => idleTimeline(seed), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevHdp(p: GameProps) {
      return <HdpGame {...p} dev={optsRef.current} />;
    }
    return { ...hdp, Component: DevHdp };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __hdp: unknown }).__hdp = { botTrace, broLine, check, validate, simulate, initialState, step, idleTimeline, difficultyAt, slotAt, swipeDir };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="hdp-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.quadrants} onChange={(e) => setOpts((o) => ({ ...o, quadrants: e.target.checked }))} data-testid="dev-quadrants" />
          cuadrantes
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
      {/* la barra de tiempo: 60 s, un renglón por lugar, sin tocar nada (todo se quema) */}
      <div className="flex flex-col gap-1" data-testid="dev-timeline" role="img" aria-label="el cronograma de cada lugar sin tocar nada">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex h-3 w-full overflow-hidden rounded">
            {timeline
              .filter((x) => x.slot === i)
              .map((x) => (
                <div key={x.start} title={`${x.phase} ${x.start}–${x.end}`} style={{ width: `${((x.end - x.start) / END_TICK) * 100}%`, background: COLORS[x.phase] }} data-phase={x.phase} />
              ))}
          </div>
        ))}
      </div>
      <p className="text-xs text-tinta-suave">gris: cocinándose · amarillo: a punto (la flecha) · rosa: quemada · celeste: servida. sin tocar nada, todas se queman.</p>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <div className="flex flex-wrap items-end gap-3" data-testid="dev-states">
        {PATTY_LOOKS.map((look) => (
          <div key={look} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={pattySprite(look)} height={36} label={`hamburguesa ${look}`} />
            <span className="text-[10px] text-tinta-suave">{look}</span>
          </div>
        ))}
        {DIRS.map((d) => (
          <div key={d} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={arrowSprite(d)} height={36} label={`flecha ${d}`} />
            <span className="text-[10px] text-tinta-suave">{d}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4" data-testid="dev-faces">
        {MOODS.map(([mood, text]) => (
          <div key={mood} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={broSprite(mood)} height={72} label={`Big Bro ${text}`} />
            <span className="text-xs text-tinta-suave">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
