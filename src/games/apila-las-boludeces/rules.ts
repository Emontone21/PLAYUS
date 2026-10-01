// "apila las boludeces": las reglas de la partida, compartidas por el navegador y el
// servidor. Objetos que bajan de a uno sobre una tabla: el que espera se
// hamaca de lado a lado, se puede girar de a 90° y cae donde está cuando se
// toca la pantalla. La física es de Rapier (physics.ts); acá viven la
// secuencia (de la semilla), el vaivén, el giro y la caída, el puntaje (la
// altura máxima con la torre quieta) y el final (algo se cae de la base).
//
// Todo lo que no es el motor es aritmética simple (+, −, ×, piso) sobre
// enteros y decimales cortos, igual en cualquier motor de JS. La simulación
// avanza a 60 pasos fijos por segundo; la traza son las acciones por tick
// ({ tick, action: 'rotate' | 'drop' }) y el cierre, y `validate` la vuelve a
// jugar entera con el mismo motor.

import { rngFromSeed } from "@/lib/rng";
import { elapsedMismatch } from "../lib/trace";
import { centroid, comOffsetX, KINDS, SPECS, type Kind } from "./objects";
import { addObject, allQuiet, BASE_W, createWorld, FALL_Y, loadRapier, pieceVertices, snapshot, stateOf, towerTop, type BodyRef, type BodyState, type Rapier, type World } from "./physics";

export const TICKS_PER_S = 60;
export const DURATION_MS = 120_000;
export const END_TICK = (DURATION_MS / 1000) * TICKS_PER_S;
/** margen entre el tick de fin y la duración real del intento (/finish) */
export const ELAPSED_SLACK_MS = 10_000;
/** la vista: 120 × 200 px */
export const FIELD_W = 120;
export const FIELD_H = 200;
/** cuántos objetos trae la secuencia (nadie apila más) */
export const MAX_OBJECTS = 60;
/** el vaivén: de −(media base + margen) a +(media base + margen) */
export const SWAY_MARGIN = 8;
export const SWAY_A = BASE_W / 2 + SWAY_MARGIN;
/** velocidad del vaivén (px por tick): arranca en 0,5 (30 px/s) y sube 0,05 por objeto hasta 1,6 */
export const SWAY_V0 = 0.5;
export const SWAY_DV = 0.05;
export const SWAY_VMAX = 1.6;
/** el centro del objeto que espera está a este tanto por encima del punto más alto de la torre */
export const SPAWN_ABOVE = 18;
/** la torre está quieta cuando todos los cuerpos lo están durante 300 ms seguidos */
export const QUIET_TICKS = 18;
/** el próximo objeto aparece cuando la torre está quieta (mínimo 12 ticks después de soltar) o a los 2 s */
export const NEXT_MIN_TICKS = 12;
export const NEXT_MAX_TICKS = 2 * TICKS_PER_S;
/** cota de plausibilidad: el jugador automático perfecto llega a 363 cm en 120 s (41 objetos) */
export const MAX_SCORE = 450;

export type Action = "rotate" | "drop";
export type ActionEvent = { tick: number; action: Action };
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = ActionEvent | EndEvent;
export type EndReason = "caida";

// ---------------------------------------------------------------------------
// la secuencia y el vaivén, desde la semilla
// ---------------------------------------------------------------------------

export interface Plan {
  kinds: Kind[];
  /** fase inicial del vaivén de cada objeto, en px de recorrido (0 a 4A) */
  phases: number[];
}

/** la secuencia de objetos (nunca más de dos iguales seguidos) y la fase inicial del vaivén de cada uno */
export function generatePlan(seed: string): Plan {
  const rng = rngFromSeed(`torre:${seed}`);
  const kinds: Kind[] = [];
  const phases: number[] = [];
  for (let i = 0; i < MAX_OBJECTS; i++) {
    const banned = i >= 2 && kinds[i - 1] === kinds[i - 2] ? kinds[i - 1] : null;
    const options = banned ? KINDS.filter((k) => k !== banned) : KINDS;
    kinds.push(rng.pick(options));
    phases.push(rng.int(0, 4 * SWAY_A - 1));
  }
  return { kinds, phases };
}

/** la velocidad del vaivén del objeto número `index` (px por tick) */
export function swaySpeed(index: number): number {
  return Math.min(SWAY_VMAX, SWAY_V0 + SWAY_DV * index);
}

/** dónde está el objeto que espera, `localTick` ticks después de aparecer: un triángulo entre −A y A */
export function swayX(plan: Plan, index: number, localTick: number): number {
  const period = 4 * SWAY_A;
  const pos = (plan.phases[index]! + localTick * swaySpeed(index)) % period;
  return pos < 2 * SWAY_A ? pos - SWAY_A : 3 * SWAY_A - pos;
}

