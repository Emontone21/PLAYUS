// Reglas de "la bolsita del jota": el jota esconde la tussi bajo uno de 3
// vasos, los mezcla y hay que adivinar dónde quedó. Las mezclas salen de la
// semilla del intento (`jotaShuffles`); la partida es una máquina de estados
// en ms desde onReady (mostrar → mezclar → elegir → revelar → la ronda
// siguiente), la misma en el cliente y en `validate`, que rearma las mezclas
// y vuelve a jugar la traza. Sin DOM.

import { rngFromSeed, type Rng } from "@/lib/rng";

export const DURATION_MS = 120_000;
/** margen chico después de los 120 s (el reloj del juego y el del contenedor no son el mismo) */
export const END_MARGIN_MS = 500;
export const ROUND_COUNT = 40;
/** mostrar: los tres vasos se levantan, se ve la bolsita y se bajan */
export const SHOW_MS = 900;
/** pausa entre movimientos (salvo dentro de una ráfaga) */
export const GAP_MS = 40;
/** acierto: la bolsita a tu pila y la ronda siguiente a los 700 ms */
export const REVEAL_MS = 700;
/** al errar, el final se ve esto antes de onFinish */
export const OVER_HOLD_MS = 1_000;
/** "¿y? ¿cuál, bro?" a los 6 s sin elegir */
export const PATIENCE_MS = 6_000;
/** el cambio de bolsita: se levanta el vaso, viaja la bolsita, se bajan los dos */
export const PASS_LIFT_MS = 120;

/** los pisos: nunca más rápido que esto */
export const FLOOR = { common: 180, jump: 220, pass: 350 } as const;
/** el último movimiento de cada mezcla dura esto del primero */
export const LAST_FACTOR = 0.55;

export type Pos = 0 | 1 | 2;
export type Special = "fake" | "burst" | "jump" | "pass" | "rotate";
/** desde qué ronda aparece cada jugada */
export const SPECIAL_FROM: Record<Special, number> = { fake: 4, burst: 5, jump: 7, pass: 8, rotate: 10 };

export type Move =
  /** intercambio: los vasos de `a` y `b` cambian de lugar, uno por arriba y otro por abajo */
  | { kind: "swap"; a: Pos; b: Pos; ms: number }
  /** amague: empiezan a intercambiarse, llegan a la mitad y vuelven */
  | { kind: "fake"; a: Pos; b: Pos; ms: number }
  /** ráfaga: 3 o 4 intercambios seguidos, sin pausa, cada uno de `ms` */
  | { kind: "burst"; swaps: [Pos, Pos][]; ms: number }
  /** salto: el vaso de la punta `from` pasa por arriba hasta la otra punta y los otros dos se corren */
  | { kind: "jump"; from: 0 | 2; ms: number }
  /** cambio de bolsita: a la vista, del vaso de `from` al de `to`; `ms` es el viaje visible */
  | { kind: "pass"; from: Pos; to: Pos; ms: number }
  /** rotación: los tres se corren un lugar en el sentido `dir` (el de la punta da la vuelta) */
  | { kind: "rotate"; dir: 1 | -1; ms: number };

export interface Shuffle {
  start: Pos;
  moves: Move[];
}

// ---------------------------------------------------------------------------
// la dificultad
// ---------------------------------------------------------------------------

const TABLE: readonly { round: number; moves: number; firstMs: number; special: number }[] = [
  { round: 1, moves: 3, firstMs: 600, special: 0 },
  { round: 3, moves: 5, firstMs: 500, special: 0 },
  { round: 6, moves: 8, firstMs: 400, special: 0.15 },
  { round: 10, moves: 12, firstMs: 320, special: 0.25 },
  { round: 15, moves: 16, firstMs: 260, special: 0.35 },
];

function lerpTable(round: number, key: "moves" | "firstMs" | "special"): number {
  const r = Math.max(1, round);
  if (r >= 15) return TABLE[4]![key];
  let i = 0;
  while (r >= TABLE[i + 1]!.round) i++;
  const a = TABLE[i]!;
  const b = TABLE[i + 1]!;
  return a[key] + ((b[key] - a[key]) * (r - a.round)) / (b.round - a.round);
}

