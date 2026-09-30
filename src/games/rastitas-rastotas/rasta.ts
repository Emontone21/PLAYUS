// Las rastas como un tubo continuo en pixel art, y el globo "¡PARI!".
// Sin DOM ni React: lo usan el dibujo del canvas, la pantalla previa (como
// sprite) y los tests. Todo se calcula en unidades lógicas (CELL = 8) y se
// rasteriza a una unidad por píxel; el canvas lo escala entero.
//
// El tubo se rasteriza como un campo de distancia a la poligonal de centros
// (interpolados) de los segmentos: cada píxel a menos de `radio` unidades de
// la poligonal es rasta. Así las uniones y las curvas salen redondeadas solas,
// y no hay cortes entre casilleros. La textura son franjas diagonales en tres
// tonos, en función de la distancia recorrida a lo largo del tubo (desde la
// punta) y de la distancia al eje: parecen una trenza retorcida y se mueven
// con las rastas. Cada tanto, un bultito de una unidad de un lado.

import type { Pixel, Sprite } from "../lib/sprites";
import { BOOST_TICKS, CELL, FIELD_H, FIELD_W, xOf, yOf, type Dir, type SimState } from "./rules";

export interface Pt {
  x: number;
  y: number;
}

/** ancho del tubo: 7 de 8 unidades (87,5 % del casillero) */
export const RASTA_WIDTH = 7;
const RADIUS = RASTA_WIDTH / 2;
/** la punta se afina en los últimos 2 casilleros y sigue 4 unidades más allá del último centro (la colita) */
export const TAPER_UNITS = 2 * CELL;
export const TIP_UNITS = 4;
const TIP_RADIUS = 0.6;
/** una cuentita cada 6 tramos, contando desde la punta */
export const BEAD_EVERY = 6;
/** el globo "¡PARI!" dura 700 ms (42 ticks) */
export const PARI_TICKS = 42;

