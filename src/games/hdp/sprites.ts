// Pixel art de "hij@ de p**": las hamburguesas en cada estado, las flechas,
// la espátula, el humo y el dedo de la previa. Big Bro es el mismo chef de
// clase con el bro (se importa su sprite). Mapas de letras, sin DOM.

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";
import { BRO_PARTS, broSprite as claseBro } from "../clase-con-el-bro/sprites";

export type { Sprite };
export { BRO_H, BRO_W } from "../clase-con-el-bro/sprites";

const K = OUTLINE;

/**
 * Las caras de Big Bro en hdp: espera (brazos cruzados) y contento (pulgar
 * arriba) son las de clase con el bro; enojado es la cara roja con los
 * brazos cruzados (sin la cuchilla), y grita es la cara roja señalando la
 * plancha con el brazo estirado a la izquierda.
 */
export type BroMood = "espera" | "contento" | "enojado" | "grita";

function pointingBody(): string[] {
  const rows = BRO_PARTS.BODY.espera.map((r) => r.split(""));
  // sin los brazos cruzados
  for (let y = 4; y <= 6; y++) for (let x = 8; x <= 32; x++) rows[y]![x] = "W";
  // el brazo estirado hacia la plancha, con el índice
  const ARM = ["KKKKKK", "SSSSWW", "KSSSWW", ".KKKKK"];
  ARM.forEach((line, dy) => line.split("").forEach((c, dx) => c !== "." && (rows[2 + dy]![dx] = c)));
  return rows.map((r) => r.join(""));
}

const hdpBroCache = new Map<BroMood, Sprite>();
export function broSprite(mood: BroMood): Sprite {
  if (mood === "espera" || mood === "contento") return claseBro(mood);
  let s = hdpBroCache.get(mood);
  if (!s) {
    const body = mood === "grita" ? pointingBody() : BRO_PARTS.BODY.espera;
    s = build([...BRO_PARTS.HAT, ...BRO_PARTS.FACE.enojado, ...body], BRO_PARTS.PALETTE);
    hdpBroCache.set(mood, s);
  }
  return s;
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

export const PATTY_W = 16;
export const PATTY_H = 9;
export type PattyLook = "cruda" | "dorando1" | "dorando2" | "dorando3" | "quemada";
export const PATTY_LOOKS: readonly PattyLook[] = ["cruda", "dorando1", "dorando2", "dorando3", "quemada"];

const PATTY_ROWS = ["...KKKKKKKKKK...", ".KKxxxxxxxxxxKK.", "KxxxxxxxxxxxxxxK", "KxxyxxxxxxxxyxxK", "KxxxxxxyyxxxxxxK", "KxyxxxxxxxxxxyxK", "KxxxxxxxxxxxxxxK", ".KKxxxxxxxxxxKK.", "...KKKKKKKKKK..."];
const PATTY_COLORS: Record<PattyLook, { x: string; y: string }> = {
  cruda: { x: "#E89A9A", y: "#D27F7F" },
  dorando1: { x: "#D08868", y: "#B57052" },
  dorando2: { x: "#A95A38", y: "#8E4A2C" },
  dorando3: { x: "#7E3E22", y: "#653018" },
  quemada: { x: "#221E1C", y: "#0F0D0C" },
};
const pattyCache = new Map<PattyLook, Sprite>();
export function pattySprite(look: PattyLook): Sprite {
  let s = pattyCache.get(look);
  if (!s) {
    s = build(PATTY_ROWS, { K, ...PATTY_COLORS[look] });
    pattyCache.set(look, s);
  }
  return s;
}

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

/** el "hdp" del cartel de neón, en minúscula con la p colgando (11 × 7); la fuente compartida no tiene descendentes */
const NEON_ROWS = ["K.....K....", "K.....K....", "KKK.KKK.KKK", "K.K.K.K.K.K", "K.K.KKK.KKK", "........K..", "........K.."];
const neonCache = new Map<string, Sprite>();
export function neonSprite(color: string): Sprite {
  let s = neonCache.get(color);
  if (!s) {
    s = build(NEON_ROWS, { K: color });
    neonCache.set(color, s);
  }
  return s;
}
