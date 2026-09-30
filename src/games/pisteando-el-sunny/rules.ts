// "pisteando el sunny": la simulación pura, compartida por el navegador y el
// servidor. Un Nissan Sunny acelera solo por una ruta en zigzag que flota en
// el vacío: tramos rectos unidos por esquinas en ángulo. Se dobla manteniendo
// apretado un lado, y a velocidad derrapa: la trompa gira pero el auto sigue
// deslizando un rato para donde venía. Si el centro sale de la ruta más allá
// de medio auto, se cae. El puntaje son los metros avanzados por el eje (la
// poligonal que une las esquinas).
//
// Todo es entero: posiciones en subunidades (256 por unidad, 4 unidades por
// metro), rumbos de 0 a 1023 con la tabla de senos de trig.ts, y el reloj a
// 60 ticks. Sin seno ni coseno de `Math` acá. La ruta sale de la semilla y se
// comprueba que el conductor automático la completa: si se cae en una
// esquina, esa esquina se achica y el tramo anterior se alarga.

import { rngFromSeed, type Rng } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";
import { ANGLES, angleDiff, cosA, sinA, TRIG_SCALE, wrapAngle } from "./trig";

export const TICKS_PER_S = 60;
export const DURATION_MS = 120_000;
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen entre el tick de fin y la duración real del intento (/finish) */
export const ELAPSED_SLACK_MS = 10_000;

/** subunidades por unidad de dibujo */
export const SUB = 256;
/** unidades por metro: el auto mide 16 unidades (4 m) de largo */
export const UNITS_PER_M = 4;
/** subunidades por metro */
export const M_SUB = UNITS_PER_M * SUB;
export const CAR_W = 10;
export const CAR_L = 16;

/** ancho de la ruta: 5 anchos de auto al arrancar, 2,5 a los 1.500 m */
export const WIDTH_START = 5 * CAR_W;
export const WIDTH_END = 2.5 * CAR_W;
export const WIDTH_END_M = 1500;
/** las esquinas cerradas (más de 80°) aparecen desde los 600 m: el ángulo base llega a su techo a los 1.200 */
export const CORNER_RAMP_M = 1200;
/** el centro puede salir de la ruta hasta medio auto antes de caer */
export const FALL_MARGIN = CAR_W / 2;

/** velocidad en subunidades por tick: 80 km/h al arrancar, 170 a los 60 s */
export const V_MIN = 379;
export const V_MAX = 806;
export const V_RAMP_TICKS = 60 * TICKS_PER_S;
/** giro del rumbo por tick, en direcciones (12 = 4,2°) */
export const TURN = 12;
/** cuánto puede girar por tick la dirección de movimiento a velocidad máxima */
export const OMEGA_MIN = 11;
/** el rumbo no se separa de la dirección de movimiento más que esto (45°) */
export const MAX_SLIP = 128;
/** agarre (Q8): base, lo que pierde a velocidad máxima, lo que pierde con el calor del giro, piso */
export const GRIP_BASE = 110;
export const GRIP_SPEED = 60;
export const GRIP_HEAT = 20;
export const GRIP_MIN = 16;
/** el "calor" del giro sube mientras se dobla y baja al soltar (0 a 256) */
export const HEAT_UP = 4;
export const HEAT_DOWN = 8;
/** con más de esto de deslizamiento, hay marcas y humo (solo visual) */
export const SLIP_MARK = 12;

/** metros de ruta generados (más que lo recorrible en 120 s) */
export const COURSE_M = 6000;
/** ningún tramo apunta a más de 70° de la vertical */
export const ROAD_MAX_HEADING = 199;
/** las esquinas: de 30° al principio a 110° a los 3.000 m (en direcciones: 85 a 313) */
export const CORNER_MIN = 85;
export const CORNER_MAX = 313;
/** metros recorribles en 120 s a velocidad máxima: 806 × 7200 / 1024 = 5.667 */
export const MAX_SCORE = 5700;
/** obstáculos: desde los 300 m, solo en tramos rectos */
export const OBSTACLE_FROM_M = 300;
/** reacción mínima para verlos al salir de una esquina: 600 ms */
export const OBSTACLE_REACTION_TICKS = 36;
/** el hueco libre para pasar: 1,6 anchos de auto (unidades) */
export const OBSTACLE_GAP = 16;
/** separación mínima entre obstáculos de un mismo tramo por el eje (metros) */
export const OBSTACLE_SPACING_M = 9;
/** el auto choca como un círculo de 4 unidades; las cajas de choque son más chicas que el dibujo */
export const CAR_HIT_R = 4;
export const OBSTACLE_KINDS = [
  { name: "cono", drawR: 2.4, hitR: 1.6 },
  { name: "barril", drawR: 3.2, hitR: 2.3 },
] as const;

