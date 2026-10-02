// Los seis vasos de "servila justa": cada uno es un mapa de pixel art (una
// fila por unidad de altura, con las paredes y el interior) del que sale su
// perfil: el ancho interior en cada fila. El dibujo y la física son lo mismo:
// el volumen de una fila son sus celdas interiores. Sin DOM ni React.

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";

export type Shape = "ancho" | "tubo" | "abierto" | "cerrado" | "balon" | "cintura";
export const SHAPES: readonly Shape[] = ["ancho", "tubo", "abierto", "cerrado", "balon", "cintura"];
export const SHAPE_NAMES: Record<Shape, string> = {
  ancho: "vaso ancho bajo",
  tubo: "vaso alto tipo tubo",
  abierto: "vaso que se abre",
  cerrado: "vaso que se angosta",
  balon: "copa balón",
  cintura: "vaso con cintura",
};

/** el ancho del mapa de todos los vasos; el alto es el largo de `widths` */
export const GLASS_W = 32;

/** el ancho interior de cada fila, de abajo (fila 0) hacia arriba */
const WIDTHS: Record<Shape, number[]> = {
  ancho: Array.from({ length: 30 }, (_, r) => (r < 2 ? 22 : 26)),
  tubo: Array.from({ length: 48 }, (_, r) => (r < 2 ? 10 : 12)),
  abierto: Array.from({ length: 42 }, (_, r) => Math.min(28, 12 + Math.floor((r * 16) / 41))),
  cerrado: Array.from({ length: 42 }, (_, r) => Math.max(10, 26 - Math.floor((r * 16) / 41))),
  balon: Array.from({ length: 44 }, (_, r) => {
    // el pie (filas 0 a 9) no cuenta; la copa es una panza que se cierra arriba
    if (r < 10) return 0;
    const t = (r - 10) / 33; // 0 abajo de la copa, 1 arriba
    const w = 8 + Math.round(22 * Math.sin(Math.PI * Math.min(1, t * 0.78 + 0.08)));
    return Math.max(10, Math.min(30, w));
  }),
  cintura: Array.from({ length: 44 }, (_, r) => {
    const t = r / 43;
    const w = 24 - Math.round(12 * Math.sin(Math.PI * t));
    return Math.max(10, w);
  }),
};

/** el factor de espuma de cada forma (milésimas): los angostos hacen más espuma */
export const FOAM_FACTOR: Record<Shape, number> = { ancho: 700, tubo: 1500, abierto: 900, cerrado: 1200, balon: 800, cintura: 1300 };

export interface GlassDef {
  shape: Shape;
  /** alto en filas */
  h: number;
  /** ancho interior por fila (celdas), de abajo hacia arriba */
  widths: number[];
  /** celdas interiores acumuladas al cerrar cada fila (cap[0] = 0, cap[h] = volumen total) */
  cap: number[];
  /** fila donde arranca el interior (las de abajo con ancho 0 son el pie) */
  firstRow: number;
  foamFactor: number;
}

const defs = new Map<Shape, GlassDef>();
export function glassDef(shape: Shape): GlassDef {
  let d = defs.get(shape);
  if (!d) {
    // la primera fila con ancho es el fondo del vaso (pared): no lleva líquido
    const base = WIDTHS[shape].findIndex((w) => w > 0);
    const widths = WIDTHS[shape].map((w, r) => (r === base ? 0 : w));
    const cap = [0];
    for (const w of widths) cap.push(cap[cap.length - 1]! + w);
    d = { shape, h: widths.length, widths, cap, firstRow: base + 1, foamFactor: FOAM_FACTOR[shape] };
    defs.set(shape, d);
  }
  return d;
}

/** las filas del mapa (de arriba hacia abajo), con K en las paredes, i en el interior y p en el pie */
export function glassRows(shape: Shape): string[] {
  const d = glassDef(shape);
  const raw = WIDTHS[shape];
  const rows: string[] = [];
  for (let r = d.h - 1; r >= 0; r--) {
    const w = raw[r]!;
    if (w === 0) {
      // el pie: un tallo y una base
      const stem = r < 2 ? 14 : 4;
      const left = Math.floor((GLASS_W - stem) / 2);
      rows.push(".".repeat(left) + "p".repeat(stem) + ".".repeat(GLASS_W - left - stem));
      continue;
    }
    const left = Math.floor((GLASS_W - w) / 2) - 1;
    const bottom = r === d.firstRow - 1;
    const row = ".".repeat(left) + "K" + (bottom ? "K".repeat(w) : "i".repeat(w)) + "K" + ".".repeat(GLASS_W - left - w - 2);
    rows.push(row);
  }
  return rows;
}

const GLASS_PALETTE: Record<string, string> = { K: OUTLINE, i: "#2E4A5C", p: "#3A3D47" };
const spriteCache = new Map<Shape, Sprite>();
/** el vaso vacío, para la pantalla previa, el resumen y la herramienta */
export function glassSprite(shape: Shape): Sprite {
  let s = spriteCache.get(shape);
  if (!s) {
    s = build(glassRows(shape), GLASS_PALETTE);
    spriteCache.set(shape, s);
  }
  return s;
}

/** las celdas interiores del mapa (para el test: el volumen coincide con el dibujo) */
export function interiorCells(shape: Shape): number {
  return glassRows(shape).reduce((n, row) => n + row.split("i").length - 1, 0);
}

/** la x de la primera celda interior de una fila (en el mapa) y el ancho */
export function interiorSpan(d: GlassDef, row: number): { x: number; w: number } {
  const w = d.widths[row] ?? 0;
  return { x: Math.floor((GLASS_W - w) / 2), w };
}
