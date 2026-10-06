// Dibujo de "Big Bro afila" en un <canvas> escalado entero (144 × 220
// unidades). Lo que gira (la horma con sus cuchillas e ingredientes) se pinta
// en un canvas chico fuera de pantalla, a una unidad por píxel y sin rotar,
// y se gira entero al dibujarlo escalado con vecino más cercano, como en
// "colgado del 121": así el pixel art rotado no se ve roto. Las cuchillas
// clavadas se pintan radiales, píxel por píxel, dentro de ese canvas. El
// fondo (la cocina de la hdp atenuada, de games/lib) y lo que no gira (Big
// Bro, las cuchillas que le quedan, la que vuela) van en otro canvas chico.

import { px } from "../lib/canvas-scale";
import { bigBroSprite } from "../lib/big-bro";
import { blit, paintHood, paintNeonSign, paintTiles } from "../lib/hdp-kitchen";
import { textSprite } from "../lib/font";
import { greyedSprite, OUTLINE, paintedCanvas } from "../lib/sprites";
import { BREAK_TICKS, FLIGHT_TICKS, INGREDIENT_HALF, knivesLeft, MIN_SEPARATION, relativeAngle, TURN, type BroFace, type SimState, type Wheel } from "./rules";
import { BRO, CHEESE, EMBED, FIELD_H, FIELD_W, HAND, HOLES, ingredientSprite, knifeColor, knifeSideSprite, knifeSprite, KNIFE_H, KNIFE_W, sparkSprite, WHEEL } from "./sprites";

/** el canvas de la horma: entra la grande con las cuchillas */
export const WHEEL_CANVAS = 2 * (WHEEL.rBig + KNIFE_H) + 6;
const WC = WHEEL_CANVAS / 2;
/** lo que dura cada animación (ticks) */
export const INGREDIENT_FLY_TICKS = 36;
export const SHAKE_TICKS = 14;
export const WEDGES = 6;

export interface DrawOptions {
  alpha: number;
  reduced?: boolean;
  face: BroFace;
  /** herramienta: ángulos, margen de choque y rango de los ingredientes */
  debug?: boolean;
}

const RAD = (2 * Math.PI) / TURN;

function canvasOf(key: string, w: number, h: number): HTMLCanvasElement {
  const store = canvasOf as unknown as { m?: Map<string, HTMLCanvasElement> };
  store.m ??= new Map();
  let c = store.m.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    store.m.set(key, c);
  }
  return c;
}

/** la horma sola (cachea por tamaño): queso, cáscara, agujeritos y, si es la grande, la etiqueta */
function cheeseCanvas(big: boolean): HTMLCanvasElement {
  const r = big ? WHEEL.rBig : WHEEL.r;
  return paintedCanvas(`afila:queso:${big}`, WHEEL_CANVAS, WHEEL_CANVAS, 1, (ctx) => {
    for (let y = -r - 1; y <= r + 1; y++) {
      for (let x = -r - 1; x <= r + 1; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > r + 0.5) continue;
        ctx.fillStyle = d > r - 0.6 ? OUTLINE : d > r - 3 ? CHEESE.rind : CHEESE.body;
        ctx.fillRect(WC + x, WC + y, 1, 1);
      }
    }
    for (const [deg, f, size] of HOLES) {
      const a = (deg * Math.PI) / 180;
      const hx = Math.round(WC + Math.cos(a) * f * (r - 5));
      const hy = Math.round(WC + Math.sin(a) * f * (r - 5));
      const sz = big ? size + 1 : size;
      ctx.fillStyle = CHEESE.hole;
      ctx.fillRect(hx, hy, sz, sz);
      ctx.fillStyle = CHEESE.holeDark;
      ctx.fillRect(hx, hy, sz, 1);
    }
    if (big) {
      // la etiqueta de la horma grande
      const label = textSprite("hdp", CHEESE.labelInk);
      const lw = label.w + 6;
      const lh = label.h + 4;
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(WC - lw / 2 - 1, WC + 8 - 1, lw + 2, lh + 2);
      ctx.fillStyle = CHEESE.label;
      ctx.fillRect(WC - lw / 2, WC + 8, lw, lh);
      for (const p of label.px) {
        ctx.fillStyle = p.c;
        ctx.fillRect(WC - lw / 2 + 3 + p.x, WC + 10 + p.y, 1, 1);
      }
    }
  });
}

