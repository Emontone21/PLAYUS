// "los deseos de Larry": la lluvia, la simulación y la validación, puras y
// compartidas por el cliente (para jugar y dibujar) y el servidor (para
// validar la traza). Cualquier diferencia entre los dos sería un puntaje
// rechazado, así que viven en un solo lugar.
//
// Todo es aritmética entera: 60 ticks por segundo, posiciones en subunidades
// (16 por unidad lógica), y el único azar sale de rngFromSeed (mulberry32, que
// es aritmética de 32 bits exacta). Nada de Math.sin, Math.pow ni parecidos:
// la misma entrada da el mismo resultado en cualquier motor de JavaScript.

import { rngFromSeed } from "../../lib/rng";

export const TICKS_PER_S = 60;
export const DURATION_MS = 90_000;
/** a los 90 s la partida termina: el último tick simulado es END_TICK - 1 */
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen de /finish sobre la duración real (el mismo que gameLimits) */
export const ELAPSED_SLACK_MS = 10_000;

/** subunidades por unidad lógica */
export const SUB = 16;
export const FIELD_W = 90;
export const FIELD_H = 160;

export const LARRY_W = 12;
/** Larry arranca en el medio */
export const LARRY_START = 45;
/** el centro de Larry no sale de acá (unidades): su cuerpo entra entero en el campo */
export const LARRY_MIN = LARRY_W / 2;
export const LARRY_MAX = FIELD_W - LARRY_W / 2;
/** velocidad máxima de Larry, en subunidades por tick (2,25 unidades por tick: cruza el campo en 0,6 s) */
export const LARRY_SPEED = 36;

/** la altura de la zona de agarre: la parte de arriba del sprite de Larry */
export const CATCH_Y = 128;
/** el piso: ahí un deseo hace "plaf" */
export const FLOOR_Y = 150;
/** caja de colisión de los objetos (cuadrada, igual para todos) */
export const OBJ_SIZE = 8;
/** agarra si |objeto - Larry| < esto (subunidades): las cajas se superponen */
export const CATCH_REACH = ((OBJ_SIZE + LARRY_W) / 2) * SUB;

export const START_LIVES = 3;
/** el primer objeto aparece acá */
export const FIRST_SPAWN_TICK = 30;

// ---------------------------------------------------------------------------
// cronograma (sección 5): se interpola en ticks, con enteros
// ---------------------------------------------------------------------------

export interface ScheduleRow {
  tick: number;
  /** ticks entre objetos */
  interval: number;
  /** velocidad de caída, en subunidades por tick */
  speed: number;
  /** probabilidad de objeto malo, en milésimas */
  bad: number;
}

export const SCHEDULE: readonly ScheduleRow[] = [
  { tick: 0, interval: 54, speed: 16, bad: 100 }, // ~900 ms, cruza hasta Larry en 2,1 s
  { tick: 1800, interval: 36, speed: 22, bad: 180 }, // ~600 ms, 1,5 s
  { tick: 3600, interval: 24, speed: 30, bad: 250 }, // ~400 ms, 1,1 s
  { tick: 5400, interval: 17, speed: 40, bad: 300 }, // ~280 ms, 0,85 s
];
/** variación al azar de cada objeto, en porcentaje (± sobre el cronograma) */
export const INTERVAL_JITTER = 20;
export const SPEED_JITTER = 12;

function lerpInt(a: number, b: number, num: number, den: number): number {
  return a + Math.floor(((b - a) * num) / den);
}

export function scheduleAt(tick: number): Omit<ScheduleRow, "tick"> {
  const t = Math.max(0, Math.min(tick, SCHEDULE[SCHEDULE.length - 1]!.tick));
  let i = 0;
  while (i < SCHEDULE.length - 2 && t >= SCHEDULE[i + 1]!.tick) i++;
  const a = SCHEDULE[i]!;
  const b = SCHEDULE[i + 1]!;
  const num = t - a.tick;
  const den = b.tick - a.tick;
  return {
    interval: lerpInt(a.interval, b.interval, num, den),
    speed: lerpInt(a.speed, b.speed, num, den),
    bad: lerpInt(a.bad, b.bad, num, den),
  };
}

