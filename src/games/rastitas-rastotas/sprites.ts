// Pixel art de la cabeza con rastas, el cigarro, la lata, los piojos y el
// fondo, sin DOM ni React. Cada casillero mide 8 × 8 unidades (CELL).

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";
import { CELL, type Dir } from "./rules";

export type { Sprite };

const K = OUTLINE;

/** gira un mapa de letras 90° en sentido horario */
function rotateRows(rows: readonly string[]): string[] {
  const h = rows.length;
  const w = rows[0]!.length;
  const out: string[] = [];
  for (let x = 0; x < w; x++) {
    let line = "";
    for (let y = h - 1; y >= 0; y--) line += rows[y]![x];
    out.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// la cabeza, vista desde arriba, con la cara hacia donde va (dibujada mirando
// arriba y girada según la dirección)
// ---------------------------------------------------------------------------

const HEAD: Record<string, string> = { K, S: "#C98A5E", s: "#A86E45", E: "#1B1B1B", W: "#FFFFFF", M: "#7A3B2E", H: "#3B2314", h: "#5A3A22" };
const HEAD_UP = [
  ".KKKKKK.",
  "KSSSSSSK",
  "KSWEWESK",
  "KSSSSSSK",
  "KSSMMSSK",
  "KsSSSSsK",
  "KHhHHhHK",
  ".KKKKKK.",
];

const headCache = new Map<Dir, Sprite>();
export function headSprite(dir: Dir): Sprite {
  let s = headCache.get(dir);
  if (!s) {
    let rows = HEAD_UP;
    const turns = dir === "up" ? 0 : dir === "right" ? 1 : dir === "down" ? 2 : 3;
    for (let i = 0; i < turns; i++) rows = rotateRows(rows);
    s = build(rows, HEAD);
    headCache.set(dir, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// las rastas: un pedazo de rasta gruesa por casillero, con una cuentita cada
// tanto; la última termina en una colita. Con Red Bull, brillan.
// ---------------------------------------------------------------------------

const RASTA: Record<string, string> = { K, R: "#4A2C16", r: "#6B4225", B: "#F7D23E", b: "#E2574C", g: "#6FD3E0", G: "#8EDC66", L: "#9A6A3E" };
const BEADS = ["B", "b", "g", "G"];

const SEGMENT_V = ["..KKKK..", ".KRrRRK.", ".KRRrRK.", ".KrRRRK.", ".KRRRrK.", ".KRrRRK.", ".KRRRRK.", "..KKKK.."];
const TAIL_V = ["..KKKK..", ".KRrRRK.", ".KRRRRK.", "..KRRK..", "..KRrK..", "...KK...", "...KL...", "...KL..."];

const rastaCache = new Map<string, Sprite>();
/** un segmento: `bead` pone una cuentita del color dado; `glow` aclara (Red Bull) */
export function rastaSprite(vertical: boolean, bead: number, tail = false, glow = false): Sprite {
  const key = `${vertical}:${bead}:${tail}:${glow}`;
  let s = rastaCache.get(key);
  if (!s) {
    let rows = [...(tail ? TAIL_V : SEGMENT_V)];
    if (bead > 0 && !tail) {
      const color = BEADS[(bead - 1) % BEADS.length]!;
      rows[3] = `.KR${color}${color}RK.`;
      rows[4] = `.KR${color}${color}RK.`;
    }
    if (!vertical) rows = rotateRows(rows);
    const palette = glow ? { ...RASTA, R: "#6B4225", r: "#8A5A35", K: "#3B2314" } : RASTA;
    s = build(rows, palette);
    rastaCache.set(key, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// el cigarro, la lata de energizante (sin logo) y los piojos
// ---------------------------------------------------------------------------

const CIG: Record<string, string> = { K, W: "#F7F7F7", F: "#E8A64A", O: "#FF6A00", g: "#B9B9B9", s: "#D9D9DE" };
let cig: Sprite | null = null;
export function cigSprite(): Sprite {
  if (!cig) {
    cig = build(["....gg..", "...gsg..", "..KOK...", ".KWWK...", ".KWWK...", ".KFFK...", ".KFFK...", ".KKK...."], CIG);
  }
  return cig;
}

const CAN: Record<string, string> = { K, A: "#1E4FC2", a: "#163A8F", S: "#D9DDE3", s: "#A8AEB8", R: "#E23B4E", Y: "#F7D23E" };
let can: Sprite | null = null;
export function canSprite(): Sprite {
  if (!can) {
    can = build([".KKKKKK.", "KSsSSsSK", "KAAAAAAK", "KAYRRYAK", "KARRRRAK", "KAaAAaAK", "KSSSSSSK", ".KKKKKK."], CAN);
  }
  return can;
}

const LICE: Record<string, string> = { K, L: "#2A2A34", l: "#4B4B5C", w: "#F7F7F7", D: "#8A8A3A" };
const LICE_ROWS: [string[], string[]] = [
  ["........", ".KL..Kl.", "KLLL.lll", ".KL.....", "....KLL.", ".Kl.LLLK", "lll..KL.", "........"],
  ["........", "..KL.lK.", ".KLLL.ll", "..KL....", ".KLL....", ".LLLK.Kl", "..KL.lll", "........"],
];
const liceCache = new Map<number, Sprite>();
export function liceSprite(frame: 0 | 1): Sprite {
  let s = liceCache.get(frame);
  if (!s) {
    s = build(LICE_ROWS[frame], LICE);
    liceCache.set(frame, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// el fondo: una textura de colchón viejo, suave, con la grilla apenas marcada
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

export const MATTRESS = "#E9DFC8";
const MATTRESS_DARK = "#DCD0B4";
const GRID_LINE = "#D1C5A8";
const STAIN = "#D9CBA6";

export function backgroundRects(cols: number, rows: number): Rect[] {
  const r: Rect[] = [];
  r.push({ x: 0, y: 0, w: cols * CELL, h: rows * CELL, c: MATTRESS });
  // pespuntes en diagonal, como un acolchado
  for (let y = 0; y < rows * CELL; y += 4) {
    for (let x = (y / 4) % 2 === 0 ? 0 : 2; x < cols * CELL; x += 4) r.push({ x, y, w: 1, h: 1, c: MATTRESS_DARK });
  }
  // alguna mancha vieja
  for (const [x, y, w, h] of [
    [17, 29, 9, 6],
    [83, 101, 7, 5],
    [41, 137, 11, 4],
  ] as const) r.push({ x, y, w, h, c: STAIN });
  // la grilla
  for (let x = 0; x <= cols; x++) r.push({ x: Math.min(x * CELL, cols * CELL - 1), y: 0, w: 1, h: rows * CELL, c: GRID_LINE });
  for (let y = 0; y <= rows; y++) r.push({ x: 0, y: Math.min(y * CELL, rows * CELL - 1), w: cols * CELL, h: 1, c: GRID_LINE });
  return r;
}
