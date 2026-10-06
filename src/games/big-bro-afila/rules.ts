// Reglas de "Big Bro afila": una simulación entera a 60 ticks por segundo,
// igual en el navegador y en Node. Arriba gira una horma de queso con un
// patrón de giro que sale de la semilla (tramos con una velocidad objetivo,
// alcanzada con aceleración limitada); cada toque tira una cuchilla que vuela
// 6 ticks y se clava por el punto más bajo. Si queda a menos de 9° de otra,
// rebota y se termina. Los ángulos son enteros: la vuelta son 3.600
// unidades (décimas de grado). La traza son los ticks de los tiros más el
// cierre; `validate` vuelve a jugar. Sin DOM.

import { hash32, rngFromSeed, type Rng } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const TICKS_PER_S = 60;
export const DURATION_MS = 120_000;
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen entre el tick de fin y la duración real del intento (/finish) */
export const ELAPSED_SLACK_MS = 10_000;

/** la vuelta completa */
export const TURN = 3600;
/** el ángulo del punto más bajo de la horma (0 a la derecha, creciendo hacia abajo, como el canvas) */
export const BOTTOM = 900;
/** la cuchilla vuela esto, siempre igual */
export const FLIGHT_TICKS = 6;
/** a menos de esto de otra cuchilla, choca */
export const MIN_SEPARATION = 90;
/** cada ingrediente ocupa 120 unidades: se le pega a 60 o menos de su centro */
export const INGREDIENT_HALF = 60;
/** la velocidad de giro nunca pasa de 270° por segundo: 45 unidades por tick */
export const MAX_SPEED = 45;
/** la aceleración más brusca posible (unidades por tick, por tick) */
export const MAX_ACCEL = 3;
/** el cambio de horma: se parte y entra la siguiente (no se puede tirar) */
export const BREAK_TICKS = 60;
/** después del choque, esto antes de onFinish */
export const CRASH_HOLD_TICKS = 60;
/** las cuchillas ya clavadas, con huecos de al menos esto */
export const PRE_GAP = 300;

/** el puntaje, fácil de cambiar */
export const POINTS = { knife: 1, ingredient: 5, wheel: 10, bigWheel: 25 } as const;

export const INGREDIENT_KINDS = ["tomate", "aceituna", "pepino", "panceta", "hamburguesita"] as const;
export type IngredientKind = (typeof INGREDIENT_KINDS)[number];

/** un tramo del patrón de giro: llegar a `target` (unidades por tick) y quedarse `ticks` */
export interface Segment {
  target: number;
  ticks: number;
}

export interface WheelSpec {
  /** desde 1 */
  n: number;
  big: boolean;
  /** cuchillas de la tanda */
  throws: number;
  /** ángulos relativos de las ya clavadas */
  pre: number[];
  ingredients: { angle: number; kind: IngredientKind }[];
  pattern: Segment[];
  /** aceleración de esta horma */
  accel: number;
  /** el ángulo con que entra */
  startAngle: number;
}

/** módulo positivo */
export function mod(a: number, m = TURN): number {
  return ((a % m) + m) % m;
}

/** la distancia angular más corta entre dos ángulos (0 a 1.800) */
export function angDist(a: number, b: number): number {
  const d = mod(a - b);
  return d > TURN / 2 ? TURN - d : d;
}

/** el ángulo relativo a la horma donde se clava una cuchilla que llega con la horma en `wheelAngle` */
export function relativeAngle(wheelAngle: number): number {
  return mod(BOTTOM - wheelAngle);
}

export const isBig = (n: number) => n % 5 === 0;

/** la cantidad de cosas de la horma n según la tabla */
function counts(n: number, rng: Rng): { throws: number; pre: number; ingredients: number } {
  if (n === 1) return { throws: 6, pre: 0, ingredients: 1 };
  if (n <= 3) return { throws: rng.int(7, 8), pre: rng.int(1, 2), ingredients: 2 };
  if (n === 4) return { throws: 9, pre: 2, ingredients: 2 };
  if (n === 5) return { throws: 10, pre: 3, ingredients: 3 };
  if (isBig(n)) return { throws: 12, pre: 4, ingredients: 3 };
  return { throws: Math.min(12, 10 + (n - 5)), pre: rng.int(3, 4), ingredients: rng.int(2, 3) };
}

