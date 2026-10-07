// Dibujo de "Cruza con el chino" en un <canvas> chico (144 × 160) escalado
// entero: los carriles vistos desde arriba (asfalto con líneas, veredas con
// baldosas, árboles y bancos, vías con durmientes y semáforo), los vehículos
// de costado dando vueltas, el tren, y la rana con El chino arriba. La cámara
// sigue a la rana hacia arriba, la deja en el tercio de abajo y nunca baja.
// El estado se interpola entre ticks con `alpha`.

import { px } from "../lib/canvas-scale";
import { blit } from "../lib/hdp-kitchen";
import { textSprite } from "../lib/font";
import { COLS, CRASH_HOLD_TICKS, HOP_TICKS, SUB, trainAt, trainWarning, vehiclesAt, type Course, type Lane, type PlannedHop, type Road, type SimState } from "./rules";
import { benchSprite, CELL, chinoSeatedSprite, FIELD_H, FIELD_W, FROG_VIEW_ROW, frogBackSprite, PALETTE, riderSprite, RIDER_H, RIDER_W, semaphoreSprite, trainSprite, treeSprite, vehicleSprite } from "./sprites";

export interface DrawOptions {
  alpha: number;
  reduced?: boolean;
  /** la fila que queda abajo de la vista (con fracción) */
  camRow: number;
  /** herramienta: la grilla y las cajas de choque */
  hitboxes?: boolean;
  /** herramienta: el camino seguro del buscador desde donde está la rana */
  path?: PlannedHop[] | null;
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

/** la y de la vista del borde de abajo de una fila (con fracción) */
export function rowY(row: number, camRow: number): number {
  return FIELD_H - (row - camRow) * CELL;
}

/** a qué fila debería apuntar la cámara para que la rana quede en la tercera desde abajo */
export function cameraTarget(s: SimState, alpha: number): number {
  const r = frogRow(s, alpha);
  return Math.max(0, r - FROG_VIEW_ROW);
}

/** la fila y la columna de la rana, interpoladas en el salto */
export function frogRow(s: SimState, alpha: number): number {
  if (!s.hop) return s.row;
  const p = Math.min(1, (s.tick - s.hop.start + alpha) / HOP_TICKS);
  return s.hop.fromRow + (s.hop.toRow - s.hop.fromRow) * p;
}
export function frogCol(s: SimState, alpha: number): number {
  if (!s.hop) return s.col;
  const p = Math.min(1, (s.tick - s.hop.start + alpha) / HOP_TICKS);
  return s.hop.fromCol + (s.hop.toCol - s.hop.fromCol) * p;
}

function paintLane(ctx: CanvasRenderingContext2D, lane: Lane, row: number, y: number, course: Course): void {
  // y es el borde de abajo de la fila; la fila ocupa [y - CELL, y)
  const top = y - CELL;
  if (lane.kind === "sidewalk") {
    ctx.fillStyle = PALETTE.tile;
    ctx.fillRect(0, top, FIELD_W, CELL);
    ctx.fillStyle = PALETTE.tileLine;
    for (let x = 0; x < FIELD_W; x += 8) ctx.fillRect(x, top, 1, CELL);
    ctx.fillRect(0, top + 8, FIELD_W, 1);
    ctx.fillStyle = PALETTE.curb;
    ctx.fillRect(0, top, FIELD_W, 1);
    ctx.fillRect(0, y - 1, FIELD_W, 1);
    for (const d of lane.deco) {
      if (d.what === "arbol") blit(ctx, "cruza:arbol", treeSprite(), d.col * CELL + 3, top + 1);
      else blit(ctx, "cruza:banco", benchSprite(), d.col * CELL + 2, top + 5);
    }
    if (lane.sign !== null) {
      const t = textSprite(String(lane.sign), "#141414");
      const w = t.w + 4;
      ctx.fillStyle = PALETTE.signPost;
      ctx.fillRect(FIELD_W - 6, top + 6, 2, 9);
      ctx.fillStyle = "#141414";
      ctx.fillRect(FIELD_W - w - 3, top + 1, w + 2, t.h + 4);
      ctx.fillStyle = PALETTE.sign;
      ctx.fillRect(FIELD_W - w - 2, top + 2, w, t.h + 2);
      blit(ctx, `cruza:cartel:${lane.sign}`, t, FIELD_W - w, top + 3);
    }
    return;
  }
  if (lane.kind === "rail") {
    ctx.fillStyle = PALETTE.gravel;
    ctx.fillRect(0, top, FIELD_W, CELL);
    ctx.fillStyle = PALETTE.sleeper;
    for (let x = 1; x < FIELD_W; x += 6) ctx.fillRect(x, top + 3, 4, CELL - 6);
    ctx.fillStyle = PALETTE.rail;
    ctx.fillRect(0, top + 4, FIELD_W, 2);
    ctx.fillRect(0, top + CELL - 6, FIELD_W, 2);
    return;
  }
  ctx.fillStyle = PALETTE.road;
  ctx.fillRect(0, top, FIELD_W, CELL);
  // la línea punteada entre carriles (solo si el de arriba también es calle)
  const above = course.lanes[row + 1];
  if (above && above.kind === "road") {
    ctx.fillStyle = PALETTE.roadLine;
    for (let x = 2; x < FIELD_W; x += 8) ctx.fillRect(x, top, 4, 1);
  }
}

function paintRoad(ctx: CanvasRenderingContext2D, lane: Road, y: number, t: number): void {
  const top = y - CELL;
  const ring = lane.period * SUB;
  const sprite = vehicleSprite({ kind: lane.vehicle, len: lane.len, look: lane.look }, lane.dir);
  for (const x of vehiclesAt(lane, Math.floor(t))) {
    // interpolación: la posición en el tick anterior más la fracción
    const xf = ((x + lane.dir * lane.speed * (t - Math.floor(t))) % ring + ring) % ring;
    for (const shift of [0, -ring]) {
      const vx = (xf + shift) / SUB;
      if (vx > COLS + 1 || vx + lane.len < -1) continue;
      blit(ctx, `cruza:veh:${lane.vehicle}:${lane.len}:${lane.look}:${lane.dir}`, sprite, vx * CELL, top + CELL - sprite.h + 1);
    }
  }
}

export function paintScene(ctx: CanvasRenderingContext2D, s: SimState, o: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  const t = s.crashed ? s.crashTick : s.tick + o.alpha;
  const course = s.course;
  ctx.fillStyle = PALETTE.road;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  const first = Math.max(0, Math.floor(o.camRow));
  const last = Math.min(course.lanes.length - 1, first + 11);
  // los carriles, de abajo hacia arriba
  for (let row = first; row <= last; row++) {
    const lane = course.lanes[row]!;
    paintLane(ctx, lane, row, rowY(row, o.camRow), course);
  }
  // las vías: el semáforo y el tren
  for (let row = first; row <= last; row++) {
    const lane = course.lanes[row]!;
    if (lane.kind !== "rail") continue;
    const y = rowY(row, o.camRow);
    const tick = Math.floor(t);
    const warn = trainWarning(lane, tick) && (o.reduced ? true : Math.floor(t / 6) % 2 === 0);
    blit(ctx, `cruza:sem:${warn}`, semaphoreSprite(warn), FIELD_W - 7, y - CELL - 4);
    if (trainAt(lane, tick)) {
      const p = ((tick - lane.phase) % lane.period) / 10;
      blit(ctx, "cruza:tren", trainSprite(), Math.round(-FIELD_W + p * 2 * FIELD_W), y - CELL + 2);
    }
  }
  for (let row = first; row <= last; row++) {
    const lane = course.lanes[row]!;
    if (lane.kind === "road") paintRoad(ctx, lane, rowY(row, o.camRow), t);
  }
  if (o.hitboxes) {
    ctx.strokeStyle = "rgba(111, 211, 224, 0.6)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL + 0.5, 0);
      ctx.lineTo(c * CELL + 0.5, FIELD_H);
      ctx.stroke();
    }
    for (let row = first; row <= last; row++) {
      const lane = course.lanes[row]!;
      const y = rowY(row, o.camRow);
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(FIELD_W, Math.round(y) + 0.5);
      ctx.stroke();
      if (lane.kind !== "road") continue;
      ctx.fillStyle = "rgba(255, 111, 145, 0.45)";
      const ring = lane.period * SUB;
      for (const x of vehiclesAt(lane, Math.floor(t))) {
        for (const shift of [0, -ring]) {
          const a = (x + shift + 44) / SUB;
          const b = (x + shift + lane.len * SUB - 44) / SUB;
          if (b < 0 || a > COLS) continue;
          ctx.fillRect(a * CELL, y - CELL + 2, (b - a) * CELL, CELL - 4);
        }
      }
    }
  }
  if (o.path && o.path.length > 0) {
    // el camino del buscador: una flecha por salto, desde donde está la rana
    ctx.fillStyle = "rgba(142, 220, 102, 0.9)";
    let r = s.row;
    let c = s.col;
    for (const h of o.path) {
      if (h.dir === "up") r++;
      else c += h.dir === "left" ? -1 : 1;
      const y = rowY(r, o.camRow);
      ctx.fillRect(c * CELL + 6, y - CELL + 6, 4, 4);
    }
  }
  // la rana con El chino
  const fr = frogRow(s, o.alpha);
  const fc = frogCol(s, o.alpha);
  const fy = rowY(fr, o.camRow);
  const fx = fc * CELL;
  if (s.crashed) {
    const since = Math.min(CRASH_HOLD_TICKS, s.tick - s.crashTick + o.alpha);
    blit(ctx, "cruza:panqueque", frogBackSprite("panqueque"), fx, fy - 12);
    if (o.reduced) {
      blit(ctx, "cruza:sentado", chinoSeatedSprite(), fx + 18, fy - 20);
    } else {
      // El chino sale volando en parábola y cae sentado una celda más allá
      const p = Math.min(1, since / 24);
      const dx = p * 20;
      const dy = -Math.sin(p * Math.PI) * 18;
      blit(ctx, "cruza:sentado", chinoSeatedSprite(), fx + dx, fy - 20 + dy);
    }
  } else {
    let pose: Parameters<typeof riderSprite>[0] = "quieta";
    if (s.hop && !o.reduced) {
      const p = (s.tick - s.hop.start + o.alpha) / HOP_TICKS;
      pose = p < 0.75 ? "estirada" : "achatada";
    }
    const lift = s.hop && !o.reduced ? Math.sin(Math.min(1, (s.tick - s.hop.start + o.alpha) / HOP_TICKS) * Math.PI) * 6 : 0;
    blit(ctx, `cruza:rider:${pose}`, riderSprite(pose), fx + (CELL - RIDER_W) / 2, fy - RIDER_H + 2 - lift);
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, k: number, s: SimState, o: DrawOptions): void {
  const c = offscreen();
  const octx = c.getContext("2d")!;
  paintScene(octx, s, o);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, FIELD_W, FIELD_H, 0, 0, px(FIELD_W, k), px(FIELD_H, k));
}
