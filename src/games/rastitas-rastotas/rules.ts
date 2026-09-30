// "rastitas rastotas": la grilla, la simulación y la validación, puras y
// compartidas por el cliente (para jugar y dibujar) y el servidor (para
// validar la traza). Mismo esquema que Larry: 60 ticks por segundo, todo en
// enteros, y el único azar sale de rngFromSeed con la semilla del intento.
// Los sorteos que dependen del estado (dónde aparece el próximo cigarro) son
// determinísticos porque el estado se reproduce igual con la misma traza.

import { rngFromSeed, type Rng } from "../../lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const TICKS_PER_S = 60;
export const DURATION_MS = 180_000;
/** a los 180 s la partida termina: el último tick simulado es END_TICK - 1 */
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen de /finish sobre la duración real (el mismo que gameLimits) */
export const ELAPSED_SLACK_MS = 10_000;

/** la grilla: 15 columnas por 21 filas, en vertical */
export const COLS = 15;
export const ROWS = 21;
export const CELLS = COLS * ROWS;
/** unidades lógicas por casillero (para el dibujo) */
export const CELL = 8;
export const FIELD_W = COLS * CELL;
export const FIELD_H = ROWS * CELL;

/** la cabeza avanza un casillero cada tantos ticks al empezar */
export const STEP_START = 9;
/** cada 5 cigarros el intervalo baja un tick, con piso de 5 */
export const STEP_MIN = 5;
export const CIGS_PER_SPEEDUP = 5;
/** con Red Bull, el intervalo se multiplica por 2/3 (redondeado para arriba), piso 3 */
export const BOOST_MIN = 3;
/** el efecto dura 5 s y la lata queda 6 s en el tablero */
export const BOOST_TICKS = 5 * TICKS_PER_S;
export const REDBULL_LIFE_TICKS = 6 * TICKS_PER_S;
/** la Red Bull aparece desde los 10 s, cada 15 a 25 s */
export const REDBULL_FROM_TICK = 10 * TICKS_PER_S;
export const REDBULL_EVERY_MIN = 15 * TICKS_PER_S;
export const REDBULL_EVERY_MAX = 25 * TICKS_PER_S;
/** las oleadas de piojos: desde los 20 s, cada 15 s más o menos */
export const WAVE_FROM_TICK = 20 * TICKS_PER_S;
export const WAVE_EVERY = 15 * TICKS_PER_S;
export const WAVE_JITTER = 3 * TICKS_PER_S;
/** los casilleros marcados titilan esto antes de bloquearse */
export const WARN_TICKS = 90;
/** en total, nunca más del 20 % de la grilla bloqueada (o avisada) */
export const MAX_BLOCKED = Math.floor(CELLS / 5);
/** los próximos casilleros en la dirección de la cabeza nunca se marcan */
export const SAFE_AHEAD = 4;
/** la cola de giros */
export const QUEUE_MAX = 2;
/** rastas iniciales detrás de la cabeza */
export const START_TAIL = 2;
/** cota gruesa: un cigarro por paso al intervalo mínimo con Red Bull, a 2 puntos */
export const MAX_SCORE = Math.floor(END_TICK / BOOST_MIN) * 2;

export const DIRS = ["up", "down", "left", "right"] as const;
export type Dir = (typeof DIRS)[number];
export const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
export const DELTA: Record<Dir, { dx: number; dy: number }> = { up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 }, left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 } };

export function isDir(d: unknown): d is Dir {
  return typeof d === "string" && (DIRS as readonly string[]).includes(d);
}

/** un casillero como índice: fila × COLS + columna */
export const cellOf = (x: number, y: number): number => y * COLS + x;
export const xOf = (c: number): number => c % COLS;
export const yOf = (c: number): number => Math.floor(c / COLS);
export const inGrid = (x: number, y: number): boolean => x >= 0 && x < COLS && y >= 0 && y < ROWS;

export type EndReason = "borde" | "rastas" | "piojos" | "tiempo";

