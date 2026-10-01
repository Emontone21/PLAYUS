// "la mayo": la simulación pura, compartida por el navegador y el servidor.
// Una barrita va y viene por un tubo de 1.000 unidades; tocar la frena: si
// quedó en la zona del punto justo (centrada en 500, que se achica con el
// tiempo) suma uno, si no, se pierde una vida. Tres vidas, 60 segundos.
//
// Todo es entero: la posición en subunidades (64 por unidad), 60 ticks por
// segundo, la velocidad y el ancho de la zona interpolados con enteros según
// el tick. Toda la aleatoriedad (el lado desde el que arranca después de cada
// toque y la variación de ±8 % de la velocidad) sale de la semilla del
// intento, en el mismo orden en el cliente y en la validación.

import { hash32, mulberry32 } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const TICKS_PER_S = 60;
export const DURATION_MS = 60_000;
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen entre el tick de fin y la duración real del intento (/finish) */
export const ELAPSED_SLACK_MS = 10_000;

/** la barra mide 1.000 unidades; el punto justo está en 500 */
export const BAR_MAX = 1000;
export const CENTER = 500;
/** subunidades por unidad */
export const SUB = 64;
/** medio ancho de la zona: 60 al arrancar (de 440 a 560), 25 a los 60 s (de 475 a 525) */
export const ZONE_HALF_START = 60;
export const ZONE_HALF_END = 25;
/** una pasada de extremo a extremo: 1,6 s al arrancar (96 ticks), 0,6 s a los 60 s (36 ticks); calibración, decisión 219 */
export const PASS_TICKS_START = 96;
export const PASS_TICKS_END = 36;
/** velocidad en subunidades por tick en cada extremo del cronograma */
export const SPEED_START = Math.round((BAR_MAX * SUB) / PASS_TICKS_START);
export const SPEED_END = Math.round((BAR_MAX * SUB) / PASS_TICKS_END);
/** cada arranque varía la velocidad hasta ±8 % (en milésimas) */
export const VARIATION_PERMILLE = 80;
/** después de un toque la barrita queda congelada 400 ms */
export const FREEZE_TICKS = 24;
export const LIVES = 3;
/** cota de plausibilidad: un toque cada 400 ms (el congelamiento) durante 60 s */
export const MAX_SCORE = Math.floor(END_TICK / FREEZE_TICKS);

export type TapEvent = { tick: number };
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = TapEvent | EndEvent;
export type EndReason = "vidas";

/** el medio ancho de la zona en un tick: baja parejo de 60 a 25 */
export function zoneHalfAt(tick: number): number {
  const t = Math.max(0, Math.min(END_TICK, tick));
  return ZONE_HALF_START - Math.floor(((ZONE_HALF_START - ZONE_HALF_END) * t) / END_TICK);
}

/** ¿la posición (en unidades) cae en la zona en ese tick? los bordes cuentan */
export function isHit(pos: number, tick: number): boolean {
  return Math.abs(pos - CENTER) <= zoneHalfAt(tick);
}

/** la velocidad del cronograma en un tick (subunidades por tick), sin la variación */
export function speedAt(tick: number): number {
  const t = Math.max(0, Math.min(END_TICK, tick));
  return SPEED_START + Math.floor(((SPEED_END - SPEED_START) * t) / END_TICK);
}

export interface SimState {
  tick: number;
  /** posición en subunidades, de 0 a BAR_MAX × SUB */
  pos: number;
  dir: 1 | -1;
  /** velocidad efectiva de la pasada en curso (subunidades por tick) */
  speed: number;
  /** la variación del arranque en curso, en milésimas (920 a 1080) */
  variation: number;
  /** congelada hasta este tick (exclusivo) */
  frozenUntil: number;
  score: number;
  lives: number;
  /** el último toque que contó */
  lastTap: { tick: number; hit: boolean; pos: number } | null;
  end: { tick: number; reason: EndReason } | null;
  rng: () => number;
}

export function initialState(seed: string): SimState {
  const rng = mulberry32(hash32(`mayo:${seed}`));
  const variation = drawVariation(rng);
  return { tick: 0, pos: 0, dir: 1, speed: effectiveSpeed(0, variation), variation, frozenUntil: 0, score: 0, lives: LIVES, lastTap: null, end: null, rng };
}

function drawVariation(rng: () => number): number {
  return 1000 + Math.floor(rng() * (2 * VARIATION_PERMILLE + 1)) - VARIATION_PERMILLE;
}

