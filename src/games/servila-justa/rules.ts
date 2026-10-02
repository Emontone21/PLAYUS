// "servila justa": la simulación pura, compartida por el navegador y el
// servidor. Ocho whiskys con coca: mantener apretado sirve cola de la botella
// y soltar corta; la espuma sigue subiendo un poco después de soltar y hay
// que quedar lo más cerca posible de la raya sin pasarse.
//
// Todo es entero: el volumen en milésimas de celda del mapa del vaso, el
// nivel en milésimas de fila, 60 ticks por segundo. La forma, el whisky y
// la raya de cada vaso salen de la semilla; el caudal, la espuma y el
// asentamiento son funciones conocidas del caudal y del vaso (nada al azar),
// así se pueden aprender.

import { rngFromSeed } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";
import { glassDef, SHAPES, type GlassDef, type Shape } from "./glasses";

export const TICKS_PER_S = 60;
export const DURATION_MS = 90_000;
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen entre el tick de fin y la duración real del intento (/finish) */
export const ELAPSED_SLACK_MS = 10_000;

export const GLASSES = 8;
export const MAX_SCORE = 100 * GLASSES;
/** milésimas: el volumen va en milésimas de celda y el nivel en milésimas de fila */
export const SUB = 1000;
/** el caudal (milésimas de celda por tick): arranca suave y sube durante el primer segundo */
export const FLOW_START = 800;
export const FLOW_MAX_BASE = 4500;
/** cada vaso siguiente sirve un poco más fuerte */
export const FLOW_MAX_STEP = 120;
export const FLOW_RAMP_TICKS = 60;
/** la espuma mientras se sirve: tiende a caudal × FOAM_POUR / 1000 filas (milésimas) */
export const FOAM_POUR = 900;
/** al soltar, sube caudal × factor del vaso × FOAM_RELEASE / 10^6 filas más, repartido en 20 ticks */
export const FOAM_RELEASE = 1300;
export const FOAM_RISE_TICKS = 20;
/** y después se asienta: pierde un 35 % de su espesor, parejo, en el segundo que sigue */
export const SETTLE_TICKS = 60;
export const SETTLE_PERMILLE = 350;
/** si no se aprieta en 6 s, el vaso vale 0 */
export const IDLE_TICKS = 6 * TICKS_PER_S;
/** la pausa entre vasos */
export const PAUSE_TICKS = 36;
/** el puntaje: 100 − 5 × distancia a la raya en filas (1 fila: 95; 10 filas: 50) */
export const K_PER_ROW = 5;
/** el whisky ocupa del 15 al 25 % de la altura; la raya va del 60 al 85 % */
export const WHISKY_MIN = 15;
export const WHISKY_MAX = 25;
export const LINE_MIN = 60;
export const LINE_MAX = 85;

export type Action = "down" | "up";
export type PourEvent = { tick: number; action: Action };
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = PourEvent | EndEvent;

export interface GlassSetup {
  shape: Shape;
  def: GlassDef;
  /** filas de whisky (desde la primera fila interior) */
  whiskyRows: number;
  /** la fila de la raya (desde el fondo del vaso, en filas del mapa) */
  lineRow: number;
}

/** los 8 vasos de la partida, desde la semilla: nunca la misma forma dos seguidos */
export function generateGlasses(seed: string): GlassSetup[] {
  const rng = rngFromSeed(`servila:${seed}`);
  const out: GlassSetup[] = [];
  let prev: Shape | null = null;
  for (let i = 0; i < GLASSES; i++) {
    const options = SHAPES.filter((s) => s !== prev);
    const shape = rng.pick(options);
    prev = shape;
    const def = glassDef(shape);
    const inner = def.h - def.firstRow;
    const whiskyRows = Math.max(1, Math.round((inner * rng.int(WHISKY_MIN, WHISKY_MAX)) / 100));
    const lineRow = def.firstRow + Math.round((inner * rng.int(LINE_MIN, LINE_MAX)) / 100);
    out.push({ shape, def, whiskyRows, lineRow });
  }
  return out;
}

/** el caudal en un tick, `held` ticks después de apretar (milésimas de celda por tick) */
export function flowAt(held: number, glassIndex: number): number {
  const max = FLOW_MAX_BASE + FLOW_MAX_STEP * glassIndex;
  const t = Math.max(0, Math.min(FLOW_RAMP_TICKS, held));
  return FLOW_START + Math.floor(((max - FLOW_START) * t) / FLOW_RAMP_TICKS);
}

