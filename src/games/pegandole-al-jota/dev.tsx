"use client";

// Solo desarrollo: la serie completa con sus respuestas, saltos a la ronda
// 1, 7 y 13, las cuatro caras del jota y la grilla de sustancias. Deja las
// reglas en window.__jota para el E2E. /dev/juego/pegandole-al-jota?seed=…&desde=7

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { JotaGame, pegandoleAlJota, type JotaDevOptions } from "./index";
import { formatNumber, jotaRounds, SUBSTANCES, substanceName } from "./rounds";
import { check, playedTrace, validate } from "./rules";
import { JOTA_FACES, jotaSprite, substanceSprite } from "./sprites";

const JUMPS = [1, 7, 13] as const;

export function JotaDev({ seed, from = 1 }: { seed: string; from?: number }) {
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const [showSeries, setShowSeries] = React.useState(false);
  const optsRef = React.useRef<JotaDevOptions>({});
  optsRef.current = { startRound: start };
  const series = React.useMemo(() => jotaRounds(seed), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevJota(p: GameProps) {
      return <JotaGame {...p} dev={optsRef.current} />;
    }
    return { ...pegandoleAlJota, Component: DevJota };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __jota: unknown }).__jota = { jotaRounds, check, validate, playedTrace };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="jota-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        {JUMPS.map((r) => (
          <button
            key={r}
            type="button"
            className={r === start ? "btn-primary-sm" : "btn-secondary-sm"}
            onClick={() => {
              setStart(r);
              setRun((n) => n + 1);
            }}
            data-testid={`dev-from-${r}`}
          >
            ronda {r}
          </button>
        ))}
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={showSeries} onChange={(e) => setShowSeries(e.target.checked)} data-testid="dev-series" />
          la serie
        </label>
      </div>
      {showSeries ? (
        <ol className="grid grid-cols-2 gap-x-4 text-xs text-tinta-media" data-testid="dev-series-list">
          {series.map((r) => (
            <li key={r.round} data-round={r.round}>
              {r.round}. <span className="text-tinta" style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(r.number)}</span> de {substanceName(r.substance)} · {r.displayMs} ms
            </li>
          ))}
        </ol>
      ) : null}
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((n) => n + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <div className="flex flex-col gap-2" data-testid="dev-faces">
        <h2 className="display text-lg">las caras del jota</h2>
        <div className="flex flex-wrap gap-4">
          {JOTA_FACES.map((f) => (
            <figure key={f} className="flex flex-col items-center gap-1">
              <SpriteSvg sprite={jotaSprite(f)} height={110} label={`el jota ${f}`} />
              <figcaption className="text-xs text-tinta-suave">{f}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2" data-testid="dev-substances">
        <h2 className="display text-lg">las sustancias</h2>
        <div className="grid grid-cols-5 gap-3">
          {SUBSTANCES.map((s) => (
            <figure key={s.id} className="flex flex-col items-center gap-1">
              <SpriteSvg sprite={substanceSprite(s.id)} height={60} label={s.name} />
              <figcaption className="text-xs text-tinta-suave">{s.name}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