/** una cuchilla clavada en el ángulo relativo `rel`: radial, con la punta adentro del queso y el mango afuera */
function paintStuckKnife(ctx: CanvasRenderingContext2D, rel: number, r: number): void {
  const a = rel * RAD;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  for (let t = 0; t < KNIFE_H; t += 0.5) {
    for (let w = -1; w <= 1; w += 0.5) {
      const c = knifeColor(Math.floor(t), Math.round(w + 1));
      if (!c) continue;
      const d = r - EMBED + t;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(WC + cos * d - sin * w), Math.round(WC + sin * d + cos * w), 1, 1);
    }
  }
}

/** la horma con lo que tiene clavado y pegado, sin rotar, en su canvas */
function paintWheel(w: Wheel): HTMLCanvasElement {
  const big = w.spec.big;
  const r = big ? WHEEL.rBig : WHEEL.r;
  const c = canvasOf("afila:horma", WHEEL_CANVAS, WHEEL_CANVAS);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, WHEEL_CANVAS, WHEEL_CANVAS);
  for (const k of w.stuck) paintStuckKnife(ctx, k.rel, r);
  ctx.drawImage(cheeseCanvas(big), 0, 0);
  for (const g of w.ingredients) {
    if (g.hitAt >= 0) continue;
    const a = g.angle * RAD;
    // al doble, para que tienten
    const s = ingredientSprite(g.kind);
    const d = r + 4;
    blit(ctx, `afila:ing:${g.kind}`, s, WC + Math.cos(a) * d - s.w, WC + Math.sin(a) * d - s.h, s.w * 2, s.h * 2);
  }
  return c;
}

/** la horma girada y escalada en el canvas final, con el centro en (cx, cy) unidades */
function drawWheelAt(ctx: CanvasRenderingContext2D, k: number, wheel: HTMLCanvasElement, angle: number, cx: number, cy: number): void {
  ctx.save();
  ctx.translate(px(cx, k), px(cy, k));
  ctx.rotate(angle * RAD);
  ctx.drawImage(wheel, 0, 0, WHEEL_CANVAS, WHEEL_CANVAS, -WC * k, -WC * k, WHEEL_CANVAS * k, WHEEL_CANVAS * k);
  ctx.restore();
}

/** la cocina de la hdp, de fondo y atenuada */
function paintBackground(): HTMLCanvasElement {
  return paintedCanvas("afila:fondo", FIELD_W, FIELD_H, 1, (ctx) => {
    paintTiles(ctx, FIELD_W, FIELD_H);
    paintHood(ctx, 4, 52);
    paintNeonSign(ctx, 96, 6, 2, false);
    ctx.fillStyle = "#3A2A22";
    ctx.fillRect(0, FIELD_H - 22, FIELD_W, 22);
    ctx.fillStyle = "rgba(10, 26, 22, 0.62)";
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  });
}

