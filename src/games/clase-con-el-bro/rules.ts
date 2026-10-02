// Reglas de "clase con el bro": geometría exacta (enteros y BigInt, sin
// flotantes en nada que decida un puntaje), los 3 objetos de la partida desde
// la semilla, el puntaje de cada corte, el resolvedor que encuentra una recta
// 50/50 (justicia), la traza y `validate`. Sin DOM.
//
// Unidades: la mesa es una grilla de 0 a GRID (10.000) en x e y; los vértices
// y los puntos de la traza son enteros. Las áreas se llevan dobladas (shoelace
// sin dividir por 2) y los pedazos cortados, como fracciones exactas.

import { rngFromSeed } from "@/lib/rng";
import { GRID, LEVELS, placeShape, SHAPES, type Level, type Pt, type Shape, type ShapeId } from "./shapes";

export { GRID };
export const CUTS = 3;
export const DURATION_MS = 45_000;
/** después de cada corte: se ve el resultado y la reacción, y los toques no cuentan */
export const PAUSE_MS = 1_500;
/** el resumen del tercer corte se ve este tiempo antes de onFinish */
export const END_HOLD_MS = 1_000;
/** margen sobre los 45 s para los tiempos de la traza */
export const T_SLACK_MS = 1_000;
/** largo mínimo del deslizamiento, en unidades de la mesa (un 10 %: unos 40 px en un teléfono) */
export const MIN_CUT_UNITS = 1_000;
/** y en píxeles físicos, en el cliente */
export const MIN_CUT_PX = 40;
export const MAX_CUT_SCORE = 1_000;
export const MAX_SCORE = CUTS * MAX_CUT_SCORE;
/** desde este puntaje Big Bro dice "Despegado" (53,75 / 46,25 o mejor) */
export const GOOD_SCORE = 850;
export const SAY_GOOD = "Despegado";
export const SAY_BAD = "Sos un sopa bro";
/** rotación de 0° a 359° y escala del 90 % al 110 % */
export const ROTATION_MAX = 359;
export const SCALE_MIN = 90;
export const SCALE_MAX = 110;

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FoodObject {
  shape: ShapeId;
  level: Level;
  rotation: number;
  scale: number;
  verts: Pt[];
}

// ---------------------------------------------------------------------------
// los objetos de la partida
// ---------------------------------------------------------------------------

export function generateObjects(seed: string): FoodObject[] {
  const rng = rngFromSeed(`clase:${seed}`);
  return LEVELS.map((level) => {
    const shape: Shape = rng.pick(SHAPES.filter((s) => s.level === level));
    const rotation = rng.int(0, ROTATION_MAX);
    const scale = rng.int(SCALE_MIN, SCALE_MAX);
    return { shape: shape.id, level, rotation, scale, verts: placeShape(shape.verts, rotation, scale) };
  });
}

// ---------------------------------------------------------------------------
// geometría exacta
// ---------------------------------------------------------------------------

/** fracción exacta n/d con d > 0, siempre reducida */
export interface Frac {
  n: bigint;
  d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}
export function frac(n: bigint, d: bigint): Frac {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}
export function fracAdd(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}
/** signo de a − b */
export function fracCmp(a: Frac, b: Frac): number {
  const x = a.n * b.d - b.n * a.d;
  return x > 0n ? 1 : x < 0n ? -1 : 0;
}
export function fracToNumber(f: Frac): number {
  return Number(f.n) / Number(f.d);
}

/** área doblada (shoelace), positiva si el polígono va en sentido antihorario */
export function signedArea2(verts: readonly Pt[]): bigint {
  let s = 0n;
  for (let i = 0; i < verts.length; i++) {
    const [ax, ay] = verts[i]!;
    const [bx, by] = verts[(i + 1) % verts.length]!;
    s += BigInt(ax) * BigInt(by) - BigInt(bx) * BigInt(ay);
  }
  return s;
}
export function area2(verts: readonly Pt[]): bigint {
  const s = signedArea2(verts);
  return s < 0n ? -s : s;
}

