// Reglas de "Saca el Sunny": un Rush Hour. En una grilla de 6 × 6, el sunny
// (rojo, horizontal, en la tercera fila) está trabado entre autos negros que
// se mueven solo en su dirección; hay que despejarle el camino hasta la
// salida del borde derecho. Los estacionamientos salen de la semilla del
// intento (que acá es por jugador, decisión 265) con un resolvedor en anchura
// que da los movimientos mínimos y controla la dificultad por tabla
// (`parkingPuzzles`); la partida es una máquina de estados en ms desde
// onReady, la misma en el cliente y en `validate`, que rearma los
// estacionamientos y vuelve a jugar la traza. Sin DOM.

import { rngFromSeed, type Rng } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const DURATION_MS = 120_000;
/** margen chico después de los 120 s (el reloj del juego y el del contenedor no son el mismo) */
export const END_MARGIN_MS = 500;
/** dos movimientos a menos de esto no son humanos */
export const MIN_GAP_MS = 80;
/** el sunny sale manejando y el estacionamiento siguiente aparece a los… */
export const NEXT_MS = 1_000;
export const ELAPSED_SLACK_MS = 10_000;
export const BASE_POINTS = 100;
export const BONUS_MAX = 50;
export const BONUS_PER_MOVE = 10;
/** estacionamientos generados de sobra por semilla (los que sigan se generan igual, de a uno) */
export const PUZZLE_COUNT = 20;

export const SIZE = 6;
/** el sunny va siempre en la tercera fila y sale por el borde derecho */
export const SUNNY_ROW = 2;
export const SUNNY_LEN = 2;
export const EXIT_COL = SIZE - SUNNY_LEN;

export interface Car {
  len: 2 | 3;
  horizontal: boolean;
  /** la fila (horizontal) o la columna (vertical) en la que va */
  lane: number;
  /** la silueta: 0 sedán, 1 hatchback, 2 camioneta (las de 3 casillas son siempre camionetas) */
  look: 0 | 1 | 2;
}

export interface Puzzle {
  /** desde 1 */
  index: number;
  /** el 0 es el sunny */
  cars: Car[];
  /** la posición inicial de cada auto: la columna (horizontal) o la fila (vertical) de su punta de arriba/izquierda */
  start: number[];
  minMoves: number;
  blacks: number;
}

// ---------------------------------------------------------------------------
// la dificultad
// ---------------------------------------------------------------------------

export interface Row {
  from: number;
  blacks: [number, number];
  moves: [number, number];
}
export const TABLE: readonly Row[] = [
  { from: 1, blacks: [5, 6], moves: [4, 6] },
  { from: 2, blacks: [7, 8], moves: [7, 10] },
  { from: 4, blacks: [9, 10], moves: [11, 15] },
  { from: 7, blacks: [11, 13], moves: [16, 22] },
];
export function rowFor(index: number): Row {
  let r = TABLE[0]!;
  for (const row of TABLE) if (index >= row.from) r = row;
  return r;
}

// ---------------------------------------------------------------------------
// el estacionamiento: ocupación, movimientos legales y el resolvedor
// ---------------------------------------------------------------------------

const POW6 = Array.from({ length: 16 }, (_, i) => SIZE ** i);
const strideOf = (c: Car): number => (c.horizontal ? 1 : SIZE);
const baseOf = (c: Car, p: number): number => (c.horizontal ? c.lane * SIZE + p : p * SIZE + c.lane);

function fillOccupancy(cars: readonly Car[], pos: ArrayLike<number>, occ: Uint8Array): void {
  occ.fill(0);
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i]!;
    const s = strideOf(c);
    let cell = baseOf(c, pos[i]!);
    for (let k = 0; k < c.len; k++) {
      occ[cell] = i + 1;
      cell += s;
    }
  }
}

/** qué auto (índice + 1) ocupa cada casilla; 0 si está libre */
export function occupancy(cars: readonly Car[], pos: ArrayLike<number>): Uint8Array {
  const occ = new Uint8Array(SIZE * SIZE);
  fillOccupancy(cars, pos, occ);
  return occ;
}

