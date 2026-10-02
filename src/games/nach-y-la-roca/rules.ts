// "Nach y la roca": la simulación pura, compartida por el navegador y el
// servidor. Un corredor de tres carriles: The Nach avanza solo, cada vez más
// rápido, y las rocas vienen en filas; deslizar lo cambia de carril. Tres
// vidas; el puntaje son los metros.
//
// Todo es entero: la distancia en milímetros, 60 ticks por segundo, la
// velocidad en mm por tick según el tick. Como la velocidad no depende del
// jugador, la distancia es una función del tick (tabla DIST), y el curso
// (las filas de rocas) se genera entero desde la semilla por distancia, con
// las garantías de justicia comprobadas al generar.

import { rngFromSeed } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const TICKS_PER_S = 60;
export const DURATION_MS = 120_000;
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen entre el tick de fin y la duración real del intento (/finish) */
export const ELAPSED_SLACK_MS = 10_000;

export const LANES = 3;
export const LIVES = 3;
/** el cambio de carril dura 8 ticks: la caja de choque está en el origen los primeros 4 y en el destino los últimos 4 */
export const CHANGE_TICKS = 8;
export const CHANGE_HALF = 4;
/** invulnerable 1,5 s después de un golpe */
export const INVULN_TICKS = 90;
/** velocidad: de 8 m/s al arrancar a 20 m/s a los 90 s, en mm por tick */
export const SPEED_START = Math.round(8000 / TICKS_PER_S);
export const SPEED_END = Math.round(20000 / TICKS_PER_S);
export const SPEED_RAMP_TICK = 90 * TICKS_PER_S;
/** cota de plausibilidad: 120 s a la velocidad máxima */
export const MAX_SCORE = (20 * DURATION_MS) / 1000;
/** la reacción garantizada entre filas: 400 ms */
export const REACTION_TICKS = 24;
/** las rodantes empiezan a rodar al menos 1,2 s antes de llegar y tardan 30 ticks en cruzar */
export const ROLL_LEAD_TICKS = 72;
export const ROLL_TICKS = 30;

/** desde qué metro aparece cada tipo de fila */
export const DOUBLE_FROM_M = 200;
export const PAIR_FROM_M = 600;
export const ROLLING_FROM_M = 1000;
/** el espacio entre filas: de 16 m al arrancar a 5 m a los 600 m (±25 %); nunca menos que lo justo (calibración, decisión 222) */
export const GAP_START_M = 16;
export const GAP_END_M = 5;
export const GAP_RAMP_M = 600;
/** la segunda fila de un par va a lo justo más este margen (ticks) */
export const PAIR_EXTRA_TICKS = 6;
/** hasta dónde se genera el curso */
export const COURSE_END_M = 2600;

export function speedAt(tick: number): number {
  const t = Math.max(0, Math.min(SPEED_RAMP_TICK, tick));
  return SPEED_START + Math.floor(((SPEED_END - SPEED_START) * t) / SPEED_RAMP_TICK);
}

/** DIST[t] = milímetros recorridos al cerrar el tick t (DIST[0] = 0) */
export const DIST: readonly number[] = (() => {
  const out = new Array<number>(END_TICK + 1);
  out[0] = 0;
  for (let t = 0; t < END_TICK; t++) out[t + 1] = out[t]! + speedAt(t);
  return out;
})();