export type Steer = -1 | 0 | 1;
export type EndReason = "caida" | "choque" | "tiempo";

// ---------------------------------------------------------------------------
// la velocidad y el ancho
// ---------------------------------------------------------------------------

export function speedAt(tick: number): number {
  const t = Math.min(tick, V_RAMP_TICKS);
  return V_MIN + Math.floor(((V_MAX - V_MIN) * t) / V_RAMP_TICKS);
}

/** km/h "de juego": subunidades por tick → metros por segundo → km/h */
export function kmh(v: number): number {
  return Math.round((v * TICKS_PER_S * 3.6) / M_SUB);
}

/** medio ancho de la ruta a `m` metros, en subunidades */
export function halfWidthAt(m: number): number {
  const s = Math.min(Math.max(0, m), WIDTH_END_M);
  const w = WIDTH_START * WIDTH_END_M - (WIDTH_START - WIDTH_END) * s;
  return Math.floor((w * SUB) / (2 * WIDTH_END_M));
}

/** cuánto puede girar por tick la dirección de movimiento a esa velocidad (Q8) */
export function omegaMaxAt(v: number): number {
  const sf = Math.floor(((v - V_MIN) * 256) / (V_MAX - V_MIN));
  return TURN * 256 - (((TURN - OMEGA_MIN) * 256 * sf) >> 8);
}

// ---------------------------------------------------------------------------
// la ruta: una poligonal de esquinas, con tramos rectos entre ellas
// ---------------------------------------------------------------------------

export interface Corner {
  /** metro del eje donde está la esquina */
  at: number;
  /** cuánto gira, en direcciones (85 = 30°, 313 = 110°) */
  angle: number;
  dir: Steer;
  /** cuántas veces se achicó para que el conductor automático la pase */
  relax: number;
}

export interface Obstacle {
  /** posición, en subunidades */
  x: number;
  y: number;
  /** tramo, metro del eje y desvío lateral (subunidades, positivo a la derecha) */
  leg: number;
  at: number;
  offset: number;
  /** 0 cono, 1 barril */
  kind: 0 | 1;
  /** radio de la caja de choque, en subunidades */
  hitR: number;
}

export interface Course {
  /** las esquinas (vértices de la poligonal), en subunidades; n tramos, n + 1 vértices */
  vx: Int32Array;
  vy: Int32Array;
  /** por tramo: rumbo y largo (subunidades) */
  hs: Int16Array;
  len: Int32Array;
  /** metros acumulados (subunidades) al empezar cada tramo; cum[n] es el total */
  cum: Int32Array;
  /** por vértice: medio ancho (subunidades) y las puntas de la losa (borde) y del límite de caída (borde + margen), izquierda y derecha */
  hws: Int32Array;
  lx: Int32Array;
  ly: Int32Array;
  rx: Int32Array;
  ry: Int32Array;
  mlx: Int32Array;
  mly: Int32Array;
  mrx: Int32Array;
  mry: Int32Array;
  n: number;
  corners: Corner[];
  /** los obstáculos y, por tramo, sus índices */
  obstacles: Obstacle[];
  obsByLeg: number[][];
  /** cuántas veces hubo que ajustar esquinas para que el conductor automático la complete */
  relax: number;
  /** cuántos obstáculos se sacaron para que el conductor automático la complete */
  removed: number;
}

/** largo de los tramos (metros) según la distancia: de 60 a 32 a los 1.500 m (y nunca menos de lo que pide el radio de giro) */
export function legLenAt(m: number): number {
  const t = Math.min(1, Math.max(0, m) / WIDTH_END_M);
  return 60 - 28 * t;
}

// a qué velocidad llega el auto a cada metro (si sigue el eje): la suma de speedAt tick a tick
let distByTick: Int32Array | null = null;
export function speedAtMeter(m: number): number {
  if (!distByTick) {
    distByTick = new Int32Array(END_TICK + 1);
    let d = 0;
    for (let t = 0; t <= END_TICK; t++) {
      distByTick[t] = d;
      d += speedAt(t);
    }
  }
  const target = m * M_SUB;
  let lo = 0;
  let hi = END_TICK;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (distByTick[mid]! < target) lo = mid + 1;
    else hi = mid;
  }
  return speedAt(lo);
}

/**
 * La esquina más cerrada que el auto puede tomar a `m` metros, a la velocidad
 * que trae: un arco tangente a los dos tramos con el radio de giro del auto
 * se mete hacia adentro R × (1/cos(θ/2) − 1) desde el vértice, y la punta
 * interior de la losa (con el margen) está a (hw + margen)/cos(θ/2). Con un
 * 50 % de resguardo: R × (1 − cos(θ/2)) ≤ 0,5 × (hw + margen).
 */