/** cuántos movimientos tiene la mezcla de la ronda (desde 1) */
export function movesFor(round: number): number {
  if (round >= 15) return Math.min(22, 16 + (round - 15));
  return Math.round(lerpTable(round, "moves"));
}
/** la duración del primer movimiento (ms) */
export function firstMsFor(round: number): number {
  return Math.round(lerpTable(round, "firstMs"));
}
/** qué proporción de los movimientos son jugadas especiales */
export function specialShare(round: number): number {
  return lerpTable(round, "special");
}
/** la duración base del movimiento i de n: del primero al 55 % del primero, cada uno más rápido */
export function baseMs(round: number, i: number, n: number): number {
  const first = firstMsFor(round);
  return n <= 1 ? first : Math.round(first * (1 - ((1 - LAST_FACTOR) * i) / (n - 1)));
}

// ---------------------------------------------------------------------------
// las mezclas
// ---------------------------------------------------------------------------

const PAIRS: readonly [Pos, Pos][] = [
  [0, 1],
  [1, 2],
  [0, 2],
];

/** dónde queda la bolsita después de un movimiento */
export function applyMove(bag: Pos, m: Move): Pos {
  switch (m.kind) {
    case "swap":
      return bag === m.a ? m.b : bag === m.b ? m.a : bag;
    case "fake":
      return bag;
    case "burst":
      return m.swaps.reduce<Pos>((p, [a, b]) => (p === a ? b : p === b ? a : p), bag);
    case "jump":
      // de la punta 0: 0 → 2, 1 → 0, 2 → 1; de la punta 2: 2 → 0, 0 → 1, 1 → 2
      if (m.from === 0) return bag === 0 ? 2 : ((bag - 1) as Pos);
      return bag === 2 ? 0 : ((bag + 1) as Pos);
    case "pass":
      return bag === m.from ? m.to : bag;
    case "rotate":
      return (((bag + m.dir) % 3) + 3) % 3 as Pos;
  }
}

/** dónde termina la bolsita */
export function finalPos(s: Shuffle): Pos {
  return s.moves.reduce<Pos>((p, m) => applyMove(p, m), s.start);
}

/** cuánto dura un movimiento (con la ráfaga y el levantar del cambio de bolsita) */
export function moveMs(m: Move): number {
  if (m.kind === "burst") return m.ms * m.swaps.length;
  if (m.kind === "pass") return m.ms + 2 * PASS_LIFT_MS;
  return m.ms;
}

/** cuánto dura la mezcla entera: los movimientos y una pausa de 40 ms entre uno y otro */
export function shuffleMs(s: Shuffle): number {
  return s.moves.reduce((sum, m) => sum + moveMs(m), 0) + GAP_MS * Math.max(0, s.moves.length - 1);
}

/** cuándo empieza cada movimiento, desde el principio de la mezcla */
export function moveStarts(s: Shuffle): number[] {
  const out: number[] = [];
  let t = 0;
  for (const m of s.moves) {
    out.push(t);
    t += moveMs(m) + GAP_MS;
  }
  return out;
}

function pickSpecial(rng: Rng, round: number, passUsed: boolean): Special | null {
  const pool = (Object.keys(SPECIAL_FROM) as Special[]).filter((k) => round >= SPECIAL_FROM[k] && !(k === "pass" && passUsed));
  return pool.length ? pool[rng.int(0, pool.length - 1)]! : null;
}

