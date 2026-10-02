// Dibujo de la partida en un <canvas>, en escalado entero: la barra de bar de
// noche, el vaso grande en el centro con el whisky, la cola, la espuma con
// burbujitas y los cubitos, la raya punteada, y la botella de Nix cola
// inclinada (más cuanto más caudal) con su chorro. Sin React: lo usan el
// juego y la herramienta.

import { integerScale, px } from "../lib/canvas-scale";
import { spriteCanvas } from "../lib/sprites";
import { textSprite } from "../lib/font";
import { GLASS_W, glassDef, glassSprite, interiorSpan } from "./glasses";
import { flowAt, levels, lineLevel, predictTop, SUB, type SimState } from "./rules";
import { BOTTLE_H, BOTTLE_W, bottleSprite, COLORS, FIELD_H, FIELD_W } from "./sprites";

export interface DrawOptions {
  alpha: number;
  reduced?: boolean;
  /** herramienta: el nivel, la espuma y la raya en números */
  debug?: boolean;
  /** herramienta: dónde termina la espuma si se suelta ahora */
  predict?: boolean;
}

/** la barra: el vaso apoya acá */
export const BAR_Y = 108;
export const GLASS_X = Math.floor((FIELD_W - GLASS_W) / 2);

export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return integerScale(cssWidth, cssHeight, dpr, FIELD_W, FIELD_H);
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

/** el ángulo de la botella: 10° en reposo, hasta 55° a caudal máximo */
export function bottleAngle(s: SimState): number {
  const c = s.current;
  if (!c || !c.pressed) return (10 * Math.PI) / 180;
  const q = flowAt(s.tick - c.downTick, c.index);
  return ((10 + (45 * q) / 5000) * Math.PI) / 180;
}

