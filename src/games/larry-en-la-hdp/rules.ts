// Reglas de "Larry en la hdp": los pedidos salen de la semilla del intento
// (`larryOrders`), y la partida es una máquina de estados en ms desde
// onReady que avanza sola con el tiempo (comanda a la vista → armando →
// comiendo o al tacho → pedido siguiente) y con cada toque de la bandeja. El
// cliente y `validate` usan la misma máquina: el servidor rearma los pedidos
// y vuelve a jugar la traza. Sin DOM.

import { rngFromSeed } from "@/lib/rng";

export const INGREDIENTS = ["pan", "carne", "queso", "panceta", "lechuga", "tomate", "cebolla", "huevo", "pepino"] as const;
export type Ingredient = (typeof INGREDIENTS)[number];
/** los 8 del medio: todos menos el pan */
export const FILLINGS: readonly Ingredient[] = INGREDIENTS.filter((i) => i !== "pan");
/** el nombre chico debajo de cada botón */
export const NAMES: Record<Ingredient, string> = {
  pan: "pan",
  carne: "carne",
  queso: "queso",
  panceta: "panceta",
  lechuga: "lechuga",
  tomate: "tomate",
  cebolla: "cebolla",
  huevo: "huevo frito",
  pepino: "pepino",
};
/** los pares que se parecen a propósito (y los que confunde el jugador automático) */
export const LOOKALIKES: Partial<Record<Ingredient, Ingredient>> = { queso: "huevo", huevo: "queso", lechuga: "pepino", pepino: "lechuga", tomate: "panceta", panceta: "tomate" };

export const DURATION_MS = 90_000;
/** margen chico después de los 90 s (el reloj del juego y el del contenedor no son el mismo) */
export const END_MARGIN_MS = 500;
export const LIVES = 3;
/** un dedo no toca dos ingredientes en menos de esto */
export const MIN_GAP_MS = 80;
/** bien: Larry se la come y el pedido siguiente llega a los 600 ms */
export const EAT_MS = 600;
/** error: la hamburguesa al tacho y el pedido siguiente a los 800 ms */
export const TRASH_MS = 800;
/** "¿y mi hamburguesa, bro?" a los 10 s armando la misma */
export const PATIENCE_MS = 10_000;
/** el bonus se acaba a los 1.200 ms por capa */
export const LAYER_MS = 1_200;
export const BASE_POINTS = 100;
export const MAX_BONUS = 100;
/** con la tercera vida perdida, Larry de bajón esto antes de onFinish */
export const OVER_HOLD_MS = 1_000;
export const ORDER_COUNT = 40;

export interface Order {
  /** de abajo hacia arriba, con los dos panes */
  layers: Ingredient[];
  viewMs: number;
}

/** capas del medio del pedido n (desde 1) */
export function middleCount(n: number): number {
  return n <= 2 ? 2 : n <= 4 ? 3 : n <= 6 ? 4 : n <= 9 ? 5 : n <= 13 ? 6 : 7;
}

/** cuánto se ve la comanda del pedido n (desde 1) */
export function viewMsFor(n: number): number {
  if (n <= 2) return 3000;
  if (n <= 4) return 2800;
  if (n <= 6) return 2600;
  if (n <= 9) return 2400;
  return Math.max(1500, 2400 - 100 * (n - 9));
}

/** la serie de pedidos del intento: pura, igual para todo el grupo en el mismo número de intento */
export function larryOrders(seed: string): Order[] {
  const rng = rngFromSeed(`larry-hdp:${seed}`);
  const orders: Order[] = [];
  for (let n = 1; n <= ORDER_COUNT; n++) {
    const middle: Ingredient[] = [];
    for (let i = 0; i < middleCount(n); i++) {
      let pick = FILLINGS[rng.int(0, FILLINGS.length - 1)]!;
      // nunca tres iguales seguidos
      while (i >= 2 && middle[i - 1] === pick && middle[i - 2] === pick) pick = FILLINGS[rng.int(0, FILLINGS.length - 1)]!;
      middle.push(pick);
    }
    orders.push({ layers: ["pan", ...middle, "pan"], viewMs: viewMsFor(n) });
  }
  return orders;
}

/** los puntos de una hamburguesa bien armada: 100 más el bonus de rapidez */
export function burgerPoints(layers: number, buildMs: number): number {
  const limit = layers * LAYER_MS;
  return BASE_POINTS + Math.max(0, Math.round((MAX_BONUS * (limit - buildMs)) / limit));
}

// ---------------------------------------------------------------------------
// la partida
// ---------------------------------------------------------------------------

/** view: la comanda a la vista; build: armando; eat: Larry comiendo; trash: al tacho; over: sin vidas */
export type Phase = "view" | "build" | "eat" | "trash" | "over";

export interface Run {
  orders: Order[];
  /** el pedido actual (desde 0) */
  index: number;
  phase: Phase;
  /** desde cuándo (ms) está en esta fase */
  phaseAt: number;
  built: Ingredient[];
  score: number;
  lives: number;
  /** bien seguidas, sin errores en el medio */
  streak: number;
  served: number;
  errors: number;
  /** lo que se fue al tacho en el último error (para dibujarlo cayendo) */
  dropped: Ingredient[];
  lastPoints: number;
  lastServeAt: number;
  lastErrorAt: number;
  /** hasta dónde avanzó el reloj */
  t: number;
}

