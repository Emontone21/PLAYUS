// Las reglas de "buscá los Paris", puras y compartidas por el cliente y el
// servidor: qué pasa al dar vuelta cada carta, cuándo se completa un tablero,
// qué es un acierto a ciegas, y la validación de la traza, que rearma los
// tableros con la semilla y vuelve a jugar cada toque.

import { memoBoards, type Board } from "./boards";
import type { Drawing } from "./drawings";

export const DURATION_MS = 60_000;
/** el giro de una carta */
export const FLIP_MS = 150;
/** un par distinto se ve este tiempo antes de taparse */
export const MISMATCH_HOLD_MS = 600;
/** el cartel "¡completo!" antes del tablero siguiente */
export const COMPLETE_HOLD_MS = 400;
/** un solo dedo no da vuelta dos cartas en menos de esto */
export const MIN_GAP_MS = 80;
/** margen sobre la duración para el último toque */
export const END_SLACK_MS = 2_000;
/**
 * Aciertos a ciegas permitidos por partida: 3 fijos más uno cada 3 pares.
 * Calibrado con jugadores honestos simulados (decisión 198): un jugador de
 * memoria perfecta o imperfecta lo pasa en menos del 0,1 % de las partidas.
 */
export const BLIND_BASE = 3;
export const BLIND_PER_PAIRS = 3;
export function blindAllowance(pairs: number): number {
  return BLIND_BASE + Math.floor(pairs / BLIND_PER_PAIRS);
}
/** pares posibles en 60 s (más el margen) si cada par fueran dos toques al intervalo mínimo */
export const MAX_SCORE = Math.floor((DURATION_MS + END_SLACK_MS) / (2 * MIN_GAP_MS));

/** una carta dada vuelta: `t` en ms desde onReady, `board` el tablero (desde 0) y `card` el índice en el tablero */
export type FlipEvent = { t: number; board: number; card: number };

export interface BoardState {
  /** las cartas descubiertas (ya emparejadas) */
  matched: Set<number>;
  /** las dadas vuelta ahora: 0, 1 o 2 (2 = un par distinto esperando taparse) */
  open: number[];
  /** las que ya se vieron alguna vez en este tablero */
  seen: Set<number>;
}

export interface SimState {
  board: number;
  pairs: number;
  /** aciertos a ciegas en toda la partida */
  blind: number;
  current: BoardState;
  /** si el último toque fue el segundo de un par: "par", "distinto" o null */
  last: "par" | "distinto" | null;
}

export function initialState(): SimState {
  return { board: 0, pairs: 0, blind: 0, current: { matched: new Set(), open: [], seen: new Set() }, last: null };
}

export type FlipResult = { ok: true; last: "par" | "distinto" | null; completed: boolean; blind: boolean } | { ok: false; reason: string };

/**
 * Da vuelta la carta `card` del tablero actual. Si había un par distinto a la
 * vista, se tapa al instante (la simulación no depende de los 600 ms: el
 * cliente los usa solo para mostrarlo). Devuelve si fue un par, si se
 * completó el tablero (y entonces pasa al siguiente) y si fue a ciegas.
 */
export function flip(state: SimState, boards: readonly Board[], card: number): FlipResult {
  const board = boards[state.board];
  if (!board) return { ok: false, reason: "no quedan tableros" };
  if (!Number.isInteger(card) || card < 0 || card >= board.cards.length) return { ok: false, reason: "carta inválida" };
  const cur = state.current;
  if (cur.matched.has(card)) return { ok: false, reason: "carta ya descubierta" };
  if (cur.open.length === 1 && cur.open[0] === card) return { ok: false, reason: "carta ya dada vuelta" };
  if (cur.open.length === 2) cur.open = []; // las dos anteriores se tapan al instante
  let blind = false;
  let last: "par" | "distinto" | null = null;
  let completed = false;
  if (cur.open.length === 0) {
    cur.open = [card];
    // guardamos si la primera ya se había visto antes de este par
    firstSeenBefore.set(state, cur.seen.has(card));
    cur.seen.add(card);
  } else {
    const first = cur.open[0]!;
    const secondSeen = cur.seen.has(card);
    const firstSeen = firstSeenBefore.get(state) ?? false;
    cur.seen.add(card);
    if (board.cards[first] === board.cards[card]) {
      cur.matched.add(first);
      cur.matched.add(card);
      cur.open = [];
      state.pairs++;
      last = "par";
      // a ciegas: ninguna de las dos se había visto antes de este par
      if (!secondSeen && !firstSeen) {
        blind = true;
        state.blind++;
      }
      if (cur.matched.size === board.cards.length) {
        completed = true;
        state.board++;
        state.current = { matched: new Set(), open: [], seen: new Set() };
      }
    } else {
      cur.open = [first, card];
      last = "distinto";
    }
  }
  state.last = last;
  return { ok: true, last, completed, blind };
}

const firstSeenBefore = new WeakMap<SimState, boolean>();

export type Verdict = { ok: true; score: number; blind: number; boards: number } | { ok: false; reason: string };

