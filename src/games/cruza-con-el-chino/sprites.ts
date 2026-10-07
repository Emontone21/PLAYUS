// Pixel art de "Cruza con el chino": los vehículos de costado (moto con su
// motoquero, dos modelos de auto y el sunny rojo, colectivo con ventanillas y
// cartel, el tren), el semáforo de la vía, el árbol y el banco de la vereda, y
// el cartel de los carriles. La rana de atrás viene de games/lib/frog y El
// chino montado de games/lib/chino. Mapas de letras, sin DOM.

import { buildSprite as build, composeSprite, flipSprite, OUTLINE, type Sprite } from "../lib/sprites";
import { chinoRiderSprite, chinoSeatedSprite } from "../lib/chino";
import { frogBackSprite, type FrogBackPose } from "../lib/frog";

export type { Sprite };
const K = OUTLINE;

/** la vista: 9 celdas de 16 unidades de ancho, 10 carriles de 16 de alto */
export const CELL = 16;
export const FIELD_W = 9 * CELL;
export const FIELD_H = 10 * CELL;
/** la fila de la rana en la vista: la tercera desde abajo */
export const FROG_VIEW_ROW = 3;

export const PALETTE = {
  road: "#2A2D3A",
  roadLine: "#6B6F80",
  curb: "#8A8F99",
  tile: "#CFC9B8",
  tileLine: "#B5AE9C",
  gravel: "#5A5146",
  rail: "#9A9A9A",
  sleeper: "#4A3A2A",
  sign: "#F7FFF2",
  signPost: "#6B4226",
} as const;

// ---------------------------------------------------------------------------
// la rana con El chino arriba (16 × 22)
// ---------------------------------------------------------------------------

export const RIDER_W = 16;
export const RIDER_H = 22;
const riderCache = new Map<string, Sprite>();
/** la rana con El chino a caballito; en el aire se estira y él se agarra fuerte */
export function riderSprite(pose: FrogBackPose): Sprite {
  let s = riderCache.get(pose);
  if (!s) {
    const frog = frogBackSprite(pose);
    const chino = chinoRiderSprite(pose === "estirada" || pose === "achatada");
    // El chino va sentado sobre el lomo: sus piernas cuelgan por los costados
    s = composeSprite(RIDER_W, RIDER_H, [
      { sprite: frog, x: 0, y: 10 },
      { sprite: chino, x: 0, y: pose === "estirada" ? 1 : pose === "achatada" ? 3 : 2 },
    ]);
    riderCache.set(pose, s);
  }
  return s;
}
export { chinoSeatedSprite, frogBackSprite };

// ---------------------------------------------------------------------------
// vehículos, mirando a la derecha (se reflejan para los que van a la izquierda)
// ---------------------------------------------------------------------------

const MOTO_ROWS = [
  "......KKK.......",
  ".....KHHHK......",
  ".....KSSSK......",
  "....KKJJJKK.....",
  "...KJJJJJJJK....",
  "..KKKJJKJJKKK...",
  ".KMMMKKKKKMMMKK.",
  "KMMMMMMMMMMMMMMK",
  ".KKRKKKKKKKKRKK.",
  "..KKK......KKK..",
];
const MOTO_PALETTES = [
  { K, H: "#2B1D12", S: "#E0A67A", J: "#3B5BA5", M: "#C0392B", R: "#1B1B1B" },
  { K, H: "#111111", S: "#C98A5E", J: "#2E7F52", M: "#2E86C1", R: "#1B1B1B" },
];
const AUTO_ROWS = [
  "........KKKKKKKKKKKKKK..........",
  ".......KBBBBBBBBBBBBBBK.........",
  "......KBBKWWWWWKWWWWKBBK........",
  ".....KBBBKWWWWWKWWWWKBBBK.......",
  "KKKKKBBBBKKKKKKKKKKKKBBBBKKKKKK.",
  "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
  "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBYK",
  "KRBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
  "KBBBKKKKBBBBBBBBBBBBBBBKKKKBBBBK",
  "KKKKTTTTKKKKKKKKKKKKKKKTTTTKKKK.",
  "...KTGGTK.............KTGGTK....",
  "....KKKK...............KKKK.....",
];
const AUTO_PALETTES = [
  { K, B: "#3F7FCB", W: "#BFE3FF", Y: "#FFD34E", R: "#FF3B30", T: "#1B1B1B", G: "#8A8F99" },
  { K, B: "#F2C94C", W: "#BFE3FF", Y: "#FFD34E", R: "#FF3B30", T: "#1B1B1B", G: "#8A8F99" },
  // el sunny rojo
  { K, B: "#C0392B", W: "#1B2432", Y: "#FFD34E", R: "#FF3B30", T: "#1B1B1B", G: "#C9CED6" },
];
function busRows(len: number): string[] {
  const w = len * CELL;
  const win = "KWWWK";
  const rows: string[] = [];
  rows.push("." + "K".repeat(w - 2) + ".");
  rows.push("K" + "C".repeat(w - 2) + "K");
  // el cartel de destino adelante (a la derecha) y las ventanillas
  let r2 = "K";
  let r3 = "K";
  for (let x = 1; x < w - 1; x++) {
    const inWin = (x - 2) % 6 < 5 && x >= 2 && x < w - 9;
    const inSign = x >= w - 8 && x < w - 2;
    r2 += inWin ? win[(x - 2) % 6]! : inSign ? "S" : "C";
    r3 += inWin ? win[(x - 2) % 6]! : inSign ? "S" : "C";
  }
  rows.push(r2 + "K", r3 + "K", r3 + "K");
  rows.push("K" + "C".repeat(w - 2) + "K");
  rows.push("K" + "c".repeat(w - 2) + "K");
  rows.push("K" + "c".repeat(w - 2) + "K");
  rows.push("KR" + "c".repeat(w - 4) + "YK");
  let r9 = "K";
  for (let x = 1; x < w - 1; x++) r9 += (x >= 3 && x < 9) || (x >= w - 10 && x < w - 4) ? "T" : "K";
  rows.push(r9 + "K");
  let r10 = ".";
  for (let x = 1; x < w - 1; x++) r10 += (x >= 3 && x < 9) || (x >= w - 10 && x < w - 4) ? "T" : ".";
  rows.push(r10 + ".");
  let r11 = ".";
  for (let x = 1; x < w - 1; x++) r11 += (x >= 4 && x < 8) || (x >= w - 9 && x < w - 5) ? "K" : ".";
  rows.push(r11 + ".");
  return rows;
}
const BUS_PALETTES = [
  { K, C: "#F0F0F0", c: "#D0D0D0", W: "#7FB3D5", S: "#FFD34E", R: "#FF3B30", Y: "#FFD34E", T: "#1B1B1B" },
  { K, C: "#E67E22", c: "#C8671A", W: "#7FB3D5", S: "#F7FFF2", R: "#FF3B30", Y: "#FFD34E", T: "#1B1B1B" },
];
function trainRows(): string[] {
  const w = FIELD_W;
  const rows: string[] = [];
  rows.push("K".repeat(w));
  rows.push("K" + "G".repeat(w - 2) + "K");
  let r2 = "K";
  for (let x = 1; x < w - 1; x++) r2 += x % 8 < 5 ? "W" : "G";
  rows.push(r2 + "K", r2 + "K");
  rows.push("K" + "G".repeat(w - 2) + "K");
  rows.push("K" + "g".repeat(w - 2) + "K");
  rows.push("K" + "Y".repeat(w - 2) + "K");
  rows.push("K" + "g".repeat(w - 2) + "K");
  rows.push("K".repeat(w));
  let r9 = "";
  for (let x = 0; x < w; x++) r9 += x % 16 < 4 || x % 16 >= 12 ? "." : "T";
  rows.push(r9);
  return rows;
}

