// Pixel art de "Nach y la roca": el vinilo de las vidas y la notita musical.
// The Nach de espaldas (auriculares, gorra para atrás, campera oversize y
// mochila-parlante) y las rocas están en games/lib/nach. Mapas de letras
// (games/lib/sprites), sin DOM ni React.

import { buildSprite as build, greyedSprite, OUTLINE, type Sprite } from "../lib/sprites";

export type { Sprite };
const K = OUTLINE;

/** la vista: 120 × 160 unidades */
export const FIELD_W = 120;
export const FIELD_H = 160;

// The Nach (de espaldas), sus colores, las rocas y la calle vienen de
// games/lib/nach (los comparte con "Nach salta")
export { NACH_H, NACH_W, nachDownSprite, nachSprite, ROCK_PIECE, rockSprite, type NachPose, type RockSize } from "../lib/nach";

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