export function newRun(orders: Order[]): Run {
  return { orders, index: 0, phase: "view", phaseAt: 0, built: [], score: 0, lives: LIVES, streak: 0, served: 0, errors: 0, dropped: [], lastPoints: 0, lastServeAt: -1, lastErrorAt: -1, t: 0 };
}

export function currentOrder(run: Run): Order {
  return run.orders[Math.min(run.index, run.orders.length - 1)]!;
}

/** cuándo termina la fase actual (Infinity si depende de un toque) */
export function phaseEnd(run: Run): number {
  if (run.phase === "view") return run.phaseAt + currentOrder(run).viewMs;
  if (run.phase === "eat") return run.phaseAt + EAT_MS;
  if (run.phase === "trash") return run.phaseAt + TRASH_MS;
  return Infinity;
}

/** avanza el reloj hasta `t`: la comanda se tapa sola, y después de comer o tirar llega el pedido siguiente */
export function advance(run: Run, t: number): void {
  for (;;) {
    const end = phaseEnd(run);
    if (t < end) break;
    if (run.phase === "view") {
      run.phase = "build";
      run.phaseAt = end;
    } else {
      run.index++;
      run.phase = "view";
      run.phaseAt = end;
      run.built = [];
    }
  }
  if (t > run.t) run.t = t;
}

export type TapOutcome = "bien" | "servida" | "error" | "bloqueada" | "terminada";

/** un toque de la bandeja en `t` */
export function tap(run: Run, t: number, ingredient: Ingredient): TapOutcome {
  advance(run, t);
  if (run.phase === "over") return "terminada";
  if (run.phase !== "build") return "bloqueada";
  const order = currentOrder(run);
  if (ingredient === order.layers[run.built.length]) {
    run.built.push(ingredient);
    if (run.built.length < order.layers.length) return "bien";
    const points = burgerPoints(order.layers.length, t - run.phaseAt);
    run.score += points;
    run.lastPoints = points;
    run.served++;
    run.streak++;
    run.lastServeAt = t;
    run.phase = "eat";
    run.phaseAt = t;
    return "servida";
  }
  // en el acto: la hamburguesa al tacho, una vida menos
  run.dropped = [...run.built, ingredient];
  run.built = [];
  run.lives--;
  run.errors++;
  run.streak = 0;
  run.lastErrorAt = t;
  run.phase = run.lives <= 0 ? "over" : "trash";
  run.phaseAt = t;
  return "error";
}

/** ¿la bandeja responde en `t`? (sin tocar el estado) */
export function trayOpen(run: Run, t: number): boolean {
  if (run.phase === "over") return false;
  if (run.phase === "build") return true;
  return run.phase === "view" && t >= phaseEnd(run);
}

// ---------------------------------------------------------------------------
// Larry y Big Bro
// ---------------------------------------------------------------------------

export type LarryFace = "normal" | "feliz" | "asco" | "bajon";

export function larryFace(run: Run): LarryFace {
  return run.phase === "over" ? "bajon" : run.phase === "trash" ? "asco" : run.phase === "eat" ? "feliz" : "normal";
}

/** las frases, fáciles de cambiar */
export const LINES = {
  start: "atendé a Larry, asistente",
  streak: "eso, así se labura",
  error: "¿me estás jodiendo?",
  queue: "¡dale que hay cola!",
  patience: "¿y mi hamburguesa, bro?",
} as const;

/** cuánto dura cada reacción de Big Bro (ms) */
export const LINE_MS = { error: 1_500, streak: 2_000 } as const;
/** desde cuándo Big Bro apura */
export const QUEUE_AT_MS = 60_000;

/** el globo de Big Bro en `t` (null: sin globo) */
export function broLine(run: Run, t: number): string | null {
  if (run.lastErrorAt >= 0 && t - run.lastErrorAt < LINE_MS.error) return LINES.error;
  if (run.streak >= 3 && run.lastServeAt >= 0 && t - run.lastServeAt < LINE_MS.streak) return LINES.streak;
  if (t >= QUEUE_AT_MS) return LINES.queue;
  if (run.served === 0 && run.errors === 0) return LINES.start;
  return null;
}