// ---------------------------------------------------------------------------
// la lluvia: todo lo que cae en la partida, generado de una vez con la semilla
// ---------------------------------------------------------------------------

export const WISH_KINDS = ["hamburguesa", "vapo"] as const;
export const BAD_KINDS = ["lechuga", "zanahoria", "brocoli", "bandera"] as const;
export type WishKind = (typeof WISH_KINDS)[number];
export type BadKind = (typeof BAD_KINDS)[number];
export type Kind = WishKind | BadKind;

export function isWish(kind: Kind): kind is WishKind {
  return kind === "hamburguesa" || kind === "vapo";
}

export interface Drop {
  kind: Kind;
  /** centro, en unidades enteras */
  x: number;
  /** tick en que aparece (arriba de todo, con la base en y = 0) */
  spawn: number;
  /** subunidades por tick */
  v: number;
  /** tick en que cruza la altura de agarre */
  cross: number;
  /** tick en que llega al piso si nadie lo agarra */
  land: number;
}

/** margen de las garantías: un objeto malo nunca pasa a menos de esto (unidades) de donde tiene que estar Larry */
export const CLEAR = OBJ_SIZE / 2 + LARRY_W / 2 + 4;
/** un objeto malo que cruza a menos de estos ticks de un deseo no puede caer pegado a él */
export const NEAR_TICKS = 12;
/** fracción de la velocidad máxima que alcanza para llegar a cualquier deseo (el margen de "alcanzable") */
export const REACH_NUM = 3;
export const REACH_DEN = 4;
const WISH_X_MIN = LARRY_MIN;
const WISH_X_MAX = LARRY_MAX;
const BAD_X_MIN = OBJ_SIZE / 2;
const BAD_X_MAX = FIELD_W - OBJ_SIZE / 2;

/** step n del objeto: la base queda en v·(n+1). Cruza cuando la base alcanza la altura. */
function tickReaching(spawn: number, v: number, y: number): number {
  return spawn + Math.ceil((y * SUB) / v) - 1;
}

/**
 * Genera la lluvia entera. Garantías (las comprueban los tests en 1.000
 * semillas, y un bot que juega "perfecto" con solo lo que ve en pantalla):
 * - todo deseo es alcanzable desde el anterior, desde que aparece, con 3/4 de
 *   la velocidad máxima;
 * - Larry yendo a toda velocidad de un deseo al siguiente (y esperando ahí)
 *   nunca queda a menos de CLEAR de un objeto malo cuando este cruza;
 * - un objeto malo que cruza a menos de NEAR_TICKS de un deseo cae a CLEAR o
 *   más de él;
 * - los objetos cruzan la altura de agarre de a uno, en el orden en que salen.
 */