export function maxCornerAt(m: number): number {
  const R = turnRadiusAt(speedAtMeter(m));
  const room = Math.floor((0.5 * (halfWidthAt(m) + FALL_MARGIN * SUB) * TRIG_SCALE) / R); // Q12: 0,5 (hw + margen) / R
  if (room >= TRIG_SCALE) return CORNER_MAX;
  const cMin = TRIG_SCALE - room;
  let angle = CORNER_MAX;
  while (angle > 60 && cosA(Math.floor(angle / 2)) < cMin) angle -= 4;
  return angle;
}

/** el tramo que hace falta antes y después de una esquina de `angle` a esa velocidad: 2 × 1,6 × R × tan(θ/2) + 4 m */
export function legForCorner(m: number, angle: number): number {
  const R = turnRadiusAt(speedAtMeter(m));
  const half = Math.floor(angle / 2);
  return Math.ceil((3.2 * R * sinA(half)) / Math.max(1, cosA(half)) / M_SUB + 4);
}
/** ángulo base de las esquinas (direcciones) según la distancia: de 30° a 110° a los 1.200 m (más de 80° desde los 600) */
export function cornerAngleAt(m: number): number {
  const t = Math.min(1, Math.max(0, m) / CORNER_RAMP_M);
  return Math.round(CORNER_MIN + (CORNER_MAX - CORNER_MIN) * t);
}
/** probabilidad de que la próxima esquina vaya para el otro lado (zigzag encadenado) */
function chainProbAt(m: number): number {
  const t = Math.min(1, Math.max(0, m) / WIDTH_END_M);
  return 0.35 + 0.5 * t;
}
/** el tramo más corto posible a `m` metros: dos puntas de 55° (la esquina más cerrada) y 3 m */
function minLegAt(m: number): number {
  const hw = (halfWidthAt(m) + FALL_MARGIN * SUB) / M_SUB;
  return Math.ceil((2 * hw) / 0.57 + 3);
}

export function signedHeading(h: number): number {
  return h > ANGLES / 2 ? h - ANGLES : h;
}

/** metros después de una esquina hasta el primer obstáculo posible: 600 ms a la velocidad de ese punto, más 4 m */
export function obstacleClearanceAt(m: number): number {
  return Math.ceil((speedAtMeter(m) * OBSTACLE_REACTION_TICKS) / M_SUB) + 4;
}

/** separación por el eje entre obstáculos de un grupo: 9 m más 0,35 s a la velocidad de ese punto (para cruzar de lado) */
export function groupSpacingAt(m: number): number {
  return OBSTACLE_SPACING_M + Math.ceil((speedAtMeter(m) * 21) / M_SUB);
}

