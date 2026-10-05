// Reglas de "hij@ de p**": una simulación entera a 60 ticks por segundo,
// igual en el navegador y en Node. Cuatro hamburguesas en la plancha; cada
// una se cocina un tiempo que sale de la semilla, pide vuelta con una flecha
// (dirección de la semilla) durante una ventana, y si nadie la da vuelta se
// quema. La traza son los deslizamientos (también los equivocados) más el
// cierre; `validate` vuelve a correr la partida. Sin DOM.

import { hash32, rngFromSeed, type Rng } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const TICKS_PER_S = 60;
export const DURATION_MS = 60_000;
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen entre el tick de fin y la duración real del intento (/finish) */
export const ELAPSED_SLACK_MS = 10_000;
export const SLOTS = 4;
/** dos flechas nunca aparecen a menos de 350 ms */
export const ARROW_GAP_TICKS = 21;
/** la dirección equivocada bloquea esa hamburguesa 350 ms */
export const BLOCK_TICKS = 21;
/** quemada: 600 ms carbonizada antes de la cruda nueva */
export const BURNT_TICKS = 36;
/** servida: 300 ms deslizándose fuera */
export const SERVE_TICKS = 18;
/** la ventana nunca baja de 1 s */
export const MIN_WINDOW_TICKS = 60;
/** un dedo no desliza dos veces en menos de 60 ms */
export const MIN_SWIPE_GAP_TICKS = 4;
/** al principio arrancan desfasadas: 600 ms entre un lugar y el siguiente */
export const STAGGER_TICKS = 36;
/** cota: con 350 ms entre flechas no hay más vueltas posibles que esto */
export const MAX_SCORE = Math.ceil(END_TICK / ARROW_GAP_TICKS);

export type Dir = "up" | "down" | "left" | "right";
export const DIRS: readonly Dir[] = ["up", "down", "left", "right"];

/**
 * La dificultad (en ticks): cocción hasta la flecha y ventana para darla
 * vuelta, por tramo; entre filas se interpola. La ventana de 1,5 s al
 * arrancar es del dueño; los tiempos de cocción son la calibración
 * (decisión 240).
 */
export const DIFFICULTY: readonly { at: number; cookMin: number; cookMax: number; window: number }[] = [
  { at: 0, cookMin: 150, cookMax: 240, window: 90 },
  { at: 1200, cookMin: 108, cookMax: 180, window: 78 },
  { at: 2400, cookMin: 72, cookMax: 132, window: 69 },
  { at: 3600, cookMin: 54, cookMax: 96, window: 60 },
];

function lerp(a: number, b: number, t0: number, t1: number, t: number): number {
  if (t <= t0) return a;
  if (t >= t1) return b;
  return a + Math.floor(((b - a) * (t - t0)) / (t1 - t0));
}

/** cocción y ventana vigentes en un tick */
export function difficultyAt(tick: number): { cookMin: number; cookMax: number; window: number } {
  const t = Math.max(0, Math.min(END_TICK, tick));
  let i = 0;
  while (i < DIFFICULTY.length - 2 && t >= DIFFICULTY[i + 1]!.at) i++;
  const a = DIFFICULTY[i]!;
  const b = DIFFICULTY[i + 1]!;
  return {
    cookMin: lerp(a.cookMin, b.cookMin, a.at, b.at, t),
    cookMax: lerp(a.cookMax, b.cookMax, a.at, b.at, t),
    window: Math.max(MIN_WINDOW_TICKS, lerp(a.window, b.window, a.at, b.at, t)),
  };
}

export type Phase = "cooking" | "ready" | "burnt" | "serving";

export interface Slot {
  phase: Phase;
  /** la cara que se está cocinando (0 la primera, 1 la segunda) */
  side: 0 | 1;
  /** desde qué tick está en esta fase */
  since: number;
  /** cocinándose: cuándo aparece la flecha; en las otras fases, cuándo termina */
  until: number;
  /** la dirección de la flecha de este ciclo */
  dir: Dir;
  /** ticks de ventana de este ciclo */
  window: number;
  blockedUntil: number;
  /** el último giro bien dado (para dibujar) */
  flipAt: number;
  flipDir: Dir;
  /** la última dirección equivocada (para el temblor) */
  shakeAt: number;
  /** cuántas hamburguesas pasaron por este lugar (para las semillas de cada una) */
  cycle: number;
}

