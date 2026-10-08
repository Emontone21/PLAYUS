// Reglas de "Dale un trago al pibe": una grilla de caños girados al azar
// entre la damajuana (arriba) y la boca del pibe (abajo). Tocar un caño lo
// gira 90° en sentido horario; cuando se acaba el tiempo del puzzle, o al
// tocar la damajuana, el vino entra y corre a velocidad fija por los caños;
// si llega a la boca, el puzzle cuenta y viene el siguiente; si se derrama, se
// termina. Los puzzles salen de la semilla del intento (que acá es por
// jugador, decisión 265) con la dificultad controlada por tabla
// (`pipePuzzles`); la partida es una máquina de estados en ms desde onReady,
// la misma en el cliente y en `validate`, que rearma los puzzles y vuelve a
// jugar la traza. Sin DOM.

import { rngFromSeed, type Rng } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const DURATION_MS = 150_000;
/** margen chico después de los 150 s (el reloj del juego y el del contenedor no son el mismo) */
export const END_MARGIN_MS = 500;
/** dos toques a menos de esto no son humanos */
export const MIN_GAP_MS = 60;
/** el derrame se ve esto antes de onFinish */
export const SPILL_HOLD_MS = 1_000;
/** el pibe toma y aparece la grilla siguiente a los… */
export const NEXT_MS = 900;
export const ELAPSED_SLACK_MS = 10_000;
export const BASE_POINTS = 100;
export const BONUS_PER_S = 10;
/** puzzles generados de sobra por semilla (los que sigan se generan igual, de a uno) */
export const PUZZLE_COUNT = 20;

// ---------------------------------------------------------------------------
// fichas y direcciones
// ---------------------------------------------------------------------------

/** lados: 0 norte, 1 este, 2 sur, 3 oeste; como máscara, bit = 1 << lado */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly Dir[] = [0, 1, 2, 3];
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const bit = (d: Dir): number => 1 << d;

export type Kind = "recta" | "curva" | "te";
/** las bocas con giro 0: recta norte-sur, curva norte-este, T abierta al norte, este y sur (cerrada al oeste) */
export const BASE_MASK: Record<Kind, number> = { recta: bit(0) | bit(2), curva: bit(0) | bit(1), te: bit(0) | bit(1) | bit(2) };
/** cuántos giros distintos tiene cada ficha */
export const PERIOD: Record<Kind, number> = { recta: 2, curva: 4, te: 4 };

/** gira una máscara de bocas `rot` cuartos en sentido horario (norte → este → sur → oeste) */
export function rotMask(mask: number, rot: number): number {
  let m = mask;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
}
export function openings(kind: Kind, rot: number): number {
  return rotMask(BASE_MASK[kind], rot);
}
/** cuántos toques (giros horarios) hay de `from` a `to` en una ficha de ese tipo */
export function turnsBetween(kind: Kind, from: number, to: number): number {
  const p = PERIOD[kind];
  return (((to - from) % p) + p) % p;
}

export interface Tile {
  kind: Kind;
  /** giro inicial (0 a 3) */
  rot: number;
}

export interface Puzzle {
  /** desde 1 */
  index: number;
  cols: number;
  rows: number;
  /** la columna de la entrada (fila 0) y la de la salida (última fila) */
  inCol: number;
  outCol: number;
  tiles: Tile[];
  /** las casillas del camino, de la entrada a la salida */
  path: number[];
  /** el giro resuelto de cada casilla del camino y de las que tapan una T; null para los señuelos sueltos */
  solved: (number | null)[];
  timeMs: number;
  /** cuánto tarda el vino en recorrer una ficha */
  flowMs: number;
  metrics: { len: number; turns: number; needed: number; tees: number };
}

// ---------------------------------------------------------------------------
// la dificultad
// ---------------------------------------------------------------------------

export interface Row {
  from: number;
  cols: number;
  rows: number;
  len: [number, number];
  turns: [number, number];
  needed: [number, number];
  timeMs: number;
}

