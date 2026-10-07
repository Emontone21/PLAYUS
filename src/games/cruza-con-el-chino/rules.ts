// Reglas de "Cruza con el chino": un Frogger. Simulación entera a 60 ticks
// por segundo, igual en el navegador y en Node. La grilla tiene 9 columnas;
// cada fila es un carril: vereda (segura), calle (vehículos que dan vueltas en
// un anillo de celdas, salen por un lado y vuelven a entrar por el otro) o
// vía (un tren cada tanto, con el semáforo que avisa 1 s antes). Todo sale
// de la semilla, por bloques, a medida que hace falta; cada bloque se
// comprueba con un buscador de caminos y, si no se puede cruzar, se abre.
// La traza son los saltos (toque: adelante; deslizar: de costado) más el
// cierre; `validate` vuelve a jugar. Sin DOM.

import { rngFromSeed, type Rng } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const TICKS_PER_S = 60;
export const DURATION_MS = 120_000;
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen entre el tick de fin y la duración real del intento (/finish) */
export const ELAPSED_SLACK_MS = 10_000;
/** después del choque, el final se ve esto antes de onFinish */
export const CRASH_HOLD_TICKS = 60;

export const COLS = 9;
export const START_COL = 4;
/** subunidades por celda */
export const SUB = 256;
/** el salto dura 8 ticks: la caja de choque sigue en el origen los primeros 4 y pasa al destino en los últimos 4 */
export const HOP_TICKS = 8;
export const HOP_SWITCH = 4;
/** margen de reacción que el buscador exige al aterrizar (250 ms) */
export const MARGIN_TICKS = 15;
/** la caja de choque de los vehículos es más corta que el dibujo, en subunidades por lado */
export const VEHICLE_SHRINK = 44;
/** la de la rana: ±este ancho alrededor del centro de la celda */
export const FROG_HALF = 88;
/** el tren: el semáforo titila 1 s antes, el tren tarda esto en cruzar y después no pasa otro por un buen rato */
export const TRAIN_WARN_TICKS = 60;
export const TRAIN_CROSS_TICKS = 10;
export const TRAIN_PERIOD = { min: 540, max: 780 } as const;
/** cota: un salto cada 8 ticks durante 120 s */
export const MAX_ROWS = END_TICK / HOP_TICKS;
/** hasta cuántas filas por delante de la rana se genera el curso */
export const AHEAD_ROWS = 14;

export type Dir = "up" | "left" | "right";
export const DIRS: readonly Dir[] = ["up", "left", "right"];

export type VehicleKind = "moto" | "auto" | "colectivo";

export interface Road {
  kind: "road";
  /** +1 hacia la derecha, −1 hacia la izquierda */
  dir: 1 | -1;
  /** subunidades por tick */
  speed: number;
  vehicle: VehicleKind;
  /** largo en celdas */
  len: number;
  /** el anillo: cuántas celdas tiene (las 9 visibles y las que quedan fuera) */
  period: number;
  /** dónde arranca cada vehículo dentro del anillo, en celdas */
  offsets: number[];
  /** corrimiento inicial del anillo, en subunidades */
  phase: number;
  /** el dibujo: 0 y 1 son modelos de auto; 2 es el sunny rojo; para la moto y el colectivo, el color */
  look: number;
}
export interface Sidewalk {
  kind: "sidewalk";
  /** el cartel con el número de carril, si lo lleva */
  sign: number | null;
  /** un árbol o un banco, por columna (solo dibujo) */
  deco: { col: number; what: "arbol" | "banco" }[];
}
export interface Rail {
  kind: "rail";
  period: number;
  phase: number;
}
export type Lane = Road | Sidewalk | Rail;

export interface Course {
  seed: string;
  rng: Rng;
  lanes: Lane[];
  /** desde qué fila va cada bloque de calles (la vereda que lo abre) */
  blocks: number[];
  nextSign: number;
}

// ---------------------------------------------------------------------------
// dificultad
// ---------------------------------------------------------------------------