export const RASTA_TONES = ["#4A2C16", "#6B4225", "#8A5A35"] as const;
export const RASTA_TONES_GLOW = ["#6B4225", "#8A5A35", "#A87848"] as const;
export const RASTA_EDGE = "#2E1A0E";
export const RASTA_EDGE_GLOW = "#4A2C16";
export const BEAD_COLORS = ["#F7D23E", "#E2574C", "#6FD3E0", "#8EDC66"] as const;
const GLOW_LINE = "#FFF3B0";
const GLOW_HALO = "#F7D23E";

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function hash(n: number): number {
  let h = (n + 0x9e37) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/** el radio del tubo a `s` unidades de la punta, del lado `side` (1 o -1): se afina hacia la punta y tiene bultitos */
export function radiusAt(s: number, side: 1 | -1): number {
  const taper = TIP_UNITS + TAPER_UNITS;
  let r = s < taper ? TIP_RADIUS + (RADIUS - TIP_RADIUS) * (s / taper) : RADIUS;
  if (s >= taper + 4) {
    const block = Math.floor(s / 7);
    const h = hash(block);
    const bumpSide: 1 | -1 = (h >> 2) & 1 ? 1 : -1;
    const within = s - block * 7;
    if (h % 4 === 0 && bumpSide === side && within >= 2 && within < 5) r += 1;
  }
  return r;
}

/** la fracción del paso en curso, 0 a 1 */
export function stepAlpha(state: SimState, alpha: number): number {
  if (state.end) return 1;
  const span = Math.max(1, state.nextMove - state.lastMove);
  return Math.max(0, Math.min(1, (state.tick - 1 + alpha - state.lastMove) / span));
}

/** el eje del tubo pasa por el centro del píxel central del casillero (4,5 unidades), así el ancho da 7 justas */
export const AXIS = CELL / 2 + 0.5;

/** los centros de la cabeza y de cada segmento, cabeza primero, interpolados entre el paso anterior y el actual */
export function centersOf(state: SimState, a: number): Pt[] {
  const prevOf = (i: number) => state.prevBody[Math.min(i, state.prevBody.length - 1)]!;
  return state.body.map((cur, i) => {
    const prev = state.end ? cur : prevOf(i);
    return { x: (xOf(prev) + (xOf(cur) - xOf(prev)) * a) * CELL + AXIS, y: (yOf(prev) + (yOf(cur) - yOf(prev)) * a) * CELL + AXIS };
  });
}

export interface RasterOptions {
  /** con Red Bull: tonos más claros, una línea de brillo y un halo */
  boosted?: boolean;
  /** sin animación: sin pulso del brillo */
  reduced?: boolean;
  /** 0 a 1, el pulso del brillo */
  pulse?: number;
  w?: number;
  h?: number;
}

export interface Raster {
  w: number;
  h: number;
  /** RGBA, fila por fila */
  data: Uint8ClampedArray;
}

/**
 * Rasteriza las rastas: `centers` son la cabeza y los segmentos (cabeza primero, en unidades).
 * El tubo va desde la colita (más allá del último centro) hasta el centro de la cabeza, que la tapa.
 */
export function rasterRastas(centers: readonly Pt[], opts: RasterOptions = {}): Raster {
  const w = opts.w ?? FIELD_W;
  const h = opts.h ?? FIELD_H;
  const data = new Uint8ClampedArray(w * h * 4);
  if (centers.length < 2) return { w, h, data };

  // la poligonal, de la colita a la cabeza
  const pts: Pt[] = [];
  const last = centers[centers.length - 1]!;
  const before = centers[centers.length - 2]!;
  const dx = last.x - before.x;
  const dy = last.y - before.y;
  const len0 = Math.hypot(dx, dy) || 1;
  pts.push({ x: last.x + (dx / len0) * TIP_UNITS, y: last.y + (dy / len0) * TIP_UNITS });
  for (let i = centers.length - 1; i >= 0; i--) pts.push(centers[i]!);

  const dist = new Float32Array(w * h).fill(Infinity);
  const sAt = new Float32Array(w * h);
  const uAt = new Float32Array(w * h);
  let s0 = 0;
  const reach = RADIUS + 2;
  for (let j = 0; j + 1 < pts.length; j++) {
    const a = pts[j]!;
    const b = pts[j + 1]!;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len = Math.hypot(vx, vy);
    if (len === 0) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - reach));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - reach));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y) + reach));
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5;
        let t = ((cx - a.x) * vx + (cy - a.y) * vy) / (len * len);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = a.x + vx * t;
        const qy = a.y + vy * t;
        const d = Math.hypot(cx - qx, cy - qy);
        const i = y * w + x;
        if (d < dist[i]!) {
          dist[i] = d;
          sAt[i] = s0 + t * len;
          uAt[i] = (vx * (cy - a.y) - vy * (cx - a.x)) / len;
        }
      }
    }
    s0 += len;
  }

  const tones = (opts.boosted ? RASTA_TONES_GLOW : RASTA_TONES).map(rgb);
  const edge = rgb(opts.boosted ? RASTA_EDGE_GLOW : RASTA_EDGE);
  const line = rgb(GLOW_LINE);
  const halo = rgb(GLOW_HALO);
  const pulse = opts.reduced ? 0.5 : (opts.pulse ?? 0.5);
  const put = (i: number, c: readonly number[], alpha = 1) => {
    const o = i * 4;
    if (alpha >= 1 || data[o + 3] === 0) {
      data[o] = c[0]!;
      data[o + 1] = c[1]!;
      data[o + 2] = c[2]!;
      data[o + 3] = Math.round(alpha * 255);
    } else {
      data[o] = Math.round(data[o]! + (c[0]! - data[o]!) * alpha);
      data[o + 1] = Math.round(data[o + 1]! + (c[1]! - data[o + 1]!) * alpha);
      data[o + 2] = Math.round(data[o + 2]! + (c[2]! - data[o + 2]!) * alpha);
    }
  };
  for (let i = 0; i < w * h; i++) {
    const d = dist[i]!;
    if (d === Infinity) continue;
    const s = sAt[i]!;
    const u = uAt[i]!;
    const side: 1 | -1 = u >= 0 ? 1 : -1;
    const r = radiusAt(s, side);
    if (d <= r) {
      if (d > r - 1) put(i, edge);
      else {
        const band = Math.floor((s + u) / 2);
        put(i, tones[((band % 3) + 3) % 3]!);
        if (opts.boosted && u < -1.4 && u >= -2.4) put(i, line, 0.35 + 0.3 * pulse);
      }
    } else if (opts.boosted && d <= r + 1) {
      put(i, halo, 0.2 + 0.2 * pulse);
    }
  }

  // las cuentitas: una cada 6 tramos contando desde la punta, nunca en la parte que se afina
  const n = centers.length;
  const dark = rgb(opts.boosted ? RASTA_EDGE_GLOW : RASTA_EDGE);
  for (let i = 1; i < n; i++) {
    const fromTail = n - 1 - i;
    if (fromTail < 2 || fromTail % BEAD_EVERY !== 3) continue;
    const color = rgb(BEAD_COLORS[Math.floor(fromTail / BEAD_EVERY) % BEAD_COLORS.length]!);
    const c = centers[i]!;
    const bx = Math.floor(c.x);
    const by = Math.floor(c.y);
    for (let y = by - 2; y <= by + 2; y++) {
      for (let x = bx - 2; x <= bx + 2; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const ring = Math.abs(x - bx) === 2 || Math.abs(y - by) === 2;
        put(y * w + x, ring ? dark : color);
      }
    }
  }
  return { w, h, data };
}

