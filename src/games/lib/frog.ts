// La rana de Frog vista de atrás, para los juegos donde es un personaje
// ("Cruza con el chino"): los mismos colores que la mascota de la app
// (components/frog/frog-grid: cuerpo, lomas de los ojos y base), con las
// lomas de los ojos asomando por arriba, el cuerpo y la base. Cuatro
// posturas: quieta, estirada (en el aire), achatada (al aterrizar) y
// aplastada como un panqueque (atropellada). Mapas de letras, sin DOM.

import { FIXED_COLORS, SHADES, type FrogColor } from "@/components/frog/frog-grid";
import { buildSprite as build, OUTLINE, type Sprite } from "./sprites";

export type FrogBackPose = "quieta" | "estirada" | "achatada" | "panqueque";

export const FROG_BACK_W = 16;
export const FROG_BACK_H = 12;

const ROWS: Record<FrogBackPose, string[]> = {
  quieta: [
    "...KKK....KKK...",
    "..KHEHK..KHEHK..",
    "..KHHHK..KHHHK..",
    ".KKGGGKKKKGGGKK.",
    "KGGGGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGGK",
    "KNGGGGGGGGGGGGNK",
    "KNNNNNNNNNNNNNNK",
    ".KNNNK....KNNNK.",
    ".KKKKK....KKKKK.",
  ],
  estirada: [
    "....KKK..KKK....",
    "...KHEHKKHEHK...",
    "...KHHHKKHHHK...",
    "..KKGGGKKGGGKK..",
    "..KGGGGGGGGGGK..",
    "..KGGGGGGGGGGK..",
    "..KGGGGGGGGGGK..",
    "..KGGGGGGGGGGK..",
    "..KNGGGGGGGGNK..",
    "..KNNNNNNNNNNK..",
    "..KNNK....KNNK..",
    "..KKKK....KKKK..",
  ],
  achatada: [
    "................",
    "................",
    "................",
    "...KKK....KKK...",
    "..KHEHK..KHEHK..",
    "KKKGGGKKKKGGGKKK",
    "KGGGGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGGK",
    "KNNNNNNNNNNNNNNK",
    "KNNNK......KNNNK",
    "KKKKK......KKKKK",
  ],
  panqueque: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    ".KK..........KK.",
    "KHEKKKKKKKKKKEHK",
    "KGGGGGGGGGGGGGGK",
    "KGGGGGGGGGGGGGGK",
    "KNNNNNNNNNNNNNNK",
    "KKKKKKKKKKKKKKKK",
  ],
};

const cache = new Map<string, Sprite>();
/** la rana de atrás, con el verde de la mascota salvo que se pida otro */
export function frogBackSprite(pose: FrogBackPose, color: FrogColor = "#6CC24A"): Sprite {
  const key = `${pose}:${color}`;
  let s = cache.get(key);
  if (!s) {
    s = build(ROWS[pose], { K: OUTLINE, G: color, H: SHADES[color].H, N: SHADES[color].N, E: FIXED_COLORS.E! });
    cache.set(key, s);
  }
  return s;
}