/** lo que dice Larry: solo si lleva 10 s esperando la misma hamburguesa (no la corta) */
export function larryLine(run: Run, t: number): string | null {
  return run.phase === "build" && t - run.phaseAt >= PATIENCE_MS ? LINES.patience : null;
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

export interface TapEvent {
  /** ms desde onReady */
  t: number;
  ingredient: Ingredient;
}

export type CheckResult = { ok: true; score: number; served: number; errors: number; lives: number; orders: number; run: Run } | { ok: false; reason: string };

/** rearma los pedidos con la semilla y vuelve a jugar la traza con las mismas reglas */
export function check(seed: string, events: unknown, elapsedMs?: number): CheckResult {
  if (!Array.isArray(events)) return { ok: false, reason: "traza mal armada" };
  if (events.length > Math.ceil((DURATION_MS + END_MARGIN_MS) / MIN_GAP_MS) + 1) return { ok: false, reason: "traza demasiado larga" };
  const run = newRun(larryOrders(seed));
  let prev = -Infinity;
  for (const raw of events) {
    const e = raw as Partial<TapEvent> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.t)) return { ok: false, reason: "toque mal armado" };
    if (typeof e.ingredient !== "string" || !(INGREDIENTS as readonly string[]).includes(e.ingredient)) return { ok: false, reason: "ingrediente inexistente" };
    const t = e.t as number;
    if (t < 0) return { ok: false, reason: "tiempo negativo" };
    if (t <= prev) return { ok: false, reason: "tiempos fuera de orden" };
    if (t - prev < MIN_GAP_MS) return { ok: false, reason: "dos toques demasiado seguidos" };
    if (t > DURATION_MS + END_MARGIN_MS) return { ok: false, reason: "toque después del final" };
    prev = t;
    const out = tap(run, t, e.ingredient as Ingredient);
    if (out === "bloqueada") return { ok: false, reason: "toque con la comanda a la vista o en la pausa" };
    if (out === "terminada") return { ok: false, reason: "toque después de la tercera vida" };
  }
  if (elapsedMs !== undefined && prev > elapsedMs) return { ok: false, reason: "la partida duró más que el intento" };
  return { ok: true, score: run.score, served: run.served, errors: run.errors, lives: run.lives, orders: run.index + 1, run };
}

export function validate(result: { score: number; events: unknown[] }, seed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(seed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// el jugador automático (calibración, herramienta, cota y E2E)
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** ms desde que se tapa la comanda hasta el primer toque: mínimo y máximo */
  firstTap?: [number, number];
  /** ms entre un toque y el siguiente: mínimo y máximo */
  tapGap?: [number, number];
  /** por mil, por capa del medio: la base y cuánto suma cada capa del medio */
  errBase?: number;
  errPerLayer?: number;
  /** pedidos (desde 0) que erra a propósito en su primera capa del medio */
  failOrders?: readonly number[];
  /** hasta qué ms juega */
  until?: number;
  /** cuántos pedidos atiende (después deja de tocar) */
  maxOrders?: number;
  botSeed?: string;
}

/** juega la partida con la memoria y el pulgar de un jugador */
export function botTrace(seed: string, opts: BotOptions = {}): { events: TapEvent[]; run: Run } {
  const [f0, f1] = opts.firstTap ?? [0, 0];
  const [g0, g1] = opts.tapGap ?? [MIN_GAP_MS, MIN_GAP_MS];
  const until = opts.until ?? DURATION_MS + END_MARGIN_MS;
  const rng = rngFromSeed(`larry-hdp-bot:${opts.botSeed ?? seed}`);
  const run = newRun(larryOrders(seed));
  const events: TapEvent[] = [];
  let last = -Infinity;
  let planned = -1;
  let wrongAt = -1;
  let t = 0;
  while (run.phase !== "over") {
    if (opts.maxOrders !== undefined && run.index >= opts.maxOrders) break;
    if (run.phase !== "build") {
      t = phaseEnd(run);
      if (t > until) break;
      advance(run, t);
      continue;
    }
    const order = currentOrder(run);
    if (planned !== run.index) {
      // ¿se acuerda bien? decide al tapar la comanda dónde (si en algún lado) se equivoca
      planned = run.index;
      wrongAt = -1;
      if (opts.failOrders?.includes(run.index)) wrongAt = 1;
      else {
        const per = (opts.errBase ?? 0) + (opts.errPerLayer ?? 0) * (order.layers.length - 2);
        for (let i = 1; i < order.layers.length - 1 && wrongAt < 0; i++) if (per > 0 && rng.int(1, 1000) <= per) wrongAt = i;
      }
    }
    const i = run.built.length;
    const delay = i === 0 ? rng.int(f0, f1) : rng.int(g0, g1);
    t = Math.max(i === 0 ? run.phaseAt + delay : t + delay, last + MIN_GAP_MS);
    if (t > until) break;
    const right = order.layers[i]!;
    let ing = right;
    if (i === wrongAt) ing = LOOKALIKES[right] ?? FILLINGS[(FILLINGS.indexOf(right) + 1 + rng.int(0, FILLINGS.length - 2)) % FILLINGS.length]!;
    tap(run, t, ing);
    events.push({ t, ingredient: ing });
    last = t;
  }
  return { events, run };
}

/** el jugador modelo de la calibración (decisión 244) */
export const MODEL: BotOptions = { firstTap: [500, 900], tapGap: [380, 650], errBase: 0, errPerLayer: 10 };

/**
 * la cota: el perfecto (primer toque apenas se tapa la comanda, 80 ms entre
 * toques, nunca se equivoca, hasta el margen del final). Las capas y los
 * tiempos no dependen de la semilla, así que da lo mismo en todas.
 */
export const MAX_SCORE = botTrace("cota").run.score;
