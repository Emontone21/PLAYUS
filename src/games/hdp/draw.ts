// Dibujo de "hij@ de p**" en un <canvas> chico (144 × 184) escalado entero:
// la cocina (azulejos, el cartel de neón "hdp", la campana), Big Bro asomado
// arriba a la derecha, y la plancha con sus cuatro hamburguesas: cruda,
// dorándose, a punto con la flecha y la barrita, girando con la espátula,
// quemada con humo, o servida deslizándose fuera. El estado se interpola
// entre ticks con `alpha`.

import { px } from "../lib/canvas-scale";
import { spriteCanvas } from "../lib/sprites";
import { textSprite } from "../lib/font";
import { BLOCK_TICKS, BURNT_TICKS, remaining, SERVE_TICKS, type Dir, type Mood, type SimState, type Slot } from "./rules";
import { ARROW, arrowSprite, broSprite, BRO_W, FIELD_H, FIELD_W, GRIDDLE, LENGUA, neonSprite, LUCIERNAGA, PATTY_H, PATTY_W, pattySprite, puffSprite, SLOT_CENTERS, spatulaSprite, spatulaSpriteVertical, SPLIT_X, SPLIT_Y, ZOOM, type PattyLook } from "./sprites";

export const OUTLINE = "#141414";
const TILE = "#CFE3DD";
const TILE_LINE = "#9DBFB6";
const HOOD = "#4A4F57";
const HOOD_DARK = "#33373D";
const METAL = "#8C9096";
const METAL_DARK = "#6E7279";
const METAL_LIGHT = "#A4A8AE";
const SPOT = "#5C6067";
const NEON = "#FF6F91";
const NEON_SOFT = "#FFB3C6";
/** el giro de la hamburguesa dura esto (ticks); con reducir movimiento, un cuadro */
export const FLIP_TICKS = 12;
/** el "+1" sube durante esto */
export const PLUS_TICKS = 30;
export const SHAKE_TICKS = 8;

