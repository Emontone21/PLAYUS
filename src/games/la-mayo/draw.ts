// Dibujo de la partida en un <canvas>, en escalado entero. Sin React: lo usan
// el juego y la herramienta de desarrollo. Arriba, Remar a la mesa con el
// plato; abajo, el tubo de mayonesa con la zona del punto justo (que se achica
// a la vista) y el pomo que se desliza. Al embocar cae un chorro sobre el
// plato; al errar, un hilito (si quedó a la izquierda) o un pegote (a la
// derecha).

import { integerScale, px } from "../lib/canvas-scale";
import { spriteCanvas } from "../lib/sprites";
import { BAR_MAX, CENTER, FREEZE_TICKS, isFrozen, posUnits, zoneHalfAt, type SimState } from "./rules";
import { FIELD_H, FIELD_W, mayoSprite, plateSprite, PLATE_W, POMO_W, pomoSprite, remarSprite, textSprite, type Face } from "./sprites";

export interface DrawOptions {
  /** fracción del tick en curso, 0 a 1 */
  alpha: number;
  reduced?: boolean;
  /** herramienta: posición, velocidad y límites de la zona */
  debug?: boolean;
}

export const WALL = "#2A3F52";
export const TABLE = "#8B5A2B";
export const TABLE_EDGE = "#5E3A1A";
const LUCIERNAGA = "#FFD34E";
const POCA = "#FBF8EC";
const MUCHA = "#E6B93A";

/** el tubo: de x = 10 a 110 (100 unidades para 1.000 de la barra), de y = 76 a 86 */
export const TUBE_X = 10;
export const TUBE_W = 100;
export const TUBE_Y = 76;
export const TUBE_H = 10;
/** Remar a la izquierda y el plato a su derecha, así el chorro cae sobre el plato y no sobre su cabeza */
export const REMAR_X = 30;
export const REMAR_Y = 12;
export const TABLE_Y = 28;
export const PLATE_X = 62;
export const PLATE_Y = 32;
/** por dónde cae la mayonesa: el centro del plato */
export const POUR_X = PLATE_X + PLATE_W / 2;

export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return integerScale(cssWidth, cssHeight, dpr, FIELD_W, FIELD_H);
}

/** qué cara pone Remar: contento o enojado durante el congelamiento después de un toque (y al final) */
export function faceFor(s: SimState): Face {
  if (s.end) return "enojado";
  if (s.lastTap && isFrozen(s)) return s.lastTap.hit ? "contento" : "enojado";
  return "espera";
}

/** la posición del pomo interpolada entre el tick anterior y el actual (unidades) */
export function pomoX(s: SimState, prevPos: number, alpha: number): number {
  if (isFrozen(s) || s.end) return posUnits(s);
  const now = s.pos;
  return (prevPos + (now - prevPos) * alpha) / 64;
}

function hex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

const TUBE_COLORS = Array.from({ length: TUBE_W }, (_, i) => hex(POCA, MUCHA, i / (TUBE_W - 1)));