/** el primer tick cuya distancia alcanza `mm` (END_TICK si no llega) */
export function tickAtDist(mm: number): number {
  let lo = 0;
  let hi = END_TICK;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (DIST[mid]! >= mm) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export type Lane = 0 | 1 | 2;
export type Dir = -1 | 1;

export interface Rock {
  lane: Lane;
  /** rodante: cruza de `lane` al carril vecino `to`, desde el tick `rollStart` durante ROLL_TICKS */
  to?: Lane;
  rollStart?: number;
}

export type RowKind = "simple" | "doble" | "par" | "rodante";

export interface Row {
  /** la posición de la fila a lo largo de la calle, en mm */
  dist: number;
  /** el tick en que The Nach la pasa */
  tick: number;
  kind: RowKind;
  rocks: Rock[];
}

/** el carril que ocupa una roca en un tick (la rodante va en el de origen la primera mitad del cruce y en el de destino la segunda) */
export function rockLaneAt(rock: Rock, tick: number): Lane {
  if (rock.to === undefined || rock.rollStart === undefined) return rock.lane;
  if (tick < rock.rollStart + ROLL_TICKS / 2) return rock.lane;
  return rock.to;
}

/** los carriles libres de una fila cuando The Nach la pasa */
export function freeLanes(row: Row): Lane[] {
  const taken = new Set(row.rocks.map((r) => rockLaneAt(r, row.tick)));
  return ([0, 1, 2] as Lane[]).filter((l) => !taken.has(l));
}

/** cuántos cambios hacen falta, en el peor caso, para ir de un carril libre de `a` al libre más cercano de `b` */
export function changesNeeded(a: Lane[], b: Lane[]): number {
  let worst = 0;
  for (const f of a) {
    let best = Infinity;
    for (const g of b) best = Math.min(best, Math.abs(f - g));
    worst = Math.max(worst, best);
  }
  return worst;
}

/** el mínimo de ticks entre dos filas para llegar a un carril libre con 400 ms de reacción */
export function minGapTicks(changes: number): number {
  return REACTION_TICKS + CHANGE_TICKS * changes;
}

export interface Course {
  rows: Row[];
  /** cuántas filas necesitaron correrse para cumplir la garantía (el test exige pocas) */
  pushed: number;
}

function gapAtM(meters: number, rng: ReturnType<typeof rngFromSeed>): number {
  const m = Math.max(0, Math.min(GAP_RAMP_M, meters));
  const base = GAP_START_M - Math.floor(((GAP_START_M - GAP_END_M) * m) / GAP_RAMP_M);
  return Math.round(base * (0.75 + rng.next() * 0.5));
}

/**
 * Genera el curso entero desde la semilla: filas por distancia, cada vez más
 * juntas, con los tipos según la tabla y las garantías de justicia: siempre
 * un carril libre, siempre tiempo para llegar a uno (400 ms más 8 ticks por
 * cambio), y las rodantes avisan con tiempo y nunca cierran el único carril
 * libre.
 */
export function generateCourse(seed: string): Course {
  const rng = rngFromSeed(`nach:${seed}`);
  const rows: Row[] = [];
  let pushed = 0;
  let dist = 25_000; // la primera fila a 25 m
  let prevFree: Lane[] = [0, 1, 2];
  let prevTick = 0;
  const endMm = Math.min(COURSE_END_M * 1000, DIST[END_TICK]!);
  // hasta donde llega la partida: ninguna fila más allá del último tick
  while (dist < endMm && tickAtDist(dist) < END_TICK - 1) {
    const meters = Math.floor(dist / 1000);
    const kind = pickKind(meters, rng);
    const row = makeRow(dist, kind === "par" ? "simple" : kind, rng, prevFree);
    // la garantía de tiempo: si la fila queda demasiado cerca, se corre
    const need = minGapTicks(changesNeeded(prevFree, freeLanes(row)));
    if (row.tick - prevTick < need) {
      pushed++;
      if (prevTick + need >= END_TICK - 1) break;
      relocate(row, DIST[prevTick + need]!);
    }
    rows.push(row);
    prevFree = freeLanes(row);
    prevTick = row.tick;
    if (kind === "par") {
      // la segunda fila del par, a lo justo: obliga a encadenar cambios
      const second = makeRow(row.dist + 1, "simple", rng, prevFree, true);
      second.kind = "par";
      const need2 = minGapTicks(changesNeeded(prevFree, freeLanes(second)));
      if (prevTick + need2 + PAIR_EXTRA_TICKS < END_TICK - 1) {
        relocate(second, DIST[prevTick + need2 + PAIR_EXTRA_TICKS]!);
        rows.push(second);
        prevFree = freeLanes(second);
        prevTick = second.tick;
      }
    }
    dist = rows[rows.length - 1]!.dist + gapAtM(meters, rng) * 1000;
  }
  return { rows, pushed };
}

function pickKind(meters: number, rng: ReturnType<typeof rngFromSeed>): RowKind {
  const r = rng.next();
  if (meters >= ROLLING_FROM_M && r < 0.22) return "rodante";
  if (meters >= PAIR_FROM_M && r < 0.45) return "par";
  if (meters >= DOUBLE_FROM_M && r < 0.75) return "doble";
  return "simple";
}

/** una fila en `dist`; la segunda de un par evita el carril libre anterior cuando puede, para obligar a cambiar */
function makeRow(dist: number, kind: Exclude<RowKind, "par">, rng: ReturnType<typeof rngFromSeed>, prevFree: Lane[], forceChange = false): Row {
  const tick = tickAtDist(dist);
  const lanes: Lane[] = [0, 1, 2];
  if (kind === "doble") {
    const free = rng.pick(lanes);
    return { dist, tick, kind, rocks: lanes.filter((l) => l !== free).map((lane) => ({ lane })) };
  }
  if (kind === "rodante") {
    // cruza de un carril al vecino; empieza a rodar ROLL_LEAD_TICKS antes de llegar
    const from = rng.pick(lanes);
    const to = (from === 1 ? rng.pick([0, 2]) : 1) as Lane;
    const rollStart = Math.max(0, tick - ROLL_LEAD_TICKS);
    // desde los 1.400 m, a veces con una roca quieta en el tercer carril: queda libre el que la rodante deja
    const third = ([0, 1, 2] as Lane[]).find((l) => l !== from && l !== to)!;
    const rocks: Rock[] = [{ lane: from, to, rollStart }];
    if (dist >= 1_400_000 && rng.next() < 0.5) rocks.push({ lane: third });
    return { dist, tick, kind, rocks };
  }
  // simple: una roca; si se pide un cambio, en el carril libre anterior (si era uno solo)
  let lane: Lane = rng.pick(lanes);
  if (forceChange && prevFree.length === 1) lane = prevFree[0]!;
  return { dist, tick, kind, rocks: [{ lane }] };
}

function relocate(row: Row, dist: number): void {
  row.dist = dist;
  row.tick = tickAtDist(dist);
  for (const r of row.rocks) if (r.rollStart !== undefined) r.rollStart = Math.max(0, row.tick - ROLL_LEAD_TICKS);
}

// ---------------------------------------------------------------------------
// la simulación
// ---------------------------------------------------------------------------

export type EndReason = "vidas";

export interface SimState {
  tick: number;
  /** mm recorridos */
  dist: number;
  lane: Lane;
  /** el cambio en curso: desde qué carril, hacia cuál, y cuántos ticks lleva */
  change: { from: Lane; to: Lane; t: number } | null;
  /** la cola de un deslizamiento */
  queued: Dir | null;
  lives: number;
  /** invulnerable hasta este tick (exclusivo) */
  invulnUntil: number;
  /** índice de la próxima fila sin pasar */
  nextRow: number;
  /** las rocas rotas: "fila:índice" */
  broken: Set<string>;
  /** el último golpe */
  lastHit: { tick: number; row: number; rock: number } | null;
  end: { tick: number; reason: EndReason } | null;
}

export function initialState(): SimState {
  return { tick: 0, dist: 0, lane: 1, change: null, queued: null, lives: LIVES, invulnUntil: 0, nextRow: 0, broken: new Set(), lastHit: null, end: null };
}

/** el carril donde está la caja de choque ahora */
export function hitLane(s: SimState): Lane {
  if (!s.change) return s.lane;
  return s.change.t < CHANGE_HALF ? s.change.from : s.change.to;
}

/** un deslizamiento: cambia de carril, o queda en la cola de 1 si hay un cambio en curso; contra el borde no hace nada */
export function applySwipe(s: SimState, dir: Dir): boolean {
  if (s.end) return false;
  if (s.change) {
    s.queued = dir;
    return true;
  }
  const to = s.lane + dir;
  if (to < 0 || to >= LANES) return false;
  s.change = { from: s.lane, to: to as Lane, t: 0 };
  return true;
}

export function metersOf(s: SimState): number {
  return Math.floor(s.dist / 1000);
}

/** un tick: avanza, termina cambios de carril, aplica la cola y choca con las filas que pasa */
export function step(s: SimState, course: Course): void {
  if (s.end) return;
  const prev = s.dist;
  s.dist = DIST[s.tick + 1] ?? s.dist + speedAt(s.tick);
  if (s.change) {
    s.change.t++;
    if (s.change.t >= CHANGE_TICKS) {
      s.lane = s.change.to;
      s.change = null;
      if (s.queued !== null) {
        const q = s.queued;
        s.queued = null;
        applySwipe(s, q);
      }
    }
  }
  s.tick++;
  // las filas que pasó en este tick
  const lane = hitLane(s);
  while (s.nextRow < course.rows.length && course.rows[s.nextRow]!.dist <= s.dist) {
    const row = course.rows[s.nextRow]!;
    if (row.dist > prev && s.tick >= s.invulnUntil) {
      for (let i = 0; i < row.rocks.length; i++) {
        const key = `${s.nextRow}:${i}`;
        if (s.broken.has(key)) continue;
        if (rockLaneAt(row.rocks[i]!, s.tick) === lane) {
          s.broken.add(key);
          s.lives--;
          s.invulnUntil = s.tick + INVULN_TICKS;
          s.lastHit = { tick: s.tick, row: s.nextRow, rock: i };
          if (s.lives === 0) s.end = { tick: s.tick, reason: "vidas" };
          break;
        }
      }
    }
    s.nextRow++;
    if (s.end) return;
  }
}

export function endTickOf(s: SimState): number {
  return s.end ? s.end.tick : s.tick;
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

export type LaneEvent = { tick: number; dir: Dir };
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = LaneEvent | EndEvent;

export interface Replay {
  score: number;
  lives: number;
  endTick: number;
  endReason: EndReason | null;
  state: SimState;
}

/** vuelve a jugar los deslizamientos (ordenados por tick) hasta `untilTick` o hasta perder las vidas */
export function simulate(seed: string, inputs: readonly LaneEvent[], untilTick = END_TICK, course = generateCourse(seed)): Replay {
  const s = initialState();
  let k = 0;
  while (s.tick < untilTick && !s.end) {
    while (k < inputs.length && inputs[k]!.tick === s.tick) {
      applySwipe(s, inputs[k]!.dir);
      k++;
    }
    step(s, course);
  }
  return { score: metersOf(s), lives: s.lives, endTick: endTickOf(s), endReason: s.end?.reason ?? null, state: s };
}

export type Verdict = { ok: true; score: number; endTick: number; endReason: EndReason | null; lives: number } | { ok: false; reason: string };

export function parseTrace(events: unknown): { ok: true; inputs: LaneEvent[]; endTick: number } | { ok: false; reason: string } {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > END_TICK + 1) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const inputs: LaneEvent[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.tick) || "fin" in e) return { ok: false, reason: "entrada mal armada" };
    if (e.dir !== -1 && e.dir !== 1) return { ok: false, reason: "dir inválido" };
    const tick = e.tick as number;
    if (tick <= prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= endTick) return { ok: false, reason: "entrada después del final" };
    prev = tick;
    inputs.push({ tick, dir: e.dir });
  }
  return { ok: true, inputs, endTick };
}

