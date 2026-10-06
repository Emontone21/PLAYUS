// The Nach y su calle, compartidos por "Nach y la roca" (de espaldas) y
// "Nach salta" (de costado): la paleta de su ropa (auriculares grandes, gorra
// para atrás, campera oversize y la mochila-bandeja de DJ), sus sprites de
// espaldas y de costado, las rocas grises con volumen y la paleta de la calle
// de noche con sus neones. Mapas de letras, sin DOM.

import { buildSprite as build, flipSprite, OUTLINE, type Sprite } from "./sprites";

const K = OUTLINE;

export const NACH_PALETTE: Record<string, string> = {
  K,
  H: "#2B2B33", // auriculares
  h: "#4A4A58",
  G: "#D9534F", // gorra
  g: "#A63A36",
  S: "#C98A5E", // piel
  E: "#1B1B1F", // ojo
  P: "#4B3FA0", // campera
  p: "#6B5FC9",
  M: "#1F1F26", // mochila
  m: "#3A3A47",
  Y: "#FFD34E", // detalle
  B: "#1B1B1F", // pantalón
  Z: "#F4F4F4", // zapatillas
  C: "#6FD3E0", // led del parlante
};

/** la calle de noche: cielo, asfalto, cordón, edificios, ventanas y los neones */
export const STREET = {
  sky: "#0B1020",
  road: "#2A2D3A",
  roadFar: "#1C1F2A",
  line: "#6B6F80",
  curb: "#3C4050",
  building: "#151826",
  building2: "#1C2033",
  window: "#3A3F55",
  lamp: "#3A3D47",
  neons: ["#FF6F91", "#6FD3E0", "#FFD34E", "#8EDC66", "#C58CFF"],
} as const;

// ---------------------------------------------------------------------------
// The Nach de espaldas (16 × 24): dos cuadros de caminata y uno inclinado
// ---------------------------------------------------------------------------

export const NACH_W = 16;
export const NACH_H = 24;

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
/** de espaldas */
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

/** de espaldas, sentado en el piso con los auriculares torcidos (el final de "Nach y la roca") */
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
// The Nach de costado, mirando a la derecha (16 de ancho): la gorra para atrás
// (la visera apunta a la espalda), el auricular grande sobre la oreja, la
// campera oversize y la mochila-bandeja de DJ en la espalda
// ---------------------------------------------------------------------------

const SIDE_TOP = [
  "......KKKKK.....",
  ".....KGGgGGK....",
  "...KKGGGGGGGK...",
  "..KggKKKKSSSK...",
  ".....KHHKSSSSK..",
  ".....KHhKSSESK..",
  ".....KHHKSSSSK..",
  "......KKKSSSK...",
  "...KKKKPPPPPK...",
  "..KMMMKPPpPPPK..",
  "..KMYMKPPPPPPK..",
  "..KMMMKPPpPPSK..",
  "..KMCMKPPPPPKK..",
  "..KMMMKPPPPPK...",
  "...KKKKPPPPPK...",
  "......KPPPPPK...",
];
/** las piernas: 4 cuadros corriendo y el salto con las piernas recogidas */
const SIDE_LEGS: Record<"run0" | "run1" | "run2" | "run3" | "jump", string[]> = {
  run0: ["......KBBBK.....", ".....KBBKBBK....", "....KBBK.KBBK...", "...KBBK...KBBK..", "..KBBK.....KBK..", "..KZZK.....KZZK.", ".KZZZK.....KZZZK", ".KKKKK.....KKKKK"],
  run1: ["......KBBBK.....", "......KBBBK.....", "......KBBKBK....", "......KBBK.KBK..", "......KBBK.KZZK.", "......KBBK..KK..", ".....KZZZK......", ".....KKKKK......"],
  run2: ["......KBBBK.....", "......KBBBBK....", ".....KBBKKBBK...", "....KBBK..KBBK..", "....KBK....KBK..", "...KZZK....KZZK.", "...KZZZK...KZZZK", "...KKKKK...KKKKK"],
  run3: ["......KBBBK.....", "......KBBBK.....", ".....KBKBBK.....", "...KBK.KBBK.....", "..KZZK.KBBK.....", "...KK..KBBK.....", ".......KZZZK....", ".......KKKKK...."],
  jump: ["......KBBBBK....", ".....KBBBBBBK...", ".....KBBKKBBK...", "....KZZK.KZZK...", "....KKKK.KKKK...", "................", "................", "................"],
};
/** agachado (16 × 12): la cabeza baja y adelante, la mochila arriba */
const SIDE_DUCK = [
  "........KKKKK...",
  ".......KGGgGGK..",
  ".....KKGGGGGGGK.",
  "....KggKKKKSSSK.",
  "..KMMMKHHKSESK..",
  "..KMYMKHHKSSSK..",
  "..KMMMKKPPPPSK..",
  "..KMCMKPPPPPPK..",
  "...KKKPPPPPPK...",
  "....KBBBBBBBK...",
  "...KZZZK.KZZZK..",
  "...KKKKK.KKKKK..",
];
/** tirado en el piso después de tropezar (20 × 12), sin la gorra ni los auriculares */
const SIDE_FALL = [
  "KK..................",
  "KZK.................",
  "KZZKKK..............",
  ".KKBBBK.............",
  "...KBBBKKKKKKK......",
  "....KBBKPPPPPPKKKK..",
  ".....KKPPpPPPKSSSSK.",
  "......KMMMMMKKSESSK.",
  "......KMYMCMK.KSSK..",
  "......KKKKKKK..KK...",
  "....................",
  "....................",
];
/** los auriculares que salen volando al chocar (7 × 5) */
const HEADPHONES = ["..KKK..", ".K...K.", "KHK.KHK", "KhK.KhK", "KKK.KKK"];

