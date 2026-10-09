// Pixel art de "Nach salta": lo que está en el aire (el cartel de neón
// colgado, las zapatillas del cable y la paloma con dos cuadros de aleteo).
// The Nach de costado, las rocas y la paleta de la calle vienen de
// games/lib/nach. Mapas de letras, sin DOM.

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";

export type { Sprite };
const K = OUTLINE;

/** la vista: 240 × 160 unidades de 100 mm, de borde a borde; The Nach a un 20 % del ancho (se ven 19,2 m hacia adelante) y el piso abajo, con cielo para las tres alturas */
export const FIELD_W = 240;
export const FIELD_H = 160;
export const NACH_X = 48;
export const GROUND_Y = 136;
export const MM_PER_UNIT = 100;

/** el cartel de neón colgado (14 × 7): una tabla oscura con dos tubos */
let cartel: Sprite | null = null;
export function cartelSprite(): Sprite {
  cartel ??= build(
    ["KKKKKKKKKKKKKK", "KDDDDDDDDDDDDK", "KDppppDDccccDK", "KDpDDpDDcDDDDK", "KDppppDDccccDK", "KDDDDDDDDDDDDK", "KKKKKKKKKKKKKK"],
    { K, D: "#151826", p: "#FF6F91", c: "#6FD3E0" },
  );
  return cartel;
}

/** una zapatilla colgando (5 × 4) */
let shoe: Sprite | null = null;
export function shoeSprite(): Sprite {
  shoe ??= build([".KKK.", "KWWWK", "KWRRK", "KKKKK"], { K, W: "#F4F4F4", R: "#E2574C" });
  return shoe;
}

/** la paloma volando bajo (12 × 11), dos cuadros de aleteo */
const PALOMA_ROWS: Record<0 | 1, string[]> = {
  0: [
    "....KK......",
    "...KggK.....",
    "..KgggggK...",
    ".KggggggK...",
    "............",
    "......KK....",
    ".....KGGKK..",
    "OKKKKGGGGGKK",
    ".KggggGGGGGK",
    "..KKKgggggK.",
    ".....KKKKK..",
  ],
  1: [
    "............",
    "............",
    "............",
    "............",
    "............",
    "......KK....",
    ".....KGGKK..",
    "OKKKKGGGGGKK",
    ".KggggGGGGGK",
    "..KggggggK..",
    "...KgggggK..",
  ],
};
const palomaCache = new Map<number, Sprite>();
export function palomaSprite(frame: 0 | 1): Sprite {
  let s = palomaCache.get(frame);
  if (!s) {
    s = build(PALOMA_ROWS[frame], { K, g: "#A9AFBD", G: "#E3E6EE", O: "#F2A93B" });
    palomaCache.set(frame, s);
  }
  return s;
}
