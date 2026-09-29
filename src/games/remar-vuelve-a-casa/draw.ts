// Dibujo de la partida en un <canvas>, en escalado entero. Sin React: lo usan
// el juego y la herramienta de desarrollo. Dibuja el estado interpolado entre
// el tick anterior y el actual (alpha), así se ve fluido a cualquier frame rate.
//
// El río baja: un objeto a distancia d se ve en y = BOAT_Y - (d - dist) / 100.

import {
  BOAT_H,
  BOAT_HIT_H,
  BOAT_HIT_W,
  BOAT_W,
  BOAT_Y,
  D_PER_M,
  D_PER_UNIT,
  FIELD_H,
  FIELD_W,
  isBottle,
  itemX,
  speedAt,
  SUB,
  type Course,
  type SimState,
  type Waypoint,
} from "./rules";
import { boatSprite, hicSprite, itemSprite, oarSprite, OAR_LEFT, OAR_RIGHT, riverRects, signSprite, type Cheeks } from "./sprites";
import { integerScale, px } from "../lib/canvas-scale";
import { paintedCanvas, spriteCanvas } from "../lib/sprites";

/** cuánto dura el "hic!" sobre la cabeza */
export const HIC_TICKS = 40;
/** sacudón al chocar (decorativo) */
const SHAKE_TICKS = 12;
/** cada cuántos metros hay un cartel en la orilla */
export const SIGN_EVERY_M = 100;

export interface DrawOptions {
  /** fracción del tick en curso, 0 a 1 */
  alpha: number;
  /** prefers-reduced-motion: sin sacudón ni globito que salta */
  reduced?: boolean;
  /** herramienta de desarrollo: cajas de choque y el camino seguro */
  hitboxes?: boolean;
  safePath?: readonly Waypoint[];
}

/** píxeles del dispositivo por unidad lógica que entran en un espacio dado */
export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return integerScale(cssWidth, cssHeight, dpr, FIELD_W, FIELD_H);
}

/** los cachetes según las botellas: 0 sobrio, 1 con una, 2 con tres, 3 con seis */
export function cheeksFor(bottles: number): Cheeks {
  return bottles >= 6 ? 3 : bottles >= 3 ? 2 : bottles >= 1 ? 1 : 0;
}

/** cuadro de los remos: más rápido cuanto más rápido va el bote (atrás, medio, adelante, medio) */
export function oarFrame(state: SimState): 0 | 1 | 2 {
  if (state.end) return 0;
  const v = Math.max(1, speedAt(state.tick, state.mult));
  const period = Math.max(3, Math.min(12, Math.round(600 / v)));
  return ([1, 0, 2, 0] as const)[Math.floor(state.tick / period) % 4]!;
}

function background(k: number) {
  return paintedCanvas("remar:rio", FIELD_W, FIELD_H, k, (ctx) => {
    for (const r of riverRects()) {
      ctx.fillStyle = r.c;
      ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
    }
  });
}

