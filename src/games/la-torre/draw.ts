// Dibujo de la partida en un <canvas>, en escalado entero. Sin React: lo usan
// el juego y la herramienta de desarrollo. Cada objeto es un sprite pintado
// una vez en un canvas chico fuera de pantalla (a una unidad por píxel) y
// dibujado girado con el ángulo que dice la física, escalado con vecino más
// cercano: el pixel art rotado no se ve roto (el esquema del colgado). La
// cámara sube con la torre; la regla de la izquierda marca cada 10 cm y la
// altura máxima quieta en --luciernaga.

import { integerScale, px } from "../lib/canvas-scale";
import { textSprite } from "../lib/font";
import { spriteCanvas } from "../lib/sprites";
import { objectSprite, SPECS, type Kind } from "./objects";
import { BASE_THICK, BASE_W, worldPieces, type BodyRef } from "./physics";
import { FIELD_H, FIELD_W, swayX, type Sim } from "./rules";

export interface DrawOptions {
  /** fracción del tick en curso, 0 a 1 */
  alpha: number;
  reduced?: boolean;
  /** herramienta: las formas de choque */
  colliders?: boolean;
  /** herramienta: el estado de reposo de cada cuerpo */
  rest?: boolean;
}

/** la cara de arriba de la base está a esta altura desde el borde de abajo de la vista (con la cámara en 0) */
export const GROUND = 30;
/** el objeto que espera se dibuja a esta altura desde arriba (la cámara lo sigue) */
export const WAITING_SY = 34;
/** el borde izquierdo de la regla */
export const RULER_X = 3;

const WALL = "#1B2430";
const WALL_LINE = "#222d3b";
const WOOD = "#8B5A2B";
const WOOD_DARK = "#6B4220";
const WOOD_LIGHT = "#A86E3A";
const LUCIERNAGA = "#FFD34E";
const RULER = "#C9D1D9";
const RULER_DIM = "#5A6B7C";
const GUIDE = "#F7FFF2";

export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return integerScale(cssWidth, cssHeight, dpr, FIELD_W, FIELD_H);
}

/** a qué altura (mundo) tiene que estar la cámara para que el objeto que espera quede a WAITING_SY de arriba */
export function cameraTarget(sim: Sim): number {
  const wy = sim.waiting ? sim.waiting.y : 0;
  return Math.max(0, wy - (FIELD_H - GROUND - WAITING_SY));
}

/** la cámara del dibujo: sigue al objetivo con suavizado (de una, con prefers-reduced-motion) */
export class Camera {
  y = 0;
  follow(target: number, reduced: boolean): void {
    if (reduced) this.y = target;
    else this.y += (target - this.y) * 0.12;
    if (Math.abs(this.y - target) < 0.05) this.y = target;
  }
}

/** mundo → vista (unidades), con y hacia abajo */
export function toView(cam: number, wx: number, wy: number): [number, number] {
  return [FIELD_W / 2 + wx, FIELD_H - GROUND - (wy - cam)];
}

/** el ángulo más corto entre dos ángulos, para interpolar */
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

function drawSprite(ctx: CanvasRenderingContext2D, kind: Kind, vx: number, vy: number, angle: number, k: number): void {
  const sp = objectSprite(kind);
  const off = spriteCanvas(`torre:${kind}`, sp, 1);
  ctx.save();
  ctx.translate(px(vx, k), px(vy, k));
  // la física gira antihorario con y hacia arriba; la vista tiene y hacia abajo
  ctx.rotate(-angle);
  ctx.drawImage(off, 0, 0, sp.w, sp.h, Math.round((-sp.w / 2) * k), Math.round((-sp.h / 2) * k), sp.w * k, sp.h * k);
  ctx.restore();
}

