// Reglas de "la rana caza colillas": la rana de Frog en el centro, colillas y
// vapeadores que vuelan alrededor con trayectorias curvas, y la lengua que
// sale hacia donde se toca. Simulación entera a 60 ticks por segundo con 4
// subpasos para la punta de la lengua, igual en el navegador y en Node. Todo
// sale de la semilla: qué vuela, por dónde y cuándo, con dos garantías de
// justicia (ningún vapeador encima de una colilla; toda colilla tiene un
// momento con el camino libre). La traza son los toques que tiraron la lengua
// más el cierre; `validate` vuelve a jugar. Sin DOM.

import { rngFromSeed, type Rng } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";

export const TICKS_PER_S = 60;
export const DURATION_MS = 60_000;
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen entre el tick de fin y la duración real del intento (/finish) */
export const ELAPSED_SLACK_MS = 10_000;
/** después del vapeador, el final se ve esto antes de onFinish */
export const CRASH_HOLD_TICKS = 60;

/** el campo: un cuadrado de 0 a FIELD en unidades lógicas; la boca en el centro */
export const FIELD = 4096;
export const MOUTH = { x: 2048, y: 2048 } as const;
/** el alcance de la lengua: un círculo que cubre casi toda el área */
export const REACH = 1800;
/** la lengua recorre su alcance máximo en 150 ms */
export const TONGUE_TICKS = 9;
export const TONGUE_SPEED = REACH / TONGUE_TICKS; // 200 unidades por tick
export const SUBSTEPS = 4;
/** el radio de la punta */
export const TIP_R = 70;
/** las cajas de choque (medio ancho y medio alto) */
export const SIZES = { colilla: { hw: 200, hh: 90 }, vapo: { hw: 100, hh: 150 } } as const;
/** separación mínima entre la caja de un vapeador y la de una colilla */
export const GAP = 90;
/** desde acá algunos vapeadores escoltan colillas */
export const ESCORT_FROM_TICK = 1800;
/** cota: un lengüetazo no dura menos de 2 ticks */
export const MAX_SCORE = END_TICK / 2;

export type Kind = "colilla" | "vapo";
export interface Pt {
  x: number;
  y: number;
}

/** una cosa que vuela: entra por un borde, hace 2 o 3 tramos curvos y sale por otro */
export interface Thing {
  id: number;
  kind: Kind;
  spawn: number;
  /** ticks que dura su vuelo */
  life: number;
  /** los puntos por los que pasa (el primero y el último, en los bordes) */
  pts: Pt[];
  /** un punto de control por tramo */
  ctrl: Pt[];
  /** si escolta a una colilla, su id */
  escortOf: number | null;
}

// ---------------------------------------------------------------------------
// dificultad
// ---------------------------------------------------------------------------

export interface Difficulty {
  countMin: number;
  countMax: number;
  /** ticks de vuelo */
  lifeMin: number;
  lifeMax: number;
  /** por ciento de vapeadores */
  vapoPct: number;
  /** cuánto se cierran las curvas (0 a 100) */
  curl: number;
}

const TABLE: readonly (Difficulty & { at: number })[] = [
  { at: 0, countMin: 3, countMax: 4, lifeMin: 420, lifeMax: 540, vapoPct: 10, curl: 25 },
  { at: 1200, countMin: 5, countMax: 6, lifeMin: 280, lifeMax: 380, vapoPct: 20, curl: 45 },
  { at: 2400, countMin: 6, countMax: 8, lifeMin: 190, lifeMax: 260, vapoPct: 30, curl: 70 },
  { at: 3600, countMin: 8, countMax: 9, lifeMin: 140, lifeMax: 190, vapoPct: 40, curl: 90 },
];

function lerp(a: number, b: number, t0: number, t1: number, t: number): number {
  if (t <= t0) return a;
  if (t >= t1) return b;
  return a + Math.floor(((b - a) * (t - t0)) / (t1 - t0));
}

export function difficultyAt(tick: number): Difficulty {
  const t = Math.max(0, Math.min(END_TICK, tick));
  let i = 0;
  while (i < TABLE.length - 2 && t >= TABLE[i + 1]!.at) i++;
  const a = TABLE[i]!;
  const b = TABLE[i + 1]!;
  const L = (k: keyof Difficulty) => lerp(a[k], b[k], a.at, b.at, t);
  return { countMin: L("countMin"), countMax: L("countMax"), lifeMin: L("lifeMin"), lifeMax: L("lifeMax"), vapoPct: L("vapoPct"), curl: L("curl") };
}

