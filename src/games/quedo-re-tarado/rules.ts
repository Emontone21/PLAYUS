// Las reglas de "quedó re tarado", puras y compartidas por el cliente y el
// servidor: puntaje y validación de la traza. El registro de punteros de "un
// solo dedo" y los controles contra autoclickers (intervalo mínimo y ritmo
// demasiado parejo) viven en games/lib/taps y los comparte la parrilla.

import { createPointerTracker, humanTrace, MIN_GAP_MS, MIN_RHYTHM_STD_MS, parseTaps, RHYTHM_WINDOW, stdDev, tooRegular, type PointerTracker, type TapEvent } from "../lib/taps";

export { createPointerTracker, humanTrace, MIN_GAP_MS, MIN_RHYTHM_STD_MS, RHYTHM_WINDOW, stdDev, tooRegular, type PointerTracker, type TapEvent };

export const TAPS_TO_FINISH = 200;
export const DURATION_MS = 40_000;
/** margen sobre la duración para el último toque */
export const END_SLACK_MS = 2_000;
/** puntos por toque que faltó, para quien no terminó */
export const MISSING_TAP_MS = 100;
export const MIN_SCORE = 11_000;
export const MAX_SCORE = DURATION_MS + TAPS_TO_FINISH * MISSING_TAP_MS;

/** el puntaje que sale de una traza (sección 3 del documento) */
export function scoreFor(events: readonly TapEvent[]): number {
  if (events.length >= TAPS_TO_FINISH) return events[TAPS_TO_FINISH - 1]!.t;
  return DURATION_MS + (TAPS_TO_FINISH - events.length) * MISSING_TAP_MS;
}

export function finished(events: readonly TapEvent[]): boolean {
  return events.length >= TAPS_TO_FINISH;
}

export type Verdict = { ok: true; score: number } | { ok: false; reason: string };

export function simulate(events: unknown): Verdict {
  if (!Array.isArray(events)) return { ok: false, reason: "traza mal armada" };
  if (events.length > TAPS_TO_FINISH) return { ok: false, reason: "más de 200 toques" };
  const shape = parseTaps(events, DURATION_MS + END_SLACK_MS);
  if (!shape.ok) return shape;
  const taps = shape.taps;
  // el cronómetro corta a los 40 s: el toque 200 no puede caer después. El
  // margen de END_SLACK_MS es solo para los últimos toques de quien no terminó.
  if (taps.length >= TAPS_TO_FINISH && taps[TAPS_TO_FINISH - 1]!.t > DURATION_MS) return { ok: false, reason: "terminó después del final" };
  return { ok: true, score: scoreFor(taps) };
}

/** el punto de extensión del contrato: recalcula y compara */
export function validate(result: { score: number; events: unknown[] }): boolean {
  const v = simulate(result.events);
  return v.ok && v.score === result.score;
}
