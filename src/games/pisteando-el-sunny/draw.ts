// Dibujo de la partida en un <canvas>, en escalado entero. Sin React: lo usan
// el juego y la herramienta de desarrollo. La cámara sigue al auto (en el
// tercio de abajo) y no rota: la ruta sube por la pantalla. La ruta, el
// vacío, las estrellas, las marcas de goma y el humo se rasterizan a una
// unidad por píxel; el sunny se dibuja con sus rotaciones precalculadas.

import { integerScale, px } from "../lib/canvas-scale";
import { spriteCanvas } from "../lib/sprites";
import { textSprite } from "../lib/font";
import { CAR_L, CAR_W, FALL_MARGIN, FIELD_H, FIELD_W, SLIP_MARK, SUB, slipOf, type Course, type SimState } from "./rules";
import { cosA, sinA, TRIG_SCALE } from "./trig";
import { ASPHALT, ASPHALT_DARK, CAR_BOX, carSprite, carStepFor, CENTER_LINE, CLIFF, EDGE_LINE, MARK, SIGN, SMOKE, STAR, STAR_BRIGHT, VOID } from "./sprites";

export interface DrawOptions {
  /** fracción del tick en curso, 0 a 1 */
  alpha: number;
  reduced?: boolean;
  /** herramienta de desarrollo: el eje, el margen de caída y los vectores */
  overlay?: boolean;
}

/** el auto se dibuja acá (tercio de abajo) */
export const CAR_SCREEN_Y = 133;
export const CAR_SCREEN_X = FIELD_W / 2;
/** la caída dura 60 ticks: el auto sigue, se achica, gira y desaparece */
export const FALL_TICKS = 60;

export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return integerScale(cssWidth, cssHeight, dpr, FIELD_W, FIELD_H);
}

// ---------------------------------------------------------------------------
// lo visual que no está en la simulación: marcas de goma, humo y la caída
// ---------------------------------------------------------------------------

export interface Visuals {
  /** marcas de goma en el asfalto (subunidades del mundo) */
  marks: { x: number; y: number }[];
  smoke: { x: number; y: number; vx: number; vy: number; age: number }[];
  /** ticks desde la caída */
  fallT: number;
  fallX: number;
  fallY: number;
  fallH: number;
  lastTick: number;
}

export function createVisuals(): Visuals {
  return { marks: [], smoke: [], fallT: 0, fallX: 0, fallY: 0, fallH: 0, lastTick: -1 };
}

const MAX_MARKS = 700;

/** llamar una vez por tick de la simulación (después de step) */
export function updateVisuals(vis: Visuals, state: SimState, reduced: boolean, rand: () => number = Math.random): void {
  if (state.tick === vis.lastTick) return;
  vis.lastTick = state.tick;
  if (state.end?.reason === "caida") {
    if (vis.fallT === 0) {
      vis.fallX = state.x;
      vis.fallY = state.y;
      vis.fallH = state.h;
    }
    vis.fallT = Math.min(FALL_TICKS, vis.fallT + 1);
    // sigue deslizando hacia el vacío
    vis.fallX += (state.v * sinA(state.m)) >> 12;
    vis.fallY -= (state.v * cosA(state.m)) >> 12;
  }
  for (const p of vis.smoke) {
    p.age++;
    p.x += p.vx;
    p.y += p.vy;
  }
  vis.smoke = vis.smoke.filter((p) => p.age < 28);
  if (state.end) return;
  if (Math.abs(slipOf(state)) < SLIP_MARK) return;
  // las ruedas de atrás: 5 unidades detrás del centro, 4 a cada lado
  const back = 5 * SUB;
  const side = 4 * SUB;
  const bx = state.x - ((back * sinA(state.h)) >> 12);
  const by = state.y + ((back * cosA(state.h)) >> 12);
  const nx = (side * cosA(state.h)) >> 12;
  const ny = (side * sinA(state.h)) >> 12;
  vis.marks.push({ x: bx - nx, y: by - ny }, { x: bx + nx, y: by + ny });
  if (vis.marks.length > MAX_MARKS) vis.marks.splice(0, vis.marks.length - MAX_MARKS);
  if (!reduced) {
    for (const sgn of [-1, 1]) {
      vis.smoke.push({ x: bx + sgn * nx, y: by + sgn * ny, vx: (rand() - 0.5) * 40 - ((state.v * sinA(state.m)) >> 14), vy: (rand() - 0.5) * 40 + ((state.v * cosA(state.m)) >> 14), age: 0 });
    }
  }
}

// ---------------------------------------------------------------------------
// el raster de una unidad por píxel
// ---------------------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
const C = {
  void: rgb(VOID),
  star: rgb(STAR),
  starBright: rgb(STAR_BRIGHT),
  asphalt: rgb(ASPHALT),
  asphaltDark: rgb(ASPHALT_DARK),
  edge: rgb(EDGE_LINE),
  center: rgb(CENTER_LINE),
  cliff: rgb(CLIFF),
  mark: rgb(MARK),
  smoke: rgb(SMOKE),
};

