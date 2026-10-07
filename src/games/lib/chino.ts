// El chino, compartido por "fumate algo chino" y "Cruza con el chino": un
// pibe de barrio con ropa gastada (remera con agujeritos, campera desteñida,
// jean roto en las rodillas y zapatillas gastadas); rasgos comunes, sin
// estereotipos: el apodo es solo el nombre. De frente con cuatro caras
// (16 × 32), y montado de atrás, a caballito (16 × 16), agarrándose fuerte
// o no. Mapas de letras, sin DOM.

import { buildSprite as build, OUTLINE, type Sprite } from "./sprites";

const K = OUTLINE;

export type Face = "espera" | "adentro" | "casi" | "quehaces";

export const CHINO_PALETTE: Record<string, string> = {
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


// ---------------------------------------------------------------------------
// El chino montado, visto de atrás (16 × 16): la nuca con el pelo, la campera
// desteñida con los brazos a los costados o abrazando fuerte, y las piernas
// con el jean roto colgando a los lados de la rana
// ---------------------------------------------------------------------------

export const RIDER_W = 16;
export const RIDER_H = 16;

const RIDER_ROWS: Record<"suelto" | "agarrado", string[]> = {
  suelto: [
    ".....KKKKKK.....",
    "....KHHHHHHK....",
    "....KHHHHHHK....",
    "....KHHHHHHK....",
    ".....KSSSSK.....",
    "...KKCCCCCCKK...",
    "..KCCCCcCCCCCK..",
    ".KCCKCCCCCCKCCK.",
    ".KCCKCcCCCCKCCK.",
    ".KSSKCCCCCCKSSK.",
    ".KKKKJJJJJJKKKK.",
    "....KJjJJjJK....",
    "...KJJKKKKJJK...",
    "...KRRK..KRRK...",
    "...KZZK..KZZK...",
    "...KKKK..KKKK...",
  ],
  agarrado: [
    ".....KKKKKK.....",
    "....KHHHHHHK....",
    "....KHHHHHHK....",
    "....KHHHHHHK....",
    ".....KSSSSK.....",
    "...KKCCCCCCKK...",
    ".KKCCCCcCCCCCKK.",
    "KCCKCCCCCCCCKCCK",
    "KSSKCcCCCCCCKSSK",
    "KKKKCCCCCCCCKKKK",
    "....KJJJJJJK....",
    "...KJjJJJJjJK...",
    "..KJJKKKKKKJJK..",
    "..KRRK....KRRK..",
    "..KZZK....KZZK..",
    "..KKKK....KKKK..",
  ],
};
const riderCache = new Map<string, Sprite>();
export function chinoRiderSprite(hold: boolean): Sprite {
  const key = hold ? "agarrado" : "suelto";
  let s = riderCache.get(key);
  if (!s) {
    s = build(RIDER_ROWS[key], CHINO_PALETTE);
    riderCache.set(key, s);
  }
  return s;
}

/** El chino sentado en el piso, de frente, después de salir volando (16 × 20) */
const SEATED_ROWS = [
  "....KKKKKKKK....",
  "...KHHHHHHHHK...",
  "...KHHHHHHHHK...",
  "...KHSSSSSSHK...",
  "...KSSSSSSSSK...",
  "...KSEESSEESK...",
  "...KSSSSSSSSK...",
  "...KSSKmmKSSK...",
  "....KSSSSSSK....",
  "..KKKCCKKKKCCKKK",
  ".KCCCCCKTTTKCCCK",
  "KSKCCCCKTtTKCCKSK".slice(0, 16),
  "KSKCCCCKTTTKCCKS",
  "KKKKJJJJJJJJJKKK",
  "..KJJJJJJJJJJJK.",
  ".KJJjJKKKKKjJJJK",
  "KRRJJK.....KJRRK",
  "KZZZK.......KZZK",
  "KzzzK.......KzzK",
  "KKKKK.......KKKK",
];
let seated: Sprite | null = null;
export function chinoSeatedSprite(): Sprite {
  seated ??= build(SEATED_ROWS, CHINO_PALETTE);
  return seated;
}
