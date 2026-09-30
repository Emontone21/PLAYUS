// Dibujo de la partida en un <canvas>, en escalado entero. Sin React: lo usan
// el juego y la herramienta de desarrollo. La cabeza y las rastas se dibujan
// interpoladas entre el paso anterior y el actual, para que se vea fluido.

import { integerScale, px } from "../lib/canvas-scale";
import { paintedCanvas, spriteCanvas } from "../lib/sprites";
import { textSprite } from "../lib/font";
import { BOOST_TICKS, CELL, COLS, FIELD_H, FIELD_W, ROWS, xOf, yOf, type Dir, type SimState } from "./rules";
import { backgroundRects, canSprite, cigSprite, headSprite, liceSprite, rastaSprite } from "./sprites";

export interface DrawOptions {
  /** fracción del tick en curso, 0 a 1 */
  alpha: number;
  reduced?: boolean;
  /** herramienta de desarrollo: coordenadas de la grilla */
  coords?: boolean;
}

export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return integerScale(cssWidth, cssHeight, dpr, FIELD_W, FIELD_H);
}

function background(k: number) {
  return paintedCanvas("rastas:fondo", FIELD_W, FIELD_H, k, (ctx) => {
    for (const r of backgroundRects(COLS, ROWS)) {
      ctx.fillStyle = r.c;
      ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
    }
  });
}

/** la fracción del paso en curso, 0 a 1 */
export function stepAlpha(state: SimState, alpha: number): number {
  if (state.end) return 1;
  const span = Math.max(1, state.nextMove - state.lastMove);
  return Math.max(0, Math.min(1, (state.tick - 1 + alpha - state.lastMove) / span));
}

export function drawScene(ctx: CanvasRenderingContext2D, state: SimState, k: number, opts: DrawOptions) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(background(k), 0, 0);
  const t = state.tick;
  const boosted = t < state.boostUntil && !state.end;
  const frame = opts.reduced ? 0 : ((Math.floor(t / 10) % 2) as 0 | 1);

  // piojos: bloqueados (bien visibles) y avisados (semitransparentes, con el borde titilando)
  for (const c of state.blocked) {
    ctx.drawImage(spriteCanvas(`rastas:piojos:${frame}`, liceSprite(frame), k), px(xOf(c) * CELL, k), px(yOf(c) * CELL, k));
  }
  for (const [c] of state.warned) {
    ctx.globalAlpha = 0.45;
    ctx.drawImage(spriteCanvas(`rastas:piojos:${frame}`, liceSprite(frame), k), px(xOf(c) * CELL, k), px(yOf(c) * CELL, k));
    ctx.globalAlpha = 1;
    if (opts.reduced || Math.floor(t / 8) % 2 === 0) {
      ctx.strokeStyle = "#FF6F91";
      ctx.lineWidth = Math.max(1, Math.floor(k / 2));
      ctx.strokeRect(px(xOf(c) * CELL, k) + 1, px(yOf(c) * CELL, k) + 1, CELL * k - 2, CELL * k - 2);
    }
  }

  // el cigarro y la Red Bull (titila cuando le quedan 2 s)
  if (state.cig >= 0) ctx.drawImage(spriteCanvas("rastas:cig", cigSprite(), k), px(xOf(state.cig) * CELL, k), px(yOf(state.cig) * CELL, k));
  if (state.redbull) {
    const left = state.redbull.until - t;
    const show = left > 120 || opts.reduced || Math.floor(t / 6) % 2 === 0;
    if (show) ctx.drawImage(spriteCanvas("rastas:lata", canSprite(), k), px(xOf(state.redbull.cell) * CELL, k), px(yOf(state.redbull.cell) * CELL, k));
  }

  // las rastas, de la punta a la cabeza, interpoladas
  const a = stepAlpha(state, opts.alpha);
  const n = state.body.length;
  const prevOf = (i: number) => state.prevBody[Math.min(i, state.prevBody.length - 1)]!;
  const pos = (i: number) => {
    const cur = state.body[i]!;
    const prev = state.end ? cur : prevOf(i);
    return { x: (xOf(prev) + (xOf(cur) - xOf(prev)) * a) * CELL, y: (yOf(prev) + (yOf(cur) - yOf(prev)) * a) * CELL };
  };
  for (let i = n - 1; i >= 1; i--) {
    const p = pos(i);
    const before = state.body[i - 1]!;
    const vertical = xOf(before) === xOf(state.body[i]!);
    const bead = i % 3 === 0 ? 1 + (Math.floor(i / 3) % 4) : 0;
    const sp = rastaSprite(vertical, bead, i === n - 1, boosted && !opts.reduced);
    ctx.drawImage(spriteCanvas(`rastas:seg:${vertical}:${bead}:${i === n - 1}:${boosted && !opts.reduced}`, sp, k), px(p.x, k), px(p.y, k));
  }
  const h = pos(0);
  ctx.drawImage(spriteCanvas(`rastas:cabeza:${state.dir}`, headSprite(state.dir), k), px(h.x, k), px(h.y, k));

  if (opts.coords) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const sp = textSprite(`${x}`, "#1B1B1B");
        ctx.drawImage(spriteCanvas(`rastas:coord:${x}`, sp, Math.max(1, Math.floor(k / 3))), px(x * CELL, k) + 1, px(y * CELL, k) + 1);
      }
    }
  }
  void BOOST_TICKS;
}

export type { Dir };