export interface SimState {
  tick: number;
  /** cabeza primero, hasta la punta de la última rasta */
  body: number[];
  /** el cuerpo antes del último paso, para interpolar */
  prevBody: number[];
  dir: Dir;
  queue: Dir[];
  /** tick del último paso y tick del próximo */
  lastMove: number;
  nextMove: number;
  cigs: number;
  score: number;
  cig: number;
  redbull: { cell: number; until: number } | null;
  nextRedbull: number;
  boostUntil: number;
  /** casilleros avisados: cuándo se bloquean */
  warned: Map<number, number>;
  blocked: Set<number>;
  nextWave: number;
  waves: number;
  end: { tick: number; reason: EndReason } | null;
  /** para dibujar: tick del último cigarro comido */
  lastEat: number;
}

/** el estado inicial: la cabeza abajo en el centro mirando arriba, con 2 rastas atrás */
export function initialState(rng: Rng): SimState {
  const hx = Math.floor(COLS / 2);
  const hy = ROWS - 4;
  const body = [cellOf(hx, hy), cellOf(hx, hy + 1), cellOf(hx, hy + 2)];
  const state: SimState = {
    tick: 0,
    body,
    prevBody: [...body],
    dir: "up",
    queue: [],
    lastMove: 0,
    nextMove: STEP_START,
    cigs: 0,
    score: 0,
    cig: -1,
    redbull: null,
    nextRedbull: REDBULL_FROM_TICK,
    boostUntil: 0,
    warned: new Map(),
    blocked: new Set(),
    nextWave: WAVE_FROM_TICK + rng.int(0, WAVE_JITTER),
    waves: 0,
    end: null,
    lastEat: -1,
  };
  state.cig = pickCell(state, rng, { farFromBorder: true }) ?? cellOf(hx, 4);
  return state;
}

export function stepInterval(state: SimState): number {
  const base = Math.max(STEP_MIN, STEP_START - Math.floor(state.cigs / CIGS_PER_SPEEDUP));
  if (state.tick < state.boostUntil) return Math.max(BOOST_MIN, Math.ceil((base * 2) / 3));
  return base;
}

// ---------------------------------------------------------------------------
// la grilla: libres, alcanzables y conectados
// ---------------------------------------------------------------------------

/** casilleros que no se pueden pisar (para el recorrido): bloqueados y el cuerpo */
function passable(state: SimState, extraBlocked?: ReadonlySet<number>): (c: number) => boolean {
  const body = new Set(state.body);
  return (c) => !state.blocked.has(c) && !(extraBlocked && extraBlocked.has(c)) && !body.has(c);
}

