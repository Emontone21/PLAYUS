// Reglas de "Barakatututu": El negro toto toca un patrón en su tambor y hay
// que repetirlo tocando la pantalla con el mismo tiempo. Cada ronda es más
// larga y más rápida; errar (adelantarse, atrasarse, un golpe de menos o de
// más) termina la partida. Sin sonido: todo se ve en la lonja y en la regla
// del compás. Los patrones salen de la semilla del intento (`candombeRounds`)
// encadenando frases de una biblioteca escrita a mano, SIMPLIFICACIONES
// INSPIRADAS en los toques del candombe (la madera, el chico, el repique y el
// piano), no transcripciones exactas (decisión 272). La partida es una
// máquina de estados en ms desde onReady, la misma en el cliente y en
// `validate`, que rearma los patrones, el horario de cada tramo y la
// corrección por dispositivo, y juzga cada golpe igual. Sin DOM.

import { rngFromSeed } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const DURATION_MS = 180_000;
/** margen chico después de los 180 s (el reloj del juego y el del contenedor no son el mismo) */
export const END_MARGIN_MS = 500;
/** el margen "medio": cada golpe esperado tiene una ventana de ± esto */
export const WINDOW_MS = 85;
/** la corrección por dispositivo nunca pasa de ± esto */
export const CORRECTION_MAX_MS = 60;
/** cuántos toques de ajuste hay, uno por pulso de la cuenta */
export const CALIBRATION_TAPS = 4;
/** "¡eso, mano!" o el final se ven esto */
export const RESULT_MS = 800;
/** al errar, El negro toto enojado se ve esto antes de onFinish */
export const FAIL_HOLD_MS = 1_000;
export const ELAPSED_SLACK_MS = 10_000;
/** semicorcheas por compás */
export const STEPS = 16;
/** rondas generadas de sobra (las que sigan se generan igual) */
export const ROUND_COUNT = 40;

// ---------------------------------------------------------------------------
// la biblioteca de frases (un compás cada una, en semicorcheas: 0 a 15)
// ---------------------------------------------------------------------------

export type Figure = "negras" | "corcheas" | "semicorcheas" | "contratiempos" | "madera";

export interface Phrase {
  name: string;
  /** de qué toque está inspirada (simplificación, no transcripción) */
  about: string;
  figure: Figure;
  hits: number[];
}

/**
 * Simplificaciones inspiradas en el candombe: la madera (la clave que se toca
 * en el casco del tambor), y toques reducidos del chico (agudo, de
 * contratiempo), el repique (frases sincopadas) y el piano (grave, base en los
 * tiempos). No son transcripciones: son frases cortas para repetir con un dedo.
 */
export const LIBRARY: readonly Phrase[] = [
  { name: "piano en los tiempos", about: "la base del piano, un golpe por pulso", figure: "negras", hits: [0, 4, 8, 12] },
  { name: "piano en tres", about: "el piano que deja el cuarto tiempo en silencio", figure: "negras", hits: [0, 4, 8] },
  { name: "piano con corchea", about: "el piano con un golpe de pasada antes del tercero", figure: "corcheas", hits: [0, 4, 6, 8, 12] },
  { name: "piano que arrastra", about: "el piano que adelanta el cuarto tiempo", figure: "corcheas", hits: [0, 4, 8, 10, 12] },
  { name: "chico sencillo", about: "el chico, agudo, después de cada tiempo", figure: "semicorcheas", hits: [0, 3, 4, 8, 11, 12] },
  { name: "chico apurado", about: "el chico que mete dos de pasada", figure: "semicorcheas", hits: [0, 4, 7, 8, 12, 15] },
  { name: "chico al aire", about: "el chico en los contratiempos", figure: "contratiempos", hits: [2, 6, 8, 10, 14] },
  { name: "repique suelto", about: "el repique que sale en el contratiempo y vuelve", figure: "contratiempos", hits: [0, 2, 6, 10, 12, 14] },
  { name: "madera", about: "la clave del candombe: tres golpes y dos", figure: "madera", hits: [0, 3, 6, 8, 11, 13] },
  { name: "madera cerrada", about: "la madera que termina en el cuarto tiempo", figure: "madera", hits: [0, 3, 6, 8, 10, 12] },
  { name: "repique madera", about: "el repique encima de la madera, sincopado", figure: "madera", hits: [1, 3, 6, 8, 11, 13, 15] },
  { name: "piano con repique", about: "el piano con el repique que contesta", figure: "madera", hits: [0, 3, 4, 7, 8, 12, 14] },
];