function buildCourse(seed: string, relaxOf: ReadonlyMap<number, number>, removed: ReadonlySet<string>): Course {
  const rng = rngFromSeed(seed);
  const vx: number[] = [0];
  const vy: number[] = [0];
  const hs: number[] = [];
  const len: number[] = [];
  const cum: number[] = [0];
  const corners: Corner[] = [];
  let h = 0; // rumbo con signo
  let x = 0;
  let y = 0;
  let total = 0; // subunidades
  const addLeg = (meters: number) => {
    const L = meters * M_SUB;
    const wh = wrapAngle(h);
    x += Math.floor((L * sinA(wh)) / TRIG_SCALE);
    y -= Math.floor((L * cosA(wh)) / TRIG_SCALE);
    vx.push(x);
    vy.push(y);
    hs.push(wh);
    len.push(L);
    total += L;
    cum.push(total);
  };

  addLeg(40);
  let lastDir: Steer = 0;
  while (total < COURSE_M * M_SUB) {
    const m = Math.floor(total / M_SUB);
    const r = relaxOf.get(corners.length) ?? 0;
    // los sorteos van siempre en el mismo orden, con o sin ajuste
    const jitter = rng.range(0.75, 1.25);
    const u = rng.next();
    const lenJitter = rng.range(0.7, 1.3);
    const longU = rng.next();
    let angle = Math.round(cornerAngleAt(m) * jitter * Math.max(0.3, 1 - 0.2 * r));
    angle = Math.max(60, Math.min(CORNER_MAX, maxCornerAt(m), angle));
    let dir: Steer = lastDir !== 0 && u < chainProbAt(m) ? (lastDir === 1 ? -1 : 1) : u < 0.5 ? -1 : 1;
    // el rumbo no pasa de ±70°: si no entra, la esquina va hacia el centro y, si sigue sin entrar, se achica
    if (Math.abs(h + dir * angle) > ROAD_MAX_HEADING) dir = h > 0 ? -1 : 1;
    let nh = h + dir * angle;
    if (Math.abs(nh) > ROAD_MAX_HEADING) {
      nh = Math.max(-ROAD_MAX_HEADING, Math.min(ROAD_MAX_HEADING, nh));
      angle = Math.abs(nh - h);
    }
    corners.push({ at: m, angle, dir, relax: r });
    h = nh;
    lastDir = dir;
    // el tramo que sigue: más largo si la próxima esquina pidió ajuste
    const rNext = relaxOf.get(corners.length) ?? 0;
    let L = Math.max(minLegAt(m), legForCorner(m, angle), Math.round(legLenAt(m) * lenJitter * (1 + 0.3 * rNext)));
    // desde los 700 m, cada tanto un tramo largo con lugar para un grupo de obstáculos (más seguido cuanto más lejos)
    const tl = Math.min(1, Math.max(0, (m - 700) / 1500));
    if (m >= 700 && longU < 0.3 + 0.35 * tl) L = Math.max(L, obstacleClearanceAt(m) + 2 * groupSpacingAt(m) + 14);
    addLeg(L);
  }

  // las puntas: por vértice, el punto del bisector a medio ancho (borde) y a medio ancho más el margen (límite de caída)
  const n = hs.length;
  const hws: number[] = [];
  const lx: number[] = [];
  const ly: number[] = [];
  const rx: number[] = [];
  const ry: number[] = [];
  const mlx: number[] = [];
  const mly: number[] = [];
  const mrx: number[] = [];
  const mry: number[] = [];
  for (let j = 0; j <= n; j++) {
    const ha = hs[Math.max(0, j - 1)]!;
    const hb = hs[Math.min(n - 1, j)]!;
    // normales a la derecha, Q12
    const nax = cosA(ha);
    const nay = sinA(ha);
    const nbx = cosA(hb);
    const nby = sinA(hb);
    const dot = nax * nbx + nay * nby; // Q24
    const hw = halfWidthAt(Math.floor(cum[j]! / M_SUB));
    hws.push(hw);
    const miter = (w: number) => ({
      x: Math.floor((w * (nax + nbx) * TRIG_SCALE) / (TRIG_SCALE * TRIG_SCALE + dot)),
      y: Math.floor((w * (nay + nby) * TRIG_SCALE) / (TRIG_SCALE * TRIG_SCALE + dot)),
    });
    const e = miter(hw);
    const b = miter(hw + FALL_MARGIN * SUB);
    lx.push(vx[j]! - e.x);
    ly.push(vy[j]! - e.y);
    rx.push(vx[j]! + e.x);
    ry.push(vy[j]! + e.y);
    mlx.push(vx[j]! - b.x);
    mly.push(vy[j]! - b.y);
    mrx.push(vx[j]! + b.x);
    mry.push(vy[j]! + b.y);
  }
  // los obstáculos: en tramos rectos desde los 300 m, lejos de las esquinas, siempre con un hueco de 1,6 autos
  const obstacles: Obstacle[] = [];
  const obsByLeg: number[][] = Array.from({ length: n }, () => []);
  let removedCount = 0;
  for (let i = 0; i < n; i++) {
    const startM = Math.floor(cum[i]! / M_SUB);
    const endM = Math.floor(cum[i + 1]! / M_SUB);
    // los sorteos van siempre en el mismo orden, con o sin obstáculos sacados
    const u = rng.next();
    const groupU = rng.next();
    const sideU = rng.next();
    const posU = rng.range(0, 1);
    const kindU = rng.next();
    if (endM < OBSTACLE_FROM_M) continue;
    const t = Math.min(1, Math.max(0, (startM - OBSTACLE_FROM_M) / 1500));
    if (u > 0.45 + 0.5 * t) continue;
    const from = Math.max(startM, OBSTACLE_FROM_M) + obstacleClearanceAt(startM);
    const to = endM - 8;
    if (to - from < 4) continue;
    const count = t < 0.25 ? 1 : groupU < 0.35 ? 1 : groupU < 0.8 ? 2 : 3;
    let side = sideU < 0.5 ? -1 : 1;
    let atM = from + Math.floor((to - from) * posU * 0.6);
    for (let k = 0; k < count; k++) {
      if (atM > to) break;
      const kind: 0 | 1 = ((kindU * 7 + k) % 1 < 0.6 ? 0 : 1) as 0 | 1;
      const spec = OBSTACLE_KINDS[kind];
      const hw = halfWidthAt(atM);
      // pegado a un lado (queda todo el otro lado libre) o, si la ruta es ancha, un poco más adentro
      const drawR = Math.round(spec.drawR * SUB);
      const room = hw - drawR;
      const inner = Math.max(0, Math.floor(((2 * hw - 2 * drawR - OBSTACLE_GAP * SUB) * 0.5)));
      const offset = side * (room - Math.min(inner, Math.floor(room * 0.5)));
      const rel = atM * M_SUB - cum[i]!;
      const h = hs[i]!;
      const ax = vx[i]! + Math.floor((rel * sinA(h)) / TRIG_SCALE);
      const ay = vy[i]! - Math.floor((rel * cosA(h)) / TRIG_SCALE);
      const ox = ax + Math.floor((offset * cosA(h)) / TRIG_SCALE);
      const oy = ay + Math.floor((offset * sinA(h)) / TRIG_SCALE);
      const key = `${i}:${atM}`;
      if (removed.has(key)) removedCount++;
      else {
        obsByLeg[i]!.push(obstacles.length);
        obstacles.push({ x: ox, y: oy, leg: i, at: atM, offset, kind, hitR: Math.round(spec.hitR * SUB) });
      }
      // el próximo del grupo, del otro lado, con lugar para cruzar
      side = -side;
      atM += groupSpacingAt(atM);
    }
  }
  let relaxTotal = 0;
  for (const v of relaxOf.values()) relaxTotal += v;
  return {
    vx: Int32Array.from(vx),
    vy: Int32Array.from(vy),
    hs: Int16Array.from(hs),
    len: Int32Array.from(len),
    cum: Int32Array.from(cum),
    hws: Int32Array.from(hws),
    lx: Int32Array.from(lx),
    ly: Int32Array.from(ly),
    rx: Int32Array.from(rx),
    ry: Int32Array.from(ry),
    mlx: Int32Array.from(mlx),
    mly: Int32Array.from(mly),
    mrx: Int32Array.from(mrx),
    mry: Int32Array.from(mry),
    n,
    corners,
    obstacles,
    obsByLeg,
    relax: relaxTotal,
    removed: removedCount,
  };
}