/** hasta dónde puede deslizarse el auto `i` para atrás (min, ≤ 0) y para adelante (max, ≥ 0) */
export function legalRange(cars: readonly Car[], pos: ArrayLike<number>, i: number, occ = occupancy(cars, pos)): { min: number; max: number } {
  const c = cars[i]!;
  const p = pos[i]!;
  let min = 0;
  while (p + min - 1 >= 0 && occ[baseOf(c, p + min - 1)] === 0) min--;
  let max = 0;
  while (p + c.len + max < SIZE && occ[baseOf(c, p + c.len + max)] === 0) max++;
  return { min, max };
}

export function isSolved(pos: ArrayLike<number>): boolean {
  return pos[0] === EXIT_COL;
}

function keyOf(pos: ArrayLike<number>): number {
  let k = 0;
  for (let i = 0; i < pos.length; i++) k += pos[i]! * POW6[i]!;
  return k;
}

export interface Move {
  car: number;
  delta: number;
}

/** todos los movimientos legales desde `pos` */
export function legalMoves(cars: readonly Car[], pos: ArrayLike<number>): Move[] {
  const occ = occupancy(cars, pos);
  const out: Move[] = [];
  for (let i = 0; i < cars.length; i++) {
    const { min, max } = legalRange(cars, pos, i, occ);
    for (let d = min; d <= max; d++) if (d !== 0) out.push({ car: i, delta: d });
  }
  return out;
}

/** los vecinos de un estado: por cada auto, cada posición a la que puede deslizarse; `visit` recibe el auto y su posición nueva */
function eachNeighbor(cars: readonly Car[], pos: Uint8Array, occ: Uint8Array, visit: (car: number, to: number) => void): void {
  fillOccupancy(cars, pos, occ);
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i]!;
    const p = pos[i]!;
    for (let q = p - 1; q >= 0 && occ[baseOf(c, q)] === 0; q--) visit(i, q);
    for (let q = p + 1; q + c.len - 1 < SIZE && occ[baseOf(c, q + c.len - 1)] === 0; q++) visit(i, q);
  }
}

/**
 * El resolvedor: una búsqueda en anchura sobre los estados del
 * estacionamiento (la posición de cada auto). Devuelve los movimientos
 * mínimos y una solución paso a paso, o null si no tiene.
 */
export function solve(cars: readonly Car[], start: ArrayLike<number>, cap = Infinity): { minMoves: number; path: Move[] } | null {
  const s0 = Uint8Array.from(start);
  if (isSolved(s0)) return { minMoves: 0, path: [] };
  const seen = new Map<number, { pos: Uint8Array; parent: number; move: Move | null }>();
  seen.set(keyOf(s0), { pos: s0, parent: -1, move: null });
  const queue: Uint8Array[] = [s0];
  const occ = new Uint8Array(SIZE * SIZE);
  let found = -1;
  for (let qi = 0; qi < queue.length && found < 0 && queue.length <= cap; qi++) {
    const pos = queue[qi]!;
    const k = keyOf(pos);
    eachNeighbor(cars, pos, occ, (car, to) => {
      if (found >= 0) return;
      const nk = k + (to - pos[car]!) * POW6[car]!;
      if (seen.has(nk)) return;
      const next = Uint8Array.from(pos);
      next[car] = to;
      seen.set(nk, { pos: next, parent: k, move: { car, delta: to - pos[car]! } });
      if (isSolved(next)) found = nk;
      else queue.push(next);
    });
  }
  if (found < 0) return null;
  const path: Move[] = [];
  for (let cur = found; cur >= 0; ) {
    const e = seen.get(cur)!;
    if (!e.move) break;
    path.unshift(e.move);
    cur = e.parent;
  }
  return { minMoves: path.length, path };
}

/** más estados que esto y el estacionamiento es demasiado suelto: se descarta antes de recorrerlo entero */
export const COMPONENT_CAP = 12_000;
const MAX_CARS = 16;
const TABLE_SIZE = 65_536; // potencia de 2 mayor que el doble del tope

