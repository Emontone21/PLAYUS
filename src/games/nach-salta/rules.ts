// Reglas de "Nach salta": The Nach corre solo hacia la derecha, visto de
// costado, cada vez más rápido. Simulación entera a 60 ticks por segundo
// (milímetros y milímetros por tick), igual en el navegador y en Node. La
// velocidad depende solo del tiempo, así que la distancia en cada tick es una
// tabla fija (`DIST`) y los obstáculos se generan por distancia desde la
// semilla. La traza son los cambios de control (saltar y agacharse, al apoyar
// y al soltar) más el cierre; `validate` vuelve a jugar. Sin DOM.

import { rngFromSeed, type Rng } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const TICKS_PER_S = 60;
export const DURATION_MS = 120_000;
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen entre el tick de fin y la duración real del intento (/finish) */
export const ELAPSED_SLACK_MS = 10_000;
/** después del choque, la caída se ve esto antes de onFinish */
export const CRASH_HOLD_TICKS = 60;

// ---------------------------------------------------------------------------
// la velocidad y la distancia
// ---------------------------------------------------------------------------

/** 9 m/s al arrancar (150 mm por tick) y 22 m/s a los 90 s (367); después, constante */
export const SPEED_START = 150;
export const SPEED_MAX = 367;
export const SPEED_RAMP_TICKS = 90 * TICKS_PER_S;

export function speedAt(tick: number): number {
  return SPEED_START + Math.floor(((SPEED_MAX - SPEED_START) * Math.min(tick, SPEED_RAMP_TICKS)) / SPEED_RAMP_TICKS);
}

/** la distancia recorrida (mm) al terminar cada tick, sin chocar: DIST[t] */
export const DIST: readonly number[] = (() => {
  const d = [0];
  for (let t = 1; t <= END_TICK + 600; t++) d.push(d[t - 1]! + speedAt(t));
  return d;
})();

