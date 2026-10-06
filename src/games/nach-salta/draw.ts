// Dibujo de "Nach salta" en un <canvas> chico (192 × 128 unidades de 100 mm)
// escalado entero. La calle de noche en capas con paralaje (edificios lejanos
// y lentos, carteles de neón en el medio, la vereda a la velocidad del juego
// con los metros pintados cada 100 m), las rocas y lo que está en el aire, y
// The Nach de costado a un cuarto del ancho. La paleta, las rocas y The Nach
// vienen de games/lib/nach. El estado se interpola entre ticks con `alpha`.

import { px } from "../lib/canvas-scale";
import { blit } from "../lib/hdp-kitchen";
import { textSprite } from "../lib/font";
import { headphonesSprite, nachSideSprite, rockSprite, STREET, type NachSidePose } from "../lib/nach";
import { DIST, hitbox, LONG, nachHeight, NACH_HALF_W, SHORT, speedAt, type Course, type Obstacle, type SimState } from "./rules";
import { cartelSprite, FIELD_H, FIELD_W, GROUND_Y, MM_PER_UNIT, NACH_X, palomaSprite, shoeSprite } from "./sprites";

export interface DrawOptions {
  alpha: number;
  reduced?: boolean;
  /** herramienta: las cajas de choque y las curvas del salto corto y del largo */
  hitboxes?: boolean;
}

/** el sacudón al chocar */
export const SHAKE_TICKS = 12;

let off: HTMLCanvasElement | null = null;
function offscreen(): HTMLCanvasElement {
  if (!off) {
    off = document.createElement("canvas");
    off.width = FIELD_W;
    off.height = FIELD_H;
  }
  return off;
}

/** la distancia interpolada (mm) */
export function distNow(s: SimState, alpha: number): number {
  if (s.crashed) return s.dist;
  const prev = DIST[Math.max(0, s.tick - 1)] ?? s.dist;
  return s.dist + (s.dist - prev) * alpha;
}

/** la pose de The Nach */
export function poseFor(s: SimState): NachSidePose {
  if (s.crashed) return "fall";
  if (s.duckHeld) return "duck";
  if (!s.ground) return "jump";
  const frames: NachSidePose[] = ["run0", "run1", "run2", "run3"];
  return frames[Math.floor(s.dist / 700) % 4]!;
}

/** de mm de calle a x de la vista */
function sx(mm: number, d: number): number {
  return NACH_X + (mm - d) / MM_PER_UNIT;
}
/** de altura (mm) a y de la vista */
function sy(mm: number): number {
  return GROUND_Y - mm / MM_PER_UNIT;
}

/** un número pseudo al azar estable por índice (solo estética) */
function noise(i: number): number {
  return ((i * 2654435761) >>> 0) % 1000;
}

