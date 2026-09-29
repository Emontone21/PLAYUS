// "caminando por 18": la calle, los pastosos, la simulación y la validación,
// puras y compartidas por el cliente (para jugar y dibujar) y el servidor
// (para validar la traza). Mismo esquema que Larry y remar: 60 ticks por
// segundo, todo en enteros (16 subunidades por unidad), y el único azar sale
// de rngFromSeed con la semilla del intento.

import { rngFromSeed } from "../../lib/rng";
import { MIN_GAP_MS } from "../lib/taps";
import { elapsedMismatch } from "../lib/trace";

export const TICKS_PER_S = 60;
export const DURATION_MS = 120_000;
/** a los 120 s la partida termina: el último tick simulado es END_TICK - 1 */
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen de /finish sobre la duración real (el mismo que gameLimits) */
export const ELAPSED_SLACK_MS = 10_000;
/** entre dos toques que cuentan, en ticks (35 ms: el filtro de games/lib/taps) */
export const MIN_TAP_GAP_TICKS = Math.ceil((MIN_GAP_MS * TICKS_PER_S) / 1000);

export const SUB = 16;
export const FIELD_W = 90;
export const FIELD_H = 160;
/** la calle: veredas de 14 unidades a cada lado */
export const SIDEWALK_W = 14;

/** el personaje camina a 5 m/s: 12 ticks por metro, y la calle baja 6 unidades por metro (8 subunidades por tick) */
export const TICKS_PER_M = 12;
export const UNITS_PER_M = 6;
export const SCROLL_SUB_PER_TICK = (UNITS_PER_M * SUB) / TICKS_PER_M;
export const MAX_SCORE = Math.floor(END_TICK / TICKS_PER_M);

/** el personaje: fijo en el centro, un poco arriba del tercio de abajo, para ver venir a los de atrás */
export const WALKER_X = 45;
export const WALKER_Y = 100;
export const WALKER_W = 12;
export const WALKER_H = 18;
/** caja de choque del personaje (centro en WALKER_X, WALKER_Y) */
export const WALKER_HIT_W = 10;
export const WALKER_HIT_H = 12;

/** desde que un pastoso entra en pantalla hasta que llega pasan al menos 700 ms */
export const MIN_TRAVEL_TICKS = 42;
/** en cualquier ventana de un segundo, los toques necesarios no pasan de 6 */
export const MAX_TAPS_PER_WINDOW = 6;
export const WINDOW_TICKS = 60;
/** nunca llegan dos desde lados opuestos en la misma ventana de 400 ms */
export const OPPOSITE_TICKS = 24;

export const SIDES = ["izq", "der", "arriba", "abajo"] as const;
export type Side = (typeof SIDES)[number];
export const OPPOSITE: Record<Side, Side> = { izq: "der", der: "izq", arriba: "abajo", abajo: "arriba" };
/** los de atrás se suman desde los 10 s */
export const BEHIND_FROM_S = 10;
/** lo que dicen los pastosos al aparecer (una al azar, con la semilla) */
export const PHRASES = ["¿tenés fuego, mano?", "manito, ¿qué andás?", "¿tenés un minutito?"] as const;
export const DONPASTA_PHRASE = "¡pará, un minutito!";

export const KINDS = ["promotor", "firmas", "volantes", "celular", "donpasta"] as const;
export type Kind = (typeof KINDS)[number];
export const REGULAR_KINDS: readonly Kind[] = ["promotor", "firmas", "volantes", "celular"];

export interface KindSpec {
  /** subunidades por tick hacia el personaje (velocidad propia; la relativa suma o resta la caminata según el lado) */
  speed: number;
  /** toques para sacárselo de encima */
  hits: number;
  /** zigzag: amplitud lateral (unidades) y período (ticks); 0 si va recto */
  zigzag: number;
  zigzagPeriod: number;
  /** desde qué segundo puede aparecer */
  from: number;
  /** desde los costados: rango de y (unidades) de la puerta; el de planes sale desde más cerca */
  yMin: number;
  yMax: number;
}