export function generateRain(seed: string): Drop[] {
  const rng = rngFromSeed(`${seed}:lluvia`);
  const drops: Drop[] = [];
  const wishes: Drop[] = [];
  const bads: Drop[] = [];
  // Larry arranca quieto en el medio: es como un deseo agarrado en el tick 0
  let lastWish = { cross: 0, x: LARRY_START };
  let lastCross = -1;
  let t = FIRST_SPAWN_TICK;
  // se genera hasta pasar el final con un deseo, así todo objeto malo que
  // cruza antes del final quedó revisado contra el camino hacia un deseo
  while (t < END_TICK || lastWish.cross < END_TICK) {
    const s = scheduleAt(t);
    const bad = rng.int(0, 999) < s.bad;
    const kind: Kind = bad ? rng.pick(BAD_KINDS) : rng.pick(WISH_KINDS);
    let v = Math.max(4, Math.floor((s.speed * rng.int(100 - SPEED_JITTER, 100 + SPEED_JITTER)) / 100));
    // de a uno: si este llegaría antes (o junto) que el anterior, cae más despacio
    while (v > 4 && tickReaching(t, v, CATCH_Y) <= lastCross) v--;
    const cross = tickReaching(t, v, CATCH_Y);
    const pickFrom = (xs: number[]) => (xs.length > 0 ? xs[rng.int(0, xs.length - 1)]! : null);

    if (cross > lastCross) {
      let x: number | null;
      if (bad) {
        // lejos de los deseos que cruzan cerca en el tiempo, y lejos de donde
        // Larry espera el próximo (el último deseo): así quedarse quieto
        // debajo del último deseo siempre es seguro, y el próximo deseo
        // siempre tiene al menos un lugar justo (el mismo x)
        const near = wishes.filter((w) => cross - w.cross <= NEAR_TICKS);
        const xs: number[] = [];
        for (let c = BAD_X_MIN; c <= BAD_X_MAX; c++) {
          if (Math.abs(c - lastWish.x) < CLEAR) continue;
          if (near.every((w) => Math.abs(c - w.x) >= CLEAR)) xs.push(c);
        }
        x = pickFrom(xs);
      } else {
        const depart = Math.max(lastWish.cross, t);
        const steps = cross - depart;
        const maxDx = Math.floor((steps * LARRY_SPEED * REACH_NUM) / REACH_DEN / SUB);
        const onPath = bads.filter((b) => b.cross > lastWish.cross);
        const xs: number[] = [];
        for (let c = WISH_X_MIN; c <= WISH_X_MAX; c++) {
          if (Math.abs(c - lastWish.x) > maxDx) continue;
          if (!onPath.every((b) => cross - b.cross > NEAR_TICKS || Math.abs(c - b.x) >= CLEAR)) continue;
          if (!onPath.every((b) => Math.abs(b.x * SUB - greedyAt(lastWish.x, c, depart, b.cross)) >= CLEAR * SUB)) continue;
          xs.push(c);
        }
        x = pickFrom(xs);
      }
      // si no hay lugar justo, ese hueco del cronograma queda vacío (para un
      // deseo no pasa: el x del deseo anterior siempre sirve)
      if (x !== null) {
        const d: Drop = { kind, x, spawn: t, v, cross, land: tickReaching(t, v, FLOOR_Y) };
        drops.push(d);
        (bad ? bads : wishes).push(d);
        if (!bad) lastWish = d;
        lastCross = cross;
      }
    }
    t += Math.max(1, Math.floor((s.interval * rng.int(100 - INTERVAL_JITTER, 100 + INTERVAL_JITTER)) / 100));
  }
  return drops.filter((d) => d.spawn < END_TICK);
}

/** dónde está Larry (subunidades) en el tick `tick` si sale de `fromX` hacia `toX` a toda velocidad después de `depart` */
function greedyAt(fromX: number, toX: number, depart: number, tick: number): number {
  const from = fromX * SUB;
  const to = toX * SUB;
  const moved = Math.max(0, tick - depart) * LARRY_SPEED;
  if (Math.abs(to - from) <= moved) return to;
  return to > from ? from + moved : from - moved;
}

/**
 * Cota superior de deseos en 90 s: todos los huecos del cronograma con el
 * intervalo más corto posible, y ningún objeto malo. Es el maxPlausibleScore.
 */
export function maxWishes(): number {
  let n = 0;
  for (let t = FIRST_SPAWN_TICK; t < END_TICK; n++) {
    t += Math.max(1, Math.floor((scheduleAt(t).interval * (100 - INTERVAL_JITTER)) / 100));
  }
  return n;
}
export const MAX_SCORE = maxWishes();

// ---------------------------------------------------------------------------
// la simulación, paso a paso
// ---------------------------------------------------------------------------

export type EndReason = "sin-vidas" | "verdura" | "bandera" | "tiempo";

export interface Falling {
  /** índice en la lluvia */
  i: number;
  /** base del objeto, en subunidades */
  y: number;
  prevY: number;
  /** ya pasó la altura de agarre sin que lo agarren */
  passed: boolean;
}