export function drawScene(ctx: CanvasRenderingContext2D, s: SimState, prevPos: number, k: number, opts: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  const W = FIELD_W * k;
  const H = FIELD_H * k;
  ctx.fillStyle = WALL;
  ctx.fillRect(0, 0, W, H);
  // la mesa
  ctx.fillStyle = TABLE;
  ctx.fillRect(0, px(TABLE_Y, k), W, px(60 - TABLE_Y, k));
  ctx.fillStyle = TABLE_EDGE;
  ctx.fillRect(0, px(TABLE_Y, k), W, k);
  ctx.fillRect(0, px(58, k), W, 2 * k);
  // Remar y el plato
  const face = faceFor(s);
  const shake = face === "enojado" && !opts.reduced && !s.end ? ((s.tick >> 1) & 1 ? 1 : -1) : 0;
  const remar = spriteCanvas(`mayo:remar:${face}`, remarSprite(face), 1);
  ctx.drawImage(remar, 0, 0, remar.width, remar.height, px(REMAR_X + shake, k), px(REMAR_Y, k), remar.width * k, remar.height * k);
  const plate = spriteCanvas("mayo:plato", plateSprite(), 1);
  ctx.drawImage(plate, 0, 0, plate.width, plate.height, px(PLATE_X, k), px(PLATE_Y, k), plate.width * k, plate.height * k);

  // la mayonesa después del último toque: el chorro cae durante el congelamiento
  const tap = s.lastTap;
  if (tap && (isFrozen(s) || s.end)) {
    const since = s.tick - tap.tick;
    const kind = tap.hit ? "justo" : tap.pos < CENTER ? "poca" : "mucha";
    // al terminar la partida el tick no avanza más: el resultado del último toque se ve directo
    const progress = opts.reduced || s.end ? 1 : Math.min(1, (since + opts.alpha) / (FREEZE_TICKS * 0.6));
    const m = spriteCanvas(`mayo:mayo:${kind}`, mayoSprite(kind), 1);
    const mx = POUR_X - Math.floor(m.width / 2);
    const my = kind === "mucha" ? PLATE_Y - 2 : PLATE_Y - 3;
    if (progress < 1) {
      // el chorro: una columna que baja desde arriba hasta el plato
      ctx.fillStyle = "#F3E7B3";
      const w = kind === "mucha" ? 4 : kind === "poca" ? 1 : 2;
      const top = 2;
      const len = Math.floor((my - top) * progress);
      ctx.fillRect(px(POUR_X - w / 2, k), px(top, k), w * k, len * k);
    } else {
      ctx.drawImage(m, 0, 0, m.width, m.height, px(mx, k), px(my, k), m.width * k, m.height * k);
    }
  }

  // el tubo: degradé de "poca" a "mucha"
  ctx.fillStyle = "#141414";
  ctx.fillRect(px(TUBE_X - 1, k), px(TUBE_Y - 1, k), (TUBE_W + 2) * k, (TUBE_H + 2) * k);
  for (let i = 0; i < TUBE_W; i++) {
    ctx.fillStyle = TUBE_COLORS[i]!;
    ctx.fillRect(px(TUBE_X + i, k), px(TUBE_Y, k), k, TUBE_H * k);
  }
  // la zona del punto justo, al ancho del tick actual
  const half = zoneHalfAt(s.tick);
  const zx = TUBE_X + ((CENTER - half) * TUBE_W) / BAR_MAX;
  const zw = ((2 * half) * TUBE_W) / BAR_MAX;
  ctx.fillStyle = LUCIERNAGA;
  ctx.fillRect(px(zx, k), px(TUBE_Y, k), Math.max(k, px(zw, k)), TUBE_H * k);
  ctx.fillStyle = "#B88F1E";
  ctx.fillRect(px(zx, k), px(TUBE_Y, k), k, TUBE_H * k);
  ctx.fillRect(px(zx + zw, k) - k, px(TUBE_Y, k), k, TUBE_H * k);
  // las leyendas
  const label = spriteCanvas("mayo:punto-justo", textSprite("punto justo", LUCIERNAGA), 1);
  ctx.drawImage(label, 0, 0, label.width, label.height, px(FIELD_W / 2 - label.width / 2, k), px(TUBE_Y - 8, k), label.width * k, label.height * k);
  const poca = spriteCanvas("mayo:poca", textSprite("poca", "#A7C4B3"), 1);
  ctx.drawImage(poca, 0, 0, poca.width, poca.height, px(TUBE_X, k), px(TUBE_Y + TUBE_H + 3, k), poca.width * k, poca.height * k);
  const mucha = spriteCanvas("mayo:mucha", textSprite("mucha", "#A7C4B3"), 1);
  ctx.drawImage(mucha, 0, 0, mucha.width, mucha.height, px(TUBE_X + TUBE_W - mucha.width, k), px(TUBE_Y + TUBE_H + 3, k), mucha.width * k, mucha.height * k);

  // el pomo: se desliza sobre el tubo (interpolado), y queda quieto congelado
  const x = pomoX(s, prevPos, opts.alpha);
  const pomo = spriteCanvas("mayo:pomo", pomoSprite(), 1);
  const pxX = Math.round((TUBE_X + (x * TUBE_W) / BAR_MAX - POMO_W / 2) * k);
  ctx.drawImage(pomo, 0, 0, pomo.width, pomo.height, pxX, px(TUBE_Y - 9, k), pomo.width * k, pomo.height * k);
  if (isFrozen(s) && tap) {
    // una marca fina donde quedó
    ctx.fillStyle = tap.hit ? "#8EDC66" : "#FF6F91";
    ctx.fillRect(Math.round((TUBE_X + (tap.pos * TUBE_W) / BAR_MAX) * k), px(TUBE_Y - 1, k), k, (TUBE_H + 2) * k);
  }

  if (opts.debug) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, 70 * k, 8 * k);
    ctx.fillStyle = "#F7FFF2";
    ctx.font = `${Math.max(8, 3 * k)}px monospace`;
    ctx.fillText(`pos ${posUnits(s)} v ${s.speed} zona ${CENTER - half}-${CENTER + half} t ${s.tick}`, k, 6 * k);
  }
}