export const SPECS: Record<Kind, KindSpec> = {
  promotor: { speed: 14, hits: 1, zigzag: 0, zigzagPeriod: 1, from: 0, yMin: 10, yMax: 60 },
  firmas: { speed: 11, hits: 1, zigzag: 0, zigzagPeriod: 1, from: 0, yMin: 10, yMax: 70 },
  volantes: { speed: 8, hits: 1, zigzag: 6, zigzagPeriod: 40, from: 10, yMin: 10, yMax: 70 },
  celular: { speed: 12, hits: 1, zigzag: 0, zigzagPeriod: 1, from: 30, yMin: 45, yMax: 80 },
  donpasta: { speed: 6, hits: 4, zigzag: 0, zigzagPeriod: 1, from: 20, yMin: 10, yMax: 50 },
};

/** la velocidad relativa al personaje según de dónde viene: de adelante suma la caminata, de atrás la descuenta a medias */
export function relativeSpeed(kind: Kind, side: Side): number {
  const v = SPECS[kind].speed;
  if (side === "arriba") return v + SCROLL_SUB_PER_TICK;
  if (side === "abajo") return Math.max(4, v - SCROLL_SUB_PER_TICK / 2);
  return v;
}

/** cajas de toque: un poco más grandes que el dibujo, para el pulgar (unidades) */
export const PASTOSO_W = 12;
export const PASTOSO_H = 16;
export const TAP_MARGIN = 3;
export const DONPASTA_W = 14;
export const DONPASTA_H = 18;
/** cada toque a don pasta lo hace retroceder esto (subunidades) */
export const PUSHBACK = 6 * SUB;
/** la puerta: x del centro del pastoso al salir (izquierda o derecha) */
export const DOOR_X_LEFT = 5;
export const DOOR_X_RIGHT = FIELD_W - 5;
/** por arriba y por abajo entran asomando en el borde de la pantalla (los 700 ms se cuentan desde que se ven), sobre la calzada */
export const TOP_Y = 2;
export const BOTTOM_Y = FIELD_H - 2;
export const STREET_X_MIN = SIDEWALK_W + 6;
export const STREET_X_MAX = FIELD_W - SIDEWALK_W - 6;

// ---------------------------------------------------------------------------
// cronograma de dificultad (sección 3): se interpola en ticks, con enteros
// ---------------------------------------------------------------------------

export interface ScheduleRow {
  tick: number;
  /** ticks entre pastosos (≈ 1 / pastosos por segundo) */
  interval: number;
}

export const SCHEDULE: readonly ScheduleRow[] = [
  { tick: 0, interval: 42 }, // ~1,4 por segundo
  { tick: 600, interval: 30 }, // ~2
  { tick: 1800, interval: 23 }, // ~2,6
  { tick: 3600, interval: 19 }, // ~3,2
];
export const INTERVAL_JITTER = 25;
/** don pasta: desde los 20 s, cada 25 a 35 s */
export const DONPASTA_FIRST_TICK = 20 * TICKS_PER_S;
export const DONPASTA_EVERY_MIN = 25 * TICKS_PER_S;
export const DONPASTA_EVERY_MAX = 35 * TICKS_PER_S;
/** el primero sale acá */
export const FIRST_SPAWN_TICK = 30;

function lerpInt(a: number, b: number, num: number, den: number): number {
  return a + Math.floor(((b - a) * num) / den);
}

export function intervalAt(tick: number): number {
  const t = Math.max(0, Math.min(tick, SCHEDULE[SCHEDULE.length - 1]!.tick));
  let i = 0;
  while (i < SCHEDULE.length - 2 && t >= SCHEDULE[i + 1]!.tick) i++;
  const a = SCHEDULE[i]!;
  const b = SCHEDULE[i + 1]!;
  return lerpInt(a.interval, b.interval, t - a.tick, b.tick - a.tick);
}

/** los tipos que pueden salir en el tick dado */
export function kindsAt(tick: number): Kind[] {
  return REGULAR_KINDS.filter((k) => tick >= SPECS[k].from * TICKS_PER_S);
}

// ---------------------------------------------------------------------------
// la calle: todos los pastosos de la partida, generados de una vez
// ---------------------------------------------------------------------------

export interface Spawn {
  kind: Kind;
  /** tick en que aparece */
  tick: number;
  /** por dónde entra */
  side: Side;
  /** centro al salir, en unidades */
  x: number;
  y: number;
  /** tick en que llegaría al personaje sin que nadie lo toque (la misma simulación) */
  arrive: number;
  /** cuál de las tres frases dice (los comunes; -1 don pasta) */
  phrase: number;
}