export function paintScene(ctx: CanvasRenderingContext2D, s: SimState, opts: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  // la pared, el estante con botellas y el cartel de neón
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.fillStyle = COLORS.shelf;
  ctx.fillRect(0, 22, FIELD_W, 2);
  for (let i = 0; i < 9; i++) {
    const x = 4 + i * 10;
    const h = 8 + ((i * 5) % 7);
    ctx.fillStyle = ["#3B1F14", "#1E3A8A", "#2E6B3A", "#6B2E1E"][i % 4]!;
    ctx.fillRect(x, 22 - h, 5, h);
    ctx.fillRect(x + 1, 22 - h - 3, 3, 3);
  }
  const neon = spriteCanvas("servila:neon", textSprite("nix", COLORS.neon), 1);
  ctx.drawImage(neon, 0, 0, neon.width, neon.height, FIELD_W - neon.width - 6, 6, neon.width, neon.height);
  // la barra
  ctx.fillStyle = COLORS.barTop;
  ctx.fillRect(0, BAR_Y, FIELD_W, 3);
  ctx.fillStyle = COLORS.bar;
  ctx.fillRect(0, BAR_Y + 3, FIELD_W, FIELD_H - BAR_Y - 3);

  const c = s.current;
  if (!c) return;
  const g = s.glasses[c.index]!;
  const d = glassDef(g.shape);
  const top0 = BAR_Y - d.h; // y del tope del mapa del vaso
  const { liquid, top } = levels(s);
  const rowY = (r: number) => top0 + (d.h - 1 - r);

  // el vaso vacío (paredes y vidrio)
  const glass = spriteCanvas(`servila:vaso:${g.shape}`, glassSprite(g.shape), 1);
  ctx.drawImage(glass, GLASS_X, top0);
  // el líquido y la espuma, fila por fila
  for (let r = d.firstRow; r < d.h; r++) {
    const { x, w } = interiorSpan(d, r);
    if (w === 0) continue;
    const y = rowY(r);
    const mid = r * SUB + SUB / 2;
    if (mid < liquid) {
      ctx.fillStyle = r < d.firstRow + g.whiskyRows ? COLORS.whisky : COLORS.cola;
      ctx.fillRect(GLASS_X + x, y, w, 1);
      // un reflejo a la izquierda
      ctx.fillStyle = r < d.firstRow + g.whiskyRows ? COLORS.whiskyDark : COLORS.colaLight;
      ctx.fillRect(GLASS_X + x + 1, y, 1, 1);
    } else if (mid < top) {
      ctx.fillStyle = COLORS.foam;
      ctx.fillRect(GLASS_X + x, y, w, 1);
      if (!opts.reduced) {
        // burbujitas que van cambiando
        ctx.fillStyle = COLORS.bubble;
        const b = ((r * 7 + (s.tick >> 3) * 3) % w) | 0;
        ctx.fillRect(GLASS_X + x + b, y, 1, 1);
        if (w > 10) ctx.fillRect(GLASS_X + x + ((b + (w >> 1)) % w), y, 1, 1);
      }
    }
  }
  // los cubitos, flotando en la superficie (decorativos)
  const surfaceRow = Math.min(d.h - 1, Math.floor(liquid / SUB));
  if (liquid > (d.firstRow + 3) * SUB) {
    const { x, w } = interiorSpan(d, surfaceRow);
    for (const ox of [2, w - 5]) {
      if (ox < 0 || ox + 3 > w) continue;
      const cx = GLASS_X + x + ox;
      const cy = rowY(surfaceRow) - 1;
      ctx.fillStyle = COLORS.ice;
      ctx.fillRect(cx, cy, 3, 3);
      ctx.fillStyle = COLORS.iceDark;
      ctx.fillRect(cx + 2, cy + 1, 1, 2);
      ctx.fillRect(cx, cy + 2, 3, 1);
    }
  }
  // el brillo del vidrio
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let r = d.firstRow + 1; r < d.h - 1; r += 1) {
    const { x, w } = interiorSpan(d, r);
    if (w > 0 && r % 2 === 0) ctx.fillRect(GLASS_X + x + w - 2, rowY(r), 1, 1);
  }
  // la raya: punteada en luciérnaga a lo ancho, con una flechita al costado
  {
    const r = g.lineRow;
    const { x, w } = interiorSpan(d, r);
    const y = rowY(r);
    ctx.fillStyle = COLORS.line;
    for (let i = 0; i < w; i += 2) ctx.fillRect(GLASS_X + x + i, y, 1, 1);
    const ax = GLASS_X + x + w + 2;
    ctx.fillRect(ax + 2, y - 1, 1, 3);
    ctx.fillRect(ax + 1, y, 1, 1);
    ctx.fillRect(ax + 3, y, 2, 1);
  }
  // la espuma rebalsando por el costado
  const res = c.result;
  if (res?.outcome === "rebalso" && !opts.reduced) {
    const t = s.tick - res.tick + opts.alpha;
    const { x, w } = interiorSpan(d, d.h - 1);
    ctx.fillStyle = COLORS.foam;
    const len = Math.min(d.h, Math.floor(t * 1.5));
    ctx.fillRect(GLASS_X + x - 2, top0, 2, len);
    ctx.fillRect(GLASS_X + x + w, top0 + 2, 2, Math.max(0, len - 3));
  }

  // la botella de Nix cola, inclinada sobre el vaso desde arriba a la derecha
  {
    const angle = bottleAngle(s);
    const b = spriteCanvas("servila:botella", bottleSprite(), 1);
    ctx.save();
    // el pico de la botella queda sobre el vaso, un poco a la derecha del centro
    const mouthX = GLASS_X + GLASS_W / 2 + 6;
    const mouthY = Math.max(26, top0 - 8);
    ctx.translate(mouthX, mouthY);
    ctx.rotate(Math.PI / 2 + angle);
    // el pico está en el borde de arriba del sprite, en el centro
    ctx.drawImage(b, 0, 0, BOTTLE_W, BOTTLE_H, -BOTTLE_W / 2, 0, BOTTLE_W, BOTTLE_H);
    ctx.restore();
    // el chorro
    if (c.pressed) {
      const q = flowAt(s.tick - c.downTick, c.index);
      const w = q > 3000 ? 2 : 1;
      const surfaceY = Math.min(BAR_Y - 2, rowY(Math.floor(top / SUB)));
      ctx.fillStyle = COLORS.cola;
      ctx.fillRect(mouthX - 1 - Math.floor(w / 2), mouthY, w, Math.max(0, surfaceY - mouthY));
      ctx.fillStyle = COLORS.foam;
      ctx.fillRect(mouthX - 3, surfaceY - 1, 5, 1);
    }
  }

  if (opts.predict && c.pressed) {
    const p = predictTop(s);
    if (p !== null) {
      const r = Math.min(d.h - 1, Math.floor(p / SUB));
      const { x, w } = interiorSpan(d, r);
      ctx.fillStyle = "#6FD3E0";
      ctx.fillRect(GLASS_X + x - 3, rowY(r), w + 6, 1);
    }
  }
  if (opts.debug) {
    const t = textSprite(`${(liquid / SUB).toFixed(1)} ${(top / SUB).toFixed(1)} ${(lineLevel(s) / SUB).toFixed(0)}`.replace(/\./g, " "), "#F7FFF2");
    const tc = spriteCanvas(`servila:dbg:${liquid}:${top}:${g.lineRow}`, t, 1);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, FIELD_H - 8, tc.width + 2, 8);
    ctx.drawImage(tc, 1, FIELD_H - 7);
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, s: SimState, k: number, opts: DrawOptions): void {
  const o = offscreen();
  const octx = o.getContext("2d")!;
  paintScene(octx, s, opts);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(o, 0, 0, FIELD_W, FIELD_H, 0, 0, px(FIELD_W, k), px(FIELD_H, k));
}
