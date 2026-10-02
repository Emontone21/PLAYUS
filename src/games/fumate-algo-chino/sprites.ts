// Pixel art de "fumate algo chino": El chino (un pibe de barrio con ropa
// gastada: remera con agujeritos, campera desteñida, jean roto en las
// rodillas y zapatillas gastadas; rasgos comunes, sin estereotipos: el apodo
// es solo el nombre), con cuatro caras; la mano con la gomera; la manga de
// viento; el cigarro. Mapas de letras (games/lib/sprites), sin DOM ni React.

import { buildSprite as build, flipSprite, OUTLINE, type Sprite } from "../lib/sprites";

export type { Sprite };
const K = OUTLINE;

/** la vista: 160 × 90 unidades */
export const FIELD_W = 160;
export const FIELD_H = 90;

export type Face = "espera" | "adentro" | "casi" | "quehaces";

const CHINO_PALETTE: Record<string, string> = {
  K,
  H: "#2B2118", // pelo
  S: "#C98A5E", // piel
  E: "#1B1B1F", // ojos
  M: "#6B2E2E", // boca abierta
  m: "#B5524A", // labios
  T: "#7A8F6B", // remera desteñida
  t: "#5E7052", // agujeritos de la remera
  C: "#4E5F8A", // campera desteñida
  c: "#3A4869",
  J: "#4A5D8A", // jean
  j: "#2E3A57",
  R: "#C98A5E", // rodilla (jean roto)
  Z: "#A89F91", // zapatillas gastadas
  z: "#6F675C",
  W: "#F4F4F4", // dientes / humo
  U: "#E8B07A", // pulgar
};

export const CHINO_W = 16;
export const CHINO_H = 32;

/** las filas del cuerpo (desde el cuello hacia abajo), comunes a todas las caras */
const BODY_ROWS = [
  "....KCCKKKKCCK..",
  "...KCCCKTTTKCCK.",
  "...KCcCKTtTKCcCK",
  "...KCCCKTTTKCCCK",
  "..KSKCCKTtTKCCKS",
  "..KSKCCKTTTKCCKS",
  "..KKKCCKTTtKCCKK",
  ".....KJJJJJJJK..",
  ".....KJjJJJjJK..",
  ".....KJJJKJJJK..",
  ".....KJJJKJJJK..",
  ".....KRRJKJRRK..",
  ".....KRRJKJRRK..",
  ".....KJJJKJJJK..",
  ".....KJjJKJjJK..",
  ".....KJJJKJJJK..",
  "....KZZZKKZZZK..",
  "....KzzzK.KzzzK.",
  "....KKKKK.KKKKK.",
];

/** la cabeza (13 filas), por cara */
const HEAD_ROWS: Record<Face, string[]> = {
  espera: [
    "....KKKKKKKK....",
    "...KHHHHHHHHK...",
    "...KHHHHHHHHK...",
    "...KHSSSSSSHK...",
    "...KSSSSSSSSK...",
    "...KSEESSEESK...",
    "...KSSSSSSSSK...",
    "...KSSKMMKSSK...",
    "...KSKMMMMKSK...",
    "...KSKMMMMKSK...",
    "...KSSKmmKSSK...",
    "....KSSSSSSK....",
    ".....KKKKKK.....",
  ],
  adentro: [
    "....KKKKKKKK....",
    "...KHHHHHHHHK...",
    "...KHHHHHHHHK...",
    "...KHSSSSSSHK...",
    "...KSSSSSSSSK...",
    "...KSEESSEESK...",
    "...KSSSSSSSSK...",
    "...KSSSSSSSSK...",
    "...KSSmKKmSSK...",
    "...KSSSmmSSSK...",
    "...KSSSSSSSSK...",
    "....KSSSSSSK....",
    ".....KKKKKK.....",
  ],
  casi: [
    "....KKKKKKKK....",
    "...KHHHHHHHHK...",
    "...KHHHHHHHHK...",
    "...KHSSSSSSHK...",
    "...KSKEKSKEKK...",
    "...KSEWESEWESK..".slice(0, 16),
    "...KSKEKSKEKK...",
    "...KSSSSSSSSK...",
    "...KSSKMMKSSK...",
    "...KSKMMMMKSK...",
    "...KSSKmmKSSK...",
    "....KSSSSSSK....",
    ".....KKKKKK.....",
  ],
  quehaces: [
    "....KKKKKKKK....",
    "...KHHHHHHHHK...",
    "...KHHHHHHHHK...",
    "...KHSSSSSSHK...",
    "...KSKKSSSKKSK..".slice(0, 16),
    "...KSEESSEESK...",
    "...KSSSSSSSSK...",
    "...KSSSSSSSSK...",
    "...KSSmmmmSSK...",
    "...KSmSSSSmSK...",
    "...KSSSSSSSSK...",
    "....KSSSSSSK....",
    ".....KKKKKK.....",
  ],
};

const chinoCache = new Map<Face, Sprite>();
export function chinoSprite(face: Face): Sprite {
  let s = chinoCache.get(face);
  if (!s) {
    const body = [...BODY_ROWS];
    if (face === "adentro") {
      // levanta el pulgar: el brazo derecho (a la izquierda del dibujo) sube
      body[4] = "..KUKCCKTtTKCCKS";
      body[3] = "..KUKCCKTTTKCCCK";
      body[5] = "..KSKCCKTTTKCCKS";
    }
    s = build([...HEAD_ROWS[face], ...body], CHINO_PALETTE);
    chinoCache.set(face, s);
  }
  return s;
}

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
