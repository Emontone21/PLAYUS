// Dibujo de la partida en un <canvas>, en escalado entero. Sin React: lo usan
// el juego y la herramienta de desarrollo. El interior del ómnibus (con el
// pasajero y la base) se pinta en un canvas chico fuera de pantalla, a una
// unidad por píxel, y se gira con la inclinación al dibujarlo escalado con
// vecino más cercano: así el pixel art rotado no se ve roto.

import { integerScale, px } from "../lib/canvas-scale";
import { spriteCanvas } from "../lib/sprites";
import { baseHalfAt, FIELD_H, FIELD_W, nearEdge, SUB, TILT_MAX, tiltAt, type Course, type SimState } from "./rules";
import { AISLE_X, FLOOR_Y, INT_H, INT_W, interiorRects, passengerSprite, windowRects, type Pose } from "./sprites";

export interface DrawOptions {
  /** fracción del tick en curso, 0 a 1 */
  alpha: number;
  reduced?: boolean;
  /** herramienta de desarrollo: x, velocidad y empuje */
  debug?: boolean;
}

/** 1000 de inclinación son 12° */
export const MAX_ANGLE_RAD = (12 * Math.PI) / 180;
/** la caída dura 60 ticks: el pasajero se va al piso hacia el lado que se salió */
export const FALL_TICKS = 60;

export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return integerScale(cssWidth, cssHeight, dpr, FIELD_W, FIELD_H);
}

let interior: HTMLCanvasElement | null = null;
function interiorCanvas(): HTMLCanvasElement {
  if (!interior) {
    interior = document.createElement("canvas");
    interior.width = INT_W;
    interior.height = INT_H;
  }
  return interior;
}

/** la inclinación interpolada entre el tick y el siguiente */
export function tiltNow(course: Course, state: SimState, alpha: number): number {
  const a = tiltAt(course, state.tick);
  const b = tiltAt(course, state.tick + 1);
  return state.end ? a : a + (b - a) * alpha;
}

/** la posición del pasajero interpolada, en unidades */
export function xNow(state: SimState, alpha: number): number {
  return (state.end ? state.x : state.prevX + (state.x - state.prevX) * alpha) / SUB;
}

export function poseFor(state: SimState, fallT: number): { pose: Pose; frame: 0 | 1 } {
  if (state.end?.reason === "caida") return { pose: state.x > 0 ? "piso-der" : "piso-izq", frame: 0 };
  const frame = (Math.floor(state.tick / 6) % 2) as 0 | 1;
  if (nearEdge(state)) return { pose: state.x > 0 ? "revoleo-der" : "revoleo-izq", frame };
  if (Math.abs(state.v) > SUB / 3) return { pose: state.v > 0 ? "der" : "izq", frame: 0 };
  void fallT;
  return { pose: "parado", frame: 0 };
}

/**
 * Pinta el interior en el canvas chico: paredes, piso, pasamanos, ventanillas
 * con la calle, asientos, la base y el pasajero. Exportado para los tests
 * (devuelve los rectángulos de la base).
 */
export function paintInterior(ctx: CanvasRenderingContext2D, state: SimState, course: Course, alpha: number, reduced: boolean, fallT: number): { baseX: number; baseW: number; near: boolean } {
  for (const r of interiorRects()) {
    ctx.fillStyle = r.c;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  const scroll = reduced ? 0 : Math.floor((state.tick + alpha) * 1.5);
  for (const r of windowRects(scroll)) {
    ctx.fillStyle = r.c;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  // la base: una franja en el piso bajo los pies; cerca del borde, en --lengua
  const half = baseHalfAt(Math.min(state.tick, state.end ? state.end.tick : state.tick)) / SUB;
  const near = nearEdge(state);
  const baseX = Math.round(AISLE_X - half);
  const baseW = Math.round(half * 2);
  ctx.fillStyle = near ? "#FF6F91" : "#6FD3E0";
  ctx.fillRect(baseX, FLOOR_Y, baseW, 4);
  ctx.fillStyle = near ? "#B23A5A" : "#3B9AA8";
  ctx.fillRect(baseX, FLOOR_Y + 4, baseW, 1);
  ctx.fillRect(baseX, FLOOR_Y, 1, 5);
  ctx.fillRect(baseX + baseW - 1, FLOOR_Y, 1, 5);
  // el pasajero
  const { pose, frame } = poseFor(state, fallT);
  const sp = passengerSprite(pose, frame);
  const x = xNow(state, alpha);
  if (state.end?.reason === "caida") {
    // se va al piso hacia el lado que se salió, y se desliza un poco
    const dir = state.x > 0 ? 1 : -1;
    const slide = Math.min(fallT, 20) * 0.6 * dir;
    const cx = Math.round(AISLE_X + x + slide);
    ctx.drawImage(spriteCanvas(`121:${pose}:${frame}`, sp, 1), cx - sp.w / 2, FLOOR_Y - sp.h + 2);
  } else {
    const cx = Math.round(AISLE_X + x);
    ctx.drawImage(spriteCanvas(`121:${pose}:${frame}`, sp, 1), cx - sp.w / 2, FLOOR_Y - sp.h);
  }
  return { baseX, baseW, near };
}

export function drawScene(ctx: CanvasRenderingContext2D, state: SimState, course: Course, k: number, fallT: number, opts: DrawOptions) {
  ctx.imageSmoothingEnabled = false;
  const reduced = !!opts.reduced;
  const off = interiorCanvas();
  const octx = off.getContext("2d")!;
  octx.imageSmoothingEnabled = false;
  paintInterior(octx, state, course, opts.alpha, reduced, fallT);

  // el fondo (lo que asoma en las esquinas al girar)
  ctx.fillStyle = "#1B2430";
  ctx.fillRect(0, 0, FIELD_W * k, FIELD_H * k);
  const tilt = tiltNow(course, state, opts.alpha);
  const angle = (tilt / TILT_MAX) * MAX_ANGLE_RAD;
  ctx.save();
  // el centro de giro: el piso del pasillo, en el medio de la vista
  ctx.translate(px(FIELD_W / 2, k), px(FIELD_H * 0.78, k));
  ctx.rotate(angle);
  ctx.drawImage(off, 0, 0, INT_W, INT_H, px(-AISLE_X, k), px(-FLOOR_Y, k), INT_W * k, INT_H * k);
  ctx.restore();

  if (opts.debug) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, 64 * k, 14 * k);
    ctx.fillStyle = "#F7FFF2";
    ctx.font = `${Math.max(8, 4 * k)}px monospace`;
    ctx.fillText(`x ${(state.x / SUB).toFixed(1)} v ${(state.v / SUB).toFixed(2)} e ${state.push} t ${Math.round(tilt)}`, 2 * k, 10 * k);
  }
}