export interface SimState {
  tick: number;
  /** centro de Larry, en subunidades */
  larryX: number;
  prevLarryX: number;
  /** objetivo, en unidades enteras (lo fija el dedo) */
  target: number;
  /** próximo índice de la lluvia por aparecer */
  next: number;
  falling: Falling[];
  score: number;
  lives: number;
  end: { tick: number; reason: EndReason } | null;
  // para dibujar: nada de esto cambia el resultado
  lastCatch: { tick: number; kind: Kind } | null;
  splats: { tick: number; x: number; kind: Kind }[];
}

export function initialState(): SimState {
  return {
    tick: 0,
    larryX: LARRY_START * SUB,
    prevLarryX: LARRY_START * SUB,
    target: LARRY_START,
    next: 0,
    falling: [],
    score: 0,
    lives: START_LIVES,
    end: null,
    lastCatch: null,
    splats: [],
  };
}

/**
 * Avanza un tick. `target` es el objetivo vigente (el de la última entrada).
 * Orden: Larry camina, aparecen los objetos del tick, caen, se revisan
 * agarres y el piso, y al final el fin de partida. Muta el estado.
 */
export function step(state: SimState, rain: readonly Drop[], target: number): void {
  if (state.end) return;
  const t = state.tick;
  state.target = target;
  const goal = clamp(target, LARRY_MIN, LARRY_MAX) * SUB;
  state.prevLarryX = state.larryX;
  const dx = goal - state.larryX;
  state.larryX += Math.abs(dx) <= LARRY_SPEED ? dx : dx > 0 ? LARRY_SPEED : -LARRY_SPEED;

  while (state.next < rain.length && rain[state.next]!.spawn <= t) {
    state.falling.push({ i: state.next, y: 0, prevY: 0, passed: false });
    state.next++;
  }

  const catchLine = CATCH_Y * SUB;
  const floor = FLOOR_Y * SUB;
  const keep: Falling[] = [];
  for (const f of state.falling) {
    const d = rain[f.i]!;
    f.prevY = f.y;
    f.y += d.v;
    if (!f.passed && f.prevY < catchLine && f.y >= catchLine) {
      if (Math.abs(d.x * SUB - state.larryX) < CATCH_REACH) {
        if (isWish(d.kind)) {
          state.score++;
          state.lastCatch = { tick: t, kind: d.kind };
        } else if (!state.end) {
          state.end = { tick: t + 1, reason: d.kind === "bandera" ? "bandera" : "verdura" };
          state.lastCatch = { tick: t, kind: d.kind };
        }
        continue;
      }
      f.passed = true;
    }
    if (f.y >= floor) {
      state.splats.push({ tick: t, x: d.x, kind: d.kind });
      if (isWish(d.kind)) state.lives--;
      continue;
    }
    keep.push(f);
  }
  state.falling = keep;
  state.tick = t + 1;
  if (!state.end && state.lives <= 0) state.end = { tick: state.tick, reason: "sin-vidas" };
  if (!state.end && state.tick >= END_TICK) state.end = { tick: state.tick, reason: "tiempo" };
}

function clamp(n: number, lo: number, hi: number) {
  return n < lo ? lo : n > hi ? hi : n;
}

// ---------------------------------------------------------------------------
// la traza y la validación
// ---------------------------------------------------------------------------

/** un cambio de objetivo: desde el tick `tick`, Larry va hacia `x` (unidades enteras, 0 a 90) */
export type InputEvent = { tick: number; x: number };
/** cierra la traza: el tick en que terminó la partida (o en que la cortó el cronómetro) */
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = InputEvent | EndEvent;

export interface SimResult {
  score: number;
  lives: number;
  endTick: number;
  endReason: EndReason | null;
  state: SimState;
}

/**
 * Corre la partida con la semilla y las entradas hasta que termina o hasta
 * `untilTick` (el corte del cronómetro). Las entradas tienen que venir en
 * orden; acá no se valida nada (eso es `check`).
 */