export interface SimState {
  tick: number;
  score: number;
  slots: Slot[];
  /** vueltas seguidas sin quemar ninguna */
  streak: number;
  burns: number;
  lastBurnAt: number;
  lastFlipAt: number;
  /** los ticks en que apareció o va a aparecer cada flecha (para la separación) */
  arrows: number[];
  rngs: Rng[];
}

export function initialState(seed: string): SimState {
  const s: SimState = {
    tick: 0,
    score: 0,
    slots: [],
    streak: 0,
    burns: 0,
    lastBurnAt: -1,
    lastFlipAt: -1,
    arrows: [],
    rngs: Array.from({ length: SLOTS }, (_, i) => rngFromSeed(`hdp:${seed}:${i}`)),
  };
  for (let i = 0; i < SLOTS; i++) s.slots.push({ phase: "cooking", side: 0, since: 0, until: 0, dir: "up", window: 90, blockedUntil: -1, flipAt: -1, flipDir: "up", shakeAt: -1, cycle: 0 });
  for (let i = 0; i < SLOTS; i++) startCooking(s, i, 0, 0, i * STAGGER_TICKS);
  return s;
}

/** la flecha más cercana (de cualquier lugar) a un tick, en ticks de distancia */
function conflict(s: SimState, candidate: number, self: number): number | null {
  for (let i = 0; i < SLOTS; i++) {
    if (i === self) continue;
    const other = s.slots[i]!;
    const r = other.phase === "cooking" ? other.until : other.phase === "ready" ? other.since : null;
    if (r !== null && Math.abs(candidate - r) < ARROW_GAP_TICKS) return r;
  }
  return null;
}

/** empieza a cocinarse una cara: sortea la cocción y la dirección, y corre la flecha si queda pegada a otra */
function startCooking(s: SimState, i: number, side: 0 | 1, tick: number, extra = 0): void {
  const slot = s.slots[i]!;
  const rng = s.rngs[i]!;
  const d = difficultyAt(tick);
  let readyAt = tick + extra + rng.int(d.cookMin, d.cookMax);
  // justicia: dos flechas nunca a menos de 350 ms
  for (let guard = 0; guard < 16; guard++) {
    const r = conflict(s, readyAt, i);
    if (r === null) break;
    readyAt = r + ARROW_GAP_TICKS;
  }
  slot.phase = "cooking";
  slot.side = side;
  slot.since = tick;
  slot.until = readyAt;
  slot.dir = DIRS[rng.int(0, 3)]!;
  slot.window = difficultyAt(readyAt).window;
  slot.blockedUntil = -1;
  if (side === 0) slot.cycle++;
  s.arrows.push(readyAt);
}

/** avanza un tick */
export function step(s: SimState): void {
  s.tick++;
  const t = s.tick;
  for (let i = 0; i < SLOTS; i++) {
    const slot = s.slots[i]!;
    if (slot.phase === "cooking" && t >= slot.until) {
      slot.phase = "ready";
      slot.since = t;
      slot.until = t + slot.window;
    } else if (slot.phase === "ready" && t >= slot.until) {
      slot.phase = "burnt";
      slot.since = t;
      slot.until = t + BURNT_TICKS;
      s.burns++;
      s.lastBurnAt = t;
      s.streak = 0;
    } else if ((slot.phase === "burnt" || slot.phase === "serving") && t >= slot.until) {
      startCooking(s, i, 0, t);
    }
  }
}

export type SwipeOutcome = "vuelta" | "equivocada" | "bloqueada" | "nada";

/** un deslizamiento sobre un lugar en el tick actual */
export function applySwipe(s: SimState, slotIndex: number, dir: Dir): SwipeOutcome {
  const slot = s.slots[slotIndex];
  if (!slot || slot.phase !== "ready") return "nada";
  const t = s.tick;
  if (t < slot.blockedUntil) return "bloqueada";
  if (dir !== slot.dir) {
    slot.blockedUntil = t + BLOCK_TICKS;
    slot.shakeAt = t;
    return "equivocada";
  }
  s.score++;
  s.streak++;
  s.lastFlipAt = t;
  slot.flipAt = t;
  slot.flipDir = dir;
  if (slot.side === 0) {
    startCooking(s, slotIndex, 1, t);
  } else {
    slot.phase = "serving";
    slot.since = t;
    slot.until = t + SERVE_TICKS;
  }
  return "vuelta";
}

/** ticks que le quedan a una hamburguesa a punto (0 si no está a punto) */
export function remaining(slot: Slot, tick: number): number {
  return slot.phase === "ready" ? Math.max(0, slot.until - tick) : 0;
}