/** estrellas fijas del vacío: posiciones pseudoaleatorias constantes */
const STARS: { x: number; y: number; bright: boolean }[] = [];
for (let i = 0; i < 70; i++) {
  const a = (i * 7919 + 13) % 240;
  const b = (i * 104729 + 7) % 400;
  STARS.push({ x: a, y: b, bright: i % 9 === 0 });
}

let layer: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData } | null = null;
function layerFor(): NonNullable<typeof layer> {
  if (!layer) {
    const canvas = document.createElement("canvas");
    canvas.width = FIELD_W;
    canvas.height = FIELD_H;
    const ctx = canvas.getContext("2d")!;
    layer = { canvas, ctx, image: ctx.createImageData(FIELD_W, FIELD_H) };
  }
  return layer;
}

/** la posición del auto interpolada, en unidades */
export function carPos(state: SimState, alpha: number): { x: number; y: number } {
  return { x: (state.prevX + (state.x - state.prevX) * alpha) / SUB, y: (state.prevY + (state.y - state.prevY) * alpha) / SUB };
}

/**
 * Rasteriza la ruta (con sus líneas, el corte del precipicio), el vacío y las
 * estrellas para la cámara en (camX, camY) unidades. Exportado para los tests.
 */
export function rasterRoad(course: Course, idx: number, camX: number, camY: number, data: Uint8ClampedArray, reduced: boolean): void {
  const put = (x: number, y: number, c: readonly number[]) => {
    if (x < 0 || y < 0 || x >= FIELD_W || y >= FIELD_H) return;
    const o = (y * FIELD_W + x) * 4;
    data[o] = c[0]!;
    data[o + 1] = c[1]!;
    data[o + 2] = c[2]!;
    data[o + 3] = 255;
  };
  // el vacío y las estrellas (más lentas que la ruta, para dar profundidad)
  for (let i = 0; i < FIELD_W * FIELD_H; i++) {
    data[i * 4] = C.void[0];
    data[i * 4 + 1] = C.void[1];
    data[i * 4 + 2] = C.void[2];
    data[i * 4 + 3] = 255;
  }
  const par = reduced ? 0 : 0.3;
  for (const s of STARS) {
    const sx = (((s.x - camX * par) % 240) + 240) % 240;
    const sy = (((s.y - camY * par) % 400) + 400) % 400;
    if (sx < FIELD_W && sy < FIELD_H) put(Math.floor(sx), Math.floor(sy), s.bright ? C.starBright : C.star);
  }
  // la ruta, fila por fila: el metro del eje que cruza esa fila
  const rowAt = (r: number, j: number): number => {
    const wy = (camY + r + 0.5) * SUB;
    // ys baja con j: buscamos ys[j] >= wy > ys[j+1]
    while (j + 1 < course.n && course.ys[j + 1]! >= wy) j++;
    while (j > 0 && course.ys[j]! < wy) j--;
    if (j + 1 >= course.n || course.ys[j]! < wy || course.ys[j + 1]! >= wy) return j;
    const span = course.ys[j]! - course.ys[j + 1]!;
    const f = span > 0 ? (course.ys[j]! - wy) / span : 0;
    const cx = (course.xs[j]! + f * (course.xs[j + 1]! - course.xs[j]!)) / SUB - camX;
    const hw = (course.hws[j]! + f * (course.hws[j + 1]! - course.hws[j]!)) / SUB;
    const cos = Math.max(0.2, cosA(course.hs[j]!) / TRIG_SCALE);
    const half = hw / cos;
    const l = Math.round(cx - half);
    const rr = Math.round(cx + half);
    const dark = (j & 1) === 0;
    for (let x = l + 1; x < rr; x++) put(x, r, dark && (x + r) % 5 === 0 ? C.asphaltDark : C.asphalt);
    put(l, r, C.edge);
    put(rr, r, C.edge);
    put(l - 1, r, C.cliff);
    put(rr + 1, r, C.cliff);
    if (j % 6 < 3) put(Math.round(cx), r, C.center);
    return j;
  };
  let j = idx;
  for (let r = CAR_SCREEN_Y; r < FIELD_H; r++) j = rowAt(r, j);
  j = idx;
  for (let r = CAR_SCREEN_Y - 1; r >= 0; r--) j = rowAt(r, j);
}

function blend(data: Uint8ClampedArray, x: number, y: number, c: readonly number[], a: number) {
  if (x < 0 || y < 0 || x >= FIELD_W || y >= FIELD_H) return;
  const o = (y * FIELD_W + x) * 4;
  data[o] = Math.round(data[o]! + (c[0]! - data[o]!) * a);
  data[o + 1] = Math.round(data[o + 1]! + (c[1]! - data[o + 1]!) * a);
  data[o + 2] = Math.round(data[o + 2]! + (c[2]! - data[o + 2]!) * a);
}