/** largo al cuadrado del deslizamiento */
export function cutLength2(l: Line): number {
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  return dx * dx + dy * dy;
}

/** de qué lado de la recta queda un punto: > 0 izquierda (mirando de 1 a 2), < 0 derecha, 0 sobre la recta */
export function sideOf(l: Line, x: number, y: number): bigint {
  return BigInt(l.x2 - l.x1) * BigInt(y - l.y1) - BigInt(l.y2 - l.y1) * BigInt(x - l.x1);
}

/** un vértice exacto de un pedazo: (x/d, y/d) */
export interface RPt {
  x: bigint;
  y: bigint;
  d: bigint;
}

/**
 * el pedazo del polígono que queda de un lado de la recta (Sutherland–Hodgman
 * contra un semiplano, con los cruces como puntos racionales exactos). Para
 * una forma cóncava el resultado puede ser varios pedazos unidos por aristas
 * de ida y vuelta sobre la recta: el área sale bien igual, que es lo que se mide.
 */
export function clipSide(verts: readonly Pt[], l: Line, left: boolean): RPt[] {
  const out: RPt[] = [];
  const n = verts.length;
  const inside = (s: bigint) => (left ? s >= 0n : s <= 0n);
  for (let i = 0; i < n; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % n]!;
    const sa = sideOf(l, a[0], a[1]);
    const sb = sideOf(l, b[0], b[1]);
    const ina = inside(sa);
    const inb = inside(sb);
    if (ina) out.push({ x: BigInt(a[0]), y: BigInt(a[1]), d: 1n });
    if (ina !== inb && sa !== sb) {
      // el cruce: A + t (B − A) con t = sa / (sa − sb)
      const d = sa - sb;
      out.push({ x: BigInt(a[0]) * d + BigInt(b[0] - a[0]) * sa, y: BigInt(a[1]) * d + BigInt(b[1] - a[1]) * sa, d });
    }
  }
  return out.map((p) => (p.d < 0n ? { x: -p.x, y: -p.y, d: -p.d } : p));
}

/** área doblada exacta de un polígono con vértices racionales */
export function area2Of(poly: readonly RPt[]): Frac {
  let acc: Frac = { n: 0n, d: 1n };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    acc = fracAdd(acc, frac(a.x * b.y - b.x * a.y, a.d * b.d));
  }
  if (acc.n < 0n) acc = { n: -acc.n, d: acc.d };
  return acc;
}

export interface Split {
  /** áreas dobladas de cada lado */
  left: Frac;
  right: Frac;
  total: bigint;
}

export function splitAreas(verts: readonly Pt[], l: Line): Split {
  return { left: area2Of(clipSide(verts, l, true)), right: area2Of(clipSide(verts, l, false)), total: area2(verts) };
}

/** redondeo al entero más cercano de n/d (d > 0), mitades hacia arriba */
function roundDiv(n: bigint, d: bigint): number {
  const q = (2n * n + d) / (2n * d);
  // la división de BigInt trunca hacia cero: para negativos, floor
  const r = 2n * n + d - q * (2n * d);
  return Number(r < 0n ? q - 1n : q);
}

/** puntaje del corte: 1000 − 40 × (por ciento del lado mayor − 50), redondeado, sin bajar de 0 */
export function scoreFor(big: Frac, total: bigint): number {
  // 1000 − 40 (100 big/total − 50) = (3000 total − 4000 big) / total
  const num = 3000n * total * big.d - 4000n * big.n;
  if (num <= 0n) return 0;
  return Math.min(MAX_CUT_SCORE, roundDiv(num, total * big.d));
}

/** por ciento con un decimal (en décimas) de un lado */
export function pctTenths(side: Frac, total: bigint): number {
  return roundDiv(1000n * side.n, total * side.d);
}

export interface CutOutcome {
  left: Frac;
  right: Frac;
  total: bigint;
  /** décimas de por ciento de cada lado */
  leftPct10: number;
  rightPct10: number;
  score: number;
  good: boolean;
}