export interface Difficulty {
  roadsMin: number;
  roadsMax: number;
  speedMin: number;
  speedMax: number;
  /** celdas del anillo */
  periodMin: number;
  periodMax: number;
  /** cuántos vehículos por anillo */
  countMin: number;
  countMax: number;
  motos: boolean;
  alternate: boolean;
  rails: boolean;
}

/** la tabla, por carril (los valores de velocidad son subunidades por tick: 8 ≈ 1,9 celdas/s) */
export function difficultyAt(row: number): Difficulty {
  if (row < 10) return { roadsMin: 1, roadsMax: 2, speedMin: 6, speedMax: 9, periodMin: 16, periodMax: 20, countMin: 1, countMax: 2, motos: false, alternate: false, rails: false };
  if (row < 30) return { roadsMin: 2, roadsMax: 3, speedMin: 7, speedMax: 12, periodMin: 14, periodMax: 18, countMin: 1, countMax: 2, motos: true, alternate: true, rails: false };
  if (row < 60) return { roadsMin: 3, roadsMax: 4, speedMin: 9, speedMax: 16, periodMin: 12, periodMax: 16, countMin: 2, countMax: 3, motos: true, alternate: true, rails: false };
  return { roadsMin: 4, roadsMax: 5, speedMin: 10, speedMax: 18, periodMin: 12, periodMax: 15, countMin: 2, countMax: 3, motos: true, alternate: true, rails: true };
}

/** la velocidad de cada tipo: la moto es rápida, el auto medio y el colectivo lento */
function speedFor(kind: VehicleKind, d: Difficulty, rng: Rng): number {
  const span = d.speedMax - d.speedMin;
  if (kind === "moto") return d.speedMin + Math.floor(span * 0.7) + rng.int(0, Math.max(1, Math.floor(span * 0.3)));
  if (kind === "auto") return d.speedMin + Math.floor(span * 0.3) + rng.int(0, Math.max(1, Math.floor(span * 0.4)));
  return d.speedMin + rng.int(0, Math.max(1, Math.floor(span * 0.35)));
}

// ---------------------------------------------------------------------------
// el curso
// ---------------------------------------------------------------------------

function sidewalk(course: Course, row: number): Sidewalk {
  const rng = course.rng;
  const deco: Sidewalk["deco"] = [];
  const n = rng.int(0, 2);
  for (let i = 0; i < n; i++) deco.push({ col: rng.int(0, COLS - 1), what: rng.next() < 0.5 ? "arbol" : "banco" });
  let sign: number | null = null;
  if (row >= course.nextSign) {
    sign = row;
    course.nextSign = Math.floor(row / 10) * 10 + 10;
  }
  return { kind: "sidewalk", sign, deco };
}

function road(d: Difficulty, rng: Rng, prevDir: 1 | -1 | 0): Road {
  const kinds: VehicleKind[] = d.motos ? ["moto", "auto", "auto", "colectivo"] : ["auto", "auto", "colectivo"];
  const vehicle = rng.pick(kinds);
  const len = vehicle === "moto" ? 1 : vehicle === "auto" ? 2 : rng.int(3, 4);
  const dir: 1 | -1 = d.alternate && prevDir !== 0 ? ((-prevDir) as 1 | -1) : rng.next() < 0.5 ? 1 : -1;
  const speed = speedFor(vehicle, d, rng);
  const count = rng.int(d.countMin, d.countMax);
  const period = Math.max(rng.int(d.periodMin, d.periodMax), count * (len + 4));
  // los vehículos se reparten parejo por el anillo, con un poco de desorden
  const offsets: number[] = [];
  const slot = Math.floor(period / count);
  for (let i = 0; i < count; i++) offsets.push(i * slot + rng.int(0, Math.max(0, slot - len - 3)));
  const look = vehicle === "auto" ? (rng.next() < 0.18 ? 2 : rng.int(0, 1)) : rng.int(0, 1);
  return { kind: "road", dir, speed, vehicle, len, period, offsets, phase: rng.int(0, period * SUB - 1), look };
}

