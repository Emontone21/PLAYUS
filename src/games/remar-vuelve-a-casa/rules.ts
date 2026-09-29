// "remar vuelve a casa": el río, la simulación y la validación, puras y
// compartidas por el cliente (para jugar y dibujar) y el servidor (para
// validar la traza). Mismo esquema que Larry: 60 ticks por segundo, todo en
// enteros, y el único azar sale de rngFromSeed con la semilla del intento.
//
// Unidades. La pantalla mide 90 × 160 unidades lógicas; las posiciones
// laterales van en subunidades (16 por unidad). El avance va en "distancia":
// 600 por metro y 100 por unidad de pantalla (1 m = 6 unidades). Así la
// velocidad base de 6 m/s son 60 de distancia por tick, y los metros del
// puntaje son floor(distancia / 600).

import { rngFromSeed, type Rng } from "../../lib/rng";
import { elapsedMismatch, parseTrace, targetAt, type EndEvent, type InputEvent, type TraceEvent } from "../lib/trace";

export type { EndEvent, InputEvent, TraceEvent };

export const TICKS_PER_S = 60;
export const DURATION_MS = 120_000;
/** a los 120 s la partida termina: el último tick simulado es END_TICK - 1 */
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen de /finish sobre la duración real (el mismo que gameLimits) */
export const ELAPSED_SLACK_MS = 10_000;

/** subunidades por unidad lógica (lateral) */
export const SUB = 16;
export const FIELD_W = 90;
export const FIELD_H = 160;
/** distancia por metro y por unidad de pantalla */
export const D_PER_M = 600;
export const D_PER_UNIT = 100;

/** las orillas: el río va de RIVER_L a RIVER_R */
export const BANK_W = 3;
export const RIVER_L = BANK_W;
export const RIVER_R = FIELD_W - BANK_W;

/** el bote: sprite de 10 × 16, caja de choque de 8 × 12, centro en y = 130 */
export const BOAT_W = 10;
export const BOAT_H = 16;
export const BOAT_HIT_W = 8;
export const BOAT_HIT_H = 12;
export const BOAT_Y = 130;
export const BOAT_START = 45;
export const BOAT_MIN = RIVER_L + BOAT_W / 2;
export const BOAT_MAX = RIVER_R - BOAT_W / 2;
/** velocidad lateral máxima, en subunidades por tick (2,25 unidades: cruza el río en 0,6 s). No cambia con el whisky. */
export const BOAT_SPEED = 36;

/** velocidad de avance base, en distancia por tick: 6 m/s al empezar, 10 m/s a los 90 s */
export const SPEED_START = 60;
export const SPEED_END = 100;
export const RAMP_TICKS = 90 * TICKS_PER_S;
/** cada botella suma 10 % permanente, con tope ×2 */
export const MULT_START = 100;
export const MULT_PER_BOTTLE = 10;
export const MULT_MAX = 200;

function lerpInt(a: number, b: number, num: number, den: number): number {
  return a + Math.floor(((b - a) * num) / den);
}

/** velocidad base en el tick `tick` (sin whisky) */
export function baseSpeed(tick: number): number {
  const t = Math.max(0, Math.min(tick, RAMP_TICKS));
  return lerpInt(SPEED_START, SPEED_END, t, RAMP_TICKS);
}

export function multFor(bottles: number): number {
  return Math.min(MULT_MAX, MULT_START + MULT_PER_BOTTLE * bottles);
}

/** velocidad de avance en un tick con un multiplicador */
export function speedAt(tick: number, mult: number): number {
  return Math.floor((baseSpeed(tick) * mult) / 100);
}

// ---------------------------------------------------------------------------
// lo que flota: cubiertos y botellas
// ---------------------------------------------------------------------------

export const PIECE_KINDS = ["tenedor", "cuchillo", "cuchara", "cucharon", "tenedor-d", "cuchillo-d", "cuchara-d"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];
export type ItemKind = PieceKind | "botella";

