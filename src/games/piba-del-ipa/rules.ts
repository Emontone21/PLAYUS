// Las reglas de la partida, puras, compartidas por el cliente (para jugar) y
// por el servidor (para validar la traza). Cualquier diferencia entre los dos
// sería un puntaje rechazado, así que viven en un solo lugar.

import { generateMap, personAt, pibaTarget, type GameMap } from "./map";

export const DURATION_MS = 60_000;
/** después de tocar a otra persona o al fondo: sin poder tocar */
export const PENALTY_MS = 2_000;
/** al aparecer un mapa (también el primero), el cliente no toma toques */
export const MAP_START_LOCK_MS = 500;
/** un acierto antes de esto desde que se mostró el mapa es imposible para un humano */
export const MIN_HIT_MS = 400;
/** margen sobre la duración para el último toque */
export const END_SLACK_MS = 2_000;
export const MAX_SCORE = 40;

export type TapEvent = { t: number; map: number; x: number; y: number };

export type TapOutcome = "acierto" | "error" | "ignorado";

export interface SimState {
  map: number;
  score: number;
  /** t en que se mostró el mapa actual */
  shownAt: number;
  /** hasta cuándo se ignoran los toques por penalización */
  lockedUntil: number;
}

export function initialState(): SimState {
  return { map: 1, score: 0, shownAt: 0, lockedUntil: 0 };
}

/**
 * Aplica un toque al estado. `maps(i)` devuelve el mapa i (memoizado por
 * quien llama). Devuelve el resultado del toque; muta el estado.
 */
export function applyTap(state: SimState, ev: TapEvent, maps: (i: number) => GameMap): TapOutcome {
  if (ev.t < state.lockedUntil || ev.t < state.shownAt + MAP_START_LOCK_MS) return "ignorado";
  const map = maps(state.map);
  const hit = personAt(map, ev.x, ev.y);
  if (hit && hit.role === "piba") {
    state.score += 1;
    state.map += 1;
    state.shownAt = ev.t;
    return "acierto";
  }
  state.lockedUntil = ev.t + PENALTY_MS;
  return "error";
}

export type Verdict = { ok: true; score: number } | { ok: false; reason: string };

/** Recorre la traza con las mismas reglas que el cliente. */
export function simulate(attemptSeed: string, events: unknown): Verdict {
  if (!Array.isArray(events)) return { ok: false, reason: "traza mal armada" };
  const cache = new Map<number, GameMap>();
  const maps = (i: number) => {
    let m = cache.get(i);
    if (!m) {
      m = generateMap(attemptSeed, i);
      cache.set(i, m);
    }
    return m;
  };
  const state = initialState();
  let last = -1;
  for (const raw of events) {
    if (!isTap(raw)) return { ok: false, reason: "toque mal armado" };
    if (raw.t < 0 || raw.t < last) return { ok: false, reason: "tiempos fuera de orden" };
    if (raw.t > DURATION_MS + END_SLACK_MS) return { ok: false, reason: "toque después del final" };
    if (raw.map !== state.map) return { ok: false, reason: "el toque no corresponde al mapa en curso" };
    last = raw.t;
    // un acierto antes de MIN_HIT_MS desde que se mostró el mapa se rechaza,
    // aunque el bloqueo lo hubiera ignorado
    const wouldHit = personAt(maps(state.map), raw.x, raw.y)?.role === "piba";
    if (wouldHit && raw.t - state.shownAt < MIN_HIT_MS && raw.t >= state.lockedUntil) {
      return { ok: false, reason: "acierto demasiado rápido" };
    }
    applyTap(state, raw, maps);
    if (state.score > MAX_SCORE) return { ok: false, reason: "más aciertos que el tope" };
  }
  return { ok: true, score: state.score };
}

function isTap(v: unknown): v is TapEvent {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    Number.isFinite(o.t) && Number.isInteger(o.map) && Number.isInteger(o.x) && Number.isInteger(o.y) && (o.map as number) >= 1
  );
}

/** El punto de extensión del contrato: recalcula y compara. */
export function validate(result: { score: number; events: unknown[] }, attemptSeed: string): boolean {
  const v = simulate(attemptSeed, result.events);
  return v.ok && v.score === result.score;
}

/** Para tests y E2E: una traza legítima que encuentra a la piba `hits` veces. */
export function legitTrace(attemptSeed: string, hits: number, opts: { gapMs?: number; misses?: number } = {}): TapEvent[] {
  const gap = opts.gapMs ?? 900;
  const events: TapEvent[] = [];
  let t = 0;
  for (let map = 1; map <= hits; map++) {
    const m = generateMap(attemptSeed, map);
    const target = pibaTarget(m);
    for (let i = 0; i < (opts.misses ?? 0); i++) {
      // un error: tocar el fondo lejos de todos y esperar la penalización
      t += gap;
      events.push({ t, map, x: 0, y: 0 });
      t += PENALTY_MS;
    }
    t += gap;
    events.push({ t, map, x: target.x, y: target.y });
  }
  return events;
}