/** el nivel del líquido (milésimas de fila, desde el fondo del mapa) para un volumen (milésimas de celda) */
export function levelFor(def: GlassDef, volume: number): number {
  const cells = volume / SUB;
  let r = def.firstRow;
  while (r < def.h && def.cap[r + 1]! <= cells) r++;
  if (r >= def.h) return def.h * SUB;
  const w = def.widths[r]!;
  const inRow = cells - def.cap[r]!;
  return r * SUB + Math.floor((inRow * SUB) / w);
}

export type Phase = "pour" | "settle" | "pause" | "done";

export interface GlassState {
  index: number;
  startTick: number;
  volume: number;
  /** espesor de la espuma (milésimas de fila) */
  foam: number;
  pressed: boolean;
  downTick: number;
  upTick: number;
  /** lo que la espuma todavía tiene que subir después de soltar (milésimas) */
  riseLeft: number;
  /** el espesor al empezar a asentarse */
  foamAtSettle: number;
  /** el resultado: null hasta medir */
  result: GlassResult | null;
}

export type Outcome = "justa" | "casi" | "falta" | "pasado" | "rebalso" | "vacio";

export interface GlassResult {
  score: number;
  outcome: Outcome;
  /** el tope de la espuma medido (milésimas de fila) */
  top: number;
  tick: number;
}

export interface SimState {
  tick: number;
  glasses: GlassSetup[];
  current: GlassState | null;
  phase: Phase;
  /** hasta qué tick dura la fase pausa/settle */
  phaseUntil: number;
  results: GlassResult[];
  score: number;
  end: { tick: number } | null;
}

function newGlass(s: SimState, index: number): GlassState {
  const g = s.glasses[index]!;
  const whiskyVolume = g.def.cap[g.def.firstRow + g.whiskyRows]! * SUB;
  return { index, startTick: s.tick, volume: whiskyVolume, foam: 0, pressed: false, downTick: -1, upTick: -1, riseLeft: 0, foamAtSettle: 0, result: null };
}

export function initialState(seed: string): SimState {
  const s: SimState = { tick: 0, glasses: generateGlasses(seed), current: null, phase: "pour", phaseUntil: 0, results: [], score: 0, end: null };
  s.current = newGlass(s, 0);
  return s;
}

/** el nivel del líquido y el tope de la espuma del vaso en curso (milésimas de fila) */
export function levels(s: SimState): { liquid: number; top: number } {
  const c = s.current;
  if (!c) return { liquid: 0, top: 0 };
  const liquid = levelFor(s.glasses[c.index]!.def, c.volume);
  return { liquid, top: liquid + c.foam };
}

export function lineLevel(s: SimState): number {
  const c = s.current;
  return c ? s.glasses[c.index]!.lineRow * SUB : 0;
}

/** puntaje de un vaso por la distancia (milésimas de fila) entre el tope de la espuma y la raya */
export function scoreFor(distance: number): number {
  return Math.max(0, 100 - Math.floor((K_PER_ROW * Math.abs(distance)) / SUB));
}

function outcomeFor(score: number, distance: number): Outcome {
  if (score >= 95) return "justa";
  if (score >= 75) return "casi";
  return distance < 0 ? "falta" : "pasado";
}

/** una acción en el tick actual; devuelve false si no cuenta (pausa, ya se sirvió, etc.) */
export function applyAction(s: SimState, action: Action): boolean {
  const c = s.current;
  if (!c || s.end || s.phase !== "pour") return false;
  if (action === "down") {
    if (c.pressed || c.downTick >= 0) return false;
    c.pressed = true;
    c.downTick = s.tick;
    return true;
  }
  if (!c.pressed) return false;
  c.pressed = false;
  c.upTick = s.tick;
  const q = flowAt(s.tick - c.downTick, c.index);
  const def = s.glasses[c.index]!.def;
  c.riseLeft = Math.floor((q * def.foamFactor * FOAM_RELEASE) / 1_000_000);
  s.phase = "settle";
  s.phaseUntil = s.tick + SETTLE_TICKS;
  return true;
}

function finishGlass(s: SimState, result: GlassResult): void {
  const c = s.current!;
  c.result = result;
  s.results.push(result);
  s.score += result.score;
  if (c.index + 1 >= GLASSES) {
    s.phase = "done";
    s.end = { tick: s.tick };
    return;
  }
  s.phase = "pause";
  s.phaseUntil = s.tick + PAUSE_TICKS;
}

