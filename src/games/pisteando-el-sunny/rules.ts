// "pisteando el sunny": la simulación pura, compartida por el navegador y el
// servidor. Un Nissan Sunny acelera solo por una ruta que flota en el vacío;
// se dobla manteniendo apretado un lado, y a velocidad derrapa: la trompa
// gira pero el auto sigue deslizando un rato para donde venía. Si el centro
// sale de la ruta más allá de medio auto, se cae. El puntaje son los metros
// avanzados por el eje de la ruta.
//
// Todo es entero: posiciones en subunidades (256 por unidad, 4 unidades por
// metro), rumbos de 0 a 1023 con la tabla de senos de trig.ts, y el reloj a
// 60 ticks. Sin seno ni coseno de `Math` acá. La ruta sale de la semilla como una
// sucesión de rectas y curvas, muestreada cada metro, y se comprueba que el
// conductor automático la completa: si no, se abren las curvas.

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
/** la vista: 120 × 200 unidades, el auto en el tercio de abajo */
export const FIELD_W = 120;
export const FIELD_H = 200;
export const CAR_W = 10;
export const CAR_L = 16;

/** ancho de la ruta: 5 anchos de auto al arrancar, 2,5 a los 3.000 m */
export const WIDTH_START = 5 * CAR_W;
export const WIDTH_END = 2.5 * CAR_W;
export const WIDTH_END_M = 3000;
/** el centro puede salir de la ruta hasta medio auto antes de caer */
export const FALL_MARGIN = CAR_W / 2;

/** velocidad en subunidades por tick: 60 km/h al arrancar, 140 a los 90 s */
export const V_MIN = 284;
export const V_MAX = 664;
export const V_RAMP_TICKS = 90 * TICKS_PER_S;
/** giro del rumbo por tick, en direcciones (5 = 1,76°) */
export const TURN = 4;
/** cuánto puede girar por tick la dirección de movimiento a velocidad máxima */
export const OMEGA_MIN = 3;
/** el rumbo no se separa de la dirección de movimiento más que esto (45°) */
export const MAX_SLIP = 128;
/** agarre (Q8): base, lo que pierde a velocidad máxima, lo que pierde con el calor del giro, piso */
export const GRIP_BASE = 110;
export const GRIP_SPEED = 90;
export const GRIP_HEAT = 40;
export const GRIP_MIN = 8;
/** el "calor" del giro sube mientras se dobla y baja al soltar (0 a 256) */
export const HEAT_UP = 4;
export const HEAT_DOWN = 8;
/** con más de esto de deslizamiento, hay marcas y humo (solo visual) */
export const SLIP_MARK = 12;

/** metros de ruta generados */
export const COURSE_M = 5000;
/** la ruta nunca gira más que esto respecto de la vertical (75°) */
export const ROAD_MAX_HEADING = 213;
/** metros recorribles en 120 s a velocidad máxima: 664 × 7200 / 1024 = 4.669 */
export const MAX_SCORE = 4700;

export type Steer = -1 | 0 | 1;
export type EndReason = "caida" | "tiempo";

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

// ---------------------------------------------------------------------------
// la ruta
// ---------------------------------------------------------------------------

export interface Course {
  /** centros de cada metro, en subunidades */
  xs: Int32Array;
  ys: Int32Array;
  /** rumbo de la ruta en cada metro */
  hs: Int16Array;
  /** medio ancho en cada metro, en subunidades */
  hws: Int32Array;
  n: number;
  /** cuántas veces hubo que abrir las curvas para que el conductor automático la complete */
  relax: number;
  /** dónde empieza cada curva (metro) y su radio, para los tests y la herramienta */
  curves: { at: number; radius: number; dir: Steer }[];
}

/** radio mínimo (metros) de las curvas a `m` metros: 50 al arrancar, 40 a los 3.000 (el auto a 140 km/h dobla en 35) */
export function minRadiusAt(m: number): number {
  const t = Math.min(1, Math.max(0, m) / WIDTH_END_M);
  return 50 - 10 * t;
}

/** el largo de las rectas y la probabilidad de eses, según la distancia */
function straightLenAt(m: number): number {
  const t = Math.min(1, Math.max(0, m) / WIDTH_END_M);
  return 70 - 50 * t;
}
function sProbAt(m: number): number {
  const t = Math.min(1, Math.max(0, m) / WIDTH_END_M);
  return 0.15 + 0.55 * t;
}

/** 1024 × 256 / (2π): direcciones (Q8) por metro para un radio de 1 m */
const CURV_Q8 = 41722;

