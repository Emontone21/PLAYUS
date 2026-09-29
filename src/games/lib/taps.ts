// Toques con un solo dedo y los controles contra autoclickers, compartidos
// por los juegos de tocar ("quedó re tarado", "la parrilla del bro"):
// - un registro de punteros que cuenta un pointerdown solo si no hay otro
//   puntero apretado;
// - la revisión de una traza de toques `{ t }`: forma, orden, un intervalo
//   mínimo entre toques y un ritmo que no sea demasiado parejo.

export type TapEvent = { t: number };

/** un solo dedo no toca dos veces en menos de esto */
export const MIN_GAP_MS = 35;
/** ventana de intervalos seguidos para medir el ritmo */
export const RHYTHM_WINDOW = 30;
/** desvío estándar mínimo (ms) del ritmo humano en esa ventana */
export const MIN_RHYTHM_STD_MS = 4;

export type TapsShape = { ok: true; taps: TapEvent[]; gaps: number[] } | { ok: false; reason: string };

/**
 * Revisa la forma de una traza de toques: cada uno con `t` finito, en orden,
 * ninguno después de `maxT`, a MIN_GAP_MS o más del anterior, y sin una
 * ventana de RHYTHM_WINDOW intervalos demasiado pareja.
 */
export function parseTaps(events: unknown, maxT: number): TapsShape {
  if (!Array.isArray(events)) return { ok: false, reason: "traza mal armada" };
  const taps: TapEvent[] = [];
  const gaps: number[] = [];
  let last = -1;
  for (const raw of events) {
    if (!raw || typeof raw !== "object" || !Number.isFinite((raw as TapEvent).t)) return { ok: false, reason: "toque mal armado" };
    const t = (raw as TapEvent).t;
    if (t < 0 || t < last) return { ok: false, reason: "tiempos fuera de orden" };
    if (t > maxT) return { ok: false, reason: "toque después del final" };
    if (last >= 0) {
      const gap = t - last;
      if (gap < MIN_GAP_MS) return { ok: false, reason: "dos toques demasiado seguidos" };
      gaps.push(gap);
    }
    last = t;
    taps.push({ t });
  }
  if (tooRegular(gaps)) return { ok: false, reason: "ritmo demasiado parejo" };
  return { ok: true, taps, gaps };
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
