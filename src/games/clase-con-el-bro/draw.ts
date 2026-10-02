// Dibujo de "clase con el bro" en un <canvas> chico (120 × 150) escalado con
// vecino más cercano, como en colgado del 121: la cocina vista desde arriba,
// Big Bro asomado detrás de la mesa, la comida como polígono con su textura,
// la línea de corte punteada mientras se arrastra, y después del corte las
// dos partes separadas con un destello sobre la recta.

import { px } from "../lib/canvas-scale";
import { spriteCanvas } from "../lib/sprites";
import { clipSide, GRID, type FoodObject, type Line, type RPt } from "./rules";
import { shapeById, type Pt, type Shape } from "./shapes";
import { broSprite, BRO_W, cleaverSprite, FIELD_H, FIELD_W, type Mood } from "./sprites";

/** dónde cae la mesa (la grilla lógica de 0 a GRID) en la vista: un cuadrado */
export const TABLE = { x: 4, y: 36, w: 112 };
/** el borde superior de la mesa (Big Bro asoma por arriba) */
const TABLE_TOP = 30;
/** cuánto se separan las partes al cortar, en unidades de la vista */
export const SEPARATION = 3;

export const OUTLINE = "#141414";
const WALL = "#2B3A4A";
const WOOD = "#8B5A2B";
const WOOD_DARK = "#734A22";
const BOARD = "#C49A6C";
const BOARD_DARK = "#A67C52";

type XY = [number, number];

/** unidades de la mesa → unidades de la vista (con fracción) */
export function toView(ux: number, uy: number): XY {
  return [TABLE.x + (ux * TABLE.w) / GRID, TABLE.y + (uy * TABLE.w) / GRID];
}

function rptToView(p: RPt): XY {
  return toView(Number(p.x) / Number(p.d), Number(p.y) / Number(p.d));
}

export interface SceneArgs {
  objects: FoodObject[];
  /** el objeto que se muestra */
  index: number;
  /** el corte hecho sobre ese objeto (en la pausa o al final), si lo hay */
  cut: Line | null;
  /** separación actual de las partes (0 a SEPARATION) */
  sep: number;
  flash: boolean;
  mood: Mood;
  aim: Line | null;
  reduced?: boolean;
  devVerts?: boolean;
  solverLine?: Line | null;
}

let off: HTMLCanvasElement | null = null;
function offscreen(): HTMLCanvasElement {
  if (!off) {
    off = document.createElement("canvas");
    off.width = FIELD_W;
    off.height = FIELD_H;
  }
  return off;
}

