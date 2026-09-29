// El cronograma del canario: una función pura, sin DOM, que sale entera de
// la semilla del intento y cubre los 90 segundos sin huecos ni
// superposiciones. Todo el grupo ve el mismo patrón en el mismo número de
// intento. Los segmentos se interpretan como [start, end).

import { rngFromSeed, type Rng } from "../../lib/rng";

export const DURATION_MS = 90_000;
/** sin amagues antes de esto, para que se entienda la mecánica */
export const NO_FEINT_BEFORE_MS = 10_000;
/** el aviso nunca baja de esto: menos que el tiempo de reacción humano ya no es habilidad */
export const MIN_WARNING_MS = 300;

export type CanarioState = "espaldas" | "aviso" | "girando" | "mirando" | "volviendo" | "amague";

export interface Segment {
  start: number;
  end: number;
  state: CanarioState;
}

/** ¿se puede tocar en este estado? */
export function isSafe(state: CanarioState): boolean {
  return state === "espaldas" || state === "aviso" || state === "amague";
}

/** una fila de la tabla de dificultad (ms y por mil) */
export interface DifficultyRow {
  at: number;
  backMin: number;
  backMax: number;
  warning: number;
  turn: number;
  lookMin: number;
  lookMax: number;
  /** probabilidad de amague, en milésimas */
  feint: number;
}

/**
 * La tabla del documento traía las filas a los 0, 10, 45 y 90 s; con un
 * jugador simulado la partida típica pasaba de los 60 s, así que las dos
 * últimas se adelantaron a los 30 y 60 s (decisión 147). Desde los 60 s queda
 * plana.
 */
export const DIFFICULTY: readonly DifficultyRow[] = [
  { at: 0, backMin: 2500, backMax: 4000, warning: 700, turn: 350, lookMin: 1500, lookMax: 2500, feint: 0 },
  { at: 10_000, backMin: 2000, backMax: 3500, warning: 600, turn: 300, lookMin: 1500, lookMax: 2500, feint: 100 },
  { at: 30_000, backMin: 1200, backMax: 2200, warning: 400, turn: 200, lookMin: 1000, lookMax: 2000, feint: 250 },
  { at: 60_000, backMin: 800, backMax: 1600, warning: 300, turn: 150, lookMin: 1000, lookMax: 1800, feint: 300 },
];

function lerpInt(a: number, b: number, num: number, den: number): number {
  return a + Math.floor(((b - a) * num) / den);
}

/** la fila interpolada para el instante `t` (ms) */
export function difficultyAt(t: number): Omit<DifficultyRow, "at"> {
  const clamped = Math.max(0, Math.min(t, DIFFICULTY[DIFFICULTY.length - 1]!.at));
  let i = 0;
  while (i < DIFFICULTY.length - 2 && clamped >= DIFFICULTY[i + 1]!.at) i++;
  const a = DIFFICULTY[i]!;
  const b = DIFFICULTY[i + 1]!;
  const num = clamped - a.at;
  const den = b.at - a.at;
  const row = {
    backMin: lerpInt(a.backMin, b.backMin, num, den),
    backMax: lerpInt(a.backMax, b.backMax, num, den),
    warning: Math.max(MIN_WARNING_MS, lerpInt(a.warning, b.warning, num, den)),
    turn: lerpInt(a.turn, b.turn, num, den),
    lookMin: lerpInt(a.lookMin, b.lookMin, num, den),
    lookMax: lerpInt(a.lookMax, b.lookMax, num, den),
    feint: t < NO_FEINT_BEFORE_MS ? 0 : lerpInt(a.feint, b.feint, num, den),
  };
  return row;
}

/** cuánto dura el aviso (y el amague, que es idéntico) si empieza en `t` */
export function warningAt(t: number): number {
  return difficultyAt(t).warning;
}

/**
 * Genera el cronograma entero. Cada ciclo: de espaldas un rato, y después o
 * bien un amague (el mismo gesto que el aviso, y sigue de espaldas) o bien
 * aviso → girando → mirando → volviendo. Las duraciones salen de la fila
 * interpolada en el instante en que empieza cada segmento.
 */
export function canarioTimeline(attemptSeed: string): Segment[] {
  const rng = rngFromSeed(`${attemptSeed}:canario`);
  const out: Segment[] = [];
  let t = 0;
  const push = (state: CanarioState, ms: number) => {
    if (t >= DURATION_MS) return;
    const end = Math.min(DURATION_MS, t + Math.max(1, ms));
    out.push({ start: t, end, state });
    t = end;
  };
  while (t < DURATION_MS) {
    const d = difficultyAt(t);
    push("espaldas", rng.int(d.backMin, d.backMax));
    if (t >= DURATION_MS) break;
    const w = difficultyAt(t);
    if (rng.int(0, 999) < w.feint) {
      push("amague", w.warning);
      continue;
    }
    push("aviso", w.warning);
    const g = difficultyAt(t);
    push("girando", g.turn);
    const m = difficultyAt(t);
    push("mirando", rng.int(m.lookMin, m.lookMax));
    push("volviendo", difficultyAt(t).turn);
  }
  return out;
}

/** el segmento vigente en `t` ([start, end)); null fuera del cronograma */
export function segmentAt(timeline: readonly Segment[], t: number): Segment | null {
  let lo = 0;
  let hi = timeline.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = timeline[mid]!;
    if (t < s.start) hi = mid - 1;
    else if (t >= s.end) lo = mid + 1;
    else return s;
  }
  return null;
}

export function stateAt(timeline: readonly Segment[], t: number): CanarioState | null {
  return segmentAt(timeline, t)?.state ?? null;
}

/** para los bots y los E2E: los tramos seguros del cronograma */
export function safeSegments(timeline: readonly Segment[]): Segment[] {
  return timeline.filter((s) => isSafe(s.state));
}

/** la primera semilla auxiliar, para tests que quieran un rng distinto */
export function rngFor(seed: string): Rng {
  return rngFromSeed(seed);
}
