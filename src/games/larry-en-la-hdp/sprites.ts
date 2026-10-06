// Pixel art de "Larry en la hdp": los 9 ingredientes en dos versiones, el
// ícono de 16 × 16 (la bandeja y la comanda) y la feta de 16 de ancho vista de
// costado (la hamburguesa que crece en la plancha), más el tacho. Larry, Big
// Bro, la carne y la cocina vienen de games/lib (larry, big-bro,
// hdp-kitchen): no se copian. Mapas de letras, sin DOM.

import { pattySprite } from "../lib/hdp-kitchen";
import { buildSprite as build, composeSprite, OUTLINE, type Sprite } from "../lib/sprites";
import type { Ingredient } from "./rules";

export type { Sprite };
const K = OUTLINE;

/** la vista: 144 × 128 unidades */
export const FIELD_W = 144;
export const FIELD_H = 128;
/** la pared hasta acá; después el mostrador */
export const WALL_H = 56;
export const COUNTER = { y: 56, h: 12 };
/** la plancha, abajo */
export const GRIDDLE = { x: 4, y: 76, w: 136, h: 48 };
/** dónde se apila la hamburguesa: centro y base */
export const STACK = { x: 64, y: 118 };
/** el tacho, a la derecha de la plancha */
export const TRASH = { x: 112, y: 88, w: 22, h: 30 };
/** Larry detrás del mostrador, a la izquierda (al doble) */
export const LARRY = { x: 6, y: 16, zoom: 2 };
export const ICON = 16;
export const SLICE_W = 16;

// ---------------------------------------------------------------------------
// los íconos (16 × 16): cada uno se reconoce solo, pero hay pares parecidos
// a propósito: queso y huevo (amarillos), lechuga y pepino (verdes), tomate y
// panceta (rojizos)
// ---------------------------------------------------------------------------

const ROUND = [
  "................",
  ".....KKKKKK.....",
  "...KKRRRRRRKK...",
  "..KRRrrrrrrRRK..",
  ".KRrrsrrrrsrrRK.",
  ".KRrrrrRRrrrrRK.",
  "KRrsrrRrrRrrsrRK",
  "KRrrrRrrrrRrrrRK",
  "KRrrrRrrrrRrrrRK",
  "KRrsrrRrrRrrsrRK",
  ".KRrrrrRRrrrrRK.",
  ".KRrrsrrrrsrrRK.",
  "..KRRrrrrrrRRK..",
  "...KKRRRRRRKK...",
  ".....KKKKKK.....",
  "................",
];

