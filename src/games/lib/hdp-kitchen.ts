// La cocina de la hdp, la hamburguesería de Big Bro, compartida por "hij@ de
// p**" y "Larry en la hdp": la pared de azulejos, la campana, el cartel de
// neón "hdp" con "hamburguesas hijas de remil puta" debajo, la plancha de
// metal y la carne en sus estados. Pinta en unidades de la vista (el canvas
// de cada juego después se escala entero). Mapas de letras, sin React.

import { textSprite } from "./font";
import { buildSprite as build, OUTLINE, spriteCanvas, type Sprite } from "./sprites";

const K = OUTLINE;
export const KITCHEN = {
  tile: "#CFE3DD",
  tileLine: "#9DBFB6",
  hood: "#4A4F57",
  hoodDark: "#33373D",
  metal: "#8C9096",
  metalDark: "#6E7279",
  metalLight: "#A4A8AE",
  neon: "#FF6F91",
  neonSoft: "#FFB3C6",
  board: "#1F2430",
} as const;

/** un sprite en (x, y) con tamaño w × h (unidades), redondeado al píxel de la vista */
export function blit(ctx: CanvasRenderingContext2D, key: string, sprite: Sprite, x: number, y: number, w = sprite.w, h = sprite.h): void {
  const c = spriteCanvas(key, sprite, 1);
  ctx.drawImage(c, 0, 0, sprite.w, sprite.h, Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

// ---------------------------------------------------------------------------
// la carne: 16 × 9, de cruda a quemada
// ---------------------------------------------------------------------------

export const PATTY_W = 16;
export const PATTY_H = 9;
export type PattyLook = "cruda" | "dorando1" | "dorando2" | "dorando3" | "quemada";
export const PATTY_LOOKS: readonly PattyLook[] = ["cruda", "dorando1", "dorando2", "dorando3", "quemada"];

const PATTY_ROWS = ["...KKKKKKKKKK...", ".KKxxxxxxxxxxKK.", "KxxxxxxxxxxxxxxK", "KxxyxxxxxxxxyxxK", "KxxxxxxyyxxxxxxK", "KxyxxxxxxxxxxyxK", "KxxxxxxxxxxxxxxK", ".KKxxxxxxxxxxKK.", "...KKKKKKKKKK..."];
const PATTY_COLORS: Record<PattyLook, { x: string; y: string }> = {
  cruda: { x: "#E89A9A", y: "#D27F7F" },
  dorando1: { x: "#D08868", y: "#B57052" },
  dorando2: { x: "#A95A38", y: "#8E4A2C" },
  dorando3: { x: "#7E3E22", y: "#653018" },
  quemada: { x: "#221E1C", y: "#0F0D0C" },
};
const pattyCache = new Map<PattyLook, Sprite>();
export function pattySprite(look: PattyLook): Sprite {
  let s = pattyCache.get(look);
  if (!s) {
    s = build(PATTY_ROWS, { K, ...PATTY_COLORS[look] });
    pattyCache.set(look, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// el cartel de neón
// ---------------------------------------------------------------------------

/** el "hdp" del cartel, en minúscula con la p colgando (11 × 7); la fuente compartida no tiene descendentes */
const NEON_ROWS = ["K.....K....", "K.....K....", "KKK.KKK.KKK", "K.K.K.K.K.K", "K.K.KKK.KKK", "........K..", "........K.."];
const neonCache = new Map<string, Sprite>();
export function neonSprite(color: string): Sprite {
  let s = neonCache.get(color);
  if (!s) {
    s = build(NEON_ROWS, { K: color });
    neonCache.set(color, s);
  }
  return s;
}

/** el tamaño del cartel (sin el renglón de abajo) con las letras a escala `scale` */
export function neonSignSize(scale: number): { w: number; h: number } {
  return { w: 11 * scale + 18, h: 7 * scale + 7 };
}

/** el cartel con "hdp" a escala `scale`; con `subtitle`, "hamburguesas hijas de remil puta" en un renglón debajo */
export function paintNeonSign(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, subtitle = true): void {
  const { w, h } = neonSignSize(scale);
  ctx.fillStyle = KITCHEN.board;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  const title = neonSprite(KITCHEN.neon);
  const tw = title.w * scale;
  const th = title.h * scale;
  const tx = x + Math.floor((w - tw) / 2);
  const ty = y + Math.floor((h - th) / 2);
  // el brillo del neón: la misma palabra corrida un poco, más clara
  blit(ctx, "kitchen:neon:glow", neonSprite(KITCHEN.neonSoft), tx - 1, ty - 1, tw, th);
  blit(ctx, "kitchen:neon:hdp", title, tx, ty, tw, th);
  if (subtitle) {
    const sub = textSprite("hamburguesas hijas de remil puta", KITCHEN.neonSoft);
    ctx.fillStyle = KITCHEN.board;
    ctx.fillRect(x, y + h + 2, sub.w + 6, 9);
    blit(ctx, "kitchen:neon:sub", sub, x + 3, y + h + 4);
  }
}

// ---------------------------------------------------------------------------
// la pared, la campana y la plancha
// ---------------------------------------------------------------------------

/** la pared de azulejos, de (0, 0) a (w, h) */
export function paintTiles(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = KITCHEN.tile;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = KITCHEN.tileLine;
  for (let y = 8; y < h; y += 12) ctx.fillRect(0, y, w, 1);
  for (let row = 0; row * 12 - 4 < h; row++) for (let x = row % 2 ? 6 : 0; x < w; x += 12) ctx.fillRect(x, Math.max(0, row * 12 - 4), 1, Math.min(12, h - Math.max(0, row * 12 - 4)));
}

/** la campana de extracción colgando del techo, de x0 a x1 */
export function paintHood(ctx: CanvasRenderingContext2D, x0: number, x1: number): void {
  ctx.fillStyle = KITCHEN.hood;
  ctx.beginPath();
  ctx.moveTo(x0 + 6, 0);
  ctx.lineTo(x1 - 4, 0);
  ctx.lineTo(x1, 14);
  ctx.lineTo(x0, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = KITCHEN.hoodDark;
  ctx.fillRect(x0, 13, x1 - x0, 2);
  const mid = Math.round((x0 + x1) / 2);
  ctx.fillRect(mid - 6, 0, 12, 3);
  for (let x = x0 + 12; x < x1 - 8; x += 6) ctx.fillRect(x, 8, 3, 1);
}

/** la plancha de metal con su contorno, sus rayas y el borde de abajo */
export function paintGriddle(ctx: CanvasRenderingContext2D, g: { x: number; y: number; w: number; h: number }): void {
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(g.x - 2, g.y - 2, g.w + 4, g.h + 4);
  ctx.fillStyle = KITCHEN.metal;
  ctx.fillRect(g.x, g.y, g.w, g.h);
  ctx.fillStyle = KITCHEN.metalLight;
  ctx.fillRect(g.x, g.y, g.w, 2);
  ctx.fillStyle = KITCHEN.metalDark;
  for (let y = g.y + 7; y < g.y + g.h - 3; y += 8) ctx.fillRect(g.x + 2, y, g.w - 4, 1);
  ctx.fillRect(g.x, g.y + g.h - 3, g.w, 3);
}