/**
 * La velocidad de cada horma (unidades por tick; 10 son 60° por segundo):
 * la calibración (decisión 248).
 */
export const SPEEDS = {
  /** horma 1: un sentido, constante y lenta */
  first: [9, 12],
  /** hormas 2 y 3: cambia de velocidad, sin cambiar de sentido */
  changing: [10, 22],
  /** horma 4: cambia de sentido */
  reversing: [12, 24],
  /** horma grande: arranca rápido y frena, con la aceleración máxima */
  bigFast: [26, 34],
  /** de la 6 en adelante: patrones combinados; el máximo sube 2 por horma */
  combinedMin: 8,
  combinedMax: 24,
  combinedStep: 2,
} as const;

function patternFor(n: number, rng: Rng): { pattern: Segment[]; accel: number } {
  const dir = rng.int(0, 1) ? 1 : -1;
  const segs: Segment[] = [];
  if (n === 1) return { pattern: [{ target: dir * rng.int(SPEEDS.first[0], SPEEDS.first[1]), ticks: END_TICK }], accel: 1 };
  if (n <= 3) {
    for (let i = 0; i < 8; i++) segs.push({ target: dir * rng.int(SPEEDS.changing[0], SPEEDS.changing[1]), ticks: rng.int(60, 150) });
    return { pattern: segs, accel: 1 };
  }
  if (n === 4) {
    for (let i = 0; i < 8; i++) segs.push({ target: (i % 2 ? -dir : dir) * rng.int(SPEEDS.reversing[0], SPEEDS.reversing[1]), ticks: rng.int(70, 150) });
    return { pattern: segs, accel: 1 };
  }
  if (isBig(n)) {
    // frenadas y arranques bruscos, pero siempre con la aceleración limitada
    let d = dir;
    for (let i = 0; i < 8; i++) {
      segs.push({ target: d * Math.min(MAX_SPEED, rng.int(SPEEDS.bigFast[0], SPEEDS.bigFast[1]) + (n - 5)), ticks: rng.int(45, 100) });
      segs.push({ target: 0, ticks: rng.int(15, 40) });
      if (rng.int(0, 2) === 0) d = -d;
    }
    return { pattern: segs, accel: MAX_ACCEL };
  }
  // combinados: velocidades, sentidos y frenadas al azar
  const hi = Math.min(MAX_SPEED, SPEEDS.combinedMax + SPEEDS.combinedStep * (n - 6));
  for (let i = 0; i < 10; i++) {
    const stop = rng.int(0, 4) === 0;
    segs.push({ target: stop ? 0 : (rng.int(0, 1) ? 1 : -1) * rng.int(SPEEDS.combinedMin, hi), ticks: stop ? rng.int(15, 40) : rng.int(40, 140) });
  }
  return { pattern: segs, accel: rng.int(1, MAX_ACCEL) };
}

/** la horma n del intento: pura, igual para todo el grupo en el mismo número de intento */
export function wheelSpec(seed: string, n: number): WheelSpec {
  const rng = rngFromSeed(`afila:${seed}:${n}`);
  const c = counts(n, rng);
  const pre: number[] = [];
  for (let guard = 0; pre.length < c.pre && guard < 1000; guard++) {
    const a = rng.int(0, TURN - 1);
    if (pre.every((p) => angDist(p, a) >= PRE_GAP)) pre.push(a);
  }
  const ingredients: WheelSpec["ingredients"] = [];
  for (let guard = 0; ingredients.length < c.ingredients && guard < 1000; guard++) {
    const a = rng.int(0, TURN - 1);
    // nunca pegado a una cuchilla: el centro queda clavable con margen, y no se pisan entre ellos
    if (pre.every((p) => angDist(p, a) >= INGREDIENT_HALF + MIN_SEPARATION) && ingredients.every((g) => angDist(g.angle, a) >= 2 * INGREDIENT_HALF + 40)) {
      ingredients.push({ angle: a, kind: INGREDIENT_KINDS[rng.int(0, INGREDIENT_KINDS.length - 1)]! });
    }
  }
  const { pattern, accel } = patternFor(n, rng);
  return { n, big: isBig(n), throws: c.throws, pre, ingredients, pattern, accel, startAngle: rng.int(0, TURN - 1) };
}