// ---------------------------------------------------------------------------
// las trayectorias
// ---------------------------------------------------------------------------

const Q = 4096;

/** la posición en el cuarto de tick `tq` desde que apareció (0 ≤ tq < life × 4) */
export function posAt(th: Thing, tq: number): Pt {
  const segs = th.ctrl.length;
  const total = th.life * SUBSTEPS;
  const clamped = Math.max(0, Math.min(total, tq));
  let seg = Math.floor((clamped * segs) / total);
  if (seg >= segs) seg = segs - 1;
  const segStart = Math.floor((seg * total) / segs);
  const segEnd = Math.floor(((seg + 1) * total) / segs);
  const u = Math.floor(((clamped - segStart) * Q) / Math.max(1, segEnd - segStart));
  const v = Q - u;
  const p0 = th.pts[seg]!;
  const c = th.ctrl[seg]!;
  const p1 = th.pts[seg + 1]!;
  return {
    x: Math.floor((v * v * p0.x + 2 * v * u * c.x + u * u * p1.x) / (Q * Q)),
    y: Math.floor((v * v * p0.y + 2 * v * u * c.y + u * u * p1.y) / (Q * Q)),
  };
}

/** ¿está en vuelo en el tick `t`? */
export function alive(th: Thing, t: number): boolean {
  return t >= th.spawn && t < th.spawn + th.life;
}

function clampPt(p: Pt): Pt {
  return { x: Math.max(-300, Math.min(FIELD + 300, p.x)), y: Math.max(-300, Math.min(FIELD + 300, p.y)) };
}

/** un punto en un borde (0 arriba, 1 derecha, 2 abajo, 3 izquierda), un poco afuera */
function borderPoint(side: number, rng: Rng): Pt {
  const along = rng.int(300, FIELD - 300);
  if (side === 0) return { x: along, y: -220 };
  if (side === 1) return { x: FIELD + 220, y: along };
  if (side === 2) return { x: along, y: FIELD + 220 };
  return { x: -220, y: along };
}

/** una trayectoria de 2 o 3 tramos con cambios de dirección suaves (el control siguiente refleja al anterior) */
function makePath(rng: Rng, d: Difficulty): { pts: Pt[]; ctrl: Pt[] } {
  const side = rng.int(0, 3);
  const exit = (side + rng.int(1, 3)) % 4;
  const segs = rng.next() < 0.5 ? 2 : 3;
  const pts: Pt[] = [borderPoint(side, rng)];
  for (let i = 1; i < segs; i++) pts.push({ x: rng.int(700, FIELD - 700), y: rng.int(700, FIELD - 700) });
  pts.push(borderPoint(exit, rng));
  const ctrl: Pt[] = [];
  const bend = 300 + Math.floor((d.curl * 900) / 100);
  const first = { x: Math.floor((pts[0]!.x + pts[1]!.x) / 2) + rng.int(-bend, bend), y: Math.floor((pts[0]!.y + pts[1]!.y) / 2) + rng.int(-bend, bend) };
  ctrl.push(clampPt(first));
  for (let i = 1; i < segs; i++) {
    // suave: el control refleja al anterior respecto del punto compartido
    const prev = ctrl[i - 1]!;
    const p = pts[i]!;
    ctrl.push(clampPt({ x: 2 * p.x - prev.x, y: 2 * p.y - prev.y }));
  }
  return { pts, ctrl };
}

// ---------------------------------------------------------------------------
// geometría de choque
// ---------------------------------------------------------------------------

/** ¿la punta (círculo) toca la caja de la cosa, centrada en `c`? */
export function tipHits(tip: Pt, c: Pt, kind: Kind, extra = 0): boolean {
  const s = SIZES[kind];
  const dx = Math.max(Math.abs(tip.x - c.x) - (s.hw + extra), 0);
  const dy = Math.max(Math.abs(tip.y - c.y) - (s.hh + extra), 0);
  return dx * dx + dy * dy <= TIP_R * TIP_R;
}