const courseCache = new Map<string, Course>();

/**
 * La ruta de la semilla, garantizada: el conductor automático la completa. Si
 * se cae, la esquina donde se cayó se achica un 20 % y el tramo anterior se
 * alarga un 30 %; si choca, ese obstáculo se saca; y se vuelve a generar
 * (hasta 200 veces). Además, cada
 * esquina nace acotada por lo que el auto puede doblar a la velocidad que
 * trae a esa altura (maxCornerAt) y con tramos que dan lugar (legForCorner).
 */
export function generateCourse(seed: string): Course {
  const cached = courseCache.get(seed);
  if (cached) return cached;
  const relaxOf = new Map<number, number>();
  const removed = new Set<string>();
  let course = buildCourse(seed, relaxOf, removed);
  for (let i = 0; i < 200; i++) {
    const { result } = playBot(course, autoPolicy(), END_TICK);
    if (result.endReason === "choque") {
      // se saca el obstáculo que chocó
      const o = course.obstacles[result.state.hit]!;
      removed.add(`${o.leg}:${o.at}`);
      course = buildCourse(seed, relaxOf, removed);
      continue;
    }
    if (result.endReason !== "caida") break;
    // la esquina que viene después del tramo donde se cayó (o la anterior, si se cayó apenas pasada)
    const idx = result.state.idx;
    const rel = result.state.progress - course.cum[idx]!;
    const corner = rel < course.len[idx]! / 2 ? idx - 1 : idx;
    const k = Math.max(0, Math.min(course.corners.length - 1, corner));
    relaxOf.set(k, (relaxOf.get(k) ?? 0) + 1);
    course = buildCourse(seed, relaxOf, removed);
  }
  if (courseCache.size > 64) courseCache.clear();
  courseCache.set(seed, course);
  return course;
}

/** ¿el punto está dentro del cuadrilátero (convexo) del tramo i, con el límite de caída? */
export function insideLeg(course: Course, i: number, px: number, py: number): boolean {
  if (i < 0 || i >= course.n) return false;
  const qx = [course.mlx[i]!, course.mrx[i]!, course.mrx[i + 1]!, course.mlx[i + 1]!];
  const qy = [course.mly[i]!, course.mry[i]!, course.mry[i + 1]!, course.mly[i + 1]!];
  let pos = false;
  let neg = false;
  for (let k = 0; k < 4; k++) {
    const ax = qx[k]!;
    const ay = qy[k]!;
    const bx = qx[(k + 1) % 4]!;
    const by = qy[(k + 1) % 4]!;
    const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (c > 0) pos = true;
    else if (c < 0) neg = true;
  }
  return !(pos && neg);
}

/** ¿el punto está sobre la ruta (con el margen de caída)? mira el tramo y sus vecinos */
export function onRoad(course: Course, i: number, px: number, py: number): boolean {
  return insideLeg(course, i, px, py) || insideLeg(course, i - 1, px, py) || insideLeg(course, i + 1, px, py);
}

/** el punto del eje a `dist` subunidades desde el arranque */
export function axisPoint(course: Course, dist: number): { x: number; y: number; leg: number } {
  let i = 0;
  while (i + 1 < course.n && course.cum[i + 1]! <= dist) i++;
  const rel = Math.max(0, Math.min(course.len[i]!, dist - course.cum[i]!));
  const h = course.hs[i]!;
  return { x: course.vx[i]! + Math.floor((rel * sinA(h)) / TRIG_SCALE), y: course.vy[i]! - Math.floor((rel * cosA(h)) / TRIG_SCALE), leg: i };
}

