// Una fuente de 3 × 5 en pixel art, para carteles chicos dentro del canvas
// (los metros de la orilla en remar, el "tss" de la parrilla). Solo las
// letras que hicieron falta; agregá las que necesites.

import { buildSprite, type Sprite } from "./sprites";

const FONT: Record<string, string[]> = {
  "0": ["KKK", "K.K", "K.K", "K.K", "KKK"],
  "1": [".K.", "KK.", ".K.", ".K.", "KKK"],
  "2": ["KKK", "..K", "KKK", "K..", "KKK"],
  "3": ["KKK", "..K", "KKK", "..K", "KKK"],
  "4": ["K.K", "K.K", "KKK", "..K", "..K"],
  "5": ["KKK", "K..", "KKK", "..K", "KKK"],
  "6": ["KKK", "K..", "KKK", "K.K", "KKK"],
  "7": ["KKK", "..K", "..K", "..K", "..K"],
  "8": ["KKK", "K.K", "KKK", "K.K", "KKK"],
  "9": ["KKK", "K.K", "KKK", "..K", "KKK"],
  a: ["KKK", "..K", "KKK", "K.K", "KKK"],
  c: ["KKK", "K..", "K..", "K..", "KKK"],
  e: ["KKK", "K..", "KK.", "K..", "KKK"],
  h: ["K..", "K..", "KKK", "K.K", "K.K"],
  i: [".K.", "...", ".K.", ".K.", ".K."],
  j: ["..K", "...", "..K", "K.K", "KKK"],
  l: ["K..", "K..", "K..", "K..", "KKK"],
  m: ["K.K", "KKK", "KKK", "K.K", "K.K"],
  n: ["KK.", "K.K", "K.K", "K.K", "K.K"],
  o: ["KKK", "K.K", "K.K", "K.K", "KKK"],
  p: ["KKK", "K.K", "KKK", "K..", "K.."],
  u: ["K.K", "K.K", "K.K", "K.K", "KKK"],
  x: ["K.K", "K.K", ".K.", "K.K", "K.K"],
  s: ["KKK", "K..", "KKK", "..K", "KKK"],
  t: [".K.", "KKK", ".K.", ".K.", "..K"],
  C: ["KKK", "K..", "K..", "K..", "KKK"],
  H: ["K.K", "K.K", "KKK", "K.K", "K.K"],
  O: ["KKK", "K.K", "K.K", "K.K", "KKK"],
  P: ["KKK", "K.K", "KKK", "K..", "K.."],
  A: [".K.", "K.K", "KKK", "K.K", "K.K"],
  R: ["KKK", "K.K", "KKK", "KK.", "K.K"],
  I: ["KKK", ".K.", ".K.", ".K.", "KKK"],
  "!": [".K.", ".K.", ".K.", "...", ".K."],
  b: ["K..", "K..", "KKK", "K.K", "KKK"],
  d: ["..K", "..K", "KKK", "K.K", "KKK"],
  g: ["KKK", "K.K", "KKK", "..K", "KKK"],
  r: ["KK.", "K.K", "K..", "K..", "K.."],
  "+": ["...", ".K.", "KKK", ".K.", "..."],
  "¡": [".K.", "...", ".K.", ".K.", ".K."],
  "?": ["KKK", "..K", ".KK", "...", ".K."],
  "¿": [".K.", "...", "KK.", "K..", "KKK"],
  " ": ["...", "...", "...", "...", "..."],
};

/** un texto con esa fuente, con una unidad entre letras */
export function textSprite(text: string, color: string): Sprite {
  const rows = ["", "", "", "", ""];
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[" "]!;
    for (let i = 0; i < 5; i++) rows[i] += (rows[i] ? "." : "") + glyph[i];
  }
  return buildSprite(rows, { K: color });
}
