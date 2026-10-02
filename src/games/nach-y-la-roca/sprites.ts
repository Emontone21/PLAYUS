// Pixel art de "Nach y la roca": The Nach de espaldas (auriculares, gorra
// para atrás, campera oversize y mochila-parlante), las rocas, el vinilo de
// las vidas y la notita musical. Mapas de letras (games/lib/sprites), sin DOM
// ni React.

import { buildSprite as build, flipSprite, greyedSprite, OUTLINE, type Sprite } from "../lib/sprites";

export type { Sprite };
const K = OUTLINE;

/** la vista: 120 × 160 unidades */
export const FIELD_W = 120;
export const FIELD_H = 160;

const NACH_PALETTE: Record<string, string> = {
  K,
  H: "#2B2B33", // auriculares
  h: "#4A4A58",
  G: "#D9534F", // gorra
  g: "#A63A36",
  S: "#C98A5E", // piel (nuca)
  P: "#4B3FA0", // campera
  p: "#6B5FC9",
  M: "#1F1F26", // mochila
  m: "#3A3A47",
  Y: "#FFD34E", // detalle
  B: "#1B1B1F", // pantalón
  Z: "#F4F4F4", // zapatillas
  C: "#6FD3E0", // led del parlante
};

export const NACH_W = 16;
export const NACH_H = 24;

/** de espaldas: dos cuadros de caminata y uno inclinado (el espejo es el otro lado) */
const NACH_ROWS: Record<"a" | "b" | "lado", string[]> = {
  a: [
    "....KKKKKKKK....",
    "...KGGGGGGGGK...",
    "..KGGgGGGGgGGK..",
    "..KHHKGGGGKHHK..",
    "..KHhHKSSKHhHK..",
    "..KHHHKSSKHHHK..",
    "...KKKKSSKKKK...",
    "..KPPPPPPPPPPK..",
    ".KPPpPPPPPPpPPK.",
    ".KPPMMMMMMMMPPK.",
    ".KPKMmMMMMmMKPK.",
    ".KPKMMMCCMMMKPK.",
    ".KPKMmMMMMmMKPK.",
    ".KPKMMMMMMMMKPK.",
    ".KPPKKKKKKKKPPK.",
    ".KPPPPPPPPPPPPK.",
    "..KPPPPPPPPPPK..",
    "..KKKBBBBBBKKK..",
    "....KBBKKBBK....",
    "....KBBK.KBBK...",
    "....KBBK.KBBK...",
    "....KBBK.KBBK...",
    "...KZZZK.KZZZK..",
    "...KKKKK.KKKKK..",
  ],
  b: [
    "....KKKKKKKK....",
    "...KGGGGGGGGK...",
    "..KGGgGGGGgGGK..",
    "..KHHKGGGGKHHK..",
    "..KHhHKSSKHhHK..",
    "..KHHHKSSKHHHK..",
    "...KKKKSSKKKK...",
    "..KPPPPPPPPPPK..",
    ".KPPpPPPPPPpPPK.",
    ".KPPMMMMMMMMPPK.",
    ".KPKMmMMMMmMKPK.",
    ".KPKMMMCCMMMKPK.",
    ".KPKMmMMMMmMKPK.",
    ".KPKMMMMMMMMKPK.",
    ".KPPKKKKKKKKPPK.",
    ".KPPPPPPPPPPPPK.",
    "..KPPPPPPPPPPK..",
    "..KKKBBBBBBKKK..",
    "....KBBKKBBK....",
    "...KBBK..KBBK...",
    "...KBBK...KBBK..",
    "..KBBK....KBBK..",
    "..KZZZK...KZZZK.",
    "..KKKKK...KKKKK.",
  ],
  lado: [
    "......KKKKKKKK..",
    ".....KGGGGGGGGK.",
    "....KGGgGGGGgGGK",
    "....KHHKGGGGKHHK",
    "....KHhHKSSKHhHK",
    "...KHHHKSSKHHHK.",
    "...KKKKSSKKKK...",
    "..KPPPPPPPPPPK..",
    ".KPPpPPPPPPpPPK.",
    ".KPPMMMMMMMMPPK.",
    ".KPKMmMMMMmMKPK.",
    ".KPKMMMCCMMMKPK.",
    ".KPKMmMMMMmMKPK.",
    ".KPKMMMMMMMMKPK.",
    ".KPPKKKKKKKKPPK.",
    "KPPPPPPPPPPPPK..",
    "KKPPPPPPPPPPK...",
    ".KKKBBBBBBKKK...",
    "...KBBKKBBK.....",
    "...KBBK.KBBK....",
    "..KBBK..KBBK....",
    "..KBBK...KBBK...",
    ".KZZZK...KZZZK..",
    ".KKKKK...KKKKK..",
  ],
};