const ICONS: Record<Exclude<Ingredient, "carne">, { rows: string[]; palette: Record<string, string> }> = {
  pan: {
    rows: [
      "................",
      "................",
      ".....KKKKKK.....",
      "...KKbbbbbbKK...",
      "..KbbbsbbbbbbK..",
      ".KbbbbbbbbsbbbK.",
      ".KbsbbbbbbbbbbK.",
      "KbbbbbbsbbbbbbbK",
      "KbbbbbbbbbbbbsbK",
      "KddddddddddddddK",
      "KccccccccccccccK",
      "KddddddddddddddK",
      ".KbbbbbbbbbbbbK.",
      "..KKKKKKKKKKKK..",
      "................",
      "................",
    ],
    palette: { K, b: "#E8A64A", s: "#FFF3C0", d: "#C9832E", c: "#F6D9A0" },
  },
  queso: {
    rows: [
      "................",
      ".KKKKKKKKKKKKKK.",
      ".KyyyyyyyyyyyyK.",
      ".KyyhyyyyyyyyyK.",
      ".KyhhyyyyyhyyyK.",
      ".KyyyyyyyyhhyyK.",
      ".KyyyyyyyyyyyyK.",
      ".KyyyyhyyyyyyyK.",
      ".KyyyhhyyyyyyyK.",
      ".KyyyyyyyyyhyyK.",
      ".KyyyyyyyyyyyyK.",
      ".KYyyyyyyyyyyyK.",
      ".KYYyyyyyyyyYYK.",
      ".KKYYYKKKKYYYKK.",
      "...KKK....KKK...",
      "................",
    ],
    palette: { K, y: "#F7D23E", h: "#D9A91E", Y: "#E8B92A" },
  },
  huevo: {
    rows: [
      "................",
      "....KKKKK.......",
      "..KKwwwwwKKK....",
      ".KwwwwwwwwwwKK..",
      ".KwwwwKKKKwwwwK.",
      "KwwwwKyyyYKwwwK.",
      "KwwwKyyyyyyKwwK.",
      "KwwwKyyyyyYKwwwK",
      "KwwwKyYyyyyKwwwK",
      ".KwwwKyyyyKwwwK.",
      ".KwwwwKKKKwwwwK.",
      "..KwwwwwwwwwwK..",
      "...KKwwwwwwKK...",
      ".....KKKKKK.....",
      "................",
      "................",
    ],
    palette: { K, w: "#FBF7EE", y: "#F7C531", Y: "#FFE89A" },
  },
  panceta: {
    rows: [
      "................",
      "................",
      "................",
      "..KK....KKK.....",
      ".KrrKK.KrrrKK...",
      "KrrrrrKrrrrrrKK.",
      "KwwwwwwwwwwwwwwK",
      "KrrrrrrrrrrrrrrK",
      "KppppppppppppppK",
      "KwwwwwwwwwwwwwwK",
      "KrrrrrrrrrrrrrrK",
      ".KKrrrrKKrrrrrK.",
      "...KKKK..KKKKK..",
      "................",
      "................",
      "................",
    ],
    palette: { K, r: "#C8483A", p: "#E07A68", w: "#F6E3D6" },
  },
  tomate: { rows: ROUND, palette: { K, R: "#D9342B", r: "#F0655A", s: "#FFD9A0" } },
  pepino: { rows: ROUND, palette: { K, R: "#2E7D32", r: "#B9E39A", s: "#E8F5C8" } },
  lechuga: {
    rows: [
      "................",
      "................",
      "................",
      "..KK..KKK..KK...",
      ".KggKKgggKKggK..",
      "KgGGgggGgggGGgK.",
      "KGGgGGGgGGGgGGGK",
      "KgGGGgGGGGgGGGgK",
      ".KGGgGGGGGGgGGK.",
      "KgGGGGgGGgGGGGGK",
      ".KgGGgGGGGGGgGK.",
      "..KKgGGgGGgGKK..",
      "....KKKKKKKK....",
      "................",
      "................",
      "................",
    ],
    palette: { K, G: "#5BC236", g: "#A8E07A" },
  },
  cebolla: {
    rows: [
      "................",
      ".....KKKKKK.....",
      "...KKppppppKK...",
      "..KppwwwwwwppK..",
      ".KpwwKKKKKKwwpK.",
      ".KpwKppppppKwpK.",
      "KpwKpwwwwwwpKwpK",
      "KpwKpwKKKKwpKwpK",
      "KpwKpwK..KwpKwpK",
      "KpwKpwKKKKwpKwpK",
      "KpwKpwwwwwwpKwpK",
      ".KpwKppppppKwpK.",
      ".KpwwKKKKKKwwpK.",
      "..KppwwwwwwppK..",
      "...KKppppppKK...",
      ".....KKKKKK.....",
    ],
    palette: { K, p: "#A45BB0", w: "#F4E9F4" },
  },
};

