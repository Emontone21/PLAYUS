"use client";

// Solo desarrollo: los 10 dibujos en grande y en tamaño de carta, cualquier
// tablero con todas las cartas descubiertas, y saltos al tablero 1, 2, 3 y
// 4. Deja las reglas en window.__paris para el E2E.
// /dev/juego/busca-los-paris?seed=…&desde=3

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { Card, ParisGame, buscaLosParis, type ParisDevOptions } from "./index";
import { memoBoards } from "./boards";
import { DRAWINGS, drawingSprite } from "./drawings";
import { check, honestTrace, validate } from "./rules";

const JUMPS = [1, 2, 3, 4] as const;

export function ParisDev({ seed, from = 1 }: { seed: string; from?: number }) {
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const [shown, setShown] = React.useState(0);
  const optsRef = React.useRef<ParisDevOptions>({});
  optsRef.current = { startBoard: start - 1 };
  const boards = React.useMemo(() => memoBoards(seed), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevParis(p: GameProps) {
      return <ParisGame {...p} dev={optsRef.current} />;
    }
    return { ...buscaLosParis, Component: DevParis };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __paris: unknown }).__paris = { memoBoards, check, validate, honestTrace };
  }, []);

  const board = boards[shown]!;
  return (
    <div className="flex flex-col gap-3" data-testid="paris-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        {JUMPS.map((b) => (
          <button
            key={b}
            type="button"
            className={b === start ? "btn-primary-sm" : "btn-secondary-sm"}
            onClick={() => {
              setStart(b);
              setRun((n) => n + 1);
            }}
            data-testid={`dev-from-${b}`}
          >
            tablero {b}
          </button>
        ))}
      </div>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((n) => n + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />

      <div className="flex flex-col gap-2" data-testid="dev-drawings">
        <h2 className="display text-lg">los dibujos, en grande y en tamaño de carta</h2>
        <div className="grid grid-cols-5 gap-3">
          {DRAWINGS.map((d) => (
            <figure key={d.id} className="flex flex-col items-center gap-1">
              <SpriteSvg sprite={drawingSprite(d.id)} height={96} label={d.nombre} />
              <Card index={0} id={d.id} faceUp matched={false} w={64} h={80} reduced label={d.nombre} />
              <figcaption className="text-xs text-tinta-suave">{d.nombre}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2" data-testid="dev-boards">
        <h2 className="display text-lg">los tableros, descubiertos</h2>
        <div className="flex flex-wrap gap-1">
          {boards.map((b, i) => (
            <button key={i} type="button" className={i === shown ? "btn-primary-sm" : "btn-secondary-sm"} onClick={() => setShown(i)} data-testid={`dev-board-${i + 1}`}>
              {i + 1} ({b.cols}×{b.rows})
            </button>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${board.cols}, 56px)`, gap: 6 }} data-testid="dev-board-open">
          {board.cards.map((id, i) => (
            <Card key={`${shown}-${i}`} index={i} id={id} faceUp matched={false} w={56} h={70} reduced />
          ))}
        </div>
      </div>
    </div>
  );
}