/** un tick de la simulación */
export function step(s: SimState): void {
  if (s.end) return;
  const c = s.current!;
  const g = s.glasses[c.index]!;
  const def = g.def;
  s.tick++;
  if (s.phase === "pause") {
    if (s.tick >= s.phaseUntil) {
      s.current = newGlass(s, c.index + 1);
      s.phase = "pour";
    }
    return;
  }
  if (s.phase === "pour") {
    if (c.pressed) {
      const q = flowAt(s.tick - c.downTick, c.index);
      c.volume += q;
      // la espuma tiende a lo que pide el caudal
      const target = Math.floor((q * FOAM_POUR) / SUB);
      c.foam += Math.floor((target - c.foam) / 8);
      if (c.foam < 0) c.foam = 0;
    } else if (c.downTick < 0 && s.tick - c.startTick >= IDLE_TICKS) {
      finishGlass(s, { score: 0, outcome: "vacio", top: levels(s).top, tick: s.tick });
      return;
    }
  } else if (s.phase === "settle") {
    const since = s.tick - c.upTick;
    if (since <= FOAM_RISE_TICKS && c.riseLeft > 0) {
      // sigue subiendo, repartido en los primeros 20 ticks
      const part = since === FOAM_RISE_TICKS ? c.riseLeft : Math.floor(c.riseLeft / (FOAM_RISE_TICKS - since + 1));
      c.foam += part;
      c.riseLeft -= part;
      if (since === FOAM_RISE_TICKS) c.foamAtSettle = c.foam;
    } else {
      if (since === FOAM_RISE_TICKS + 1 || c.foamAtSettle === 0) c.foamAtSettle = Math.max(c.foamAtSettle, c.foam);
      // se asienta: pierde el 35 % parejo hasta completar el segundo
      const settleTicks = SETTLE_TICKS - FOAM_RISE_TICKS;
      const t = Math.min(settleTicks, since - FOAM_RISE_TICKS);
      c.foam = c.foamAtSettle - Math.floor((c.foamAtSettle * SETTLE_PERMILLE * t) / (SUB * settleTicks));
    }
  }
  // ¿se rebalsó?
  const { top } = levels(s);
  if (top > def.h * SUB) {
    finishGlass(s, { score: 0, outcome: "rebalso", top, tick: s.tick });
    return;
  }
  if (s.phase === "settle" && s.tick >= s.phaseUntil) {
    const distance = top - g.lineRow * SUB;
    const score = scoreFor(distance);
    finishGlass(s, { score, outcome: outcomeFor(score, distance), top, tick: s.tick });
  }
}

export function endTickOf(s: SimState): number {
  return s.end ? s.end.tick : s.tick;
}

/** dónde va a terminar la espuma si se suelta ahora (milésimas de fila): simula una copia */
export function predictTop(s: SimState): number | null {
  const c = s.current;
  if (!c || !c.pressed || s.phase !== "pour") return null;
  const copy: SimState = { ...s, current: { ...c }, results: [...s.results], end: null };
  applyAction(copy, "up");
  while (!copy.end && copy.phase === "settle") step(copy);
  const r = copy.results[copy.results.length - 1];
  return r ? r.top : null;
}

// ---------------------------------------------------------------------------
// volver a jugar una traza
// ---------------------------------------------------------------------------

export interface Replay {
  score: number;
  results: GlassResult[];
  endTick: number;
  finished: boolean;
  state: SimState;
  /** false si alguna acción no correspondía */
  actionsOk: boolean;
  reason: string | null;
}

export function simulate(seed: string, inputs: readonly PourEvent[], untilTick = END_TICK): Replay {
  const s = initialState(seed);
  let k = 0;
  let actionsOk = true;
  let reason: string | null = null;
  while (s.tick < untilTick && !s.end) {
    while (k < inputs.length && inputs[k]!.tick === s.tick) {
      const e = inputs[k]!;
      if (!applyAction(s, e.action) && actionsOk) {
        actionsOk = false;
        reason = s.phase === "pause" ? "acción en la pausa entre vasos" : e.action === "down" ? "dos servidos en un vaso" : "soltar sin haber apretado";
      }
      k++;
    }
    if (s.end) break;
    step(s);
  }
  if (k < inputs.length && actionsOk) {
    actionsOk = false;
    reason = "acciones después del final";
  }
  return { score: s.score, results: s.results, endTick: endTickOf(s), finished: !!s.end, state: s, actionsOk, reason };
}