/** una tabla de hash abierta de claves numéricas → índice de estado, sin asignar objetos (una sola, se limpia por búsqueda) */
class KeyIndex {
  readonly keys = new Float64Array(TABLE_SIZE).fill(-1);
  readonly vals = new Int32Array(TABLE_SIZE);
  clear(): void {
    this.keys.fill(-1);
  }
  /** el índice guardado para la clave, o -1 */
  get(key: number): number {
    let h = key % TABLE_SIZE;
    for (;;) {
      const k = this.keys[h]!;
      if (k === key) return this.vals[h]!;
      if (k < 0) return -1;
      h = (h + 1) & (TABLE_SIZE - 1);
    }
  }
  set(key: number, val: number): void {
    let h = key % TABLE_SIZE;
    while (this.keys[h]! >= 0) h = (h + 1) & (TABLE_SIZE - 1);
    this.keys[h] = key;
    this.vals[h] = val;
  }
}

const STATE_BUF = new Uint8Array((COMPONENT_CAP + 1) * MAX_CARS);
const KEY_INDEX = new KeyIndex();

/** todos los estados alcanzables desde `start` (hasta el tope), con la distancia mínima de cada uno a la salida (−1 si no se puede salir) */
function componentDistances(cars: readonly Car[], start: Uint8Array): { count: number; stateAt: (j: number) => Uint8Array; dist: Int32Array } | null {
  const n = cars.length;
  const buf = STATE_BUF;
  const index = KEY_INDEX;
  index.clear();
  let count = 0;
  const push = (pos: Uint8Array, car: number, to: number): number => {
    const j = count++;
    buf.set(pos, j * MAX_CARS);
    if (car >= 0) buf[j * MAX_CARS + car] = to;
    return j;
  };
  const stateAt = (j: number) => buf.subarray(j * MAX_CARS, j * MAX_CARS + n);
  index.set(keyOf(start), push(start, -1, 0));
  const occ = new Uint8Array(SIZE * SIZE);
  for (let qi = 0; qi < count; qi++) {
    const pos = stateAt(qi);
    const k = keyOf(pos);
    let full = false;
    eachNeighbor(cars, pos, occ, (car, to) => {
      if (full) return;
      const nk = k + (to - pos[car]!) * POW6[car]!;
      if (index.get(nk) >= 0) return;
      if (count >= COMPONENT_CAP) {
        full = true;
        return;
      }
      index.set(nk, push(pos, car, to));
    });
    if (full) return null;
  }
  // desde las salidas hacia atrás (los movimientos van y vienen), regenerando los vecinos
  const dist = new Int32Array(count).fill(-1);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  for (let j = 0; j < count; j++) {
    if (isSolved(stateAt(j))) {
      dist[j] = 0;
      queue[tail++] = j;
    }
  }
  while (head < tail) {
    const j = queue[head++]!;
    const pos = stateAt(j);
    const k = keyOf(pos);
    const dj = dist[j]!;
    eachNeighbor(cars, pos, occ, (car, to) => {
      const m = index.get(k + (to - pos[car]!) * POW6[car]!);
      if (m >= 0 && dist[m]! < 0) {
        dist[m] = dj + 1;
        queue[tail++] = m;
      }
    });
  }
  return { count, stateAt, dist };
}

// ---------------------------------------------------------------------------
// la generación
// ---------------------------------------------------------------------------

/** cuántos intentos de ubicación llevó el último estacionamiento generado (para medir) */
export const genStats = { attempts: 0, capped: 0, unsolvable: 0, offRange: 0 };

/** qué parte de los autos negros son camionetas de 3 casillas */
export const TRUCK_SHARE = 0.3;

