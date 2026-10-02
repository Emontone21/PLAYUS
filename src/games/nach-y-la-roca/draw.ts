// Dibujo de la partida: la escena se pinta en un canvas chico fuera de
// pantalla (120 × 160, una unidad por píxel) con perspectiva de corredor (la
// calle se angosta hacia el horizonte, las rocas crecen al acercarse) y se
// escala con vecino más cercano, como en el colgado. Sin React: lo usan el
// juego y la herramienta. El estado se dibuja interpolado entre ticks.

import { integerScale, px } from "../lib/canvas-scale";
import { spriteCanvas } from "../lib/sprites";
import { textSprite } from "../lib/font";
import { CHANGE_TICKS, DIST, hitLane, INVULN_TICKS, LANES, rockLaneAt, ROLL_TICKS, type Course, type Lane, type Row, type SimState } from "./rules";
import { FIELD_H, FIELD_W, nachDownSprite, nachSprite, noteSprite, ROCK_PIECE, rockSprite, type NachPose, type RockSize } from "./sprites";

export interface DrawOptions {
  alpha: number;
  reduced?: boolean;
  /** herramienta: las cajas de choque */
  hitboxes?: boolean;
}

/** el horizonte y dónde está The Nach (su base) */
export const HORIZON_Y = 44;
export const NACH_Y = 128;
/** a esta profundidad (mm) la escala es la mitad */
export const Z_HALF = 9_000;
/** hasta dónde se ven las filas (mm) */
export const Z_VIEW = 70_000;
/** medio ancho de la calle a la altura de The Nach y en el horizonte */
export const ROAD_HALF_NEAR = 52;
export const ROAD_HALF_FAR = 5;
export const LANE_W_NEAR = (ROAD_HALF_NEAR * 2) / LANES;

const SKY = "#0B1020";
const ROAD = "#2A2D3A";
const ROAD_FAR = "#1C1F2A";
const LINE = "#6B6F80";
const CURB = "#3C4050";
const BUILDING = "#151826";
const BUILDING_2 = "#1C2033";
const NEONS = ["#FF6F91", "#6FD3E0", "#FFD34E", "#8EDC66", "#C58CFF"];

/** la escala de algo a profundidad z (mm por delante de The Nach): 1 en z = 0, 0 en el horizonte */
export function scaleAt(z: number): number {
  return Z_HALF / (Z_HALF + Math.max(0, z));
}
export function yAt(z: number): number {
  return HORIZON_Y + (NACH_Y - HORIZON_Y) * scaleAt(z);
}
/** la x del centro de un carril (0 a 2) a profundidad z; `offset` corre entre carriles (−1 a 1) */
export function laneX(lane: number, z: number): number {
  const s = scaleAt(z);
  const half = ROAD_HALF_FAR + (ROAD_HALF_NEAR - ROAD_HALF_FAR) * s;
  return FIELD_W / 2 + ((lane - 1) * 2 * half) / LANES;
}

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

/** la distancia interpolada (mm) */
export function distNow(s: SimState, alpha: number): number {
  if (s.end) return s.dist;
  const prev = DIST[Math.max(0, s.tick - 1)] ?? s.dist;
  return prev + (s.dist - prev) * alpha;
}

/** la x de The Nach (carril con fracción) interpolada durante un cambio */
export function nachLane(s: SimState, alpha: number): number {
  if (!s.change) return s.lane;
  const t = Math.min(CHANGE_TICKS, s.change.t + alpha);
  return s.change.from + (s.change.to - s.change.from) * (t / CHANGE_TICKS);
}

export function poseFor(s: SimState): NachPose {
  if (s.change) return s.change.to > s.change.from ? "der" : "izq";
  return Math.floor(s.tick / 8) % 2 === 0 ? "a" : "b";
}

/** el tamaño de dibujo de una roca sale de su fila (solo estética) */
export function rockSize(rowIndex: number, rockIndex: number): RockSize {
  return (((rowIndex * 7 + rockIndex * 3) % 3) as RockSize);
}

