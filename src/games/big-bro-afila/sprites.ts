// Pixel art de "Big Bro afila": la cuchilla de chef, los cinco ingredientes
// del borde, la horma de queso (normal y grande, con agujeritos y la cáscara
// más oscura) y la chispa. Big Bro y la cocina vienen de games/lib (big-bro,
// hdp-kitchen): no se copian. Mapas de letras, sin DOM.

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";
import type { IngredientKind } from "./rules";

export type { Sprite };
const K = OUTLINE;

/** la vista: 144 × 220 unidades, en vertical */
export const FIELD_W = 144;
export const FIELD_H = 220;
/** el centro de la horma y sus radios */
export const WHEEL = { x: 72, y: 76, r: 30, rBig: 38 };
/** de dónde sale la cuchilla: la mano de Big Bro */
export const HAND = { x: 72, y: 178 };
/** Big Bro, abajo al centro */
export const BRO = { x: 50, y: 182 };
/** cuánto de la hoja queda adentro del queso */
export const EMBED = 4;

// ---------------------------------------------------------------------------
// la cuchilla: 3 × 20, la punta arriba; hoja plateada y mango oscuro
// ---------------------------------------------------------------------------

export const KNIFE_W = 3;
export const KNIFE_H = 20;
const KNIFE_ROWS = [
  ".K.",
  "KWK",
  "KWS",
  "KWS",
  "KWS",
  "KWS",
  "KWS",
  "KWS",
  "KWS",
  "KWS",
  "KWS",
  "KWS",
  "KSS",
  "KGK",
  "KHK",
  "KhK",
  "KHK",
  "KhK",
  "KHK",
  ".K.",
];
const KNIFE_PALETTE = { K, W: "#E9EDF2", S: "#B8C0C8", G: "#6E7279", H: "#3A2A22", h: "#5A4232" };
let knife: Sprite | null = null;
export function knifeSprite(): Sprite {
  knife ??= build(KNIFE_ROWS, KNIFE_PALETTE);
  return knife;
}
/** el color de la cuchilla en la fila y columna dadas (para dibujarla radial, píxel por píxel) */
export function knifeColor(row: number, col: number): string | null {
  const ch = KNIFE_ROWS[row]?.[col];
  if (!ch || ch === ".") return null;
  return (KNIFE_PALETTE as Record<string, string>)[ch]!;
}
/** acostada (20 × 3), para la fila de las que le quedan a Big Bro */
let knifeSide: Sprite | null = null;
export function knifeSideSprite(): Sprite {
  if (!knifeSide) {
    const rows: string[] = [];
    for (let x = 0; x < KNIFE_W; x++) {
      let line = "";
      for (let y = KNIFE_H - 1; y >= 0; y--) line += KNIFE_ROWS[y]![x]!;
      rows.push(line);
    }
    knifeSide = build(rows, KNIFE_PALETTE);
  }
  return knifeSide;
}

// ---------------------------------------------------------------------------
// los ingredientes del borde (7 × 7): chicos y bien distintos
// ---------------------------------------------------------------------------

const INGREDIENTS: Record<IngredientKind, { rows: string[]; palette: Record<string, string> }> = {
  tomate: { rows: ["..KKK..", ".KRRRK.", "KRrRrRK", "KRRrRRK", "KRrRrRK", ".KRRRK.", "..KKK.."], palette: { K, R: "#D9342B", r: "#FFB0A0" } },
  aceituna: { rows: ["..KKK..", ".KOOOK.", "KOOooOK", "KOoRoOK", "KOOooOK", ".KOOOK.", "..KKK.."], palette: { K, O: "#4E5B2A", o: "#7C8C3E", R: "#E2574C" } },
  pepino: { rows: ["..KKK..", ".KGGGK.", "KGgsgGK", "KGsgsGK", "KGgsgGK", ".KGGGK.", "..KKK.."], palette: { K, G: "#2E7D32", g: "#B9E39A", s: "#E8F5C8" } },
  panceta: { rows: [".......", ".KK.KK.", "KrrKrrK", "KwwwwwK", "KrrrrrK", ".KK.KK.", "......."], palette: { K, r: "#C8483A", w: "#F6E3D6" } },
  hamburguesita: { rows: [".KKKKK.", "KbbsbbK", "KbbbbbK", "KcccccK", "KmmmmmK", "KbbbbbK", ".KKKKK."], palette: { K, b: "#E8A64A", s: "#FFF3C0", c: "#F7D23E", m: "#6B3A1E" } },
};
const ingCache = new Map<IngredientKind, Sprite>();
export function ingredientSprite(kind: IngredientKind): Sprite {
  let s = ingCache.get(kind);
  if (!s) {
    s = build(INGREDIENTS[kind].rows, INGREDIENTS[kind].palette);
    ingCache.set(kind, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// la horma de queso: redonda, amarilla, con agujeritos y la cáscara más oscura
// ---------------------------------------------------------------------------

export const CHEESE = { body: "#F7D23E", rind: "#D9A21E", hole: "#D9A91E", holeDark: "#B98A12", label: "#FFF8E7", labelInk: "#E2574C" };

/** los agujeritos: [ángulo en grados, fracción del radio, tamaño] */
export const HOLES: readonly [number, number, number][] = [
  [20, 0.45, 2],
  [75, 0.7, 1],
  [130, 0.35, 3],
  [190, 0.62, 2],
  [240, 0.25, 1],
  [290, 0.55, 2],
  [335, 0.78, 1],
  [100, 0.1, 1],
  [160, 0.82, 1],
  [260, 0.8, 1],
];

/** la chispa (5 × 5) */
let spark: Sprite | null = null;
export function sparkSprite(): Sprite {
  spark ??= build(["..Y..", ".YWY.", "YWWWY", ".YWY.", "..Y.."], { Y: "#FFD34E", W: "#FFFFFF" });
  return spark;
}