const vehCache = new Map<string, Sprite>();
export type VehicleLook = { kind: "moto" | "auto" | "colectivo"; len: number; look: number };
export function vehicleSprite(v: VehicleLook, dir: 1 | -1): Sprite {
  const key = `${v.kind}:${v.len}:${v.look}:${dir}`;
  let s = vehCache.get(key);
  if (!s) {
    if (v.kind === "moto") s = build(MOTO_ROWS, MOTO_PALETTES[v.look % 2]!);
    else if (v.kind === "auto") s = build(AUTO_ROWS, AUTO_PALETTES[Math.min(2, v.look)]!);
    else s = build(busRows(v.len), BUS_PALETTES[v.look % 2]!);
    if (dir === -1) s = flipSprite(s);
    vehCache.set(key, s);
  }
  return s;
}
let train: Sprite | null = null;
export function trainSprite(): Sprite {
  train ??= build(trainRows(), { K, G: "#3C4A5A", g: "#2C3744", W: "#9ED3F0", Y: "#FFD34E", T: "#1B1B1B" });
  return train;
}

/** el semáforo de la vía (6 × 12): apagado o en rojo */
const SEMAPHORE_ROWS = ["..KK..", ".KLLK.", ".KLLK.", "..KK..", "..KK..", ".KPPK.", ".KPPK.", "..KK..", "..PP..", "..PP..", "..PP..", ".KKKK."];
const semCache = new Map<string, Sprite>();
export function semaphoreSprite(on: boolean): Sprite {
  const key = on ? "on" : "off";
  let s = semCache.get(key);
  if (!s) {
    s = build(SEMAPHORE_ROWS, { K, L: on ? "#FF3B30" : "#4A1F1F", P: "#3A3D47" });
    semCache.set(key, s);
  }
  return s;
}

/** un árbol (10 × 14) y un banco (12 × 7) de la vereda */
const TREE_ROWS = ["...KKKK...", "..KGGGGK..", ".KGGgGGGK.", "KGGGGGGgGK", "KGgGGGGGGK", ".KGGGgGGK.", "..KGGGGK..", "...KKKK...", "....KTK...", "....KTK...", "....KTK...", "...KTTTK..", "..KKKKKKK.", ".........."];
let tree: Sprite | null = null;
export function treeSprite(): Sprite {
  tree ??= build(TREE_ROWS, { K, G: "#4E7A3A", g: "#6AA34C", T: "#6B4226" });
  return tree;
}
const BENCH_ROWS = ["KKKKKKKKKKKK", "KBBBBBBBBBBK", "KKKKKKKKKKKK", "KBBBBBBBBBBK", "KKKKKKKKKKKK", ".KK......KK.", ".KK......KK."];
let bench: Sprite | null = null;
export function benchSprite(): Sprite {
  bench ??= build(BENCH_ROWS, { K, B: "#8B5A2B" });
  return bench;
}