function drawSpriteScaled(ctx: CanvasRenderingContext2D, key: string, sprite: ReturnType<typeof rockSprite>, cx: number, baseY: number, scale: number): void {
  const c = spriteCanvas(key, sprite, 1);
  const w = Math.max(2, Math.round(sprite.w * scale));
  const h = Math.max(1, Math.round(sprite.h * scale));
  ctx.drawImage(c, 0, 0, sprite.w, sprite.h, Math.round(cx - w / 2), Math.round(baseY - h), w, h);
}

export function paintScene(ctx: CanvasRenderingContext2D, s: SimState, course: Course, opts: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  const d = distNow(s, opts.alpha);
  // el cielo y los edificios
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  paintBuildings(ctx, d);
  // la calle: un trapecio del horizonte a abajo
  ctx.fillStyle = ROAD;
  ctx.beginPath();
  ctx.moveTo(FIELD_W / 2 - ROAD_HALF_FAR, HORIZON_Y);
  ctx.lineTo(FIELD_W / 2 + ROAD_HALF_FAR, HORIZON_Y);
  ctx.lineTo(FIELD_W / 2 + ROAD_HALF_NEAR + 14, FIELD_H);
  ctx.lineTo(FIELD_W / 2 - ROAD_HALF_NEAR - 14, FIELD_H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ROAD_FAR;
  ctx.fillRect(FIELD_W / 2 - ROAD_HALF_FAR - 2, HORIZON_Y - 2, ROAD_HALF_FAR * 2 + 4, 3);
  // los cordones y las líneas de los carriles (segmentos que pasan con la distancia)
  for (let z = 0; z < Z_VIEW; z += 400) {
    const zz = z - (d % 4000);
    if (zz < 0) continue;
    const y = Math.round(yAt(zz));
    const y2 = Math.round(yAt(zz + 200));
    if (y === y2 && zz > 2000) continue;
    const sc = scaleAt(zz);
    if ((Math.floor((d + zz) / 4000) & 1) === 0) {
      ctx.fillStyle = LINE;
      for (const l of [0.5, 1.5]) {
        const x = laneX(l, zz);
        ctx.fillRect(Math.round(x), y2, 1, Math.max(1, y - y2));
      }
    }
    ctx.fillStyle = CURB;
    const half = ROAD_HALF_FAR + (ROAD_HALF_NEAR - ROAD_HALF_FAR) * sc;
    ctx.fillRect(Math.round(FIELD_W / 2 - half - 1), y2, 1, Math.max(1, y - y2));
    ctx.fillRect(Math.round(FIELD_W / 2 + half), y2, 1, Math.max(1, y - y2));
  }
  // un farol cada 30 m, en la vereda derecha
  for (let z = 30_000 - (d % 30_000); z < Z_VIEW; z += 30_000) {
    const sc = scaleAt(z);
    const half = ROAD_HALF_FAR + (ROAD_HALF_NEAR - ROAD_HALF_FAR) * sc;
    const x = Math.round(FIELD_W / 2 + half + 4 * sc + 2);
    const y = Math.round(yAt(z));
    const h = Math.max(2, Math.round(26 * sc));
    ctx.fillStyle = "#3A3D47";
    ctx.fillRect(x, y - h, 1, h);
    ctx.fillStyle = "#FFD34E";
    ctx.fillRect(x - 1, y - h - 1, 3, Math.max(1, Math.round(2 * sc)));
  }

  // las rocas, de lejos a cerca
  const rows: { row: Row; i: number; z: number }[] = [];
  for (let i = Math.max(0, s.nextRow - 1); i < course.rows.length; i++) {
    const row = course.rows[i]!;
    const z = row.dist - d;
    if (z > Z_VIEW) break;
    if (z < -3000) continue;
    rows.push({ row, i, z });
  }
  rows.sort((a, b) => b.z - a.z);
  for (const { row, i, z } of rows) {
    const sc = scaleAt(Math.max(0, z));
    const y = yAt(Math.max(0, z));
    for (let r = 0; r < row.rocks.length; r++) {
      if (s.broken.has(`${i}:${r}`)) continue;
      const rock = row.rocks[r]!;
      let lane: number = rock.lane;
      let turn: 0 | 1 | 2 | 3 = 0;
      if (rock.to !== undefined && rock.rollStart !== undefined) {
        const t = s.tick + opts.alpha - rock.rollStart;
        if (t >= ROLL_TICKS) lane = rock.to;
        else if (t > 0) {
          lane = rock.lane + (rock.to - rock.lane) * (t / ROLL_TICKS);
          turn = (Math.floor(t / 4) % 4) as 0 | 1 | 2 | 3;
        }
        // la flechita en el piso hacia donde va, mientras no terminó de cruzar
        if (t < ROLL_TICKS) {
          const ax = laneX(rock.to, Math.max(0, z));
          ctx.fillStyle = "rgba(255, 211, 78, 0.7)";
          ctx.fillRect(Math.round(ax - 1), Math.round(y + 1), 3, 1);
          ctx.fillRect(Math.round(ax), Math.round(y), 1, 1);
        }
      }
      const x = laneX(lane, Math.max(0, z));
      // la sombra en el piso, para leer el carril
      const sw = Math.max(2, Math.round(10 * sc));
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fillRect(Math.round(x - sw / 2), Math.round(y), sw, Math.max(1, Math.round(2 * sc)));
      const size = rockSize(i, r);
      drawSpriteScaled(ctx, `nach:roca:${size}:${turn}`, rockSprite(size, turn), x, y, sc);
    }
  }

  // los pedazos de la última roca rota (20 ticks), salvo con reducir movimiento
  if (s.lastHit && !opts.reduced) {
    const t = s.tick - s.lastHit.tick + opts.alpha;
    if (t < 20) {
      const x = laneX(hitLane(s), 0);
      const c = spriteCanvas("nach:pedazo", ROCK_PIECE, 1);
      for (let p = 0; p < 6; p++) {
        const ang = (p / 6) * Math.PI;
        const dx = Math.cos(ang) * t * 1.2;
        const dy = -Math.sin(ang) * t * 1.5 + t * t * 0.08;
        ctx.drawImage(c, Math.round(x + dx - 1), Math.round(NACH_Y - 8 + dy), 2, 2);
      }
    }
  }

  // The Nach, parpadeando si está invulnerable
  const blink = s.tick < s.invulnUntil && !s.end && ((s.tick >> 2) & 1) === 1;
  if (!blink) {
    const pose = poseFor(s);
    const x = laneX(nachLane(s, opts.alpha), 0);
    // al final, sentado en el piso con los auriculares torcidos
    const sp = s.end ? nachDownSprite() : nachSprite(pose);
    const c = spriteCanvas(s.end ? "nach:nach:piso" : `nach:nach:${pose}`, sp, 1);
    const bob = !opts.reduced && !s.change && !s.end ? (Math.floor(s.tick / 8) % 2) : 0;
    ctx.drawImage(c, Math.round(x - sp.w / 2), NACH_Y - sp.h + bob);
    // cada tanto, una notita que sale de los auriculares
    if (!opts.reduced && !s.end) {
      const phase = s.tick % 150;
      if (phase < 30) {
        const n = spriteCanvas("nach:nota", noteSprite(), 1);
        ctx.drawImage(n, Math.round(x + 9), Math.round(NACH_Y - sp.h - 2 - phase / 3));
      }
    }
  }

  if (opts.hitboxes) {
    ctx.strokeStyle = "#6FD3E0";
    ctx.lineWidth = 1;
    const hl = hitLane(s);
    ctx.strokeRect(Math.round(laneX(hl, 0) - LANE_W_NEAR / 2) + 0.5, NACH_Y - 12 + 0.5, LANE_W_NEAR - 1, 12);
    for (const { row, z } of rows) {
      if (z < 0) continue;
      const y = yAt(z);
      const sc = scaleAt(z);
      for (const rock of row.rocks) {
        const l = rockLaneAt(rock, s.tick);
        const w = Math.max(3, LANE_W_NEAR * sc);
        ctx.strokeStyle = "#FF6F91";
        ctx.strokeRect(Math.round(laneX(l, z) - w / 2) + 0.5, Math.round(y - 4 * sc) + 0.5, Math.round(w), Math.max(2, Math.round(4 * sc)));
      }
    }
    const label = spriteCanvas(`nach:inv:${s.tick < s.invulnUntil ? 1 : 0}`, textSprite(s.tick < s.invulnUntil ? `inv ${Math.ceil((s.invulnUntil - s.tick) / (INVULN_TICKS / 10))}` : "ok", "#F7FFF2"), 1);
    ctx.drawImage(label, 2, FIELD_H - 8);
  }
}

function paintBuildings(ctx: CanvasRenderingContext2D, d: number): void {
  // los edificios a los costados, con ventanas y carteles de neón que pasan
  for (const side of [-1, 1]) {
    for (let z = -2000; z < Z_VIEW; z += 6000) {
      const zz = z - (d % 6000);
      if (zz < -2000) continue;
      const sc = scaleAt(Math.max(0, zz));
      const half = ROAD_HALF_FAR + (ROAD_HALF_NEAR - ROAD_HALF_FAR) * sc;
      const y = yAt(Math.max(0, zz));
      const w = Math.max(2, Math.round(30 * sc));
      const h = Math.max(4, Math.round((40 + ((Math.floor((d + zz) / 6000) * 37) % 30)) * sc));
      const x0 = side < 0 ? Math.round(FIELD_W / 2 - half - 6 * sc - w) : Math.round(FIELD_W / 2 + half + 6 * sc);
      ctx.fillStyle = (Math.floor((d + zz) / 6000) & 1) === 0 ? BUILDING : BUILDING_2;
      ctx.fillRect(x0, Math.round(y - h), w, h);
      // ventanas
      ctx.fillStyle = "#3A3F55";
      for (let wy = y - h + 3 * sc; wy < y - 3; wy += 6 * sc) {
        for (let wx = x0 + 2 * sc; wx < x0 + w - 2; wx += 5 * sc) ctx.fillRect(Math.round(wx), Math.round(wy), Math.max(1, Math.round(2 * sc)), Math.max(1, Math.round(2 * sc)));
      }
      // un cartel de neón
      const neon = NEONS[Math.floor((d + zz) / 6000 + (side < 0 ? 0 : 2)) % NEONS.length]!;
      ctx.fillStyle = neon;
      ctx.fillRect(x0 + Math.round(3 * sc), Math.round(y - h * 0.6), Math.max(2, Math.round((w - 6 * sc) * 0.8)), Math.max(1, Math.round(3 * sc)));
    }
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, s: SimState, course: Course, k: number, opts: DrawOptions): void {
  const o = offscreen();
  const octx = o.getContext("2d")!;
  paintScene(octx, s, course, opts);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(o, 0, 0, FIELD_W, FIELD_H, 0, 0, px(FIELD_W, k), px(FIELD_H, k));
}

/** la vista desde arriba de las filas que vienen (herramienta): 3 columnas, el carril libre marcado */
export function drawTopDown(ctx: CanvasRenderingContext2D, s: SimState, course: Course, w: number, h: number): void {
  ctx.fillStyle = "#0f2a22";
  ctx.fillRect(0, 0, w, h);
  const colW = w / 3;
  const span = 120_000; // 120 m
  for (let i = s.nextRow; i < course.rows.length; i++) {
    const row = course.rows[i]!;
    const z = row.dist - s.dist;
    if (z > span) break;
    if (z < 0) continue;
    const y = h - (z / span) * (h - 10) - 6;
    const taken = new Set(row.rocks.map((r) => rockLaneAt(r, row.tick)));
    for (let l = 0; l < 3; l++) {
      ctx.fillStyle = taken.has(l as Lane) ? "#7A7F8A" : "rgba(142, 220, 102, 0.35)";
      ctx.fillRect(l * colW + 2, y - 3, colW - 4, 6);
    }
    for (const rock of row.rocks) {
      if (rock.to !== undefined) {
        ctx.fillStyle = "#FFD34E";
        ctx.fillRect(rock.lane * colW + colW / 2 - 1, y - 2, (rock.to - rock.lane) * colW, 2);
      }
    }
    ctx.fillStyle = "#F7FFF2";
    ctx.font = "10px monospace";
    ctx.fillText(`${Math.round(row.dist / 1000)} m ${row.kind}`, 4, y - 5);
  }
  // The Nach
  ctx.fillStyle = "#6FD3E0";
  ctx.fillRect(hitLane(s) * colW + colW / 2 - 4, h - 8, 8, 6);
}