/** mide un corte; null si la recta no toca el objeto (un lado queda sin área) */
export function evaluateCut(verts: readonly Pt[], l: Line): CutOutcome | null {
  const { left, right, total } = splitAreas(verts, l);
  if (left.n === 0n || right.n === 0n) return null;
  const big = fracCmp(left, right) >= 0 ? left : right;
  const score = scoreFor(big, total);
  return { left, right, total, leftPct10: pctTenths(left, total), rightPct10: pctTenths(right, total), score, good: score >= GOOD_SCORE };
}

export function sayFor(score: number): string {
  return score >= GOOD_SCORE ? SAY_GOOD : SAY_BAD;
}

// ---------------------------------------------------------------------------
// justicia: el resolvedor
// ---------------------------------------------------------------------------

/** |izquierda − mitad| como número, solo para elegir entre candidatos */
function halfError(s: Split): number {
  return Math.abs(Number(2n * s.left.n - s.total * s.left.d) / Number(2n * s.left.d));
}

/**
 * busca una recta que divida el objeto 50/50: primero una vertical (el área
 * de la izquierda crece con x), después afina con rectas de (a, 0) a
 * (b, GRID) para varias a cerca, buscando b por bisección (el área de la
 * izquierda crece con b). Devuelve la mejor, con su puntaje.
 */
export function solveCut(verts: readonly Pt[]): { line: Line; score: number; error: number } {
  const half = (s: Split) => fracCmp(s.left, frac(s.total, 2n));
  // la vertical
  let lo = 0;
  let hi = GRID;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (half(splitAreas(verts, { x1: mid, y1: 0, x2: mid, y2: GRID })) < 0) lo = mid;
    else hi = mid;
  }
  let best: { line: Line; error: number } | null = null;
  const consider = (line: Line) => {
    const s = splitAreas(verts, line);
    if (s.left.n === 0n || s.right.n === 0n) return;
    const error = halfError(s);
    if (!best || error < best.error) best = { line, error };
  };
  for (let a = lo - 10; a <= lo + 10; a++) {
    let blo = a - 800;
    let bhi = a + 800;
    while (bhi - blo > 1) {
      const mid = (blo + bhi) >> 1;
      if (half(splitAreas(verts, { x1: a, y1: 0, x2: mid, y2: GRID })) < 0) blo = mid;
      else bhi = mid;
    }
    consider({ x1: a, y1: 0, x2: blo, y2: GRID });
    consider({ x1: a, y1: 0, x2: bhi, y2: GRID });
  }
  const b = best as { line: Line; error: number } | null;
  if (!b) throw new Error("el resolvedor no encontró recta");
  const o = evaluateCut(verts, b.line)!;
  return { line: b.line, score: o.score, error: b.error };
}

/** corre una recta en paralelo (unidades de la mesa, hacia la izquierda si es positivo); para pruebas */
export function shiftLine(l: Line, units: number): Line {
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = Math.round((-dy / len) * units);
  const ny = Math.round((dx / len) * units);
  return { x1: l.x1 + nx, y1: l.y1 + ny, x2: l.x2 + nx, y2: l.y2 + ny };
}

// ---------------------------------------------------------------------------
// la partida (por tiempo en ms desde onReady, sin ticks)
// ---------------------------------------------------------------------------