/** las mezclas del intento: puras, iguales para todo el grupo en el mismo número de intento */
export function jotaShuffles(seed: string): Shuffle[] {
  const rng = rngFromSeed(`bolsita:${seed}`);
  const out: Shuffle[] = [];
  for (let round = 1; round <= ROUND_COUNT; round++) {
    const n = movesFor(round);
    // como después de una jugada siempre va un intercambio, la chance en cada lugar libre es s / (1 − s): así la proporción de jugadas queda en s
    const s0 = specialShare(round);
    const share = s0 > 0 ? s0 / (1 - s0) : 0;
    const start = rng.int(0, 2) as Pos;
    const moves: Move[] = [];
    let bag: Pos = start;
    let prevSpecial = false;
    let passUsed = false;
    const fastest = Math.max(FLOOR.common, baseMs(round, n - 1, n));
    for (let i = 0; i < n; i++) {
      const base = baseMs(round, i, n);
      // nunca dos jugadas seguidas: después de una, siempre un intercambio común
      const special = !prevSpecial && share > 0 && rng.next() < share ? pickSpecial(rng, round, passUsed) : null;
      let m: Move;
      if (special === "fake") {
        const [a, b] = PAIRS[rng.int(0, 2)]!;
        m = { kind: "fake", a, b, ms: Math.max(FLOOR.common, base) };
      } else if (special === "burst") {
        const k = rng.int(3, 4);
        const swaps: [Pos, Pos][] = [];
        for (let j = 0; j < k; j++) swaps.push(PAIRS[rng.int(0, 2)]!);
        m = { kind: "burst", swaps, ms: fastest };
      } else if (special === "jump") {
        m = { kind: "jump", from: rng.int(0, 1) ? 2 : 0, ms: Math.max(FLOOR.jump, base) };
      } else if (special === "pass") {
        const others = ([0, 1, 2] as Pos[]).filter((p) => p !== bag);
        m = { kind: "pass", from: bag, to: others[rng.int(0, 1)]!, ms: Math.max(FLOOR.pass, base) };
        passUsed = true;
      } else if (special === "rotate") {
        m = { kind: "rotate", dir: rng.int(0, 1) ? 1 : -1, ms: Math.max(FLOOR.common, base) };
      } else {
        const [a, b] = PAIRS[rng.int(0, 2)]!;
        m = { kind: "swap", a, b, ms: Math.max(FLOOR.common, base) };
      }
      moves.push(m);
      bag = applyMove(bag, m);
      prevSpecial = m.kind !== "swap";
    }
    out.push({ start, moves });
  }
  return out;
}

// ---------------------------------------------------------------------------
// la partida
// ---------------------------------------------------------------------------

/** show: mostrar; shuffle: mezclar; pick: elegir; reveal: el acierto, hasta la ronda siguiente; over: erró */
export type Phase = "show" | "shuffle" | "pick" | "reveal" | "over";

export interface Run {
  shuffles: Shuffle[];
  /** la ronda actual (desde 0) */
  index: number;
  phase: Phase;
  phaseAt: number;
  score: number;
  /** el último vaso elegido y dónde estaba la bolsita (para dibujar la revelación) */
  picked: Pos | -1;
  answer: Pos | -1;
  t: number;
}

export function newRun(shuffles: Shuffle[]): Run {
  return { shuffles, index: 0, phase: "show", phaseAt: 0, score: 0, picked: -1, answer: -1, t: 0 };
}

export function currentShuffle(run: Run): Shuffle {
  return run.shuffles[Math.min(run.index, run.shuffles.length - 1)]!;
}

/** cuándo termina la fase actual (Infinity si depende de un toque) */
export function phaseEnd(run: Run): number {
  if (run.phase === "show") return run.phaseAt + SHOW_MS;
  if (run.phase === "shuffle") return run.phaseAt + shuffleMs(currentShuffle(run));
  if (run.phase === "reveal") return run.phaseAt + REVEAL_MS;
  return Infinity;
}

/** avanza el reloj: mostrar → mezclar → elegir, y después de acertar, la ronda siguiente */
export function advance(run: Run, t: number): void {
  for (;;) {
    const end = phaseEnd(run);
    if (t < end) break;
    if (run.phase === "show") run.phase = "shuffle";
    else if (run.phase === "shuffle") run.phase = "pick";
    else {
      run.index++;
      run.phase = "show";
      run.picked = -1;
      run.answer = -1;
    }
    run.phaseAt = end;
  }
  if (t > run.t) run.t = t;
}

