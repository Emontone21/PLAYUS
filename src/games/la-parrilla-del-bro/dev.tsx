"use client";

// Solo desarrollo: la barra de tiempo con el cronograma pintado por estado,
// cámara lenta, saltos a los 10, 45 y 80 s, y cada estado del canario por
// separado para revisar el arte. Deja las reglas en window.__parrilla para
// el E2E. /dev/juego/la-parrilla-del-bro?seed=…&desde=45&lento=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { ParrillaGame, laParrillaDelBro, type ParrillaDevOptions } from "./index";
import { check, safeTrace, validate } from "./rules";
import { drawState } from "./draw";
import { CANARIO_STATES, FIELD_H, FIELD_W, type CanarioLook } from "./sprites";
import { canarioTimeline, DURATION_MS, type CanarioState } from "./timeline";

const JUMPS = [0, 10, 45, 80] as const;
const COLORS: Record<CanarioState, string> = {
  espaldas: "#4CAF50",
  aviso: "#FFC107",
  amague: "#FF9800",
  girando: "#F44336",
  mirando: "#B71C1C",
  volviendo: "#E57373",
};

export function ParrillaDev({ seed, from = 0, slow = false }: { seed: string; from?: number; slow?: boolean }) {
  const [opts, setOpts] = React.useState({ slow });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<ParrillaDevOptions>({});
  optsRef.current = { ...opts, startMs: start * 1000 };
  const timeline = React.useMemo(() => canarioTimeline(seed), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevParrilla(p: GameProps) {
      return <ParrillaGame {...p} dev={optsRef.current} />;
    }
    return { ...laParrillaDelBro, Component: DevParrilla };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __parrilla: unknown }).__parrilla = { canarioTimeline, check, validate, safeTrace };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="parrilla-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
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
      {/* la barra de tiempo: 90 s, un tramo por segmento */}
      <div className="flex h-4 w-full overflow-hidden rounded" data-testid="dev-timeline" aria-label="cronograma del canario" role="img">
        {timeline.map((s) => (
          <div key={s.start} title={`${s.state} ${s.start}–${s.end} ms`} style={{ width: `${((s.end - s.start) / DURATION_MS) * 100}%`, background: COLORS[s.state] }} data-state={s.state} />
        ))}
      </div>
      <p className="text-xs text-tinta-suave">verde: espaldas · amarillo: aviso · naranja: amague · rojos: girando, mirando y volviendo</p>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <StateGallery />
    </div>
  );
}

/** cada estado del canario en la escena, para revisar el arte */
function StateGallery() {
  return (
    <div className="flex flex-col gap-2" data-testid="dev-states">
      <h2 className="display text-lg">los estados del canario</h2>
      <div className="grid grid-cols-2 gap-2">
        {CANARIO_STATES.map((look) => (
          <StateCanvas key={look} look={look} />
        ))}
      </div>
    </div>
  );
}

function StateCanvas({ look }: { look: CanarioLook }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const k = 2;
    c.width = FIELD_W * k;
    c.height = FIELD_H * k;
    c.style.width = `${FIELD_W * k}px`;
    c.style.height = `${FIELD_H * k}px`;
    const ctx = c.getContext("2d");
    if (ctx) drawState(ctx, look, k);
  }, [look]);
  return (
    <figure className="flex flex-col items-center gap-1">
      <canvas ref={ref} className="max-w-full [image-rendering:pixelated]" style={{ border: "2px solid var(--contorno)", borderRadius: 6 }} data-testid={`dev-state-${look}`} />
      <figcaption className="text-xs text-tinta-suave">{look}</figcaption>
    </figure>
  );
}