// ---------------------------------------------------------------------------
// la simulación
// ---------------------------------------------------------------------------

export interface SimState {
  tick: number;
  /** posición, en subunidades */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** rumbo (la trompa) y dirección de movimiento, 0 a 1023 */
  h: number;
  m: number;
  prevH: number;
  prevM: number;
  /** la dirección de movimiento con fracción (Q8) */
  mq: number;
  heat: number;
  v: number;
  steer: Steer;
  /** el tramo de la ruta más cercano, el avance por el eje (subunidades) y el máximo alcanzado en metros (el puntaje) */
  idx: number;
  progress: number;
  meters: number;
  /** distancia lateral al eje del tramo, en subunidades, con signo (positivo a la derecha) */
  offset: number;
  /** el índice del obstáculo chocado, o -1 */
  hit: number;
  end: { tick: number; reason: EndReason } | null;
}

export function initialState(): SimState {
  return { tick: 0, x: 0, y: 0, prevX: 0, prevY: 0, h: 0, m: 0, prevH: 0, prevM: 0, mq: 0, heat: 0, v: V_MIN, steer: 0, idx: 0, progress: 0, meters: 0, offset: 0, hit: -1, end: null };
}

/** ¿el auto (un círculo de CAR_HIT_R) toca la caja de choque del obstáculo? */
export function hitsObstacle(o: Obstacle, px: number, py: number): boolean {
  const r = o.hitR + CAR_HIT_R * SUB;
  const dx = px - o.x;
  const dy = py - o.y;
  return dx * dx + dy * dy < r * r;
}

/** deslizamiento: cuánto se separa el rumbo de la dirección de movimiento (con signo) */
export function slipOf(state: SimState): number {
  return angleDiff(state.h, state.m);
}

/** proyecta el punto sobre el tramo i: distancia al cuadrado al segmento, avance por el eje y distancia lateral */
export function project(course: Course, i: number, px: number, py: number): { d2: number; progress: number; offset: number } {
  const ax = course.vx[i]!;
  const ay = course.vy[i]!;
  const vx = course.vx[i + 1]! - ax;
  const vy = course.vy[i + 1]! - ay;
  const dx = px - ax;
  const dy = py - ay;
  const tden = vx * vx + vy * vy;
  const tnum = Math.max(0, Math.min(tden, dx * vx + dy * vy));
  const qx = ax + Math.floor((vx * tnum) / tden);
  const qy = ay + Math.floor((vy * tnum) / tden);
  const d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
  const progress = course.cum[i]! + Math.floor((course.len[i]! * tnum) / tden);
  const offset = Math.trunc((vx * dy - vy * dx) / course.len[i]!);
  return { d2, progress, offset };
}

/** un tick de la simulación con el control `steer` (-1 izquierda, 0 nada, 1 derecha) */
export function step(state: SimState, course: Course, steer: Steer): void {
  if (state.end) return;
  const t = state.tick;
  state.prevX = state.x;
  state.prevY = state.y;
  state.prevH = state.h;
  state.prevM = state.m;
  state.steer = steer;
  state.v = speedAt(t);

  // la trompa gira a velocidad fija, sin separarse de la dirección de movimiento más de MAX_SLIP
  if (steer !== 0) {
    let h = wrapAngle(state.h + steer * TURN);
    const slip = angleDiff(h, state.m);
    if (slip > MAX_SLIP) h = wrapAngle(state.m + MAX_SLIP);
    else if (slip < -MAX_SLIP) h = wrapAngle(state.m - MAX_SLIP);
    state.h = h;
  }
  state.heat = Math.max(0, Math.min(256, state.heat + (steer !== 0 ? HEAT_UP : -HEAT_DOWN)));

  // el agarre baja con la velocidad y con el calor del giro; la dirección de movimiento sigue al rumbo
  const sf = Math.floor(((state.v - V_MIN) * 256) / (V_MAX - V_MIN)); // Q8, 0 a 256
  const grip = Math.max(GRIP_MIN, GRIP_BASE - ((GRIP_SPEED * sf) >> 8) - ((GRIP_HEAT * state.heat) >> 8));
  const omegaMax = omegaMaxAt(state.v); // Q8
  const slip = angleDiff(state.h, state.m);
  let dm = Math.sign(slip) * Math.min(omegaMax, Math.abs(slip) * grip);
  if (slip !== 0 && dm === 0) dm = Math.sign(slip);
  state.mq = (((state.mq + dm) % (ANGLES * 256)) + ANGLES * 256) % (ANGLES * 256);
  state.m = state.mq >> 8;

  // avanza hacia donde se desliza
  state.x += (state.v * sinA(state.m)) >> 12;
  state.y -= (state.v * cosA(state.m)) >> 12;

  // el tramo más cercano (entre el actual y sus vecinos), el avance por el eje y la caída
  let best = project(course, state.idx, state.x, state.y);
  let bestI = state.idx;
  for (const i of [state.idx + 1, state.idx - 1]) {
    if (i < 0 || i >= course.n) continue;
    const p = project(course, i, state.x, state.y);
    if (p.d2 < best.d2 || (p.d2 === best.d2 && i > bestI)) {
      best = p;
      bestI = i;
    }
  }
  state.idx = bestI;
  state.progress = best.progress;
  state.offset = best.offset;
  const meters = Math.floor(best.progress / M_SUB);
  if (meters > state.meters) state.meters = meters;
  if (!onRoad(course, bestI, state.x, state.y)) state.end = { tick: t + 1, reason: "caida" };
  else {
    // los obstáculos del tramo y sus vecinos
    for (const i of [bestI, bestI + 1, bestI - 1]) {
      const list = i >= 0 && i < course.n ? course.obsByLeg[i]! : [];
      for (const k of list) {
        if (hitsObstacle(course.obstacles[k]!, state.x, state.y)) {
          state.hit = k;
          state.end = { tick: t + 1, reason: "choque" };
          break;
        }
      }
      if (state.end) break;
    }
  }

  state.tick = t + 1;
  if (!state.end && state.tick >= END_TICK) state.end = { tick: END_TICK, reason: "tiempo" };
}