export function simulate(attemptSeed: string, inputs: readonly InputEvent[], untilTick = END_TICK, rain = generateRain(attemptSeed)): SimResult {
  const state = initialState();
  let target = LARRY_START;
  let k = 0;
  while (!state.end && state.tick < untilTick) {
    while (k < inputs.length && inputs[k]!.tick <= state.tick) target = inputs[k++]!.x;
    step(state, rain, target);
  }
  return {
    score: state.score,
    lives: state.lives,
    endTick: state.end ? state.end.tick : state.tick,
    endReason: state.end ? state.end.reason : null,
    state,
  };
}

export type Verdict = { ok: true; score: number; endTick: number; endReason: EndReason | null } | { ok: false; reason: string };

/** Revisa la forma de la traza y la vuelve a jugar. */
export function check(attemptSeed: string, events: unknown, elapsedMs?: number): Verdict {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > END_TICK + 1) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const declared = last.tick as number;
  if (declared < 1 || declared > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const inputs: InputEvent[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.tick) || !Number.isInteger(e.x) || "fin" in e) return { ok: false, reason: "entrada mal armada" };
    const tick = e.tick as number;
    const x = e.x as number;
    if (tick <= prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= declared) return { ok: false, reason: "entrada después del final" };
    if (x < 0 || x > FIELD_W) return { ok: false, reason: "x fuera del campo" };
    prev = tick;
    inputs.push({ tick, x });
  }
  const sim = simulate(attemptSeed, inputs, declared);
  // la partida terminó antes de lo que dice la traza: no es una partida posible
  if (sim.endTick !== declared) return { ok: false, reason: "el final no coincide con la partida" };
  if (elapsedMs !== undefined) {
    const endMs = Math.floor((declared * 1000) / TICKS_PER_S);
    if (endMs > elapsedMs) return { ok: false, reason: "la partida duró más que el intento" };
    if (elapsedMs > endMs + ELAPSED_SLACK_MS) return { ok: false, reason: "el intento duró mucho más que la partida" };
  }
  return { ok: true, score: sim.score, endTick: sim.endTick, endReason: sim.endReason };
}

/** El punto de extensión del contrato: rearma la partida y compara. */
export function validate(result: { score: number; events: unknown[] }, attemptSeed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(attemptSeed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// bots: para los tests, los E2E y la herramienta de desarrollo
// ---------------------------------------------------------------------------

/**
 * El objetivo de un jugador "perfecto" que solo usa lo que ve: el próximo
 * deseo en cruzar entre los que ya aparecieron. Si no hay ninguno, se queda.
 */
export function greedyTarget(state: SimState, rain: readonly Drop[]): number {
  let best: Drop | null = null;
  for (const f of state.falling) {
    const d = rain[f.i]!;
    if (!isWish(d.kind) || f.passed || d.cross < state.tick) continue;
    if (!best || d.cross < best.cross) best = d;
  }
  return best ? best.x : state.target;
}

/** Juega con una política y devuelve la traza completa (con el cierre). */
export function playBot(
  attemptSeed: string,
  policy: (state: SimState, rain: readonly Drop[]) => number,
  untilTick = END_TICK,
  rain = generateRain(attemptSeed),
): { events: TraceEvent[]; result: SimResult } {
  const state = initialState();
  const inputs: InputEvent[] = [];
  while (!state.end && state.tick < untilTick) {
    const x = policy(state, rain);
    if (x !== state.target) inputs.push({ tick: state.tick, x });
    step(state, rain, x);
  }
  const endTick = state.end ? state.end.tick : state.tick;
  return {
    events: [...inputs, { tick: endTick, fin: true }],
    result: { score: state.score, lives: state.lives, endTick, endReason: state.end?.reason ?? null, state },
  };
}

/** La traza del jugador perfecto (los tests la usan para "todo deseo es alcanzable"). */
export function greedyTrace(attemptSeed: string, untilTick = END_TICK) {
  return playBot(attemptSeed, greedyTarget, untilTick);
}
