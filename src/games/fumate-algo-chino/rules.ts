// "fumate algo chino": la simulación pura, compartida por el navegador y el
// servidor. Tres tiros con gomera: el vector de lanzamiento sale del arrastre
// (opuesto, con la fuerza limitada), el cigarro vuela con gravedad y viento
// constantes, y cada tiro vale según la menor distancia entre el cigarro y la
// boca de El chino durante el vuelo. El puntaje es el mejor de los tres.
//
// Unidades lógicas: decímetros de juego, en punto fijo (SUB subunidades por
// dm); el tiempo en ticks de 1/60 s, con 4 subpasos por tick para medir.
// La distancia y el viento de cada tiro salen de la semilla; nada más es al
// azar. Todo entero, igual en Node y en el navegador.

import { rngFromSeed } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const TICKS_PER_S = 60;
export const DURATION_MS = 45_000;
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen entre el tick de fin y la duración real del intento (/finish) */
export const ELAPSED_SLACK_MS = 10_000;

export const SHOTS = 3;
export const MAX_SCORE = 1000;
/** subunidades por decímetro */
export const SUB = 4096;
/** subpasos por tick para medir la distancia a la boca */
export const SUBSTEPS = 4;
/** gravedad: 9,8 m/s² = 98 dm/s² → subunidades por tick² */
export const GRAVITY = Math.round((98 * SUB) / (TICKS_PER_S * TICKS_PER_S));
/** desde dónde se tira (la mano) y a qué altura está la boca, en dm */
export const LAUNCH_X = 0;
export const LAUNCH_Y = 10;
export const MOUTH_Y = 15;
/** el radio de "adentro" de la boca: 2 dm */
export const MOUTH_RADIUS = 2;
/** 1000 − K × distancia en dm: entrar al borde (2 dm) da 900, pasar a 1 m da 500 */
export const K_PER_DM = 50;
/** fuerza (módulo del vector, en subunidades por tick): de 3,6 a 19 m/s */
export const V_MIN = 2500;
export const V_MAX = 13000;
/** la pausa entre tiros: 1,2 s */
export const PAUSE_TICKS = 72;
/** un vuelo nunca pasa de 10 s */
export const MAX_FLIGHT_TICKS = 600;
/** la escena termina a este tanto a la derecha de El chino y a la izquierda de la mano (dm) */
export const SCENE_RIGHT_MARGIN = 40;
export const SCENE_LEFT = -30;

/** los rangos de cada tiro: distancia en dm y viento en dm/s² (hacia un lado o el otro) */
export const SHOT_RANGES = [
  { distMin: 80, distMax: 120, windMin: 2, windMax: 6 },
  { distMin: 140, distMax: 180, windMin: 6, windMax: 12 },
  { distMin: 200, distMax: 260, windMin: 12, windMax: 20 },
] as const;

export interface ShotSetup {
  /** la distancia a El chino (dm) */
  dist: number;
  /** el viento en dm/s² con signo (positivo: sopla hacia El chino) */
  wind: number;
  /** la aceleración del viento en subunidades por tick² */
  windAccel: number;
}

export function windAccelOf(windDmS2: number): number {
  return Math.round((windDmS2 * SUB) / (TICKS_PER_S * TICKS_PER_S));
}

export function generateShots(seed: string): ShotSetup[] {
  const rng = rngFromSeed(`chino:${seed}`);
  return SHOT_RANGES.map((r) => {
    const dist = rng.int(r.distMin, r.distMax);
    const mag = rng.int(r.windMin, r.windMax);
    const wind = rng.next() < 0.5 ? -mag : mag;
    return { dist, wind, windAccel: windAccelOf(wind) };
  });
}

export type Vector = { vx: number; vy: number };

/** el módulo al cuadrado, para comparar con V_MIN y V_MAX sin raíces */
export function speed2(v: Vector): number {
  return v.vx * v.vx + v.vy * v.vy;
}

export function speedOk(v: Vector): boolean {
  const s2 = speed2(v);
  return Number.isInteger(v.vx) && Number.isInteger(v.vy) && s2 >= V_MIN * V_MIN && s2 <= V_MAX * V_MAX;
}