// ---------------------------------------------------------------------------
// Big Bro
// ---------------------------------------------------------------------------

export type Mood = "espera" | "contento" | "enojado" | "grita";

/** las frases, fáciles de cambiar */
export const LINES = {
  normal: ["¡apurate con esas hijas de remil!", "¡dale que se queman!", "¡vamo', vamo'!"],
  lastMoment: "¡¡LA VUELTAAA!!",
  burnt: "¿me estás jodiendo?",
  streak: "eso, así se labura",
  intro: "¿estás listo, asistente?",
} as const;

/** cuánto dura cada reacción (ticks) */
export const LINE_TICKS = { burnt: 90, streak: 120, normalEvery: 240, lastMoment: 30 } as const;

/** qué dice Big Bro y con qué cara, según el estado: determinístico (la semilla elige la frase normal) */
export function broLine(s: SimState, seed: string): { text: string; mood: Mood } {
  const t = s.tick;
  if (s.lastBurnAt >= 0 && t - s.lastBurnAt < LINE_TICKS.burnt) return { text: LINES.burnt, mood: "enojado" };
  if (s.slots.some((slot) => slot.phase === "ready" && slot.until - t <= LINE_TICKS.lastMoment)) return { text: LINES.lastMoment, mood: "grita" };
  if (s.streak >= 5 && s.lastFlipAt >= 0 && t - s.lastFlipAt < LINE_TICKS.streak) return { text: LINES.streak, mood: "contento" };
  const n = Math.floor(t / LINE_TICKS.normalEvery);
  return { text: LINES.normal[hash32(`hdp-bro:${seed}:${n}`) % LINES.normal.length]!, mood: "espera" };
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

export interface SwipeEvent {
  tick: number;
  slot: 0 | 1 | 2 | 3;
  dir: Dir;
}
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = SwipeEvent | EndEvent;

export type Parsed = { ok: true; swipes: SwipeEvent[]; endTick: number } | { ok: false; reason: string };

export function parseTrace(events: unknown): Parsed {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > END_TICK / MIN_SWIPE_GAP_TICKS + 2) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const swipes: SwipeEvent[] = [];
  let prev = -Infinity;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Partial<SwipeEvent> | null;
    if (!e || typeof e !== "object" || "fin" in e || !Number.isInteger(e.tick)) return { ok: false, reason: "deslizamiento mal armado" };
    if (!Number.isInteger(e.slot) || (e.slot as number) < 0 || (e.slot as number) >= SLOTS) return { ok: false, reason: "lugar inválido" };
    if (typeof e.dir !== "string" || !DIRS.includes(e.dir as Dir)) return { ok: false, reason: "dirección inválida" };
    const tick = e.tick as number;
    if (tick < 0) return { ok: false, reason: "tick negativo" };
    if (tick <= prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick - prev < MIN_SWIPE_GAP_TICKS) return { ok: false, reason: "deslizamientos imposiblemente seguidos" };
    if (tick >= endTick) return { ok: false, reason: "deslizamiento después del final" };
    prev = tick;
    swipes.push({ tick, slot: e.slot as 0 | 1 | 2 | 3, dir: e.dir as Dir });
  }
  return { ok: true, swipes, endTick };
}

export interface SimResult {
  score: number;
  burns: number;
  endTick: number;
  state: SimState;
  outcomes: SwipeOutcome[];
}

/** vuelve a jugar: aplica cada deslizamiento en su tick y avanza hasta endTick */
export function simulate(seed: string, swipes: readonly SwipeEvent[], endTick: number): SimResult {
  const s = initialState(seed);
  const outcomes: SwipeOutcome[] = [];
  let k = 0;
  while (s.tick < endTick) {
    while (k < swipes.length && swipes[k]!.tick === s.tick) {
      outcomes.push(applySwipe(s, swipes[k]!.slot, swipes[k]!.dir));
      k++;
    }
    step(s);
  }
  while (k < swipes.length && swipes[k]!.tick === s.tick) {
    outcomes.push(applySwipe(s, swipes[k]!.slot, swipes[k]!.dir));
    k++;
  }
  return { score: s.score, burns: s.burns, endTick, state: s, outcomes };
}

export type CheckResult = { ok: true; score: number; burns: number; endTick: number } | { ok: false; reason: string };