// ---------------------------------------------------------------------------
// la dificultad
// ---------------------------------------------------------------------------

export interface Row {
  from: number;
  bars: number;
  hits: [number, number];
  figures: readonly Figure[];
  bpm: number;
}
export const TABLE: readonly Row[] = [
  { from: 1, bars: 1, hits: [3, 4], figures: ["negras", "corcheas"], bpm: 95 },
  { from: 3, bars: 1, hits: [5, 6], figures: ["negras", "corcheas", "semicorcheas"], bpm: 105 },
  { from: 6, bars: 2, hits: [7, 9], figures: ["negras", "corcheas", "semicorcheas", "contratiempos"], bpm: 115 },
  { from: 9, bars: 2, hits: [10, 12], figures: ["corcheas", "semicorcheas", "contratiempos", "madera"], bpm: 125 },
  { from: 13, bars: 2, hits: [12, 14], figures: ["semicorcheas", "contratiempos", "madera"], bpm: 128 },
];
export function rowFor(round: number): Row {
  let r = TABLE[0]!;
  for (const row of TABLE) if (round >= row.from) r = row;
  return r;
}
/** el tempo: la tabla, y desde la 13 sube 3 bpm por ronda con tope en 140 */
export function bpmFor(round: number): number {
  if (round >= 13) return Math.min(140, 128 + (round - 13) * 3);
  return rowFor(round).bpm;
}

export interface Round {
  /** desde 1 */
  index: number;
  bpm: number;
  bars: number;
  /** las posiciones de los golpes en semicorcheas (16 por compás, los compases seguidos) */
  hits: number[];
  /** qué frases de la biblioteca se encadenaron */
  phrases: string[];
}

/** la ronda `index` (desde 1) de una semilla: frases de la biblioteca encadenadas según la tabla */
export function roundAt(seed: string, index: number): Round {
  const rng = rngFromSeed(`baraka:${seed}:${index}`);
  const row = rowFor(index);
  const pool = LIBRARY.filter((p) => row.figures.includes(p.figure));
  const fits = (ps: Phrase[]) => {
    const n = ps.reduce((a, p) => a + p.hits.length, 0);
    return n >= row.hits[0] && n <= row.hits[1];
  };
  let chosen: Phrase[] | null = null;
  for (let attempt = 0; attempt < 200 && !chosen; attempt++) {
    const ps = Array.from({ length: row.bars }, () => rng.pick(pool));
    if (fits(ps)) chosen = ps;
  }
  if (!chosen) {
    // no pasa con esta biblioteca (el test lo comprueba): la primera combinación que entra
    outer: for (const a of pool) {
      if (row.bars === 1) {
        if (fits([a])) {
          chosen = [a];
          break;
        }
        continue;
      }
      for (const b of pool) {
        if (fits([a, b])) {
          chosen = [a, b];
          break outer;
        }
      }
    }
  }
  const ps = chosen ?? [pool[0]!];
  const hits: number[] = [];
  ps.forEach((p, bar) => hits.push(...p.hits.map((h) => h + bar * STEPS)));
  return { index, bpm: bpmFor(index), bars: row.bars, hits, phrases: ps.map((p) => p.name) };
}

/** las primeras `count` rondas de la semilla del intento */
export function candombeRounds(seed: string, count = ROUND_COUNT): Round[] {
  return Array.from({ length: count }, (_, i) => roundAt(seed, i + 1));
}

/** ms por pulso y por compás a ese tempo */
export const beatMs = (bpm: number): number => 60_000 / bpm;
export const barMs = (bpm: number): number => (4 * 60_000) / bpm;
export const stepMs = (bpm: number): number => barMs(bpm) / STEPS;

// ---------------------------------------------------------------------------
// la partida (ms desde onReady)
// ---------------------------------------------------------------------------

export type Phase = "calibration" | "listen" | "count" | "turn" | "result" | "failed" | "over";

export type Judgement = "justo" | "casi" | "error";

export interface TurnMark {
  /** cuándo tocó (corregido) */
  t: number;
  /** a cuánto quedó del golpe esperado (ms, con signo), o null si no entró en ninguna ventana */
  diff: number | null;
  judgement: Judgement;
}