function tryPuzzle(rng: Rng, index: number): Puzzle | null {
  genStats.attempts++;
  const row = rowFor(index);
  const cars: Car[] = [{ len: SUNNY_LEN, horizontal: true, lane: SUNNY_ROW, look: 0 }];
  const pos: number[] = [rng.int(0, EXIT_COL - 1)];
  const occ = new Uint8Array(SIZE * SIZE);
  const mark = (c: Car, p: number, v: number) => {
    for (let k = 0; k < c.len; k++) occ[baseOf(c, p) + k * strideOf(c)] = v;
  };
  const fits = (c: Car, p: number) => {
    for (let k = 0; k < c.len; k++) if (occ[baseOf(c, p) + k * strideOf(c)]) return false;
    return true;
  };
  mark(cars[0]!, pos[0]!, 1);
  const addCar = (): boolean => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const len: 2 | 3 = rng.next() < TRUCK_SHARE ? 3 : 2;
      const horizontal = rng.next() < 0.5;
      // ningún otro auto horizontal en la fila del sunny: a la derecha lo trabaría para siempre
      const lane = horizontal ? rng.pick([0, 1, 3, 4, 5]) : rng.int(0, SIZE - 1);
      const car: Car = { len, horizontal, lane, look: len === 3 ? 2 : rng.next() < 0.5 ? 0 : 1 };
      const p = rng.int(0, SIZE - len);
      if (!fits(car, p)) continue;
      mark(car, p, cars.length + 1);
      cars.push(car);
      pos.push(p);
      return true;
    }
    return false;
  };
  const removeCar = (): void => {
    const i = rng.int(1, cars.length - 1);
    mark(cars[i]!, pos[i]!, 0);
    cars.splice(i, 1);
    pos.splice(i, 1);
    for (let j = 1; j < cars.length; j++) mark(cars[j]!, pos[j]!, j + 1);
  };
  // se arranca con los autos máximos de la fila (lo más trabado) y, mientras no tenga solución, se quita uno
  for (let n = 0; n < row.blacks[1]; n++) if (!addCar()) return null;
  const lo = row.moves[0];
  const hi = row.moves[1];
  for (;;) {
    const comp = componentDistances(cars, Uint8Array.from(pos));
    if (!comp) {
      genStats.capped++;
      return null;
    }
    const { count, stateAt, dist } = comp;
    let maxDepth = -1;
    for (let j = 0; j < dist.length; j++) if (dist[j]! > maxDepth) maxDepth = dist[j]!;
    if (maxDepth >= lo) {
      // el estado inicial: uno del componente a la distancia pedida de la salida
      const d = rng.int(lo, Math.min(hi, maxDepth));
      const cands: number[] = [];
      for (let j = 0; j < count; j++) if (dist[j] === d) cands.push(j);
      const start = Array.from(stateAt(rng.pick(cands)));
      return { index, cars, start, minMoves: d, blacks: cars.length - 1 };
    }
    if (maxDepth >= 0) {
      // tiene solución pero es poco profundo: se descarta entero
      genStats.offRange++;
      return null;
    }
    if (cars.length - 1 <= row.blacks[0]) {
      genStats.unsolvable++;
      return null;
    }
    removeCar();
  }
}

const puzzleCache = new Map<string, Puzzle>();
/** el estacionamiento `index` (desde 1) de una semilla: determinístico y dentro de su fila de la tabla */
export function puzzleAt(seed: string, index: number): Puzzle {
  const key = `${seed}:${index}`;
  const cached = puzzleCache.get(key);
  if (cached) return cached;
  const rng = rngFromSeed(`sunny:${seed}:${index}`);
  let puzzle: Puzzle | null = null;
  for (let attempt = 0; attempt < 1000 && !puzzle; attempt++) puzzle = tryPuzzle(rng, index);
  // no pasa en la práctica (el test lo comprueba en miles de semillas): antes que colgarse, sigue probando
  while (!puzzle) puzzle = tryPuzzle(rng, index);
  if (puzzleCache.size > 400) puzzleCache.clear();
  puzzleCache.set(key, puzzle);
  return puzzle;
}

/** los primeros `count` estacionamientos de la semilla del intento */
export function parkingPuzzles(seed: string, count = PUZZLE_COUNT): Puzzle[] {
  return Array.from({ length: count }, (_, i) => puzzleAt(seed, i + 1));
}

// ---------------------------------------------------------------------------
// la partida (ms desde onReady)
// ---------------------------------------------------------------------------

export type Phase = "playing" | "leaving" | "over";

export interface Run {
  seed: string;
  t: number;
  /** el estacionamiento en curso, desde 0 */
  index: number;
  puzzle: Puzzle;
  pos: number[];
  /** movimientos desde el último "empezar de nuevo" */
  moves: number;
  phase: Phase;
  score: number;
  solvedCount: number;
  /** el último resuelto: cuándo, con cuántos movimientos y qué sumó */
  solvedT: number;
  lastGain: { base: number; bonus: number; moves: number; minMoves: number } | null;
}