function paintBackground(ctx: CanvasRenderingContext2D, d: number, reduced: boolean): void {
  ctx.fillStyle = STREET.sky;
  ctx.fillRect(0, 0, FIELD_W, GROUND_Y);
  // con reducir movimiento, todo el fondo en una sola capa
  const farF = reduced ? 0.35 : 0.15;
  const midF = reduced ? 0.35 : 0.5;
  // los edificios lejanos: oscuros y lentos
  const farX = (d / MM_PER_UNIT) * farF;
  const BW = 28;
  for (let i = Math.floor(farX / BW) - 1; i * BW - farX < FIELD_W + BW; i++) {
    const x = Math.round(i * BW - farX);
    const h = 40 + (noise(i) % 40);
    ctx.fillStyle = i % 2 ? STREET.building : STREET.building2;
    ctx.fillRect(x, GROUND_Y - 14 - h, BW - 2, h + 14);
    ctx.fillStyle = STREET.window;
    for (let wy = GROUND_Y - 10 - h; wy < GROUND_Y - 18; wy += 7) for (let wx = x + 3; wx < x + BW - 5; wx += 6) if ((noise(i * 31 + wx + wy) & 3) !== 0) ctx.fillRect(wx, wy, 2, 2);
  }
  // los carteles de neón en el medio
  const midX = (d / MM_PER_UNIT) * midF;
  const NW = 64;
  for (let i = Math.floor(midX / NW) - 1; i * NW - midX < FIELD_W + NW; i++) {
    const x = Math.round(i * NW - midX + (noise(i + 7) % 20));
    const y = 30 + (noise(i + 3) % 30);
    const c = STREET.neons[noise(i) % STREET.neons.length]!;
    const w = 16 + (noise(i + 11) % 14);
    ctx.fillStyle = STREET.lamp;
    ctx.fillRect(x + Math.floor(w / 2), y + 6, 1, GROUND_Y - y - 6);
    ctx.fillStyle = "#0E1220";
    ctx.fillRect(x - 1, y - 1, w + 2, 8);
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + 5, w, 1);
    ctx.fillRect(x, y, 1, 6);
    ctx.fillRect(x + w - 1, y, 1, 6);
    ctx.fillRect(x + 3, y + 2, w - 6, 2);
  }
  // la vereda a la velocidad del juego, con un número de metros cada 100 m
  ctx.fillStyle = STREET.curb;
  ctx.fillRect(0, GROUND_Y, FIELD_W, 2);
  ctx.fillStyle = STREET.road;
  ctx.fillRect(0, GROUND_Y + 2, FIELD_W, FIELD_H - GROUND_Y - 2);
  ctx.fillStyle = STREET.line;
  const tile = 20;
  const off0 = (d / MM_PER_UNIT) % tile;
  for (let x = -off0; x < FIELD_W; x += tile) ctx.fillRect(Math.round(x), GROUND_Y + 2, 1, 7);
  ctx.fillRect(0, GROUND_Y + 9, FIELD_W, 1);
  const firstM = Math.max(100, Math.ceil((d - NACH_X * MM_PER_UNIT) / 100_000) * 100);
  for (let m = firstM; sx(m * 1000, d) < FIELD_W + 20; m += 100) {
    const t = textSprite(`${m}`, "#A7C4B3");
    blit(ctx, `nachsalta:m:${m}`, t, Math.round(sx(m * 1000, d) - t.w), GROUND_Y + 10, t.w * 2, t.h * 2);
  }
}

function paintObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, d: number, tick: number, reduced: boolean): void {
  const x = sx(o.x0, d);
  const w = (o.x1 - o.x0) / MM_PER_UNIT;
  if (x > FIELD_W + 4 || x + w < -40) return;
  if (o.kind === "small" || o.kind === "big") {
    const sp = rockSprite(o.kind === "small" ? 1 : 3);
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(Math.round(x), GROUND_Y, sp.w, 1);
    blit(ctx, `nachsalta:roca:${o.kind}`, sp, x, GROUND_Y - sp.h);
    return;
  }
  const bottom = sy(o.bottom);
  if (o.look === "cartel") {
    const sp = cartelSprite();
    ctx.fillStyle = "#6B6F80";
    // las dos cadenitas hasta arriba
    for (const cx of [x + 2, x + sp.w - 3]) for (let y = 0; y < bottom - sp.h; y += 2) ctx.fillRect(Math.round(cx), y, 1, 1);
    blit(ctx, "nachsalta:cartel", sp, x, bottom - sp.h);
  } else if (o.look === "zapatillas") {
    // el cable de punta a punta, con las zapatillas colgando de los cordones
    const top = 14;
    ctx.fillStyle = "#6B6F80";
    for (let cx = -2; cx < FIELD_W + 2; cx++) {
      const u = (cx - (x + w / 2)) / 120;
      ctx.fillRect(cx, Math.round(top + 10 * (1 - u * u)), 1, 1);
    }
    const sh = shoeSprite();
    const cableY = Math.round(top + 10);
    ctx.fillStyle = "#F4F4F4";
    // las zapatillas al doble, una un poco más arriba que la otra
    for (const [i, cx] of [x, x + w - 10].entries()) {
      const shoeTop = bottom - 2 * sh.h - (i ? 2 : 0);
      ctx.fillRect(Math.round(cx + 4), cableY, 1, Math.max(0, shoeTop - cableY));
      blit(ctx, "nachsalta:zapa", sh, cx, shoeTop, sh.w * 2, sh.h * 2);
    }
  } else {
    const frame = reduced ? 0 : ((Math.floor(tick / 6) % 2) as 0 | 1);
    const sp = palomaSprite(frame);
    blit(ctx, `nachsalta:paloma:${frame}`, sp, x, sy(o.top) + (bottom - sy(o.top) - sp.h) / 2);
  }
}