export interface Run {
  seed: string;
  t: number;
  phase: Phase;
  /** la ronda en curso, desde 0 */
  index: number;
  round: Round;
  /** cuándo empezó el tramo en curso */
  phaseStart: number;
  /** la calibración: el compás de la cuenta que se repite hasta juntar 4 toques */
  calibrationTaps: number[];
  /** la corrección por dispositivo (ms, se le resta a cada toque) */
  correction: number;
  /** cuándo empieza el turno (los golpes esperados se cuentan desde acá) */
  turnStart: number;
  /** qué golpes esperados ya se usaron */
  used: boolean[];
  /** las marcas de los toques del turno en curso */
  marks: TurnMark[];
  score: number;
  /** por qué terminó: null si no erró */
  fail: { reason: "adelantado" | "atrasado" | "de más" | "faltó"; t: number; round: number } | null;
  /** cuándo termina la partida (el error más lo que se ve, o los 180 s) */
  endT: number;
}

export function newRun(seed: string, firstRound = 1): Run {
  const round = roundAt(seed, firstRound);
  return { seed, t: 0, phase: "calibration", index: firstRound - 1, round, phaseStart: 0, calibrationTaps: [], correction: 0, turnStart: 0, used: [], marks: [], score: 0, fail: null, endT: DURATION_MS };
}

/** la duración de cada tramo de la ronda */
export function phaseMs(run: Run, phase: Phase): number {
  const r = run.round;
  if (phase === "listen") return r.bars * barMs(r.bpm);
  if (phase === "count" || phase === "calibration") return barMs(r.bpm);
  // tu turno: los compases más el margen; con una corrección positiva (el dispositivo registra tarde) el último golpe puede llegar más tarde en el reloj sin corregir
  if (phase === "turn") return r.bars * barMs(r.bpm) + WINDOW_MS + Math.max(0, run.correction);
  if (phase === "result") return RESULT_MS;
  return 0;
}

/** cuándo cae el golpe esperado `i` del turno */
export function expectedAt(run: Run, i: number): number {
  return run.turnStart + run.round.hits[i]! * stepMs(run.round.bpm);
}

/** la corrección: la mediana de las diferencias entre cada toque y su pulso, con tope */
export function correctionFrom(diffs: readonly number[]): number {
  if (diffs.length === 0) return 0;
  const s = [...diffs].sort((a, b) => a - b);
  const m = s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
  return Math.max(-CORRECTION_MAX_MS, Math.min(CORRECTION_MAX_MS, Math.round(m)));
}

/** el pulso de la cuenta más cercano a un instante (la cuenta se repite por compases desde phaseStart) */
function nearestPulse(run: Run, t: number): number {
  const b = beatMs(run.round.bpm);
  return run.phaseStart + Math.round((t - run.phaseStart) / b) * b;
}

function startPhase(run: Run, phase: Phase, at: number): void {
  run.phase = phase;
  run.phaseStart = at;
  if (phase === "turn") {
    run.turnStart = at;
    run.used = run.round.hits.map(() => false);
    run.marks = [];
  }
}

function failAt(run: Run, reason: NonNullable<Run["fail"]>["reason"], at: number): void {
  run.fail = { reason, t: at, round: run.index + 1 };
  run.phase = "failed";
  run.phaseStart = at;
  run.endT = Math.min(DURATION_MS, at + FAIL_HOLD_MS);
}