export function effectiveSpeed(tick: number, variation: number): number {
  return Math.floor((speedAt(tick) * variation) / 1000);
}

/** la posición en unidades (0 a 1000) */
export function posUnits(s: SimState): number {
  return Math.floor(s.pos / SUB);
}

export function isFrozen(s: SimState): boolean {
  return s.tick < s.frozenUntil;
}

/** un tick: la barrita avanza y rebota (a la velocidad del cronograma en cada pasada), o sigue congelada */
export function step(s: SimState): void {
  if (s.end) return;
  if (s.tick < s.frozenUntil) {
    s.tick++;
    if (s.tick === s.frozenUntil) {
      // arranca de nuevo desde un extremo, según la semilla, con la velocidad de ese momento
      const fromRight = s.rng() < 0.5;
      s.variation = drawVariation(s.rng);
      s.pos = fromRight ? BAR_MAX * SUB : 0;
      s.dir = fromRight ? -1 : 1;
      s.speed = effectiveSpeed(s.tick, s.variation);
    }
    return;
  }
  s.pos += s.dir * s.speed;
  const max = BAR_MAX * SUB;
  if (s.pos > max) {
    s.pos = 2 * max - s.pos;
    s.dir = -1;
    s.speed = effectiveSpeed(s.tick, s.variation);
  } else if (s.pos < 0) {
    s.pos = -s.pos;
    s.dir = 1;
    s.speed = effectiveSpeed(s.tick, s.variation);
  }
  s.tick++;
}

export type TapOutcome = "hit" | "miss" | "ignored";

/** un toque en el tick actual: cuenta salvo durante el congelamiento o después del final */
export function applyTap(s: SimState): TapOutcome {
  if (s.end || s.tick < s.frozenUntil) return "ignored";
  const pos = posUnits(s);
  const hit = isHit(pos, s.tick);
  if (hit) s.score++;
  else s.lives--;
  s.lastTap = { tick: s.tick, hit, pos };
  s.frozenUntil = s.tick + FREEZE_TICKS;
  if (s.lives === 0) s.end = { tick: s.tick, reason: "vidas" };
  return hit ? "hit" : "miss";
}

export function endTickOf(s: SimState): number {
  return s.end ? s.end.tick : s.tick;
}

// ---------------------------------------------------------------------------
// volver a jugar una traza
// ---------------------------------------------------------------------------

export interface Replay {
  score: number;
  lives: number;
  endTick: number;
  endReason: EndReason | null;
  state: SimState;
  /** false si algún toque cayó congelado, o después del final */
  tapsOk: boolean;
  reason: string | null;
}

/** Vuelve a jugar los toques (ordenados por tick) hasta `untilTick` o hasta perder las vidas. */
export function simulate(seed: string, taps: readonly TapEvent[], untilTick = END_TICK): Replay {
  const s = initialState(seed);
  let k = 0;
  let tapsOk = true;
  let reason: string | null = null;
  while (s.tick < untilTick && !s.end) {
    while (k < taps.length && taps[k]!.tick === s.tick) {
      if (applyTap(s) === "ignored" && tapsOk) {
        tapsOk = false;
        reason = "un toque durante el congelamiento";
      }
      k++;
      if (s.end) break;
    }
    if (s.end) break;
    step(s);
  }
  if (k < taps.length && tapsOk) {
    tapsOk = false;
    reason = s.end ? "toques después de la tercera vida" : "toques después del final";
  }
  return { score: s.score, lives: s.lives, endTick: endTickOf(s), endReason: s.end?.reason ?? null, state: s, tapsOk, reason };
}

export type Verdict = { ok: true; score: number; endTick: number; endReason: EndReason | null; lives: number } | { ok: false; reason: string };

/** revisa la forma de la traza: toques con tick entero, en orden estricto, antes del cierre */
export function parseTrace(events: unknown): { ok: true; taps: TapEvent[]; endTick: number } | { ok: false; reason: string } {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > MAX_SCORE * 2 + 2) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const taps: TapEvent[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.tick) || "fin" in e) return { ok: false, reason: "toque mal armado" };
    const tick = e.tick as number;
    if (tick <= prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick > endTick) return { ok: false, reason: "toque después del final" };
    prev = tick;
    taps.push({ tick });
  }
  return { ok: true, taps, endTick };
}

