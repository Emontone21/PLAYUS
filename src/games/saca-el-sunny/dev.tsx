"use client";

// Solo desarrollo: la solución óptima paso a paso, los movimientos mínimos de
// cada estacionamiento, saltar a cualquiera, cámara lenta, y la distribución
// de dificultad en 50 semillas seguidas. Deja las reglas en window.__saca
// para el E2E.
// /dev/juego/saca-el-sunny?seed=…&solucion=1&lento=1&desde=7

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SacaSunnyGame, sacaElSunny, type SunnyDevOptions } from "./index";
import { advance, botTrace, check, legalRange, MODEL, move, newRun, parkingPuzzles, puzzleAt, reset, rowFor, solve, validate, type Puzzle } from "./rules";

function Distribution({ seed }: { seed: string }) {
  const [rows, setRows] = React.useState<{ index: number; mean: number; min: number; max: number; cars: string }[] | null>(null);
  const compute = () => {
    const by = new Map<number, Puzzle[]>();
    for (let i = 0; i < 50; i++) for (const p of parkingPuzzles(`${seed}-${i}`, 7)) by.set(p.index, [...(by.get(p.index) ?? []), p]);
    setRows(
      [...by.entries()].map(([index, ps]) => {
        const xs = ps.map((p) => p.minMoves);
        return { index, mean: xs.reduce((a, b) => a + b, 0) / xs.length, min: Math.min(...xs), max: Math.max(...xs), cars: `${Math.min(...ps.map((p) => p.blacks))}–${Math.max(...ps.map((p) => p.blacks))}` };
      }),
    );
  };
  return (
    <div className="flex flex-col gap-2" data-testid="dev-distribution">
      <button type="button" className="btn-secondary-sm self-start" onClick={compute} data-testid="dev-distribution-run">
        dificultad en 50 semillas (estacionamientos 1 a 7)
      </button>
      {rows ? (
        <table className="text-xs text-tinta-media">
          <thead>
            <tr className="text-left text-tinta-suave">
              <th>estacionamiento</th>
              <th>mínimos (media)</th>
              <th>mín–máx</th>
              <th>rango de la tabla</th>
              <th>autos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.index}>
                <td>{r.index}</td>
                <td>{r.mean.toFixed(1)}</td>
                <td>
                  {r.min}–{r.max}
                </td>
                <td>
                  {rowFor(r.index).moves[0]}–{rowFor(r.index).moves[1]}
                </td>
                <td>{r.cars}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export function SacaSunnyDev({ seed, from = 1, hint = false, slow = false, startS = 0 }: { seed: string; from?: number; hint?: boolean; slow?: boolean; startS?: number }) {
  const [opts, setOpts] = React.useState({ hint, slow });
  const [start, setStart] = React.useState(from);
  const [startMs, setStartMs] = React.useState(startS * 1000);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<SunnyDevOptions>({});
  optsRef.current = { hint: opts.hint, slow: opts.slow, firstPuzzle: start, startMs };
  const puzzles = React.useMemo<Puzzle[]>(() => parkingPuzzles(seed, 10), [seed]);
  const solution = React.useMemo(() => solve(puzzles[start - 1]!.cars, puzzles[start - 1]!.start)?.path ?? [], [puzzles, start]);

  const game = React.useMemo<GameModule>(() => {
    function DevSunny(p: GameProps) {
      return <SacaSunnyGame {...p} dev={optsRef.current} />;
    }
    return { ...sacaElSunny, Component: DevSunny };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __saca: unknown }).__saca = { parkingPuzzles, puzzleAt, solve, check, validate, botTrace, newRun, advance, move, reset, legalRange, MODEL };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="saca-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.hint} onChange={(e) => setOpts((o) => ({ ...o, hint: e.target.checked }))} data-testid="dev-hint" />
          solución
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        <label className="chip flex items-center gap-1">
          estacionamiento
          <input
            type="number"
            min={1}
            max={10}
            value={start}
            onChange={(e) => {
              const n = Math.max(1, Math.min(10, Number(e.target.value) || 1));
              setStart(n);
              setRun((r) => r + 1);
            }}
            className="w-14 rounded bg-superficie px-1 text-tinta"
            data-testid="dev-from"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          className={startMs > 0 ? "btn-primary-sm" : "btn-secondary-sm"}
          onClick={() => {
            setStartMs(startMs > 0 ? 0 : 103_000);
            setRun((r) => r + 1);
          }}
          data-testid="dev-closing"
        >
          {startMs > 0 ? "desde el principio" : "los últimos 17 s (el cierre)"}
        </button>
      </div>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <p className="text-xs text-tinta-suave" data-testid="dev-solution">
        solución óptima del {start} ({solution.length} movimientos): {solution.map((m) => `auto ${m.car} ${m.delta > 0 ? "+" : ""}${m.delta}`).join(", ")}
      </p>
      <table className="text-xs text-tinta-media" data-testid="dev-metrics">
        <thead>
          <tr className="text-left text-tinta-suave">
            <th>estacionamiento</th>
            <th>autos negros</th>
            <th>mínimos</th>
            <th>rango</th>
          </tr>
        </thead>
        <tbody>
          {puzzles.map((p) => (
            <tr key={p.index} className={p.index === start ? "text-tinta" : undefined}>
              <td>{p.index}</td>
              <td>{p.blacks}</td>
              <td>{p.minMoves}</td>
              <td>
                {rowFor(p.index).moves[0]}–{rowFor(p.index).moves[1]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Distribution seed={seed} />
    </div>
  );
}