export type NachSidePose = "run0" | "run1" | "run2" | "run3" | "jump" | "duck" | "fall";
export const NACH_SIDE_POSES: readonly NachSidePose[] = ["run0", "run1", "run2", "run3", "jump", "duck", "fall"];
const sideCache = new Map<NachSidePose, Sprite>();
/** de costado, mirando a la derecha */
export function nachSideSprite(pose: NachSidePose): Sprite {
  let s = sideCache.get(pose);
  if (!s) {
    const rows = pose === "duck" ? SIDE_DUCK : pose === "fall" ? SIDE_FALL : [...SIDE_TOP, ...SIDE_LEGS[pose]];
    s = build(rows, NACH_PALETTE);
    sideCache.set(pose, s);
  }
  return s;
}
let headphones: Sprite | null = null;
export function headphonesSprite(): Sprite {
  headphones ??= build(HEADPHONES, NACH_PALETTE);
  return headphones;
}

// ---------------------------------------------------------------------------
// las rocas: grises con volumen; tres tamaños de "Nach y la roca" y una alta
// ---------------------------------------------------------------------------

const ROCK_PALETTE: Record<string, string> = { K, R: "#7A7F8A", r: "#555A66", L: "#A3A8B3", D: "#3A3D47" };
const ROCK_ROWS: Record<0 | 1 | 2 | 3, string[]> = {
  0: ["...KKKK...", "..KLLRRK..", ".KLLRRRrK.", "KLRRRRrrK.", "KRRRrrrDK.", ".KKKKKKK.."],
  1: ["....KKKK....", "...KLLRRK...", "..KLLRRRRK..", ".KLLRRRRrrK.", ".KLRRRRrrrK.", "KRRRRrrrDDK.", "KRRrrrrDDDK.", ".KKKKKKKKK.."],
  2: ["....KKKKKK....", "...KLLLRRRK...", "..KLLLRRRRrK..", ".KLLLRRRRrrrK.", ".KLLRRRRrrrrK.", "KLRRRRRrrrDDK.", "KRRRRrrrrDDDK.", "KRRrrrrDDDDDK.", ".KKKKKKKKKKK..", ".....KKKK....."],
  // la alta (16 × 14), para "Nach salta": la grande que hay que saltar manteniendo
  3: [
    "......KKKK......",
    "....KKLLRRKK....",
    "...KLLLRRRRK....",
    "..KLLLRRRRRrK...",
    "..KLLRRRRRrrK...",
    ".KLLRRRRRRrrrK..",
    ".KLRRRRRRrrrrK..",
    ".KLRRRRRrrrrDK..",
    "KLRRRRRrrrrrDDK.",
    "KLRRRRrrrrrDDDK.",
    "KRRRRrrrrrDDDDK.",
    "KRRRrrrrrDDDDDK.",
    "KRRrrrrrDDDDDDK.",
    ".KKKKKKKKKKKKKK.",
  ],
};
export type RockSize = 0 | 1 | 2 | 3;
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