export function drawScene(ctx: CanvasRenderingContext2D, state: SimState, course: Course, k: number, opts: DrawOptions) {
  ctx.imageSmoothingEnabled = false;
  const a = state.end ? 1 : opts.alpha;
  const dist = state.prevDist + (state.dist - state.prevDist) * a;
  const screenY = (d: number) => BOAT_Y - (d - dist) / D_PER_UNIT;
  ctx.save();

  // sacudón al chocar (decorativo)
  if (!opts.reduced && state.end?.reason === "choque" && state.tick - state.end.tick < SHAKE_TICKS) {
    ctx.translate(state.tick % 2 === 0 ? k : -k, 0);
  }

  // el río baja: el mosaico se desplaza con el avance
  const tileY = (dist / D_PER_UNIT) % FIELD_H;
  ctx.drawImage(background(k), 0, px(tileY - FIELD_H, k));
  ctx.drawImage(background(k), 0, px(tileY, k));

  // carteles cada 100 m en la orilla izquierda
  const firstSign = Math.max(1, Math.floor((dist - (FIELD_H - BOAT_Y + 14) * D_PER_UNIT) / (SIGN_EVERY_M * D_PER_M)));
  for (let m = firstSign * SIGN_EVERY_M; ; m += SIGN_EVERY_M) {
    const y = screenY(m * D_PER_M);
    if (y < -14) break;
    const sp = signSprite(m);
    ctx.drawImage(spriteCanvas(`remar:cartel:${m}`, sp, k), px(1, k), px(y - sp.h, k));
  }

  // lo que flota: desde lo que ya pasó (todavía se ve abajo) hasta lo que asoma arriba
  const items = course.items;
  let i = state.first;
  while (i > 0 && dist - items[i - 1]!.d < (FIELD_H - BOAT_Y + 12) * D_PER_UNIT) i--;
  for (; i < items.length; i++) {
    const it = items[i]!;
    const y = screenY(it.d);
    if (y < -12) break;
    if (isBottle(it.kind) && state.taken.includes(i)) continue;
    const sp = itemSprite(it.kind);
    const x = itemX(it, state.tick);
    ctx.drawImage(spriteCanvas(`remar:item:${it.kind}`, sp, k), px(x - sp.w / 2, k), px(y - sp.h / 2, k));
  }

  // el bote, con los remos; al chocar se inclina
  const bx = (state.prevBoatX + (state.boatX - state.prevBoatX) * a) / SUB;
  const frame = oarFrame(state);
  const cheeks = cheeksFor(state.bottles);
  const left = bx - BOAT_W / 2;
  const top = BOAT_Y - BOAT_H / 2;
  ctx.save();
  if (state.end?.reason === "choque") {
    ctx.translate(px(bx, k), px(BOAT_Y, k));
    ctx.rotate(state.crash && state.crash.x * SUB < state.boatX ? -0.35 : 0.35);
    ctx.translate(-px(bx, k), -px(BOAT_Y, k));
  }
  const oarL = oarSprite("izq", frame);
  const oarR = oarSprite("der", frame);
  ctx.drawImage(spriteCanvas(`remar:remo:izq:${frame}`, oarL, k), px(left + OAR_LEFT.x, k), px(top + OAR_LEFT.y, k));
  ctx.drawImage(spriteCanvas(`remar:remo:der:${frame}`, oarR, k), px(left + OAR_RIGHT.x, k), px(top + OAR_RIGHT.y, k));
  ctx.drawImage(spriteCanvas(`remar:bote:${cheeks}:${frame}`, boatSprite(cheeks, frame), k), px(left, k), px(top, k));
  ctx.restore();

  // "hic!" un instante después de cada botella
  if (state.lastBottle && !state.end && state.tick - state.lastBottle.tick < HIC_TICKS) {
    const sp = hicSprite();
    const age = state.tick - state.lastBottle.tick;
    const bob = opts.reduced ? 0 : age < 8 ? 1 : 0;
    ctx.drawImage(spriteCanvas("remar:hic", sp, k), px(bx + 2, k), px(top - sp.h - 1 - bob, k));
  }

  if (opts.hitboxes) {
    ctx.lineWidth = Math.max(1, Math.floor(k / 3));
    ctx.strokeStyle = "#FF3B30";
    ctx.strokeRect(px(bx - BOAT_HIT_W / 2, k), px(BOAT_Y - BOAT_HIT_H / 2, k), BOAT_HIT_W * k, BOAT_HIT_H * k);
    let j = state.first;
    while (j > 0 && dist - items[j - 1]!.d < (FIELD_H - BOAT_Y + 12) * D_PER_UNIT) j--;
    for (; j < items.length; j++) {
      const it = items[j]!;
      const y = screenY(it.d);
      if (y < -12) break;
      if (isBottle(it.kind) && state.taken.includes(j)) continue;
      ctx.strokeStyle = isBottle(it.kind) ? "#FFD34E" : "#FF3B30";
      ctx.strokeRect(px(itemX(it, state.tick) - it.w / 2, k), px(y - it.h / 2, k), it.w * k, it.h * k);
    }
  }
  if (opts.safePath) {
    // el camino seguro: los huecos y la línea que los une
    ctx.strokeStyle = "#1E88E5";
    ctx.lineWidth = Math.max(1, Math.floor(k / 2));
    ctx.beginPath();
    let started = false;
    for (const w of opts.safePath) {
      const y = screenY(w.d);
      if (y < -12 || y > FIELD_H + 12) {
        if (started && y < -12) break;
        continue;
      }
      if (!started) {
        ctx.moveTo(px(w.x, k), px(y, k));
        started = true;
      } else ctx.lineTo(px(w.x, k), px(y, k));
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(30, 136, 229, 0.25)";
    for (const r of course.rows) {
      const y = screenY(r.d);
      if (y < -12 || y > FIELD_H + 12) continue;
      ctx.fillRect(px(r.gap - r.gapW / 2, k), px(y - 2, k), r.gapW * k, 4 * k);
    }
  }
  ctx.restore();
}
