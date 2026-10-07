"use client";

// Solo desarrollo: la bolsita a través de los vasos, la lista de movimientos
// de cada ronda, cámara lenta ×0,25, saltos a la ronda 1, 6, 10 y 15 (el
// jugador automático acierta las anteriores) y las caras del jota. Deja las
// reglas en window.__bolsita para el E2E.
// /dev/juego/la-bolsita-del-jota?seed=…&cajas=1&lento=1&desde=10

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { jotaSprite, type JotaFace } from "../lib/jota";
import { BolsitaGame, laBolsitaDelJota, type BolsitaDevOptions } from "./index";
import { botTrace, check, finalPos, jotaShuffles, LINES, moveMs, shuffleMs, validate, type Move } from "./rules";

const JUMPS = [1, 6, 10, 15] as const;
const FACES: [JotaFace, string][] = [
  ["neutral", "mezclando"],
  ["concentrado", LINES.burst],
  ["impaciente", LINES.patience],
  ["contento", LINES.win],
  ["burlon", LINES.lose],
];

function describe(m: Move): string {
  switch (m.kind) {
    case "swap":
      return `intercambio ${m.a}↔${m.b} ${m.ms}`;
    case "fake":
      return `amague ${m.a}↔${m.b} ${m.ms}`;
    case "burst":
      return `ráfaga ${m.swaps.map(([a, b]) => `${a}↔${b}`).join(" ")} ${m.ms}×${m.swaps.length}`;
    case "jump":
      return `salto desde ${m.from} ${m.ms}`;
    case "pass":
      return `cambio de bolsita ${m.from}→${m.to} ${m.ms}`;
    case "rotate":
      return `rotación ${m.dir > 0 ? "→" : "←"} ${m.ms}`;
  }
}

export function BolsitaDev({ seed, from = 1, xray = false, slow = false }: { seed: string; from?: number; xray?: boolean; slow?: boolean }) {
  const [opts, setOpts] = React.useState({ xray, slow });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<BolsitaDevOptions>({});
  optsRef.current = { ...opts, startRound: start };
  const shuffles = React.useMemo(() => jotaShuffles(seed), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevBolsita(p: GameProps) {
      return <BolsitaGame {...p} dev={optsRef.current} />;
    }
    return { ...laBolsitaDelJota, Component: DevBolsita };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __bolsita: unknown }).__bolsita = { jotaShuffles, finalPos, botTrace, check, validate };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="bolsita-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.xray} onChange={(e) => setOpts((o) => ({ ...o, xray: e.target.checked }))} data-testid="dev-xray" />
          bolsita a la vista
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        {JUMPS.map((n) => (
          <button
            key={n}
            type="button"
            className={n === start ? "btn-primary-sm" : "btn-secondary-sm"}
            onClick={() => {
              setStart(n);
              setRun((r) => r + 1);
            }}
            data-testid={`dev-from-${n}`}
          >
            ronda {n}
          </button>
        ))}
      </div>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <details className="panel" data-testid="dev-moves">
        <summary className="display-bold cursor-pointer text-tinta">los movimientos de cada ronda</summary>
        <ol className="flex flex-col gap-1">
          {shuffles.map((s, i) => (
            <li key={i} className="text-xs text-tinta-suave" data-testid="dev-round">
              <span className="text-tinta-media">
                ronda {i + 1}: empieza en {s.start}, termina en {finalPos(s)}, {s.moves.length} movimientos, {(shuffleMs(s) / 1000).toFixed(1)} s
              </span>
              <br />
              {s.moves.map((m) => `${describe(m)} (${moveMs(m)})`).join(" · ")}
            </li>
          ))}
        </ol>
      </details>
      <div className="flex flex-wrap items-end gap-4" data-testid="dev-faces">
        {FACES.map(([face, text]) => (
          <div key={face} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={jotaSprite(face)} height={72} label={`el jota ${face}`} />
            <span className="text-xs text-tinta-suave">{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