/** limita un vector al tope de fuerza (lo acorta si se pasa) y lo deja entero */
export function clampVector(vx: number, vy: number): Vector {
  const s = Math.sqrt(vx * vx + vy * vy);
  if (s > V_MAX) {
    const f = V_MAX / s;
    return { vx: Math.round(vx * f * 0.999), vy: Math.round(vy * f * 0.999) };
  }
  return { vx: Math.round(vx), vy: Math.round(vy) };
}

export interface FlightPoint {
  /** posición en subunidades */
  x: number;
  y: number;
}

export interface Flight {
  /** por tick, la posición al cerrar cada tick (la 0 es el lanzamiento) */
  points: FlightPoint[];
  /** la menor distancia a la boca en subunidades (medida en subpasos) */
  minDist: number;
  /** cuánto duró (ticks) */
  ticks: number;
  /** cómo terminó */
  end: "piso" | "fuera" | "paso";
}

/**
 * Vuela el cigarro: v += (viento, −g) y p += v, en 4 subpasos por tick con
 * punto fijo, midiendo la distancia a la boca en cada subpaso. Termina al
 * tocar el piso, al salir de la escena o al pasar de largo la boca.
 */
export function fly(shot: ShotSetup, v: Vector): Flight {
  const mouthX = shot.dist * SUB;
  const mouthY = MOUTH_Y * SUB;
  let x = LAUNCH_X * SUB;
  let y = LAUNCH_Y * SUB;
  let vx = v.vx;
  let vy = v.vy;
  const points: FlightPoint[] = [{ x, y }];
  let minD2 = (x - mouthX) * (x - mouthX) + (y - mouthY) * (y - mouthY);
  let end: Flight["end"] | null = null;
  let ticks = 0;
  const rightEnd = (shot.dist + SCENE_RIGHT_MARGIN) * SUB;
  const leftEnd = SCENE_LEFT * SUB;
  while (end === null && ticks < MAX_FLIGHT_TICKS) {
    for (let k = 0; k < SUBSTEPS; k++) {
      vx += Math.floor(shot.windAccel / SUBSTEPS);
      vy -= Math.floor(GRAVITY / SUBSTEPS);
      x += Math.floor(vx / SUBSTEPS);
      y += Math.floor(vy / SUBSTEPS);
      const dx = x - mouthX;
      const dy = y - mouthY;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) minD2 = d2;
      if (y <= 0) {
        end = "piso";
        break;
      }
      if (x > rightEnd || x < leftEnd || y > 400 * SUB) {
        end = "fuera";
        break;
      }
      // pasó la boca y ya se aleja: sigue hasta el piso, pero si está bajando lejos corta
      if (x > mouthX + 15 * SUB && vy < 0 && y < mouthY - 10 * SUB) {
        end = "paso";
        break;
      }
    }
    ticks++;
    points.push({ x, y });
  }
  return { points, minDist: Math.floor(Math.sqrt(minD2)), ticks, end: end ?? "fuera" };
}

/** puntaje de un tiro por la menor distancia en subunidades: 1000 − 50 por dm, sin bajar de 0 */
export function scoreFor(minDist: number): number {
  return Math.max(0, MAX_SCORE - Math.floor((K_PER_DM * minDist) / SUB));
}

export type Outcome = "adentro" | "casi" | "lejos";

export function outcomeFor(minDist: number): Outcome {
  if (minDist <= MOUTH_RADIUS * SUB) return "adentro";
  if (minDist <= 5 * SUB) return "casi";
  return "lejos";
}

export interface ShotResult {
  shot: number;
  score: number;
  minDist: number;
  outcome: Outcome;
  v: Vector;
  tick: number;
  flight: Flight;
}

export type Phase = "aim" | "flight" | "pause" | "done";

export interface SimState {
  tick: number;
  shots: ShotSetup[];
  /** índice del tiro en curso (0 a 2) */
  current: number;
  phase: Phase;
  /** el vuelo en curso */
  flight: { result: ShotResult; startTick: number } | null;
  phaseUntil: number;
  results: ShotResult[];
  best: number;
  end: { tick: number } | null;
}

export function initialState(seed: string): SimState {
  return { tick: 0, shots: generateShots(seed), current: 0, phase: "aim", flight: null, phaseUntil: 0, results: [], best: 0, end: null };
}

