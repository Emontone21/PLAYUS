// "buscá los Paris": un memotest. Cartas boca abajo; tocás dos y, si son
// iguales, quedan descubiertas y sumás un par; si no, se tapan. Al completar
// un tablero viene otro más grande. 60 segundos; gana el que más pares junta.
//
// Es un juego de interfaz: DOM y los componentes de la app, con los dibujos
// en pixel art como SVG (SpriteSvg) y la rana en el dorso. Los tableros
// salen enteros de la semilla (boards.ts) y la traza es cada carta dada
// vuelta, con el tiempo medido desde onReady; `validate` rearma los tableros
// y vuelve a jugar la traza con las mismas reglas (rules.ts).
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { createPointerTracker } from "../lib/taps";
import { Frog } from "@/components/frog/Frog";
import { memoBoards, type Board } from "./boards";
import { DRAWINGS, drawingSprite } from "./drawings";
import { check, COMPLETE_HOLD_MS, DURATION_MS, FLIP_MS, flip, initialState, MAX_SCORE, MIN_GAP_MS, MISMATCH_HOLD_MS, validate, type FlipEvent, type SimState } from "./rules";

export interface ParisDevOptions {
  /** arrancar en este tablero (desde 0) */
  startBoard?: number;
}

/** el frente de las cartas */
export const CARD_FRONT = "#F7FFF2";
const GAP = 8;

type View = {
  board: number;
  open: number[];
  matched: number[];
  pairs: number;
  /** el cartel "¡completo!" */
  completing: boolean;
};

