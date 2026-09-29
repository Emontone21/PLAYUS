// Las reglas de "la parrilla del bro", puras y compartidas por el cliente y
// el servidor: qué toque cuenta, cuándo te ven y la validación de la traza
// (que rearma el cronograma con la semilla y lo recorre). Los controles
// contra autoclickers son los de games/lib/taps, compartidos con el tarado.

import { MIN_GAP_MS, parseTaps, type TapEvent } from "../lib/taps";
import { canarioTimeline, DURATION_MS, isSafe, stateAt, type CanarioState, type Segment } from "./timeline";

export type { TapEvent };
export { DURATION_MS };

/** margen sobre la duración para los últimos toques de quien terminó por tiempo */
export const END_SLACK_MS = 2_000;
/** cota gruesa: si todo el cronograma fuera seguro, al ritmo máximo que pasa el filtro de intervalo */
export const MAX_SCORE = Math.floor(DURATION_MS / MIN_GAP_MS);

export type EndReason = "visto" | "tiempo";

export interface Outcome {
  score: number;
  /** el estado en que cayó el toque que terminó la partida, si lo hubo */
  seenIn: CanarioState | null;
  endReason: EndReason;
}

/**
 * Recorre los toques sobre el cronograma: cuenta los seguros hasta el primer
 * toque peligroso (que termina la partida). Los toques desde los 90 s no
 * cuentan (el cronómetro ya cortó).
 */
export function outcomeOf(timeline: readonly Segment[], taps: readonly TapEvent[]): Outcome & { dangerousIndex: number } {
  let score = 0;
  for (let i = 0; i < taps.length; i++) {
    const t = taps[i]!.t;
    if (t >= DURATION_MS) continue;
    const state = stateAt(timeline, t)!;
    if (isSafe(state)) score++;
    else return { score, seenIn: state, endReason: "visto", dangerousIndex: i };
  }
  return { score, seenIn: null, endReason: "tiempo", dangerousIndex: -1 };
}

export type Verdict = ({ ok: true } & Outcome) | { ok: false; reason: string };

/** Revisa la forma de la traza y la vuelve a jugar sobre el cronograma de la semilla. */
export function check(attemptSeed: string, events: unknown, timeline = canarioTimeline(attemptSeed)): Verdict {
  const shape = parseTaps(events, DURATION_MS + END_SLACK_MS);
  if (!shape.ok) return shape;
  const o = outcomeOf(timeline, shape.taps);
  // si te vieron, ahí terminó: no puede haber toques después
  if (o.dangerousIndex >= 0 && o.dangerousIndex !== shape.taps.length - 1) return { ok: false, reason: "toques después de que te vieron" };
  return { ok: true, score: o.score, seenIn: o.seenIn, endReason: o.endReason };
}

/** El punto de extensión del contrato: rearma el cronograma y compara. */
export function validate(result: { score: number; events: unknown[] }, attemptSeed: string): boolean {
  const v = check(attemptSeed, result.events);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// bots: para los tests, los E2E y la calibración
// ---------------------------------------------------------------------------

/**
 * Toca a ritmo humano solo en los tramos seguros, y si `seenAt` es un
 * instante, toca ahí (peligroso) y termina. Los intervalos vienen de `rand`.
 */
export function safeTrace(timeline: readonly Segment[], rand: () => number, opts: { min?: number; max?: number; until?: number; seenAt?: number | null } = {}): TapEvent[] {
  const min = opts.min ?? 90;
  const max = opts.max ?? 220;
  const until = opts.until ?? DURATION_MS;
  const out: TapEvent[] = [];
  let t = 300;
  for (const s of timeline) {
    if (!isSafe(s.state)) continue;
    if (s.start >= until) break;
    if (t < s.start) t = s.start + Math.round(rand() * 40);
    // deja de tocar un poco antes de que termine el tramo seguro (reacciona al aviso)
    const stop = Math.min(s.end - 1, until);
    while (t <= stop) {
      out.push({ t: Math.round(t) });
      t += min + rand() * (max - min);
    }
  }
  if (opts.seenAt !== undefined && opts.seenAt !== null) {
    const last = out.length ? out[out.length - 1]!.t : 0;
    out.push({ t: Math.max(opts.seenAt, last + MIN_GAP_MS) });
  }
  return out;
}
