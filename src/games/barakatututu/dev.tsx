"use client";

// Solo desarrollo: la biblioteca de frases, el patrón de cada ronda escrito
// en semicorcheas, las ventanas de cada golpe sobre la regla, cámara lenta a
// ×0,5 (el tempo se escala igual), saltos a la ronda 1, 6, 9 y 13 (el
// jugador automático pasa las anteriores) y las caras de El negro toto. Deja
// las reglas en window.__baraka para el E2E.
// /dev/juego/barakatututu?seed=…&cajas=1&lento=1&desde=9

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { BarakaGame, barakatututu, LINES, type BarakaDevOptions } from "./index";
import { advance, botTrace, candombeRounds, check, correctionFrom, expectedAt, LIBRARY, newRun, phaseMs, roundAt, STEPS, tap, validate, WINDOW_MS } from "./rules";
import { totoDrumSprite, totoSprite, type TotoFace } from "./sprites";

const JUMPS = [1, 6, 9, 13] as const;
const FACES: [TotoFace, string][] = [
  ["contento", LINES.hola],
  ["eso", LINES.eso],
  ["enojado", LINES.error],
];

/** un compás escrito en semicorcheas: x donde hay golpe, . donde no, con una barra cada pulso */
export function notate(hits: readonly number[], bars: number): string {
  const out: string[] = [];
  for (let s = 0; s < bars * STEPS; s++) {
    if (s % 4 === 0 && s > 0) out.push(s % STEPS === 0 ? " | " : " ");
    out.push(hits.includes(s) ? "x" : ".");
  }
  return out.join("");
}

export function BarakaDev({ seed, from = 1, windows = false, slow = false }: { seed: string; from?: number; windows?: boolean; slow?: boolean }) {
  const [opts, setOpts] = React.useState({ windows, slow });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<BarakaDevOptions>({});
  optsRef.current = { windows: opts.windows, slow: opts.slow, firstRound: start };
  const rounds = React.useMemo(() => candombeRounds(seed, 20), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevBaraka(p: GameProps) {
      return <BarakaGame {...p} dev={optsRef.current} />;
    }
    return { ...barakatututu, Component: DevBaraka };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __baraka: unknown }).__baraka = { candombeRounds, roundAt, check, validate, botTrace, newRun, advance, tap, expectedAt, phaseMs, correctionFrom, WINDOW_MS, LIBRARY };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="baraka-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.windows} onChange={(e) => setOpts((o) => ({ ...o, windows: e.target.checked }))} data-testid="dev-windows" />
          ventanas
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,5
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
            ronda {r}
          </button>
        ))}
      </div>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((x) => x + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <table className="text-xs text-tinta-media" data-testid="dev-rounds">
        <thead>
          <tr className="text-left text-tinta-suave">
            <th>ronda</th>
            <th>bpm</th>
            <th>golpes</th>
            <th>patrón (semicorcheas)</th>
            <th>frases</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => (
            <tr key={r.index} className={r.index === start ? "text-tinta" : undefined}>
              <td>{r.index}</td>
              <td>{r.bpm}</td>
              <td>{r.hits.length}</td>
              <td style={{ fontFamily: "monospace", whiteSpace: "pre" }}>{notate(r.hits, r.bars)}</td>
              <td>{r.phrases.join(" + ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col gap-1" data-testid="dev-library">
        <p className="text-xs text-tinta-suave">la biblioteca: simplificaciones inspiradas en los toques del candombe, no transcripciones.</p>
        <table className="text-xs text-tinta-media">
          <tbody>
            {LIBRARY.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td style={{ fontFamily: "monospace", whiteSpace: "pre" }}>{notate(p.hits, 1)}</td>
                <td>{p.figure}</td>
                <td>{p.about}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end gap-4" data-testid="dev-sprites">
        {FACES.map(([face, line]) => (
          <div key={face} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={totoSprite(face)} height={72} label={`El negro toto ${face}`} />
            <span className="text-[10px] text-tinta-suave">{line}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1">
          <SpriteSvg sprite={totoDrumSprite()} height={44} label="el tambor" />
          <span className="text-[10px] text-tinta-suave">el tambor</span>
        </div>
      </div>
    </div>
  );
}