/** Revisa la forma de la traza y la vuelve a jugar sobre los tableros de la semilla. */
export function check(attemptSeed: string, events: unknown, drawings?: readonly Drawing[]): Verdict {
  if (!Array.isArray(events)) return { ok: false, reason: "traza mal armada" };
  if (events.length > MAX_SCORE * 2 + 2) return { ok: false, reason: "traza demasiado larga" };
  const boards = memoBoards(attemptSeed, drawings);
  const s = initialState();
  let prevT = -Infinity;
  for (const raw of events) {
    const e = raw as Partial<FlipEvent> | null;
    if (!e || typeof e !== "object" || !Number.isFinite(e.t) || !Number.isInteger(e.board) || !Number.isInteger(e.card)) return { ok: false, reason: "evento mal armado" };
    const ev = e as FlipEvent;
    if (ev.t < 0 || ev.t < prevT) return { ok: false, reason: "tiempos fuera de orden" };
    if (ev.t > DURATION_MS + END_SLACK_MS) return { ok: false, reason: "toque después del final" };
    if (prevT > -Infinity && ev.t - prevT < MIN_GAP_MS) return { ok: false, reason: "dos toques demasiado seguidos" };
    if (ev.board !== s.board) return { ok: false, reason: "tablero equivocado" };
    const r = flip(s, boards, ev.card);
    if (!r.ok) return r;
    prevT = ev.t;
  }
  if (s.blind > blindAllowance(s.pairs)) return { ok: false, reason: "demasiados aciertos a ciegas" };
  return { ok: true, score: s.pairs, blind: s.blind, boards: s.board };
}

export function validate(result: { score: number; events: unknown[] }, attemptSeed: string): boolean {
  const v = check(attemptSeed, result.events);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// jugadores simulados: para los tests, el E2E y la calibración de los
// aciertos a ciegas
// ---------------------------------------------------------------------------

export interface PlayerOptions {
  /** probabilidad de recordar cada carta vista (1 = memoria perfecta) */
  memory?: number;
  /** ms entre toques */
  gapMs?: () => number;
  /** jugar hasta este tiempo (ms) */
  untilMs?: number;
  rand?: () => number;
}

/**
 * Un jugador honesto: si recuerda dos cartas iguales sin emparejar, las da
 * vuelta; si no, da vuelta una que no vio y, si su igual está en la memoria,
 * la busca; si no, otra que no vio. Con memoria imperfecta, cada carta vista
 * se recuerda con probabilidad `memory`.
 */
export function honestTrace(attemptSeed: string, opts: PlayerOptions = {}, drawings?: readonly Drawing[]): { events: FlipEvent[]; score: number; blind: number } {
  const rand = opts.rand ?? Math.random;
  const memory = opts.memory ?? 1;
  const gap = opts.gapMs ?? (() => 650 + rand() * 300);
  const until = opts.untilMs ?? DURATION_MS;
  const boards = memoBoards(attemptSeed, drawings);
  const s = initialState();
  const events: FlipEvent[] = [];
  let t = 400;
  let known = new Map<number, string>();
  let boardIdx = 0;
  const pick = (arr: number[]) => arr[Math.floor(rand() * arr.length)]!;
  const play = (card: number) => {
    events.push({ t: Math.round(t), board: s.board, card });
    const r = flip(s, boards, card);
    if (!r.ok) throw new Error(r.reason);
    const b = boards[boardIdx]!;
    if (rand() < memory) known.set(card, b.cards[card]!);
    if (r.completed) {
      known = new Map();
      boardIdx = s.board;
      t += COMPLETE_HOLD_MS;
    } else if (r.last === "distinto") t += MISMATCH_HOLD_MS * 0.6;
    t += gap();
  };
  while (t < until && boards[s.board]) {
    const b = boards[s.board]!;
    const free = (c: number) => !s.current.matched.has(c);
    // dos conocidas iguales
    let found: [number, number] | null = null;
    for (const [c1, id] of known) {
      if (!free(c1)) continue;
      for (const [c2, id2] of known) if (c2 !== c1 && free(c2) && id2 === id) found = [c1, c2];
      if (found) break;
    }
    if (found) {
      play(found[0]);
      if (t >= until) break;
      play(found[1]);
      continue;
    }
    const unseen = b.cards.map((_, i) => i).filter((i) => free(i) && !known.has(i));
    if (unseen.length === 0) {
      // se olvidó de algo: toca cualquiera libre
      const any = b.cards.map((_, i) => i).filter(free);
      play(pick(any));
      if (t >= until) break;
      const other = any.filter((i) => i !== s.current.open[0]);
      if (other.length) play(pick(other));
      continue;
    }
    const first = pick(unseen);
    play(first);
    if (t >= until) break;
    const id = b.cards[first]!;
    let mate: number | null = null;
    for (const [c, kid] of known) if (c !== first && free(c) && kid === id) mate = c;
    if (mate !== null) play(mate);
    else {
      const rest = unseen.filter((i) => i !== first);
      if (rest.length) play(pick(rest));
      else {
        const any = b.cards.map((_, i) => i).filter((i) => free(i) && i !== first);
        if (any.length) play(pick(any));
      }
    }
  }
  return { events, score: s.pairs, blind: s.blind };
}