// ---------------------------------------------------------------------------
// la simulación
// ---------------------------------------------------------------------------

export interface Waiting {
  index: number;
  kind: Kind;
  /** 0 a 3, de a 90° antihorario */
  rot: number;
  appearedTick: number;
  /** la altura del centro mientras espera */
  y: number;
}

export interface Sim {
  R: Rapier;
  world: World;
  plan: Plan;
  tick: number;
  bodies: BodyRef[];
  waiting: Waiting | null;
  /** cuántos objetos ya se soltaron (el índice del próximo) */
  dropped: number;
  dropTick: number;
  /** ticks seguidos con la torre quieta */
  quietTicks: number;
  /** la altura máxima con la torre quieta, en cm enteros: el puntaje */
  best: number;
  /** la última altura quieta medida (sin redondear), para la marca */
  quietTop: number;
  end: { tick: number; reason: EndReason } | null;
  /** modo libre (herramienta): lo que se cae se saca y la partida sigue */
  free: boolean;
}

export function createSim(R: Rapier, seed: string, opts: { free?: boolean } = {}): Sim {
  const sim: Sim = { R, world: createWorld(R), plan: generatePlan(seed), tick: 0, bodies: [], waiting: null, dropped: 0, dropTick: -NEXT_MAX_TICKS, quietTicks: 0, best: 0, quietTop: 0, end: null, free: !!opts.free };
  spawn(sim);
  return sim;
}

/** libera la memoria del motor; el sim no se usa más */
export function destroySim(sim: Sim): void {
  sim.world.free();
}

function spawn(sim: Sim): void {
  const index = sim.dropped;
  if (index >= MAX_OBJECTS) return;
  sim.waiting = { index, kind: sim.plan.kinds[index]!, rot: 0, appearedTick: sim.tick, y: towerTop(sim.bodies) + SPAWN_ABOVE };
}

/** la x del objeto que espera en el tick actual */
export function waitingX(sim: Sim): number | null {
  return sim.waiting ? swayX(sim.plan, sim.waiting.index, sim.tick - sim.waiting.appearedTick) : null;
}

/** aplica una acción en el tick actual; devuelve false si no corresponde (no hay objeto esperando) */
export function applyAction(sim: Sim, action: Action): boolean {
  const w = sim.waiting;
  if (!w || sim.end) return false;
  if (action === "rotate") {
    w.rot = (w.rot + 1) & 3;
    return true;
  }
  const x = swayX(sim.plan, w.index, sim.tick - w.appearedTick);
  sim.bodies.push(addObject(sim.R, sim.world, w.kind, x, w.y, w.rot));
  sim.waiting = null;
  sim.dropped++;
  sim.dropTick = sim.tick;
  sim.quietTicks = 0;
  return true;
}

/** un paso de la simulación: la física, la caída, la quietud y el próximo objeto */
export function step(sim: Sim): void {
  if (sim.end) return;
  sim.world.step();
  sim.tick++;
  // ¿algo se cayó de la base?
  for (let i = sim.bodies.length - 1; i >= 0; i--) {
    const t = sim.bodies[i]!.body.translation();
    if (t.y < FALL_Y) {
      if (sim.free) {
        sim.world.removeRigidBody(sim.bodies[i]!.body);
        sim.bodies.splice(i, 1);
      } else {
        sim.end = { tick: sim.tick, reason: "caida" };
        return;
      }
    }
  }
  // la torre quieta: 300 ms seguidos con todos los cuerpos quietos
  const quiet = sim.bodies.length > 0 && allQuiet(sim.bodies);
  sim.quietTicks = quiet ? sim.quietTicks + 1 : 0;
  if (sim.quietTicks >= QUIET_TICKS) {
    const top = towerTop(sim.bodies);
    sim.quietTop = top;
    // al cm más cercano: los contactos del motor se hunden unas centésimas
    const cm = Math.round(top);
    if (cm > sim.best) sim.best = cm;
  }
  // el próximo objeto
  if (!sim.waiting) {
    const since = sim.tick - sim.dropTick;
    if (since >= NEXT_MAX_TICKS || (since >= NEXT_MIN_TICKS && quiet)) spawn(sim);
  }
}

/** después del final: la física sigue solo para que se vea la caída (no cambia el tick ni el puntaje) */
export function stepVisual(sim: Sim): void {
  sim.world.step();
}

export function bodyStates(sim: Sim): BodyState[] {
  return sim.bodies.map(stateOf);
}

/** el tick de fin de la partida: el de la caída, o el actual */
export function endTickOf(sim: Sim): number {
  return sim.end ? sim.end.tick : sim.tick;
}

// ---------------------------------------------------------------------------
// volver a jugar una traza
// ---------------------------------------------------------------------------