export type PickOutcome = "bien" | "mal" | "bloqueada" | "terminada";

/** se toca el vaso de la posición `cup` en `t` */
export function pick(run: Run, t: number, cup: Pos): PickOutcome {
  advance(run, t);
  if (run.phase === "over") return "terminada";
  if (run.phase !== "pick") return "bloqueada";
  const answer = finalPos(currentShuffle(run));
  run.picked = cup;
  run.answer = answer;
  run.phaseAt = t;
  if (cup === answer) {
    run.score++;
    run.phase = "reveal";
    return "bien";
  }
  run.phase = "over";
  return "mal";
}

/** ¿la mesa toma un toque en `t`? (sin tocar el estado) */
export function pickOpen(run: Run, t: number): boolean {
  if (run.phase === "pick") return true;
  if (run.phase === "over") return false;
  let end = phaseEnd(run);
  if (run.phase === "show") end += shuffleMs(currentShuffle(run));
  return run.phase !== "reveal" && t >= end;
}

// ---------------------------------------------------------------------------
// el jota
// ---------------------------------------------------------------------------

export const LINES = {
  intro: "si adivinás, es tuya",
  burst: "mirá bien, bro",
  patience: "¿y? ¿cuál, bro?",
  win: "tomá, bro, es tuya",
  lose: "uh, casi, bro",
} as const;

export type JotaMood = "neutral" | "impaciente" | "contento" | "burlon" | "concentrado";

/** el movimiento que está pasando en `t` (o null), con su progreso de 0 a 1 */
export function moveAt(run: Run, t: number): { i: number; m: Move; q: number } | null {
  if (run.phase !== "shuffle") return null;
  const s = currentShuffle(run);
  const dt = t - run.phaseAt;
  const starts = moveStarts(s);
  for (let i = starts.length - 1; i >= 0; i--) {
    if (dt >= starts[i]!) {
      const m = s.moves[i]!;
      const q = (dt - starts[i]!) / moveMs(m);
      return q <= 1 ? { i, m, q } : null;
    }
  }
  return null;
}

/** la cara y la frase del jota en `t` */
export function jotaSays(run: Run, t: number): { face: JotaMood; text: string | null } {
  if (run.phase === "over") return { face: "burlon", text: LINES.lose };
  if (run.phase === "reveal") return { face: "contento", text: LINES.win };
  if (run.phase === "shuffle" && moveAt(run, t)?.m.kind === "burst") return { face: "concentrado", text: LINES.burst };
  if (run.phase === "pick" && t - run.phaseAt >= PATIENCE_MS) return { face: "impaciente", text: LINES.patience };
  return { face: "neutral", text: null };
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

export interface PickEvent {
  round: number;
  /** ms desde onReady */
  t: number;
  cup: Pos;
}

export type CheckResult = { ok: true; score: number; lost: boolean; run: Run } | { ok: false; reason: string };

/** rearma las mezclas con la semilla y vuelve a jugar la traza con los mismos tiempos */
export function check(seed: string, events: unknown, elapsedMs?: number): CheckResult {
  if (!Array.isArray(events)) return { ok: false, reason: "traza mal armada" };
  if (events.length > ROUND_COUNT) return { ok: false, reason: "traza demasiado larga" };
  const run = newRun(jotaShuffles(seed));
  let prev = -1;
  for (const raw of events) {
    const e = raw as Partial<PickEvent> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.t) || !Number.isInteger(e.round)) return { ok: false, reason: "elección mal armada" };
    if (e.cup !== 0 && e.cup !== 1 && e.cup !== 2) return { ok: false, reason: "vaso inválido" };
    const t = e.t as number;
    if (t < 0 || t <= prev) return { ok: false, reason: "tiempos fuera de orden" };
    if (t > DURATION_MS + END_MARGIN_MS) return { ok: false, reason: "elección después del final" };
    if (run.phase === "over") return { ok: false, reason: "evento después de un error" };
    advance(run, t);
    if (e.round !== run.index + 1) return { ok: false, reason: "rondas no consecutivas" };
    prev = t;
    const out = pick(run, t, e.cup);
    if (out === "bloqueada") return { ok: false, reason: "elección antes de que termine la mezcla" };
  }
  if (elapsedMs !== undefined && prev > elapsedMs) return { ok: false, reason: "la partida duró más que el intento" };
  return { ok: true, score: run.score, lost: run.phase === "over", run };
}