// ---------------------------------------------------------------------------
// el giro
// ---------------------------------------------------------------------------

export interface Spin {
  angle: number;
  vel: number;
  /** tramo actual y cuántos ticks le quedan */
  seg: number;
  left: number;
}

export function startSpin(spec: WheelSpec): Spin {
  return { angle: spec.startAngle, vel: spec.pattern[0]!.target, seg: 0, left: spec.pattern[0]!.ticks };
}

/** un tick de giro: la velocidad va hacia el objetivo del tramo con la aceleración de la horma */
export function stepSpin(spin: Spin, spec: WheelSpec): void {
  if (spin.left <= 0) {
    spin.seg = (spin.seg + 1) % spec.pattern.length;
    spin.left = spec.pattern[spin.seg]!.ticks;
  }
  spin.left--;
  const target = spec.pattern[spin.seg]!.target;
  spin.vel += Math.max(-spec.accel, Math.min(spec.accel, target - spin.vel));
  spin.angle = mod(spin.angle + spin.vel);
}

/** la velocidad de la horma tick por tick durante `ticks` (para la herramienta y los tests) */
export function speedProfile(spec: WheelSpec, ticks: number): number[] {
  const s = startSpin(spec);
  const out: number[] = [s.vel];
  for (let i = 0; i < ticks; i++) {
    stepSpin(s, spec);
    out.push(s.vel);
  }
  return out;
}

// ---------------------------------------------------------------------------
// la partida
// ---------------------------------------------------------------------------

export type Phase = "play" | "break" | "crash";

export interface Stuck {
  rel: number;
  /** la tiró el jugador (o ya estaba) */
  thrown: boolean;
  tick: number;
}

export interface Ingredient {
  angle: number;
  kind: IngredientKind;
  /** el tick en que le pegaron (-1: sigue en el borde) */
  hitAt: number;
}

export interface Wheel {
  spec: WheelSpec;
  spin: Spin;
  stuck: Stuck[];
  ingredients: Ingredient[];
  thrown: number;
}

export interface SimState {
  tick: number;
  score: number;
  phase: Phase;
  wheel: Wheel;
  /** la que se está partiendo durante el cambio de horma */
  broken: Wheel | null;
  /** la que viene durante el cambio de horma */
  next: WheelSpec | null;
  breakUntil: number;
  /** el tick en que salió la cuchilla en vuelo (null: no hay) */
  flying: number | null;
  crashAt: number;
  crashRel: number;
  /** hormas completas */
  done: number;
  /** lo último que pasó, para dibujar y para Big Bro */
  lastThrowAt: number;
  lastIngredient: { tick: number; angle: number; kind: IngredientKind } | null;
  lastWheelPoints: number;
  seed: string;
}

function newWheel(spec: WheelSpec): Wheel {
  return {
    spec,
    spin: startSpin(spec),
    stuck: spec.pre.map((rel) => ({ rel, thrown: false, tick: -1 })),
    ingredients: spec.ingredients.map((g) => ({ ...g, hitAt: -1 })),
    thrown: 0,
  };
}

export function initialState(seed: string): SimState {
  return {
    tick: 0,
    score: 0,
    phase: "play",
    wheel: newWheel(wheelSpec(seed, 1)),
    broken: null,
    next: null,
    breakUntil: -1,
    flying: null,
    crashAt: -1,
    crashRel: -1,
    done: 0,
    lastThrowAt: -1,
    lastIngredient: null,
    lastWheelPoints: 0,
    seed,
  };
}

export type ThrowOutcome = "ok" | "volando" | "cambio" | "choco";

/** un toque en el tick actual: sale una cuchilla si se puede */
export function throwKnife(s: SimState): ThrowOutcome {
  if (s.phase === "crash") return "choco";
  if (s.phase === "break") return "cambio";
  if (s.flying !== null) return "volando";
  s.flying = s.tick;
  s.lastThrowAt = s.tick;
  return "ok";
}