export type Verdict = { ok: true; score: number; endTick: number; results: GlassResult[]; finished: boolean } | { ok: false; reason: string };

export function parseTrace(events: unknown): { ok: true; inputs: PourEvent[]; endTick: number } | { ok: false; reason: string } {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > GLASSES * 4 + 1) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const inputs: PourEvent[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.tick) || "fin" in e) return { ok: false, reason: "entrada mal armada" };
    if (e.action !== "down" && e.action !== "up") return { ok: false, reason: "acción inválida" };
    const tick = e.tick as number;
    if (tick <= prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick > endTick) return { ok: false, reason: "acción después del final" };
    // que alternen down y up dentro de cada vaso lo revisa la simulación (un vaso que rebalsa mientras se aprieta queda sin "up")
    prev = tick;
    inputs.push({ tick, action: e.action });
  }
  return { ok: true, inputs, endTick };
}

export function check(attemptSeed: string, events: unknown, elapsedMs?: number): Verdict {
  const p = parseTrace(events);
  if (!p.ok) return p;
  // el último evento puede ser el que termina el octavo vaso en el mismo tick de fin
  const r = simulate(attemptSeed, p.inputs, p.endTick + 1);
  if (!r.actionsOk) return { ok: false, reason: r.reason ?? "acciones inválidas" };
  if (r.finished && r.endTick !== p.endTick) return { ok: false, reason: "el tick de fin no es el del octavo vaso" };
  if (!r.finished && p.inputs.some((e) => e.tick >= p.endTick)) return { ok: false, reason: "acción después del final" };
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(p.endTick, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: r.score, endTick: p.endTick, results: r.results, finished: r.finished };
}

/** el puntaje es el total recalculado, exacto */
export function validate(result: { score: number; events: unknown[] }, attemptSeed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(attemptSeed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// jugadores automáticos (calibración, tests, E2E)
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** cuántas filas antes de la raya apunta (positivo: queda corto a propósito) */
  marginRows?: number;
  /** demora en ticks entre decidir soltar y soltar */
  delayTicks?: number;
  /** error al azar en ticks sobre el momento de soltar (uniforme ±) */
  jitterTicks?: number;
  botSeed?: string;
  /** apretar tantos ticks después de que empieza cada vaso */
  pressAfter?: number;
  /** parar después de tantos vasos */
  maxGlasses?: number;
}

/** juega una partida: aprieta al empezar cada vaso y suelta cuando la espuma predicha llega a la raya menos el margen */
export function botTrace(seed: string, opts: BotOptions = {}): { events: TraceEvent[]; result: Replay } {
  const s = initialState(seed);
  const rng = rngFromSeed(`bot:${opts.botSeed ?? seed}`);
  const inputs: PourEvent[] = [];
  const margin = (opts.marginRows ?? 0) * SUB;
  const delay = opts.delayTicks ?? 0;
  const jitter = opts.jitterTicks ?? 0;
  const pressAfter = opts.pressAfter ?? 12;
  let releaseAt = -1;
  while (!s.end && s.tick < END_TICK) {
    const c = s.current!;
    if (opts.maxGlasses !== undefined && c.index >= opts.maxGlasses) break;
    if (s.phase === "pour") {
      if (c.downTick < 0 && s.tick - c.startTick >= pressAfter) {
        applyAction(s, "down");
        inputs.push({ tick: s.tick, action: "down" });
        releaseAt = -1;
      } else if (c.pressed) {
        if (releaseAt < 0) {
          const top = predictTop(s);
          if (top !== null && top >= lineLevel(s) - margin) releaseAt = s.tick + delay + (jitter > 0 ? Math.floor(rng.next() * (2 * jitter + 1)) - jitter : 0);
        }
        if (releaseAt >= 0 && s.tick >= releaseAt) {
          applyAction(s, "up");
          inputs.push({ tick: s.tick, action: "up" });
        }
      }
    }
    step(s);
  }
  const endTick = endTickOf(s);
  return { events: [...inputs, { tick: endTick, fin: true }], result: { score: s.score, results: s.results, endTick, finished: !!s.end, state: s, actionsOk: true, reason: null } };
}