export function newRun(seed: string, firstPuzzle = 1): Run {
  const puzzle = puzzleAt(seed, firstPuzzle);
  return { seed, t: 0, index: firstPuzzle - 1, puzzle, pos: [...puzzle.start], moves: 0, phase: "playing", score: 0, solvedCount: 0, solvedT: -1, lastGain: null };
}

export function gainFor(moves: number, minMoves: number): { base: number; bonus: number } {
  return { base: BASE_POINTS, bonus: Math.max(0, BONUS_MAX - BONUS_PER_MOVE * Math.max(0, moves - minMoves)) };
}

/** lleva la partida hasta el instante `t` (nunca para atrás) */
export function advance(run: Run, t: number): void {
  const target = Math.min(DURATION_MS, Math.max(run.t, t));
  if (run.phase === "leaving" && run.solvedT + NEXT_MS <= target) {
    const next = run.index + 2;
    run.index = next - 1;
    run.puzzle = puzzleAt(run.seed, next);
    run.pos = [...run.puzzle.start];
    run.moves = 0;
    run.phase = "playing";
  }
  run.t = target;
  if (target >= DURATION_MS) run.phase = "over";
}

export type MoveOutcome = "ok" | "auto" | "quieto" | "imposible" | "fin";
/** desliza el auto `car` `delta` casillas en el instante `t` */
export function move(run: Run, t: number, car: number, delta: number): MoveOutcome {
  advance(run, t);
  if (run.phase !== "playing") return "fin";
  if (!Number.isInteger(car) || car < 0 || car >= run.puzzle.cars.length) return "auto";
  if (!Number.isInteger(delta) || delta === 0) return "quieto";
  const { min, max } = legalRange(run.puzzle.cars, run.pos, car);
  if (delta < min || delta > max) return "imposible";
  run.pos[car] = run.pos[car]! + delta;
  run.moves++;
  if (isSolved(run.pos)) {
    const g = gainFor(run.moves, run.puzzle.minMoves);
    run.score += g.base + g.bonus;
    run.solvedCount++;
    run.solvedT = t;
    run.lastGain = { ...g, moves: run.moves, minMoves: run.puzzle.minMoves };
    run.phase = "leaving";
  }
  return "ok";
}