export function drawScene(ctx: CanvasRenderingContext2D, sim: Sim, cam: number, k: number, opts: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  const W = FIELD_W * k;
  const H = FIELD_H * k;
  // la pared
  ctx.fillStyle = WALL;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = WALL_LINE;
  const firstLine = Math.floor(cam / 20) * 20;
  for (let wy = firstLine; wy < cam + FIELD_H; wy += 20) {
    const [, vy] = toView(cam, 0, wy);
    ctx.fillRect(0, px(vy, k), W, k);
  }

  // la base: una tabla de madera con la cara de arriba en y = 0, y el pie abajo
  {
    const [vx0, vy0] = toView(cam, -BASE_W / 2, 0);
    const top = px(vy0, k);
    ctx.fillStyle = WOOD;
    ctx.fillRect(px(vx0, k), top, BASE_W * k, BASE_THICK * k);
    ctx.fillStyle = WOOD_LIGHT;
    ctx.fillRect(px(vx0, k), top, BASE_W * k, k);
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(px(vx0, k), top + (BASE_THICK - 1) * k, BASE_W * k, k);
    for (const gx of [9, 22, 38, 51]) ctx.fillRect(px(vx0 + gx, k), top + 2 * k, 4 * k, k);
    // el pie
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(px(FIELD_W / 2 - 8, k), top + BASE_THICK * k, 16 * k, Math.max(0, H - top - BASE_THICK * k));
    ctx.fillStyle = WOOD;
    ctx.fillRect(px(FIELD_W / 2 - 6, k), top + BASE_THICK * k, 2 * k, Math.max(0, H - top - BASE_THICK * k));
  }

  // la regla: una raya cada 10 cm con el número, y la marca de la altura máxima quieta
  {
    const from = Math.max(0, Math.floor(cam / 10) * 10);
    for (let cm = from; cm <= cam + FIELD_H; cm += 10) {
      const [, vy] = toView(cam, 0, cm);
      if (vy < -6 || vy > FIELD_H + 6) continue;
      const major = cm % 50 === 0;
      ctx.fillStyle = major ? RULER : RULER_DIM;
      ctx.fillRect(px(RULER_X, k), px(vy, k), (major ? 7 : 4) * k, k);
      if (cm > 0 && cm % 20 === 0) {
        const label = spriteCanvas(`torre:cm:${cm}`, textSprite(String(cm), RULER), 1);
        ctx.drawImage(label, 0, 0, label.width, label.height, px(RULER_X + 8, k), px(vy - 2, k), label.width * k, label.height * k);
      }
    }
    if (sim.best > 0) {
      const [, vy] = toView(cam, 0, sim.best);
      if (vy > -2 && vy < FIELD_H + 2) {
        ctx.fillStyle = LUCIERNAGA;
        ctx.fillRect(px(RULER_X, k), px(vy, k), 9 * k, k);
        ctx.fillRect(px(RULER_X + 9, k), px(vy - 1, k), k, 3 * k);
      }
    }
  }

  // los objetos apilados, interpolados entre el tick anterior y el actual
  const alpha = sim.end ? 1 : opts.alpha;
  for (const b of sim.bodies) {
    const t = b.body.translation();
    const a = b.body.rotation();
    const x = b.prevX + (t.x - b.prevX) * alpha;
    const y = b.prevY + (t.y - b.prevY) * alpha;
    const ang = lerpAngle(b.prevAngle, a, alpha);
    const [vx, vy] = toView(cam, x, y);
    if (vy < -30 || vy > FIELD_H + 30) continue;
    drawSprite(ctx, b.kind, vx, vy, ang, k);
  }

  // el objeto que espera, con la guía punteada hasta lo que tiene abajo
  const w = sim.waiting;
  if (w && !sim.end) {
    const local = sim.tick - w.appearedTick + (opts.reduced ? 0 : opts.alpha);
    const x = swayX(sim.plan, w.index, local);
    const [vx, vy] = toView(cam, x, w.y);
    const spec = SPECS[w.kind];
    const halfH = w.rot % 2 === 0 ? spec.h / 2 : spec.w / 2;
    // la guía: desde abajo del objeto hasta la base (o hasta donde termina la vista)
    const [, vBase] = toView(cam, 0, 0);
    ctx.fillStyle = GUIDE;
    const gx = px(vx, k);
    for (let gy = Math.round(vy + halfH + 1); gy < Math.min(vBase, FIELD_H); gy += 3) ctx.fillRect(gx, px(gy, k), k, k);
    drawSprite(ctx, w.kind, vx, vy, (w.rot * Math.PI) / 2, k);
  }

  if (opts.colliders) {
    ctx.strokeStyle = "#6FD3E0";
    ctx.lineWidth = Math.max(1, k / 2);
    for (const b of sim.bodies) {
      for (const poly of worldPieces(b)) {
        ctx.beginPath();
        poly.forEach(([wx, wy], i) => {
          const [vx, vy] = toView(cam, wx, wy);
          if (i === 0) ctx.moveTo(px(vx, k), px(vy, k));
          else ctx.lineTo(px(vx, k), px(vy, k));
        });
        ctx.closePath();
        ctx.stroke();
      }
    }
    // la base
    const [bx, by] = toView(cam, -BASE_W / 2, 0);
    ctx.strokeRect(px(bx, k), px(by, k), BASE_W * k, BASE_THICK * k);
  }
  if (opts.rest) {
    for (const b of sim.bodies) {
      const t = b.body.translation();
      const [vx, vy] = toView(cam, t.x, t.y);
      ctx.fillStyle = restColor(b);
      ctx.fillRect(px(vx - 1, k), px(vy - 1, k), 3 * k, 3 * k);
    }
  }
}

/** verde: dormido; amarillo: quieto pero despierto; rojo: en movimiento */
export function restColor(b: BodyRef): string {
  if (b.body.isSleeping()) return "#8EDC66";
  const v = b.body.linvel();
  const quiet = Math.abs(v.x) <= 1.5 && Math.abs(v.y) <= 1.5 && Math.abs(b.body.angvel()) <= 0.08;
  return quiet ? "#FFD34E" : "#FF6F91";
}
