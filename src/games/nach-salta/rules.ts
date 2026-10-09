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

/**
 * La velocidad sube de forma continua desde el primer segundo, sin mesetas
 * (estilo dinosaurio de Chrome): 10 m/s al arrancar (167 mm por tick), 20 m/s
 * a los 30 s, 28 m/s a los 60 s, y después despacio hasta 32 m/s a los 120 s,
 * que es el tope (decisión 276).
 */
export const SPEED_CURVE: readonly [number, number][] = [
  [0, 167],
  [30 * TICKS_PER_S, 333],
  [60 * TICKS_PER_S, 467],
  [120 * TICKS_PER_S, 533],
];
export const SPEED_START = SPEED_CURVE[0]![1];
export const SPEED_MAX = SPEED_CURVE[SPEED_CURVE.length - 1]![1];

export function speedAt(tick: number): number {
  const t = Math.max(0, tick);
  for (let i = 1; i < SPEED_CURVE.length; i++) {
    const [t0, v0] = SPEED_CURVE[i - 1]!;
    const [t1, v1] = SPEED_CURVE[i]!;
    if (t <= t1) return v0 + Math.floor(((v1 - v0) * (t - t0)) / (t1 - t0));
  }
  return SPEED_MAX;
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
/** a qué altura va lo del aire: baja (hay que saltarla), a la altura de la cabeza (hay que agacharse) o alta (no molesta, salvo que saltes) */
export type AirHeight = "low" | "head" | "high";
/** de qué grupo salió (la tabla): una chica, una grande, un grupo de 2 o 3 rocas, algo en el aire a su altura, o una combinación */
export type Group = "small" | "big" | "cluster" | "air-low" | "air-head" | "air-high" | "rock-air" | "air-rock";

export interface Obstacle {
  kind: ObstacleKind;
  /** el dibujo, en mm de calle */
  x0: number;
  x1: number;
  /** el alto del dibujo (rocas) o su borde de abajo y de arriba (lo que está en el aire) */
  bottom: number;
  top: number;
  look?: AirLook;
  height?: AirHeight;
  group: Group;
  /** índice del grupo (las piezas de un par o de una combinación lo comparten) */
  gi: number;
}

/** las medidas de cada cosa (mm): las rocas salen de sus sprites (games/lib/nach) a 100 mm por unidad */
export const SIZES = {
  small: { w: 1200, h: 800 },
  big: { w: 1600, h: 1400 },
  /** lo que está en el aire a la altura de la cabeza: de 1,15 m para arriba (el cartel y las zapatillas cuelgan desde el cielo) */
  airBottom: 1150,
  /** bajo: de 0,1 a 0,8 m (la caja, hasta 0,7: el salto corto lo pasa, como a una roca chica) */
  lowBottom: 100,
  lowTop: 800,
  /** alto: de 2,5 m para arriba (la caja desde 2,6: parado o agachado no molesta; saltando debajo, choca) */
  highBottom: 2500,
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

/** desde dónde aparece cada cosa (metros): las grandes y los grupos de rocas a los 150, lo del aire (a sus tres alturas) a los 300, las combinaciones a los 800 */
export const FROM_M = { big: 150, cluster: 150, air: 300, combo: 800 } as const;
/** el cartel de arranque dura 1,8 s y la primera roca no aparece antes de los 2,5 s */
export const BANNER_TICKS = 108;
export const FIRST_ROCK_TICK = 150;
/** cuánto se ve hacia adelante: The Nach a un 20 % de una vista de 240 unidades de 100 mm */
export const VIEW_AHEAD = 19_200;
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
 * El espacio entre grupos es al azar, con un mínimo que depende de la
 * velocidad del momento (como en el dinosaurio): en ticks de recorrido, el
 * mínimo baja de 36 (600 ms) a 10 m/s a 27 (450 ms) a 28 m/s o más, y el
 * extra al azar baja de 40 a 14 ticks; en metros, a más velocidad más
 * separación mínima, pero proporcionalmente menos tiempo para reaccionar.
 * La calibración (decisión 276).
 */
export const SPACING = { minSlow: 36, minFast: 27, spreadSlow: 40, spreadFast: 14, vSlow: 167, vFast: 467 } as const;
function lerpBySpeed(v: number, slow: number, fast: number): number {
  const q = Math.max(0, Math.min(1, (v - SPACING.vSlow) / (SPACING.vFast - SPACING.vSlow)));
  return Math.round(slow + (fast - slow) * q);
}
/** el tiempo mínimo para reaccionar entre un grupo y el siguiente, a la velocidad `v` (ticks) */
export function minGapTicks(v: number): number {
  return lerpBySpeed(v, SPACING.minSlow, SPACING.minFast);
}
export function spreadTicks(v: number): number {
  return lerpBySpeed(v, SPACING.spreadSlow, SPACING.spreadFast);
}

/** los pesos de cada grupo cuando ya está disponible */
export const WEIGHTS: Record<Group, number> = { small: 3, big: 3, cluster: 3, "air-low": 2, "air-head": 3, "air-high": 2, "rock-air": 2, "air-rock": 2 };
/** cuánto queda del salto largo después de aterrizar algo alto: lo alto no puede venir mientras todavía se está en el aire por lo anterior */
export const HIGH_CLEAR_TICKS = 10;

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
function air(x0: number, look: AirLook, group: Group, gi: number, height: AirHeight = "head"): Obstacle {
  const w = SIZES[look].w;
  if (height === "low") return { kind: "air", x0, x1: x0 + w, bottom: SIZES.lowBottom, top: SIZES.lowTop, look: "paloma", height, group, gi };
  const bottom = height === "high" ? SIZES.highBottom : SIZES.airBottom;
  const top = look === "paloma" ? bottom + (SIZES.paloma.top - SIZES.airBottom) : SKY_TOP;
  return { kind: "air", x0, x1: x0 + w, bottom, top, look, height, group, gi };
}

/** cuántos ticks puede estar un salto con los pies por encima de `h`, y cuánto recorrido cubre a la velocidad `v` (mm, descontando el ancho de The Nach) */
export function jumpCoverage(profile: readonly number[], h: number, v: number): number {
  const [a, b] = above(profile, h);
  return a < 0 ? 0 : (b - a) * v - 2 * NACH_HALF_W;
}

/** el tick en que el frente de The Nach llega a la caja de un obstáculo, y en que su espalda la deja atrás */
export function overlapTicks(o: Obstacle): [number, number] {
  const h = hitbox(o);
  return [tickAtDist(h.x0 - NACH_HALF_W + 1), tickAtDist(h.x1 + NACH_HALF_W)];
}

/** qué salto pide un grupo y cuánto tarda: el corto (41 ticks) para chicas y lo bajo, el largo (57) si hay una grande; nada para agacharse o lo alto */
function jumpOf(parts: readonly Obstacle[]): { rise: number; land: number } | null {
  const rocks = parts.filter((o) => o.kind !== "air" || o.height === "low");
  if (rocks.length === 0) return null;
  const big = rocks.some((o) => o.kind === "big");
  return big ? { rise: LONG_RISE_BIG, land: LONG_LAND } : { rise: SHORT_RISE, land: SHORT_LAND };
}

/**
 * Los obstáculos del intento: puros, iguales para todo el grupo en el mismo
 * número de intento. Cada grupo se ubica por el tick en que llega a The Nach:
 * nunca antes de que termine el salto por el anterior (desde el despegue más
 * tardío que lo pasa), ni antes del tiempo mínimo de reacción desde que el
 * anterior quedó atrás; lo alto, además, nunca mientras un salto puede estar
 * en el aire. Encima de ese mínimo, un extra al azar que baja con la velocidad.
 */
export function generateCourse(seed: string): Course {
  const rng: Rng = rngFromSeed(`nach-salta:${seed}`);
  const obstacles: Obstacle[] = [];
  let gi = 0;
  // el anterior: cuándo llegó (el primero del grupo), cuándo quedó atrás (el último), qué salto pedía y si era alto
  let prev: { arrive: number; leave: number; jump: { rise: number; land: number } | null; high: boolean } | null = null;
  // la primera roca no entra en pantalla antes de los 2,5 s
  let arrival = tickAtDist(DIST[FIRST_ROCK_TICK]! + VIEW_AHEAD + 1 + HITBOX_SHRINK - NACH_HALF_W + 1);
  for (;;) {
    const v = speedAt(arrival);
    const m = meters(DIST[arrival]!);
    const pool: Group[] = ["small"];
    if (m >= FROM_M.big) pool.push("big");
    if (m >= FROM_M.cluster) pool.push("cluster");
    if (m >= FROM_M.air) pool.push("air-low", "air-head", "air-high");
    if (m >= FROM_M.combo) pool.push("rock-air", "air-rock");
    const total = pool.reduce((sum, g) => sum + WEIGHTS[g], 0);
    let pick = rng.int(1, total);
    let group: Group = pool[0]!;
    for (const g of pool) {
      pick -= WEIGHTS[g];
      if (pick <= 0) {
        group = g;
        break;
      }
    }
    // cuánto antes de llegar hay que despegar para este grupo (0 si no se salta)
    const riseNext = group === "big" || group === "cluster" ? LONG_RISE_BIG : group === "small" || group === "air-low" || group === "air-rock" || group === "rock-air" ? SHORT_RISE : 0;
    // el mínimo de llegada según el anterior
    if (prev) {
      let min = prev.leave + minGapTicks(speedAt(prev.leave));
      if (prev.jump) {
        // el anterior se saltó: desde el despegue más tardío que lo pasa, hay que aterrizar antes de despegar de nuevo
        const landing = prev.arrive - prev.jump.rise + prev.jump.land + 2;
        min = Math.max(min, landing + riseNext + 4);
        if (group === "air-high") min = Math.max(min, landing + HIGH_CLEAR_TICKS);
      }
      // después de lo alto, el despegue siguiente tiene que ser cuando ya pasó
      if (prev.high) min = Math.max(min, prev.leave + riseNext + 6);
      arrival = Math.max(arrival, min) + rng.int(0, spreadTicks(v));
    }
    if (arrival >= DIST.length - 200) break;
    // la posición: la caja empieza donde el frente de The Nach llega en `arrival`
    const pos = DIST[arrival]! + NACH_HALF_W - HITBOX_SHRINK;
    if (pos >= COURSE_END) break;
    const looks: AirLook[] = ["cartel", "zapatillas", "paloma"];
    const parts: Obstacle[] = [];
    if (group === "small" || group === "big") {
      parts.push(rock(group, pos, group, gi));
    } else if (group === "cluster") {
      // 2 o 3 rocas juntas, de distinto tamaño, mientras el salto largo las pase enteras a la velocidad de ese punto
      const want = rng.int(2, 3);
      parts.push(rock(rng.next() < 0.5 ? "small" : "big", pos, group, gi));
      for (let k = 1; k < want; k++) {
        const last = parts[parts.length - 1]!;
        const cand = rock(rng.next() < 0.5 ? "small" : "big", last.x1 + rng.int(100, 300), group, gi);
        const tallest = Math.max(...[...parts, cand].map((r) => hitbox(r).y1));
        const span = hitbox(cand).x1 - hitbox(parts[0]!).x0;
        const vEnd = speedAtDist(cand.x1 + 5000);
        if (span <= jumpCoverage(LONG, tallest, vEnd) - 6 * vEnd) parts.push(cand);
        else break;
      }
      if (parts.length === 1) {
        // a esta velocidad no entra ni una segunda grande: dos chicas pegadas, que el largo siempre pasa (el test lo comprueba)
        parts[0] = rock("small", pos, group, gi);
        parts.push(rock("small", parts[0]!.x1 + 100, group, gi));
      }
    } else if (group === "air-low" || group === "air-head" || group === "air-high") {
      const height: AirHeight = group === "air-low" ? "low" : group === "air-head" ? "head" : "high";
      parts.push(air(pos, looks[rng.int(0, 2)]!, group, gi, height));
    } else if (group === "rock-air") {
      // una roca chica y enseguida algo en el aire a la altura de la cabeza: del último aterrizaje posible a agacharse, 350 ms
      const r = rock("small", pos, group, gi);
      const ticks = SHORT_LAND - SHORT_RISE + COMBO_GAP_TICKS + 2;
      const v2 = speedAtDist(pos + ticks * v + 10_000);
      parts.push(r, air(r.x0 + ticks * v2, looks[rng.int(0, 2)]!, group, gi, "head"));
    } else {
      // algo en el aire a la altura de la cabeza y enseguida una roca chica: de pararse a tener los pies arriba, 350 ms
      const o = air(pos, looks[rng.int(0, 2)]!, group, gi, "head");
      const ticks = SHORT_RISE + COMBO_GAP_TICKS + 2;
      const v2 = speedAtDist(o.x1 + ticks * v + 10_000);
      parts.push(o, rock("small", o.x1 + 2 * NACH_HALF_W + 2 * HITBOX_SHRINK + ticks * v2, group, gi));
    }
    obstacles.push(...parts);
    gi++;
    const jump = jumpOf(parts);
    // para las combinaciones, el salto que cuenta para el siguiente es el de la roca (la última pieza que se salta)
    const jumpPart = [...parts].reverse().find((o) => o.kind !== "air" || o.height === "low");
    prev = { arrive: jumpPart ? overlapTicks(jumpPart)[0] : overlapTicks(parts[0]!)[0], leave: overlapTicks(parts[parts.length - 1]!)[1], jump, high: group === "air-high" };
    arrival = prev.leave;
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
      // lo alto no molesta: no hace nada
      if (part.kind === "air" && part.height === "high") continue;
      if (part.kind === "air" && part.height === "head") {
        const [a, b] = overlapTicks(part);
        let down = Math.max(seen, a - 4 + jit(), lastDuckUp + 1);
        if (down <= lastJumpUp) down = lastJumpUp + 1;
        plan.push({ tick: down, input: "duck-down" });
        const up = Math.max(down + 1, b + 2 + jit());
        plan.push({ tick: up, input: "duck-up" });
        lastDuckUp = up;
        continue;
      }
      // las rocas (y lo bajo, que se salta como a una chica): un grupo se pasa entero con un solo salto
      const first = part;
      let last = part;
      const group: Obstacle[] = [part];
      if (part.group === "cluster") {
        while (p + 1 < parts.length) {
          p++;
          last = parts[p]!;
          group.push(last);
        }
      }
      const [a] = overlapTicks(first);
      const [, b] = overlapTicks(last);
      const h0 = Math.max(...group.map((x) => hitbox(x).y1));
      const v0 = speedAt(a);
      // largo si hay una grande o si el corto no cubre el grupo entero
      const needsLong = group.some((x) => x.kind === "big") || (part.group === "cluster" && hitbox(last).x1 - hitbox(first).x0 > jumpCoverage(SHORT, h0, v0) - 4 * v0);
      const long = needsLong ? !(shortErr > 0 && rng.int(1, 1000) <= shortErr) : false;
      const prof = long ? LONG : SHORT;
      const h = h0;
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
