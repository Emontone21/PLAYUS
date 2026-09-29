// Dibujo de la escena en un <canvas>, en escalado entero. Sin React: lo usan
// el juego y la herramienta de desarrollo (que además muestra cada estado).

import { integerScale, px } from "../lib/canvas-scale";
import { paintedCanvas, spriteCanvas } from "../lib/sprites";
import { textSprite } from "../lib/font";
import {
  backgroundRects,
  BRO_H,
  broSprite,
  CANARIO_H,
  CANARIO_W,
  canarioSprite,
  COUNTER_H,
  counterSprite,
  FIELD_H,
  FIELD_W,
  FLOOR_Y,
  GRILL_H,
  grillSprite,
  type CanarioLook,
} from "./sprites";

/** dónde está cada cosa (unidades) */
export const GRILL_X = 3;
export const GRILL_Y = FLOOR_Y - GRILL_H;
export const BRO_X = 36;
export const BRO_Y = FLOOR_Y - BRO_H;
export const COUNTER_X = FIELD_W - 35;
export const COUNTER_Y = FLOOR_Y - COUNTER_H + 1;
export const CANARIO_X = COUNTER_X + 8;
/** el canario está detrás de la mesada: sus piernas quedan tapadas */
export const CANARIO_Y = COUNTER_Y + 3 - CANARIO_H + 4;

/** cuánto dura la chispa y el "tss" después de un toque */
export const SPARK_MS = 160;

export interface Scene {
  /** estado del canario que se ve */
  look: CanarioLook;
  /** ms transcurridos (para la animación) */
  now: number;
  /** ms desde el último toque (Infinity si no hubo) */
  sinceTap: number;
  /** cuánto lleva el estado actual (ms), para el humo del aviso */
  sinceState: number;
  reduced?: boolean;
}

export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return integerScale(cssWidth, cssHeight, dpr, FIELD_W, FIELD_H);
}

function background(k: number) {
  return paintedCanvas("parrilla:fondo", FIELD_W, FIELD_H, k, (ctx) => {
    for (const r of backgroundRects()) {
      ctx.fillStyle = r.c;
      ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
    }
  });
}

const SMOKE = "#D9D9DE";
const SMOKE_DARK = "#B9B9C2";

/** una bocanada: un rombo chico de humo */
function puff(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, k: number, c = SMOKE) {
  ctx.fillStyle = c;
  ctx.fillRect(px(x - size / 2, k), px(y, k), size * k, k);
  ctx.fillRect(px(x - size / 2 - 1, k), px(y + 1, k), (size + 2) * k, k);
  ctx.fillRect(px(x - size / 2, k), px(y + 2, k), size * k, k);
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, k: number) {
  ctx.imageSmoothingEnabled = false;
  const { look, now, reduced } = scene;
  const frame = (Math.floor(now / 250) % 2) as 0 | 1;
  ctx.drawImage(background(k), 0, 0);

  // la parrilla, con las brasas que titilan y el humo que sube
  const embers = reduced ? 0 : frame;
  ctx.drawImage(spriteCanvas(`parrilla:asador:${embers}`, grillSprite(embers), k), px(GRILL_X, k), px(GRILL_Y, k));
  const rise = reduced ? 0 : (now / 90) % 12;
  for (let i = 0; i < 3; i++) {
    const y = GRILL_Y - 4 - ((rise + i * 4) % 12);
    puff(ctx, GRILL_X + 8 + i * 7 + (i % 2), y, 3, k, i === 1 ? SMOKE_DARK : SMOKE);
  }

  // el bro, tocando la parrilla o no
  const touching = scene.sinceTap < SPARK_MS;
  ctx.drawImage(spriteCanvas(`parrilla:bro:${touching}`, broSprite(touching), k), px(BRO_X, k), px(BRO_Y, k));
  if (touching) {
    // la chispita y el "tss" junto a la mano, sobre la parrilla
    const hx = BRO_X - 1;
    const hy = BRO_Y + 11;
    if (!reduced) {
      ctx.fillStyle = "#FFD34E";
      ctx.fillRect(px(hx - 2, k), px(hy - 2, k), k, k);
      ctx.fillRect(px(hx - 3, k), px(hy - 4, k), k, k);
      ctx.fillRect(px(hx + 1, k), px(hy - 3, k), k, k);
    }
    ctx.drawImage(spriteCanvas("parrilla:tss", textSprite("tss", "#1B1B1B"), k), px(hx - 12, k), px(hy - 9, k));
  }

  // el canario detrás de la mesada
  const canarioFrame: 0 | 1 = reduced && look === "espaldas" ? 0 : frame;
  ctx.drawImage(spriteCanvas(`parrilla:canario:${look}:${canarioFrame}`, canarioSprite(look, canarioFrame), k), px(CANARIO_X, k), px(CANARIO_Y, k));
  ctx.drawImage(spriteCanvas("parrilla:mesada", counterSprite(), k), px(COUNTER_X, k), px(COUNTER_Y, k));

  // el humo del porro: sube desde la cabeza; en el aviso (y el amague), una bocanada grande y el "¿eh?"
  const headX = CANARIO_X + CANARIO_W / 2;
  const headY = CANARIO_Y + 1;
  if (look === "aviso" || look === "amague") {
    const t = Math.min(1, scene.sinceState / 400);
    const lift = reduced ? 4 : Math.round(t * 6);
    puff(ctx, headX + 2, headY - 3 - lift, 6, k);
    puff(ctx, headX - 3, headY - 6 - lift, 4, k, SMOKE_DARK);
    ctx.drawImage(spriteCanvas("parrilla:eh", textSprite("¿eh?", "#1B1B1B"), k), px(headX - 16, k), px(headY - 4, k));
  } else if (look === "espaldas" || look === "girando" || look === "volviendo" || look === "mirando") {
    const jointX = look === "espaldas" ? headX + 1 : look === "volviendo" ? CANARIO_X + CANARIO_W + 1 : CANARIO_X - 1;
    const jointY = look === "espaldas" ? headY : CANARIO_Y + 12;
    const r2 = reduced ? 0 : (now / 120) % 8;
    puff(ctx, jointX, jointY - 3 - r2, 2, k);
    if (!reduced) puff(ctx, jointX + 1, jointY - 8 - ((r2 + 4) % 8), 2, k, SMOKE_DARK);
  }
}

/** para la herramienta de desarrollo: la escena con un estado fijo */
export function drawState(ctx: CanvasRenderingContext2D, look: CanarioLook, k: number) {
  drawScene(ctx, { look, now: 0, sinceTap: Infinity, sinceState: 1000 }, k);
}