export function check(seed: string, events: unknown, elapsedMs?: number): CheckResult {
  const p = parseTrace(events);
  if (!p.ok) return p;
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(p.endTick, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  const r = simulate(seed, p.swipes, p.endTick);
  return { ok: true, score: r.score, burns: r.burns, endTick: p.endTick };
}

export function validate(result: { score: number; events: unknown[] }, seed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(seed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// el jugador automático (calibración, herramienta y E2E)
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** ticks desde que aparece la flecha hasta que el bot la mira (más un jitter al azar) */
  reactionTicks?: number;
  jitterTicks?: number;
  /** por mil: con qué frecuencia desliza para el lado equivocado la primera vez */
  errorPerMille?: number;
  /** ticks entre un deslizamiento y el siguiente (un solo dedo) */
  swipeGapTicks?: number;
  /** hasta qué tick juega (después deja todo) */
  untilTick?: number;
  /** ticks en los que no atiende nada (para dejar que se queme alguna) */
  ignore?: [number, number];
  botSeed?: string;
}

/** un jugador con tiempo de reacción y un solo dedo: atiende las flechas en el orden en que aparecen */
export function botTrace(seed: string, opts: BotOptions = {}): { events: TraceEvent[]; result: SimResult } {
  const reaction = opts.reactionTicks ?? 0;
  const jitter = opts.jitterTicks ?? 0;
  const error = opts.errorPerMille ?? 0;
  const gap = Math.max(MIN_SWIPE_GAP_TICKS, opts.swipeGapTicks ?? MIN_SWIPE_GAP_TICKS);
  const until = opts.untilTick ?? END_TICK;
  const rng = rngFromSeed(`hdp-bot:${opts.botSeed ?? seed}`);
  const s = initialState(seed);
  const swipes: SwipeEvent[] = [];
  const noticed = new Map<number, number>(); // slot → tick en que la mira
  const wrongTried = new Set<number>();
  let nextFree = 0;
  while (s.tick < END_TICK) {
    const t = s.tick;
    if (t < until && !(opts.ignore && t >= opts.ignore[0] && t < opts.ignore[1])) {
      for (let i = 0; i < SLOTS; i++) {
        const slot = s.slots[i]!;
        if (slot.phase === "ready" && !noticed.has(i)) noticed.set(i, slot.since + reaction + (jitter ? rng.int(0, jitter) : 0));
        if (slot.phase !== "ready") {
          noticed.delete(i);
          wrongTried.delete(i);
        }
      }
      if (t >= nextFree) {
        // la que apareció primero entre las que ya miró y no están bloqueadas
        let pick = -1;
        for (let i = 0; i < SLOTS; i++) {
          const slot = s.slots[i]!;
          const at = noticed.get(i);
          if (slot.phase !== "ready" || at === undefined || t < at || t < slot.blockedUntil) continue;
          if (pick < 0 || slot.since < s.slots[pick]!.since) pick = i;
        }
        if (pick >= 0) {
          const slot = s.slots[pick]!;
          let dir = slot.dir;
          if (error > 0 && !wrongTried.has(pick) && rng.int(1, 1000) <= error) {
            wrongTried.add(pick);
            dir = DIRS[(DIRS.indexOf(slot.dir) + 1 + rng.int(0, 2)) % 4]!;
          }
          applySwipe(s, pick, dir);
          swipes.push({ tick: t, slot: pick as 0 | 1 | 2 | 3, dir });
          nextFree = t + gap;
        }
      }
    }
    step(s);
  }
  const events: TraceEvent[] = [...swipes, { tick: END_TICK, fin: true }];
  return { events, result: { score: s.score, burns: s.burns, endTick: END_TICK, state: s, outcomes: [] } };
}

/** el cronograma sin tocar nada: qué fase tiene cada lugar en cada tick (para la herramienta) */
export function idleTimeline(seed: string): { slot: number; phase: Phase; start: number; end: number }[] {
  const s = initialState(seed);
  const out: { slot: number; phase: Phase; start: number; end: number }[] = [];
  const open = s.slots.map((slot) => ({ phase: slot.phase, start: 0 }));
  while (s.tick < END_TICK) {
    step(s);
    for (let i = 0; i < SLOTS; i++) {
      if (s.slots[i]!.phase !== open[i]!.phase) {
        out.push({ slot: i, phase: open[i]!.phase, start: open[i]!.start, end: s.tick });
        open[i] = { phase: s.slots[i]!.phase, start: s.tick };
      }
    }
  }
  for (let i = 0; i < SLOTS; i++) out.push({ slot: i, phase: open[i]!.phase, start: open[i]!.start, end: END_TICK });
  return out;
}
