// Dibujo de "Larry en la hdp" en un <canvas> chico (144 × 128) escalado
// entero: la cocina de la hdp (azulejos, el neón "hdp", la campana y Big Bro,
// de games/lib), el mostrador con Larry, y abajo la plancha con la
// hamburguesa que crece feta por feta, el tacho, Larry comiéndosela y la que
// se cae al tacho. La comanda, los globos y el "+150" van en HTML encima.

import { px } from "../lib/canvas-scale";
import { bigBroSprite, BIG_BRO_W, type BigBroPose } from "../lib/big-bro";
import { blit, paintGriddle, paintHood, paintNeonSign, paintTiles } from "../lib/hdp-kitchen";
import { larrySprite, LARRY_SPRITE_H, LARRY_SPRITE_W } from "../lib/larry";
import { OUTLINE } from "../lib/sprites";
import { EAT_MS, larryFace, type Ingredient, type Run } from "./rules";
import { COUNTER, FIELD_H, FIELD_W, GRIDDLE, LARRY, sliceSprite, sliceStep, SLICE_W, STACK, TRASH, trashSprite, WALL_H } from "./sprites";

/** la que se cae al tacho tarda esto */
export const FALL_MS = 420;
/** Larry llega al mostrador en esto */
export const ARRIVE_MS = 300;
const Z = 2;

export interface DrawOptions {
  t: number;
  reduced?: boolean;
  bro: BigBroPose;
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

/** la hamburguesa de costado con la base en (cx, baseY), a escala `z` */
export function paintStack(ctx: CanvasRenderingContext2D, layers: readonly Ingredient[], complete: boolean, cx: number, baseY: number, z: number): void {
  let y = baseY;
  layers.forEach((ing, i) => {
    const top = complete && i === layers.length - 1 && i > 0;
    const s = sliceSprite(ing, top);
    y -= sliceStep(ing, top) * z;
    blit(ctx, `larryhdp:slice:${ing}:${top}`, s, cx - (SLICE_W * z) / 2, y, s.w * z, s.h * z);
  });
}

export function paintScene(ctx: CanvasRenderingContext2D, run: Run, o: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  const { t } = o;
  // la cocina (games/lib/hdp-kitchen) con Big Bro asomado a la derecha
  paintTiles(ctx, FIELD_W, WALL_H);
  paintHood(ctx, 88, 144);
  paintNeonSign(ctx, 46, 4, 2, false);
  blit(ctx, `larryhdp:bro:${o.bro}`, bigBroSprite(o.bro), FIELD_W - BIG_BRO_W - 2, COUNTER.y - 30);
  // Larry detrás del mostrador; llega deslizándose cuando aparece la comanda del primer pedido
  const face = larryFace(run);
  let lx = LARRY.x;
  if (!o.reduced && run.index === 0 && run.phase === "view") lx = LARRY.x - (1 - Math.min(1, (t - run.phaseAt) / ARRIVE_MS)) * 40;
  blit(ctx, `larryhdp:larry:${face}`, larrySprite(face), lx, LARRY.y, LARRY_SPRITE_W * LARRY.zoom, LARRY_SPRITE_H * LARRY.zoom);
  // el mostrador de madera
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(0, COUNTER.y - 1, FIELD_W, COUNTER.h + 2);
  ctx.fillStyle = "#B97A4A";
  ctx.fillRect(0, COUNTER.y, FIELD_W, 3);
  ctx.fillStyle = "#8A5A3A";
  ctx.fillRect(0, COUNTER.y + 3, FIELD_W, COUNTER.h - 3);
  ctx.fillStyle = "#6E462C";
  for (let x = 10; x < FIELD_W; x += 24) ctx.fillRect(x, COUNTER.y + 4, 1, COUNTER.h - 5);
  // la cocina de este lado: el banco oscuro, la plancha y el tacho
  ctx.fillStyle = "#2B2F36";
  ctx.fillRect(0, COUNTER.y + COUNTER.h + 1, FIELD_W, FIELD_H - COUNTER.y - COUNTER.h - 1);
  paintGriddle(ctx, GRIDDLE);
  blit(ctx, "larryhdp:trash", trashSprite(), TRASH.x, TRASH.y);
  // la hamburguesa
  const order = run.orders[Math.min(run.index, run.orders.length - 1)]!;
  if (run.phase === "build") {
    paintStack(ctx, run.built, false, STACK.x, STACK.y, Z);
  } else if (run.phase === "eat") {
    // Larry la agarra y se la come: sube hacia su boca y se achica
    const p = o.reduced ? 1 : Math.min(1, (t - run.phaseAt) / EAT_MS);
    const z = o.reduced ? 1 : Z - p * 1.5;
    const mouthX = LARRY.x + LARRY_SPRITE_W;
    const mouthY = LARRY.y + 34;
    const cx = STACK.x + (mouthX - STACK.x) * Math.min(1, p * 1.6);
    const cy = STACK.y + (mouthY - STACK.y) * Math.min(1, p * 1.6);
    if (z > 0.3) paintStack(ctx, order.layers, true, cx, cy, Math.max(0.5, z));
  } else if ((run.phase === "trash" || run.phase === "over") && !o.reduced) {
    // al tacho, en el acto
    const p = Math.min(1, (t - run.phaseAt) / FALL_MS);
    if (p < 1) {
      const cx = STACK.x + (TRASH.x + TRASH.w / 2 - STACK.x) * p;
      const cy = STACK.y + (TRASH.y + 6 - STACK.y) * p - Math.sin(Math.PI * p) * 16;
      ctx.save();
      ctx.translate(Math.round(cx), Math.round(cy));
      ctx.rotate(p * 1.6);
      paintStack(ctx, run.dropped, false, 0, 0, Z * (1 - p * 0.5));
      ctx.restore();
    }
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, k: number, run: Run, o: DrawOptions): void {
  const c = offscreen();
  const octx = c.getContext("2d")!;
  paintScene(octx, run, o);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, FIELD_W, FIELD_H, 0, 0, px(FIELD_W, k), px(FIELD_H, k));
}