export interface DrawOptions {
  alpha: number;
  reduced?: boolean;
  mood: Mood;
  /** herramienta: los cuadrantes de toque */
  quadrants?: boolean;
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

function at(ctx: CanvasRenderingContext2D, key: string, sprite: ReturnType<typeof pattySprite>, x: number, y: number, w = sprite.w, h = sprite.h): void {
  const c = spriteCanvas(key, sprite, 1);
  ctx.drawImage(c, 0, 0, sprite.w, sprite.h, Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/** cómo se ve la carne según la fase y cuánto lleva cocinándose */
export function pattyLook(slot: Slot, tick: number): PattyLook {
  if (slot.phase === "burnt") return "quemada";
  if (slot.phase === "ready" || slot.phase === "serving") return "dorando3";
  const total = Math.max(1, slot.until - slot.since);
  const p = (tick - slot.since) / total;
  return p < 0.25 ? "cruda" : p < 0.55 ? "dorando1" : p < 0.85 ? "dorando2" : "dorando3";
}

function dirVector(d: Dir): [number, number] {
  return d === "up" ? [0, -1] : d === "down" ? [0, 1] : d === "left" ? [-1, 0] : [1, 0];
}

/** dónde va cada cosa dentro de un cuadrante, respecto de su centro (unidades) */
const PATTY_DY = 6;
const ARROW_DY = -13;
const BAR_DY = 16;

export function paintScene(ctx: CanvasRenderingContext2D, s: SimState, o: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  const t = s.tick + o.alpha;
  const Z = ZOOM;
  // la pared de azulejos
  ctx.fillStyle = TILE;
  ctx.fillRect(0, 0, FIELD_W, GRIDDLE.y);
  ctx.fillStyle = TILE_LINE;
  for (let y = 8; y < GRIDDLE.y; y += 12) ctx.fillRect(0, y, FIELD_W, 1);
  for (let row = 0; row * 12 - 4 < GRIDDLE.y; row++) for (let x = row % 2 ? 6 : 0; x < FIELD_W; x += 12) ctx.fillRect(x, Math.max(0, row * 12 - 4), 1, 12);
  // la campana de extracción, arriba a la derecha (sobre Big Bro)
  ctx.fillStyle = HOOD;
  ctx.beginPath();
  ctx.moveTo(80, 0);
  ctx.lineTo(140, 0);
  ctx.lineTo(144, 14);
  ctx.lineTo(74, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = HOOD_DARK;
  ctx.fillRect(74, 13, 70, 2);
  ctx.fillRect(104, 0, 12, 3);
  for (let x = 86; x < 136; x += 6) ctx.fillRect(x, 8, 3, 1);
  // el cartel de neón: "hdp" grande y, debajo, el nombre completo
  ctx.fillStyle = "#1F2430";
  ctx.fillRect(4, 5, 62, 35);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(4, 5, 62, 1);
  ctx.fillRect(4, 39, 62, 1);
  ctx.fillRect(4, 5, 1, 35);
  ctx.fillRect(65, 5, 1, 35);
  const title = neonSprite(NEON);
  // el brillo del neón: la misma palabra corrida un poco, más clara
  at(ctx, "hdp:neon:glow", neonSprite(NEON_SOFT), 12, 8, title.w * 4, title.h * 4);
  at(ctx, "hdp:neon:hdp", title, 13, 9, title.w * 4, title.h * 4);
  const sub = textSprite("hamburguesas hijas de remil puta", NEON_SOFT);
  ctx.fillStyle = "#1F2430";
  ctx.fillRect(4, 42, sub.w + 6, 9);
  at(ctx, "hdp:neon:sub", sub, 7, 44);
  // Big Bro asomado arriba a la derecha (la plancha lo tapa de la cintura para abajo)
  at(ctx, `hdp:bro:${o.mood}`, broSprite(o.mood), FIELD_W - BRO_W - 1, GRIDDLE.y - 33);
  // la plancha
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(GRIDDLE.x - 2, GRIDDLE.y - 2, GRIDDLE.w + 4, GRIDDLE.h + 4);
  ctx.fillStyle = METAL;
  ctx.fillRect(GRIDDLE.x, GRIDDLE.y, GRIDDLE.w, GRIDDLE.h);
  ctx.fillStyle = METAL_LIGHT;
  ctx.fillRect(GRIDDLE.x, GRIDDLE.y, GRIDDLE.w, 2);
  ctx.fillStyle = METAL_DARK;
  for (let y = GRIDDLE.y + 7; y < GRIDDLE.y + GRIDDLE.h - 3; y += 8) ctx.fillRect(GRIDDLE.x + 2, y, GRIDDLE.w - 4, 1);
  ctx.fillRect(GRIDDLE.x, GRIDDLE.y + GRIDDLE.h - 3, GRIDDLE.w, 3);
  ctx.fillRect(SPLIT_X, GRIDDLE.y + 4, 1, GRIDDLE.h - 8);
  ctx.fillRect(GRIDDLE.x + 4, SPLIT_Y, GRIDDLE.w - 8, 1);
  for (const [cx, cy] of SLOT_CENTERS) {
    ctx.fillStyle = SPOT;
    ctx.fillRect(cx - 20, cy + PATTY_DY - 12, 40, 24);
    ctx.fillStyle = METAL_DARK;
    ctx.fillRect(cx - 19, cy + PATTY_DY - 11, 38, 22);
  }
  if (o.quadrants) {
    ctx.fillStyle = "rgba(111, 211, 224, 0.8)";
    ctx.fillRect(SPLIT_X, 0, 1, FIELD_H);
    ctx.fillRect(0, SPLIT_Y, FIELD_W, 1);
  }
  // las hamburguesas
  s.slots.forEach((slot, i) => {
    const [cx, cy0] = SLOT_CENTERS[i]!;
    const cy = cy0 + PATTY_DY;
    let dx = 0;
    let dy = 0;
    const sinceShake = s.tick - slot.shakeAt;
    if (!o.reduced && slot.shakeAt >= 0 && sinceShake < SHAKE_TICKS) dx = sinceShake % 2 ? 2 : -2;
    const look = pattyLook(slot, s.tick);
    const sprite = pattySprite(look);
    let w = PATTY_W * Z;
    let h = PATTY_H * Z;
    const sinceFlip = t - slot.flipAt;
    const [fx, fy] = dirVector(slot.flipDir);
    if (slot.phase === "serving") {
      const p = Math.min(1, (t - slot.since) / SERVE_TICKS);
      dx += Math.round(fx * p * 70);
      dy += Math.round(fy * p * 70);
    } else if (slot.flipAt >= 0 && sinceFlip < FLIP_TICKS && !o.reduced) {
      // la hamburguesa gira hacia el lado del deslizamiento: se achica y vuelve
      const p = sinceFlip / FLIP_TICKS;
      const k = Math.abs(Math.cos(Math.PI * p));
      if (fx !== 0) w = Math.max(2, PATTY_W * Z * k);
      else h = Math.max(1, PATTY_H * Z * k);
      dx += Math.round(fx * Math.sin(Math.PI * p) * 8);
      dy += Math.round(fy * Math.sin(Math.PI * p) * 6);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(GRIDDLE.x, GRIDDLE.y, GRIDDLE.w, GRIDDLE.h);
    ctx.clip();
    at(ctx, `hdp:patty:${look}`, sprite, cx - w / 2 + dx, cy - h / 2 + dy, w, h);
    ctx.restore();
    // la espátula pasando
    if (slot.flipAt >= 0 && sinceFlip < FLIP_TICKS) {
      const p = o.reduced ? 0.5 : sinceFlip / FLIP_TICKS;
      const travel = (p - 0.5) * 48;
      if (fx !== 0) at(ctx, "hdp:spatula", spatulaSprite(), cx - 12 + fx * travel, cy - 5, 24, 10);
      else at(ctx, "hdp:spatula-v", spatulaSpriteVertical(), cx - 5, cy - 12 + fy * travel, 10, 24);
    }
    // el "+1"
    if (slot.flipAt >= 0 && sinceFlip < PLUS_TICKS) {
      const plus = textSprite("+1", "#8EDC66");
      at(ctx, "hdp:plus", plus, cx + 14, cy - 14 - (o.reduced ? 6 : (sinceFlip / PLUS_TICKS) * 14), plus.w * 2, plus.h * 2);
    }
    // a punto: la flecha que late y la barrita que se vacía
    if (slot.phase === "ready") {
      const left = remaining(slot, s.tick);
      const frac = Math.max(0, (left - o.alpha) / slot.window);
      const hurry = frac < 0.3;
      const blink = slot.shakeAt >= 0 && sinceShake < 12 && sinceShake % 4 < 2;
      if (!blink) {
        const pulse = o.reduced ? 1 : Math.floor(s.tick / 15) % 2 ? 1.12 : 1;
        const aw = Math.round(ARROW * Z * pulse);
        at(ctx, `hdp:arrow:${slot.dir}`, arrowSprite(slot.dir), cx - aw / 2 + dx, cy0 + ARROW_DY - aw / 2, aw, aw);
      }
      if (s.tick < slot.blockedUntil) {
        // bloqueada tras un deslizamiento equivocado: la flecha se ve apagada
        ctx.fillStyle = "rgba(20,20,20,0.4)";
        ctx.fillRect(cx - 9, cy0 + ARROW_DY - 9, 18, Math.round(((slot.blockedUntil - s.tick) / BLOCK_TICKS) * 18));
      }
      const by = cy0 + BAR_DY;
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(cx - 17, by, 34, 5);
      ctx.fillStyle = hurry ? LENGUA : LUCIERNAGA;
      ctx.fillRect(cx - 16, by + 1, Math.max(0, Math.round(32 * frac)), 3);
      if (hurry && !o.reduced) {
        for (let k = 0; k < 2; k++) {
          const ph = (((t / 24 + k * 0.5) % 1) + 1) % 1;
          at(ctx, "hdp:puff:claro", puffSprite("#E4E4E4"), cx - 14 + k * 18 + Math.round(Math.sin(ph * 6.28) * 2), cy - 10 - ph * 12, 10, 8);
        }
      } else if (hurry) {
        at(ctx, "hdp:puff:claro", puffSprite("#E4E4E4"), cx - 14, cy - 14, 10, 8);
      }
    }
    // quemada: negra y con humo
    if (slot.phase === "burnt") {
      const p = (t - slot.since) / BURNT_TICKS;
      const puff = puffSprite("#8A8A8A");
      if (o.reduced) {
        at(ctx, "hdp:puff:gris", puff, cx - 12, cy - 18, 10, 8);
        at(ctx, "hdp:puff:gris", puff, cx + 2, cy - 22, 10, 8);
      } else {
        for (let k = 0; k < 3; k++) {
          const ph = (p * 2 + k * 0.33) % 1;
          at(ctx, "hdp:puff:gris", puff, cx - 16 + k * 11 + Math.round(Math.sin(ph * 6.28) * 2), cy - 10 - ph * 22, 10, 8);
        }
      }
    }
  });
}

export function drawScene(ctx: CanvasRenderingContext2D, k: number, s: SimState, o: DrawOptions): void {
  const c = offscreen();
  const octx = c.getContext("2d")!;
  paintScene(octx, s, o);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, FIELD_W, FIELD_H, 0, 0, px(FIELD_W, k), px(FIELD_H, k));
}
