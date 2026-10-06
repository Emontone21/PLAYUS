// Pixel art de "clase con el bro": las comidas, la mesa y la cuchilla. Big
// Bro viene de games/lib/big-bro (lo comparten los juegos de la hdp), con
// tres caras: esperando con los brazos cruzados, contento con el pulgar arriba
// y enojado con la cara roja y la cuchilla en alto. Mapas de letras, sin DOM.

import { buildSprite as build, type Sprite } from "../lib/sprites";
import { BIG_BRO_H, BIG_BRO_PALETTE, BIG_BRO_W, bigBroSprite } from "../lib/big-bro";

export type { Sprite };

/** la vista: 120 × 150 unidades, en vertical */
export const FIELD_W = 120;
export const FIELD_H = 150;

export type Mood = "espera" | "contento" | "enojado";

export const BRO_W = BIG_BRO_W;
export const BRO_H = BIG_BRO_H;

/** las tres caras de clase con el bro; "enojado" es la pose con la cuchilla en alto */
export function broSprite(mood: Mood): Sprite {
  return bigBroSprite(mood === "enojado" ? "cuchilla" : mood);
}

/** la cuchilla apoyada en la mesa (14 × 6), para la previa y la espera */
const CLEAVER_ROWS = ["KKKKKKKKKK....", "KGGGGGGGGGKKK.", "KGGGGGGGGGKHHK", "KGGGGGGGGGKHHK", "KgggggggggKKK.", ".KKKKKKKKK...."];
let cleaver: Sprite | null = null;
export function cleaverSprite(): Sprite {
  cleaver ??= build(CLEAVER_ROWS, BIG_BRO_PALETTE);
  return cleaver;
}