export function validate(result: { score: number; events: unknown[] }, seed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(seed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

/**
 * La cota: las rondas que entran en 120 s (más el margen) eligiendo apenas
 * termina cada mezcla. Cada ronda tarda al menos lo que muestra, sus
 * movimientos sin pausas y a la duración base o su piso, y la revelación;
 * eso no depende de la semilla.
 */
export function maxRounds(): number {
  let t = 0;
  let n = 0;
  for (let round = 1; round <= ROUND_COUNT; round++) {
    let mix = 0;
    const k = movesFor(round);
    for (let i = 0; i < k; i++) mix += Math.max(FLOOR.common, baseMs(round, i, k));
    t += SHOW_MS + mix;
    if (t > DURATION_MS + END_MARGIN_MS) break;
    n++;
    t += REVEAL_MS;
  }
  return n;
}
export const MAX_SCORE = maxRounds();

// ---------------------------------------------------------------------------
// el jugador automático
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** ms desde que termina la mezcla hasta tocar: mínimo y máximo */
  react?: [number, number];
  /**
   * por mil: la chance de perderle el rastro a la bolsita en un movimiento de
   * 300 ms; crece con la velocidad (al cuadrado) y con lo tramposo de la jugada
   */
  losePerMille?: number;
  /** las rondas (desde 1) en que erra a propósito */
  failRounds?: readonly number[];
  /** deja de jugar al empezar esta ronda (desde 1) */
  stopAtRound?: number;
  botSeed?: string;
}

/** cuánto cuesta seguir cada jugada (la ráfaga, por cada intercambio) */
export const TRICKINESS: Record<Move["kind"], number> = { swap: 1, fake: 2.5, burst: 1.2, jump: 1.6, pass: 0.8, rotate: 1.8 };

/** juega con la atención de una persona: a veces le pierde el rastro y adivina entre los tres */
export function botTrace(seed: string, opts: BotOptions = {}): { events: PickEvent[]; run: Run } {
  const [r0, r1] = opts.react ?? [0, 0];
  const lose = opts.losePerMille ?? 0;
  const rng = rngFromSeed(`bolsita-bot:${opts.botSeed ?? seed}`);
  const run = newRun(jotaShuffles(seed));
  const events: PickEvent[] = [];
  while (run.phase !== "over") {
    if (opts.stopAtRound !== undefined && run.index + 1 >= opts.stopAtRound) break;
    // espera a que termine la mezcla
    while (run.phase !== "pick") advance(run, phaseEnd(run));
    const s = currentShuffle(run);
    let guess = finalPos(s);
    let lost = false;
    for (const m of s.moves) {
      if (!lost && lose > 0) {
        const per = m.kind === "burst" ? m.swaps.length : 1;
        const speed = (300 / m.ms) ** 2;
        const p = Math.min(0.9, (lose / 1000) * speed * TRICKINESS[m.kind] * per);
        if (rng.next() < p) lost = true;
      }
    }
    if (lost) guess = rng.int(0, 2) as Pos;
    const round = run.index + 1;
    if (opts.failRounds?.includes(round)) guess = ((finalPos(s) + 1) % 3) as Pos;
    const t = run.phaseAt + (r1 > 0 ? rng.int(r0, r1) : 0);
    if (t > DURATION_MS) break;
    pick(run, t, guess);
    events.push({ round, t, cup: guess });
    if ((run.phase as Phase) === "reveal") advance(run, phaseEnd(run));
  }
  return { events, run };
}

/** el jugador modelo de la calibración (decisión 256) */
export const MODEL: BotOptions = { react: [500, 1400], losePerMille: 12 };