function pathOf(ctx: CanvasRenderingContext2D, pts: readonly XY[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function centroidOf(pts: readonly XY[]): XY {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

function scaled(pts: readonly XY[], c: XY, f: number): XY[] {
  return pts.map(([x, y]) => [c[0] + (x - c[0]) * f, c[1] + (y - c[1]) * f]);
}

/** la comida con su textura, recortada al polígono `pts` (en unidades de la vista) */
export function paintFood(ctx: CanvasRenderingContext2D, shape: Shape, pts: readonly XY[]): void {
  const c = centroidOf(pts);
  let R = 0;
  for (const p of pts) R = Math.max(R, Math.hypot(p[0] - c[0], p[1] - c[1]));
  ctx.save();
  pathOf(ctx, pts);
  ctx.clip();
  ctx.fillStyle = shape.fill;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  const dots = (n: number, r: number, k: number, color: string, rot = 0) => {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = rot + (i * Math.PI * 2) / n;
      ctx.beginPath();
      ctx.arc(c[0] + Math.cos(a) * R * k, c[1] + Math.sin(a) * R * k, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  switch (shape.id) {
    case "pizza":
      ctx.fillStyle = shape.texture;
      pathOf(ctx, scaled(pts, c, 0.86));
      ctx.fill();
      ctx.fillStyle = "#F2D16B";
      pathOf(ctx, scaled(pts, c, 0.74));
      ctx.fill();
      dots(5, 3, 0.42, "#9E2A24", 0.4);
      dots(1, 3, 0, "#9E2A24");
      break;
    case "pan":
      ctx.fillStyle = shape.texture;
      pathOf(ctx, scaled(pts, c, 0.7));
      ctx.fill();
      ctx.strokeStyle = WOOD;
      ctx.lineWidth = 1;
      for (const d of [-0.25, 0.1]) {
        ctx.beginPath();
        ctx.moveTo(c[0] - R * 0.35, c[1] + R * d - 4);
        ctx.lineTo(c[0] + R * 0.35, c[1] + R * d + 4);
        ctx.stroke();
      }
      break;
    case "milanesa":
      ctx.fillStyle = shape.texture;
      for (let y = Math.floor(c[1] - R); y < c[1] + R; y += 5) for (let x = Math.floor(c[0] - R) + (y % 10 ? 2 : 0); x < c[0] + R; x += 5) ctx.fillRect(x, y, 1, 1);
      break;
    case "queso":
      dots(6, 2.5, 0.5, shape.texture, 0.7);
      dots(3, 1.5, 0.2, shape.texture, 2.1);
      break;
    case "torta":
      ctx.fillStyle = shape.texture;
      pathOf(ctx, scaled(pts, c, 0.8));
      ctx.fill();
      dots(3, 2, 0.35, "#C0392B", 1.2);
      break;
    case "sandia":
      ctx.strokeStyle = shape.texture;
      ctx.lineWidth = 8;
      pathOf(ctx, pts);
      ctx.stroke();
      ctx.strokeStyle = "#E9F5D0";
      ctx.lineWidth = 2;
      pathOf(ctx, scaled(pts, c, 0.9));
      ctx.stroke();
      ctx.fillStyle = OUTLINE;
      for (let i = 0; i < 6; i++) {
        const a = 0.5 + i * 1.1;
        ctx.fillRect(Math.round(c[0] + Math.cos(a) * R * 0.35) - 1, Math.round(c[1] + Math.sin(a) * R * 0.35), 2, 1);
      }
      break;
  }
  ctx.restore();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  pathOf(ctx, pts);
  ctx.stroke();
}

/** las dos partes de un objeto cortado, en unidades de la vista, y la normal unitaria de la recta (hacia la izquierda) */
export function partsOf(verts: readonly Pt[], cut: Line): { left: XY[]; right: XY[]; normal: XY } {
  const dx = cut.x2 - cut.x1;
  const dy = cut.y2 - cut.y1;
  const len = Math.hypot(dx, dy) || 1;
  return { left: clipSide(verts, cut, true).map(rptToView), right: clipSide(verts, cut, false).map(rptToView), normal: [-dy / len, dx / len] };
}

/** el centro de cada parte, en unidades de la vista, ya separadas */
export function partCenters(verts: readonly Pt[], cut: Line, sep: number): { left: XY; right: XY } {
  const p = partsOf(verts, cut);
  const l = centroidOf(p.left);
  const r = centroidOf(p.right);
  return { left: [l[0] + p.normal[0] * sep, l[1] + p.normal[1] * sep], right: [r[0] - p.normal[0] * sep, r[1] - p.normal[1] * sep] };
}

/** la recta extendida de borde a borde de la vista */
function longLine(l: Line): [XY, XY] {
  const a = toView(l.x1, l.y1);
  const b = toView(l.x2, l.y2);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const f = 400 / len;
  return [
    [a[0] - dx * f, a[1] - dy * f],
    [a[0] + dx * f, a[1] + dy * f],
  ];
}

export function paintScene(ctx: CanvasRenderingContext2D, s: SceneArgs): void {
  ctx.imageSmoothingEnabled = false;
  ctx.setLineDash([]);
  // la pared de la cocina y Big Bro asomado
  ctx.fillStyle = WALL;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.fillStyle = "#34465A";
  for (let x = 0; x < FIELD_W; x += 12) ctx.fillRect(x, 0, 1, TABLE_TOP);
  for (let y = 6; y < TABLE_TOP; y += 8) ctx.fillRect(0, y, FIELD_W, 1);
  const bro = spriteCanvas(`clase:bro:${s.mood}`, broSprite(s.mood), 1);
  ctx.drawImage(bro, Math.round((FIELD_W - BRO_W) / 2), 0);
  // la mesa de madera y la tabla de picar
  ctx.fillStyle = WOOD;
  ctx.fillRect(0, TABLE_TOP, FIELD_W, FIELD_H - TABLE_TOP);
  ctx.fillStyle = WOOD_DARK;
  for (let y = TABLE_TOP; y < FIELD_H; y += 14) ctx.fillRect(0, y, FIELD_W, 1);
  ctx.fillRect(0, TABLE_TOP, FIELD_W, 2);
  ctx.fillStyle = BOARD_DARK;
  ctx.fillRect(TABLE.x - 2, TABLE.y - 2, TABLE.w + 4, TABLE.w + 4);
  ctx.fillStyle = BOARD;
  ctx.fillRect(TABLE.x - 1, TABLE.y - 1, TABLE.w + 2, TABLE.w + 2);
  ctx.fillStyle = BOARD_DARK;
  ctx.fillRect(TABLE.x + 2, TABLE.y + TABLE.w - 4, 3, 1);
  ctx.fillRect(TABLE.x + 8, TABLE.y + 5, 1, 3);
  const cleaver = spriteCanvas("clase:cuchilla", cleaverSprite(), 1);
  ctx.drawImage(cleaver, FIELD_W - 18, FIELD_H - 10);

  const obj = s.objects[s.index];
  if (!obj) return;
  const shape = shapeById(obj.shape);
  const pts = obj.verts.map(([x, y]) => toView(x, y));
  if (s.cut) {
    const p = partsOf(obj.verts, s.cut);
    for (const [part, sign] of [
      [p.left, 1],
      [p.right, -1],
    ] as const) {
      ctx.save();
      ctx.translate(p.normal[0] * s.sep * sign, p.normal[1] * s.sep * sign);
      pathOf(ctx, part);
      ctx.clip();
      paintFood(ctx, shape, pts);
      ctx.restore();
      ctx.save();
      ctx.translate(p.normal[0] * s.sep * sign, p.normal[1] * s.sep * sign);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1;
      pathOf(ctx, part);
      ctx.stroke();
      ctx.restore();
    }
    if (s.flash && !s.reduced) {
      const [a, b] = longLine(s.cut);
      ctx.save();
      ctx.beginPath();
      ctx.rect(TABLE.x - 2, TABLE.y - 2, TABLE.w + 4, TABLE.w + 4);
      ctx.clip();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    paintFood(ctx, shape, pts);
  }
  if (s.devVerts) {
    ctx.fillStyle = "#6FD3E0";
    for (const [x, y] of pts) ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  }
  // las rectas: la del resolvedor (herramienta) y la que se está trazando
  ctx.save();
  ctx.beginPath();
  ctx.rect(TABLE.x - 2, TABLE.y - 2, TABLE.w + 4, TABLE.w + 4);
  ctx.clip();
  if (s.solverLine) {
    const [a, b] = longLine(s.solverLine);
    ctx.strokeStyle = "#6FD3E0";
    ctx.lineWidth = 1;
    ctx.setLineDash([1, 2]);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  if (s.aim && !s.cut) {
    const [a, b] = longLine(s.aim);
    ctx.strokeStyle = "#F7FFF2";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    const p1 = toView(s.aim.x1, s.aim.y1);
    ctx.fillStyle = "#F7FFF2";
    ctx.fillRect(Math.round(p1[0]) - 1, Math.round(p1[1]) - 1, 3, 3);
  }
  ctx.restore();
}

export function drawScene(ctx: CanvasRenderingContext2D, k: number, s: SceneArgs): void {
  const o = offscreen();
  const octx = o.getContext("2d")!;
  paintScene(octx, s);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(o, 0, 0, FIELD_W, FIELD_H, 0, 0, px(FIELD_W, k), px(FIELD_H, k));
}

/** un objeto como <polygon> (puntos en unidades de la mesa escaladas a `size`) para la previa, el resumen y la herramienta */
export function svgPoints(verts: readonly Pt[], size: number): string {
  return verts.map(([x, y]) => `${((x * size) / GRID).toFixed(1)},${((y * size) / GRID).toFixed(1)}`).join(" ");
}
export function svgPartPoints(part: readonly RPt[], size: number, offset: XY): string {
  return part.map((p) => `${((Number(p.x) / Number(p.d)) * size) / GRID + offset[0]},${((Number(p.y) / Number(p.d)) * size) / GRID + offset[1]}`).join(" ");
}
