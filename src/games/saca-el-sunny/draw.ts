// Dibujo de "Saca el Sunny" en un <canvas> chico (120 × 180) escalado entero:
// arriba la calle de noche con el cartel "Aguada" y la hdp (el neón de la
// cocina compartida, el cartel "cierra en m:ss", la puerta con la persiana y
// Big Bro bajándola en los últimos 15 s); abajo el estacionamiento visto
// desde arriba, asfalto con líneas blancas, un poco de luz de farol, la
// flecha de la salida y los autos. El auto que se arrastra se dibuja corrido
// lo que va el dedo; al sacar el sunny, sale manejando con una estela y el
// estacionamiento siguiente sube desde abajo.

import { px } from "../lib/canvas-scale";
import { blit, KITCHEN, neonSignSize, paintNeonSign } from "../lib/hdp-kitchen";
import { bigBroSprite } from "../lib/big-bro";
import { textSprite } from "../lib/font";
import { DURATION_MS, EXIT_COL, NEXT_MS, puzzleAt, SIZE, SUNNY_ROW, type Puzzle, type Run } from "./rules";
import { carSprite, CELL, COLORS, exitArrowSprite, streetSignSprite, TOP } from "./sprites";

export const W = SIZE * CELL;
export const H = TOP + SIZE * CELL;
/** el sunny sale manejando durante esto; después sube el estacionamiento siguiente hasta NEXT_MS */
export const LEAVE_MS = 600;
/** en los últimos… el neón titila y Big Bro baja la persiana */
export const CLOSING_MS = 15_000;

export interface Drag {
  car: number;
  /** cuánto va corrido el auto, en casillas (con fracción) */
  offset: number;
}

export interface DrawOptions {
  t: number;
  reduced?: boolean;
  drag?: Drag | null;
  /** herramienta: la solución óptima, paso a paso (el movimiento que toca, resaltado) */
  hint?: { car: number; delta: number } | null;
}

let off: HTMLCanvasElement | null = null;
function offscreen(): HTMLCanvasElement {
  if (!off) {
    off = document.createElement("canvas");
    off.width = W;
    off.height = H;
  }
  return off;
}