export function ParisGame({ seed, onReady, onProgress, dev }: GameProps & { dev?: ParisDevOptions }) {
  const boards = React.useMemo(() => memoBoards(seed), [seed]);
  const startBoard = Math.max(0, Math.min(boards.length - 1, dev?.startBoard ?? 0));
  const sim = React.useRef<SimState>(initialState());
  const events = React.useRef<FlipEvent[]>([]);
  const readyAt = React.useRef<number | null>(null);
  const lastT = React.useRef(-Infinity);
  const tracker = React.useRef(createPointerTracker()).current;
  const coverTimer = React.useRef<number | undefined>(undefined);
  const nextTimer = React.useRef<number | undefined>(undefined);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<View>({ board: startBoard, open: [], matched: [], pairs: 0, completing: false });
  const [reduced, setReduced] = React.useState(false);
  const [size, setSize] = React.useState({ w: 320, h: 420 });

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  React.useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => {
      const r = area.getBoundingClientRect();
      setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);

  // listo al montar
  React.useEffect(() => {
    const s = initialState();
    s.board = startBoard;
    sim.current = s;
    events.current = [];
    readyAt.current = performance.now();
    onProgress({ score: 0, events: [] });
    onReady();
    return () => {
      window.clearTimeout(coverTimer.current);
      window.clearTimeout(nextTimer.current);
    };
  }, [onReady, onProgress, startBoard]);

  const elapsed = () => (readyAt.current === null ? 0 : performance.now() - readyAt.current);

  function tap(card: number) {
    const s = sim.current;
    if (view.completing) return;
    const t = Math.round(elapsed());
    // un solo dedo no toca dos veces en menos de 80 ms: el toque no cuenta (la traza seguiría siendo válida)
    if (t - lastT.current < MIN_GAP_MS) return;
    const r = flip(s, boards, card);
    if (!r.ok) return;
    lastT.current = t;
    events.current.push({ t, board: r.completed ? s.board - 1 : s.board, card });
    const result: GameResult = { score: s.pairs, events: [...events.current] };
    onProgress(result);
    window.clearTimeout(coverTimer.current);
    if (r.completed) {
      setView({ board: s.board - 1, open: [], matched: Array.from({ length: boards[s.board - 1]!.cards.length }, (_, i) => i), pairs: s.pairs, completing: true });
      nextTimer.current = window.setTimeout(() => {
        setView({ board: s.board, open: [], matched: [], pairs: s.pairs, completing: false });
      }, COMPLETE_HOLD_MS);
      return;
    }
    setView({ board: s.board, open: [...s.current.open], matched: [...s.current.matched], pairs: s.pairs, completing: false });
    if (r.last === "distinto") {
      // se ven 600 ms y se tapan (salvo que toque otra antes: flip las tapa al instante)
      coverTimer.current = window.setTimeout(() => {
        if (s.current.open.length === 2) s.current.open = [];
        setView((v) => ({ ...v, open: [] }));
      }, MISMATCH_HOLD_MS);
    }
  }

  function down(e: React.PointerEvent, card: number) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!tracker.down(e.pointerId)) return;
    tap(card);
  }
  const up = (e: React.PointerEvent) => tracker.up(e.pointerId);

  const board: Board = boards[Math.min(view.board, boards.length - 1)]!;
  // las cartas: que el tablero entre entero, con cartas de 64 px como mínimo
  const cardW = Math.max(64, Math.min(84, Math.floor((size.w - GAP * (board.cols - 1)) / board.cols), Math.floor((Math.floor((size.h - GAP * (board.rows - 1)) / board.rows) * 4) / 5)));
  const cardH = Math.round((cardW * 5) / 4);

  return (
    <div className="flex h-full w-full select-none flex-col gap-2" style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }} data-testid="paris-area" data-board={view.board} data-pairs={view.pairs} data-open={view.open.join(",")} data-completing={view.completing ? "1" : ""} onContextMenu={(e) => e.preventDefault()} onPointerUp={up} onPointerCancel={up}>
      <div className="flex items-baseline justify-between px-1">
        <span className="display text-3xl text-tinta" data-testid="paris-pairs" aria-live="off">
          {view.pairs} {view.pairs === 1 ? "par" : "pares"}
        </span>
        <span className="eyebrow" data-testid="paris-board">
          tablero {view.board + 1}
        </span>
      </div>
      <div ref={areaRef} className="relative flex min-h-0 flex-1 items-center justify-center" data-testid="paris-field">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${board.cols}, ${cardW}px)`, gap: GAP }} data-testid="paris-grid" data-cols={board.cols} data-rows={board.rows}>
          {board.cards.map((id, i) => {
            const matched = view.matched.includes(i);
            const faceUp = matched || view.open.includes(i);
            return <Card key={`${view.board}-${i}`} index={i} id={id} faceUp={faceUp} matched={matched} w={cardW} h={cardH} reduced={reduced} onDown={(e) => down(e, i)} />;
          })}
        </div>
        {view.completing ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span className="speech display text-3xl" role="status" data-testid="paris-complete">
              ¡completo!
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** una carta con giro 3D; con prefers-reduced-motion cambia de cara al instante */
export function Card({ index, id, faceUp, matched, w, h, reduced, onDown, label }: { index: number; id: string; faceUp: boolean; matched: boolean; w: number; h: number; reduced: boolean; onDown?: (e: React.PointerEvent) => void; label?: string }) {
  const face: React.CSSProperties = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };
  return (
    <button
      type="button"
      className="relative block"
      style={{ width: w, height: h, perspective: 600, background: "transparent", padding: 0, border: 0, touchAction: "manipulation" }}
      onPointerDown={onDown}
      aria-label={label ?? (faceUp ? DRAWINGS.find((d) => d.id === id)?.nombre : `carta ${index + 1}, tapada`)}
      aria-pressed={faceUp}
      data-testid={onDown ? `card-${index}` : undefined}
      data-state={matched ? "par" : faceUp ? "vuelta" : "tapada"}
      data-id={faceUp ? id : undefined}
    >
      <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: faceUp ? "rotateY(180deg)" : "rotateY(0deg)", transition: reduced ? "none" : `transform ${FLIP_MS}ms ease` }}>
        <div style={{ ...face, background: "var(--superficie)", border: "3px solid var(--contorno)" }}>
          <Frog size={Math.round(w * 0.55)} animate={false} />
        </div>
        <div style={{ ...face, transform: "rotateY(180deg)", background: CARD_FRONT, border: `3px solid ${matched ? "var(--agua)" : "var(--contorno)"}`, boxShadow: matched && !reduced ? "0 0 0 2px rgba(111,211,224,0.35), 0 0 14px var(--agua)" : undefined }}>
          <SpriteSvg sprite={drawingSprite(id)} height={Math.round(w * 0.78)} />
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

function Intro() {
  return (
    <div className="card card-c flex flex-col gap-3" data-testid="paris-card">
      <div className="flex items-center justify-center gap-2">
        <Card index={0} id="hongo" faceUp={false} matched={false} w={56} h={70} reduced label="carta tapada" />
        <Card index={1} id="porro" faceUp={false} matched={false} w={56} h={70} reduced label="carta tapada" />
        <Card index={2} id="sunny" faceUp matched w={56} h={70} reduced label="un par: el sunny" />
        <Card index={3} id="sunny" faceUp matched w={56} h={70} reduced label="un par: el sunny" />
      </div>
      <p className="text-xs text-tinta-media">dos tapadas y un par descubierto. Hay dibujos que se parecen: mirá bien.</p>
    </div>
  );
}

function Result({ result, seed }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const boardsDone = v.ok ? v.boards : 0;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="paris-result" data-boards={boardsDone}>
      <p className="display-lg text-tinta" style={{ fontSize: 88 }}>
        <span data-testid="game-score">{result.score}</span>
      </p>
      <p className="text-lg text-tinta-media">
        {result.score === 1 ? "par encontrado" : "pares encontrados"}
        {boardsDone > 0 ? `, ${boardsDone === 1 ? "un tablero completo" : `${boardsDone} tableros completos`}.` : "."}
      </p>
    </div>
  );
}

export const buscaLosParis: GameModule = {
  id: "busca-los-paris",
  name: "buscá los Paris",
  tagline: "acordate dónde estaba cada uno.",
  howTo: ["tocá dos cartas: si son iguales, son un par", "cuando completás el tablero, viene otro más grande", "tenés 60 segundos para encontrar todos los pares que puedas"],
  durationMs: DURATION_MS,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  Component: ParisGame,
  Intro,
  Result,
};