// ---------------------------------------------------------------------------
// la traza y la validación
// ---------------------------------------------------------------------------

/** desde el tick `tick`, el control es `steer` */
export type SteerEvent = { tick: number; steer: Steer };
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = SteerEvent | EndEvent;

export interface SimResult {
  score: number;
  endTick: number;
  endReason: EndReason | null;
  state: SimState;
}

export function isSteer(s: unknown): s is Steer {
  return s === -1 || s === 0 || s === 1;
}

/** el control vigente en `tick` según la traza (avanza el cursor) */
export function steerAt(inputs: readonly SteerEvent[], tick: number, cursor: { k: number; steer: Steer }): Steer {
  while (cursor.k < inputs.length && inputs[cursor.k]!.tick <= tick) cursor.steer = inputs[cursor.k++]!.steer;
  return cursor.steer;
}

/** vuelve a jugar la partida con la traza hasta `untilTick` (o hasta que se caiga) */
export function simulate(attemptSeed: string, inputs: readonly SteerEvent[], untilTick = END_TICK): SimResult {
  const course = generateCourse(attemptSeed);
  const s = initialState();
  const cursor = { k: 0, steer: 0 as Steer };
  while (!s.end && s.tick < untilTick) step(s, course, steerAt(inputs, s.tick, cursor));
  return { score: s.meters, endTick: s.end ? s.end.tick : s.tick, endReason: s.end?.reason ?? null, state: s };
}

export type Verdict = { ok: true; score: number; endTick: number; endReason: EndReason | null } | { ok: false; reason: string };

/** revisa la forma de la traza y vuelve a correr la partida */
export function check(attemptSeed: string, events: unknown, elapsedMs?: number): Verdict {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > END_TICK + 1) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const inputs: SteerEvent[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.tick) || "fin" in e) return { ok: false, reason: "entrada mal armada" };
    if (!isSteer(e.steer)) return { ok: false, reason: "control inválido" };
    const tick = e.tick as number;
    if (tick <= prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= endTick) return { ok: false, reason: "entrada después del final" };
    prev = tick;
    inputs.push({ tick, steer: e.steer });
  }
  const r = simulate(attemptSeed, inputs, endTick);
  if ((r.endReason === "caida" || r.endReason === "choque") && r.endTick !== endTick) return { ok: false, reason: "el fin no coincide con la caída" };
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(endTick, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: r.score, endTick, endReason: r.endReason };
}

