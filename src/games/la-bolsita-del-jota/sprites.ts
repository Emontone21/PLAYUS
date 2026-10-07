// Pixel art de "la bolsita del jota": el vaso rojo de fiesta dado vuelta (los
// tres son el mismo dibujo, sin marcas). El jota, su mano y la tussi vienen de
// games/lib/jota (los comparte con "pegándole al jota"). Mapas de letras, sin DOM.

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";

export type { Sprite };
const K = OUTLINE;

/** la vista: 144 × 160 unidades */
export const FIELD_W = 144;
export const FIELD_H = 160;
/** el centro de cada lugar de la fila, y la mesa donde se apoyan los vasos */
export const SLOT_X: readonly [number, number, number] = [36, 72, 108];
export const TABLE_Y = 102;
/** el jota detrás de la mesa, al doble */
export const JOTA = { x: 56, y: 34, zoom: 2 };
/** tu pila, abajo a la izquierda */
export const PILE = { x: 8, y: 150 };

/** el vaso: 26 × 28, más angosto arriba (es el fondo, porque está dado vuelta) */
export const CUP_W = 26;
export const CUP_H = 28;
let cup: Sprite | null = null;
export function cupSprite(): Sprite {
  if (!cup) {
    const rows: string[] = [];
    for (let y = 0; y < CUP_H; y++) {
      // de 16 de ancho arriba a 26 abajo
      const w = Math.round(16 + ((CUP_W - 16) * y) / (CUP_H - 1));
      const left = Math.floor((CUP_W - w) / 2);
      let line = "";
      for (let x = 0; x < CUP_W; x++) {
        const i = x - left;
        if (i < 0 || i >= w) line += ".";
        else if (y === 0 || i === 0 || i === w - 1 || y === CUP_H - 1) line += "K";
        else if (y >= CUP_H - 4) line += y === CUP_H - 4 ? "d" : "W"; // el borde blanco de la boca
        else if (y <= 2) line += "d"; // el fondo, más oscuro
        else if (y % 6 === 5) line += "d"; // las estrías del vaso
        else if (i <= 2) line += "h"; // el brillo de la izquierda
        else if (i >= w - 4) line += "d"; // la sombra de la derecha
        else line += "R";
      }
      rows.push(line);
    }
    cup = build(rows, { K, R: "#D93A33", d: "#A8282A", h: "#FF7A6E", W: "#F4E9E6" });
  }
  return cup;
}
