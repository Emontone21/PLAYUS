// Dibujo de la partida en un <canvas>, en escalado entero. Sin React: lo usan
// el juego y la herramienta de desarrollo. La cabeza y las rastas se dibujan
// interpoladas entre el paso anterior y el actual, para que se vea fluido.
// Las rastas se rasterizan a una unidad por píxel (rasta.ts) y se escalan
// enteras; el globo "¡PARI!" se dibuja encima de todo.

import { integerScale, px } from "../lib/canvas-scale";
import { paintedCanvas, spriteCanvas } from "../lib/sprites";
import { textSprite } from "../lib/font";
import { CELL, COLS, FIELD_H, FIELD_W, ROWS, xOf, yOf, type Dir, type SimState } from "./rules";
import { AXIS, centersOf, pariBox, pariTick, pariVisible, PARI_TICKS, rasterRastas, stepAlpha } from "./rasta";
import { backgroundRects, canSprite, cigSprite, headSprite, liceSprite } from "./sprites";

export { stepAlpha };

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

// un canvas de una unidad por píxel para las rastas, reutilizado
let rastaLayer: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData } | null = null;
function rastaCanvas(data: Uint8ClampedArray): HTMLCanvasElement {
  if (!rastaLayer) {
    const canvas = document.createElement("canvas");
    canvas.width = FIELD_W;
    canvas.height = FIELD_H;
    const ctx = canvas.getContext("2d")!;
    rastaLayer = { canvas, ctx, image: ctx.createImageData(FIELD_W, FIELD_H) };
  }
  rastaLayer.image.data.set(data);
  rastaLayer.ctx.putImageData(rastaLayer.image, 0, 0);
  return rastaLayer.canvas;
}

const PARI_LIGHT = { fill: "#FFF8E7", edge: "#1B1B1B", text: "#1B1B1B" };
const PARI_CAN = { fill: "#1E4FC2", edge: "#1B1B1B", text: "#F7D23E" };

/** el globo "¡PARI!" junto a la cabeza, del lado contrario a la dirección de avance */
function drawPari(ctx: CanvasRenderingContext2D, state: SimState, k: number, head: { x: number; y: number }, boosted: boolean, reduced: boolean, alpha: number) {
  const box = pariBox(head.x, head.y, state.dir);
  const age = state.tick - pariTick(state) + alpha;
  // entrada: un saltito de 2 unidades hacia afuera y vuelve (no con prefers-reduced-motion)
  const pop = reduced ? 0 : age < 3 ? 2 : age < 6 ? -1 : 0;
  const out = box.side === "down" ? { x: 0, y: 1 } : box.side === "up" ? { x: 0, y: -1 } : box.side === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 };
  const x = box.x + out.x * pop;
  const y = box.y + out.y * pop;
  const c = boosted ? PARI_CAN : PARI_LIGHT;
  const rect = (ux: number, uy: number, uw: number, uh: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(px(ux, k), px(uy, k), px(uw, k), px(uh, k));
  };
  // el piquito hacia la cabeza
  const hx = head.x + CELL / 2;
  const hy = head.y + CELL / 2;
  if (box.side === "down") rect(hx - 1, y - 2, 3, 3, c.edge);
  else if (box.side === "up") rect(hx - 1, y + box.h - 1, 3, 3, c.edge);
  else if (box.side === "left") rect(x + box.w - 1, hy - 1, 3, 3, c.edge);
  else rect(x - 2, hy - 1, 3, 3, c.edge);
  // el globo con las esquinas redondeadas
  rect(x + 1, y, box.w - 2, box.h, c.edge);
  rect(x, y + 1, box.w, box.h - 2, c.edge);
  rect(x + 2, y + 1, box.w - 4, box.h - 2, c.fill);
  rect(x + 1, y + 2, box.w - 2, box.h - 4, c.fill);
  const text = textSprite("¡PARI!", c.text);
  ctx.drawImage(spriteCanvas(`rastas:pari:${c.text}`, text, 2 * k), px(x + 3, k), px(y + 3, k));
  void PARI_TICKS;
}

export function drawScene(ctx: CanvasRenderingContext2D, state: SimState, k: number, opts: DrawOptions) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(background(k), 0, 0);
  const t = state.tick;
  const boosted = t < state.boostUntil && !state.end;
  const reduced = !!opts.reduced;
  const frame = reduced ? 0 : ((Math.floor(t / 10) % 2) as 0 | 1);

  // piojos: bloqueados (bien visibles) y avisados (semitransparentes, con el borde titilando)
  for (const c of state.blocked) {
    ctx.drawImage(spriteCanvas(`rastas:piojos:${frame}`, liceSprite(frame), k), px(xOf(c) * CELL, k), px(yOf(c) * CELL, k));
  }
  for (const [c] of state.warned) {
    ctx.globalAlpha = 0.45;
    ctx.drawImage(spriteCanvas(`rastas:piojos:${frame}`, liceSprite(frame), k), px(xOf(c) * CELL, k), px(yOf(c) * CELL, k));
    ctx.globalAlpha = 1;
    if (reduced || Math.floor(t / 8) % 2 === 0) {
      ctx.strokeStyle = "#FF6F91";
      ctx.lineWidth = Math.max(1, Math.floor(k / 2));
      ctx.strokeRect(px(xOf(c) * CELL, k) + 1, px(yOf(c) * CELL, k) + 1, CELL * k - 2, CELL * k - 2);
    }
  }

  // el cigarro y la Red Bull (titila cuando le quedan 2 s)
  if (state.cig >= 0) ctx.drawImage(spriteCanvas("rastas:cig", cigSprite(), k), px(xOf(state.cig) * CELL, k), px(yOf(state.cig) * CELL, k));
  if (state.redbull) {
    const left = state.redbull.until - t;
    const show = left > 120 || reduced || Math.floor(t / 6) % 2 === 0;
    if (show) ctx.drawImage(spriteCanvas("rastas:lata", canSprite(), k), px(xOf(state.redbull.cell) * CELL, k), px(yOf(state.redbull.cell) * CELL, k));
  }

  // las rastas: un tubo continuo rasterizado a una unidad por píxel, y la cabeza encima
  const centers = centersOf(state, stepAlpha(state, opts.alpha));
  const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(((t + opts.alpha) / 12) * Math.PI);
  const raster = rasterRastas(centers, { boosted, reduced, pulse });
  ctx.drawImage(rastaCanvas(raster.data), 0, 0, FIELD_W, FIELD_H, 0, 0, FIELD_W * k, FIELD_H * k);
  const head = { x: Math.round(centers[0]!.x - AXIS), y: Math.round(centers[0]!.y - AXIS) };
  ctx.drawImage(spriteCanvas(`rastas:cabeza:${state.dir}`, headSprite(state.dir), k), px(head.x, k), px(head.y, k));

  if (pariVisible(state)) drawPari(ctx, state, k, head, boosted, reduced, opts.alpha);

  if (opts.coords) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const sp = textSprite(`${x}`, "#1B1B1B");
        ctx.drawImage(spriteCanvas(`rastas:coord:${x}`, sp, Math.max(1, Math.floor(k / 3))), px(x * CELL, k) + 1, px(y * CELL, k) + 1);
      }
    }
  }
}

export type { Dir };