/** un tiro en el tick actual; false si no corresponde (vuelo, pausa, ya terminó) o la fuerza está fuera de rango */
export function applyThrow(s: SimState, v: Vector): boolean {
  if (s.end || s.phase !== "aim" || !speedOk(v)) return false;
  const shot = s.shots[s.current]!;
  const flight = fly(shot, v);
  const result: ShotResult = { shot: s.current + 1, score: scoreFor(flight.minDist), minDist: flight.minDist, outcome: outcomeFor(flight.minDist), v, tick: s.tick, flight };
  s.flight = { result, startTick: s.tick };
  s.phase = "flight";
  return true;
}

export function step(s: SimState): void {
  if (s.end) return;
  s.tick++;
  if (s.phase === "flight" && s.flight) {
    if (s.tick - s.flight.startTick >= s.flight.result.flight.ticks) {
      const r = s.flight.result;
      s.results.push(r);
      if (r.score > s.best) s.best = r.score;
      if (s.current + 1 >= SHOTS) {
        s.phase = "done";
        s.end = { tick: s.tick };
      } else {
        s.phase = "pause";
        s.phaseUntil = s.tick + PAUSE_TICKS;
      }
    }
    return;
  }
  if (s.phase === "pause" && s.tick >= s.phaseUntil) {
    s.current++;
    s.flight = null;
    s.phase = "aim";
  }
}

export function endTickOf(s: SimState): number {
  return s.end ? s.end.tick : s.tick;
}

/** la posición del cigarro en el vuelo en curso, interpolada (subunidades), o null */
export function cigaretteAt(s: SimState, alpha: number): FlightPoint | null {
  if (!s.flight) return null;
  const f = s.flight.result.flight;
  const i = Math.min(f.points.length - 1, s.tick - s.flight.startTick);
  const a = f.points[Math.max(0, i - 1)]!;
  const b = f.points[i]!;
  if (s.phase !== "flight") return f.points[f.points.length - 1]!;
  return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

export type ThrowEvent = { shot: number; tick: number; vx: number; vy: number };
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = ThrowEvent | EndEvent;

export interface Replay {
  best: number;
  results: ShotResult[];
  endTick: number;
  finished: boolean;
  state: SimState;
  ok: boolean;
  reason: string | null;
}

export function simulate(seed: string, throws: readonly ThrowEvent[], untilTick = END_TICK): Replay {
  const s = initialState(seed);
  let k = 0;
  let ok = true;
  let reason: string | null = null;
  while (s.tick < untilTick && !s.end) {
    while (k < throws.length && throws[k]!.tick === s.tick) {
      const t = throws[k]!;
      if (t.shot !== s.current + 1 || s.phase !== "aim") {
        if (ok) {
          ok = false;
          reason = s.phase === "pause" ? "un tiro en la pausa" : s.phase === "flight" ? "un tiro durante el vuelo" : "los tiros no van en orden";
        }
      } else if (!applyThrow(s, { vx: t.vx, vy: t.vy }) && ok) {
        ok = false;
        reason = "fuerza fuera de rango";
      }
      k++;
    }
    if (s.end) break;
    step(s);
  }
  if (k < throws.length && ok) {
    ok = false;
    reason = "tiros después del final";
  }
  return { best: s.best, results: s.results, endTick: endTickOf(s), finished: !!s.end, state: s, ok, reason };
}

export type Verdict = { ok: true; best: number; results: ShotResult[]; endTick: number; finished: boolean } | { ok: false; reason: string };

export function parseTrace(events: unknown): { ok: true; throws: ThrowEvent[]; endTick: number } | { ok: false; reason: string } {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > SHOTS + 1) return { ok: false, reason: "más de 3 tiros" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const throws: ThrowEvent[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.tick) || !Number.isInteger(e.vx) || !Number.isInteger(e.vy) || !Number.isInteger(e.shot) || "fin" in e) return { ok: false, reason: "tiro mal armado" };
    const tick = e.tick as number;
    if (e.shot !== i + 1) return { ok: false, reason: "los tiros no van en orden" };
    if (tick <= prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= endTick) return { ok: false, reason: "tiro después del final" };
    const v = { vx: e.vx as number, vy: e.vy as number };
    if (!speedOk(v)) return { ok: false, reason: "fuerza fuera de rango" };
    prev = tick;
    throws.push({ shot: e.shot as number, tick, vx: v.vx, vy: v.vy });
  }
  return { ok: true, throws, endTick };
}