function rect(ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

/** la casilla bajo un punto de la vista (unidades), o null fuera de la grilla */
export function cellAt(x: number, y: number): { col: number; row: number } | null {
  if (y < TOP || y >= H || x < 0 || x >= W) return null;
  return { col: Math.floor(x / CELL), row: Math.floor((y - TOP) / CELL) };
}

/** el auto que ocupa una casilla, o -1 */
export function carAtCell(p: Puzzle, pos: readonly number[], col: number, row: number): number {
  for (let i = 0; i < p.cars.length; i++) {
    const c = p.cars[i]!;
    for (let k = 0; k < c.len; k++) {
      const cc = c.horizontal ? pos[i]! + k : c.lane;
      const rr = c.horizontal ? c.lane : pos[i]! + k;
      if (cc === col && rr === row) return i;
    }
  }
  return -1;
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function paintStreet(ctx: CanvasRenderingContext2D, run: Run, o: DrawOptions): void {
  const t = o.t;
  rect(ctx, COLORS.noche, 0, 0, W, TOP);
  // la pared de la hdp, a la derecha
  rect(ctx, COLORS.pared, 58, 4, W - 58, TOP - 4);
  for (let y = 8; y < TOP; y += 6) rect(ctx, COLORS.paredLinea, 58, y, W - 58, 1);
  // la vereda
  rect(ctx, COLORS.vereda, 0, TOP - 8, W, 8);
  rect(ctx, COLORS.veredaLinea, 0, TOP - 8, W, 1);
  for (let x = 6; x < W; x += 12) rect(ctx, COLORS.veredaLinea, x, TOP - 7, 1, 7);
  // el cartel de calle
  blit(ctx, "sunny:aguada", streetSignSprite(), 6, TOP - 8 - 30);
  // el neón: titila en los últimos 15 s y se apaga al cerrar
  const left = DURATION_MS - t;
  const closing = left <= CLOSING_MS;
  const on = run.phase === "over" ? false : !closing || o.reduced ? true : Math.floor(t / 90) % 7 !== 3;
  const { w: nw, h: nh } = neonSignSize(1);
  const nx = W - nw - 6;
  if (on) paintNeonSign(ctx, nx, 6, 1, false);
  else {
    rect(ctx, KITCHEN.board, nx, 6, nw, nh);
    rect(ctx, "#3A3F4C", nx + 9, 10, 11, 7);
  }
  // "cierra en m:ss"
  const label = textSprite(run.phase === "over" ? "cerro" : `cierra en ${mmss(left)}`, closing && on ? KITCHEN.neon : KITCHEN.neonSoft);
  blit(ctx, `sunny:cierra:${run.phase === "over" ? "x" : mmss(left)}:${closing && on ? 1 : 0}`, label, nx + nw - label.w, 6 + nh + 2);
  // la puerta, con la persiana y Big Bro
  const dx = 64;
  const dy = 30;
  const dw = 24;
  const dh = TOP - 8 - dy;
  rect(ctx, "#15161B", dx, dy, dw, dh);
  rect(ctx, "#3A3440", dx - 1, dy - 1, dw + 2, 1);
  rect(ctx, "#3A3440", dx - 1, dy, 1, dh);
  rect(ctx, "#3A3440", dx + dw, dy, 1, dh);
  const shutter = run.phase === "over" ? 1 : closing ? Math.min(0.55, ((CLOSING_MS - left) / CLOSING_MS) * 0.55) : 0;
  if (closing || run.phase === "over") {
    const bro = bigBroSprite("tira");
    if (run.phase !== "over") blit(ctx, "sunny:bro", bro, dx + 1, dy + dh - 18, 22, 18);
  }
  if (shutter > 0) {
    const sh = Math.round(dh * shutter);
    rect(ctx, COLORS.persiana, dx, dy, dw, sh);
    for (let y = dy + 2; y < dy + sh; y += 3) rect(ctx, COLORS.persianaLinea, dx, y, dw, 1);
  }
}

function paintLot(ctx: CanvasRenderingContext2D, y0: number): void {
  rect(ctx, COLORS.asfalto, 0, y0, W, SIZE * CELL);
  // la luz del farol, arriba a la izquierda
  rect(ctx, COLORS.asfaltoLuz, 0, y0, 50, 44);
  rect(ctx, COLORS.farol, 0, y0, 26, 22);
  // las líneas de estacionamiento
  for (let i = 0; i <= SIZE; i++) {
    rect(ctx, COLORS.linea, i * CELL, y0, 1, SIZE * CELL);
    rect(ctx, COLORS.linea, 0, y0 + i * CELL - (i === SIZE ? 1 : 0), W, 1);
  }
  // la salida: sin línea en el borde derecho de la tercera fila, y la flecha
  rect(ctx, COLORS.asfalto, W - 1, y0 + SUNNY_ROW * CELL + 1, 1, CELL - 2);
  blit(ctx, "sunny:salida", exitArrowSprite(), W - 7, y0 + SUNNY_ROW * CELL + 7);
}

function paintCars(ctx: CanvasRenderingContext2D, p: Puzzle, pos: readonly number[], y0: number, o: { drag?: Drag | null; sunnyX?: number; hint?: { car: number; delta: number } | null; trail?: boolean }): void {
  for (let i = p.cars.length - 1; i >= 0; i--) {
    const c = p.cars[i]!;
    const off = o.drag && o.drag.car === i ? o.drag.offset : 0;
    let x = c.horizontal ? (pos[i]! + off) * CELL : c.lane * CELL;
    const y = y0 + (c.horizontal ? c.lane * CELL : (pos[i]! + off) * CELL);
    if (i === 0 && o.sunnyX !== undefined) x = o.sunnyX;
    if (i === 0 && o.trail) {
      for (let k = 1; k <= 4; k++) rect(ctx, COLORS.estela, Math.round(x) - k * 5, y + 8, 3, 4);
    }
    blit(ctx, `sunny:car:${c.len}:${c.look}:${c.horizontal ? "h" : "v"}:${i === 0 ? 1 : 0}`, carSprite(c, i === 0), Math.round(x), Math.round(y));
    if (o.hint && o.hint.car === i) {
      // la solución: una flecha chica a donde va el auto
      const arrow = textSprite(c.horizontal ? (o.hint.delta > 0 ? ">" : "<") : o.hint.delta > 0 ? "v" : "^", "#5BD67A");
      ctx.fillStyle = "#5BD67A";
      const cx = Math.round(x) + (c.horizontal ? (o.hint.delta > 0 ? c.len * CELL - 4 : 1) : CELL / 2 - 1);
      const cy = Math.round(y) + (c.horizontal ? CELL / 2 - 1 : o.hint.delta > 0 ? c.len * CELL - 4 : 1);
      ctx.fillRect(cx, cy, 3, 3);
      void arrow;
    }
  }
}

export function paintScene(ctx: CanvasRenderingContext2D, run: Run, o: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  paintStreet(ctx, run, o);
  const t = o.t;
  if (run.phase === "leaving") {
    const since = t - run.solvedT;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP, W, SIZE * CELL);
    ctx.clip();
    if (since < LEAVE_MS || o.reduced) {
      paintLot(ctx, TOP);
      const q = Math.min(1, since / LEAVE_MS);
      const sunnyX = EXIT_COL * CELL + (o.reduced ? W : q * q * (W + 10));
      paintCars(ctx, run.puzzle, run.pos, TOP, { sunnyX, trail: !o.reduced && q > 0.1 });
    } else {
      // el siguiente sube desde abajo
      const q = Math.min(1, (since - LEAVE_MS) / (NEXT_MS - LEAVE_MS));
      const next = puzzleAt(run.seed, run.index + 2);
      const y0 = TOP + Math.round((1 - q) * SIZE * CELL);
      paintLot(ctx, TOP);
      paintLot(ctx, y0);
      paintCars(ctx, next, next.start, y0, {});
    }
    ctx.restore();
    return;
  }
  paintLot(ctx, TOP);
  paintCars(ctx, run.puzzle, run.pos, TOP, { drag: o.drag, hint: o.hint });
}

export function drawScene(ctx: CanvasRenderingContext2D, k: number, run: Run, o: DrawOptions): void {
  const c = offscreen();
  const octx = c.getContext("2d")!;
  paintScene(octx, run, o);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, W, H, 0, 0, px(W, k), px(H, k));
}