export function paintScene(ctx: CanvasRenderingContext2D, s: SimState, course: Course, o: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  const reduced = !!o.reduced;
  const d = distNow(s, o.alpha);
  paintBackground(ctx, d, reduced);
  for (let i = Math.max(0, s.next - 2); i < course.obstacles.length; i++) {
    const ob = course.obstacles[i]!;
    if (sx(ob.x0, d) > FIELD_W + 4) break;
    paintObstacle(ctx, ob, d, s.tick, reduced);
  }
  // The Nach
  const pose = poseFor(s);
  const sp = nachSideSprite(pose);
  let y = s.y;
  if (!s.ground && !s.crashed) y = Math.max(0, s.y + s.vy * o.alpha);
  let nx = NACH_X - 8;
  if (s.crashed) {
    // tropieza y cae: se desliza un poco hacia adelante
    const t = Math.min(30, s.tick - s.crashAt + o.alpha);
    nx = NACH_X - 10 + t * 0.4;
    y = 0;
  }
  blit(ctx, `nachsalta:nach:${pose}`, sp, Math.round(nx), Math.round(sy(y) - sp.h + 1));
  if (s.crashed) {
    // los auriculares salen volando
    const t = s.tick - s.crashAt + o.alpha;
    if (t < 50) {
      const hp = headphonesSprite();
      blit(ctx, "nachsalta:auris", hp, NACH_X + 2 + t * 1.1, sy(1900) - t * 1.6 + 0.07 * t * t);
    }
  }
  if (o.hitboxes) paintDebug(ctx, s, course, d);
}

/** la herramienta: las cajas de choque y la curva del salto corto y del largo desde donde está */
function paintDebug(ctx: CanvasRenderingContext2D, s: SimState, course: Course, d: number): void {
  ctx.strokeStyle = "#6FD3E0";
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(sx(s.dist - NACH_HALF_W, d)) + 0.5, Math.round(sy(s.y + nachHeight(s))) + 0.5, (2 * NACH_HALF_W) / MM_PER_UNIT, nachHeight(s) / MM_PER_UNIT);
  ctx.strokeStyle = "#FF6F91";
  for (let i = s.next; i < course.obstacles.length; i++) {
    const h = hitbox(course.obstacles[i]!);
    const x = sx(h.x0, d);
    if (x > FIELD_W) break;
    const top = Math.max(0, sy(Math.min(h.y1, 30_000)));
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(top) + 0.5, (h.x1 - h.x0) / MM_PER_UNIT, sy(h.y0) - top);
  }
  // las curvas, desde el piso, a la velocidad de ahora
  const v = speedAt(s.tick);
  for (const [prof, color] of [
    [SHORT, "#FFD34E"],
    [LONG, "#8EDC66"],
  ] as const) {
    ctx.fillStyle = color;
    prof.forEach((yy, i) => {
      if (i % 2) return;
      ctx.fillRect(Math.round(NACH_X + ((i + 1) * v) / MM_PER_UNIT), Math.round(sy(yy)), 1, 1);
    });
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, k: number, s: SimState, course: Course, o: DrawOptions): void {
  const c = offscreen();
  const octx = c.getContext("2d")!;
  paintScene(octx, s, course, o);
  ctx.imageSmoothingEnabled = false;
  // un leve sacudón al chocar (no con reducir movimiento)
  const shake = !o.reduced && s.crashed && s.tick - s.crashAt < SHAKE_TICKS ? ((s.tick - s.crashAt) % 2 ? 1 : -1) : 0;
  ctx.fillStyle = STREET.sky;
  ctx.fillRect(0, 0, px(FIELD_W, k), px(FIELD_H, k));
  ctx.drawImage(c, 0, 0, FIELD_W, FIELD_H, shake * k, 0, px(FIELD_W, k), px(FIELD_H, k));
}