/** abre una calle: más lenta y con más espacio */
function open(r: Road, rng: Rng): void {
  r.speed = Math.max(4, Math.floor((r.speed * 3) / 4));
  if (r.offsets.length > 1) r.offsets.pop();
  else r.period += 2;
  r.phase = rng.int(0, r.period * SUB - 1);
}

/** genera un bloque más: sus calles (y vía), comprobadas por el buscador, y la vereda que lo cierra */
function generateBlock(course: Course): void {
  const rng = course.rng;
  const from = course.lanes.length - 1; // la vereda de salida
  const d = difficultyAt(from);
  const n = rng.int(d.roadsMin, d.roadsMax);
  const lanes: Lane[] = [];
  let prev: 1 | -1 | 0 = 0;
  const railAt = d.rails && rng.next() < 0.5 ? rng.int(0, n) : -1;
  for (let i = 0; i < n; i++) {
    if (i === railAt) lanes.push({ kind: "rail", period: rng.int(TRAIN_PERIOD.min, TRAIN_PERIOD.max), phase: rng.int(0, 500) });
    const r = road(d, rng, prev);
    prev = r.dir;
    lanes.push(r);
  }
  if (railAt === n) lanes.push({ kind: "rail", period: rng.int(TRAIN_PERIOD.min, TRAIN_PERIOD.max), phase: rng.int(0, 500) });
  course.blocks.push(from);
  const to = from + lanes.length + 1;
  const trial = (): boolean => {
    const probe: Course = { ...course, lanes: [...course.lanes, ...lanes, { kind: "sidewalk", sign: null, deco: [] }] };
    return FAIRNESS_STARTS.every((t0) => solveBlock(probe, from, to, t0) !== null);
  };
  for (let guard = 0; guard < 8 && !trial(); guard++) {
    for (const l of lanes) if (l.kind === "road") open(l, rng);
  }
  course.lanes.push(...lanes);
  course.lanes.push(sidewalk(course, to));
}

/** los ticks de salida con los que se comprueba cada bloque */
export const FAIRNESS_STARTS: readonly number[] = [0, 233, 467];

export function createCourse(seed: string): Course {
  const course: Course = { seed, rng: rngFromSeed(`cruza:${seed}`), lanes: [], blocks: [], nextSign: 10 };
  course.lanes.push({ kind: "sidewalk", sign: null, deco: [] });
  ensureRows(course, AHEAD_ROWS);
  return course;
}

/** genera bloques hasta tener la fila `row` (y un bloque más) */
export function ensureRows(course: Course, row: number): void {
  while (course.lanes.length <= row + 1) generateBlock(course);
}

// ---------------------------------------------------------------------------
// el tránsito
// ---------------------------------------------------------------------------

/** las posiciones (subunidades, inicio de cada vehículo dentro del anillo) en un tick */
export function vehiclesAt(r: Road, tick: number): number[] {
  const ring = r.period * SUB;
  return r.offsets.map((o) => (((o * SUB + r.phase + r.dir * r.speed * tick) % ring) + ring) % ring);
}

/** ¿hay tren cruzando en este tick? */
export function trainAt(l: Rail, tick: number): boolean {
  const t = (((tick - l.phase) % l.period) + l.period) % l.period;
  return t < TRAIN_CROSS_TICKS;
}
/** ¿el semáforo está avisando (el segundo antes del tren)? */
export function trainWarning(l: Rail, tick: number): boolean {
  const t = (((tick - l.phase) % l.period) + l.period) % l.period;
  return t >= l.period - TRAIN_WARN_TICKS;
}