/** llega la cuchilla: se clava donde está el punto más bajo, o choca */
function arrive(s: SimState): void {
  const w = s.wheel;
  s.flying = null;
  const rel = relativeAngle(w.spin.angle);
  if (w.stuck.some((k) => angDist(k.rel, rel) < MIN_SEPARATION)) {
    s.phase = "crash";
    s.crashAt = s.tick;
    s.crashRel = rel;
    return;
  }
  w.stuck.push({ rel, thrown: true, tick: s.tick });
  w.thrown++;
  s.score += POINTS.knife;
  // los ingredientes no bloquean: la cuchilla se clava igual y el ingrediente sale volando
  for (const g of w.ingredients) {
    if (g.hitAt < 0 && angDist(g.angle, rel) <= INGREDIENT_HALF) {
      g.hitAt = s.tick;
      s.score += POINTS.ingredient;
      s.lastIngredient = { tick: s.tick, angle: g.angle, kind: g.kind };
    }
  }
  if (w.thrown >= w.spec.throws) {
    const pts = w.spec.big ? POINTS.bigWheel : POINTS.wheel;
    s.score += pts;
    s.lastWheelPoints = pts;
    s.done++;
    s.phase = "break";
    s.broken = w;
    s.next = wheelSpec(s.seed, w.spec.n + 1);
    s.breakUntil = s.tick + BREAK_TICKS;
  }
}

/** avanza un tick */
export function step(s: SimState): void {
  s.tick++;
  if (s.phase === "crash") return;
  if (s.phase === "break") {
    if (s.tick >= s.breakUntil) {
      s.wheel = newWheel(s.next!);
      s.next = null;
      s.broken = null;
      s.phase = "play";
    }
    return;
  }
  stepSpin(s.wheel.spin, s.wheel.spec);
  if (s.flying !== null && s.tick - s.flying >= FLIGHT_TICKS) arrive(s);
}

