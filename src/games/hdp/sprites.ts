// Pixel art de "hij@ de p**": las hamburguesas en cada estado, las flechas,
// la espátula, el humo y el dedo de la previa. Big Bro y la cocina vienen de
// games/lib (big-bro, hdp-kitchen). Mapas de letras, sin DOM.

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";
import { BIG_BRO_H, BIG_BRO_W, bigBroSprite } from "../lib/big-bro";

export type { Sprite };
export const BRO_W = BIG_BRO_W;
export const BRO_H = BIG_BRO_H;

const K = OUTLINE;

/** las caras de Big Bro en hdp (games/lib/big-bro): espera, contento, enojado (brazos cruzados) y grita (señalando) */
export type BroMood = "espera" | "contento" | "enojado" | "grita";
export function broSprite(mood: BroMood): Sprite {
  return bigBroSprite(mood);
}

/** la vista: 144 × 184 unidades, en vertical */
export const FIELD_W = 144;
export const FIELD_H = 184;

/** la plancha y sus cuatro lugares (unidades de la vista): ocupa la mitad de abajo, casi todo el ancho */
export const GRIDDLE = { x: 4, y: 88, w: 136, h: 92 };
/** la línea que separa las dos columnas y las dos filas */
export const SPLIT_X = 72;
export const SPLIT_Y = 134;
/** el centro de cada cuadrante: 0 arriba izquierda, 1 arriba derecha, 2 abajo izquierda, 3 abajo derecha */
export const SLOT_CENTERS: readonly [number, number][] = [
  [38, 111],
  [106, 111],
  [38, 157],
  [106, 157],
];
/** la hamburguesa, la flecha, la espátula y el humo se dibujan al doble */
export const ZOOM = 2;

export { PATTY_H, PATTY_LOOKS, PATTY_W, pattySprite, type PattyLook } from "../lib/hdp-kitchen";

/** la flecha, 9 × 9, en --luciernaga con contorno oscuro */
export const ARROW = 9;
const ARROW_UP = ["....K....", "...KYK...", "..KYYYK..", ".KYYYYYK.", "KYYKYKYYK", "KKKKYKKKK", "...KYK...", "...KYK...", "...KKK..."];
export const LUCIERNAGA = "#FFD34E";
export const LENGUA = "#FF6F91";

function rotateRows(rows: readonly string[], dir: "up" | "down" | "left" | "right"): string[] {
  if (dir === "up") return [...rows];
  if (dir === "down") return [...rows].reverse();
  // izquierda: la columna x pasa a ser la fila x, leída de arriba abajo
  const n = rows.length;
  const out: string[] = [];
  for (let y = 0; y < n; y++) {
    let line = "";
    for (let x = 0; x < n; x++) line += dir === "left" ? rows[x]![y]! : rows[n - 1 - x]![y]!;
    out.push(line);
  }
  return out;
}
const arrowCache = new Map<string, Sprite>();
export function arrowSprite(dir: "up" | "down" | "left" | "right"): Sprite {
  let s = arrowCache.get(dir);
  if (!s) {
    s = build(rotateRows(ARROW_UP, dir), { K, Y: LUCIERNAGA });
    arrowCache.set(dir, s);
  }
  return s;
}

/** la espátula, horizontal (12 × 5); para los giros verticales se usa la rotada */
const SPATULA_ROWS = ["KKKKKKK.....", "KSSSSSSKKKKK", "KSSSSSSKHHHK", "KSSSSSSKKKKK", "KKKKKKK....."];
let spatula: Sprite | null = null;
export function spatulaSprite(): Sprite {
  spatula ??= build(SPATULA_ROWS, { K, S: "#C9CED6", H: "#6B4226" });
  return spatula;
}
let spatulaV: Sprite | null = null;
export function spatulaSpriteVertical(): Sprite {
  spatulaV ??= build(rotateRows(SPATULA_ROWS.map((r) => r.padEnd(12, ".")).concat(Array(7).fill("............")), "left").map((r) => r.slice(0, 5)), { K, S: "#C9CED6", H: "#6B4226" });
  return spatulaV;
}

const PUFF_ROWS = [".WW..", "WWWW.", ".WWWW", "..WW."];
const puffCache = new Map<string, Sprite>();
export function puffSprite(color = "#B8B8B8"): Sprite {
  let s = puffCache.get(color);
  if (!s) {
    s = build(PUFF_ROWS, { W: color });
    puffCache.set(color, s);
  }
  return s;
}

/** el dedo de la previa (8 × 14), apuntando hacia arriba */
const FINGER_ROWS = ["...KK...", "..KSSK..", "..KSSK..", "..KSSK..", ".KKSSKK.", "KSSSSSSK", "KSSSSSSK", "KSSSSSSK", ".KSSSSK.", ".KSSSSK.", ".KSSSSK.", "..KSSK..", "..KSSK..", "..KKKK.."];
let finger: Sprite | null = null;
export function fingerSprite(): Sprite {
  finger ??= build(FINGER_ROWS, { K, S: "#E0A67A" });
  return finger;
}