/** lleva la partida hasta el instante `t` (nunca para atrás) */
export function advance(run: Run, t: number): void {
  const target = Math.min(DURATION_MS, Math.max(run.t, t));
  for (;;) {
    if (run.phase === "failed" || run.phase === "over") break;
    if (run.phase === "calibration") {
      // se repite el compás hasta juntar los 4 toques; la ronda 1 arranca al final del compás del cuarto toque
      if (run.calibrationTaps.length >= CALIBRATION_TAPS) {
        const bar = barMs(run.round.bpm);
        const fourth = run.calibrationTaps[CALIBRATION_TAPS - 1]!;
        const end = run.phaseStart + Math.ceil((fourth - run.phaseStart + 1) / bar) * bar;
        if (end <= target) {
          startPhase(run, "listen", end);
          continue;
        }
      }
      break;
    }
    const end = run.phaseStart + phaseMs(run, run.phase);
    if (run.phase === "turn") {
      // una ventana que pasa sin tocar es error
      const i = run.used.indexOf(false);
      if (i >= 0 && expectedAt(run, i) + WINDOW_MS + run.correction < target) {
        failAt(run, "faltó", expectedAt(run, i) + WINDOW_MS + run.correction);
        continue;
      }
      if (end <= target) {
        run.score++;
        startPhase(run, "result", end);
        continue;
      }
      break;
    }
    if (end > target) break;
    if (run.phase === "listen") startPhase(run, "count", end);
    else if (run.phase === "count") startPhase(run, "turn", end);
    else if (run.phase === "result") {
      run.index++;
      run.round = roundAt(run.seed, run.index + 1);
      startPhase(run, "listen", end);
    }
  }
  run.t = target;
  if (run.phase !== "failed" && target >= DURATION_MS) run.phase = "over";
  if (run.phase === "failed" && target >= run.endT) run.phase = "over";
}

export type TapOutcome = "ajuste" | "bien" | "error" | "ignorado";