export function check(attemptSeed: string, events: unknown, elapsedMs?: number): Verdict {
  const p = parseTrace(events);
  if (!p.ok) return p;
  const r = simulate(attemptSeed, p.inputs, p.endTick);
  if (r.endReason === "vidas" && r.endTick !== p.endTick) return { ok: false, reason: "el tick de fin no es el de la tercera vida" };
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(p.endTick, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: r.score, endTick: p.endTick, endReason: r.endReason, lives: r.lives };
}

/** el puntaje son los metros recalculados, exactos */
export function validate(result: { score: number; events: unknown[] }, attemptSeed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(attemptSeed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// jugadores automáticos (calibración, tests, E2E)
// ---------------------------------------------------------------------------

export interface BotOptions {
  /**
   * demora de reacción en ticks: el jugador se ocupa de una fila a la vez y
   * reacciona tantos ticks después de pasar la anterior (o de arrancar); si
   * no se indica, reacciona en el último momento seguro (información perfecta)
   */
  delayTicks?: number;
  /** probabilidad de equivocarse de lado en un cambio (por fila) */
  errorRate?: number;
  botSeed?: string;
  /** dejar de esquivar después de pasar tantas filas */
  stopAfterRows?: number;
}

/** el carril libre de la fila más cercano al carril actual (con los rodantes resueltos a su destino) */
export function targetLaneFor(row: Row, lane: Lane): Lane {
  const free = freeLanes(row);
  let best = free[0]!;
  for (const f of free) if (Math.abs(f - lane) < Math.abs(best - lane)) best = f;
  return best;
}

/**
 * Juega una partida: se ocupa de la fila que viene; con `delayTicks`, decide
 * ese tanto después de pasar la fila anterior (como una persona que mira la
 * próxima recién cuando pasó la anterior); sin demora, en el último momento
 * seguro. Va al carril libre más cercano, de a un deslizamiento por tick.
 */
export function botTrace(seed: string, opts: BotOptions = {}): { events: TraceEvent[]; result: Replay; course: Course } {
  const course = generateCourse(seed);
  const delay = opts.delayTicks;
  const rng = rngFromSeed(`bot:${opts.botSeed ?? seed}`);
  const s = initialState();
  const inputs: LaneEvent[] = [];
  let decidedRow = -1;
  let wrong = false;
  while (s.tick < END_TICK && !s.end) {
    const rowIdx = s.nextRow;
    const row = course.rows[rowIdx];
    if (row && (opts.stopAfterRows === undefined || rowIdx < opts.stopAfterRows)) {
      const lane = s.change ? s.change.to : s.lane;
      const target = targetLaneFor(row, lane);
      const changes = Math.abs(target - lane);
      const seeAt = delay === undefined ? row.tick - minGapTicks(changes) : (rowIdx > 0 ? course.rows[rowIdx - 1]!.tick : 0) + delay;
      if (decidedRow !== rowIdx && s.tick >= seeAt) {
        decidedRow = rowIdx;
        wrong = (opts.errorRate ?? 0) > 0 && rng.next() < (opts.errorRate ?? 0);
      }
      if (decidedRow === rowIdx && !s.change && s.queued === null && lane !== target) {
        let dir: Dir = target > lane ? 1 : -1;
        if (wrong) {
          dir = -dir as Dir;
          wrong = false;
        }
        if (applySwipe(s, dir)) inputs.push({ tick: s.tick, dir });
      }
    }
    step(s, course);
  }
  const endTick = endTickOf(s);
  return { events: [...inputs, { tick: endTick, fin: true }], result: { score: metersOf(s), lives: s.lives, endTick, endReason: s.end?.reason ?? null, state: s }, course };
}