/** tamaño del sprite (unidades); la caja de choque es más chica */
export const SIZES: Record<ItemKind, { w: number; h: number }> = {
  tenedor: { w: 12, h: 4 },
  cuchillo: { w: 14, h: 4 },
  cuchara: { w: 10, h: 4 },
  cucharon: { w: 16, h: 5 },
  "tenedor-d": { w: 10, h: 9 },
  "cuchillo-d": { w: 11, h: 10 },
  "cuchara-d": { w: 9, h: 8 },
  botella: { w: 6, h: 10 },
};
/** la caja de choque de un cubierto: 2 unidades más angosta que el dibujo y 4 de alto (un roce visual no mata) */
export const PIECE_HIT_H = 4;
export const PIECE_HIT_SHRINK = 2;
/** la botella se agarra con su dibujo entero */
export const BOTTLE_HIT = SIZES.botella;

export function hitSize(kind: ItemKind): { w: number; h: number } {
  if (kind === "botella") return BOTTLE_HIT;
  return { w: SIZES[kind].w - PIECE_HIT_SHRINK, h: PIECE_HIT_H };
}

export function isBottle(kind: ItemKind): kind is "botella" {
  return kind === "botella";
}

/** un cubierto que deriva de costado: onda triangular entre `from` y `to` (centros, unidades), un paso cada `rate` ticks */
export interface Drift {
  from: number;
  to: number;
  rate: number;
}

export interface Item {
  /** distancia del centro */
  d: number;
  kind: ItemKind;
  /** centro, unidades enteras (sin deriva) */
  x: number;
  /** caja de choque, unidades */
  w: number;
  h: number;
  drift: Drift | null;
  /** fila a la que pertenece; -1 suelto entre filas; -2 botella */
  row: number;
}

export interface Row {
  d: number;
  /** centro del hueco garantizado y su ancho (unidades) */
  gap: number;
  gapW: number;
}

export interface Course {
  /** ordenados por distancia */
  items: Item[];
  rows: Row[];
  /** índices en items */
  bottles: number[];
}

/** dónde está el centro de un objeto en el tick dado (la deriva es una función del tick) */
export function itemX(item: Item, tick: number): number {
  const dr = item.drift;
  if (!dr) return item.x;
  const span = dr.to - dr.from;
  if (span <= 0) return dr.from;
  const phase = Math.floor(tick / dr.rate) % (2 * span);
  return dr.from + (phase <= span ? phase : 2 * span - phase);
}

// ---------------------------------------------------------------------------
// el río: se genera entero con la semilla, por distancia (no por tiempo)
// ---------------------------------------------------------------------------

/** la primera fila, y hasta dónde se genera (más de lo que se puede remar en 120 s a ×2) */
export const FIRST_ROW_D = 20 * D_PER_M;
/** separación entre filas: 12 m al empezar, 7 m a los 500 m, 6 m desde los 900 m */
export const SPACING_START = 12 * D_PER_M;
export const SPACING_AT_500 = 7 * D_PER_M;
export const SPACING_MIN = 6 * D_PER_M;
export const SPACING_JITTER = 15;
/** ancho del hueco garantizado: 30 al empezar, 18 desde los 600 m (el bote choca con 8) */
export const GAP_START = 30;
export const GAP_AT_600 = 18;
export const GAP_MIN = 18;
/** los cubiertos que derivan, desde acá */
export const DRIFT_FROM_M = 400;
/** cubiertos sueltos entre filas, desde acá */
export const STRAY_FROM_M = 100;
/** una botella cada 80 a 120 m */
export const BOTTLE_EVERY_MIN_M = 80;
export const BOTTLE_EVERY_MAX_M = 120;
/** lo que un objeto suelto se aleja (en distancia) de las filas vecinas y de la botella */
export const CORRIDOR_MARGIN_D = 14 * D_PER_UNIT;
/** una botella va al medio del corredor, y solo si el corredor da para esto de cada lado */
export const BOTTLE_MARGIN_D = 16 * D_PER_UNIT;
/** fracción de la velocidad lateral con la que se garantiza llegar al próximo hueco */
export const REACH_NUM = 3;
export const REACH_DEN = 4;
/** ticks de más que se descuentan en cada tramo garantizado */
export const REACH_SLACK_TICKS = 2;

