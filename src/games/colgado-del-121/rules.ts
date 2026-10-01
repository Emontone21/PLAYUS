// "colgado del 121": la simulación pura, compartida por el navegador y el
// servidor. Un pasajero parado en el pasillo de un ómnibus que se inclina sin
// avisar; hay que mantenerlo en el medio empujando con el dedo, sobre una
// base que se achica. El puntaje es el tiempo que aguantó parado.
//
// Todo es entero: posiciones y velocidades en subunidades (256 por unidad),
// la inclinación en milésimas (-1000 a 1000), 60 ticks por segundo, y sin
// seno ni coseno de `Math`. La inclinación de cada tick sale de la semilla:
// puntos clave al azar unidos con una curva suave en enteros, con un límite
// de cambio por tick; con el tiempo suben la amplitud y la frecuencia. Y se
// comprueba que un jugador automático con 250 ms de demora aguanta 30 s: si
// no, se limita la velocidad de cambio en ese tramo.

import { rngFromSeed } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const TICKS_PER_S = 60;
export const DURATION_MS = 120_000;
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen entre el tick de fin y la duración real del intento (/finish) */
export const ELAPSED_SLACK_MS = 10_000;
/** un tick, en ms: la tolerancia del puntaje */
export const TICK_MS = 1000 / TICKS_PER_S;

/** subunidades por unidad de dibujo */
export const SUB = 256;
/** la vista: 120 × 150 unidades */
export const FIELD_W = 120;
export const FIELD_H = 150;
/** la base: 40 unidades de cada lado del centro al arrancar, 12 a los 90 s */
export const BASE_START = 40;
export const BASE_END = 12;
export const BASE_END_TICK = 90 * TICKS_PER_S;
/** cerca del borde: a menos de este tanto del ancho de la base (Q8: 0,7) */
export const NEAR_EDGE_Q8 = 180;

/** la inclinación va de -1000 a 1000 (1000 ≈ 12° en el dibujo) */
export const TILT_MAX = 1000;
/** amplitud de los puntos clave: de 380 al arrancar a 1000 a los 90 s */
export const AMP_START = 520;
export const AMP_END = 1000;
/** intervalo entre puntos clave (ticks): de 100 a 36 a los 90 s, ±40 % */
export const INTERVAL_START = 100;
export const INTERVAL_END = 36;
/** límite de cambio de la inclinación por tick: de 14 a 34 a los 90 s */
export const RATE_START = 14;
export const RATE_END = 34;
export const RAMP_TICK = 90 * TICKS_PER_S;

/** la física del pasajero (subunidades por tick²): el empuje de la inclinación a 1000, la inestabilidad (x / 2048 por tick²), el dedo y el rozamiento (Q8 por tick) */
export const K_TILT = 18;
export const K_UNSTABLE = 1;
export const K_PUSH = 34;
export const K_FRICTION = 18;

/** el jugador automático de la garantía: 250 ms de demora */
export const FAIR_DELAY_TICKS = 15;
export const FAIR_SURVIVE_TICKS = 30 * TICKS_PER_S;

export type Push = -1 | 0 | 1;
export type EndReason = "caida" | "tiempo";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function progress(tick: number): number {
  return Math.min(1, Math.max(0, tick / RAMP_TICK));
}

/** medio ancho de la base en ese tick, en subunidades */
export function baseHalfAt(tick: number): number {
  const t = Math.min(tick, BASE_END_TICK);
  return BASE_START * SUB - Math.floor(((BASE_START - BASE_END) * SUB * t) / BASE_END_TICK);
}
export function amplitudeAt(tick: number): number {
  return Math.round(lerp(AMP_START, AMP_END, progress(tick)));
}
export function intervalAt(tick: number): number {
  return Math.round(lerp(INTERVAL_START, INTERVAL_END, progress(tick)));
}
export function rateAt(tick: number): number {
  return Math.round(lerp(RATE_START, RATE_END, progress(tick)));
}

// ---------------------------------------------------------------------------
// la inclinación
// ---------------------------------------------------------------------------

export interface Segment {
  from: number;
  to: number;
  a: number;
  b: number;
  /** cuántas veces se frenó este tramo para que el jugador automático aguante */
  relax: number;
}

export interface Course {
  /** la inclinación de cada tick, de -1000 a 1000 */
  tilts: Int16Array;
  segments: Segment[];
  /** cuántos frenos hubo que poner */
  relax: number;
}

/** 3u² − 2u³ en Q10: la curva suave entre dos puntos clave */
export function smoothQ10(u: number): number {
  const uu = Math.max(0, Math.min(1024, u));
  return Math.floor((uu * uu * (3 * 1024 - 2 * uu)) / (1024 * 1024));
}