export function check(attemptSeed: string, events: unknown, elapsedMs?: number): Verdict {
  const p = parseTrace(events);
  if (!p.ok) return p;
  const r = simulate(attemptSeed, p.throws, p.endTick);
  if (!r.ok) return { ok: false, reason: r.reason ?? "tiros inválidos" };
  if (r.finished && r.endTick !== p.endTick) return { ok: false, reason: "el tick de fin no es el del tercer tiro" };
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(p.endTick, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, best: r.best, results: r.results, endTick: p.endTick, finished: r.finished };
}

/** el puntaje es el mejor tiro recalculado, exacto */
export function validate(result: { score: number; events: unknown[] }, attemptSeed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(attemptSeed, result.events, meta?.elapsedMs);
  return v.ok && v.best === result.score;
}

// ---------------------------------------------------------------------------
// el resolvedor y los jugadores automáticos
// ---------------------------------------------------------------------------

/**
 * Busca un vector dentro del rango de fuerza que pase por el centro de la
 * boca: para cada duración de vuelo prueba la solución cerrada del
 * integrador (p = p0 + n·v/4 + a·n(n+1)/32 en subpasos) y la ajusta con el
 * vuelo de verdad, quedándose con la menor distancia.
 */
export function solveShot(shot: ShotSetup): { v: Vector; minDist: number; ticks: number } {
  const dx = shot.dist * SUB - LAUNCH_X * SUB;
  const dy = MOUTH_Y * SUB - LAUNCH_Y * SUB;
  const ax = Math.floor(shot.windAccel / SUBSTEPS);
  const ay = -Math.floor(GRAVITY / SUBSTEPS);
  let best: { v: Vector; minDist: number; ticks: number } | null = null;
  for (let ticks = 8; ticks <= 240; ticks++) {
    const n = ticks * SUBSTEPS;
    // p = p0 + (n/4)·v0 + (a/4)·n(n+1)/2  →  v0 = 4·(d − a·n(n+1)/8) / n
    const guessX = (4 * (dx - (ax * n * (n + 1)) / 8)) / n;
    const guessY = (4 * (dy - (ay * n * (n + 1)) / 8)) / n;
    const base = { vx: Math.round(guessX), vy: Math.round(guessY) };
    if (!speedOk(base)) continue;
    for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [2, 0], [-2, 0]] as const) {
      const v = { vx: base.vx + ox, vy: base.vy + oy };
      if (!speedOk(v)) continue;
      const f = fly(shot, v);
      if (!best || f.minDist < best.minDist) best = { v, minDist: f.minDist, ticks };
      if (best.minDist === 0) return best;
    }
  }
  return best ?? { v: { vx: V_MIN, vy: 0 }, minDist: Infinity, ticks: 0 };
}

export interface BotOptions {
  /** error relativo sobre el vector del resolvedor en cada tiro (por ejemplo 0,05 = 5 %), uniforme ± */
  errorPct?: number;
  botSeed?: string;
  /** ticks de espera antes de cada tiro */
  aimTicks?: number;
  maxShots?: number;
}

/** juega los tres tiros con el vector del resolvedor, con un error relativo al azar */
export function botTrace(seed: string, opts: BotOptions = {}): { events: TraceEvent[]; result: Replay } {
  const s = initialState(seed);
  const rng = rngFromSeed(`bot:${opts.botSeed ?? seed}`);
  const throws: ThrowEvent[] = [];
  const aim = opts.aimTicks ?? 90;
  const err = opts.errorPct ?? 0;
  let aimStart = 0;
  while (!s.end && s.tick < END_TICK) {
    if (opts.maxShots !== undefined && s.current >= opts.maxShots) break;
    if (s.phase === "aim" && s.tick - aimStart >= aim) {
      const sol = solveShot(s.shots[s.current]!);
      const fx = 1 + (err > 0 ? (rng.next() * 2 - 1) * err : 0);
      const fy = 1 + (err > 0 ? (rng.next() * 2 - 1) * err : 0);
      const v = clampVector(sol.v.vx * fx, sol.v.vy * fy);
      if (applyThrow(s, v)) throws.push({ shot: s.current + 1, tick: s.tick, vx: v.vx, vy: v.vy });
    }
    const wasAim = s.phase === "aim";
    step(s);
    if (!wasAim && s.phase === "aim") aimStart = s.tick;
  }
  const endTick = endTickOf(s);
  return { events: [...throws, { tick: endTick, fin: true }], result: { best: s.best, results: s.results, endTick, finished: !!s.end, state: s, ok: true, reason: null } };
}