export const TABLE: readonly Row[] = [
  { from: 1, cols: 4, rows: 5, len: [6, 7], turns: [2, 3], needed: [7, 9], timeMs: 25_000 },
  { from: 2, cols: 5, rows: 6, len: [8, 10], turns: [3, 5], needed: [10, 13], timeMs: 22_000 },
  { from: 4, cols: 5, rows: 7, len: [10, 12], turns: [5, 7], needed: [13, 17], timeMs: 20_000 },
  { from: 7, cols: 6, rows: 7, len: [12, 14], turns: [6, 8], needed: [16, 20], timeMs: 17_000 },
  { from: 10, cols: 6, rows: 8, len: [14, 16], turns: [7, 9], needed: [19, 23], timeMs: 16_000 },
];

export function rowFor(index: number): Row {
  let r = TABLE[0]!;
  for (const row of TABLE) if (index >= row.from) r = row;
  return r;
}
/** el tiempo del puzzle: la tabla, y desde el 10 baja 1 s por puzzle con piso de 12 s */
export function timeMsFor(index: number): number {
  if (index >= 10) return Math.max(12_000, 16_000 - (index - 10) * 1_000);
  return rowFor(index).timeMs;
}
/** el vino tarda 350 ms por ficha al principio y 250 desde el puzzle 11 */
export function flowMsFor(index: number): number {
  return Math.max(250, 350 - (index - 1) * 10);
}
/** cuántas T puede tener el camino */
export function teesFor(index: number): number {
  return index >= 7 ? 2 : index >= 4 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// la generación
// ---------------------------------------------------------------------------

const inside = (c: number, r: number, cols: number, rows: number) => c >= 0 && r >= 0 && c < cols && r < rows;

/** un camino de la entrada a la salida, sin repetir casillas, de largo entre lenMin y lenMax; null si no sale */
function findPath(rng: Rng, cols: number, rows: number, inCol: number, outCol: number, lenMin: number, lenMax: number): number[] | null {
  const visited = new Uint8Array(cols * rows);
  const path: number[] = [];
  let steps = 0;
  const goalC = outCol;
  const goalR = rows - 1;
  function dfs(c: number, r: number): boolean {
    if (++steps > 4000) return false;
    const i = r * cols + c;
    visited[i] = 1;
    path.push(i);
    if (c === goalC && r === goalR) {
      if (path.length >= lenMin && path.length <= lenMax) return true;
    } else if (path.length < lenMax) {
      const remaining = lenMax - path.length;
      if (Math.abs(c - goalC) + Math.abs(r - goalR) <= remaining) {
        for (const d of rng.shuffle(DIRS)) {
          const nc = c + DX[d];
          const nr = r + DY[d];
          if (!inside(nc, nr, cols, rows) || visited[nr * cols + nc]) continue;
          if (dfs(nc, nr)) return true;
          if (steps > 4000) return false;
        }
      }
    }
    path.pop();
    visited[i] = 0;
    return false;
  }
  return dfs(inCol, 0) ? path : null;
}

/** de qué lado entra el vino a la casilla i del camino y por cuál sale */
function sidesAlong(path: number[], cols: number): { inSide: Dir; outSide: Dir }[] {
  const dirTo = (a: number, b: number): Dir => {
    const dc = (b % cols) - (a % cols);
    const dr = Math.floor(b / cols) - Math.floor(a / cols);
    return dc === 1 ? 1 : dc === -1 ? 3 : dr === 1 ? 2 : 0;
  };
  return path.map((cell, i) => {
    const inSide: Dir = i === 0 ? 0 : opposite(dirTo(path[i - 1]!, cell));
    const outSide: Dir = i === path.length - 1 ? 2 : dirTo(cell, path[i + 1]!);
    return { inSide, outSide };
  });
}

/** ¿una ficha de ese tipo puede conectar esos dos lados con algún giro? */
function canJoin(kind: Kind, a: Dir, b: Dir): boolean {
  if (a === b) return false;
  if (kind === "te") return true;
  const opp = opposite(a) === b;
  return kind === "recta" ? opp : !opp;
}

/** el giro con el que una ficha conecta exactamente esos lados (la T, con una boca extra); los candidatos, en orden de giro */
function rotsJoining(kind: Kind, a: Dir, b: Dir): number[] {
  const need = bit(a) | bit(b);
  const out: number[] = [];
  for (let rot = 0; rot < PERIOD[kind]; rot++) if ((openings(kind, rot) & need) === need) out.push(rot);
  return out;
}

/**
 * Las rutas más cortas posibles de la entrada a la salida, dejando girar cada
 * ficha como se quiera: la distancia (en fichas), cuántas rutas de esa
 * distancia hay, y una de ellas. Sirve para exigir que la solución sea única.
 */
export function shortestRoutes(p: { cols: number; rows: number; inCol: number; outCol: number; tiles: { kind: Kind }[] }): { dist: number; count: number; route: number[] } {
  const { cols, rows } = p;
  const n = cols * rows;
  // estado: casilla × lado de entrada
  const dist = new Int32Array(n * 4).fill(-1);
  const count = new Float64Array(n * 4);
  const parent = new Int32Array(n * 4).fill(-1);
  const start = p.inCol * 4 + 0;
  dist[start] = 1;
  count[start] = 1;
  const queue = [start];
  let goalDist = -1;
  let goalCount = 0;
  let goalState = -1;
  for (let qi = 0; qi < queue.length; qi++) {
    const s = queue[qi]!;
    const cell = s >> 2;
    const es = (s & 3) as Dir;
    const d = dist[s]!;
    if (goalDist >= 0 && d > goalDist) continue;
    const c = cell % cols;
    const r = Math.floor(cell / cols);
    const kind = p.tiles[cell]!.kind;
    for (const x of DIRS) {
      if (!canJoin(kind, es, x)) continue;
      const nc = c + DX[x];
      const nr = r + DY[x];
      if (!inside(nc, nr, cols, rows)) {
        if (x === 2 && r === rows - 1 && c === p.outCol) {
          if (goalDist < 0) {
            goalDist = d;
            goalState = s;
          }
          if (d === goalDist) goalCount += count[s]!;
        }
        continue;
      }
      const ns = (nr * cols + nc) * 4 + opposite(x);
      if (dist[ns]! < 0) {
        dist[ns] = d + 1;
        count[ns] = count[s]!;
        parent[ns] = s;
        queue.push(ns);
      } else if (dist[ns] === d + 1) count[ns] += count[s]!;
    }
  }
  const route: number[] = [];
  for (let s = goalState; s >= 0; s = parent[s]!) route.unshift(s >> 2);
  return { dist: goalDist, count: goalCount, route };
}

/** cuántos toques hacen falta en cada casilla para dejar el puzzle resuelto (las del camino y las que tapan una T) */
export function neededTurns(p: Puzzle): { cell: number; turns: number }[] {
  const out: { cell: number; turns: number }[] = [];
  p.solved.forEach((rot, cell) => {
    if (rot === null) return;
    const t = p.tiles[cell]!;
    out.push({ cell, turns: turnsBetween(t.kind, t.rot, rot) });
  });
  return out;
}

function tryPuzzle(rng: Rng, index: number): Puzzle | null {
  const row = rowFor(index);
  const { cols, rows } = row;
  const inCol = rng.int(0, cols - 1);
  const outCol = rng.int(0, cols - 1);
  const path = findPath(rng, cols, rows, inCol, outCol, row.len[0], row.len[1]);
  if (!path) return null;
  const n = cols * rows;
  const onPath = new Uint8Array(n);
  for (const c of path) onPath[c] = 1;
  const sides = sidesAlong(path, cols);
  const turns = sides.filter((s) => opposite(s.inSide) !== s.outSide).length;
  if (turns < row.turns[0] || turns > row.turns[1]) return null;

  const tiles: Tile[] = [];
  const solved: (number | null)[] = new Array<number | null>(n).fill(null);
  // los señuelos
  const teeShare = index >= 4 ? 0.15 : 0;
  for (let i = 0; i < n; i++) {
    const kind: Kind = rng.next() < teeShare ? "te" : rng.next() < 0.5 ? "recta" : "curva";
    tiles.push({ kind, rot: rng.int(0, 3) });
  }
  // el camino: recta o curva según los lados; algunas pasan a T, con la boca extra hacia un señuelo que la tapa
  const kinds: Kind[] = sides.map((s) => (opposite(s.inSide) === s.outSide ? "recta" : "curva"));
  const solvedRot: number[] = sides.map((s, i) => rotsJoining(kinds[i]!, s.inSide, s.outSide)[0]!);
  const caps: { cell: number; kind: Kind; facing: Dir }[] = [];
  let tees = 0;
  const wantTees = teesFor(index);
  if (wantTees > 0) {
    for (const i of rng.shuffle(path.map((_, i) => i))) {
      if (tees >= wantTees) break;
      const { inSide, outSide } = sides[i]!;
      const cands = rotsJoining("te", inSide, outSide).filter((rot) => {
        const extra = DIRS.find((d) => d !== inSide && d !== outSide && openings("te", rot) & bit(d))!;
        const c = (path[i]! % cols) + DX[extra];
        const r = Math.floor(path[i]! / cols) + DY[extra];
        return inside(c, r, cols, rows) && !onPath[r * cols + c] && !caps.some((x) => x.cell === r * cols + c);
      });
      if (cands.length === 0) continue;
      const rot = rng.pick(cands);
      const extra = DIRS.find((d) => d !== inSide && d !== outSide && openings("te", rot) & bit(d))!;
      kinds[i] = "te";
      solvedRot[i] = rot;
      const capCell = (Math.floor(path[i]! / cols) + DY[extra]) * cols + (path[i]! % cols) + DX[extra];
      caps.push({ cell: capCell, kind: rng.next() < 0.5 ? "recta" : "curva", facing: opposite(extra) });
      tees++;
    }
  }
  // las vueltas necesarias: cada ficha del camino arranca mal puesta (1 toque las rectas, 1 a 3 las curvas y las T) y
  // cada tapa arranca abierta hacia la T (1 toque si es recta, 1 o 2 si es curva); el total se elige dentro del rango de la fila
  const items: { lo: number; hi: number; turns: number }[] = [];
  for (let i = 0; i < path.length; i++) items.push(kinds[i] === "recta" ? { lo: 1, hi: 1, turns: 1 } : { lo: 1, hi: 3, turns: 1 });
  for (const cap of caps) items.push(cap.kind === "recta" ? { lo: 1, hi: 1, turns: 1 } : { lo: 1, hi: 2, turns: 1 });
  const target = rng.int(row.needed[0], row.needed[1]);
  const lo = items.reduce((a, x) => a + x.lo, 0);
  const hi = items.reduce((a, x) => a + x.hi, 0);
  if (target < lo || target > hi) return null;
  let sum = lo;
  while (sum < target) {
    const open = items.filter((x) => x.turns < x.hi);
    rng.pick(open).turns++;
    sum++;
  }
  for (let i = 0; i < path.length; i++) {
    const cell = path[i]!;
    const kind = kinds[i]!;
    const rot = solvedRot[i]!;
    tiles[cell] = { kind, rot: (((rot - items[i]!.turns) % 4) + 4) % 4 };
    solved[cell] = rot % PERIOD[kind];
  }
  caps.forEach((cap, k) => {
    const want = items[path.length + k]!.turns;
    const closedRots = [0, 1, 2, 3].filter((r) => !(openings(cap.kind, r) & bit(cap.facing)));
    const openRots = [0, 1, 2, 3].filter((r) => openings(cap.kind, r) & bit(cap.facing));
    const best = (from: number) => closedRots.reduce((b, r) => (turnsBetween(cap.kind, from, r) < turnsBetween(cap.kind, from, b) ? r : b), closedRots[0]!);
    const choices = openRots.filter((r) => turnsBetween(cap.kind, r, best(r)) === want);
    const capRot = rng.pick(choices.length ? choices : openRots);
    tiles[cap.cell] = { kind: cap.kind, rot: capRot };
    solved[cap.cell] = best(capRot) % PERIOD[cap.kind];
  });
  // una sola ruta más corta: la del camino. Si los señuelos arman otra, se cambia una ficha de esa ruta
  const proto = { cols, rows, inCol, outCol, tiles };
  const isCap = (c: number) => caps.some((x) => x.cell === c);
  for (let fix = 0; fix < 60; fix++) {
    const sr = shortestRoutes(proto);
    if (sr.dist === path.length && sr.count === 1) break;
    if (fix === 59) return null;
    // la ruta a romper: la más corta si es más corta; si es otra de igual largo, una que no sea el camino
    let route = sr.route;
    if (sr.dist === path.length && route.every((c, i) => c === path[i])) route = alternativeRoute(proto, path) ?? [];
    const decoys = route.filter((c) => !onPath[c] && !isCap(c));
    if (decoys.length === 0) return null;
    const c = rng.pick(decoys);
    const t = tiles[c]!;
    tiles[c] = { kind: t.kind === "recta" ? "curva" : t.kind === "curva" ? "recta" : "curva", rot: rng.int(0, 3) };
  }
  const puzzle: Puzzle = { index, cols, rows, inCol, outCol, tiles, path, solved, timeMs: timeMsFor(index), flowMs: flowMsFor(index), metrics: { len: path.length, turns, needed: 0, tees } };
  const needed = neededTurns(puzzle).reduce((a, x) => a + x.turns, 0);
  puzzle.metrics.needed = needed;
  if (needed !== target || neededTurns(puzzle).some((x) => x.turns === 0)) return null;
  return puzzle;
}

/** otra ruta del largo mínimo que no sea el camino (la que encuentra una búsqueda en profundidad), o null */
function alternativeRoute(p: { cols: number; rows: number; inCol: number; outCol: number; tiles: { kind: Kind }[] }, path: number[]): number[] | null {
  const { cols, rows } = p;
  const limit = path.length;
  const route: number[] = [];
  const used = new Uint8Array(cols * rows);
  let steps = 0;
  function dfs(c: number, r: number, es: Dir): boolean {
    if (++steps > 20000) return false;
    const cell = r * cols + c;
    route.push(cell);
    used[cell] = 1;
    const kind = p.tiles[cell]!.kind;
    if (route.length <= limit) {
      for (const x of DIRS) {
        if (!canJoin(kind, es, x)) continue;
        const nc = c + DX[x];
        const nr = r + DY[x];
        if (!inside(nc, nr, cols, rows)) {
          if (x === 2 && r === rows - 1 && c === p.outCol && route.length === limit && !route.every((v, i) => v === path[i])) return true;
          continue;
        }
        const ncell = nr * cols + nc;
        if (used[ncell]) continue;
        if (route.length + 1 + Math.abs(nc - p.outCol) + Math.abs(nr - (rows - 1)) > limit) continue;
        if (dfs(nc, nr, opposite(x))) return true;
      }
    }
    route.pop();
    used[cell] = 0;
    return false;
  }
  return dfs(p.inCol, 0, 0) ? route : null;
}

/** el puzzle `index` (desde 1) de una semilla: determinístico y dentro de todos los rangos de su fila de la tabla */
export function puzzleAt(seed: string, index: number): Puzzle {
  const rng = rngFromSeed(`trago:${seed}:${index}`);
  for (let attempt = 0; attempt < 400; attempt++) {
    const p = tryPuzzle(rng, index);
    if (p) return p;
  }
  // no pasa en la práctica (el test lo comprueba en 10.000 semillas): antes que colgarse, el primero que tenga solución única
  for (;;) {
    const p = tryPuzzle(rng, index);
    if (p) return p;
  }
}

/** los primeros `count` puzzles de la semilla del intento */
export function pipePuzzles(seed: string, count = PUZZLE_COUNT): Puzzle[] {
  return Array.from({ length: count }, (_, i) => puzzleAt(seed, i + 1));
}

// ---------------------------------------------------------------------------
// la partida (ms desde onReady)
// ---------------------------------------------------------------------------

export type Phase = "solving" | "flowing" | "drinking" | "spilled" | "over";

export interface Wet {
  /** cuándo entró el vino */
  at: number;
  /** por qué lado */
  from: Dir;
  /** cuántas bocas de salida tiene, cuántas van a algún lado y cuántas quedaron tapadas */
  exits: number;
  flowing: number;
  capped: number;
}

export interface Spill {
  cell: number;
  side: Dir;
  at: number;
}

export interface Run {
  seed: string;
  t: number;
  /** el puzzle en curso, desde 0 */
  index: number;
  puzzle: Puzzle;
  /** los giros actuales de cada casilla */
  rots: number[];
  phase: Phase;
  /** cuándo apareció el puzzle y cuándo se le acaba el tiempo */
  startT: number;
  deadline: number;
  /** cuándo entró el vino (-1 si todavía no) y si fue por tocar la damajuana */
  pourT: number;
  tapped: boolean;
  wet: Map<number, Wet>;
  /** las bocas por las que el vino va a salir, ordenadas por tiempo */
  frontier: { t: number; cell: number; side: Dir; seq: number }[];
  seq: number;
  score: number;
  solvedCount: number;
  /** el último puzzle resuelto: cuándo, y qué sumó */
  solvedT: number;
  lastGain: { base: number; bonus: number } | null;
  spill: Spill | null;
  /** cuándo termina la partida (derrame + lo que se ve, o los 150 s) */
  endT: number;
}

export function newRun(seed: string, firstPuzzle = 1): Run {
  const run: Run = {
    seed,
    t: 0,
    index: firstPuzzle - 1,
    puzzle: puzzleAt(seed, firstPuzzle),
    rots: [],
    phase: "solving",
    startT: 0,
    deadline: 0,
    pourT: -1,
    tapped: false,
    wet: new Map(),
    frontier: [],
    seq: 0,
    score: 0,
    solvedCount: 0,
    solvedT: -1,
    lastGain: null,
    spill: null,
    endT: DURATION_MS,
  };
  startPuzzle(run, firstPuzzle, 0);
  return run;
}

function startPuzzle(run: Run, index: number, t: number): void {
  run.index = index - 1;
  run.puzzle = index === run.puzzle.index ? run.puzzle : puzzleAt(run.seed, index);
  run.rots = run.puzzle.tiles.map((x) => x.rot);
  run.phase = "solving";
  run.startT = t;
  run.deadline = t + run.puzzle.timeMs;
  run.pourT = -1;
  run.tapped = false;
  run.wet = new Map();
  run.frontier = [];
}

export function openingsAt(run: Run, cell: number): number {
  return openings(run.puzzle.tiles[cell]!.kind, run.rots[cell]!);
}

function enter(run: Run, cell: number, from: Dir, at: number): void {
  const mask = openingsAt(run, cell) & ~bit(from);
  const exits = DIRS.filter((d) => mask & bit(d));
  run.wet.set(cell, { at, from, exits: exits.length, flowing: 0, capped: 0 });
  for (const side of exits) pushFrontier(run, { t: at + run.puzzle.flowMs, cell, side, seq: run.seq++ });
}

function pushFrontier(run: Run, f: { t: number; cell: number; side: Dir; seq: number }): void {
  let i = run.frontier.length;
  while (i > 0 && (run.frontier[i - 1]!.t > f.t || (run.frontier[i - 1]!.t === f.t && run.frontier[i - 1]!.seq > f.seq))) i--;
  run.frontier.splice(i, 0, f);
}

function spillAt(run: Run, cell: number, side: Dir, at: number): void {
  run.spill = { cell, side, at };
  run.phase = "spilled";
  run.frontier = [];
  run.endT = Math.min(DURATION_MS, at + SPILL_HOLD_MS);
}

function solveAt(run: Run, at: number): void {
  const left = run.tapped ? Math.max(0, Math.floor((run.deadline - run.pourT) / 1000)) : 0;
  const bonus = left * BONUS_PER_S;
  run.score += BASE_POINTS + bonus;
  run.solvedCount++;
  run.solvedT = at;
  run.lastGain = { base: BASE_POINTS, bonus };
  run.phase = "drinking";
  run.frontier = [];
}

/** procesa una boca por la que sale el vino */
function flowOut(run: Run, f: { t: number; cell: number; side: Dir }): void {
  const p = run.puzzle;
  const c = f.cell % p.cols;
  const r = Math.floor(f.cell / p.cols);
  const nc = c + DX[f.side];
  const nr = r + DY[f.side];
  const me = run.wet.get(f.cell)!;
  if (!inside(nc, nr, p.cols, p.rows)) {
    if (f.side === 2 && r === p.rows - 1 && c === p.outCol) {
      me.flowing++;
      solveAt(run, f.t);
      return;
    }
    spillAt(run, f.cell, f.side, f.t);
    return;
  }
  const n = nr * p.cols + nc;
  if (openingsAt(run, n) & bit(opposite(f.side))) {
    me.flowing++;
    if (!run.wet.has(n)) enter(run, n, opposite(f.side), f.t);
    return;
  }
  // la boca da contra un caño cerrado: queda tapada; si todas las salidas de la ficha quedaron tapadas, el vino no tiene por dónde seguir
  me.capped++;
  if (me.capped >= me.exits) spillAt(run, f.cell, f.side, f.t);
}

/** lleva la partida hasta el instante `t` (nunca para atrás) */
export function advance(run: Run, t: number): void {
  const target = Math.min(DURATION_MS, Math.max(run.t, t));
  for (;;) {
    if (run.phase === "spilled" || run.phase === "over") break;
    if (run.phase === "solving") {
      if (run.deadline <= target) {
        pourAt(run, run.deadline, false);
        continue;
      }
      break;
    }
    if (run.phase === "flowing") {
      const f = run.frontier[0];
      if (f && f.t <= target) {
        run.frontier.shift();
        flowOut(run, f);
        continue;
      }
      if (!f) {
        // el vino dio vueltas y se encontró consigo mismo: no tiene por dónde seguir
        const last = [...run.wet.entries()].sort((a, b) => b[1].at - a[1].at)[0]!;
        spillAt(run, last[0], last[1].from, Math.max(run.t, last[1].at + run.puzzle.flowMs));
        continue;
      }
      break;
    }
    if (run.phase === "drinking") {
      const nextT = run.solvedT + NEXT_MS;
      if (nextT <= target) {
        startPuzzle(run, run.index + 2, nextT);
        continue;
      }
      break;
    }
  }
  run.t = target;
  if (run.phase !== "spilled" && target >= DURATION_MS) run.phase = "over";
  if (run.phase === "spilled" && target >= run.endT) run.phase = "over";
}

function pourAt(run: Run, t: number, tapped: boolean): void {
  run.phase = "flowing";
  run.pourT = t;
  run.tapped = tapped;
  const first = run.puzzle.inCol;
  if (openingsAt(run, first) & bit(0)) enter(run, first, 0, t);
  else spillAt(run, first, 0, t);
}

export type RotateOutcome = "ok" | "mojada" | "invalida" | "fin";
/** gira la casilla `cell` en el instante `t` */
export function rotate(run: Run, t: number, cell: number): RotateOutcome {
  advance(run, t);
  if (run.phase !== "solving" && run.phase !== "flowing") return "fin";
  if (!Number.isInteger(cell) || cell < 0 || cell >= run.rots.length) return "invalida";
  if (run.wet.has(cell)) return "mojada";
  run.rots[cell] = (run.rots[cell]! + 1) % 4;
  return "ok";
}

export type PourOutcome = "ok" | "no";
/** toca la damajuana en el instante `t`: larga el vino antes de tiempo */
export function pour(run: Run, t: number): PourOutcome {
  advance(run, t);
  if (run.phase !== "solving") return "no";
  pourAt(run, t, true);
  return "ok";
}

/** cuánto le queda al puzzle en curso (ms, 0 si ya corre el vino) */
export function timeLeft(run: Run): number {
  return run.phase === "solving" ? Math.max(0, run.deadline - run.t) : 0;
}

/** ¿las fichas del camino (y las que tapan) están como deben? */
export function isSolved(run: Run): boolean {
  return run.puzzle.solved.every((rot, cell) => rot === null || turnsBetween(run.puzzle.tiles[cell]!.kind, run.rots[cell]!, rot) === 0);
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

export type PipeEvent = { t: number; puzzle: number; type: "rotate"; cell: number } | { t: number; puzzle: number; type: "pour" };

export type CheckResult = { ok: true; score: number; run: Run } | { ok: false; reason: string };

function parseEvent(e: unknown): PipeEvent | null {
  if (!e || typeof e !== "object") return null;
  const { t, puzzle, type, cell } = e as Record<string, unknown>;
  if (typeof t !== "number" || !Number.isInteger(t) || t < 0) return null;
  if (typeof puzzle !== "number" || !Number.isInteger(puzzle) || puzzle < 1) return null;
  if (type === "pour") return { t, puzzle, type };
  if (type === "rotate" && typeof cell === "number" && Number.isInteger(cell)) return { t, puzzle, type, cell };
  return null;
}

/** rearma los puzzles con la semilla (la del jugador) y vuelve a jugar la traza */
export function check(seed: string, events: unknown, elapsedMs?: number): CheckResult {
  if (!Array.isArray(events)) return { ok: false, reason: "la traza no es una lista" };
  const run = newRun(seed);
  let prevT = -1;
  for (const raw of events) {
    const e = parseEvent(raw);
    if (!e) return { ok: false, reason: "evento mal formado" };
    if (e.t < prevT) return { ok: false, reason: "tiempos fuera de orden" };
    if (prevT >= 0 && e.t - prevT < MIN_GAP_MS) return { ok: false, reason: "dos toques demasiado seguidos" };
    if (e.t > DURATION_MS + END_MARGIN_MS) return { ok: false, reason: "evento después de los 150 s" };
    prevT = e.t;
    advance(run, e.t);
    if (run.phase === "spilled" || run.phase === "over") return { ok: false, reason: run.phase === "spilled" ? "evento después del derrame" : "evento después del final" };
    if (e.puzzle !== run.index + 1) return { ok: false, reason: "el puzzle no es el que corresponde" };
    if (e.type === "rotate") {
      const out = rotate(run, e.t, e.cell);
      if (out === "mojada") return { ok: false, reason: "giro sobre una ficha con vino" };
      if (out === "invalida") return { ok: false, reason: "casilla que no existe" };
      if (out !== "ok") return { ok: false, reason: "giro fuera de la partida" };
    } else if (pour(run, e.t) !== "ok") return { ok: false, reason: "más de un pour en el puzzle" };
  }
  advance(run, DURATION_MS);
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(run.endT, 1000, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: run.score, run };
}

export function validate(result: { score: number; events: unknown[] }, seed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(seed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

/**
 * La cota de plausibilidad: el mejor caso imaginable, con cada puzzle
 * resuelto al instante (un toque cada 60 ms), la damajuana tocada enseguida
 * y el vino recorriendo el camino más corto posible, hasta llenar los 150 s.
 */
export function maxScore(): number {
  let t = 0;
  let score = 0;
  for (let i = 1; ; i++) {
    const row = rowFor(i);
    const taps = row.needed[0] * MIN_GAP_MS;
    const flow = row.len[0] * flowMsFor(i);
    const solvedAt = t + taps + flow;
    if (solvedAt > DURATION_MS) return score;
    score += BASE_POINTS + Math.floor((timeMsFor(i) - taps) / 1000) * BONUS_PER_S;
    t = solvedAt + NEXT_MS;
  }
}
export const MAX_SCORE = maxScore();

// ---------------------------------------------------------------------------
// el jugador automático (calibración, herramienta y E2E)
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** ms mirando la grilla antes del primer toque de cada puzzle */
  think?: number;
  /** ms entre toques */
  tap?: number;
  /** ms entre el último toque y tocar la damajuana (si no toca, deja que se acabe el tiempo) */
  pourAfter?: number | null;
  /** resuelve estos puzzles y en el siguiente toca la damajuana enseguida (se derrama); undefined: sigue hasta el final */
  spillAfter?: number;
  /** no pasa de este instante */
  untilMs?: number;
}

/** el jugador modelo (decisión 266) */
export const MODEL: BotOptions = { think: 3_000, tap: 750, pourAfter: 700 };

export function botTrace(seed: string, opts: BotOptions = {}): { events: PipeEvent[]; run: Run } {
  const think = opts.think ?? 3_000;
  const tap = opts.tap ?? 750;
  const pourAfter = opts.pourAfter === undefined ? 700 : opts.pourAfter;
  const until = opts.untilMs ?? DURATION_MS;
  const run = newRun(seed);
  const events: PipeEvent[] = [];
  let t = 0;
  while (run.phase !== "over" && run.phase !== "spilled" && t < until) {
    const puzzle = run.index + 1;
    if (opts.spillAfter !== undefined && run.solvedCount >= opts.spillAfter) {
      t = Math.max(t, run.startT + MIN_GAP_MS);
      events.push({ t, puzzle, type: "pour" });
      pour(run, t);
      break;
    }
    t = Math.max(t, run.startT + think);
    // los toques, casilla por casilla a lo largo del camino (y las que tapan)
    for (const { cell, turns } of neededTurns(run.puzzle)) {
      for (let k = 0; k < turns; k++) {
        if (t >= until) break;
        advance(run, t);
        if (run.phase !== "solving") break;
        events.push({ t, puzzle, type: "rotate", cell });
        rotate(run, t, cell);
        t += tap;
      }
    }
    advance(run, t);
    if (run.phase === "solving" && pourAfter !== null) {
      t = Math.max(t, (events[events.length - 1]?.t ?? t) + Math.max(MIN_GAP_MS, pourAfter));
      if (t < until && t < run.deadline) {
        events.push({ t, puzzle, type: "pour" });
        pour(run, t);
      }
    }
    // esperar a que el vino llegue (o a que se acabe el tiempo y llegue)
    const guard = run.index;
    const over = () => run.phase === "spilled" || run.phase === "over";
    while (run.index === guard && !over() && t < until) {
      t += 50;
      advance(run, t);
    }
  }
  advance(run, DURATION_MS);
  return { events, run };
}