/** el primer tick en que la distancia llega a `mm` */
export function tickAtDist(mm: number): number {
  let lo = 0;
  let hi = DIST.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (DIST[mid]! >= mm) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function speedAtDist(mm: number): number {
  return speedAt(tickAtDist(mm));
}

/** los metros enteros de una distancia en mm */
export const meters = (mm: number) => Math.floor(mm / 1000);

// ---------------------------------------------------------------------------
// The Nach y el salto
// ---------------------------------------------------------------------------

/** la caja de choque de The Nach: 1 m de ancho y 2,2 m de alto (agachado, la mitad) */
export const NACH_HALF_W = 500;
export const NACH_HEIGHT = 2200;
export const NACH_DUCK_HEIGHT = 1100;
/** el salto: velocidad inicial hacia arriba, gravedad normal, reducida mientras se mantiene y fuerte agachado en el aire (mm por tick, por tick) */
export const JUMP_V = 105;
export const GRAVITY = 5;
export const GRAVITY_HOLD = 2;
export const GRAVITY_FAST = 14;
/** hasta cuántos ticks pesa menos la gravedad si se mantiene: 250 ms */
export const HOLD_TICKS = 15;

/** la altura de los pies tick a tick de un salto que se mantiene `hold` ticks (0: un toque) */
export function jumpProfile(hold: number): number[] {
  const ys: number[] = [];
  let y = 0;
  let vy = JUMP_V;
  for (let t = 1; ; t++) {
    vy -= t <= Math.min(hold, HOLD_TICKS) ? GRAVITY_HOLD : GRAVITY;
    y += vy;
    if (y <= 0) {
      ys.push(0);
      break;
    }
    ys.push(y);
  }
  return ys;
}
/** el salto corto (un toque) y el largo (mantener los 250 ms) */
export const SHORT = jumpProfile(0);
export const LONG = jumpProfile(HOLD_TICKS);

/** el primer y el último tick (desde el despegue) en que los pies están por encima de `h` */
export function above(profile: readonly number[], h: number): [number, number] {
  let a = -1;
  let b = -1;
  profile.forEach((y, i) => {
    if (y > h) {
      if (a < 0) a = i + 1;
      b = i + 1;
    }
  });
  return [a, b];
}

// ---------------------------------------------------------------------------
// los obstáculos
// ---------------------------------------------------------------------------

/** la caja de choque es un poco más chica que el dibujo: esto de cada costado y de arriba */
export const HITBOX_SHRINK = 150;

export type ObstacleKind = "small" | "big" | "air";
export type AirLook = "cartel" | "zapatillas" | "paloma";
/** de qué grupo salió (la tabla): una chica, una grande, un par, algo en el aire o una combinación */
export type Group = "small" | "big" | "pair" | "air" | "rock-air" | "air-rock";

export interface Obstacle {
  kind: ObstacleKind;
  /** el dibujo, en mm de calle */
  x0: number;
  x1: number;
  /** el alto del dibujo (rocas) o su borde de abajo y de arriba (lo que está en el aire) */
  bottom: number;
  top: number;
  look?: AirLook;
  group: Group;
  /** índice del grupo (las piezas de un par o de una combinación lo comparten) */
  gi: number;
}

/** las medidas de cada cosa (mm): las rocas salen de los sprites de "Nach y la roca" a 100 mm por unidad */
export const SIZES = {
  small: { w: 1200, h: 800 },
  big: { w: 1600, h: 1400 },
  /** lo que está en el aire: de 1,15 m para arriba (el cartel y las zapatillas cuelgan desde el cielo) */
  airBottom: 1150,
  cartel: { w: 1400 },
  zapatillas: { w: 1400 },
  paloma: { w: 1200, top: 2300 },
} as const;
/** muy arriba: lo que cuelga no se puede saltar por encima */
export const SKY_TOP = 99_000;

/** la caja de choque de un obstáculo */
export function hitbox(o: Obstacle): { x0: number; x1: number; y0: number; y1: number } {
  if (o.kind === "air") return { x0: o.x0 + HITBOX_SHRINK, x1: o.x1 - HITBOX_SHRINK, y0: o.bottom + 100, y1: o.top === SKY_TOP ? SKY_TOP : o.top - HITBOX_SHRINK };
  return { x0: o.x0 + HITBOX_SHRINK, x1: o.x1 - HITBOX_SHRINK, y0: 0, y1: o.top - 100 };
}

/** desde dónde aparece cada cosa (metros) */
export const FROM_M = { big: 150, pair: 300, air: 400, combo: 800 } as const;
/** el cartel de arranque dura 1,8 s y la primera roca no aparece antes de los 2,5 s */
export const BANNER_TICKS = 108;
export const FIRST_ROCK_TICK = 150;
/** cuánto se ve hacia adelante: The Nach a un cuarto de una vista de 192 unidades de 100 mm */
export const VIEW_AHEAD = 14_400;
/** hasta dónde se genera: más de lo que se puede recorrer en 120 s */
export const COURSE_END = DIST[END_TICK]! + VIEW_AHEAD + 20_000;

/** los ticks desde el despegue hasta tener los pies por encima de una roca, y hasta aterrizar */
const SMALL_HIT = SIZES.small.h - 100;
const BIG_HIT = SIZES.big.h - 100;
export const SHORT_RISE = above(SHORT, SMALL_HIT)[0];
export const SHORT_LAND = SHORT.length;
export const LONG_RISE_BIG = above(LONG, BIG_HIT)[0];
export const LONG_LAND = LONG.length;
/** reacción mínima entre una acción y la otra en una combinación: 350 ms */
export const COMBO_GAP_TICKS = 21;

/**
 * El espacio entre grupos (ticks de recorrido, de que termina uno a que
 * empieza el otro): baja con la distancia. La calibración (decisión 252).
 */
export const SPACING = { start: 95, perMeters: 30, min: 58, spread: 45 } as const;

/** los pesos de cada grupo cuando ya está disponible */
export const WEIGHTS: Record<Group, number> = { small: 3, big: 3, pair: 2, air: 4, "rock-air": 2, "air-rock": 2 };

/** la separación entre las dos rocas de un par a la velocidad `v`: el salto corto no alcanza y el largo sí */
export function pairGap(v: number): number {
  return Math.max(1200, 31 * v - 2 * SIZES.small.w);
}

export interface Course {
  obstacles: Obstacle[];
}

function rock(kind: "small" | "big", x0: number, group: Group, gi: number): Obstacle {
  const s = SIZES[kind];
  return { kind, x0, x1: x0 + s.w, bottom: 0, top: s.h, group, gi };
}
function air(x0: number, look: AirLook, group: Group, gi: number): Obstacle {
  const w = SIZES[look].w;
  return { kind: "air", x0, x1: x0 + w, bottom: SIZES.airBottom, top: look === "paloma" ? SIZES.paloma.top : SKY_TOP, look, group, gi };
}

/** el tick en que el frente de The Nach llega a la caja de un obstáculo, y en que su espalda la deja atrás */
export function overlapTicks(o: Obstacle): [number, number] {
  const h = hitbox(o);
  return [tickAtDist(h.x0 - NACH_HALF_W + 1), tickAtDist(h.x1 + NACH_HALF_W)];
}

/** los obstáculos del intento: puros, iguales para todo el grupo en el mismo número de intento */
export function generateCourse(seed: string): Course {
  const rng: Rng = rngFromSeed(`nach-salta:${seed}`);
  const obstacles: Obstacle[] = [];
  // la primera roca no entra en pantalla antes de los 2,5 s
  let pos = DIST[FIRST_ROCK_TICK]! + VIEW_AHEAD + 1;
  let gi = 0;
  while (pos < COURSE_END) {
    const m = meters(pos);
    const pool: Group[] = ["small"];
    if (m >= FROM_M.big) pool.push("big");
    if (m >= FROM_M.pair) pool.push("pair");
    if (m >= FROM_M.air) pool.push("air");
    if (m >= FROM_M.combo) pool.push("rock-air", "air-rock");
    const total = pool.reduce((s, g) => s + WEIGHTS[g], 0);
    let pick = rng.int(1, total);
    let group: Group = pool[0]!;
    for (const g of pool) {
      pick -= WEIGHTS[g];
      if (pick <= 0) {
        group = g;
        break;
      }
    }
    const looks: AirLook[] = ["cartel", "zapatillas", "paloma"];
    const v = speedAtDist(pos);
    let end = pos;
    if (group === "small" || group === "big") {
      obstacles.push(rock(group, pos, group, gi));
      end = pos + SIZES[group].w;
    } else if (group === "pair") {
      const a = rock("small", pos, group, gi);
      // con la velocidad de donde termina el par (un poco más alta: más justo para el corto)
      const b = rock("small", a.x1 + pairGap(speedAtDist(a.x1 + 5000)), group, gi);
      obstacles.push(a, b);
      end = b.x1;
    } else if (group === "air") {
      const o = air(pos, looks[rng.int(0, 2)]!, group, gi);
      obstacles.push(o);
      end = o.x1;
    } else if (group === "rock-air") {
      // una roca chica y enseguida algo en el aire: del último aterrizaje posible a agacharse, 350 ms
      const r = rock("small", pos, group, gi);
      const ticks = SHORT_LAND - SHORT_RISE + COMBO_GAP_TICKS + 2;
      const v2 = speedAtDist(pos + ticks * v + 10_000);
      const o = air(r.x0 + ticks * v2, looks[rng.int(0, 2)]!, group, gi);
      obstacles.push(r, o);
      end = o.x1;
    } else {
      // algo en el aire y enseguida una roca chica: de pararse a tener los pies arriba, 350 ms
      const o = air(pos, looks[rng.int(0, 2)]!, group, gi);
      const ticks = SHORT_RISE + COMBO_GAP_TICKS + 2;
      const v2 = speedAtDist(o.x1 + ticks * v + 10_000);
      const r = rock("small", o.x1 + 2 * NACH_HALF_W + 2 * HITBOX_SHRINK + ticks * v2, group, gi);
      obstacles.push(o, r);
      end = r.x1;
    }
    gi++;
    const lo = Math.max(SPACING.min, SPACING.start - Math.floor(meters(end) / SPACING.perMeters));
    const gapTicks = rng.int(lo, lo + SPACING.spread);
    pos = end + gapTicks * speedAtDist(end);
  }
  return { obstacles };
}

// ---------------------------------------------------------------------------
// la partida
// ---------------------------------------------------------------------------

export type Input = "jump-down" | "jump-up" | "duck-down" | "duck-up";
export const INPUTS: readonly Input[] = ["jump-down", "jump-up", "duck-down", "duck-up"];

export interface SimState {
  tick: number;
  /** la distancia recorrida (mm) */
  dist: number;
  /** la altura de los pies (mm) y su velocidad (mm por tick) */
  y: number;
  vy: number;
  ground: boolean;
  jumpHeld: boolean;
  duckHeld: boolean;
  /** el tick del último despegue, y si ese salto todavía puede seguir subiendo con gravedad reducida */
  jumpAt: number;
  holding: boolean;
  crashed: boolean;
  crashAt: number;
  /** con qué chocó */
  hit: number;
  /** el primer obstáculo que todavía puede chocar */
  next: number;
  /** el tick en que llegó a los 400 m (las dos mitades) */
  splitAt: number;
}

export function initialState(): SimState {
  return { tick: 0, dist: 0, y: 0, vy: 0, ground: true, jumpHeld: false, duckHeld: false, jumpAt: -1, holding: false, crashed: false, crashAt: -1, hit: -1, next: 0, splitAt: -1 };
}

/** el puntaje: los metros enteros recorridos */
export function score(s: SimState): number {
  return meters(s.dist);
}

/** ¿agacharse ya existe? desde los 400 m la mitad izquierda agacha */
export function splitActive(s: SimState): boolean {
  return meters(s.dist) >= FROM_M.air;
}

/** un cambio de control en el tick actual (el salto arranca en el momento de apoyar) */
export function applyInput(s: SimState, input: Input): void {
  if (s.crashed) return;
  if (input === "jump-down") {
    s.jumpHeld = true;
    if (s.ground) {
      s.ground = false;
      s.vy = JUMP_V;
      s.jumpAt = s.tick;
      s.holding = true;
    }
  } else if (input === "jump-up") {
    s.jumpHeld = false;
    s.holding = false;
  } else if (input === "duck-down") s.duckHeld = true;
  else s.duckHeld = false;
}

/** la altura de la caja de The Nach */
export function nachHeight(s: SimState): number {
  return s.duckHeld ? NACH_DUCK_HEIGHT : NACH_HEIGHT;
}

/** avanza un tick: corre, cae y, si toca algo, se termina */
export function step(s: SimState, course: Course): void {
  s.tick++;
  if (s.crashed) return;
  s.dist += speedAt(s.tick);
  if (s.splitAt < 0 && splitActive(s)) s.splitAt = s.tick;
  if (!s.ground) {
    const holdOk = s.holding && s.jumpHeld && s.tick - s.jumpAt <= HOLD_TICKS;
    if (!holdOk) s.holding = false;
    s.vy -= s.duckHeld ? GRAVITY_FAST : holdOk ? GRAVITY_HOLD : GRAVITY;
    s.y += s.vy;
    if (s.y <= 0) {
      s.y = 0;
      s.vy = 0;
      s.ground = true;
      s.holding = false;
    }
  }
  // el choque: la caja de The Nach contra las de los obstáculos cercanos
  const obs = course.obstacles;
  while (s.next < obs.length && hitbox(obs[s.next]!).x1 < s.dist - NACH_HALF_W) s.next++;
  const nx0 = s.dist - NACH_HALF_W;
  const nx1 = s.dist + NACH_HALF_W;
  const ny0 = s.y;
  const ny1 = s.y + nachHeight(s);
  for (let i = s.next; i < obs.length; i++) {
    const h = hitbox(obs[i]!);
    if (h.x0 >= nx1) break;
    if (h.x1 > nx0 && h.x0 < nx1 && h.y1 > ny0 && h.y0 < ny1) {
      s.crashed = true;
      s.crashAt = s.tick;
      s.hit = i;
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

export type InputEvent = { tick: number; input: Input };
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = InputEvent | EndEvent;

export type Parsed = { ok: true; inputs: InputEvent[]; endTick: number } | { ok: false; reason: string };

export function parseTrace(events: unknown): Parsed {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > 4 * END_TICK + 2) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const inputs: InputEvent[] = [];
  let prev = -1;
  let jump = false;
  let duck = false;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Partial<InputEvent> | null;
    if (!e || typeof e !== "object" || "fin" in e || !Number.isInteger(e.tick)) return { ok: false, reason: "evento mal armado" };
    if (typeof e.input !== "string" || !INPUTS.includes(e.input as Input)) return { ok: false, reason: "control inválido" };
    const tick = e.tick as number;
    // dos cambios en el mismo tick valen (apoyar y soltar enseguida), pero nunca para atrás
    if (tick < 0 || tick < prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= endTick) return { ok: false, reason: "evento después del final" };
    const input = e.input as Input;
    if (input === "jump-down") {
      if (jump) return { ok: false, reason: "eventos mal alternados" };
      jump = true;
    } else if (input === "jump-up") {
      if (!jump) return { ok: false, reason: "eventos mal alternados" };
      jump = false;
    } else if (input === "duck-down") {
      if (duck) return { ok: false, reason: "eventos mal alternados" };
      duck = true;
    } else {
      if (!duck) return { ok: false, reason: "eventos mal alternados" };
      duck = false;
    }
    prev = tick;
    inputs.push({ tick, input });
  }
  return { ok: true, inputs, endTick };
}

/** vuelve a jugar: cada cambio de control en su tick y hasta endTick */
export function simulate(seed: string, inputs: readonly InputEvent[], endTick: number, course: Course = generateCourse(seed)): SimState {
  const s = initialState();
  let k = 0;
  while (s.tick < endTick) {
    while (k < inputs.length && inputs[k]!.tick === s.tick) applyInput(s, inputs[k++]!.input);
    step(s, course);
  }
  return s;
}

export type CheckResult = { ok: true; score: number; crashed: boolean; endTick: number; state: SimState } | { ok: false; reason: string };

export function check(seed: string, events: unknown, elapsedMs?: number): CheckResult {
  const p = parseTrace(events);
  if (!p.ok) return p;
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(p.endTick, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  const s = simulate(seed, p.inputs, p.endTick);
  return { ok: true, score: score(s), crashed: s.crashed, endTick: p.endTick, state: s };
}

export function validate(result: { score: number; events: unknown[] }, seed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(seed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

/** la cota: los metros de 120 s a la velocidad del cronograma (nunca se va más rápido) */
export const MAX_METERS = meters(DIST[END_TICK]!);

// ---------------------------------------------------------------------------
// el jugador automático
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** ticks desde que un obstáculo entra en pantalla hasta poder reaccionar */
  reaction?: number;
  /** error de tiempo al despegar y al agacharse: ±ticks */
  jitter?: number;
  /** por mil: con qué frecuencia se equivoca y salta corto ante una grande o un par */
  shortPerMille?: number;
  /** deja de jugar en este tick (para la herramienta y los tests) */
  untilTick?: number;
  botSeed?: string;
}

/** el tick en que un obstáculo entra en pantalla */
export function enterTick(o: Obstacle): number {
  return tickAtDist(o.x0 - VIEW_AHEAD);
}

/**
 * Un jugador con reacción: ve cada obstáculo cuando entra en pantalla, y
 * después de `reaction` ticks puede actuar; salta corto ante una roca chica,
 * largo ante una grande o un par (centrando el salto sobre lo que tiene que
 * pasar), y se agacha mientras pasa lo que está en el aire.
 */
export function botTrace(seed: string, opts: BotOptions = {}): { events: TraceEvent[]; state: SimState } {
  const reaction = opts.reaction ?? 15;
  const jitter = opts.jitter ?? 0;
  const shortErr = opts.shortPerMille ?? 0;
  const until = Math.min(END_TICK, opts.untilTick ?? END_TICK);
  const rng = rngFromSeed(`nach-salta-bot:${opts.botSeed ?? seed}`);
  const course = generateCourse(seed);
  const obs = course.obstacles;
  // el plan: una lista de cambios de control con su tick
  const plan: InputEvent[] = [];
  let lastJumpUp = -1;
  let lastDuckUp = -1;
  const jit = () => (jitter > 0 ? rng.int(-jitter, jitter) : 0);
  for (let i = 0; i < obs.length; ) {
    const o = obs[i]!;
    const parts = obs.filter((x, j) => j >= i && x.gi === o.gi);
    i += parts.length;
    if (enterTick(o) > until) break;
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p]!;
      const seen = enterTick(part) + reaction;
      if (part.kind === "air") {
        const [a, b] = overlapTicks(part);
        let down = Math.max(seen, a - 4 + jit(), lastDuckUp + 1);
        if (down <= lastJumpUp) down = lastJumpUp + 1;
        plan.push({ tick: down, input: "duck-down" });
        const up = Math.max(down + 1, b + 2 + jit());
        plan.push({ tick: up, input: "duck-up" });
        lastDuckUp = up;
        continue;
      }
      // las rocas: un par se pasa entero con un salto largo
      const first = part;
      let last = part;
      if (part.group === "pair") {
        last = parts[p + 1]!;
        p++;
      }
      const [a] = overlapTicks(first);
      const [, b] = overlapTicks(last);
      const long = part.kind === "big" || part.group === "pair" ? !(shortErr > 0 && rng.int(1, 1000) <= shortErr) : false;
      const prof = long ? LONG : SHORT;
      const h = Math.max(...[first, last].map((x) => hitbox(x).y1));
      const [ra, rb] = above(prof, h);
      // centra la ventana de pies arriba sobre la superposición
      const slack = rb - ra - (b - a);
      let take = a - ra - Math.floor(slack / 2) + jit();
      take = Math.max(take, seen, lastDuckUp + 1, lastJumpUp + 1);
      plan.push({ tick: take, input: "jump-down" });
      const up = take + (long ? HOLD_TICKS : 1);
      plan.push({ tick: up, input: "jump-up" });
      lastJumpUp = up;
    }
  }
  plan.sort((x, y) => x.tick - y.tick || INPUTS.indexOf(x.input) - INPUTS.indexOf(y.input));
  // juega el plan hasta chocar o hasta el final
  const s = initialState();
  const used: InputEvent[] = [];
  let k = 0;
  while (s.tick < until && !s.crashed) {
    while (k < plan.length && plan[k]!.tick <= s.tick) {
      const e = plan[k++]!;
      used.push({ tick: s.tick, input: e.input });
      applyInput(s, e.input);
    }
    step(s, course);
  }
  // los que quedaron apretados se sueltan antes del cierre
  const end = s.crashed ? Math.min(END_TICK, s.crashAt + CRASH_HOLD_TICKS) : until;
  while (s.tick < end) step(s, course);
  return { events: [...used, { tick: end, fin: true }], state: s };
}

/** el jugador modelo de la calibración (decisión 252) */
export const MODEL: BotOptions = { reaction: 18, jitter: 4, shortPerMille: 60 };