/**
 * Vuelve a jugar la traza con la semilla del intento y comprueba que todo
 * cierre: la forma, ningún toque congelado ni después de la tercera vida, el
 * tick de fin (el de la tercera vida, si la hubo) y la duración real.
 */
export function check(attemptSeed: string, events: unknown, elapsedMs?: number): Verdict {
  const p = parseTrace(events);
  if (!p.ok) return p;
  // el último toque puede ser el de la tercera vida, en el mismo tick de fin
  const r = simulate(attemptSeed, p.taps, p.endTick + 1);
  if (!r.tapsOk) return { ok: false, reason: r.reason ?? "toques inválidos" };
  if (r.endReason === "vidas") {
    if (r.endTick !== p.endTick) return { ok: false, reason: "el tick de fin no es el de la tercera vida" };
  } else if (p.taps.some((t) => t.tick >= p.endTick)) {
    return { ok: false, reason: "toque después del final" };
  }
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(p.endTick, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: r.score, endTick: p.endTick, endReason: r.endReason, lives: r.lives };
}

/** el puntaje son las embocadas recalculadas, exactas */
export function validate(result: { score: number; events: unknown[] }, attemptSeed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(attemptSeed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// jugadores automáticos (calibración, tests, E2E)
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** error de tiempo al apuntar al centro: uniforme en ±jitterTicks */
  jitterTicks?: number;
  /** semilla del azar del jugador (no del juego) */
  botSeed?: string;
  /** toca solo una de cada `every` pasadas (1: todas) */
  every?: number;
  /** parar después de tantos toques que cuentan */
  maxTaps?: number;
  /** a partir de este toque (índice), errar a propósito: tocar cerca del extremo */
  missFrom?: number;
}

/** el tick en que la barrita, sin tocarla, va a pasar por el centro en la pasada en curso (o null si ya pasó) */
export function nextCenterTick(s: SimState): number | null {
  const target = CENTER * SUB;
  const ahead = s.dir === 1 ? s.pos < target : s.pos > target;
  if (!ahead || s.speed === 0) return null;
  return s.tick + Math.round(Math.abs(target - s.pos) / s.speed);
}

/**
 * Juega una partida entera apuntando al centro en cada pasada, con un error
 * de tiempo al azar. Devuelve la traza (toques que contaron y el cierre) y
 * el resultado.
 */
export function botTrace(seed: string, opts: BotOptions = {}): { events: TraceEvent[]; result: Replay } {
  const jitter = opts.jitterTicks ?? 0;
  const every = Math.max(1, opts.every ?? 1);
  const rng = mulberry32(hash32(`bot:${opts.botSeed ?? seed}`));
  const s = initialState(seed);
  const taps: TapEvent[] = [];
  let planned: number | null = null;
  let passes = 0;
  let lastDir = s.dir;
  let lastFrozen = false;
  while (s.tick < END_TICK && !s.end && (opts.maxTaps === undefined || taps.length < opts.maxTaps)) {
    const frozen = isFrozen(s);
    if (!frozen) {
      if (lastFrozen || s.dir !== lastDir) {
        passes++;
        planned = null;
      }
      const miss = opts.missFrom !== undefined && taps.length >= opts.missFrom;
      if (planned === null && passes % every === 0) {
        if (miss) {
          // cerca del extremo hacia el que va: bien afuera de la zona
          const edge = s.dir === 1 ? (BAR_MAX - 40) * SUB : 40 * SUB;
          const ahead = s.dir === 1 ? s.pos < edge : s.pos > edge;
          if (ahead) planned = s.tick + Math.round(Math.abs(edge - s.pos) / s.speed);
        } else {
          const c = nextCenterTick(s);
          if (c !== null) planned = Math.max(s.tick, c + (jitter > 0 ? Math.floor(rng() * (2 * jitter + 1)) - jitter : 0));
        }
      }
      if (planned !== null && s.tick >= planned) {
        if (applyTap(s) !== "ignored") taps.push({ tick: s.tick });
        planned = null;
        if (s.end) break;
      }
    }
    lastDir = s.dir;
    lastFrozen = frozen;
    step(s);
  }
  const endTick = endTickOf(s);
  const result: Replay = { score: s.score, lives: s.lives, endTick, endReason: s.end?.reason ?? null, state: s, tapsOk: true, reason: null };
  return { events: [...taps, { tick: endTick, fin: true }], result };
}