function spacingAt(d: number): number {
  const m = Math.floor(d / D_PER_M);
  if (m >= 500) return Math.max(SPACING_MIN, lerpInt(SPACING_AT_500, SPACING_MIN, Math.min(m - 500, 400), 400));
  return lerpInt(SPACING_START, SPACING_AT_500, m, 500);
}
function gapWidthAt(d: number): number {
  const m = Math.floor(d / D_PER_M);
  const w = m >= 600 ? GAP_MIN : lerpInt(GAP_START, GAP_AT_600, m, 600);
  return Math.max(GAP_MIN, w - (w % 2));
}

/** cuántas botellas hay antes de la distancia `d` (estricto) */
function bottlesBefore(course: Course, d: number): number {
  let n = 0;
  for (const i of course.bottles) if (course.items[i]!.d < d) n++;
  return n;
}

/**
 * Tick en que un bote sin whisky llega a la distancia `d`: ningún jugador
 * llega más tarde que eso, y la velocidad base solo sube con el tiempo. Se usa
 * para acotar la velocidad de avance más alta posible en cada punto.
 */
const SLOW_DIST: number[] = (() => {
  const out = [0];
  for (let t = 0; t < END_TICK; t++) out.push(out[t]! + baseSpeed(t));
  return out;
})();
export function slowestArrival(d: number): number {
  if (SLOW_DIST[END_TICK]! < d) return END_TICK;
  let lo = 0;
  let hi = END_TICK;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (SLOW_DIST[mid]! >= d) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** la velocidad de avance más alta posible al llegar a `d`, con `mult` de whisky como máximo */
export function maxSpeedAt(d: number, mult: number): number {
  return speedAt(slowestArrival(d), mult);
}

/**
 * Cuántas unidades laterales se garantizan entre dos puntos de paso (el
 * anterior de alto hPrev en dPrev, el próximo de alto hNext en dNext), yendo a
 * la velocidad de avance más alta posible con `mult`. El bote sale cuando
 * termina de pasar el anterior y tiene que estar en el próximo antes de
 * entrar en su franja.
 */
export function reachBetween(dPrev: number, hPrev: number, dNext: number, hNext: number, mult: number): number {
  return lateralReach(dNext - dPrev - ((hPrev + hNext) / 2 + BOAT_HIT_H) * D_PER_UNIT, maxSpeedAt(dNext, mult));
}

/** unidades laterales garantizadas en `availD` de distancia a la velocidad de avance `vmax` (con 3/4 de la lateral y dos ticks de resto) */
export function lateralReach(availD: number, vmax: number): number {
  const ticks = Math.floor(availD / vmax) - REACH_SLACK_TICKS;
  if (ticks <= 0) return 0;
  return Math.floor((ticks * BOAT_SPEED * REACH_NUM) / (REACH_DEN * SUB));
}

/** la mitad de la franja en que un objeto de alto `h` se superpone con el bote (distancia) */
export function halfBand(h: number): number {
  return ((h + BOAT_HIT_H) / 2) * D_PER_UNIT;
}

/**
 * Los tres presupuestos de un corredor con botella, desde que el bote termina
 * de pasar el punto anterior hasta que entra en la fila:
 * - `toBottle`: llegar a la x de la botella antes de que termine de pasar;
 * - `onward`: desde que la botella aparece a la altura del bote hasta la fila
 *   (quien llegó antes espera ahí y sale al agarrarla), con el whisky nuevo;
 * - `total`: todo el corredor, con el whisky nuevo (el camino ida y vuelta
 *   entero tiene que entrar).
 */
export function bottleBudgets(prev: { d: number; h: number }, bd: number, rowD: number, multBefore: number, multAfter: number) {
  const prevEnd = prev.d + halfBand(prev.h);
  const rowStart = rowD - halfBand(PIECE_HIT_H);
  const hb = halfBand(BOTTLE_HIT.h);
  return {
    toBottle: lateralReach(bd + hb - prevEnd, maxSpeedAt(bd + hb, multBefore)),
    onward: lateralReach(rowStart - (bd - hb), maxSpeedAt(rowD, multAfter)),
    total: lateralReach(rowStart - prevEnd, maxSpeedAt(rowD, multAfter)),
  };
}

/** un punto de paso del camino seguro: el hueco de una fila o una botella */
export interface Waypoint {
  d: number;
  x: number;
  h: number;
  /** índice del item si es una botella */
  bottle: number | null;
  row: number | null;
}

export function waypoints(course: Course): Waypoint[] {
  const out: Waypoint[] = course.rows.map((r, i) => ({ d: r.d, x: r.gap, h: PIECE_HIT_H, bottle: null, row: i }));
  for (const i of course.bottles) out.push({ d: course.items[i]!.d, x: course.items[i]!.x, h: BOTTLE_HIT.h, bottle: i, row: null });
  return out.sort((a, b) => a.d - b.d);
}

const FILL_KINDS: readonly PieceKind[] = ["tenedor", "cuchillo", "cuchara", "cucharon", "tenedor-d", "cuchillo-d", "cuchara-d"];

/** llena un tramo [from, to] (unidades, bordes del tramo) con cubiertos pegados, con huequitos de 0 a 3 que no pasan */
function fillSpan(rng: Rng, from: number, to: number, d: number, row: number, allowDrift: boolean, gapL: number, gapR: number, out: Item[]) {
  // desde el borde del hueco hacia la orilla, así el cubierto pegado al hueco queda entero
  const fromGapSide = from === gapR;
  let cursor = fromGapSide ? from : to;
  let guard = 0;
  while (guard++ < 20) {
    const remaining = fromGapSide ? to - cursor : cursor - from;
    if (remaining < 4) break;
    const kind = rng.pick(FILL_KINDS);
    const sw = SIZES[kind].w;
    const hit = hitSize(kind);
    // el último puede asomar sobre la orilla; nunca hacia el hueco
    const center = fromGapSide ? cursor + sw / 2 : cursor - sw / 2;
    const x = Math.round(center);
    let drift: Drift | null = null;
    if (allowDrift && rng.int(0, 99) < 25) {
      // solo dentro de una banda que no toca el hueco garantizado ni se sale del todo del río
      const lo = fromGapSide ? gapR + 1 + hit.w / 2 : RIVER_L + hit.w / 2 - 2;
      const hi = fromGapSide ? RIVER_R - hit.w / 2 + 2 : gapL - 1 - hit.w / 2;
      const a = Math.ceil(lo);
      const b = Math.floor(hi);
      if (b - a >= 6) drift = { from: a, to: b, rate: rng.int(4, 8) };
    }
    out.push({ d, kind, x, w: hit.w, h: hit.h, drift, row });
    const hole = rng.int(0, 3);
    cursor = fromGapSide ? cursor + sw + hole : cursor - sw - hole;
  }
}

/**
 * Genera el río entero. Garantías (los tests las comprueban en 1.000
 * semillas, con bots que siguen el camino seguro con cualquier política de
 * botellas y a la velocidad máxima posible):
 * - toda fila tiene un hueco de al menos GAP_MIN, y su centro se alcanza
 *   desde el punto de paso anterior con 3/4 de la velocidad lateral a la
 *   velocidad de avance más alta posible en ese punto;
 * - una botella se alcanza desde el hueco anterior, y el hueco siguiente se
 *   alcanza desde ella (con el whisky que da) y también directo desde el
 *   hueco anterior (para quien la saltea);
 * - los cubiertos que derivan se mueven en una banda que nunca toca el hueco;
 * - los cubiertos sueltos entre filas quedan fuera del corredor que va del
 *   hueco anterior al siguiente (pasando por la botella, si hay).
 */
export function generateCourse(seed: string): Course {
  const rng = rngFromSeed(`${seed}:rio`);
  const course: Course = { items: [], rows: [], bottles: [] };
  const items = course.items;
  const maxD = (MAX_METERS + 40) * D_PER_M;
  let prev: Waypoint = { d: 0, x: BOAT_START, h: BOAT_HIT_H, bottle: null, row: null };
  let nextBottleD = rng.int(BOTTLE_EVERY_MIN_M, BOTTLE_EVERY_MAX_M) * D_PER_M;
  let d = FIRST_ROW_D;
  let rowIndex = 0;
  while (d < maxD) {
    const gapW = gapWidthAt(d);
    const meters = Math.floor(d / D_PER_M);
    const rowD = d;
    // el whisky que puede tener quien llega a esta fila: también el de la botella de este corredor, si entra
    const rowMult = multFor(bottlesBefore(course, rowD) + (nextBottleD <= rowD ? 1 : 0));
    const corridorStart = prev.d + (prev.h / 2) * D_PER_UNIT;

    // ¿va una botella en este corredor? Si ya tocaba, va al medio (el lugar
    // con más tiempo de cada lado); si el corredor es corto, al próximo
    let bottle: Waypoint | null = null;
    let budgets: ReturnType<typeof bottleBudgets> | null = null;
    if (nextBottleD <= rowD && rowD - prev.d >= 2 * BOTTLE_MARGIN_D) {
      const bd = Math.floor((prev.d + rowD) / 2 / D_PER_UNIT) * D_PER_UNIT;
      const before = bottlesBefore(course, bd);
      const b = bottleBudgets(prev, bd, rowD, multFor(before), multFor(before + 1));
      // hasta dónde puede estar la botella para que ir, agarrarla y volver a algún hueco entre en el corredor
      const span = Math.min(b.toBottle, b.onward, Math.floor(b.total / 2));
      const lo = Math.max(BOAT_MIN, prev.x - span);
      const hi = Math.min(BOAT_MAX, prev.x + span);
      // cómoda (un desvío corto desde donde viene el bote) o arriesgada (al borde de lo alcanzable)
      const risky = rng.int(0, 99) < 45;
      const side = rng.int(0, 1) === 0 ? -1 : 1;
      const x = risky ? (side < 0 ? lo : hi) : Math.max(lo, Math.min(hi, prev.x + side * rng.int(4, 10)));
      const reachDirect = reachBetween(prev.d, prev.h, rowD, PIECE_HIT_H, rowMult);
      if (gapCandidates(prev.x, reachDirect, gapW, { x, dx1: Math.abs(x - prev.x), onward: b.onward, total: b.total }).length) {
        items.push({ d: bd, kind: "botella", x, w: BOTTLE_HIT.w, h: BOTTLE_HIT.h, drift: null, row: -2 });
        course.bottles.push(items.length - 1);
        bottle = { d: bd, x, h: BOTTLE_HIT.h, bottle: items.length - 1, row: null };
        budgets = b;
        nextBottleD = bd + rng.int(BOTTLE_EVERY_MIN_M, BOTTLE_EVERY_MAX_M) * D_PER_M;
      }
    }

    // el hueco de esta fila: alcanzable directo desde el anterior y, si hay botella, también desde ella
    const reachDirect = reachBetween(prev.d, prev.h, rowD, PIECE_HIT_H, rowMult);
    let candidates = gapCandidates(prev.x, reachDirect, gapW, bottle && budgets ? { x: bottle.x, dx1: Math.abs(bottle.x - prev.x), onward: budgets.onward, total: budgets.total } : null);
    // con botella, mejor un hueco a más de 10 de ella: así agarrarla es un desvío y no un choque de casualidad
    if (bottle) {
      const bx = bottle.x;
      const apart = candidates.filter((g) => Math.abs(g - bx) >= 10);
      if (apart.length) candidates = apart;
    }
    // siempre hay al menos el x anterior (reach ≥ 0 y el hueco entra en el río)
    const gap = candidates.length ? candidates[rng.int(0, candidates.length - 1)]! : Math.max(BOAT_MIN, Math.min(BOAT_MAX, prev.x));
    const gapL = gap - gapW / 2;
    const gapR = gap + gapW / 2;
    const allowDrift = meters >= DRIFT_FROM_M;
    fillSpan(rng, RIVER_L, gapL, rowD, rowIndex, allowDrift, gapL, gapR, items);
    fillSpan(rng, gapR, RIVER_R, rowD, rowIndex, allowDrift, gapL, gapR, items);
    course.rows.push({ d: rowD, gap, gapW });

    // un cubierto suelto en el corredor, fuera del camino (desde los 150 m, cada vez más seguido)
    if (meters >= STRAY_FROM_M && rng.int(0, 99) < Math.min(70, 25 + Math.floor((meters - STRAY_FROM_M) / 15))) {
      const xs = [prev.x, gap, ...(bottle ? [bottle.x] : [])];
      const kind = rng.pick(FILL_KINDS);
      const hit = hitSize(kind);
      const margin = hit.w / 2 + BOAT_HIT_W / 2 + 3;
      const leftMax = Math.min(...xs) - margin;
      const rightMin = Math.max(...xs) + margin;
      const sides: number[] = [];
      if (leftMax >= RIVER_L + hit.w / 2 - 2) sides.push(rng.int(Math.ceil(RIVER_L + hit.w / 2 - 2), Math.floor(leftMax)));
      if (rightMin <= RIVER_R - hit.w / 2 + 2) sides.push(rng.int(Math.ceil(rightMin), Math.floor(RIVER_R - hit.w / 2 + 2)));
      const lo = corridorStart + CORRIDOR_MARGIN_D;
      const hi = rowD - CORRIDOR_MARGIN_D;
      if (sides.length && hi - lo >= D_PER_UNIT) {
        let sd = rng.int(Math.floor(lo / D_PER_UNIT), Math.floor(hi / D_PER_UNIT)) * D_PER_UNIT;
        // lejos de la botella también
        if (bottle && Math.abs(sd - bottle.d) < CORRIDOR_MARGIN_D) sd = -1;
        if (sd >= 0) items.push({ d: sd, kind, x: sides[rng.int(0, sides.length - 1)]!, w: hit.w, h: hit.h, drift: null, row: -1 });
      }
    }

    prev = { d: rowD, x: gap, h: PIECE_HIT_H, bottle: null, row: rowIndex };
    rowIndex++;
    const spacing = spacingAt(d);
    d += Math.floor((spacing * rng.int(100 - SPACING_JITTER, 100 + SPACING_JITTER)) / 100);
  }
  items.sort((a, b) => a.d - b.d || a.x - b.x);
  // los índices de las botellas, después de ordenar
  course.bottles = [];
  items.forEach((it, i) => {
    if (it.kind === "botella") course.bottles.push(i);
  });
  return course;
}

/**
 * Centros de hueco (unidades) que entran en el río, se alcanzan directo desde
 * `xa` y, si hay botella, también pasando por ella: a `onward` o menos de la
 * botella, con el camino entero (ida a la botella y de ahí al hueco) dentro de `total`.
 */
function gapCandidates(xa: number, reachA: number, gapW: number, via: { x: number; dx1: number; onward: number; total: number } | null): number[] {
  const lo = Math.max(RIVER_L + gapW / 2, xa - reachA);
  const hi = Math.min(RIVER_R - gapW / 2, xa + reachA);
  const out: number[] = [];
  for (let g = Math.ceil(lo); g <= Math.floor(hi); g++) {
    if (via) {
      const dx2 = Math.abs(g - via.x);
      if (dx2 > via.onward || via.dx1 + dx2 > via.total) continue;
    }
    out.push(g);
  }
  return out;
}

/** metros recorribles en 120 s a la velocidad máxima posible (×2 desde el primer tick): el maxPlausibleScore */
export function maxMeters(): number {
  let dist = 0;
  for (let t = 0; t < END_TICK; t++) dist += speedAt(t, MULT_MAX);
  return Math.floor(dist / D_PER_M);
}
export const MAX_METERS = maxMeters();
export const MAX_SCORE = MAX_METERS;

// ---------------------------------------------------------------------------
// la simulación, paso a paso
// ---------------------------------------------------------------------------

export type EndReason = "choque" | "tiempo";

export interface SimState {
  tick: number;
  /** distancia recorrida */
  dist: number;
  prevDist: number;
  /** centro del bote, en subunidades */
  boatX: number;
  prevBoatX: number;
  /** objetivo, en unidades enteras (lo fija el dedo) */
  target: number;
  bottles: number;
  mult: number;
  /** primer item que todavía no terminó de pasar */
  first: number;
  /** botellas agarradas (índices en items) */
  taken: number[];
  end: { tick: number; reason: EndReason } | null;
  // para dibujar: nada de esto cambia el resultado
  lastBottle: { tick: number } | null;
  crash: { item: number; x: number } | null;
}

export function initialState(mult = MULT_START): SimState {
  return {
    tick: 0,
    dist: 0,
    prevDist: 0,
    boatX: BOAT_START * SUB,
    prevBoatX: BOAT_START * SUB,
    target: BOAT_START,
    bottles: 0,
    mult,
    first: 0,
    taken: [],
    end: null,
    lastBottle: null,
    crash: null,
  };
}

/** la franja más alta que puede superponerse con el bote (la botella): hasta ahí se miran los objetos */
const MAX_HALF_D = ((BOTTLE_HIT.h + BOAT_HIT_H) / 2) * D_PER_UNIT;

export function metersOf(dist: number): number {
  return Math.floor(dist / D_PER_M);
}

/**
 * Avanza un tick. `target` es el objetivo vigente (el de la última entrada).
 * Orden: el bote se mueve de costado, avanza, y se revisan choques y
 * botellas contra lo que está a la altura. Muta el estado.
 */
export function step(state: SimState, course: Course, target: number): void {
  if (state.end) return;
  const t = state.tick;
  state.target = target;
  const goal = clamp(target, BOAT_MIN, BOAT_MAX) * SUB;
  state.prevBoatX = state.boatX;
  const dx = goal - state.boatX;
  state.boatX += Math.abs(dx) <= BOAT_SPEED ? dx : dx > 0 ? BOAT_SPEED : -BOAT_SPEED;

  state.prevDist = state.dist;
  state.dist += speedAt(t, state.mult);

  const items = course.items;
  const dist = state.dist;
  while (state.first < items.length && dist - items[state.first]!.d >= ((items[state.first]!.h + BOAT_HIT_H) / 2) * D_PER_UNIT) state.first++;
  for (let i = state.first; i < items.length; i++) {
    const it = items[i]!;
    if (it.d - dist >= MAX_HALF_D) break;
    const half = ((it.h + BOAT_HIT_H) / 2) * D_PER_UNIT;
    if (it.d - dist >= half) continue;
    if (isBottle(it.kind) && state.taken.includes(i)) continue;
    const ix = itemX(it, t);
    if (Math.abs(ix * SUB - state.boatX) >= ((it.w + BOAT_HIT_W) / 2) * SUB) continue;
    if (isBottle(it.kind)) {
      state.taken.push(i);
      state.bottles++;
      state.mult = Math.max(state.mult, multFor(state.bottles));
      state.lastBottle = { tick: t };
    } else {
      state.end = { tick: t + 1, reason: "choque" };
      state.crash = { item: i, x: ix };
      break;
    }
  }
  state.tick = t + 1;
  if (!state.end && state.tick >= END_TICK) state.end = { tick: state.tick, reason: "tiempo" };
}

function clamp(n: number, lo: number, hi: number) {
  return n < lo ? lo : n > hi ? hi : n;
}

// ---------------------------------------------------------------------------
// la traza y la validación
// ---------------------------------------------------------------------------

export interface SimResult {
  score: number;
  bottles: number;
  endTick: number;
  endReason: EndReason | null;
  state: SimState;
}

/**
 * Corre la partida con la semilla y las entradas hasta que termina o hasta
 * `untilTick` (el corte del cronómetro). Las entradas tienen que venir en
 * orden; acá no se valida nada (eso es `check`).
 */
export function simulate(attemptSeed: string, inputs: readonly InputEvent[], untilTick = END_TICK, course = generateCourse(attemptSeed)): SimResult {
  const state = initialState();
  const cursor = { k: 0, target: BOAT_START };
  while (!state.end && state.tick < untilTick) {
    step(state, course, targetAt(inputs, state.tick, cursor));
  }
  return resultOf(state);
}

function resultOf(state: SimState): SimResult {
  return {
    score: metersOf(state.dist),
    bottles: state.bottles,
    endTick: state.end ? state.end.tick : state.tick,
    endReason: state.end ? state.end.reason : null,
    state,
  };
}

export type Verdict = { ok: true; score: number; bottles: number; endTick: number; endReason: EndReason | null } | { ok: false; reason: string };

/** Revisa la forma de la traza y la vuelve a jugar. */
export function check(attemptSeed: string, events: unknown, elapsedMs?: number): Verdict {
  const shape = parseTrace(events, FIELD_W, END_TICK);
  if (!shape.ok) return shape;
  const declared = shape.endTick;
  const sim = simulate(attemptSeed, shape.inputs, declared);
  // la partida terminó antes de lo que dice la traza: no es una partida posible
  if (sim.endTick !== declared) return { ok: false, reason: "el final no coincide con la partida" };
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(declared, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: sim.score, bottles: sim.bottles, endTick: sim.endTick, endReason: sim.endReason };
}

/** El punto de extensión del contrato: rearma la partida y compara los metros. */
export function validate(result: { score: number; events: unknown[] }, attemptSeed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(attemptSeed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// bots: para los tests, los E2E y la herramienta de desarrollo
// ---------------------------------------------------------------------------

export type Policy = (state: SimState, course: Course) => number;

/**
 * El camino seguro: el bote va al próximo punto de paso que todavía no
 * terminó de pasar (el hueco de la próxima fila, o una botella si la política
 * la quiere y no está agarrada). Solo usa los puntos de paso, que son
 * información visible: el hueco de una fila se ve desde que aparece.
 */
export function safePath(wantBottle: (bottleIndex: number, n: number) => boolean = () => false): Policy {
  let k = 0;
  let wps: Waypoint[] | null = null;
  const decided = new Map<number, boolean>();
  return (state, course) => {
    if (!wps) wps = waypoints(course);
    while (k < wps.length) {
      const w = wps[k]!;
      if (state.dist - w.d >= ((w.h + BOAT_HIT_H) / 2) * D_PER_UNIT) {
        k++;
        continue;
      }
      if (w.bottle !== null) {
        if (state.taken.includes(w.bottle)) {
          k++;
          continue;
        }
        let want = decided.get(w.bottle);
        if (want === undefined) {
          want = wantBottle(w.bottle, decided.size);
          decided.set(w.bottle, want);
        }
        if (!want) {
          k++;
          continue;
        }
      }
      return w.x;
    }
    return state.target;
  };
}

/** Juega con una política y devuelve la traza completa (con el cierre). */
export function playBot(
  attemptSeed: string,
  policy: Policy,
  opts: { untilTick?: number; course?: Course; mult?: number } = {},
): { events: TraceEvent[]; result: SimResult } {
  const course = opts.course ?? generateCourse(attemptSeed);
  const untilTick = opts.untilTick ?? END_TICK;
  const state = initialState(opts.mult);
  const inputs: InputEvent[] = [];
  while (!state.end && state.tick < untilTick) {
    const x = policy(state, course);
    if (x !== state.target) inputs.push({ tick: state.tick, x });
    step(state, course, x);
  }
  const result = resultOf(state);
  return { events: [...inputs, { tick: result.endTick, fin: true }], result };
}

/** el bot que esquiva todo y no toma whisky */
export function soberTrace(attemptSeed: string, untilTick = END_TICK) {
  return playBot(attemptSeed, safePath(), { untilTick });
}
/** el bot que esquiva todo y toma todas las botellas */
export function drunkTrace(attemptSeed: string, untilTick = END_TICK) {
  return playBot(attemptSeed, safePath(() => true), { untilTick });
}