export function drawScene(ctx: CanvasRenderingContext2D, state: SimState, course: Course, k: number, vis: Visuals, opts: DrawOptions) {
  ctx.imageSmoothingEnabled = false;
  const reduced = !!opts.reduced;
  const alpha = state.end ? 1 : opts.alpha;
  const car = carPos(state, alpha);
  const camX = car.x - CAR_SCREEN_X;
  const camY = car.y - CAR_SCREEN_Y;
  const L = layerFor();
  const data = L.image.data;
  rasterRoad(course, state.idx, camX, camY, data, reduced);

  // marcas de goma y humo
  for (const m of vis.marks) blend(data, Math.floor(m.x / SUB - camX), Math.floor(m.y / SUB - camY), C.mark, 0.7);
  for (const p of vis.smoke) {
    const a = 0.55 * (1 - p.age / 28);
    const x = Math.floor(p.x / SUB - camX);
    const y = Math.floor(p.y / SUB - camY);
    blend(data, x, y, C.smoke, a);
    if (p.age > 8) {
      blend(data, x + 1, y, C.smoke, a * 0.6);
      blend(data, x, y - 1, C.smoke, a * 0.6);
    }
  }
  L.ctx.putImageData(L.image, 0, 0);
  ctx.drawImage(L.canvas, 0, 0, FIELD_W, FIELD_H, 0, 0, FIELD_W * k, FIELD_H * k);

  // los carteles de metros cada 100 m, pintados en el asfalto
  const from = Math.max(0, state.idx - 40);
  const to = Math.min(course.n - 1, state.idx + 80);
  for (let j = Math.ceil(from / 100) * 100; j <= to; j += 100) {
    if (j === 0) continue;
    const sx = course.xs[j]! / SUB - camX;
    const sy = course.ys[j]! / SUB - camY;
    if (sy < -6 || sy > FIELD_H + 6) continue;
    const sp = textSprite(`${j}`, SIGN);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(spriteCanvas(`sunny:m:${j}`, sp, k), px(sx - sp.w / 2, k), px(sy - sp.h / 2, k));
    ctx.globalAlpha = 1;
  }

  // el sunny
  const stepIdx = carStepFor(state.end ? vis.fallH : state.h);
  const sprite = spriteCanvas(`sunny:car:${stepIdx}`, carSprite(stepIdx), k);
  if (state.end?.reason === "caida") {
    const f = vis.fallT / FALL_TICKS;
    const scale = Math.max(0.15, 1 - f * 0.85);
    const spin = ((Math.floor(f * 12) * 4) % 32) as number;
    const fx = vis.fallX / SUB - camX;
    const fy = vis.fallY / SUB - camY;
    const spr = spriteCanvas(`sunny:car:${(stepIdx + spin) % 32}`, carSprite(stepIdx + spin), k);
    ctx.globalAlpha = f < 0.6 ? 1 : Math.max(0, 1 - (f - 0.6) / 0.4);
    const size = CAR_BOX * k * scale;
    ctx.drawImage(spr, px(fx, k) - size / 2, px(fy, k) - size / 2, size, size);
    ctx.globalAlpha = 1;
  } else {
    ctx.drawImage(sprite, px(CAR_SCREEN_X - CAR_BOX / 2, k), px(CAR_SCREEN_Y - CAR_BOX / 2, k));
  }

  if (opts.overlay) drawOverlay(ctx, state, course, k, camX, camY);
}

function drawOverlay(ctx: CanvasRenderingContext2D, state: SimState, course: Course, k: number, camX: number, camY: number) {
  const from = Math.max(0, state.idx - 60);
  const to = Math.min(course.n - 1, state.idx + 100);
  // el eje y el margen de caída
  for (let j = from; j <= to; j++) {
    const sx = course.xs[j]! / SUB - camX;
    const sy = course.ys[j]! / SUB - camY;
    ctx.fillStyle = "#8EDC66";
    ctx.fillRect(px(sx, k), px(sy, k), k, k);
    const lim = (course.hws[j]! + FALL_MARGIN * SUB) / SUB;
    const nx = (cosA(course.hs[j]!) / TRIG_SCALE) * lim;
    const ny = (sinA(course.hs[j]!) / TRIG_SCALE) * lim;
    if (j % 2 === 0) {
      ctx.fillStyle = "#FF6F91";
      ctx.fillRect(px(sx - nx, k), px(sy - ny, k), k, k);
      ctx.fillRect(px(sx + nx, k), px(sy + ny, k), k, k);
    }
  }
  // los vectores: rumbo (celeste) y movimiento (magenta)
  const cx = px(CAR_SCREEN_X, k);
  const cy = px(CAR_SCREEN_Y, k);
  const vec = (a: number, color: string, len: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, Math.floor(k / 2));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + ((sinA(a) / TRIG_SCALE) * len * k), cy - ((cosA(a) / TRIG_SCALE) * len * k));
    ctx.stroke();
  };
  vec(state.h, "#6FD3E0", 24);
  vec(state.m, "#FF4FD8", 18);
  void CAR_L;
  void CAR_W;
}