export function drawScene(ctx: CanvasRenderingContext2D, k: number, s: SimState, o: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  const t = s.tick + o.alpha;
  const reduced = !!o.reduced;
  // un leve sacudón al chocar
  let shake = 0;
  if (!reduced && s.phase === "crash" && s.tick - s.crashAt < SHAKE_TICKS) shake = (s.tick - s.crashAt) % 2 ? 1 : -1;
  ctx.save();
  ctx.translate(shake * k, 0);
  ctx.drawImage(paintBackground(), 0, 0, FIELD_W, FIELD_H, 0, 0, px(FIELD_W, k), px(FIELD_H, k));

  // la horma
  const w = s.wheel;
  if (s.phase === "break" && s.broken) {
    const since = t - (s.breakUntil - BREAK_TICKS);
    const old = paintWheel(s.broken);
    if (!reduced) {
      // se parte en cuñas que salen volando con sus cuchillas
      const p = Math.min(1, since / (BREAK_TICKS * 0.6));
      if (p < 1) {
        for (let i = 0; i < WEDGES; i++) {
          const mid = ((i + 0.5) / WEDGES) * 2 * Math.PI + s.broken.spin.angle * RAD;
          ctx.save();
          ctx.globalAlpha = 1 - p;
          ctx.translate(px(WHEEL.x + Math.cos(mid) * p * 40, k), px(WHEEL.y + Math.sin(mid) * p * 40 + p * p * 30, k));
          ctx.rotate(s.broken.spin.angle * RAD + (i % 2 ? 1 : -1) * p * 0.8);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          const a0 = (i / WEDGES) * 2 * Math.PI;
          ctx.arc(0, 0, (WHEEL.rBig + KNIFE_H) * k, a0, a0 + (2 * Math.PI) / WEDGES);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(old, 0, 0, WHEEL_CANVAS, WHEEL_CANVAS, -WC * k, -WC * k, WHEEL_CANVAS * k, WHEEL_CANVAS * k);
          ctx.restore();
        }
      }
      // la siguiente entra desde arriba en el último tramo del cambio
      const enter = BREAK_TICKS * 0.4;
      const q = (since - (BREAK_TICKS - enter)) / enter;
      if (q > 0 && s.next) {
        const nextWheel: Wheel = { spec: s.next, spin: { angle: s.next.startAngle, vel: 0, seg: 0, left: 0 }, stuck: s.next.pre.map((rel) => ({ rel, thrown: false, tick: -1 })), ingredients: s.next.ingredients.map((g) => ({ ...g, hitAt: -1 })), thrown: 0 };
        drawWheelAt(ctx, k, paintWheel(nextWheel), s.next.startAngle, WHEEL.x, WHEEL.y - (1 - Math.min(1, q)) * (WHEEL.y + WHEEL.rBig + KNIFE_H));
      }
    }
  } else {
    const angle = s.phase === "play" ? w.spin.angle + w.spin.vel * o.alpha : w.spin.angle;
    drawWheelAt(ctx, k, paintWheel(w), angle, WHEEL.x, WHEEL.y);
    if (o.debug) drawDebug(ctx, k, w, angle);
  }

  // lo que no gira, en unidades de la vista
  const fg = canvasOf("afila:frente", FIELD_W, FIELD_H);
  const f = fg.getContext("2d")!;
  f.imageSmoothingEnabled = false;
  f.clearRect(0, 0, FIELD_W, FIELD_H);
  const r = w.spec.big ? WHEEL.rBig : WHEEL.r;
  // la cuchilla en vuelo: de la mano al punto más bajo de la horma, en 6 ticks
  if (s.flying !== null && s.phase === "play") {
    const p = Math.min(1, (t - s.flying) / FLIGHT_TICKS);
    const y = HAND.y - (HAND.y - (WHEEL.y + r - EMBED)) * p;
    blit(f, "afila:cuchilla", knifeSprite(), HAND.x - 1, y);
  }
  // un ingrediente acertado: sale volando, "+5" y una chispa
  const hit = s.lastIngredient;
  if (hit && t - hit.tick < INGREDIENT_FLY_TICKS && s.phase !== "crash") {
    const p = (t - hit.tick) / INGREDIENT_FLY_TICKS;
    const hx = WHEEL.x;
    const hy = WHEEL.y + r + 2;
    const sp = ingredientSprite(hit.kind);
    if (!reduced) {
      blit(f, `afila:ing:${hit.kind}`, sp, hx - sp.w + p * 30, hy - sp.h + p * p * 40 - p * 20, sp.w * 2, sp.h * 2);
      if (p < 0.4) blit(f, "afila:chispa", sparkSprite(), hx - 2, hy - 2);
    }
    const plus = textSprite("+5", "#86E05A");
    blit(f, "afila:mas5", plus, hx + 10, hy - 6 - (reduced ? 0 : p * 12), plus.w * 2, plus.h * 2);
  }
  // Big Bro abajo al centro, y a su izquierda las cuchillas que le quedan
  const pose = o.face === "tira" ? "tira" : o.face === "contento" ? "contento" : o.face === "enojado" ? "enojado" : "espera";
  blit(f, `afila:bro:${pose}`, bigBroSprite(pose), BRO.x, BRO.y);
  const left = s.phase === "break" ? 0 : knivesLeft(s);
  const total = w.spec.throws;
  for (let i = 0; i < total; i++) {
    const sp = i < left ? knifeSideSprite() : greyedSprite(knifeSideSprite());
    blit(f, i < left ? "afila:queda" : "afila:gastada", sp, BRO.x - 26, FIELD_H - 8 - i * 5);
  }
  f.globalAlpha = 1;
  ctx.drawImage(fg, 0, 0, FIELD_W, FIELD_H, 0, 0, px(FIELD_W, k), px(FIELD_H, k));

  // el choque: chispas y la cuchilla que rebota girando y se cae
  if (s.phase === "crash") {
    const since = t - s.crashAt;
    const p = since / 60;
    const bx = WHEEL.x + since * 0.9;
    const by = WHEEL.y + r + 6 + since * 0.6 + 0.04 * since * since;
    if (by < FIELD_H + KNIFE_H) {
      ctx.save();
      ctx.translate(px(bx, k), px(by, k));
      ctx.rotate(p * 9);
      const kc = canvasOf("afila:rebota", KNIFE_W, KNIFE_H);
      const kx = kc.getContext("2d")!;
      kx.clearRect(0, 0, KNIFE_W, KNIFE_H);
      blit(kx, "afila:cuchilla", knifeSprite(), 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(kc, 0, 0, KNIFE_W, KNIFE_H, (-KNIFE_W / 2) * k, (-KNIFE_H / 2) * k, KNIFE_W * k, KNIFE_H * k);
      ctx.restore();
    }
    if (!reduced && since < 24) {
      const sp = sparkSprite();
      const c = canvasOf("afila:chispas", sp.w, sp.h);
      const cx = c.getContext("2d")!;
      cx.clearRect(0, 0, sp.w, sp.h);
      blit(cx, "afila:chispa", sp, 0, 0);
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (0.15 + 0.7 * (i / 4));
        const d = 4 + since * 1.2;
        ctx.drawImage(c, 0, 0, sp.w, sp.h, px(WHEEL.x + Math.cos(a) * d - 2, k), px(WHEEL.y + r - Math.sin(a) * d * 0.6 - 2, k), sp.w * k, sp.h * k);
      }
    }
  }
  ctx.restore();
}