/** distancia entera en subunidades: max + min/2 (siempre a menos de un 12 % de la real; es la misma en la generación y en la simulación) */
function roughDist(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return Math.max(ax, ay) + Math.floor(Math.min(ax, ay) / 2) || 1;
}

/** un paso hacia el personaje (con el zigzag del tipo), en subunidades; `age` son los ticks desde que salió */
function moveToward(p: { x: number; y: number }, spec: KindSpec, speed: number, age: number): void {
  const dx = WALKER_X * SUB - p.x;
  const dy = WALKER_Y * SUB - p.y;
  const dist = roughDist(dx, dy);
  p.x += Math.floor((dx * speed) / dist);
  p.y += Math.floor((dy * speed) / dist);
  if (spec.zigzag) {
    const period = spec.zigzagPeriod;
    const dir = age % period < period / 2 ? 1 : -1;
    p.x += dir * Math.floor((spec.zigzag * SUB * 2) / period);
  }
}

/** ¿la caja del pastoso toca la del personaje? */
function reachedWalker(p: { x: number; y: number }): boolean {
  return Math.abs(p.x - WALKER_X * SUB) <= ((WALKER_HIT_W + PASTOSO_W) / 2) * SUB && Math.abs(p.y - WALKER_Y * SUB) <= ((WALKER_HIT_H + PASTOSO_H) / 2) * SUB;
}

/** cuántos ticks tarda un pastoso en llegar desde (x, y) por el lado `side` si nadie lo toca: la misma simulación */
const travelCache = new Map<string, number>();
export function travelOf(kind: Kind, side: Side, x: number, y: number): number {
  const key = `${kind}:${side}:${x}:${y}`;
  const cached = travelCache.get(key);
  if (cached !== undefined) return cached;
  const spec = SPECS[kind];
  const speed = relativeSpeed(kind, side);
  const p = { x: x * SUB, y: y * SUB };
  let travel = 2000;
  for (let age = 0; age < 2000; age++) {
    moveToward(p, spec, speed, age);
    if (reachedWalker(p)) {
      travel = age;
      break;
    }
  }
  travelCache.set(key, travel);
  return travel;
}

/** los lados por los que puede entrar alguien en el tick dado */
export function sidesAt(tick: number): Side[] {
  return tick >= BEHIND_FROM_S * TICKS_PER_S ? [...SIDES] : ["izq", "der", "arriba"];
}

/**
 * Genera la calle entera. Garantías (los tests las comprueban en 1.000 calles
 * y con bots):
 * - desde que un pastoso entra en pantalla hasta que llega pasan MIN_TRAVEL_TICKS o más;
 * - en cualquier ventana de WINDOW_TICKS, los toques necesarios para frenar a
 *   todos los que llegan (1 cada uno, 4 don pasta) no pasan de MAX_TAPS_PER_WINDOW;
 * - mientras don pasta está en pantalla, ningún otro llega en su mismo segundo;
 * - nunca llegan dos desde lados opuestos a menos de OPPOSITE_TICKS.
 */