export function validate(result: { score: number; events: unknown[] }, attemptSeed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(attemptSeed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// el conductor automático: sigue el eje con el mismo control de tres estados
// ---------------------------------------------------------------------------

export type Policy = (state: SimState, course: Course) => Steer;

/** radio de giro del auto a esa velocidad, en subunidades: v / ω */
export function turnRadiusAt(v: number): number {
  const omega = omegaMaxAt(v) / 256; // direcciones por tick
  // rad por tick = omega × 2π / 1024; radio = v / rad
  return Math.floor((v * ANGLES) / (omega * 2 * 3.14159265));
}

/**
 * Sigue el eje con el control de tres estados: por el tramo, apunta la trompa
 * a un punto unos metros adelante (más lejos cuanto más rápido). Cerca de la
 * esquina, desde el punto de entrada de un arco tangente a los dos tramos con
 * el radio de giro del auto (R × tan(θ/2), con un margen por la reacción y el
 * derrape), dobla a fondo hacia el lado de la esquina hasta que el rumbo queda
 * alineado con el tramo siguiente, y ahí vuelve a seguir el eje. Zona muerta
 * de 6 direcciones y el rumbo corregido por la mitad de lo que ya desliza.
 */
/**
 * El desvío lateral (subunidades) que conviene en el tramo i a la altura
 * `progress`: el medio del hueco libre más grande alrededor del primer
 * obstáculo que viene (en 1 s a esa velocidad, más 10 m); sin obstáculos, 0.
 */
export function laneOffsetFor(course: Course, i: number, progress: number, v: number): number {
  if (i < 0 || i >= course.n) return 0;
  const look = v * 60 + 10 * M_SUB;
  let next: Obstacle | null = null;
  for (const k of course.obsByLeg[i]!) {
    const o = course.obstacles[k]!;
    const at = o.at * M_SUB;
    if (at + 2 * M_SUB < progress || at > progress + look) continue;
    if (!next || at < next.at * M_SUB) next = o;
  }
  if (!next) return 0;
  const hw = course.hws[i]! - (FALL_MARGIN * SUB) / 2;
  const block = next.hitR + CAR_HIT_R * SUB + 2 * SUB;
  const leftGap = next.offset - block + hw;
  const rightGap = hw - (next.offset + block);
  return leftGap >= rightGap ? Math.floor((-hw + (next.offset - block)) / 2) : Math.floor((next.offset + block + hw) / 2);
}

export function autoPolicy(): Policy {
  return (s, course) => {
    const ahead = Math.max(10, Math.min(30, Math.floor((s.v * 36) / M_SUB))) * M_SUB;
    const i = s.idx;
    let target: { x: number; y: number };
    const lane = laneOffsetFor(course, i, s.progress, s.v);
    const withLane = (p: { x: number; y: number; leg: number }) => {
      if (lane === 0) return p;
      const h = course.hs[p.leg]!;
      return { x: p.x + Math.floor((lane * cosA(h)) / TRIG_SCALE), y: p.y + Math.floor((lane * sinA(h)) / TRIG_SCALE), leg: p.leg };
    };
    const corner = course.corners[i];
    if (corner && i + 1 < course.n) {
      const vertexAt = course.cum[i + 1]!;
      const distToVertex = vertexAt - s.progress;
      const R = turnRadiusAt(s.v);
      const half = Math.floor(corner.angle / 2);
      // el punto de entrada del arco, con un margen del 25 % y tres ticks de reacción
      const lead = Math.floor((R * sinA(half) * 5) / (4 * Math.max(1, cosA(half)))) + s.v * 3;
      if (distToVertex <= lead) {
        const d = angleDiff(course.hs[i + 1]!, s.h);
        if (Math.abs(d) > 8) return d > 0 ? 1 : -1;
        target = axisPoint(course, vertexAt + ahead);
      } else {
        target = withLane(axisPoint(course, Math.min(vertexAt, s.progress + ahead)));
      }
    } else {
      target = withLane(axisPoint(course, s.progress + ahead));
    }
    const tx = target.x - s.x;
    const ty = target.y - s.y;
    const len = Math.sqrt(tx * tx + ty * ty);
    if (len === 0) return 0;
    const basis = wrapAngle(s.h + (angleDiff(s.h, s.m) >> 1));
    const cross = sinA(basis) * ty + cosA(basis) * tx;
    const dead = len * sinA(6);
    if (cross > dead) return 1;
    if (cross < -dead) return -1;
    return 0;
  };
}

/** juega con una política y devuelve la traza (los cambios de control) y el resultado */
export function playBot(course: Course, policy: Policy, untilTick = END_TICK, from?: SimState): { events: TraceEvent[]; result: SimResult } {
  const s = from ?? initialState();
  const inputs: SteerEvent[] = [];
  let current: Steer = s.steer;
  while (!s.end && s.tick < untilTick) {
    const steer = policy(s, course);
    if (steer !== current) {
      inputs.push({ tick: s.tick, steer });
      current = steer;
    }
    step(s, course, steer);
  }
  const endTick = s.end ? s.end.tick : s.tick;
  return { events: [...inputs, { tick: endTick, fin: true }], result: { score: s.meters, endTick, endReason: s.end?.reason ?? null, state: s } };
}

/** la traza del conductor automático para la semilla (tests, E2E y la herramienta) */
export function autoTrace(attemptSeed: string, untilTick = END_TICK): { events: TraceEvent[]; result: SimResult } {
  return playBot(generateCourse(attemptSeed), autoPolicy(), untilTick);
}

export { ANGLES, angleDiff, cosA, sinA, TRIG_SCALE, wrapAngle };
export type { Rng };
