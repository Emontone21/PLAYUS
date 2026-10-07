// Pixel art de "fumate algo chino": la mano con la gomera, la manga de viento
// y el cigarro. El chino (con sus cuatro caras) está en games/lib/chino,
// compartido. Mapas de letras (games/lib/sprites), sin DOM ni React.

import { buildSprite as build, flipSprite, OUTLINE, type Sprite } from "../lib/sprites";

export type { Sprite };
const K = OUTLINE;

/** la vista: 270 × 120 unidades (se juega en horizontal) */
export const FIELD_W = 270;
export const FIELD_H = 120;

// El chino vive en games/lib/chino (decisión 258): lo comparte "Cruza con el chino"
export { chinoSprite, CHINO_H, CHINO_W, type Face } from "../lib/chino";

/** la bocanada de humo, 10 × 6 */
const PUFF_ROWS = ["...WW.....", ".WWWWWW...", "WWWWWWWW..", ".WWWWWWWW.", "...WWWW.W.", "....WW...."];
let puff: Sprite | null = null;
export function puffSprite(): Sprite {
  puff ??= build(PUFF_ROWS, { W: "#D9D9D9" });
  return puff;
}

// ---------------------------------------------------------------------------
// la mano con la gomera (12 × 14), el cigarro (6 × 2) y la manga de viento
// ---------------------------------------------------------------------------

const HAND_PALETTE: Record<string, string> = { K, S: "#C98A5E", G: "#8B5A2B", g: "#5E3A1A", B: "#D9534F" };
const HAND_ROWS = [
  "KK......KK..",
  "KGK....KGK..",
  "KGK....KGK..",
  ".KGK..KGK...",
  "..KGKKGK....",
  "...KGgK.....",
  "...KGgK.....",
  "..KKGgKK....",
  ".KSSGgSSK...",
  "KSSSGgSSSK..",
  "KSSSSSSSSK..",
  "KSSSSSSSSK..",
  ".KSSSSSSK...",
  "..KKKKKK....",
];
export const HAND_W = 12;
export const HAND_H = 14;
let hand: Sprite | null = null;
export function handSprite(): Sprite {
  hand ??= build(HAND_ROWS, HAND_PALETTE);
  return hand;
}

/** el cigarro: blanco con filtro naranja y la brasa (6 × 2) */
const CIG_ROWS = ["KKKKKK", "oWWWFF"];
let cig: Sprite | null = null;
export function cigaretteSprite(): Sprite {
  cig ??= build(CIG_ROWS, { K, W: "#F7F2E8", F: "#E8862A", o: "#FF6A00" });
  return cig;
}

/** la manga de viento en su poste: la manga apunta a la derecha, se refleja para la izquierda; `fill` 1 a 3 según la fuerza */
const SOCK_PALETTE: Record<string, string> = { K, R: "#FF6F91", W: "#F4F4F4", P: "#3A3D47" };
const SOCK_ROWS: Record<1 | 2 | 3, string[]> = {
  1: ["KKRRK.......", "KRRWWK......", "KKRRK.......", ".KPK........", ".KPK........", ".KPK........", ".KPK........", ".KPK........", "KKPKK......."],
  2: ["KKRRRWK.....", "KRRRWWRK....", "KKRRRWK.....", ".KPK........", ".KPK........", ".KPK........", ".KPK........", ".KPK........", "KKPKK......."],
  3: ["KKRRRWWRRK..", "KRRRRWWRRRRK", "KKRRRWWRRK..", ".KPK........", ".KPK........", ".KPK........", ".KPK........", ".KPK........", "KKPKK......."],
};
const sockCache = new Map<string, Sprite>();
export function sockSprite(fill: 1 | 2 | 3, toRight: boolean): Sprite {
  const key = `${fill}:${toRight}`;
  let s = sockCache.get(key);
  if (!s) {
    s = build(SOCK_ROWS[fill], SOCK_PALETTE);
    if (!toRight) s = flipSprite(s);
    sockCache.set(key, s);
  }
  return s;
}