const iconCache = new Map<Ingredient, Sprite>();
/** el ícono de la bandeja y de la comanda; la carne es la de la plancha de hdp (games/lib/hdp-kitchen) */
export function iconSprite(ing: Ingredient): Sprite {
  let s = iconCache.get(ing);
  if (!s) {
    s = ing === "carne" ? composeSprite(ICON, ICON, [{ sprite: pattySprite("dorando3"), x: 0, y: 4 }]) : build(ICONS[ing].rows, ICONS[ing].palette);
    iconCache.set(ing, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// las fetas, de costado (16 de ancho): la hamburguesa creciendo en la plancha
// ---------------------------------------------------------------------------

const SLICES: Record<Ingredient | "panArriba", { rows: string[]; palette: Record<string, string> }> = {
  pan: { rows: [".KKKKKKKKKKKKKK.", "KccccccccccccccK", "KbbbbbbbbbbbbbbK", ".KKKKKKKKKKKKKK."], palette: { K, b: "#E8A64A", c: "#F6D9A0" } },
  panArriba: {
    rows: ["....KKKKKKKK....", "..KKbbbbsbbbKK..", ".KbbsbbbbbbbbsK.", "KbbbbbbbsbbbbbbK", "KccccccccccccccK", ".KKKKKKKKKKKKKK."],
    palette: { K, b: "#E8A64A", s: "#FFF3C0", c: "#F6D9A0" },
  },
  carne: { rows: [".KKKKKKKKKKKKKK.", "KmmmmMmmmmmMmmmK", "KmMmmmmmMmmmmmmK", ".KKKKKKKKKKKKKK."], palette: { K, m: "#7E3E22", M: "#653018" } },
  queso: { rows: ["KKKKKKKKKKKKKKKK", "KyyyyyyyyyyyyyyK", "KKyKKKKKKKKKyKKK", ".KK.........KK.."], palette: { K, y: "#F7D23E" } },
  huevo: { rows: ["......KKKK......", ".KKKKKyyyyKKKKK.", "KwwwwKyyyyKwwwwK", "KwwwwwwwwwwwwwwK", ".KKKKKKKKKKKKKK."], palette: { K, w: "#FBF7EE", y: "#F7C531" } },
  panceta: { rows: ["..KKK....KKKK...", ".KrrrKKKKrrrrKK.", "KwwwwrrrrwwwwrrK", "KKrrrKKKKrrrrKKK"], palette: { K, r: "#C8483A", w: "#F6E3D6" } },
  lechuga: { rows: ["K.KK.KK.KK.KK.K.", "KgGgGGgGGgGGgGgK", "KGGGGGGGGGGGGGGK", ".KKKKKKKKKKKKKK."], palette: { K, G: "#5BC236", g: "#A8E07A" } },
  tomate: { rows: [".KKKKKKKKKKKKKK.", "KRrrrrrrrrrrrrRK", ".KKKKKKKKKKKKKK."], palette: { K, R: "#D9342B", r: "#F0655A" } },
  pepino: { rows: [".KKKKKKKKKKKKKK.", "KGggggggggggggGK", ".KKKKKKKKKKKKKK."], palette: { K, G: "#2E7D32", g: "#B9E39A" } },
  cebolla: { rows: [".KKKKKKKKKKKKKK.", "KpwpwwpwwpwwpwpK", ".KKKKKKKKKKKKKK."], palette: { K, p: "#A45BB0", w: "#F4E9F4" } },
};

const sliceCache = new Map<string, Sprite>();
/** la feta de un ingrediente; el pan de arriba (el último) es la tapa con sésamo */
export function sliceSprite(ing: Ingredient, top = false): Sprite {
  const key = ing === "pan" && top ? "panArriba" : ing;
  let s = sliceCache.get(key);
  if (!s) {
    s = build(SLICES[key].rows, SLICES[key].palette);
    sliceCache.set(key, s);
  }
  return s;
}

/** cuánto sube la pila con cada feta (se pisan un poco) */
export function sliceStep(ing: Ingredient, top = false): number {
  return sliceSprite(ing, top).h - 1;
}

/** el tacho (22 × 30), con tapa */
const TRASH_ROWS = [
  "......KKKKKKKKKK......",
  "......KttttttttK......",
  "KKKKKKKKKKKKKKKKKKKKKK",
  "KTTTTTTTTTTTTTTTTTTTTK",
  "KKKKKKKKKKKKKKKKKKKKKK",
  ".KccccccccccccccccccK.",
  ".KcCccCccCccCccCcccK..",
];
let trash: Sprite | null = null;
export function trashSprite(): Sprite {
  if (!trash) {
    const rows = [...TRASH_ROWS.slice(0, 5)];
    for (let y = 5; y < TRASH.h - 1; y++) rows.push(y % 2 ? ".KcCcccCcccCcccCcccK.." : ".KccCcccCcccCcccCccK..");
    rows.push("..KKKKKKKKKKKKKKKKKK..");
    trash = build(rows, { K, t: "#5C6067", T: "#8C9096", c: "#6E7279", C: "#55595F" });
  }
  return trash;
}
