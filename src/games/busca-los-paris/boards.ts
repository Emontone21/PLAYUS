// Los tableros de "buscá los Paris", puros y a partir de la semilla del
// intento: todo el grupo ve los mismos en el mismo número de intento. Cada
// tablero elige qué dibujos entran (un subconjunto al azar de la lista; con
// 10 dibujos, el de 10 pares los lleva todos) y mezcla las posiciones.

import { rngFromSeed } from "@/lib/rng";
import { DRAWINGS, type Drawing } from "./drawings";

export interface Board {
  cols: number;
  rows: number;
  /** id del dibujo de cada carta, por filas */
  cards: string[];
}

/** tamaños por tablero: 2 × 3, 3 × 4, 4 × 4 y después siempre 4 × 5 */
export const BOARD_SIZES: readonly { cols: number; rows: number }[] = [
  { cols: 2, rows: 3 },
  { cols: 3, rows: 4 },
  { cols: 4, rows: 4 },
  { cols: 4, rows: 5 },
];
/** tableros de sobra: nadie completa tantos en 60 s */
export const BOARD_COUNT = 12;

export function boardSize(index: number): { cols: number; rows: number } {
  return BOARD_SIZES[Math.min(index, BOARD_SIZES.length - 1)]!;
}

export function memoBoards(attemptSeed: string, drawings: readonly Drawing[] = DRAWINGS, count = BOARD_COUNT): Board[] {
  const rng = rngFromSeed(`paris:${attemptSeed}`);
  const ids = drawings.map((d) => d.id);
  const boards: Board[] = [];
  for (let b = 0; b < count; b++) {
    const { cols, rows } = boardSize(b);
    const pairs = (cols * rows) / 2;
    if (pairs > ids.length) throw new Error(`hacen falta ${pairs} dibujos y hay ${ids.length}`);
    const chosen = rng.shuffle(ids).slice(0, pairs);
    const cards = rng.shuffle([...chosen, ...chosen]);
    boards.push({ cols, rows, cards });
  }
  return boards;
}