function buildCourse(seed: string, relax: number): Course {
  const rng = rngFromSeed(seed);
  const open = 1 + 0.2 * relax;
  const xs: number[] = [0];
  const ys: number[] = [0];
  const hs: number[] = [0];
  const hws: number[] = [halfWidthAt(0)];
  const curves: Course["curves"] = [];
  let x = 0;
  let y = 0;
  let hq = 0; // rumbo de la ruta, Q8, con signo
  const cap = ROAD_MAX_HEADING * 256;
  const push = () => {
    const h = wrapAngle(hq >> 8);
    x += sinA(h) >> 2;
    y -= cosA(h) >> 2;
    xs.push(x);
    ys.push(y);
    hs.push(h);
    hws.push(halfWidthAt(xs.length - 1));
  };
  const straight = (len: number) => {
    for (let i = 0; i < len && xs.length <= COURSE_M; i++) push();
  };
  const curve = (dir: Steer, radius: number, arc: number) => {
    const dq = Math.max(1, Math.round(CURV_Q8 / radius));
    curves.push({ at: xs.length - 1, radius, dir });
    let turned = 0;
    while (turned < arc * 256 && xs.length <= COURSE_M) {
      const next = hq + dir * dq;
      if (next > cap || next < -cap) break;
      hq = next;
      turned += dq;
      push();
    }
  };

  straight(40);
  let lastDir: Steer = 0;
  let lastRadius = 0;
  while (xs.length <= COURSE_M) {
    const m = xs.length - 1;
    if (lastDir !== 0 && rng.next() < sProbAt(m)) {
      // una ese: recta corta y la curva contraria, parecida
      straight(rng.int(4, 10));
      const dir: Steer = lastDir === 1 ? -1 : 1;
      const radius = Math.max(minRadiusAt(m) * open, lastRadius * rng.range(0.85, 1.15));
      curve(dir, radius, rng.int(70, 200));
      lastDir = dir;
      lastRadius = radius;
      continue;
    }
    straight(Math.round(straightLenAt(m) * rng.range(0.6, 1.4)));
    const h = hq >> 8;
    // si la ruta viene torcida, la curva la endereza; si no, al azar
    const dir: Steer = h > 90 ? -1 : h < -90 ? 1 : rng.next() < 0.5 ? -1 : 1;
    const radius = minRadiusAt(m) * open * rng.range(1, 1.7);
    curve(dir, radius, rng.int(80, 240));
    lastDir = dir;
    lastRadius = radius;
  }
  return { xs: Int32Array.from(xs), ys: Int32Array.from(ys), hs: Int16Array.from(hs), hws: Int32Array.from(hws), n: xs.length, relax, curves };
}

const courseCache = new Map<string, Course>();

/** la ruta de la semilla, garantizada: el conductor automático la completa (si no, se abren las curvas) */
export function generateCourse(seed: string): Course {
  const cached = courseCache.get(seed);
  if (cached) return cached;
  let course = buildCourse(seed, 0);
  for (let relax = 1; relax <= 8; relax++) {
    const { result } = playBot(course, autoPolicy(), END_TICK);
    if (result.endReason !== "caida") break;
    course = buildCourse(seed, relax);
  }
  if (courseCache.size > 64) courseCache.clear();
  courseCache.set(seed, course);
  return course;
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
  /** el metro de la ruta más cercano, y el máximo alcanzado (el puntaje) */
  idx: number;
  meters: number;
  /** distancia lateral al eje, en subunidades, con signo (positivo a la derecha de la ruta) */
  offset: number;
  end: { tick: number; reason: EndReason } | null;
}

export function initialState(): SimState {
  return { tick: 0, x: 0, y: 0, prevX: 0, prevY: 0, h: 0, m: 0, prevH: 0, prevM: 0, mq: 0, heat: 0, v: V_MIN, steer: 0, idx: 0, meters: 0, offset: 0, end: null };
}

/** deslizamiento: cuánto se separa el rumbo de la dirección de movimiento (con signo) */
export function slipOf(state: SimState): number {
  return angleDiff(state.h, state.m);
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
  const omegaMax = TURN * 256 - (((TURN - OMEGA_MIN) * 256 * sf) >> 8); // Q8
  const slip = angleDiff(state.h, state.m);
  let dm = Math.sign(slip) * Math.min(omegaMax, Math.abs(slip) * grip);
  if (slip !== 0 && dm === 0) dm = Math.sign(slip);
  state.mq = (((state.mq + dm) % (ANGLES * 256)) + ANGLES * 256) % (ANGLES * 256);
  state.m = state.mq >> 8;

  // avanza hacia donde se desliza
  state.x += (state.v * sinA(state.m)) >> 12;
  state.y -= (state.v * cosA(state.m)) >> 12;

  // el metro más cercano del eje, la distancia lateral y la caída
  for (let k = 0; k < 8; k++) {
    const a = state.idx;
    if (a + 1 >= course.n) break;
    const vx = course.xs[a + 1]! - course.xs[a]!;
    const vy = course.ys[a + 1]! - course.ys[a]!;
    const px = state.x - course.xs[a]!;
    const py = state.y - course.ys[a]!;
    const tnum = px * vx + py * vy;
    const tden = vx * vx + vy * vy;
    if (tnum >= tden && a + 2 < course.n) {
      state.idx++;
      continue;
    }
    if (tnum < 0 && a > 0) {
      state.idx--;
      continue;
    }
    const cross = vx * py - vy * px;
    state.offset = Math.trunc(cross / 1024);
    const limit = course.hws[a]! + FALL_MARGIN * SUB;
    if (cross * cross > limit * limit * tden) state.end = { tick: t + 1, reason: "caida" };
    break;
  }
  if (state.idx > state.meters) state.meters = state.idx;

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
  if (r.endReason === "caida" && r.endTick !== endTick) return { ok: false, reason: "el fin no coincide con la caída" };
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

/** apunta la trompa a un punto del eje unos metros adelante (más lejos cuanto más rápido), con una zona muerta */
export function autoPolicy(): Policy {
  return (s, course) => {
    const ahead = Math.max(10, Math.min(34, Math.floor((s.v * 40) / M_SUB)));
    const j = Math.min(course.n - 1, s.idx + ahead);
    const tx = course.xs[j]! - s.x;
    const ty = course.ys[j]! - s.y;
    const len = Math.sqrt(tx * tx + ty * ty);
    if (len === 0) return 0;
    // la dirección deseada contra el rumbo previsto (el rumbo, corregido por lo que ya desliza)
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