/** recorrido en anchura desde `from` sobre los casilleros que cumplen `ok`; devuelve los alcanzados */
export function reachable(from: number, ok: (c: number) => boolean): Set<number> {
  const seen = new Set<number>([from]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    const x = xOf(c);
    const y = yOf(c);
    for (const d of DIRS) {
      const nx = x + DELTA[d].dx;
      const ny = y + DELTA[d].dy;
      if (!inGrid(nx, ny)) continue;
      const n = cellOf(nx, ny);
      if (seen.has(n) || !ok(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen;
}

/** los casilleros libres: sin rastas, sin piojos ni aviso, sin cigarro ni Red Bull */
function isFree(state: SimState, c: number, body: ReadonlySet<number>): boolean {
  return !body.has(c) && !state.blocked.has(c) && !state.warned.has(c) && c !== state.cig && (!state.redbull || state.redbull.cell !== c);
}

/** un casillero libre al azar, no pegado a la cabeza y alcanzable desde ella */
export function pickCell(state: SimState, rng: Rng, opts: { farFromBorder?: boolean } = {}): number | null {
  const head = state.body[0]!;
  const hx = xOf(head);
  const hy = yOf(head);
  const body = new Set(state.body);
  const reach = reachable(head, passable(state));
  const candidates: number[] = [];
  for (let c = 0; c < CELLS; c++) {
    if (!isFree(state, c, body)) continue;
    const x = xOf(c);
    const y = yOf(c);
    if (Math.abs(x - hx) + Math.abs(y - hy) <= 1) continue;
    if (opts.farFromBorder && (x < 2 || x >= COLS - 2 || y < 2 || y >= ROWS - 2)) continue;
    if (!reach.has(c)) continue;
    candidates.push(c);
  }
  if (!candidates.length) return null;
  return candidates[rng.int(0, candidates.length - 1)]!;
}

/** los próximos casilleros en la dirección de la cabeza */
function aheadCells(state: SimState): Set<number> {
  const out = new Set<number>();
  let x = xOf(state.body[0]!);
  let y = yOf(state.body[0]!);
  for (let i = 0; i < SAFE_AHEAD; i++) {
    x += DELTA[state.dir].dx;
    y += DELTA[state.dir].dy;
    if (!inGrid(x, y)) break;
    out.add(cellOf(x, y));
  }
  return out;
}

/** cuántos casilleros marca una oleada: 2 al principio, hasta 4 con el tiempo */
export function waveSize(tick: number): number {
  return Math.min(4, 2 + Math.floor(tick / (60 * TICKS_PER_S)));
}

/**
 * Una oleada: marca de 2 a 4 casilleros que no son cuerpo, ni cigarro, ni
 * Red Bull, ni los próximos 4 de la cabeza, ni ya marcados, y que al
 * bloquearse (junto con todo lo ya avisado) dejan a todos los casilleros no
 * bloqueados conectados entre sí. Se comprueba con un recorrido antes de
 * confirmar cada casillero.
 */
export function markWave(state: SimState, rng: Rng): number[] {
  const wanted = waveSize(state.tick);
  const room = MAX_BLOCKED - state.blocked.size - state.warned.size;
  if (room <= 0) return [];
  const body = new Set(state.body);
  const ahead = aheadCells(state);
  const marked: number[] = [];
  const pending = new Set(state.warned.keys());
  const candidates: number[] = [];
  for (let c = 0; c < CELLS; c++) {
    if (body.has(c) || state.blocked.has(c) || state.warned.has(c) || ahead.has(c)) continue;
    if (c === state.cig || (state.redbull && state.redbull.cell === c)) continue;
    candidates.push(c);
  }
  let guard = 0;
  while (marked.length < Math.min(wanted, room) && candidates.length && guard++ < 60) {
    const i = rng.int(0, candidates.length - 1);
    const c = candidates[i]!;
    candidates.splice(i, 1);
    const test = new Set(pending);
    test.add(c);
    // todos los casilleros no bloqueados siguen conectados con la cabeza
    const ok = (n: number) => !state.blocked.has(n) && !test.has(n);
    const reach = reachable(state.body[0]!, ok);
    let all = true;
    for (let n = 0; n < CELLS && all; n++) if (ok(n) && !reach.has(n)) all = false;
    if (!all) continue;
    pending.add(c);
    marked.push(c);
  }
  return marked;
}

// ---------------------------------------------------------------------------
// la simulación, paso a paso
// ---------------------------------------------------------------------------

/** un giro que entra a la cola: se ignora la dirección opuesta a la vigente y la repetida */
export function enqueue(state: SimState, dir: Dir): boolean {
  const last = state.queue.length ? state.queue[state.queue.length - 1]! : state.dir;
  if (dir === last || dir === OPPOSITE[last]) return false;
  if (state.queue.length >= QUEUE_MAX) return false;
  state.queue.push(dir);
  return true;
}

/**
 * Avanza un tick. `turns` son los giros pedidos en este tick. Devuelve los
 * que entraron a la cola (van a la traza). Orden: entran los giros, se
 * revisa la Red Bull, si toca paso la cabeza avanza, y después vienen las
 * oleadas y se bloquea lo avisado que venció. Muta el estado.
 */
export function step(state: SimState, rng: Rng, turns: readonly Dir[] = []): Dir[] {
  const accepted: Dir[] = [];
  if (state.end) return accepted;
  const t = state.tick;
  for (const d of turns) if (enqueue(state, d)) accepted.push(d);

  // Red Bull: aparece, vence
  if (state.redbull && t >= state.redbull.until) state.redbull = null;
  if (!state.redbull && t >= state.nextRedbull) {
    const c = pickCell(state, rng);
    if (c !== null) state.redbull = { cell: c, until: t + REDBULL_LIFE_TICKS };
    state.nextRedbull = t + rng.int(REDBULL_EVERY_MIN, REDBULL_EVERY_MAX);
  }

  // el paso
  if (t >= state.nextMove) {
    if (state.queue.length) state.dir = state.queue.shift()!;
    const head = state.body[0]!;
    const nx = xOf(head) + DELTA[state.dir].dx;
    const ny = yOf(head) + DELTA[state.dir].dy;
    state.prevBody = [...state.body];
    state.lastMove = t;
    if (!inGrid(nx, ny)) {
      state.end = { tick: t + 1, reason: "borde" };
    } else {
      const n = cellOf(nx, ny);
      const eats = n === state.cig;
      // la punta se mueve en el mismo paso: no cuenta como choque (salvo que crezca)
      const tailStays = eats;
      const bodyHit = state.body.some((c, i) => c === n && (tailStays || i < state.body.length - 1));
      if (bodyHit) state.end = { tick: t + 1, reason: "rastas" };
      else if (state.blocked.has(n)) state.end = { tick: t + 1, reason: "piojos" };
      else {
        state.body.unshift(n);
        if (eats) {
          state.score += t < state.boostUntil ? 2 : 1;
          state.cigs++;
          state.lastEat = t;
          state.cig = pickCell(state, rng) ?? -1;
        } else {
          state.body.pop();
        }
        if (state.redbull && state.redbull.cell === n) {
          state.boostUntil = t + BOOST_TICKS;
          state.redbull = null;
        }
      }
    }
    state.nextMove = t + stepInterval(state);
  }

  // oleadas de piojos (después del paso: los próximos 4 se miran con la dirección ya girada)
  if (t >= state.nextWave) {
    for (const c of markWave(state, rng)) state.warned.set(c, t + WARN_TICKS);
    state.waves++;
    state.nextWave = t + WAVE_EVERY + rng.int(-WAVE_JITTER, WAVE_JITTER);
  }
  // lo avisado que venció se bloquea, salvo que haya rastas encima (espera)
  if (state.warned.size) {
    const body = new Set(state.body);
    for (const [c, at] of state.warned) {
      if (t >= at && !body.has(c)) {
        state.warned.delete(c);
        state.blocked.add(c);
      }
    }
  }

  state.tick = t + 1;
  if (!state.end && state.tick >= END_TICK) state.end = { tick: state.tick, reason: "tiempo" };
  return accepted;
}

// ---------------------------------------------------------------------------
// la traza y la validación
// ---------------------------------------------------------------------------

export type TurnEvent = { tick: number; dir: Dir };
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = TurnEvent | EndEvent;

export interface SimResult {
  score: number;
  cigs: number;
  endTick: number;
  endReason: EndReason | null;
  state: SimState;
}

export function rngFor(attemptSeed: string): Rng {
  return rngFromSeed(`${attemptSeed}:rastas`);
}

/**
 * Corre la partida con la semilla y los giros hasta que termina o hasta
 * `untilTick`. Los giros tienen que venir en orden; acá no se valida nada.
 */
export function simulate(attemptSeed: string, turns: readonly TurnEvent[], untilTick = END_TICK): SimResult {
  const rng = rngFor(attemptSeed);
  const state = initialState(rng);
  let k = 0;
  while (!state.end && state.tick < untilTick) {
    const now: Dir[] = [];
    while (k < turns.length && turns[k]!.tick <= state.tick) now.push(turns[k++]!.dir);
    step(state, rng, now);
  }
  return resultOf(state);
}

function resultOf(state: SimState): SimResult {
  const endTick = state.end ? state.end.tick : state.tick;
  return { score: state.score, cigs: state.cigs, endTick, endReason: state.end?.reason ?? null, state };
}

export type Verdict = { ok: true; score: number; endTick: number; endReason: EndReason | null } | { ok: false; reason: string };

/** Revisa la forma de la traza y la vuelve a jugar. */
export function check(attemptSeed: string, events: unknown, elapsedMs?: number): Verdict {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > END_TICK + 1) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const declared = last.tick as number;
  if (declared < 1 || declared > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const turns: TurnEvent[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.tick) || "fin" in e) return { ok: false, reason: "giro mal armado" };
    if (!isDir(e.dir)) return { ok: false, reason: "dirección inválida" };
    const tick = e.tick as number;
    if (tick < prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= declared) return { ok: false, reason: "giro después del final" };
    prev = tick;
    turns.push({ tick, dir: e.dir });
  }
  const sim = simulate(attemptSeed, turns, declared);
  if (sim.endTick !== declared) return { ok: false, reason: "el final no coincide con la partida" };
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(declared, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: sim.score, endTick: sim.endTick, endReason: sim.endReason };
}

/** El punto de extensión del contrato: rearma la partida y compara los puntos. */
export function validate(result: { score: number; events: unknown[] }, attemptSeed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(attemptSeed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// bots: para los tests, los E2E y la herramienta de desarrollo
// ---------------------------------------------------------------------------

/** un giro por tick como máximo */
export type Policy = (state: SimState) => Dir | null;

/** el camino más corto de la cabeza a `target` por casilleros pisables; null si no hay */
export function pathTo(state: SimState, target: number, passBody = false): Dir[] | null {
  const head = state.body[0]!;
  const body = new Set(passBody ? [] : state.body.slice(0, -1));
  const ok = (c: number) => !state.blocked.has(c) && !body.has(c);
  const prev = new Map<number, [number, Dir]>();
  const queue = [head];
  const seen = new Set([head]);
  while (queue.length) {
    const c = queue.shift()!;
    if (c === target) break;
    for (const d of DIRS) {
      const nx = xOf(c) + DELTA[d].dx;
      const ny = yOf(c) + DELTA[d].dy;
      if (!inGrid(nx, ny)) continue;
      const n = cellOf(nx, ny);
      if (seen.has(n) || (!ok(n) && n !== target)) continue;
      seen.add(n);
      prev.set(n, [c, d]);
      queue.push(n);
    }
  }
  if (!prev.has(target)) return null;
  const dirs: Dir[] = [];
  let c = target;
  while (c !== head) {
    const [p, d] = prev.get(c)!;
    dirs.unshift(d);
    c = p;
  }
  return dirs;
}

/**
 * El jugador que va al cigarro por el camino más corto (evitando piojos y
 * rastas), y si no hay camino busca cualquier casillero libre lejos. Decide
 * justo después de cada paso y pide un solo giro por vez. Con `wantRedbull`,
 * va a la Red Bull cuando está.
 */
export function greedyPolicy(wantRedbull = false): Policy {
  let decidedAt = -1;
  return (state) => {
    if (state.lastMove === decidedAt || state.queue.length) return null;
    decidedAt = state.lastMove;
    const target = wantRedbull && state.redbull ? state.redbull.cell : state.cig;
    let path = target >= 0 ? pathTo(state, target) : null;
    if (!path || !path.length) {
      // sobrevivir: el vecino pisable con más lugar
      let best: Dir | null = null;
      let bestRoom = -1;
      for (const d of DIRS) {
        if (d === OPPOSITE[state.dir]) continue;
        const nx = xOf(state.body[0]!) + DELTA[d].dx;
        const ny = yOf(state.body[0]!) + DELTA[d].dy;
        if (!inGrid(nx, ny)) continue;
        const n = cellOf(nx, ny);
        const body = new Set(state.body.slice(0, -1));
        if (state.blocked.has(n) || body.has(n)) continue;
        const room = reachable(n, (c) => !state.blocked.has(c) && !body.has(c)).size;
        if (room > bestRoom) {
          bestRoom = room;
          best = d;
        }
      }
      path = best ? [best] : null;
    }
    if (!path || !path.length) return null;
    const d = path[0]!;
    return d === state.dir ? null : d;
  };
}

/** Juega con una política y devuelve la traza completa (con el cierre). */
export function playBot(attemptSeed: string, policy: Policy, untilTick = END_TICK): { events: TraceEvent[]; result: SimResult } {
  const rng = rngFor(attemptSeed);
  const state = initialState(rng);
  const turns: TurnEvent[] = [];
  while (!state.end && state.tick < untilTick) {
    const d = policy(state);
    const accepted = step(state, rng, d ? [d] : []);
    for (const a of accepted) turns.push({ tick: state.tick - 1, dir: a });
  }
  const result = resultOf(state);
  return { events: [...turns, { tick: result.endTick, fin: true }], result };
}

export function greedyTrace(attemptSeed: string, untilTick = END_TICK) {
  return playBot(attemptSeed, greedyPolicy(), untilTick);
}