/** un sprite con cuatro tramos de rasta hacia abajo (la cabeza va encima, en 0,0), para la pantalla previa */
export function rastaIntroSprite(): Sprite {
  const centers: Pt[] = [0, 1, 2, 3, 4].map((i) => ({ x: AXIS, y: AXIS + i * CELL }));
  const h = 5 * CELL + TIP_UNITS + 1;
  const r = rasterRastas(centers, { w: CELL, h });
  const px: Pixel[] = [];
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  for (let i = 0; i < r.w * r.h; i++) {
    if (r.data[i * 4 + 3] === 0) continue;
    px.push({ x: i % r.w, y: Math.floor(i / r.w), c: `#${hex(r.data[i * 4]!)}${hex(r.data[i * 4 + 1]!)}${hex(r.data[i * 4 + 2]!)}`.toUpperCase() });
  }
  return { w: r.w, h: r.h, px };
}

/** el tick en que se comió lo último (cigarro o Red Bull), o -1 */
export function pariTick(state: SimState): number {
  return Math.max(state.lastEat, state.boostUntil > 0 ? state.boostUntil - BOOST_TICKS : -1);
}

/** si el globo "¡PARI!" está a la vista en este tick */
export function pariVisible(state: SimState): boolean {
  const t = pariTick(state);
  return t >= 0 && !state.end && state.tick - t < PARI_TICKS;
}

export interface PariBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** de qué lado de la cabeza quedó */
  side: Dir;
}

export const PARI_W = 52;
export const PARI_H = 16;
const PARI_GAP = 2;

/**
 * Dónde va el globo: del lado contrario a la dirección de avance (nunca sobre
 * los casilleros de adelante); si ahí no entra en la grilla, a un costado.
 * `hx`, `hy` son la esquina del casillero de la cabeza, en unidades.
 */
export function pariBox(hx: number, hy: number, dir: Dir): PariBox {
  const clampX = (x: number) => Math.max(0, Math.min(FIELD_W - PARI_W, x));
  const clampY = (y: number) => Math.max(0, Math.min(FIELD_H - PARI_H, y));
  const cx = hx + CELL / 2;
  const cy = hy + CELL / 2;
  const below = { x: clampX(cx - PARI_W / 2), y: hy + CELL + PARI_GAP, w: PARI_W, h: PARI_H, side: "down" as Dir };
  const above = { x: clampX(cx - PARI_W / 2), y: hy - PARI_GAP - PARI_H, w: PARI_W, h: PARI_H, side: "up" as Dir };
  const leftOf = { x: hx - PARI_GAP - PARI_W, y: clampY(cy - PARI_H / 2), w: PARI_W, h: PARI_H, side: "left" as Dir };
  const rightOf = { x: hx + CELL + PARI_GAP, y: clampY(cy - PARI_H / 2), w: PARI_W, h: PARI_H, side: "right" as Dir };
  const fits = (b: PariBox) => b.x >= 0 && b.y >= 0 && b.x + b.w <= FIELD_W && b.y + b.h <= FIELD_H;
  const primary = dir === "up" ? below : dir === "down" ? above : dir === "right" ? leftOf : rightOf;
  if (fits(primary)) return primary;
  // a un costado: el que tenga más lugar
  const sides = dir === "up" || dir === "down" ? (cx < FIELD_W / 2 ? [rightOf, leftOf] : [leftOf, rightOf]) : cy < FIELD_H / 2 ? [below, above] : [above, below];
  return sides.find(fits) ?? sides[0]!;
}

/** los casilleros de adelante de la cabeza (hasta 3, dentro de la grilla), en unidades */
export function cellsAhead(hx: number, hy: number, dir: Dir, count = 3): Pt[] {
  const d = dir === "up" ? { x: 0, y: -1 } : dir === "down" ? { x: 0, y: 1 } : dir === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 };
  const out: Pt[] = [];
  for (let i = 1; i <= count; i++) {
    const x = hx + d.x * CELL * i;
    const y = hy + d.y * CELL * i;
    if (x < 0 || y < 0 || x >= FIELD_W || y >= FIELD_H) break;
    out.push({ x, y });
  }
  return out;
}