/** la herramienta: el ángulo de cada cuchilla, su margen de choque y el rango de cada ingrediente */
function drawDebug(ctx: CanvasRenderingContext2D, k: number, w: Wheel, angle: number): void {
  const r = (w.spec.big ? WHEEL.rBig : WHEEL.r) * k;
  const cx = WHEEL.x * k;
  const cy = WHEEL.y * k;
  ctx.save();
  ctx.lineWidth = Math.max(2, k);
  for (const g of w.ingredients) {
    if (g.hitAt >= 0) continue;
    ctx.strokeStyle = "rgba(134, 224, 90, 0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4 * k, (angle + g.angle - INGREDIENT_HALF) * RAD, (angle + g.angle + INGREDIENT_HALF) * RAD);
    ctx.stroke();
  }
  ctx.font = `${Math.max(9, 3 * k)}px monospace`;
  for (const kn of w.stuck) {
    ctx.strokeStyle = "rgba(255, 111, 145, 0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3 * k, (angle + kn.rel - MIN_SEPARATION) * RAD, (angle + kn.rel + MIN_SEPARATION) * RAD);
    ctx.stroke();
    const a = (angle + kn.rel) * RAD;
    ctx.fillStyle = "#F7FFF2";
    ctx.fillText(String(kn.rel), cx + Math.cos(a) * (r + 22 * k) - 10, cy + Math.sin(a) * (r + 22 * k));
  }
  // dónde se clavaría si llega ahora
  ctx.fillStyle = "#6FD3E0";
  ctx.fillText(`abajo ${relativeAngle(Math.round(angle))} · v ${w.spin.vel}`, 2 * k, 10 * k);
  ctx.restore();
}

