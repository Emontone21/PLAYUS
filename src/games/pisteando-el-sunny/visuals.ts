// Lo visual que no está en la simulación: las marcas de goma, el humo y la
// caída. Se actualiza una vez por tick leyendo el estado (nunca lo escribe)
// y el renderer lo dibuja. Sin three ni DOM: se puede testear en Node.

import { SLIP_MARK, slipOf, SUB, type SimState } from "./rules";
import { cosA, sinA } from "./trig";

/** la caída dura 60 ticks: el auto sigue, cae girando y desaparece */
export const FALL_TICKS = 60;
export const MAX_MARKS = 700;
export const SMOKE_LIFE = 28;

export interface Mark {
  x: number;
  y: number;
  /** 0 izquierda, 1 derecha: cada rueda deja su propia línea */
  wheel: 0 | 1;
  /** true si arranca una línea nueva (no se une con la marca anterior) */
  start: boolean;
}

export interface Visuals {
  /** marcas de goma en el asfalto (subunidades del mundo) */
  marks: Mark[];
  smoke: { x: number; y: number; vx: number; vy: number; age: number }[];
  /** ticks desde la caída y la posición del auto cayendo */
  fallT: number;
  fallX: number;
  fallY: number;
  fallH: number;
  lastTick: number;
  wasMarking: boolean;
}

export function createVisuals(): Visuals {
  return { marks: [], smoke: [], fallT: 0, fallX: 0, fallY: 0, fallH: 0, lastTick: -1, wasMarking: false };
}

/** las ruedas de atrás: 5 unidades detrás del centro, 4 a cada lado */
export function rearWheels(state: SimState): [{ x: number; y: number }, { x: number; y: number }] {
  const back = 5 * SUB;
  const side = 4 * SUB;
  const bx = state.x - ((back * sinA(state.h)) >> 12);
  const by = state.y + ((back * cosA(state.h)) >> 12);
  const nx = (side * cosA(state.h)) >> 12;
  const ny = (side * sinA(state.h)) >> 12;
  return [
    { x: bx - nx, y: by - ny },
    { x: bx + nx, y: by + ny },
  ];
}

/** llamar una vez por tick de la simulación (después de step) */
export function updateVisuals(vis: Visuals, state: SimState, reduced: boolean, rand: () => number = Math.random): void {
  if (state.tick === vis.lastTick) return;
  vis.lastTick = state.tick;
  if (state.end?.reason === "caida" || state.end?.reason === "choque") {
    if (vis.fallT === 0) {
      vis.fallX = state.x;
      vis.fallY = state.y;
      vis.fallH = state.h;
    }
    vis.fallT = Math.min(FALL_TICKS, vis.fallT + 1);
    if (state.end.reason === "caida") {
      // sigue deslizando hacia el vacío
      vis.fallX += (state.v * sinA(state.m)) >> 12;
      vis.fallY -= (state.v * cosA(state.m)) >> 12;
    } else {
      // rebota: vuelve para atrás a media velocidad y se va de costado hacia el vacío
      const side = state.offset >= 0 ? 1 : -1;
      vis.fallX -= (state.v * sinA(state.m)) >> 13;
      vis.fallY += (state.v * cosA(state.m)) >> 13;
      vis.fallX += (side * (state.v * cosA(state.h))) >> 12;
      vis.fallY += (side * (state.v * sinA(state.h))) >> 12;
      vis.fallH = (vis.fallH + 14) % 1024;
    }
  }
  for (const p of vis.smoke) {
    p.age++;
    p.x += p.vx;
    p.y += p.vy;
  }
  vis.smoke = vis.smoke.filter((p) => p.age < SMOKE_LIFE);
  if (state.end) return;
  const marking = Math.abs(slipOf(state)) >= SLIP_MARK;
  if (!marking) {
    vis.wasMarking = false;
    return;
  }
  const [l, r] = rearWheels(state);
  vis.marks.push({ x: l.x, y: l.y, wheel: 0, start: !vis.wasMarking }, { x: r.x, y: r.y, wheel: 1, start: !vis.wasMarking });
  vis.wasMarking = true;
  if (vis.marks.length > MAX_MARKS) vis.marks.splice(0, vis.marks.length - MAX_MARKS);
  if (!reduced) {
    for (const w of [l, r]) {
      vis.smoke.push({ x: w.x, y: w.y, vx: (rand() - 0.5) * 40 - ((state.v * sinA(state.m)) >> 14), vy: (rand() - 0.5) * 40 + ((state.v * cosA(state.m)) >> 14), age: 0 });
    }
  }
}

/** la posición del auto interpolada, en unidades de dibujo */
export function carPos(state: SimState, alpha: number): { x: number; y: number } {
  return { x: (state.prevX + (state.x - state.prevX) * alpha) / SUB, y: (state.prevY + (state.y - state.prevY) * alpha) / SUB };
}
