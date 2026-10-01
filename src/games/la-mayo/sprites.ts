// Pixel art de "la mayo": Remar a la mesa (el mismo marinero de "remar
// vuelve a casa": gorra blanca con cinta azul, remera a rayas; acá de frente
// y más grande, con tres caras), el plato con papas, el pomo de mayonesa y
// la barra. Mapas de letras (games/lib/sprites), sin DOM ni React.

import { buildSprite as build, composeSprite, greyedSprite, OUTLINE, type Sprite } from "../lib/sprites";
import { textSprite } from "../lib/font";

export type { Sprite };
export { textSprite };
const K = OUTLINE;

/** la vista: 120 × 100 unidades */
export const FIELD_W = 120;
export const FIELD_H = 100;

export type Face = "espera" | "contento" | "enojado";

// ---------------------------------------------------------------------------
// Remar, 16 × 16, de frente, con las manos sobre la mesa
// ---------------------------------------------------------------------------

const REMAR_PALETTE: Record<string, string> = {
  K,
  W: "#F4F4F4", // gorra
  N: "#1E3A8A", // cinta
  S: "#F6DCC8", // piel
  R: "#E2574C", // piel enojada
  E: "#1B1B1B", // ojos y cejas
  c: "#F2B8B0", // cachetes
  m: "#B5524A", // boca
  T: "#F4F4F4", // rayas
  t: "#1E3A8A",
};

const BODY_ROWS = [
  "..KKtTtTtTtTKK..",
  ".KStTtTtTtTtTSK.",
  ".KSTtTtTtTtTtSK.",
  ".KStTtTtTtTtTSK.",
  "KKSSKKKKKKKKSSKK",
];

const HEAD_ROWS: Record<Face, string[]> = {
  espera: [
    "....KKKKKKKK....",
    "...KWWWWWWWWK...",
    "..KWWWWWWWWWWK..",
    "..KNNNNNNNNNNK..",
    "..KSSSSSSSSSSK..",
    "..KSEESSSSEESK..",
    "..KSEESSSSEESK..",
    "..KScSSSSSScSK..",
    "..KSSSmmmmSSSK..",
    "...KSSSSSSSSK...",
    "....KKKKKKKK....",
  ],
  contento: [
    "....KKKKKKKK....",
    "...KWWWWWWWWK...",
    "..KWWWWWWWWWWK..",
    "..KNNNNNNNNNNK..",
    "..KSSSSSSSSSSK..",
    "..KSEESSSSEESK..",
    "..KSSSSSSSSSSK..",
    "..KScmSSSSmcSK..",
    "..KSSSmmmmSSSK..",
    "...KSSSSSSSSK...",
    "....KKKKKKKK....",
  ],
  enojado: [
    "....KKKKKKKK....",
    "...KWWWWWWWWK...",
    "..KWWWWWWWWWWK..",
    "..KNNNNNNNNNNK..",
    "..KRREERRRREERK..".slice(0, 16),
    "..KRRREERREERRK..".slice(0, 16),
    "..KREERRRRRREERK".slice(0, 16),
    "..KRRRRRRRRRRK..",
    "..KRRRmmmmRRRK..",
    "...KRmRRRRmRK...",
    "....KKKKKKKK....",
  ],
};

export const REMAR_W = 16;
export const REMAR_H = 16;

const remarCache = new Map<Face, Sprite>();
export function remarSprite(face: Face): Sprite {
  let s = remarCache.get(face);
  if (!s) {
    s = build([...HEAD_ROWS[face], ...BODY_ROWS], REMAR_PALETTE);
    remarCache.set(face, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// el plato con papas fritas, 28 × 10
// ---------------------------------------------------------------------------

const PLATE_PALETTE: Record<string, string> = { K, P: "#F4F4F4", p: "#D9D9D9", F: "#F2C94C", f: "#D9AE2E", M: "#F3E7B3" };
const PLATE_ROWS = [
  ".........KK..KK.KK..........",
  "........KFfKKFfKFfK.........",
  "......KKKFfKFfFfFfKKK.......",
  "......KFfFfKFfFfFfFfK.......",
  ".....KFfFfFfFfFfFfFfFK......",
  "..KKKKKKKKKKKKKKKKKKKKKKK...",
  ".KPPPPPPPPPPPPPPPPPPPPPPPK..",
  "KPPPPPPPPPPPPPPPPPPPPPPPPPK.",
  ".KppppppppppppppppppppppK...",
  "..KKKKKKKKKKKKKKKKKKKKKK....",
];
export const PLATE_W = 28;
export const PLATE_H = 10;
let plate: Sprite | null = null;
export function plateSprite(): Sprite {
  plate ??= build(PLATE_ROWS, PLATE_PALETTE);
  return plate;
}

/** el plato con la mayonesa encima: "justo" (un copete), "poca" (un hilito) o "mucha" (un pegote que lo tapa) */
export type MayoOnPlate = "nada" | "justo" | "poca" | "mucha";
const MAYO_PALETTE: Record<string, string> = { K, M: "#F3E7B3", Y: "#E9C94C" };
const MAYO_ROWS: Record<Exclude<MayoOnPlate, "nada">, string[]> = {
  justo: ["....KKKK....", "...KMMMMK...", "..KMMMMMMK..", "..KMMMMMMK..", "...KKKKKK..."],
  poca: [".....K......", ".....KM.....", ".....K......", "....KMK.....", "....KKK....."],
  mucha: [".....KKKKKKKKKKKK.....", "...KKMMMMMMMMMMMMKK...", ".KKMMMMMMMMMMMMMMMMKK.", "KMMMMMMMMMMMMMMMMMMMMK", "KMMMYMMMMMMYMMMMMMYMMK", ".KMMMMMMMMMMMMMMMMMMK.", "..KKKKKKKKKKKKKKKKKK.."],
};
const mayoCache = new Map<string, Sprite>();
export function mayoSprite(kind: Exclude<MayoOnPlate, "nada">): Sprite {
  let s = mayoCache.get(kind);
  if (!s) {
    s = build(MAYO_ROWS[kind], MAYO_PALETTE);
    mayoCache.set(kind, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// el pomo de mayonesa, 6 × 9 (con el pico abajo): la barrita y las vidas
// ---------------------------------------------------------------------------

const POMO_PALETTE: Record<string, string> = { K, W: "#F4F4F4", Y: "#E9C94C", R: "#D9534F", r: "#A63A36" };
const POMO_ROWS = [".KKKK.", "KWWWWK", "KWYYWK", "KWYYWK", "KWWWWK", "KWWWWK", ".KRRK.", ".KrrK.", "..KK.."];
export const POMO_W = 6;
export const POMO_H = 9;
let pomo: Sprite | null = null;
export function pomoSprite(): Sprite {
  pomo ??= build(POMO_ROWS, POMO_PALETTE);
  return pomo;
}
let pomoOff: Sprite | null = null;
/** una vida apagada */
export function pomoOffSprite(): Sprite {
  pomoOff ??= greyedSprite(pomoSprite());
  return pomoOff;
}

/** Remar con el plato adelante, para la pantalla previa y la de resultado (32 × 24) */
export function remarAtTable(face: Face, mayo: MayoOnPlate = "nada"): Sprite {
  const parts = [
    { sprite: remarSprite(face), x: 8, y: 0 },
    { sprite: plateSprite(), x: 2, y: 14 },
  ];
  if (mayo !== "nada") {
    const m = mayoSprite(mayo);
    parts.push({ sprite: m, x: 16 - Math.floor(m.w / 2), y: mayo === "mucha" ? 12 : 11 });
  }
  return composeSprite(32, 24, parts);
}