export type ResetOutcome = "ok" | "fin";
/** "empezar de nuevo": el estacionamiento vuelve al principio y los movimientos a 0; el reloj sigue */
export function reset(run: Run, t: number): ResetOutcome {
  advance(run, t);
  if (run.phase !== "playing") return "fin";
  run.pos = [...run.puzzle.start];
  run.moves = 0;
  return "ok";
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

export type ParkingEvent = { t: number; puzzle: number; type: "move"; car: number; delta: number } | { t: number; puzzle: number; type: "reset" };

export type CheckResult = { ok: true; score: number; run: Run } | { ok: false; reason: string };

function parseEvent(e: unknown): ParkingEvent | null {
  if (!e || typeof e !== "object") return null;
  const { t, puzzle, type, car, delta } = e as Record<string, unknown>;
  if (typeof t !== "number" || !Number.isInteger(t) || t < 0) return null;
  if (typeof puzzle !== "number" || !Number.isInteger(puzzle) || puzzle < 1) return null;
  if (type === "reset") return { t, puzzle, type };
  if (type === "move" && typeof car === "number" && Number.isInteger(car) && typeof delta === "number" && Number.isInteger(delta)) return { t, puzzle, type, car, delta };
  return null;
}

/** rearma los estacionamientos con la semilla (la del jugador), recalcula los mínimos y vuelve a jugar la traza */
export function check(seed: string, events: unknown, elapsedMs?: number): CheckResult {
  if (!Array.isArray(events)) return { ok: false, reason: "la traza no es una lista" };
  const run = newRun(seed);
  let prevT = -1;
  for (const raw of events) {
    const e = parseEvent(raw);
    if (!e) return { ok: false, reason: "evento mal formado" };
    if (e.t < prevT) return { ok: false, reason: "tiempos fuera de orden" };
    if (prevT >= 0 && e.t - prevT < MIN_GAP_MS) return { ok: false, reason: "dos movimientos demasiado seguidos" };
    if (e.t > DURATION_MS + END_MARGIN_MS) return { ok: false, reason: "evento después de los 120 s" };
    prevT = e.t;
    advance(run, e.t);
    if (run.phase === "over") return { ok: false, reason: "evento después del cierre" };
    if (run.phase === "leaving") return { ok: false, reason: "movimiento mientras sale el sunny" };
    if (e.puzzle !== run.index + 1) return { ok: false, reason: "el estacionamiento no es el que corresponde" };
    if (e.type === "move") {
      const out = move(run, e.t, e.car, e.delta);
      if (out === "auto") return { ok: false, reason: "auto que no existe" };
      if (out === "quieto") return { ok: false, reason: "movimiento sin cambio" };
      if (out === "imposible") return { ok: false, reason: "movimiento imposible: atraviesa otro auto o sale de la grilla" };
      if (out !== "ok") return { ok: false, reason: "movimiento fuera de la partida" };
    } else if (reset(run, e.t) !== "ok") return { ok: false, reason: "reinicio fuera de la partida" };
  }
  advance(run, DURATION_MS);
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(DURATION_MS, 1000, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: run.score, run };
}

export function validate(result: { score: number; events: unknown[] }, seed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(seed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

/** la cota de plausibilidad: cada estacionamiento con su solución óptima a un movimiento cada 80 ms, hasta llenar los 120 s */
export function maxScore(): number {
  let t = 0;
  let score = 0;
  for (let i = 1; ; i++) {
    const row = rowFor(i);
    const solvedAt = t + row.moves[0] * MIN_GAP_MS;
    if (solvedAt > DURATION_MS) return score;
    score += BASE_POINTS + BONUS_MAX;
    t = solvedAt + NEXT_MS;
  }
}
export const MAX_SCORE = maxScore();

// ---------------------------------------------------------------------------
// el jugador automático (calibración, herramienta y E2E)
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** ms mirando el estacionamiento antes del primer movimiento */
  think?: number;
  /** ms entre movimientos */
  perMove?: number;
  /** movimientos de más por estacionamiento (un ida y vuelta cada uno, sin perder la solución) */
  extra?: number;
  /** resuelve estos estacionamientos y para */
  solveOnly?: number;
}

/** el jugador modelo (decisión 270) */
export const MODEL: BotOptions = { think: 4_000, perMove: 1_300, extra: 1 };

export function botTrace(seed: string, opts: BotOptions = {}): { events: ParkingEvent[]; run: Run } {
  const think = opts.think ?? 4_000;
  const perMove = opts.perMove ?? 1_300;
  const extra = opts.extra ?? 1;
  const run = newRun(seed);
  const events: ParkingEvent[] = [];
  let t = 0;
  while (run.phase !== "over") {
    if (opts.solveOnly !== undefined && run.solvedCount >= opts.solveOnly) break;
    const startT = run.phase === "playing" ? Math.max(t, run.solvedT < 0 ? 0 : run.solvedT + NEXT_MS) : run.solvedT + NEXT_MS;
    t = startT + think;
    advance(run, t);
    if ((run.phase as Phase) !== "playing") break;
    const puzzle = run.index + 1;
    const sol = solve(run.puzzle.cars, run.puzzle.start)!;
    const plan: Move[] = [];
    // un ida y vuelta de más con el primer auto negro que pueda, al principio
    for (let k = 0; k < extra; k++) {
      const lm = legalMoves(run.puzzle.cars, run.puzzle.start).filter((m) => m.car !== 0);
      if (lm.length === 0) break;
      const m = lm[k % lm.length]!;
      plan.push(m, { car: m.car, delta: -m.delta });
    }
    plan.push(...sol.path);
    let done = false;
    for (const m of plan) {
      if (t >= DURATION_MS) break;
      advance(run, t);
      if (run.phase !== "playing") break;
      events.push({ t, puzzle, type: "move", car: m.car, delta: m.delta });
      const out = move(run, t, m.car, m.delta);
      if (out !== "ok") throw new Error(`el jugador automático hizo un movimiento ${out}`);
      if ((run.phase as Phase) === "leaving") done = true;
      t += perMove;
    }
    if (!done) break;
  }
  advance(run, DURATION_MS);
  return { events, run };
}