export function generateStreet(seed: string): Spawn[] {
  const rng = rngFromSeed(`${seed}:18`);
  const out: Spawn[] = [];
  /** llegadas ya programadas: [tick, costo, lado] */
  const arrivals: [number, number, Side][] = [];
  const dpWindows: [number, number][] = [];

  const fits = (arrive: number, cost: number, side: Side, isDp: boolean): boolean => {
    if (!isDp) {
      for (const [a, b] of dpWindows) if (arrive >= a && arrive <= b) return false;
    }
    const near = arrivals.filter(([u]) => Math.abs(u - arrive) <= 2 * WINDOW_TICKS);
    for (const [u, , sd] of near) if (sd === OPPOSITE[side] && Math.abs(u - arrive) < OPPOSITE_TICKS) return false;
    for (const [t] of [...near, [arrive, cost, side] as [number, number, Side]]) {
      let sum = 0;
      for (const [u, c] of near) if (Math.abs(u - t) <= WINDOW_TICKS) sum += c;
      if (Math.abs(arrive - t) <= WINDOW_TICKS) sum += cost;
      if (sum > MAX_TAPS_PER_WINDOW) return false;
    }
    return true;
  };

  const place = (kind: Kind, tick: number): Spawn | null => {
    const spec = SPECS[kind];
    for (let attempt = 0; attempt < 12; attempt++) {
      const side = rng.pick(sidesAt(tick));
      let x: number;
      let y: number;
      if (side === "izq" || side === "der") {
        x = side === "izq" ? DOOR_X_LEFT : DOOR_X_RIGHT;
        y = rng.int(spec.yMin, spec.yMax);
      } else {
        x = rng.int(STREET_X_MIN, STREET_X_MAX);
        y = side === "arriba" ? TOP_Y : BOTTOM_Y;
      }
      const travel = travelOf(kind, side, x, y);
      if (travel < MIN_TRAVEL_TICKS) continue;
      const arrive = tick + travel;
      if (fits(arrive, spec.hits, side, kind === "donpasta")) {
        arrivals.push([arrive, spec.hits, side]);
        if (kind === "donpasta") dpWindows.push([tick, arrive + WINDOW_TICKS]);
        return { kind, tick, side, x, y, arrive, phrase: kind === "donpasta" ? -1 : rng.int(0, PHRASES.length - 1) };
      }
    }
    return null;
  };

  // don pasta primero: sus ventanas mandan
  let dpTick = DONPASTA_FIRST_TICK + rng.int(0, 5 * TICKS_PER_S);
  while (dpTick < END_TICK - MIN_TRAVEL_TICKS) {
    const sp = place("donpasta", dpTick);
    if (sp) out.push(sp);
    dpTick += rng.int(DONPASTA_EVERY_MIN, DONPASTA_EVERY_MAX);
  }
  // los comunes, según el cronograma
  let t = FIRST_SPAWN_TICK;
  while (t < END_TICK) {
    const sp = place(rng.pick(kindsAt(t)), t);
    if (sp) out.push(sp);
    // si no entró, el hueco del cronograma queda vacío
    t += Math.max(6, Math.floor((intervalAt(t) * rng.int(100 - INTERVAL_JITTER, 100 + INTERVAL_JITTER)) / 100));
  }
  out.sort((a, b) => a.tick - b.tick || a.arrive - b.arrive);
  return out;
}

// ---------------------------------------------------------------------------
// la simulación, paso a paso
// ---------------------------------------------------------------------------

export type Phase = "viene" | "se-va" | "agarra";

export interface Pastoso {
  /** índice en la calle */
  i: number;
  kind: Kind;
  /** centro, en subunidades */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  phase: Phase;
  hits: number;
  /** hasta qué tick se ve el globo */
  sayUntil: number;
  /** hasta qué tick retrocede (don pasta tocado) */
  pushedUntil: number;
  /** cuándo lo tocaron por última vez (para la cara) */
  hitAt: number;
  /** tick desde el que se está yendo o agarrando */
  since: number;
}

export type EndReason = "frenado" | "tiempo";

export interface SimState {
  tick: number;
  next: number;
  pastosos: Pastoso[];
  end: { tick: number; reason: EndReason } | null;
  /** quién lo frenó (índice en la calle), para dibujar */
  grabbedBy: number | null;
  tapsDone: number;
}

export function initialState(): SimState {
  return { tick: 0, next: 0, pastosos: [], end: null, grabbedBy: null, tapsDone: 0 };
}

export function metersOf(tick: number): number {
  return Math.floor(tick / TICKS_PER_M);
}

export function boxOf(p: Pastoso): { w: number; h: number } {
  return p.kind === "donpasta" ? { w: DONPASTA_W + 2 * TAP_MARGIN, h: DONPASTA_H + 2 * TAP_MARGIN } : { w: PASTOSO_W + 2 * TAP_MARGIN, h: PASTOSO_H + 2 * TAP_MARGIN };
}

/** ¿la caja de toque del pastoso contiene el punto (unidades)? */
export function contains(p: Pastoso, x: number, y: number): boolean {
  const b = boxOf(p);
  return Math.abs(x * SUB - p.x) <= (b.w / 2) * SUB && Math.abs(y * SUB - p.y) <= (b.h / 2) * SUB;
}