/** ¿las cajas de dos cosas quedan a menos de `gap`? */
export function boxesTooClose(a: Pt, ka: Kind, b: Pt, kb: Kind, gap: number): boolean {
  const sa = SIZES[ka];
  const sb = SIZES[kb];
  return Math.abs(a.x - b.x) < sa.hw + sb.hw + gap && Math.abs(a.y - b.y) < sa.hh + sb.hh + gap;
}

function dist(a: Pt, b: Pt): number {
  return Math.floor(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
}

/** el punto que la lengua alcanza si se apunta a `p` (recortado al alcance) */
export function clampToReach(p: Pt): Pt {
  const dx = p.x - MOUTH.x;
  const dy = p.y - MOUTH.y;
  const d = Math.floor(Math.sqrt(dx * dx + dy * dy));
  if (d <= REACH) return { x: p.x, y: p.y };
  return { x: MOUTH.x + Math.floor((dx * REACH) / d), y: MOUTH.y + Math.floor((dy * REACH) / d) };
}

/** cuántos ticks tarda la lengua en llegar a un punto (ya recortado) */
export function tongueTicksTo(p: Pt): number {
  return Math.max(1, Math.ceil(dist(MOUTH, p) / TONGUE_SPEED));
}

/** la punta en el subpaso `n` (1 a ticks × SUBSTEPS) de una ida hacia `target` */
export function tipAt(target: Pt, ticks: number, n: number): Pt {
  const total = ticks * SUBSTEPS;
  return { x: MOUTH.x + Math.floor(((target.x - MOUTH.x) * n) / total), y: MOUTH.y + Math.floor(((target.y - MOUTH.y) * n) / total) };
}

/**
 * ¿una lengua tirada hacia `p` en el tick `t` tocaría algún vapeador antes de
 * llegar? La misma cuenta que la simulación: la punta en cada subpaso contra
 * los vapeadores donde van a estar en ese momento.
 */
export function lickBlocked(things: readonly Thing[], p: Pt, t: number): boolean {
  const target = clampToReach(p);
  const ticks = tongueTicksTo(target);
  for (let k = 1; k <= ticks; k++) {
    const tt = t + k;
    for (let sub = 1; sub <= SUBSTEPS; sub++) {
      const tip = tipAt(target, ticks, (k - 1) * SUBSTEPS + sub);
      for (const th of things) {
        if (th.kind !== "vapo" || !alive(th, tt)) continue;
        if (tipHits(tip, posAt(th, (tt - th.spawn - 1) * SUBSTEPS + sub), "vapo")) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// la generación (con las garantías de justicia)
// ---------------------------------------------------------------------------

export interface Course {
  things: Thing[];
}

/** ¿la colilla tiene algún momento con el camino libre y al alcance, dadas estas cosas? */
export function hasFreeMoment(colilla: Thing, things: readonly Thing[]): boolean {
  for (let t = colilla.spawn; t < colilla.spawn + colilla.life; t += 3) {
    const c = posAt(colilla, (t - colilla.spawn) * SUBSTEPS);
    if (dist(MOUTH, c) > REACH - 40) continue;
    if (!lickBlocked(things, c, t)) return true;
  }
  return false;
}

/** ¿este vapeador queda alguna vez encima (o pegado) de alguna colilla en vuelo? */
function vapoOverlaps(vapo: Thing, things: readonly Thing[]): boolean {
  for (const other of things) {
    if (other.kind !== "colilla") continue;
    const from = Math.max(vapo.spawn, other.spawn);
    const to = Math.min(vapo.spawn + vapo.life, other.spawn + other.life);
    for (let t = from; t < to; t += 2) {
      if (boxesTooClose(posAt(vapo, (t - vapo.spawn) * SUBSTEPS), "vapo", posAt(other, (t - other.spawn) * SUBSTEPS), "colilla", GAP)) return true;
    }
  }
  return false;
}

export function generateCourse(seed: string): Course {
  const rng = rngFromSeed(`rana:${seed}`);
  const things: Thing[] = [];
  let nextId = 1;
  let desired = 3;
  let lastSpawn = -100;
  const activeAt = (t: number) => things.filter((th) => alive(th, t));
  for (let t = 0; t < END_TICK; t++) {
    const d = difficultyAt(t);
    if (t % 120 === 0) desired = rng.int(d.countMin, d.countMax);
    const act = activeAt(t);
    if (act.length >= desired || t - lastSpawn < 8) continue;
    const wantVapo = rng.int(1, 100) <= d.vapoPct && act.some((th) => th.kind === "colilla");
    let placed = false;
    for (let attempt = 0; attempt < 10 && !placed; attempt++) {
      const path = makePath(rng, d);
      const life = rng.int(d.lifeMin, d.lifeMax);
      const th: Thing = { id: nextId, kind: wantVapo ? "vapo" : "colilla", spawn: t, life, pts: path.pts, ctrl: path.ctrl, escortOf: null };
      const context = things.filter((x) => x.spawn + x.life > t);
      if (th.kind === "vapo") {
        if (vapoOverlaps(th, context)) continue;
        // ninguna colilla en vuelo se queda sin su momento libre por culpa de este
        const withIt = [...context, th];
        if (context.some((c) => c.kind === "colilla" && !hasFreeMoment(c, withIt))) continue;
      } else {
        // ningún vapeador ya planeado puede quedar encima de esta colilla, y tiene que tener su momento libre
        if (context.some((v) => v.kind === "vapo" && vapoOverlaps(v, [th]))) continue;
        if (!hasFreeMoment(th, context)) continue;
      }
      things.push(th);
      nextId++;
      placed = true;
      lastSpawn = t;
      // desde los 30 s, algunas colillas vienen escoltadas por un vapeador que vuela pegado a ellas
      if (th.kind === "colilla" && t >= ESCORT_FROM_TICK && rng.int(1, 100) <= 45) {
        for (let k = 0; k < 8; k++) {
          const ang = rng.int(0, 7);
          const r = 420 + rng.int(0, 120);
          const off = { x: [r, r, 0, -r, -r, -r, 0, r][ang]!, y: [0, r, r, r, 0, -r, -r, -r][ang]! };
          const esc: Thing = {
            id: nextId,
            kind: "vapo",
            spawn: t,
            life,
            pts: th.pts.map((p) => ({ x: p.x + off.x, y: p.y + off.y })),
            ctrl: th.ctrl.map((p) => ({ x: p.x + off.x, y: p.y + off.y })),
            escortOf: th.id,
          };
          const ctx2 = things.filter((x) => x.spawn + x.life > t);
          if (vapoOverlaps(esc, ctx2)) continue;
          const withIt = [...ctx2, esc];
          if (ctx2.some((c) => c.kind === "colilla" && !hasFreeMoment(c, withIt))) continue;
          things.push(esc);
          nextId++;
          break;
        }
      }
    }
  }
  return { things };
}

// ---------------------------------------------------------------------------
// la partida
// ---------------------------------------------------------------------------

export interface Tongue {
  target: Pt;
  /** ticks de la ida */
  ticks: number;
  start: number;
  /** la ida terminó (agarró algo, o llegó al final) en este tick; desde ahí vuelve */
  turnAt: number;
  /** cuánto dura la vuelta */
  back: number;
  /** la cosa que trae, si agarró una colilla */
  carrying: number | null;
  /** hasta dónde llegó la punta (para dibujar la vuelta) */
  reached: Pt;
}

export interface SimState {
  tick: number;
  score: number;
  course: Course;
  tongue: Tongue | null;
  eaten: Set<number>;
  crashed: boolean;
  crashTick: number;
  /** el último bocado (para masticar y el +1) */
  lastEatTick: number;
  licks: number;
}

export function initialState(seed: string): SimState {
  return { tick: 0, score: 0, course: generateCourse(seed), tongue: null, eaten: new Set(), crashed: false, crashTick: -1, lastEatTick: -1000, licks: 0 };
}

/** las cosas en vuelo en el tick `t`, sin las comidas */
export function visible(s: SimState, t = s.tick): Thing[] {
  return s.course.things.filter((th) => alive(th, t) && !s.eaten.has(th.id));
}

export type LickOutcome = "lengua" | "ocupada" | "fin";

/** un toque en el tick actual: tira la lengua (o no, si está afuera) */
export function applyLick(s: SimState, p: Pt): LickOutcome {
  if (s.crashed || s.tick >= END_TICK) return "fin";
  if (s.tongue) return "ocupada";
  const target = clampToReach(p);
  const ticks = tongueTicksTo(target);
  s.tongue = { target, ticks, start: s.tick, turnAt: -1, back: 0, carrying: null, reached: { ...MOUTH } };
  s.licks++;
  return "lengua";
}

/** avanza un tick: las cosas vuelan solas; la lengua sale (revisando la punta en 4 subpasos) o vuelve */
export function step(s: SimState): void {
  if (s.crashed) {
    s.tick++;
    return;
  }
  s.tick++;
  const t = s.tick;
  const tg = s.tongue;
  if (!tg) return;
  if (tg.turnAt < 0) {
    const k = t - tg.start; // 1..ticks
    for (let sub = 1; sub <= SUBSTEPS; sub++) {
      const n = (k - 1) * SUBSTEPS + sub;
      const tip = tipAt(tg.target, tg.ticks, n);
      tg.reached = tip;
      // lo primero que toca: si en el mismo subpaso toca varias, la de centro más cercano
      let best: Thing | null = null;
      let bestD = Infinity;
      for (const th of s.course.things) {
        if (!alive(th, t) || s.eaten.has(th.id)) continue;
        const c = posAt(th, (t - th.spawn - 1) * SUBSTEPS + sub);
        if (!tipHits(tip, c, th.kind)) continue;
        const dd = (c.x - tip.x) ** 2 + (c.y - tip.y) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = th;
        }
      }
      if (best) {
        if (best.kind === "vapo") {
          s.crashed = true;
          s.crashTick = t;
          return;
        }
        s.eaten.add(best.id);
        s.score++;
        s.lastEatTick = t;
        tg.carrying = best.id;
        tg.turnAt = t;
        tg.back = Math.max(1, k);
        return;
      }
    }
    if (k >= tg.ticks) {
      tg.turnAt = t;
      tg.back = tg.ticks;
    }
    return;
  }
  if (t - tg.turnAt >= tg.back) s.tongue = null;
}

/** ¿la lengua está afuera? */
export function tongueOut(s: SimState): boolean {
  return s.tongue !== null;
}

// ---------------------------------------------------------------------------
// la traza y validate
// ---------------------------------------------------------------------------

export interface LickEvent {
  tick: number;
  x: number;
  y: number;
}
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = LickEvent | EndEvent;

export type Parsed = { ok: true; licks: LickEvent[]; endTick: number } | { ok: false; reason: string };

export function parseTrace(events: unknown): Parsed {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > END_TICK + 1) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const licks: LickEvent[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Partial<LickEvent> | null;
    if (!e || typeof e !== "object" || "fin" in e || !Number.isInteger(e.tick) || !Number.isInteger(e.x) || !Number.isInteger(e.y)) return { ok: false, reason: "toque mal armado" };
    const tick = e.tick as number;
    const x = e.x as number;
    const y = e.y as number;
    if (tick < 0) return { ok: false, reason: "tick negativo" };
    if (tick <= prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= endTick) return { ok: false, reason: "toque después del final" };
    if (x < 0 || x > FIELD || y < 0 || y > FIELD) return { ok: false, reason: "coordenada fuera del área" };
    prev = tick;
    licks.push({ tick, x, y });
  }
  return { ok: true, licks, endTick };
}

export interface SimResult {
  score: number;
  crashed: boolean;
  crashTick: number;
  state: SimState;
}

export type SimError = { ok: false; reason: string };

/** vuelve a jugar; un toque con la lengua afuera es un error (el cliente no lo manda) */
export function simulate(seed: string, licks: readonly LickEvent[], endTick: number): SimResult | SimError {
  const s = initialState(seed);
  let k = 0;
  while (s.tick < endTick && !s.crashed) {
    while (k < licks.length && licks[k]!.tick === s.tick) {
      const r = applyLick(s, { x: licks[k]!.x, y: licks[k]!.y });
      if (r === "ocupada") return { ok: false, reason: "un toque con la lengua afuera" };
      k++;
    }
    step(s);
  }
  return { score: s.score, crashed: s.crashed, crashTick: s.crashTick, state: s };
}

export type CheckResult = { ok: true; score: number; endTick: number; crashed: boolean } | { ok: false; reason: string };

export function check(seed: string, events: unknown, elapsedMs?: number): CheckResult {
  const p = parseTrace(events);
  if (!p.ok) return p;
  const r = simulate(seed, p.licks, p.endTick);
  if ("ok" in r) return r;
  if (r.crashed && r.crashTick !== p.endTick) return { ok: false, reason: "el tick de fin no es el del vapeador" };
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(p.endTick, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: r.score, endTick: p.endTick, crashed: r.crashed };
}

export function validate(result: { score: number; events: unknown[] }, seed: string, meta?: { elapsedMs: number }): boolean {
  const v = check(seed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// el jugador automático
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** ticks entre que ve la colilla y tira (250 ms = 15) */
  reaction?: number;
  /** si apunta a donde va a estar la colilla cuando llegue la lengua (true) o a donde está ahora */
  lead?: boolean;
  /** error de puntería: unidades al azar que se suman al toque en cada eje (0 es el jugador justo) */
  aimError?: number;
  /** ticks que se queda mirando después de cada lengüetazo antes de buscar otra */
  pause?: number;
  /** después de comer estas, apunta a un vapeador (para el E2E); undefined: nunca */
  thenVapo?: number;
  untilTick?: number;
}

/**
 * Mira las colillas al alcance cuyo camino recto está libre de vapeadores
 * (ahora y cuando llegue la lengua), elige la más cercana y tira `reaction`
 * ticks después; mientras la lengua está afuera, espera.
 */
export function botTrace(seed: string, opts: BotOptions = {}): { events: TraceEvent[]; result: SimResult } {
  const reaction = opts.reaction ?? 15;
  const lead = opts.lead ?? true;
  const aimError = opts.aimError ?? 0;
  const pause = opts.pause ?? 0;
  const until = opts.untilTick ?? END_TICK;
  const rng = rngFromSeed(`rana-bot:${seed}`);
  const s = initialState(seed);
  const licks: LickEvent[] = [];
  let planned: { at: number; p: Pt } | null = null;
  let restUntil = 0;
  const clampField = (p: Pt): Pt => ({ x: Math.max(0, Math.min(FIELD, p.x)), y: Math.max(0, Math.min(FIELD, p.y)) });
  while (s.tick < until && !s.crashed) {
    const t = s.tick;
    if (planned && planned.at === t) {
      if (!s.tongue) {
        const p = clampField(aimError ? { x: planned.p.x + rng.int(-aimError, aimError), y: planned.p.y + rng.int(-aimError, aimError) } : planned.p);
        applyLick(s, p);
        licks.push({ tick: t, x: p.x, y: p.y });
        restUntil = t + pause;
      }
      planned = null;
    }
    if (!planned && !s.tongue && t >= restUntil) {
      const fireAt: number = t + reaction;
      if (opts.thenVapo !== undefined && s.score >= opts.thenVapo) {
        // a buscar un vapeador que esté al alcance cuando llegue la lengua
        for (const th of s.course.things) {
          if (th.kind !== "vapo" || !alive(th, fireAt)) continue;
          const now = posAt(th, (fireAt - th.spawn) * SUBSTEPS);
          if (dist(MOUTH, now) > REACH - 60) continue;
          const ticks = tongueTicksTo(now);
          const arrive = fireAt + ticks;
          if (!alive(th, arrive)) continue;
          const p = posAt(th, (arrive - th.spawn) * SUBSTEPS);
          if (dist(MOUTH, p) > REACH - 60) continue;
          planned = { at: fireAt, p: clampField(p) };
          break;
        }
      } else {
        let best: { d: number; p: Pt } | null = null;
        for (const th of s.course.things) {
          if (th.kind !== "colilla" || s.eaten.has(th.id) || !alive(th, fireAt)) continue;
          const now = posAt(th, (fireAt - th.spawn) * SUBSTEPS);
          const d0 = dist(MOUTH, now);
          if (d0 > REACH - 60) continue;
          const ticks = tongueTicksTo(now);
          const arrive = fireAt + ticks;
          if (!alive(th, arrive)) continue;
          const p = lead ? posAt(th, (arrive - th.spawn) * SUBSTEPS) : now;
          if (dist(MOUTH, p) > REACH - 60) continue;
          // solo tira cuando el camino está libre, con los vapeadores donde van a estar
          if (lickBlocked(s.course.things, p, fireAt)) continue;
          const d = dist(MOUTH, p);
          if (!best || d < best.d) best = { d, p: clampField(p) };
        }
        if (best) planned = { at: fireAt, p: best.p };
      }
    }
    step(s);
  }
  const endTick = s.crashed ? s.crashTick : Math.min(s.tick, END_TICK);
  const events: TraceEvent[] = [...licks, { tick: endTick, fin: true }];
  return { events, result: { score: s.score, crashed: s.crashed, crashTick: s.crashTick, state: s } };
}