function buildTilts(seed: string, relaxOf: ReadonlyMap<number, number>): Course {
  const rng = rngFromSeed(`121:${seed}`);
  const tilts = new Int16Array(END_TICK + 1);
  const segments: Segment[] = [];
  let t0 = 0;
  let a = 0;
  let k = 0;
  let prev = 0;
  let relaxTotal = 0;
  while (t0 < END_TICK) {
    // los sorteos van siempre en el mismo orden, con o sin freno
    const jitter = rng.range(0.6, 1.4);
    let sign = rng.next() < 0.5 ? -1 : 1;
    let mag = rng.range(0.35, 1);
    // los dos primeros tramos van fuertes y para el mismo lado: sin jugar, nadie aguanta
    if (k === 0) mag = Math.max(mag, 0.7);
    if (k === 1) {
      sign = segments[0]!.b >= 0 ? 1 : -1;
      mag = Math.max(mag, 0.6);
    }
    const r = relaxOf.get(k) ?? 0;
    relaxTotal += r;
    const interval = Math.max(12, Math.round(intervalAt(t0) * jitter * (1 + 0.25 * r)));
    const b = Math.round(amplitudeAt(t0) * mag * sign * Math.pow(0.8, r));
    const rate = Math.max(3, Math.round(rateAt(t0) * Math.pow(0.7, r)));
    const to = Math.min(END_TICK, t0 + interval);
    segments.push({ from: t0, to, a, b, relax: r });
    for (let t = t0; t <= to; t++) {
      const u = Math.floor(((t - t0) * 1024) / interval);
      let v = a + Math.floor(((b - a) * smoothQ10(u)) / 1024);
      // nunca más que el límite por tick
      if (v > prev + rate) v = prev + rate;
      else if (v < prev - rate) v = prev - rate;
      v = Math.max(-TILT_MAX, Math.min(TILT_MAX, v));
      tilts[t] = v;
      prev = v;
    }
    a = prev;
    t0 = to;
    k++;
  }
  return { tilts, segments, relax: relaxTotal };
}

export function segmentAt(course: Course, tick: number): number {
  let lo = 0;
  let hi = course.segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (course.segments[mid]!.to < tick) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const courseCache = new Map<string, Course>();

/**
 * La inclinación de la semilla, garantizada: el jugador automático con 250
 * ms de demora aguanta 30 s. Si se cae antes, se frena el tramo donde se
 * cayó y el anterior (menos amplitud, menos velocidad de cambio, un poco
 * más largos) y se vuelve a generar, hasta 40 veces.
 */
export function generateCourse(seed: string): Course {
  const cached = courseCache.get(seed);
  if (cached) return cached;
  const relaxOf = new Map<number, number>();
  let course = buildTilts(seed, relaxOf);
  for (let i = 0; i < 40; i++) {
    const { result } = playBot(course, delayedPolicy(FAIR_DELAY_TICKS), FAIR_SURVIVE_TICKS);
    if (result.endReason !== "caida") break;
    const k = segmentAt(course, result.endTick);
    relaxOf.set(k, (relaxOf.get(k) ?? 0) + 1);
    if (k > 0) relaxOf.set(k - 1, (relaxOf.get(k - 1) ?? 0) + 1);
    course = buildTilts(seed, relaxOf);
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
  /** posición y velocidad del pasajero, en subunidades */
  x: number;
  v: number;
  prevX: number;
  push: Push;
  end: { tick: number; reason: EndReason } | null;
}

export function initialState(): SimState {
  return { tick: 0, x: 0, v: 0, prevX: 0, push: 0, end: null };
}

export function tiltAt(course: Course, tick: number): number {
  return course.tilts[Math.min(END_TICK, Math.max(0, tick))]!;
}

/** un tick con el empuje `push` (-1 izquierda, 0 nada, 1 derecha) */
export function step(state: SimState, course: Course, push: Push): void {
  if (state.end) return;
  const t = state.tick;
  state.prevX = state.x;
  state.push = push;
  const tilt = tiltAt(course, t);
  // la inclinación lo empuja, lejos del centro se va más (péndulo invertido), el dedo empuja y el rozamiento frena
  const a = Math.trunc((tilt * K_TILT) / TILT_MAX) + Math.trunc((state.x * K_UNSTABLE) / 2048) + push * K_PUSH - Math.trunc((state.v * K_FRICTION) / 256);
  state.v += a;
  state.x += state.v;
  if (Math.abs(state.x) > baseHalfAt(t)) state.end = { tick: t + 1, reason: "caida" };
  state.tick = t + 1;
  if (!state.end && state.tick >= END_TICK) state.end = { tick: END_TICK, reason: "tiempo" };
}

/** milisegundos aguantados hasta ese tick */
export function msAt(tick: number): number {
  return Math.floor((tick * 1000) / TICKS_PER_S);
}

/** ¿está cerca del borde? (a más del 70 % del medio ancho) */
export function nearEdge(state: SimState): boolean {
  return Math.abs(state.x) * 256 > baseHalfAt(state.tick) * NEAR_EDGE_Q8;
}

// ---------------------------------------------------------------------------
// la traza y la validación
// ---------------------------------------------------------------------------

export type PushEvent = { tick: number; push: Push };
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = PushEvent | EndEvent;

export interface SimResult {
  score: number;
  endTick: number;
  endReason: EndReason | null;
  state: SimState;
}

export function isPush(p: unknown): p is Push {
  return p === -1 || p === 0 || p === 1;
}

export function pushAt(inputs: readonly PushEvent[], tick: number, cursor: { k: number; push: Push }): Push {
  while (cursor.k < inputs.length && inputs[cursor.k]!.tick <= tick) cursor.push = inputs[cursor.k++]!.push;
  return cursor.push;
}

export function simulate(attemptSeed: string, inputs: readonly PushEvent[], untilTick = END_TICK): SimResult {
  const course = generateCourse(attemptSeed);
  const s = initialState();
  const cursor = { k: 0, push: 0 as Push };
  while (!s.end && s.tick < untilTick) step(s, course, pushAt(inputs, s.tick, cursor));
  const endTick = s.end ? s.end.tick : s.tick;
  return { score: msAt(endTick), endTick, endReason: s.end?.reason ?? null, state: s };
}

export type Verdict = { ok: true; score: number; endTick: number; endReason: EndReason | null } | { ok: false; reason: string };

export function check(attemptSeed: string, events: unknown, elapsedMs?: number): Verdict {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > END_TICK + 1) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const inputs: PushEvent[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.tick) || "fin" in e) return { ok: false, reason: "entrada mal armada" };
    if (!isPush(e.push)) return { ok: false, reason: "empuje inválido" };
    const tick = e.tick as number;
    if (tick <= prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= endTick) return { ok: false, reason: "entrada después del final" };
    prev = tick;
    inputs.push({ tick, push: e.push });
  }
  const r = simulate(attemptSeed, inputs, endTick);
  if (r.endReason === "caida" && r.endTick !== endTick) return { ok: false, reason: "el fin no coincide con la caída" };
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(endTick, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: r.score, endTick, endReason: r.endReason };
}