function distToWalker2(p: Pastoso): number {
  const dx = p.x - WALKER_X * SUB;
  const dy = p.y - WALKER_Y * SUB;
  return dx * dx + dy * dy;
}

/** el pastoso que recibe un toque en (x, y): el que contiene el punto y está más cerca del personaje, o null */
export function targetOf(state: SimState, x: number, y: number): Pastoso | null {
  let best: Pastoso | null = null;
  for (const p of state.pastosos) {
    if (p.phase !== "viene") continue;
    if (!contains(p, x, y)) continue;
    if (!best || distToWalker2(p) < distToWalker2(best)) best = p;
  }
  return best;
}

/** un toque en unidades lógicas (solo los que contaron van a la traza) */
export type TapEvent = { tick: number; x: number; y: number };

/** cuántos ticks dura el "¡uh, bueno!" y la vuelta a la puerta */
export const LEAVE_TICKS = 50;
export const BUBBLE_TICKS = 70;

/**
 * Avanza un tick. `taps` son los toques de este tick (unidades). Devuelve
 * cuáles contaron. Orden: aparecen los del tick, se aplican los toques, se
 * mueven, y si alguno llega la partida termina en el acto. Muta el estado.
 */
export function step(state: SimState, street: readonly Spawn[], taps: readonly { x: number; y: number }[] = []): TapEvent[] {
  const counted: TapEvent[] = [];
  if (state.end) return counted;
  const t = state.tick;

  while (state.next < street.length && street[state.next]!.tick <= t) {
    const s = street[state.next]!;
    state.pastosos.push({ i: state.next, kind: s.kind, x: s.x * SUB, y: s.y * SUB, prevX: s.x * SUB, prevY: s.y * SUB, phase: "viene", hits: 0, sayUntil: t + BUBBLE_TICKS, pushedUntil: 0, hitAt: -1, since: t });
    state.next++;
  }

  for (const tap of taps) {
    const p = targetOf(state, tap.x, tap.y);
    if (!p) continue;
    counted.push({ tick: t, x: tap.x, y: tap.y });
    state.tapsDone++;
    p.hits++;
    p.hitAt = t;
    if (p.hits >= SPECS[p.kind].hits) {
      p.phase = "se-va";
      p.since = t;
      p.sayUntil = t + BUBBLE_TICKS;
    } else {
      p.pushedUntil = t + 8;
    }
  }

  const keep: Pastoso[] = [];
  for (const p of state.pastosos) {
    p.prevX = p.x;
    p.prevY = p.y;
    const spec = SPECS[p.kind];
    const s = street[p.i]!;
    if (p.phase === "viene") {
      if (t < p.pushedUntil) {
        // retrocede (don pasta tocado)
        const dx = WALKER_X * SUB - p.x;
        const dy = WALKER_Y * SUB - p.y;
        const dist = roughDist(dx, dy);
        p.x -= Math.floor((dx * PUSHBACK) / 8 / dist);
        p.y -= Math.floor((dy * PUSHBACK) / 8 / dist);
      } else {
        moveToward(p, spec, relativeSpeed(p.kind, s.side), t - s.tick);
      }
      if (reachedWalker(p)) {
        // un toque y perdés (si llegan dos en el mismo tick, los dos lo agarran)
        p.phase = "agarra";
        p.since = t;
        p.sayUntil = 0;
        if (!state.end) {
          state.grabbedBy = p.i;
          state.end = { tick: t + 1, reason: "frenado" };
        }
      }
      keep.push(p);
    } else if (p.phase === "agarra") {
      keep.push(p);
    } else {
      // se va: vuelve a su puerta
      const dx = s.x * SUB - p.x;
      const dy = s.y * SUB - p.y;
      const dist = roughDist(dx, dy);
      const v = 14;
      if (dist <= v || t - p.since > LEAVE_TICKS * 3) continue;
      p.x += Math.floor((dx * v) / dist);
      p.y += Math.floor((dy * v) / dist);
      keep.push(p);
    }
  }
  state.pastosos = keep;
  state.tick = t + 1;
  if (!state.end && state.tick >= END_TICK) state.end = { tick: state.tick, reason: "tiempo" };
  return counted;
}

// ---------------------------------------------------------------------------
// la traza y la validación
// ---------------------------------------------------------------------------