/** cuántas cuchillas le quedan a Big Bro en esta tanda (sin contar la que vuela) */
export function knivesLeft(s: SimState): number {
  return s.wheel.spec.throws - s.wheel.thrown - (s.flying !== null ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Big Bro
// ---------------------------------------------------------------------------

/** las frases, fáciles de cambiar */
export const LINES = {
  done: "Despegado bro",
  crash: "Sos un sopa bro",
  sharpen: "¡afilá esa muñeca!",
  hard: "¡esta es la difícil!",
  intro: "¿le pegás a la horma?",
} as const;

/** cada 6 s, una frase entre tiros durante 2 s */
export const CHATTER_EVERY = 360;
export const CHATTER_TICKS = 120;

export type BroFace = "espera" | "tira" | "contento" | "enojado";

/** qué dice Big Bro (null: nada) y con qué cara: determinístico (la semilla elige la frase entre tiros) */
export function broSays(s: SimState): { text: string | null; face: BroFace } {
  if (s.phase === "crash") return { text: LINES.crash, face: "enojado" };
  if (s.phase === "break") return { text: LINES.done, face: "contento" };
  const face: BroFace = s.lastThrowAt >= 0 && s.tick - s.lastThrowAt < 10 ? "tira" : "espera";
  if (s.tick % CHATTER_EVERY < CHATTER_TICKS && s.tick >= CHATTER_EVERY) {
    const n = Math.floor(s.tick / CHATTER_EVERY);
    const hard = s.wheel.spec.n >= 5 && hash32(`afila-bro:${s.seed}:${n}`) % 2 === 0;
    return { text: hard ? LINES.hard : LINES.sharpen, face };
  }
  return { text: null, face };
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

export type ThrowEvent = { tick: number };
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = ThrowEvent | EndEvent;

export type Parsed = { ok: true; throws: number[]; endTick: number } | { ok: false; reason: string };

export function parseTrace(events: unknown): Parsed {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > END_TICK / FLIGHT_TICKS + 2) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const throws: number[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Partial<ThrowEvent> | null;
    if (!e || typeof e !== "object" || "fin" in e || !Number.isInteger(e.tick)) return { ok: false, reason: "tiro mal armado" };
    const tick = e.tick as number;
    if (tick < 0 || tick <= prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= endTick) return { ok: false, reason: "tiro después del final" };
    prev = tick;
    throws.push(tick);
  }
  return { ok: true, throws, endTick };
}

export type SimResult = { ok: true; state: SimState } | { ok: false; reason: string };

/** vuelve a jugar: cada tiro en su tick y hasta endTick; un tiro que no podía salir invalida la partida */
export function simulate(seed: string, throws: readonly number[], endTick: number): SimResult {
  const s = initialState(seed);
  let k = 0;
  while (s.tick <= endTick) {
    while (k < throws.length && throws[k] === s.tick) {
      const out = throwKnife(s);
      if (out === "volando") return { ok: false, reason: "tiro con otra cuchilla en vuelo" };
      if (out === "cambio") return { ok: false, reason: "tiro durante el cambio de horma" };
      if (out === "choco") return { ok: false, reason: "tiro después del choque" };
      k++;
    }
    if (s.tick === endTick) break;
    step(s);
  }
  return { ok: true, state: s };
}

export type CheckResult = { ok: true; score: number; done: number; wheel: number; crashed: boolean; endTick: number; state: SimState } | { ok: false; reason: string };

export function check(seed: string, events: unknown, elapsedMs?: number): CheckResult {
  const p = parseTrace(events);
  if (!p.ok) return p;
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(p.endTick, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  const r = simulate(seed, p.throws, p.endTick);
  if (!r.ok) return r;
  const s = r.state;
  return { ok: true, score: s.score, done: s.done, wheel: s.wheel.spec.n, crashed: s.phase === "crash", endTick: p.endTick, state: s };
}

export function validate(result: { score: number; events: unknown[] }, seed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(seed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// el jugador automático
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** error de tiempo: tira hasta ±jitter ticks antes o después del momento justo */
  jitter?: number;
  /** ticks que espera después de que se clava la anterior: mínimo y máximo */
  wait?: [number, number];
  /** por mil: con qué frecuencia apunta a un ingrediente en vez de al hueco más grande */
  greedPerMille?: number;
  /** hasta qué tick juega */
  untilTick?: number;
  /** deja de tirar al empezar esta horma */
  stopAtWheel?: number;
  botSeed?: string;
}

/** los ángulos de la horma de los próximos `n` ticks si nadie toca (copia del giro) */
function futureAngles(w: Wheel, n: number): number[] {
  const spin = { ...w.spin };
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    stepSpin(spin, w.spec);
    out.push(spin.angle);
  }
  return out;
}

/** el hueco más grande entre las cuchillas clavadas: su centro y su ancho (sin cuchillas, un ingrediente y la vuelta entera) */
export function biggestGap(w: Wheel): { center: number; width: number } {
  const rels = w.stuck.map((k) => k.rel).sort((a, b) => a - b);
  if (rels.length === 0) return { center: w.ingredients[0]?.angle ?? 0, width: TURN };
  let best = -1;
  let center = 0;
  for (let i = 0; i < rels.length; i++) {
    const a = rels[i]!;
    const b = i + 1 < rels.length ? rels[i + 1]! : rels[0]! + TURN;
    if (b - a > best) {
      best = b - a;
      center = mod(a + Math.floor((b - a) / 2));
    }
  }
  return { center, width: best };
}

/** qué tan lejos queda un ángulo relativo de la cuchilla clavada más cercana */
export function clearance(w: Wheel, rel: number): number {
  let d = TURN;
  for (const k of w.stuck) d = Math.min(d, angDist(k.rel, rel));
  return d;
}

/** el margen que busca el jugador automático: 150 unidades, o lo que dé el hueco más grande */
export const BOT_CLEARANCE = MIN_SEPARATION + 60;

/** el horizonte de búsqueda del jugador automático */
const LOOKAHEAD = 600;

/**
 * Un jugador que mira la horma y tira cuando el lugar elegido (el centro del
 * hueco más grande, o a veces un ingrediente libre) va a pasar por abajo justo
 * cuando llegue la cuchilla; con `jitter`, se equivoca de tiempo.
 */
export function botTrace(seed: string, opts: BotOptions = {}): { events: TraceEvent[]; state: SimState } {
  const jitter = opts.jitter ?? 0;
  const [w0, w1] = opts.wait ?? [0, 0];
  const greed = opts.greedPerMille ?? 0;
  const until = Math.min(END_TICK, opts.untilTick ?? END_TICK);
  const rng = rngFromSeed(`afila-bot:${opts.botSeed ?? seed}`);
  const s = initialState(seed);
  const throws: number[] = [];
  let plan = -1;
  let readyAt = 0;
  let lastThrown = -1;
  let stopped = false;
  while (s.tick < until && s.phase !== "crash") {
    if (opts.stopAtWheel !== undefined && s.wheel.spec.n >= opts.stopAtWheel && s.phase === "play") {
      stopped = true;
      break;
    }
    if (s.phase === "play" && s.flying === null) {
      if (s.wheel.thrown !== lastThrown) {
        // se clavó una: espera un poco y vuelve a apuntar
        lastThrown = s.wheel.thrown;
        plan = -1;
        readyAt = s.tick + (w1 > 0 ? rng.int(w0, w1) : 0);
      }
      if (plan < 0 && s.tick >= readyAt) {
        const w = s.wheel;
        // a veces va por un ingrediente libre; si no, por cualquier lugar con margen (el centro del hueco más grande, si es lo único que queda)
        let target = -1;
        if (greed > 0 && rng.int(1, 1000) <= greed) {
          const free = w.ingredients.filter((g) => g.hitAt < 0 && clearance(w, g.angle) >= MIN_SEPARATION + 20);
          if (free.length) target = free[rng.int(0, free.length - 1)]!.angle;
        }
        const gap = biggestGap(w);
        const ahead = futureAngles(w, LOOKAHEAD + FLIGHT_TICKS);
        for (let u = 0; u < LOOKAHEAD; u++) {
          // si tira en tick + u, llega con la horma en ahead[u + FLIGHT - 1]
          const a = ahead[u + FLIGHT_TICKS - 1]!;
          const prevA = u + FLIGHT_TICKS - 2 >= 0 ? ahead[u + FLIGHT_TICKS - 2]! : w.spin.angle;
          const half = Math.floor(angDist(a, prevA) / 2) + 1;
          const rel = relativeAngle(a);
          const good = target >= 0 ? angDist(rel, target) <= half : clearance(w, rel) >= Math.min(BOT_CLEARANCE, Math.floor(gap.width / 2) - half);
          if (good) {
            plan = s.tick + u + (jitter > 0 ? rng.int(-jitter, jitter) : 0);
            if (plan < s.tick) plan = s.tick;
            break;
          }
        }
        // no pasa en el horizonte (frenada larga): vuelve a mirar en un rato
        if (plan < 0) readyAt = s.tick + 30;
      }
      if (plan >= 0 && s.tick >= plan) {
        if (throwKnife(s) === "ok") throws.push(s.tick);
        plan = -1;
      }
    }
    step(s);
  }
  // con stopAtWheel se queda en el primer tick de esa horma (la herramienta arranca ahí)
  const end = s.phase === "crash" ? Math.min(END_TICK, s.crashAt + CRASH_HOLD_TICKS) : stopped ? Math.max(1, s.tick) : until;
  while (s.tick < end) step(s);
  return { events: [...throws.map((tick) => ({ tick })), { tick: end, fin: true }], state: s };
}

/** el jugador modelo de la calibración (decisión 248) */
export const MODEL: BotOptions = { jitter: 4, wait: [10, 30], greedPerMille: 250 };

// ---------------------------------------------------------------------------
// la cota
// ---------------------------------------------------------------------------

/**
 * Lo más que se puede sumar en 120 s según el cronograma: cada horma tarda al
 * menos sus tiros × 6 ticks más el cambio, y da a lo sumo sus cuchillas, 3
 * ingredientes y su bonus; se cuenta también la horma que queda a medias.
 */
export function maxScoreBound(): number {
  let t = 0;
  let total = 0;
  for (let n = 1; t <= END_TICK; n++) {
    const minThrows = n === 1 ? 6 : n <= 3 ? 7 : counts(n, rngFromSeed("cota")).throws;
    const maxThrows = n <= 3 && n > 1 ? 8 : minThrows;
    total += maxThrows * POINTS.knife + 3 * POINTS.ingredient + (isBig(n) ? POINTS.bigWheel : POINTS.wheel);
    t += minThrows * FLIGHT_TICKS + BREAK_TICKS;
  }
  return total;
}
export const MAX_SCORE = maxScoreBound();
