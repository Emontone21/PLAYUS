// Pixel art de "servila justa": la botella de Nix cola (etiqueta propia, sin
// copiar ninguna marca), el vaso con lo que tiene adentro, y los colores de
// la escena. Mapas de letras (games/lib/sprites), sin DOM ni React.

import { buildSprite as build, composeSprite, OUTLINE, type Sprite } from "../lib/sprites";
import { textSprite } from "../lib/font";
import { GLASS_W, glassDef, glassRows, interiorSpan, type GlassDef, type Shape } from "./glasses";

export type { Sprite };
const K = OUTLINE;

/** la vista: 96 × 120 unidades */
export const FIELD_W = 96;
export const FIELD_H = 120;

export const COLORS = {
  whisky: "#C8782A",
  whiskyDark: "#A65F1E",
  cola: "#3B1F14",
  colaLight: "#5A2E1C",
  foam: "#F3E7C8",
  foamDark: "#E0D0A8",
  bubble: "#FFFBEE",
  glass: "#2E4A5C",
  glassShine: "#8FB8CC",
  ice: "#DDF3FF",
  iceDark: "#9FD0E8",
  line: "#FFD34E",
  bar: "#5E3A1A",
  barTop: "#8B5A2B",
  wall: "#161A2B",
  shelf: "#2A2140",
  neon: "#FF6F91",
};

// ---------------------------------------------------------------------------
// la botella de Nix cola: 18 × 32, parada, con el pico arriba
// ---------------------------------------------------------------------------

const BOTTLE_PALETTE: Record<string, string> = { K, B: "#2B1A12", b: "#3F2A1E", R: "#D9534F", W: "#F4F4F4", L: "#1E3A8A", c: "#D9534F" };
const BOTTLE_ROWS = [
  "......KKKKKK......",
  "......KRRRRK......",
  "......KRRRRK......",
  "......KBbbBK......",
  "......KBbbBK......",
  ".....KBBbbBBK.....",
  "....KBBBbbBBBK....",
  "...KBBBBbbBBBBK...",
  "..KBBBBBbbBBBBBK..",
  ".KBBBBBBbbBBBBBBK.",
  ".KBBBBBBbbBBBBBBK.",
  ".KBBBBBBbbBBBBBBK.",
  ".KWWWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWWWK.",
  ".KWWWWWWWWWWWWWWK.",
  ".KBBBBBBbbBBBBBBK.",
  ".KBBBBBBbbBBBBBBK.",
  ".KBBBBBBbbBBBBBBK.",
  ".KBBBBBBbbBBBBBBK.",
  ".KBBBBBBbbBBBBBBK.",
  ".KBBBBBBbbBBBBBBK.",
  ".KBBBBBBBBBBBBBBK.",
  ".KKKKKKKKKKKKKKKK.",
];
export const BOTTLE_W = 18;
export const BOTTLE_H = 32;

let bottle: Sprite | null = null;
/** la botella con la etiqueta "nix" / "cola" en azul sobre blanco, y una franja roja */
export function bottleSprite(): Sprite {
  if (!bottle) {
    const base = build(BOTTLE_ROWS, BOTTLE_PALETTE);
    const nix = textSprite("nix", BOTTLE_PALETTE.L!);
    const cola = textSprite("cola", BOTTLE_PALETTE.L!);
    const stripe = build(["cccccccccccccc"], { c: BOTTLE_PALETTE.c! });
    bottle = composeSprite(BOTTLE_W, BOTTLE_H, [
      { sprite: base, x: 0, y: 0 },
      { sprite: stripe, x: 2, y: 12 },
      { sprite: nix, x: Math.floor((BOTTLE_W - nix.w) / 2), y: 13 },
      { sprite: cola, x: Math.floor((BOTTLE_W - cola.w) / 2), y: 19 },
    ]);
  }
  return bottle;
}

// ---------------------------------------------------------------------------
// el vaso con lo que tiene adentro (para el resumen y la previa)
// ---------------------------------------------------------------------------

/** el vaso con whisky, cola y espuma hasta `top` (milésimas de fila), y la raya en `lineRow` */
export function filledGlassSprite(shape: Shape, whiskyRows: number, liquid: number, top: number, lineRow: number | null): Sprite {
  const d: GlassDef = glassDef(shape);
  const rows = glassRows(shape);
  const h = d.h;
  const px: Sprite["px"] = [];
  const base = build(rows, { K: OUTLINE, i: COLORS.glass, p: "#3A3D47" });
  px.push(...base.px);
  for (let r = d.firstRow; r < h; r++) {
    const { x, w } = interiorSpan(d, r);
    if (w === 0) continue;
    const y = h - 1 - r;
    const mid = r * 1000 + 500;
    let c: string | null = null;
    if (mid < liquid) c = r < d.firstRow + whiskyRows ? COLORS.whisky : COLORS.cola;
    else if (mid < top) c = COLORS.foam;
    if (c) for (let i = 0; i < w; i++) px.push({ x: x + i, y, c });
    if (lineRow !== null && r === lineRow) for (let i = 0; i < w; i += 2) px.push({ x: x + i, y, c: COLORS.line });
  }
  return { w: GLASS_W, h, px };
}