/** ¿la celda `col` de este carril está ocupada en este tick? */
export function occupied(lane: Lane, col: number, tick: number): boolean {
  if (lane.kind === "sidewalk") return false;
  if (lane.kind === "rail") return trainAt(lane, tick);
  const ring = lane.period * SUB;
  const c0 = col * SUB + SUB / 2 - FROG_HALF;
  const c1 = col * SUB + SUB / 2 + FROG_HALF;
  for (const x of vehiclesAt(lane, tick)) {
    const a = x + VEHICLE_SHRINK;
    const b = x + lane.len * SUB - VEHICLE_SHRINK;
    // el vehículo puede estar cruzando el final del anillo
    for (const shift of [0, -ring]) if (a + shift < c1 && b + shift > c0) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// la rana
// ---------------------------------------------------------------------------

export interface Hop {
  dir: Dir;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  start: number;
}

export interface SimState {
  tick: number;
  course: Course;
  row: number;
  col: number;
  hop: Hop | null;
  /** el movimiento que espera a que aterrice (cola de 1) */
  queued: Dir | null;
  maxRow: number;
  crashed: boolean;
  crashTick: number;
  /** cuántos saltos hizo (para la calibración) */
  hops: number;
}

export function initialState(seed: string): SimState {
  return { tick: 0, course: createCourse(seed), row: 0, col: START_COL, hop: null, queued: null, maxRow: 0, crashed: false, crashTick: -1, hops: 0 };
}

export function score(s: SimState): number {
  return s.maxRow;
}

/** a dónde llevaría un movimiento desde una casilla, o null si no se puede (el borde) */
export function target(row: number, col: number, dir: Dir): { row: number; col: number } | null {
  if (dir === "up") return { row: row + 1, col };
  const c = col + (dir === "left" ? -1 : 1);
  if (c < 0 || c >= COLS) return null;
  return { row, col: c };
}

function startHop(s: SimState, dir: Dir): boolean {
  const t = target(s.row, s.col, dir);
  if (!t) return false;
  s.hop = { dir, fromRow: s.row, fromCol: s.col, toRow: t.row, toCol: t.col, start: s.tick };
  s.hops++;
  return true;
}

/** un movimiento del jugador en el tick actual: salta, o queda en la cola si está en el aire */
export function applyInput(s: SimState, dir: Dir): void {
  if (s.crashed) return;
  if (s.hop) {
    s.queued = dir;
    return;
  }
  startHop(s, dir);
}

/** dónde está la caja de choque de la rana en este tick */
export function hitboxCell(s: SimState): { row: number; col: number } {
  if (s.hop && s.tick - s.hop.start < HOP_SWITCH) return { row: s.hop.fromRow, col: s.hop.fromCol };
  if (s.hop) return { row: s.hop.toRow, col: s.hop.toCol };
  return { row: s.row, col: s.col };
}

export function step(s: SimState): void {
  if (s.crashed) {
    s.tick++;
    return;
  }
  s.tick++;
  if (s.hop && s.tick - s.hop.start >= HOP_TICKS) {
    s.row = s.hop.toRow;
    s.col = s.hop.toCol;
    s.hop = null;
    if (s.row > s.maxRow) s.maxRow = s.row;
    ensureRows(s.course, s.row + AHEAD_ROWS);
    if (s.queued) {
      const q = s.queued;
      s.queued = null;
      startHop(s, q);
    }
  }
  const h = hitboxCell(s);
  const lane = s.course.lanes[h.row];
  if (lane && occupied(lane, h.col, s.tick)) {
    s.crashed = true;
    s.crashTick = s.tick;
    s.hop = null;
    s.queued = null;
  }
}

// ---------------------------------------------------------------------------
// el buscador de caminos (justicia, jugador automático, herramienta y E2E)
// ---------------------------------------------------------------------------

export interface PlannedHop {
  tick: number;
  dir: Dir;
}

/** la ocupación de un carril en un tick, como máscara de 9 bits (bit c = la celda c está ocupada) */
export function occupancyMask(lane: Lane, tick: number): number {
  if (lane.kind === "sidewalk") return 0;
  if (lane.kind === "rail") return trainAt(lane, tick) ? 0x1ff : 0;
  let m = 0;
  const ring = lane.period * SUB;
  for (const x of vehiclesAt(lane, tick)) {
    const a = x + VEHICLE_SHRINK;
    const b = x + lane.len * SUB - VEHICLE_SHRINK;
    for (const shift of [0, -ring]) {
      // las celdas cuyo centro ± FROG_HALF toca [a, b)
      const c0 = Math.max(0, Math.floor((a + shift - SUB / 2 - FROG_HALF) / SUB) + 1);
      const c1 = Math.min(COLS - 1, Math.ceil((b + shift - SUB / 2 + FROG_HALF) / SUB) - 1);
      for (let c = c0; c <= c1; c++) m |= 1 << c;
    }
  }
  return m;
}

/** las máscaras de las filas [rowFrom, rowTo] para los ticks [t0, t0 + n) */
function masks(course: Course, rowFrom: number, rowTo: number, t0: number, n: number): Uint16Array {
  const rows = rowTo - rowFrom + 1;
  const out = new Uint16Array(rows * n);
  for (let r = 0; r < rows; r++) {
    const lane = course.lanes[rowFrom + r]!;
    if (lane.kind === "sidewalk") continue;
    for (let k = 0; k < n; k++) out[r * n + k] = occupancyMask(lane, t0 + k);
  }
  return out;
}

/**
 * Un camino seguro desde (row, col) en el tick `t0` hasta la fila `toRow`:
 * búsqueda en anchura sobre (fila, columna, tick) con esperas de a un tick y
 * saltos de 8 (la caja de choque sigue en el origen los ticks 1 a 3 del salto
 * y pasa al destino en el 4), exigiendo 250 ms de margen al aterrizar.
 * Devuelve los saltos con su tick, o null si no lo encuentra en el horizonte.
 */
export function solveFrom(course: Course, row: number, col: number, t0: number, toRow: number, horizon = 1200, margin = MARGIN_TICKS): PlannedHop[] | null {
  if (toRow < row) return null;
  if (toRow === row) return [];
  const rows = toRow - row + 1;
  const n = horizon + HOP_TICKS + margin + 2;
  const occ = masks(course, row, toRow, t0, n);
  const free = (r: number, c: number, k: number) => (occ[r * n + k]! & (1 << c)) === 0;
  const stride = rows * COLS;
  const size = stride * (horizon + 1);
  const parent = new Int32Array(size).fill(-1);
  const hopOf = new Int8Array(size).fill(-1); // -1 espera, 0 up, 1 left, 2 right
  const seen = new Uint8Array(size);
  const id = (r: number, c: number, k: number) => k * stride + r * COLS + c;
  const start = id(0, col, 0);
  seen[start] = 1;
  parent[start] = -2;
  const layers: (number[] | undefined)[] = [];
  layers[0] = [start];
  for (let k = 0; k <= horizon; k++) {
    const layer = layers[k];
    if (!layer) continue;
    for (const node of layer) {
      const rc = node % stride;
      const r = Math.floor(rc / COLS);
      const c = rc % COLS;
      if (r === rows - 1) {
        const hops: PlannedHop[] = [];
        let x = node;
        let kk = k;
        while (parent[x]! !== -2) {
          const h = hopOf[x]!;
          const p = parent[x]!;
          if (h >= 0) hops.push({ tick: t0 + kk - HOP_TICKS, dir: DIRS[h]! });
          kk = h >= 0 ? kk - HOP_TICKS : kk - 1;
          x = p;
        }
        return hops.reverse();
      }
      if (k + 1 <= horizon && free(r, c, k + 1)) {
        const nid = id(r, c, k + 1);
        if (!seen[nid]) {
          seen[nid] = 1;
          parent[nid] = node;
          (layers[k + 1] ??= []).push(nid);
        }
      }
      if (k + HOP_TICKS > horizon) continue;
      for (let d = 0; d < 3; d++) {
        const dir = DIRS[d]!;
        const tr = dir === "up" ? r + 1 : r;
        const tc = dir === "up" ? c : c + (dir === "left" ? -1 : 1);
        if (tr >= rows || tc < 0 || tc >= COLS) continue;
        let ok = true;
        for (let j = 1; j < HOP_SWITCH && ok; j++) if (!free(r, c, k + j)) ok = false;
        for (let j = HOP_SWITCH; j <= HOP_TICKS + margin && ok; j++) if (!free(tr, tc, k + j)) ok = false;
        if (!ok) continue;
        const nid = id(tr, tc, k + HOP_TICKS);
        if (seen[nid]) continue;
        seen[nid] = 1;
        parent[nid] = node;
        hopOf[nid] = d;
        (layers[k + HOP_TICKS] ??= []).push(nid);
      }
    }
    layers[k] = undefined;
  }
  return null;
}

/** ¿se puede saltar desde (row, col) en `t` hacia `dir`, con la caja en el origen, después en el destino, y margen al aterrizar? */
export function hopSafe(course: Course, row: number, col: number, t: number, dir: Dir): { row: number; col: number } | null {
  const to = target(row, col, dir);
  if (!to) return null;
  const from = course.lanes[row]!;
  const dest = course.lanes[to.row];
  if (!dest) return null;
  for (let k = 1; k < HOP_SWITCH; k++) if (occupied(from, col, t + k)) return null;
  for (let k = HOP_SWITCH; k <= HOP_TICKS + MARGIN_TICKS; k++) if (occupied(dest, to.col, t + k)) return null;
  return to;
}

/** un camino para cruzar el bloque que arranca en la vereda `from` hasta la vereda `to`, saliendo del medio en `t0` */
export function solveBlock(course: Course, from: number, to: number, t0: number): PlannedHop[] | null {
  return solveFrom(course, from, START_COL, t0, to, 1200);
}

/** la vereda que cierra el bloque en el que está (o del que sale) la fila `row` */
export function nextSidewalk(course: Course, row: number): number {
  for (let r = row + 1; r < course.lanes.length; r++) if (course.lanes[r]!.kind === "sidewalk") return r;
  ensureRows(course, row + AHEAD_ROWS);
  return nextSidewalk(course, row);
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

export interface HopEvent {
  tick: number;
  dir: Dir;
}
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = HopEvent | EndEvent;

export type Parsed = { ok: true; hops: HopEvent[]; endTick: number } | { ok: false; reason: string };

export function parseTrace(events: unknown): Parsed {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > END_TICK + 1) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const hops: HopEvent[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Partial<HopEvent> | null;
    if (!e || typeof e !== "object" || "fin" in e || !Number.isInteger(e.tick)) return { ok: false, reason: "salto mal armado" };
    if (typeof e.dir !== "string" || !DIRS.includes(e.dir as Dir)) return { ok: false, reason: "dirección inválida" };
    const tick = e.tick as number;
    if (tick < 0) return { ok: false, reason: "tick negativo" };
    if (tick <= prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= endTick) return { ok: false, reason: "salto después del final" };
    prev = tick;
    hops.push({ tick, dir: e.dir as Dir });
  }
  return { ok: true, hops, endTick };
}

export interface SimResult {
  rows: number;
  crashed: boolean;
  crashTick: number;
  state: SimState;
}

/** vuelve a jugar: aplica cada salto en su tick y avanza hasta endTick (o hasta el choque) */
export function simulate(seed: string, hops: readonly HopEvent[], endTick: number): SimResult {
  const s = initialState(seed);
  let k = 0;
  while (s.tick < endTick && !s.crashed) {
    while (k < hops.length && hops[k]!.tick === s.tick) applyInput(s, hops[k++]!.dir);
    step(s);
  }
  return { rows: s.maxRow, crashed: s.crashed, crashTick: s.crashTick, state: s };
}

export type CheckResult = { ok: true; rows: number; endTick: number; crashed: boolean } | { ok: false; reason: string };

export function check(seed: string, events: unknown, elapsedMs?: number): CheckResult {
  const p = parseTrace(events);
  if (!p.ok) return p;
  const r = simulate(seed, p.hops, p.endTick);
  if (r.crashed && r.crashTick !== p.endTick) return { ok: false, reason: "el tick de fin no es el del choque" };
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(p.endTick, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, rows: r.rows, endTick: p.endTick, crashed: r.crashed };
}

export function validate(result: { score: number; events: unknown[] }, seed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(seed, result.events, meta?.elapsedMs);
  return v.ok && v.rows === result.score;
}

// ---------------------------------------------------------------------------
// el jugador automático
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** cuántos bloques cruza; después se para en la primera calle del siguiente y espera a que lo atropellen */
  blocks?: number;
  /** ticks entre que el plan dice saltar y el salto (reacción); 0 es el jugador justo */
  reaction?: number;
  /** ticks que se queda pensando en cada vereda */
  pause?: number;
  /** ticks mínimos entre un salto y el siguiente (un pulgar) */
  hopGap?: number;
  /** hasta qué tick juega */
  untilTick?: number;
  /** margen que exige al aterrizar (ticks); por defecto, el de la justicia más la reacción y el gap */
  margin?: number;
}

/**
 * Cruza bloque por bloque con el buscador. Con `reaction`, cada salto sale
 * esa cantidad de ticks después de lo planeado, y con `hopGap` no encadena
 * saltos más rápido que eso; si el plan dejó de ser seguro, vuelve a planear
 * desde donde está. Con `blocks`, después de cruzarlos salta a la primera
 * calle del bloque siguiente y espera ahí hasta que lo atropellan.
 */
export function botTrace(seed: string, opts: BotOptions = {}): { events: TraceEvent[]; result: SimResult } {
  const s = initialState(seed);
  const hops: HopEvent[] = [];
  const reaction = opts.reaction ?? 0;
  const pause = opts.pause ?? 0;
  const hopGap = opts.hopGap ?? 0;
  const until = opts.untilTick ?? END_TICK;
  const margin = opts.margin ?? Math.max(MARGIN_TICKS, reaction + hopGap);
  let crossed = 0;
  let plan: PlannedHop[] = [];
  let planFrom = 0;
  let lastHop = -1000;
  let parked = false;
  const act = (dir: Dir) => {
    applyInput(s, dir);
    hops.push({ tick: s.tick, dir });
    lastHop = s.tick;
  };
  /** ¿la casilla donde está se ocupa antes de que llegue a reaccionar? entonces el reflejo manda: sin demora */
  const danger = (): boolean => {
    const lane = s.course.lanes[s.row]!;
    if (lane.kind === "sidewalk") return false;
    for (let k = 1; k <= reaction + hopGap; k++) if (occupied(lane, s.col, s.tick + k)) return true;
    return false;
  };
  while (s.tick < until && !s.crashed) {
    const panic = !s.hop && !parked && danger();
    if (!s.hop && !parked && (panic || s.tick >= lastHop + hopGap)) {
      const lane = s.course.lanes[s.row]!;
      if (panic) {
        // un salto seguro ya, el que sea (primero adelante)
        const to = nextSidewalk(s.course, s.row);
        const now = solveFrom(s.course, s.row, s.col, s.tick, to, 600, MARGIN_TICKS);
        plan = now ? now.map((h) => ({ tick: h.tick, dir: h.dir })) : [];
        planFrom = s.tick;
      }
      if (plan.length === 0 && s.tick >= planFrom) {
        if (lane.kind === "sidewalk" && opts.blocks !== undefined && crossed >= opts.blocks) {
          if (s.course.lanes[s.row + 1]!.kind !== "sidewalk") {
            act("up");
            parked = true;
          }
        } else {
          const to = nextSidewalk(s.course, s.row);
          plan = (solveFrom(s.course, s.row, s.col, s.tick + reaction, to, 1200, margin) ?? []).map((h) => ({ tick: h.tick, dir: h.dir }));
          if (plan.length === 0) planFrom = s.tick + 30;
        }
      }
      if (plan.length > 0 && s.tick >= plan[0]!.tick) {
        const next = plan.shift()!;
        const still = hopSafe(s.course, s.row, s.col, s.tick, next.dir);
        if (still) {
          act(next.dir);
          if (s.course.lanes[still.row]!.kind === "sidewalk" && still.row > s.row) {
            crossed++;
            planFrom = s.tick + HOP_TICKS + pause;
            plan = [];
          }
        } else {
          plan = [];
          planFrom = s.tick + reaction;
        }
      }
    }
    step(s);
  }
  const endTick = s.crashed ? s.crashTick : Math.min(s.tick, END_TICK);
  const events: TraceEvent[] = [...hops, { tick: endTick, fin: true }];
  return { events, result: { rows: s.maxRow, crashed: s.crashed, crashTick: s.crashTick, state: s } };
}