export type EndEvent = { tick: number; fin: true };
export type TraceEvent = TapEvent | EndEvent;

export interface SimResult {
  score: number;
  endTick: number;
  endReason: EndReason | null;
  state: SimState;
}

/**
 * Corre la partida con la semilla y los toques hasta que termina o hasta
 * `untilTick`. Los toques tienen que venir en orden; acá no se valida nada.
 */
export function simulate(attemptSeed: string, taps: readonly TapEvent[], untilTick = END_TICK, street = generateStreet(attemptSeed)): SimResult {
  const state = initialState();
  let k = 0;
  while (!state.end && state.tick < untilTick) {
    const now: { x: number; y: number }[] = [];
    while (k < taps.length && taps[k]!.tick <= state.tick) {
      now.push(taps[k]!);
      k++;
    }
    step(state, street, now);
  }
  return resultOf(state);
}

function resultOf(state: SimState): SimResult {
  const endTick = state.end ? state.end.tick : state.tick;
  return { score: metersOf(endTick), endTick, endReason: state.end?.reason ?? null, state };
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
  const taps: TapEvent[] = [];
  let prev = -Infinity;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.tick) || !Number.isInteger(e.x) || !Number.isInteger(e.y) || "fin" in e) return { ok: false, reason: "toque mal armado" };
    const tick = e.tick as number;
    const x = e.x as number;
    const y = e.y as number;
    if (tick < prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= declared) return { ok: false, reason: "toque después del final" };
    if (x < 0 || x > FIELD_W || y < 0 || y > FIELD_H) return { ok: false, reason: "coordenada fuera del campo" };
    if (tick - prev < MIN_TAP_GAP_TICKS) return { ok: false, reason: "dos toques demasiado seguidos" };
    prev = tick;
    taps.push({ tick, x, y });
  }
  const sim = simulate(attemptSeed, taps, declared);
  // todos los toques de la traza tienen que haber contado: una traza con toques al vacío no es la del cliente
  if (sim.state.tapsDone !== taps.length) return { ok: false, reason: "un toque no le pegó a nadie" };
  if (sim.endTick !== declared) return { ok: false, reason: "el final no coincide con la partida" };
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(declared, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: sim.score, endTick: sim.endTick, endReason: sim.endReason };
}

/** El punto de extensión del contrato: rearma la partida y compara los metros. */
export function validate(result: { score: number; events: unknown[] }, attemptSeed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(attemptSeed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// bots: para los tests, los E2E y la herramienta de desarrollo
// ---------------------------------------------------------------------------

/** un toque por tick como máximo: (x, y) en unidades, o null */
export type Policy = (state: SimState, street: readonly Spawn[]) => { x: number; y: number } | null;

/** el jugador perfecto: toca al más cercano que esté en pantalla, en cuanto puede (respetando el intervalo mínimo) */
export function perfectPolicy(): Policy {
  let lastTap = -Infinity;
  return (state) => {
    if (state.tick - lastTap < MIN_TAP_GAP_TICKS) return null;
    let best: Pastoso | null = null;
    for (const p of state.pastosos) {
      if (p.phase !== "viene") continue;
      const x = Math.round(p.x / SUB);
      const y = Math.round(p.y / SUB);
      if (x < 0 || x > FIELD_W || y < 0 || y > FIELD_H) continue;
      if (!best || distToWalker2(p) < distToWalker2(best)) best = p;
    }
    if (!best) return null;
    lastTap = state.tick;
    return { x: Math.round(best.x / SUB), y: Math.round(best.y / SUB) };
  };
}

/** Juega con una política y devuelve la traza completa (con el cierre). */
export function playBot(attemptSeed: string, policy: Policy, untilTick = END_TICK, street = generateStreet(attemptSeed)): { events: TraceEvent[]; result: SimResult } {
  const state = initialState();
  const taps: TapEvent[] = [];
  while (!state.end && state.tick < untilTick) {
    const tap = policy(state, street);
    const counted = step(state, street, tap ? [tap] : []);
    taps.push(...counted);
  }
  const result = resultOf(state);
  return { events: [...taps, { tick: result.endTick, fin: true }], result };
}

export function perfectTrace(attemptSeed: string, untilTick = END_TICK) {
  return playBot(attemptSeed, perfectPolicy(), untilTick);
}