/** el puntaje son los ms recalculados, con la tolerancia de un tick */
export function validate(result: { score: number; events: unknown[] }, attemptSeed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(attemptSeed, result.events, meta?.elapsedMs);
  return v.ok && Math.abs(v.score - result.score) <= TICK_MS;
}

/** "34,7 s" */
export function formatMs(ms: number): string {
  return `${(Math.floor(ms / 100) / 10).toFixed(1).replace(".", ",")} s`;
}

// ---------------------------------------------------------------------------
// jugadores automáticos
// ---------------------------------------------------------------------------

export type Policy = (state: SimState, course: Course) => Push;

/**
 * Ve la inclinación y la posición con `delayTicks` de retraso y aprieta hacia
 * el centro: estima dónde va a estar el pasajero (posición más velocidad por
 * la demora, más lo que la inclinación lo va a empujar) y empuja al revés,
 * con una zona muerta de 2 unidades.
 */
export function delayedPolicy(delayTicks: number, deadUnits = 2): Policy {
  const hist: { x: number; v: number; tick: number }[] = [];
  return (s, course) => {
    hist.push({ x: s.x, v: s.v, tick: s.tick });
    if (hist.length > delayTicks + 1) hist.shift();
    const seen = hist[0]!;
    const tilt = tiltAt(course, Math.max(0, s.tick - delayTicks));
    const horizon = delayTicks + 8;
    const est = seen.x + seen.v * horizon + Math.trunc((tilt * K_TILT * horizon * horizon) / (2 * TILT_MAX));
    const dead = deadUnits * SUB;
    if (est > dead) return -1;
    if (est < -dead) return 1;
    return 0;
  };
}

export function playBot(course: Course, policy: Policy, untilTick = END_TICK, from?: SimState): { events: TraceEvent[]; result: SimResult } {
  const s = from ?? initialState();
  const inputs: PushEvent[] = [];
  let current: Push = s.push;
  while (!s.end && s.tick < untilTick) {
    const push = policy(s, course);
    if (push !== current) {
      inputs.push({ tick: s.tick, push });
      current = push;
    }
    step(s, course, push);
  }
  const endTick = s.end ? s.end.tick : s.tick;
  return { events: [...inputs, { tick: endTick, fin: true }], result: { score: msAt(endTick), endTick, endReason: s.end?.reason ?? null, state: s } };
}

/** la traza del jugador automático con 250 ms de demora (tests, E2E y la herramienta) */
export function autoTrace(attemptSeed: string, untilTick = END_TICK, delayTicks = FAIR_DELAY_TICKS) {
  return playBot(generateCourse(attemptSeed), delayedPolicy(delayTicks), untilTick);
}
