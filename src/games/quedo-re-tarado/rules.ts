// Las reglas de "quedó re tarado", puras y compartidas por el cliente y el
// servidor: puntaje, validación de la traza y el registro de punteros que
// hace valer "un solo dedo".

export const TAPS_TO_FINISH = 200;
export const DURATION_MS = 40_000;
/** margen sobre la duración para el último toque */
export const END_SLACK_MS = 2_000;
/** un solo dedo no toca dos veces en menos de esto */
export const MIN_GAP_MS = 35;
/** ventana de intervalos seguidos para medir el ritmo */
export const RHYTHM_WINDOW = 30;
/** desvío estándar mínimo (ms) del ritmo humano en esa ventana */
export const MIN_RHYTHM_STD_MS = 4;
/** puntos por toque que faltó, para quien no terminó */
export const MISSING_TAP_MS = 100;
export const MIN_SCORE = 11_000;
export const MAX_SCORE = DURATION_MS + TAPS_TO_FINISH * MISSING_TAP_MS;

export type TapEvent = { t: number };

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
  const taps: TapEvent[] = [];
  let last = -1;
  const gaps: number[] = [];
  for (const raw of events) {
    if (!raw || typeof raw !== "object" || !Number.isFinite((raw as TapEvent).t)) return { ok: false, reason: "toque mal armado" };
    const t = (raw as TapEvent).t;
    if (t < 0 || t < last) return { ok: false, reason: "tiempos fuera de orden" };
    if (t > DURATION_MS + END_SLACK_MS) return { ok: false, reason: "toque después del final" };
    if (last >= 0) {
      const gap = t - last;
      if (gap < MIN_GAP_MS) return { ok: false, reason: "dos toques demasiado seguidos" };
      gaps.push(gap);
    }
    last = t;
    taps.push({ t });
  }
  if (tooRegular(gaps)) return { ok: false, reason: "ritmo demasiado parejo" };
  // el cronómetro corta a los 40 s: el toque 200 no puede caer después. El
  // margen de END_SLACK_MS es solo para los últimos toques de quien no terminó.
  if (taps.length >= TAPS_TO_FINISH && taps[TAPS_TO_FINISH - 1]!.t > DURATION_MS) return { ok: false, reason: "terminó después del final" };
  return { ok: true, score: scoreFor(taps) };
}

/** ¿hay una ventana de RHYTHM_WINDOW intervalos seguidos con desvío menor al mínimo? */
export function tooRegular(gaps: readonly number[]): boolean {
  for (let i = 0; i + RHYTHM_WINDOW <= gaps.length; i++) {
    if (stdDev(gaps.slice(i, i + RHYTHM_WINDOW)) < MIN_RHYTHM_STD_MS) return true;
  }
  return false;
}

export function stdDev(values: readonly number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
}

/** el punto de extensión del contrato: recalcula y compara */
export function validate(result: { score: number; events: unknown[] }): boolean {
  const v = simulate(result.events);
  return v.ok && v.score === result.score;
}

/** Para tests y E2E: intervalos humanos al azar entre `min` y `max` ms. */
export function humanTrace(n: number, rand: () => number = Math.random, min = 55, max = 160, start = 400): TapEvent[] {
  const events: TapEvent[] = [];
  let t = start;
  for (let i = 0; i < n; i++) {
    events.push({ t: Math.round(t) });
    t += min + rand() * (max - min);
  }
  return events;
}

// ---------------------------------------------------------------------------
// un solo dedo: cuenta el pointerdown solo si no hay otro puntero apretado
// ---------------------------------------------------------------------------

export interface PointerTracker {
  /** devuelve true si el toque cuenta */
  down(pointerId: number): boolean;
  up(pointerId: number): void;
  cancel(pointerId: number): void;
  readonly active: number;
}

export function createPointerTracker(): PointerTracker {
  const active = new Set<number>();
  return {
    down(id) {
      const counts = active.size === 0;
      active.add(id);
      return counts;
    },
    up(id) {
      active.delete(id);
    },
    cancel(id) {
      active.delete(id);
    },
    get active() {
      return active.size;
    },
  };
}
