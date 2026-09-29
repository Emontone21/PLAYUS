// Las reglas de "pegándole al jota", puras y compartidas por el cliente y el
// servidor: qué es acertar, cuánto tarda cada cosa y la validación de la
// traza, que rearma la serie con la semilla y revisa respuestas y tiempos.

import { digitsFor, DURATION_MS, isSubstance, jotaRounds, type JotaRound } from "./rounds";

export { DURATION_MS };

/** la pausa del "joya" entre acertar y la pista siguiente */
export const ACCEPT_HOLD_MS = 900;
/** el jota enojado se ve un segundo antes del resultado */
export const ERROR_HOLD_MS = 1_000;
/** si pasan 15 s desde que se ocultó la pista sin responder, el jota dice "bro?" */
export const IMPATIENT_MS = 15_000;
/** margen sobre la duración para el último evento */
export const END_SLACK_MS = 2_000;
/** margen para los tiempos que arma el cliente con temporizadores (pausa + pista) */
export const TIMING_SLACK_MS = 400;

/** nadie escribe más rápido: 400 ms más 150 por cifra */
export function minAnswerMs(digits: number): number {
  return 400 + 150 * digits;
}

export interface AnswerEvent {
  round: number;
  /** ms desde onReady en que se ocultó la pista */
  hiddenAt: number;
  /** ms desde onReady en que tocó "pedir" */
  answeredAt: number;
  /** lo que escribió (solo cifras) */
  number: string;
  /** id de la sustancia elegida */
  substance: string;
}

export function isCorrect(round: JotaRound, number: string, substance: string): boolean {
  return number === String(round.number) && substance === round.substance;
}

/**
 * Cota superior de rondas en 180 s: cada ronda tarda al menos la pista, el
 * mínimo de respuesta y la pausa del acierto. Es el maxPlausibleScore.
 */
export function maxRounds(): number {
  let t = 0;
  let n = 0;
  for (let r = 1; ; r++) {
    const display = Math.max(700, 3000 - 200 * (r - 1));
    t += display + minAnswerMs(digitsFor(r));
    if (t > DURATION_MS + END_SLACK_MS) return n;
    n++;
    t += ACCEPT_HOLD_MS;
  }
}
export const MAX_SCORE = maxRounds();

export type Verdict = { ok: true; score: number; endedByError: boolean } | { ok: false; reason: string };

/** Revisa la forma de la traza y la compara con la serie de la semilla. */
export function check(attemptSeed: string, events: unknown, series = jotaRounds(attemptSeed)): Verdict {
  if (!Array.isArray(events)) return { ok: false, reason: "traza mal armada" };
  if (events.length > series.length) return { ok: false, reason: "más rondas que la serie" };
  let score = 0;
  let failed = false;
  let prev: AnswerEvent | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i] as Partial<AnswerEvent> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.round) || !Number.isFinite(e.hiddenAt) || !Number.isFinite(e.answeredAt) || typeof e.number !== "string" || typeof e.substance !== "string") {
      return { ok: false, reason: "evento mal armado" };
    }
    const ev = e as AnswerEvent;
    if (failed) return { ok: false, reason: "eventos después de un error" };
    if (ev.round !== i + 1) return { ok: false, reason: "rondas no consecutivas" };
    const round = series[i]!;
    if (ev.hiddenAt < 0 || ev.answeredAt < ev.hiddenAt || (prev && ev.hiddenAt < prev.answeredAt)) return { ok: false, reason: "tiempos fuera de orden" };
    if (ev.answeredAt > DURATION_MS + END_SLACK_MS) return { ok: false, reason: "respuesta después del final" };
    if (ev.answeredAt - ev.hiddenAt < minAnswerMs(round.digits)) return { ok: false, reason: "respuesta demasiado rápida" };
    // la pista se ocultó cuando tenía que ocultarse: la pausa del acierto anterior más su displayMs
    const expectedHidden = (prev ? prev.answeredAt + ACCEPT_HOLD_MS : 0) + round.displayMs;
    if (Math.abs(ev.hiddenAt - expectedHidden) > TIMING_SLACK_MS) return { ok: false, reason: "la pista no se ocultó cuando debía" };
    if (isCorrect(round, ev.number, isSubstance(ev.substance) ? ev.substance : "")) score++;
    else failed = true;
    prev = ev;
  }
  return { ok: true, score, endedByError: failed };
}

/** El punto de extensión del contrato: rearma la serie y compara. */
export function validate(result: { score: number; events: unknown[] }, attemptSeed: string): boolean {
  const v = check(attemptSeed, result.events);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// para tests y E2E: una partida simulada
// ---------------------------------------------------------------------------

/**
 * Arma una traza honesta: acierta `correct` rondas (respondiendo a
 * `answerMs(digits)` de ocultarse la pista) y, si `thenWrong`, erra la
 * siguiente en el número o en la sustancia.
 */
export function playedTrace(series: readonly JotaRound[], correct: number, opts: { thenWrong?: "numero" | "sustancia" | null; answerMs?: (digits: number) => number } = {}): AnswerEvent[] {
  const answerMs = opts.answerMs ?? ((d) => minAnswerMs(d) + 600 + 120 * d);
  const out: AnswerEvent[] = [];
  let t = 0;
  const total = correct + (opts.thenWrong ? 1 : 0);
  for (let i = 0; i < total && i < series.length; i++) {
    const r = series[i]!;
    const hiddenAt = t + r.displayMs;
    const answeredAt = hiddenAt + answerMs(r.digits);
    const wrong = i === correct;
    const number = wrong && opts.thenWrong === "numero" ? String(r.number === 24 ? 42 : r.number + 1) : String(r.number);
    const substance = wrong && opts.thenWrong === "sustancia" ? (r.substance === "merca" ? "tussi" : "merca") : r.substance;
    out.push({ round: r.round, hiddenAt, answeredAt, number, substance });
    t = answeredAt + ACCEPT_HOLD_MS;
  }
  return out;
}