/** un toque en el instante `t` (sin corregir: la corrección se aplica acá) */
export function tap(run: Run, t: number): TapOutcome {
  advance(run, t);
  if (run.phase === "calibration") {
    if (run.calibrationTaps.length >= CALIBRATION_TAPS) return "ignorado";
    run.calibrationTaps.push(t);
    if (run.calibrationTaps.length === CALIBRATION_TAPS) run.correction = correctionFrom(run.calibrationTaps.map((tt) => tt - nearestPulse(run, tt)));
    return "ajuste";
  }
  if (run.phase !== "turn") return "ignorado";
  const tc = t - run.correction;
  // el primer golpe esperado sin usar cuya ventana lo contiene (las ventanas pueden solaparse: se juzga en orden)
  const next = run.used.indexOf(false);
  for (let i = next; i >= 0 && i < run.round.hits.length; i++) {
    if (run.used[i]) continue;
    const d = tc - expectedAt(run, i);
    if (Math.abs(d) <= WINDOW_MS) {
      run.used[i] = true;
      run.marks.push({ t: tc, diff: d, judgement: Math.abs(d) <= WINDOW_MS / 2 ? "justo" : "casi" });
      return "bien";
    }
    if (d < -WINDOW_MS) break;
  }
  run.marks.push({ t: tc, diff: null, judgement: "error" });
  // adelantado si vino antes del próximo golpe que faltaba; de más si ya no faltaba ninguno; si no, atrasado
  const reason = next < 0 ? "de más" : tc < expectedAt(run, next) - WINDOW_MS ? "adelantado" : "atrasado";
  failAt(run, reason, t);
  return "error";
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

export interface BeatEvent {
  t: number;
  phase: "calibration" | "turn";
  round: number;
}

export type CheckResult = { ok: true; score: number; run: Run } | { ok: false; reason: string };

function parseEvent(e: unknown): BeatEvent | null {
  if (!e || typeof e !== "object") return null;
  const { t, phase, round } = e as Record<string, unknown>;
  if (typeof t !== "number" || !Number.isInteger(t) || t < 0) return null;
  if (phase !== "calibration" && phase !== "turn") return null;
  if (typeof round !== "number" || !Number.isInteger(round) || round < 0) return null;
  return { t, phase, round };
}

/** rearma los patrones y el horario con la semilla, calcula la corrección con los 4 toques de ajuste y juzga cada golpe */
export function check(seed: string, events: unknown, elapsedMs?: number): CheckResult {
  if (!Array.isArray(events)) return { ok: false, reason: "la traza no es una lista" };
  const run = newRun(seed);
  let prevT = -1;
  let calibration = 0;
  for (const raw of events) {
    const e = parseEvent(raw);
    if (!e) return { ok: false, reason: "evento mal formado" };
    if (e.t < prevT) return { ok: false, reason: "tiempos fuera de orden" };
    if (e.t > DURATION_MS + END_MARGIN_MS) return { ok: false, reason: "toque después de los 180 s" };
    prevT = e.t;
    advance(run, e.t);
    if (run.phase === "failed" || run.phase === "over") return { ok: false, reason: run.phase === "failed" ? "toque después de un error" : "toque después del final" };
    if (e.phase === "calibration") {
      if (run.phase !== "calibration") return { ok: false, reason: "toque de ajuste fuera de la cuenta" };
      calibration++;
      if (calibration > CALIBRATION_TAPS) return { ok: false, reason: "más de 4 toques de ajuste" };
      tap(run, e.t);
      continue;
    }
    if (run.phase !== "turn") return { ok: false, reason: "toque de turno fuera de su tramo" };
    if (e.round !== run.index + 1) return { ok: false, reason: "la ronda no es la que corresponde" };
    tap(run, e.t);
  }
  if (calibration !== CALIBRATION_TAPS) return { ok: false, reason: "los toques de ajuste no son 4" };
  advance(run, DURATION_MS);
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(run.endT, 1000, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: run.score, run };
}

export function validate(result: { score: number; events: unknown[] }, seed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(seed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

/** la cota: cuántas rondas entran en 180 s con la calibración en un solo compás */
export function maxScore(): number {
  let t = barMs(bpmFor(1));
  let score = 0;
  for (let i = 1; ; i++) {
    const row = rowFor(i);
    const bar = barMs(bpmFor(i));
    const total = row.bars * bar + bar + row.bars * bar + WINDOW_MS;
    if (t + total > DURATION_MS) return score;
    score++;
    t += total + RESULT_MS;
  }
}
export const MAX_SCORE = maxScore();

// ---------------------------------------------------------------------------
// el jugador automático (calibración, herramienta y E2E)
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** demora fija del dispositivo (ms): todos los toques salen corridos esto */
  device?: number;
  /** desvío humano: cada toque se corre ±jitter (determinístico por semilla) */
  jitter?: number;
  /** pasa estas rondas y en la siguiente toca adelantado (erra); undefined: sigue hasta el final */
  failAt?: number;
  /** no pasa de este instante */
  untilMs?: number;
}

/** el jugador modelo (decisión 273): 25 ms de demora del dispositivo, ±55 ms de desvío que crece 4 ms por ronda */
export const MODEL: BotOptions = { device: 25, jitter: 55 };

export function botTrace(seed: string, opts: BotOptions = {}): { events: BeatEvent[]; run: Run } {
  const device = opts.device ?? 25;
  const jitter = opts.jitter ?? 55;
  const until = opts.untilMs ?? DURATION_MS;
  const rng = rngFromSeed(`baraka-bot:${seed}`);
  const run = newRun(seed);
  const events: BeatEvent[] = [];
  const noise = (round: number) => (jitter > 0 ? Math.round((rng.next() * 2 - 1) * (jitter + round * 4)) : 0);
  // la calibración: los 4 pulsos del primer compás, con la demora del dispositivo
  for (let i = 0; i < CALIBRATION_TAPS; i++) {
    const t = Math.round(i * beatMs(run.round.bpm) + device + (jitter ? noise(0) / 3 : 0));
    events.push({ t, phase: "calibration", round: 0 });
    tap(run, t);
  }
  for (;;) {
    advance(run, run.t + 1);
    // hasta el turno
    while (run.phase !== "turn" && run.phase !== "failed" && run.phase !== "over" && run.t < until) advance(run, run.phaseStart + phaseMs(run, run.phase));
    if (run.phase !== "turn" || run.t >= until) break;
    const round = run.index + 1;
    if (opts.failAt !== undefined && run.score >= opts.failAt) {
      // erra: el primer golpe bien y otro de más enseguida
      const t1 = Math.max(Math.ceil(run.t), Math.round(expectedAt(run, 0) + device));
      events.push({ t: t1, phase: "turn", round });
      tap(run, t1);
      const t2 = t1 + 40;
      events.push({ t: t2, phase: "turn", round });
      tap(run, t2);
      break;
    }
    for (let i = 0; i < run.round.hits.length; i++) {
      // nunca antes de que empiece el turno (el reloj del juego no va para atrás)
      const t = Math.max(Math.ceil(run.t), Math.round(expectedAt(run, i) + device + noise(round)));
      if (t >= until) break;
      const out = tap(run, t);
      if (out !== "ignorado") events.push({ t, phase: "turn", round });
      if (out === "error" || out === "ignorado") break;
    }
    if ((run.phase as Phase) === "failed") break;
    advance(run, run.phaseStart + phaseMs(run, "turn"));
  }
  advance(run, DURATION_MS);
  return { events, run };
}