export interface Replay {
  score: number;
  endTick: number;
  endReason: EndReason | null;
  dropped: number;
  bodies: BodyState[];
  /** la foto bit a bit del mundo al final */
  snapshot: string;
  /** false si alguna acción no correspondía (no había objeto esperando) */
  actionsOk: boolean;
}

/**
 * Vuelve a jugar `inputs` (ordenados por tick) hasta `untilTick` (o hasta la
 * caída) y devuelve el resultado. Libera el mundo al terminar.
 */
export function simulate(R: Rapier, seed: string, inputs: readonly ActionEvent[], untilTick = END_TICK, opts: { free?: boolean } = {}): Replay {
  const sim = createSim(R, seed, opts);
  let k = 0;
  let actionsOk = true;
  while (sim.tick < untilTick && !sim.end) {
    while (k < inputs.length && inputs[k]!.tick === sim.tick) {
      if (!applyAction(sim, inputs[k]!.action)) actionsOk = false;
      k++;
    }
    step(sim);
  }
  // acciones que quedaron después del final
  if (k < inputs.length) actionsOk = false;
  const out: Replay = { score: sim.best, endTick: endTickOf(sim), endReason: sim.end?.reason ?? null, dropped: sim.dropped, bodies: bodyStates(sim), snapshot: snapshot(sim.bodies), actionsOk };
  destroySim(sim);
  return out;
}

export type Verdict = { ok: true; score: number; endTick: number; endReason: EndReason | null; dropped: number } | { ok: false; reason: string };

function isAction(a: unknown): a is Action {
  return a === "rotate" || a === "drop";
}

/** revisa la forma de la traza: acciones bien armadas, ticks no decrecientes, antes del cierre */
export function parseTrace(events: unknown): { ok: true; inputs: ActionEvent[]; endTick: number } | { ok: false; reason: string } {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > END_TICK + 1) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > END_TICK) return { ok: false, reason: "tick de fin fuera de rango" };
  const inputs: ActionEvent[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.tick) || "fin" in e) return { ok: false, reason: "entrada mal armada" };
    if (!isAction(e.action)) return { ok: false, reason: "acción inválida" };
    const tick = e.tick as number;
    if (tick < prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= endTick) return { ok: false, reason: "acción después del final" };
    prev = tick;
    inputs.push({ tick, action: e.action });
  }
  return { ok: true, inputs, endTick };
}

/**
 * Vuelve a jugar la traza con la semilla del intento y comprueba que todo
 * cierre: la forma, cada acción con un objeto esperando, el tick de fin con
 * la caída (si la hubo) y con la duración real del intento.
 */
export function check(R: Rapier, attemptSeed: string, events: unknown, elapsedMs?: number): Verdict {
  const p = parseTrace(events);
  if (!p.ok) return p;
  const r = simulate(R, attemptSeed, p.inputs, p.endTick);
  if (!r.actionsOk) return { ok: false, reason: "una acción sin objeto esperando" };
  if (r.endReason === "caida" && r.endTick !== p.endTick) return { ok: false, reason: "el tick de fin no es el de la caída" };
  if (elapsedMs !== undefined) {
    const mismatch = elapsedMismatch(p.endTick, TICKS_PER_S, elapsedMs, ELAPSED_SLACK_MS);
    if (mismatch) return { ok: false, reason: mismatch };
  }
  return { ok: true, score: r.score, endTick: p.endTick, endReason: r.endReason, dropped: r.dropped };
}

/** el puntaje es la altura recalculada, exacta (la física es bit a bit igual en Node y en el navegador) */
export async function validate(result: { score: number; events: unknown[] }, attemptSeed: string, meta?: { elapsedMs: number }): Promise<boolean> {
  const R = await loadRapier();
  const v = check(R, attemptSeed, result.events, meta?.elapsedMs);
  return v.ok && v.score === result.score;
}

// ---------------------------------------------------------------------------
// jugadores automáticos (calibración, tests, E2E)
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** demora de reacción en ticks: ve el vaivén con este retraso */
  delayTicks?: number;
  /** error al azar en px sobre el punto de soltar (uniforme ±error) */
  errorPx?: number;
  /** error extra por cada px/tick de velocidad del vaivén (más rápido, menos preciso) */
  speedErrorPx?: number;
  /** 0: apunta al medio de la cara de arriba; 1: al centro de masa de la torre; entre medio, una mezcla */
  balance?: number;
  /** no compensa el centro de masa del objeto (deja la botella acostada por su centro geométrico) */
  naive?: boolean;
  /** acuesta el cigarro y la botella (más estable, más bajo) */
  layFlat?: boolean;
  /** semilla del azar del jugador (no del juego) */
  botSeed?: string;
  /** parar después de soltar tantos objetos */
  maxDrops?: number;
  /** a partir de este objeto (índice), soltar lejos del centro a propósito */
  missFrom?: number;
  /** modo libre: lo que se cae se saca y la partida sigue hasta el final */
  free?: boolean;
}

