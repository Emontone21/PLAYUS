// Pixel art de Larry, de lo que cae y de la calle, sin DOM ni React. Cada
// sprite es un mapa de letras (una por unidad lógica) con su paleta; "." es
// transparente. Lo usan el canvas del juego, los SVG de la pantalla previa y
// del resultado, y los tests.

import { FIELD_H, FIELD_W, FLOOR_Y, type Kind } from "./rules";
import { buildSprite as build, greyedSprite, OUTLINE, type Pixel, type Sprite } from "../lib/sprites";

export type { Pixel, Sprite };

// Larry viene de games/lib/larry (lo comparten sus juegos)
export { larrySprite, LARRY_SPRITE_H, LARRY_SPRITE_W, type Face } from "../lib/larry";

// ---------------------------------------------------------------------------
// lo que cae: formas bien distintas entre sí (se leen por la silueta)
// ---------------------------------------------------------------------------

const DROPS: Record<Kind, { rows: string[]; palette: Record<string, string> }> = {
  hamburguesa: {
    rows: [
      "..KKKKKK..",
      ".KBBsBBBK.",
      "KBBBBBBsBK",
      "KccccccccK",
      "KMMMMMMMMK",
      "KMMMMMMMMK",
      "KbbbbbbbbK",
      ".KKKKKKKK.",
    ],
    palette: { K: OUTLINE, B: "#E8A64A", s: "#FFF3C0", c: "#F7D23E", M: "#6B3A1E", b: "#D08A3A" },
  },
  vapo: {
    rows: [
      "ww.......",
      "www..KK..",
      ".w..KddK.",
      "...KVVVK.",
      "...KVLVK.",
      "...KVVVK.",
      "...KVVVK.",
      "...KvvvK.",
      "...KVVVK.",
      "....KKK..",
    ],
    palette: { K: OUTLINE, w: "#E8EEF2", d: "#2A2A2A", V: "#B46BFF", v: "#7A3FD0", L: "#FFE9FF" },
  },
  lechuga: {
    rows: [
      ".KK.KK.KK.",
      "KGGKGGKGGK",
      "KGgGGGGgGK",
      "KGGgLLgGGK",
      "KGgGLLGgGK",
      "KGGgLLgGGK",
      ".KGGGGGGK.",
      "..KKKKKK..",
    ],
    palette: { K: OUTLINE, G: "#5BC236", g: "#A8E07A", L: "#3E9A22" },
  },
  zanahoria: {
    rows: [
      "..F..F..",
      "...FF...",
      ".KKFFKK.",
      "KOOOOOOK",
      "KOoOOOOK",
      ".KOOOoK.",
      ".KOOOOK.",
      "..KoOK..",
      "..KOOK..",
      "...KK...",
    ],
    palette: { K: OUTLINE, F: "#3FAE6A", O: "#FF8C42", o: "#D9651E" },
  },
  brocoli: {
    rows: [
      "...KKK...",
      ".KKDDDKK.",
      "KDDDdDDDK",
      "KDdDDDDdK",
      ".KDDDDDK.",
      "..KLLLK..",
      "..KLLLK..",
      "..KLLLK..",
      "...KKK...",
    ],
    palette: { K: OUTLINE, D: "#2E8B3A", d: "#1E6B2A", L: "#A6D96A" },
  },
  // tres franjas horizontales (roja, azul y blanca) en un mástil chico
  bandera: {
    rows: [
      "P.........",
      "PKKKKKKKKK",
      "PKRRRRRRRK",
      "PKRRRRRRRK",
      "PKAAAAAAAK",
      "PKAAAAAAAK",
      "PKWWWWWWWK",
      "PKWWWWWWWK",
      "PKKKKKKKKK",
      "P.........",
    ],
    palette: { K: OUTLINE, P: "#C8C8C8", R: "#E53935", A: "#1E4FC2", W: "#F4F4F4" },
  },
};

const dropCache = new Map<Kind, Sprite>();
export function dropSprite(kind: Kind): Sprite {
  let s = dropCache.get(kind);
  if (!s) {
    s = build(DROPS[kind].rows, DROPS[kind].palette);
    dropCache.set(kind, s);
  }
  return s;
}

/** una vida apagada: la hamburguesita en grises */
export const greyed = greyedSprite;

// ---------------------------------------------------------------------------
// la calle de noche: fija, igual para todos, apagada para no competir
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

export const SKY = "#0B1822";

export function streetRects(): Rect[] {
  const r: Rect[] = [];
  // luna
  r.push({ x: 72, y: 12, w: 6, h: 6, c: "#3C4A52" }, { x: 73, y: 11, w: 4, h: 8, c: "#3C4A52" }, { x: 71, y: 13, w: 8, h: 4, c: "#3C4A52" });
  // edificios: silueta con ventanas apagadas y alguna prendida
  const buildings = [
    { x: 0, w: 16, top: 84 },
    { x: 16, w: 20, top: 66 },
    { x: 36, w: 14, top: 92 },
    { x: 50, w: 22, top: 74 },
    { x: 72, w: 18, top: 88 },
  ];
  const lit = new Set(["16:0:1", "50:2:0", "72:1:2", "0:3:1", "36:0:0", "50:5:2"]);
  for (const b of buildings) {
    r.push({ x: b.x, y: b.top, w: b.w, h: FLOOR_Y - b.top, c: "#111F2C" });
    let row = 0;
    for (let y = b.top + 5; y < FLOOR_Y - 12; y += 9, row++) {
      let col = 0;
      for (let x = b.x + 3; x + 3 <= b.x + b.w - 2; x += 6, col++) {
        r.push({ x, y, w: 3, h: 4, c: lit.has(`${b.x}:${row}:${col}`) ? "#4A4226" : "#18293A" });
      }
    }
  }
  // farol
  r.push({ x: 83, y: 104, w: 1, h: 46, c: "#22313F" }, { x: 80, y: 102, w: 6, h: 2, c: "#22313F" }, { x: 80, y: 104, w: 3, h: 1, c: "#5E5530" });
  // vereda y cordón
  r.push({ x: 0, y: FLOOR_Y, w: FIELD_W, h: FIELD_H - FLOOR_Y, c: "#262B35" });
  r.push({ x: 0, y: FLOOR_Y, w: FIELD_W, h: 1, c: "#39404D" });
  for (let x = 4; x < FIELD_W; x += 14) r.push({ x, y: FLOOR_Y + 5, w: 6, h: 1, c: "#2F3541" });
  return r;
}