export type NachPose = "a" | "b" | "izq" | "der";
const nachCache = new Map<NachPose, Sprite>();
export function nachSprite(pose: NachPose): Sprite {
  let s = nachCache.get(pose);
  if (!s) {
    if (pose === "a" || pose === "b") s = build(NACH_ROWS[pose], NACH_PALETTE);
    else {
      const lado = build(NACH_ROWS.lado, NACH_PALETTE);
      s = pose === "izq" ? lado : flipSprite(lado);
    }
    nachCache.set(pose, s);
  }
  return s;
}

/** sentado en el piso, con los auriculares torcidos (el final) */
const NACH_DOWN_ROWS = [
  "................",
  "................",
  "................",
  "....KKKKKKKK....",
  "...KGGGGGGGGK...",
  "..KGGgGGGGgGGKK.",
  "..KHHKGGGGKKHHK.",
  "..KHhHKSSKKHhHK.",
  "..KHHHKSSKKHHHK.",
  "...KKKKSSKKKKK..",
  "..KPPPPPPPPPPK..",
  ".KPPpPPPPPPpPPK.",
  ".KPPMMMMMMMMPPK.",
  ".KPKMmMMMMmMKPK.",
  ".KPKMMMCCMMMKPK.",
  ".KPKMMMMMMMMKPK.",
  ".KPPKKKKKKKKPPK.",
  ".KPPPPPPPPPPPPK.",
  "KKBBBBBBBBBBBBKK",
  "KBBKKKKKKKKKKBBK",
  "KZZK........KZZK",
  "KKKK........KKKK",
  "................",
  "................",
];
let nachDown: Sprite | null = null;
export function nachDownSprite(): Sprite {
  nachDown ??= build(NACH_DOWN_ROWS, NACH_PALETTE);
  return nachDown;
}

// ---------------------------------------------------------------------------
// las rocas: tres tamaños de dibujo (todas ocupan un carril), grises con volumen
// ---------------------------------------------------------------------------

const ROCK_PALETTE: Record<string, string> = { K, R: "#7A7F8A", r: "#555A66", L: "#A3A8B3", D: "#3A3D47" };
const ROCK_ROWS: Record<0 | 1 | 2, string[]> = {
  0: ["...KKKK...", "..KLLRRK..", ".KLLRRRrK.", "KLRRRRrrK.", "KRRRrrrDK.", ".KKKKKKK.."],
  1: ["....KKKK....", "...KLLRRK...", "..KLLRRRRK..", ".KLLRRRRrrK.", ".KLRRRRrrrK.", "KRRRRrrrDDK.", "KRRrrrrDDDK.", ".KKKKKKKKK.."],
  2: ["....KKKKKK....", "...KLLLRRRK...", "..KLLLRRRRrK..", ".KLLLRRRRrrrK.", ".KLLRRRRrrrrK.", "KLRRRRRrrrDDK.", "KRRRRrrrrDDDK.", "KRRrrrrDDDDDK.", ".KKKKKKKKKKK..", ".....KKKK....."],
};
export type RockSize = 0 | 1 | 2;
const rockCache = new Map<string, Sprite>();
/** `turn` gira el dibujo de la rodante: 0 a 3 (de a cuarto de vuelta, aproximado con el espejo y el volteo) */
export function rockSprite(size: RockSize, turn: 0 | 1 | 2 | 3 = 0): Sprite {
  const key = `${size}:${turn}`;
  let s = rockCache.get(key);
  if (!s) {
    s = build(ROCK_ROWS[size], ROCK_PALETTE);
    if (turn === 1 || turn === 3) s = flipSprite(s);
    if (turn >= 2) s = { ...s, px: s.px.map((p) => ({ ...p, y: s!.h - 1 - p.y })) };
    rockCache.set(key, s);
  }
  return s;
}

/** los pedazos al romperse: piedritas de 2 × 2 */
export const ROCK_PIECE: Sprite = build(["KR", "rK"], ROCK_PALETTE);

// ---------------------------------------------------------------------------
// el vinilo de las vidas (9 × 9) y la notita musical (5 × 7)
// ---------------------------------------------------------------------------

const VINYL_ROWS = ["..KKKKK..", ".KBBBBBK.", "KBBbBbBBK", "KBbBBBbBK", "KBBBYBBBK", "KBbBBBbBK", "KBBbBbBBK", ".KBBBBBK.", "..KKKKK.."];
const VINYL_PALETTE: Record<string, string> = { K, B: "#1B1B1F", b: "#3A3A47", Y: "#FFD34E" };
let vinyl: Sprite | null = null;
export function vinylSprite(): Sprite {
  vinyl ??= build(VINYL_ROWS, VINYL_PALETTE);
  return vinyl;
}
let vinylOff: Sprite | null = null;
export function vinylOffSprite(): Sprite {
  vinylOff ??= greyedSprite(vinylSprite());
  return vinylOff;
}

const NOTE_ROWS = ["...KK", "...KK", "...K.", "...K.", ".KKK.", "KKKK.", ".KK.."];
let note: Sprite | null = null;
export function noteSprite(): Sprite {
  note ??= build(NOTE_ROWS, { K: "#FFD34E" });
  return note;
}