export interface CutEvent {
  cut: number;
  t: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CutResult {
  cut: number;
  t: number;
  line: Line;
  outcome: CutOutcome;
}

export interface GameState {
  objects: FoodObject[];
  cuts: CutResult[];
  total: number;
}

export function initialState(seed: string): GameState {
  return { objects: generateObjects(seed), cuts: [], total: 0 };
}

export function currentIndex(s: GameState): number {
  return s.cuts.length;
}
export function isDone(s: GameState): boolean {
  return s.cuts.length >= CUTS;
}
/** en la pausa después de un corte (los toques no cuentan) */
export function inPause(s: GameState, t: number): boolean {
  const last = s.cuts[s.cuts.length - 1];
  return !!last && t < last.t + PAUSE_MS;
}

export type CutRejection = "terminó" | "en la pausa" | "muy corto" | "no toca";

/** aplica un corte en el tiempo t; devuelve el resultado o por qué no contó */
export function applyCut(s: GameState, l: Line, t: number): { ok: true; result: CutResult } | { ok: false; why: CutRejection } {
  if (isDone(s)) return { ok: false, why: "terminó" };
  if (inPause(s, t)) return { ok: false, why: "en la pausa" };
  if (cutLength2(l) < MIN_CUT_UNITS * MIN_CUT_UNITS) return { ok: false, why: "muy corto" };
  const outcome = evaluateCut(s.objects[s.cuts.length]!.verts, l);
  if (!outcome) return { ok: false, why: "no toca" };
  const result: CutResult = { cut: s.cuts.length + 1, t, line: l, outcome };
  s.cuts.push(result);
  s.total += outcome.score;
  return { ok: true, result };
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

const MAX_COORD = 2 * GRID;

function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}

export type CheckResult = { ok: true; state: GameState; finished: boolean } | { ok: false; reason: string };

/** vuelve a cortar los objetos de la semilla con la traza y compara con el total */
export function check(seed: string, events: unknown, elapsedMs?: number): CheckResult {
  if (!Array.isArray(events)) return { ok: false, reason: "la traza no es una lista" };
  if (events.length > CUTS) return { ok: false, reason: "más de 3 cortes" };
  const s = initialState(seed);
  let lastT = -1;
  for (let i = 0; i < events.length; i++) {
    const e = events[i] as Partial<CutEvent> | null;
    if (!e || typeof e !== "object") return { ok: false, reason: "evento inválido" };
    if (!isInt(e.cut) || !isInt(e.t) || !isInt(e.x1) || !isInt(e.y1) || !isInt(e.x2) || !isInt(e.y2)) return { ok: false, reason: "evento inválido" };
    if (e.cut !== i + 1) return { ok: false, reason: "los cortes no van en orden" };
    if (e.t < 0 || e.t > DURATION_MS + T_SLACK_MS) return { ok: false, reason: "tiempo fuera de rango" };
    if (e.t <= lastT) return { ok: false, reason: "los tiempos no crecen" };
    for (const c of [e.x1, e.y1, e.x2, e.y2]) if (c < -MAX_COORD || c > MAX_COORD) return { ok: false, reason: "punto fuera de la mesa" };
    const r = applyCut(s, { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 }, e.t);
    if (!r.ok) return { ok: false, reason: r.why === "en la pausa" ? "un corte en la pausa" : r.why === "muy corto" ? "un corte muy corto" : r.why === "no toca" ? "un corte que no toca el objeto" : "un corte de más" };
    lastT = e.t;
  }
  if (elapsedMs !== undefined && lastT > elapsedMs) return { ok: false, reason: "la partida duró más que el intento" };
  return { ok: true, state: s, finished: isDone(s) };
}

export function validate(result: { score: number; events: unknown[] }, seed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(seed, result.events, meta?.elapsedMs);
  return v.ok && v.state.total === result.score;
}

/** jugador automático: la recta del resolvedor corrida `offsets[i]` unidades, cortes cada `gapMs` */
export function botTrace(seed: string, opts: { offsets?: number[]; gapMs?: number; maxCuts?: number } = {}): { events: CutEvent[]; state: GameState } {
  const s = initialState(seed);
  const events: CutEvent[] = [];
  const gap = opts.gapMs ?? 2_000;
  const max = Math.min(CUTS, opts.maxCuts ?? CUTS);
  let t = 800;
  for (let i = 0; i < max; i++) {
    const sol = solveCut(s.objects[i]!.verts);
    const line = shiftLine(sol.line, opts.offsets?.[i] ?? 0);
    const r = applyCut(s, line, t);
    if (!r.ok) throw new Error(`el jugador automático no pudo cortar: ${r.why}`);
    events.push({ cut: i + 1, t, ...line });
    t += PAUSE_MS + gap;
  }
  return { events, state: s };
}
