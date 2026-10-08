"use client";

// Solo desarrollo: la solución sobre la grilla, las métricas de cada puzzle
// (grilla, largo, curvas, vueltas necesarias y tiempo), saltar a cualquier
// puzzle, cámara lenta, la distribución de dificultad en 50 semillas seguidas
// y las caras del pibe. Deja las reglas en window.__trago para el E2E.
// /dev/juego/dale-un-trago-al-pibe?seed=…&solucion=1&lento=1&desde=7

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { TragoGame, daleUnTragoAlPibe, type TragoDevOptions } from "./index";
import { advance, botTrace, check, MODEL, neededTurns, newRun, pipePuzzles, pour, puzzleAt, rotate, rowFor, validate, type Puzzle } from "./rules";
import { damajuanaSprite, rastaSprite, type RastaPose } from "./sprites";

const POSES: [RastaPose, string][] = [
  ["espera", "esperando"],
  ["toma", "tomando"],
  ["salud", "¡salud!"],
  ["triste", "empapado"],
];

function Distribution({ seed }: { seed: string }) {
  const [rows, setRows] = React.useState<{ index: number; mean: number; sd: number; min: number; max: number }[] | null>(null);
  const compute = () => {
    const by = new Map<number, number[]>();
    for (let i = 0; i < 50; i++) for (const p of pipePuzzles(`${seed}-${i}`, 12)) by.set(p.index, [...(by.get(p.index) ?? []), p.metrics.needed]);
    setRows(
      [...by.entries()].map(([index, xs]) => {
        const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
        const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
        return { index, mean, sd, min: Math.min(...xs), max: Math.max(...xs) };
      }),
    );
  };
  return (
    <div className="flex flex-col gap-2" data-testid="dev-distribution">
      <button type="button" className="btn-secondary-sm self-start" onClick={compute} data-testid="dev-distribution-run">
        dificultad en 50 semillas (puzzles 1 a 12)
      </button>
      {rows ? (
        <table className="text-xs text-tinta-media">
          <thead>
            <tr className="text-left text-tinta-suave">
              <th>puzzle</th>
              <th>vueltas (media)</th>
              <th>desvío</th>
              <th>mín–máx</th>
              <th>rango de la tabla</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.index}>
                <td>{r.index}</td>
                <td>{r.mean.toFixed(2)}</td>
                <td>{r.sd.toFixed(2)}</td>
                <td>
                  {r.min}–{r.max}
                </td>
                <td>
                  {rowFor(r.index).needed[0]}–{rowFor(r.index).needed[1]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export function TragoDev({ seed, from = 1, solution = false, slow = false }: { seed: string; from?: number; solution?: boolean; slow?: boolean }) {
  const [opts, setOpts] = React.useState({ solution, slow });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<TragoDevOptions>({});
  optsRef.current = { solution: opts.solution, slow: opts.slow, firstPuzzle: start };
  const puzzles = React.useMemo<Puzzle[]>(() => pipePuzzles(seed), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevTrago(p: GameProps) {
      return <TragoGame {...p} dev={optsRef.current} />;
    }
    return { ...daleUnTragoAlPibe, Component: DevTrago };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __trago: unknown }).__trago = { pipePuzzles, puzzleAt, neededTurns, check, validate, botTrace, newRun, advance, rotate, pour, MODEL };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="trago-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.solution} onChange={(e) => setOpts((o) => ({ ...o, solution: e.target.checked }))} data-testid="dev-solution" />
          solución
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        <label className="chip flex items-center gap-1">
          puzzle
          <input
            type="number"
            min={1}
            max={40}
            value={start}
            onChange={(e) => {
              const n = Math.max(1, Math.min(40, Number(e.target.value) || 1));
              setStart(n);
              setRun((r) => r + 1);
            }}
            className="w-14 rounded bg-superficie px-1 text-tinta"
            data-testid="dev-from"
          />
        </label>
      </div>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <table className="text-xs text-tinta-media" data-testid="dev-metrics">
        <thead>
          <tr className="text-left text-tinta-suave">
            <th>puzzle</th>
            <th>grilla</th>
            <th>largo</th>
            <th>curvas</th>
            <th>T</th>
            <th>vueltas</th>
            <th>tiempo</th>
            <th>vino/ficha</th>
          </tr>
        </thead>
        <tbody>
          {puzzles.map((p) => (
            <tr key={p.index} className={p.index === start ? "text-tinta" : undefined}>
              <td>{p.index}</td>
              <td>
                {p.cols} × {p.rows}
              </td>
              <td>{p.metrics.len}</td>
              <td>{p.metrics.turns}</td>
              <td>{p.metrics.tees}</td>
              <td>{p.metrics.needed}</td>
              <td>{p.timeMs / 1000} s</td>
              <td>{p.flowMs} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Distribution seed={seed} />
      <div className="flex flex-wrap items-end gap-4" data-testid="dev-sprites">
        {POSES.map(([pose, label]) => (
          <div key={pose} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={rastaSprite(pose)} height={72} label={`el pibe ${label}`} />
            <span className="text-[10px] text-tinta-suave">{label}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1">
          <SpriteSvg sprite={damajuanaSprite()} height={60} label="la damajuana" />
          <span className="text-[10px] text-tinta-suave">Vinaken del pari</span>
        </div>
      </div>
    </div>
  );
}