/**
 * Juega una partida entera: apunta al centro de lo que hay abajo (la base, o
 * el centro de masa de la torre), espera a que el vaivén pase por ahí y
 * suelta, con la demora y el error pedidos. Devuelve la traza y el resultado.
 */
export function autoTrace(R: Rapier, seed: string, opts: BotOptions = {}): { events: TraceEvent[]; result: Replay } {
  const delay = opts.delayTicks ?? 0;
  const err = opts.errorPx ?? 0;
  const rng = rngFromSeed(`bot:${opts.botSeed ?? seed}`);
  const sim = createSim(R, seed, { free: opts.free });
  const inputs: ActionEvent[] = [];
  let target = 0;
  let rotatedFor = -1;
  let aimErr = 0;
  let decidedFor = -1;
  // con maxDrops, sigue hasta que aparece el objeto siguiente (así la traza cierra después de soltar)
  while (sim.tick < END_TICK && !sim.end && !(opts.maxDrops !== undefined && sim.dropped >= opts.maxDrops && sim.waiting)) {
    const w = sim.waiting;
    if (w && decidedFor !== w.index) {
      decidedFor = w.index;
      const bal = opts.balance ?? 0;
      target = aimX(sim) * (1 - bal) + towerComX(sim) * bal;
      const e = err + (opts.speedErrorPx ?? 0) * swaySpeed(w.index);
      aimErr = e > 0 ? rng.range(-e, e) : 0;
    }
    if (w && sim.tick - w.appearedTick >= delay + 1) {
      if (opts.layFlat && rotatedFor !== w.index && (w.kind === "cigarro" || w.kind === "botella")) {
        rotatedFor = w.index;
        inputs.push({ tick: sim.tick, action: "rotate" });
        applyAction(sim, "rotate");
      }
      // lo que vio hace `delay` ticks: suelta cuando el vaivén (visto) pasa por el objetivo
      const seen = swayX(sim.plan, w.index, sim.tick - w.appearedTick - delay);
      const seenBefore = swayX(sim.plan, w.index, sim.tick - w.appearedTick - delay - 1);
      const miss = opts.missFrom !== undefined && w.index >= opts.missFrom;
      // al vacío: 5 px más allá del borde de la tabla
      const aim = miss ? BASE_W / 2 + 5 : target + aimErr - (opts.naive ? 0 : comOffsetX(w.kind, w.rot));
      if ((seenBefore - aim) * (seen - aim) <= 0 && sim.tick - w.appearedTick > delay + 1) {
        inputs.push({ tick: sim.tick, action: "drop" });
        applyAction(sim, "drop");
      }
    }
    step(sim);
  }
  const endTick = endTickOf(sim);
  const result: Replay = { score: sim.best, endTick, endReason: sim.end?.reason ?? null, dropped: sim.dropped, bodies: bodyStates(sim), snapshot: snapshot(sim.bodies), actionsOk: true };
  destroySim(sim);
  return { events: [...inputs, { tick: endTick, fin: true }], result };
}

/** el centro de masa en x de lo que ya está apilado (0 si no hay nada) */
export function towerComX(sim: Sim): number {
  let sx = 0;
  let sm = 0;
  for (const b of sim.bodies) {
    const m = b.body.mass();
    const t = b.body.translation();
    const c = centroid(b.kind);
    const a = b.body.rotation();
    sx += (t.x + c.x * Math.cos(a) - c.y * Math.sin(a)) * m;
    sm += m;
  }
  return sm > 0 ? sx / sm : 0;
}

/** a dónde apunta un jugador que mira: el medio de la cara de arriba del objeto más alto (o el centro de la base) */
export function aimX(sim: Sim): number {
  let best: BodyRef | null = null;
  let topY = -Infinity;
  for (const b of sim.bodies) {
    const t = stateOf(b).top;
    if (t > topY) {
      topY = t;
      best = b;
    }
  }
  if (!best) return 0;
  const tr = best.body.translation();
  const a = best.body.rotation();
  const c = Math.cos(a);
  const s = Math.sin(a);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of SPECS[best.kind].pieces) {
    for (const [vx, vy] of pieceVertices(p)) {
      const wy = tr.y + vx * s + vy * c;
      if (wy >= topY - 0.75) {
        const wx = tr.x + vx * c - vy * s;
        if (wx < lo) lo = wx;
        if (wx > hi) hi = wx;
      }
    }
  }
  return (lo + hi) / 2;
}

export { comOffsetX };

/** "137 cm" */
export function formatCm(cm: number): string {
  return `${cm} cm`;
}
