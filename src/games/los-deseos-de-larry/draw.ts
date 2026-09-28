// Dibujo de la partida en un <canvas>, en escalado entero. Sin React: lo usan
// el juego y la herramienta de desarrollo. Dibuja el estado interpolado entre
// el tick anterior y el actual (alpha), así se ve fluido a cualquier frame rate.

import { CATCH_Y, FIELD_H, FIELD_W, FLOOR_Y, isWish, LARRY_W, OBJ_SIZE, SUB, type Drop, type Kind, type SimState } from "./rules";
import { dropSprite, larrySprite, LARRY_SPRITE_H, LARRY_SPRITE_W, SKY, streetRects, type Face, type Sprite } from "./sprites";

/** cuánto dura la cara feliz después de agarrar un deseo */
const HAPPY_TICKS = 24;
/** cuánto queda el "plaf" en el piso */
const SPLAT_TICKS = 36;
/** sacudón de pantalla al perder una vida (decorativo) */
const SHAKE_TICKS = 12;

export interface DrawOptions {
  /** fracción del tick en curso, 0 a 1 */
  alpha: number;
  /** prefers-reduced-motion: sin sacudón ni partículas */
  reduced?: boolean;
  /** herramienta de desarrollo: cajas de colisión */
  hitboxes?: boolean;
}

/** píxeles del dispositivo por unidad lógica que entran en un espacio dado */
export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return Math.max(1, Math.floor(Math.min((cssWidth * dpr) / FIELD_W, (cssHeight * dpr) / FIELD_H)));
}

export function faceFor(state: SimState): Face {
  if (state.end?.reason === "verdura" || state.end?.reason === "bandera") return "asco";
  if (state.end?.reason === "sin-vidas") return "bajon";
  if (state.lastCatch && isWish(state.lastCatch.kind) && state.tick - state.lastCatch.tick < HAPPY_TICKS) return "feliz";
  return "normal";
}

// sprites y fondo pintados una vez por escala
const cache = new Map<string, HTMLCanvasElement>();
function painted(key: string, w: number, h: number, k: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const id = `${key}@${k}`;
  let c = cache.get(id);
  if (!c) {
    c = document.createElement("canvas");
    c.width = w * k;
    c.height = h * k;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    paint(ctx);
    cache.set(id, c);
  }
  return c;
}
function spriteCanvas(key: string, s: Sprite, k: number) {
  return painted(key, s.w, s.h, k, (ctx) => {
    for (const p of s.px) {
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x * k, p.y * k, k, k);
    }
  });
}
function background(k: number) {
  return painted("calle", FIELD_W, FIELD_H, k, (ctx) => {
    ctx.fillStyle = SKY;
    ctx.fillRect(0, 0, FIELD_W * k, FIELD_H * k);
    for (const r of streetRects()) {
      ctx.fillStyle = r.c;
      ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
    }
  });
}
function drop(kind: Kind, k: number) {
  return spriteCanvas(`drop:${kind}`, dropSprite(kind), k);
}

/** unidades (con fracción) → píxeles del dispositivo, redondeado */
const px = (units: number, k: number) => Math.round(units * k);

export function drawScene(ctx: CanvasRenderingContext2D, state: SimState, rain: readonly Drop[], k: number, opts: DrawOptions) {
  ctx.imageSmoothingEnabled = false;
  const a = opts.alpha;
  ctx.save();

  // sacudón al perder una vida (decorativo)
  const lastLoss = [...state.splats].reverse().find((s) => isWish(s.kind));
  if (!opts.reduced && lastLoss && state.tick - lastLoss.tick < SHAKE_TICKS) {
    const d = state.tick % 2 === 0 ? k : -k;
    ctx.translate(d, 0);
  }
  ctx.drawImage(background(k), 0, 0);

  // lo que se cayó: aplastado contra el piso, y se desvanece
  for (const s of state.splats) {
    const age = state.tick - s.tick;
    if (age >= SPLAT_TICKS) continue;
    const sp = dropSprite(s.kind);
    const img = drop(s.kind, k);
    const w = Math.round(sp.w * 1.4);
    const h = Math.max(2, Math.round(sp.h / 2));
    ctx.globalAlpha = age < SPLAT_TICKS - 12 ? 1 : (SPLAT_TICKS - age) / 12;
    ctx.drawImage(img, px(s.x - w / 2, k), px(FLOOR_Y - h, k), w * k, h * k);
    if (!opts.reduced && age < 14 && isWish(s.kind)) {
      // unas migas que saltan
      ctx.fillStyle = "#E8A64A";
      const spread = age * 0.6;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1.6, -0.4], [1.6, -0.4]] as const) {
        ctx.fillRect(px(s.x + dx * spread, k), px(FLOOR_Y - 2 + dy * spread + age * age * 0.03, k), k, k);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Larry
  const lx = (state.prevLarryX + (state.larryX - state.prevLarryX) * a) / SUB;
  const moving = !state.end && state.larryX !== state.prevLarryX;
  const walk = moving ? ((Math.floor(state.tick / 6) % 2) + 1) as 1 | 2 : 0;
  const face = faceFor(state);
  ctx.drawImage(spriteCanvas(`larry:${face}:${walk}`, larrySprite(face, walk), k), px(lx - LARRY_SPRITE_W / 2, k), px(FLOOR_Y - LARRY_SPRITE_H, k));

  // lo que cae
  for (const f of state.falling) {
    const d = rain[f.i]!;
    const sp = dropSprite(d.kind);
    const y = (f.prevY + (f.y - f.prevY) * a) / SUB;
    ctx.drawImage(drop(d.kind, k), px(d.x - sp.w / 2, k), px(y - sp.h, k));
  }

  // lo malo que agarró queda en la mano, arriba de la cabeza
  if (state.end && state.lastCatch && !isWish(state.lastCatch.kind)) {
    const sp = dropSprite(state.lastCatch.kind);
    ctx.drawImage(drop(state.lastCatch.kind, k), px(lx - sp.w / 2, k), px(CATCH_Y - sp.h - 1, k));
  }

  if (opts.hitboxes) {
    ctx.lineWidth = Math.max(1, Math.floor(k / 3));
    ctx.strokeStyle = "#FF3B30";
    ctx.strokeRect(px(lx - LARRY_W / 2, k), px(CATCH_Y - 1, k), LARRY_W * k, 2 * k);
    for (const f of state.falling) {
      const d = rain[f.i]!;
      const y = (f.prevY + (f.y - f.prevY) * a) / SUB;
      ctx.strokeStyle = isWish(d.kind) ? "#FFD34E" : "#FF3B30";
      ctx.strokeRect(px(d.x - OBJ_SIZE / 2, k), px(y - OBJ_SIZE, k), OBJ_SIZE * k, OBJ_SIZE * k);
    }
    ctx.fillStyle = "#6FD3E0";
    ctx.fillRect(0, px(CATCH_Y, k), FIELD_W * k, 1);
    ctx.fillRect(0, px(FLOOR_Y, k), FIELD_W * k, 1);
  }
  ctx.restore();
}
