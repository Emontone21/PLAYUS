// Los dibujos de las cartas de "buscá los Paris": pixel art en grillas de
// 16 × 16 como mapas de letras, sin DOM ni React. Se dibujan como SVG con
// SpriteSvg, con el mismo criterio que la rana (frog-grid.ts).
//
// Para agregar un dibujo: sumá una entrada a DRAWINGS y nada más. Cada
// entrada tiene un `id` (slug estable: queda en las trazas guardadas, no lo
// cambies), un `nombre`, un `mapa` de hasta 16 filas de hasta 16 letras ("."
// es transparente) y `colores`, que dice de qué color es cada letra. El
// contorno oscuro no se dibuja: se agrega solo alrededor de todo lo pintado
// (una celda en las ocho direcciones), así que dejá un píxel libre en los
// bordes y usá colores fuertes. Los tableros lo toman de la lista: con más
// dibujos, los tableros chicos (y el de 10 pares) eligen un subconjunto.

import { buildSprite, OUTLINE, type Sprite } from "../lib/sprites";
import { textSprite } from "../lib/font";

export interface Drawing {
  id: string;
  nombre: string;
  mapa: readonly string[];
  colores: Readonly<Record<string, string>>;
}

export const DRAWING_SIZE = 16;

/** "C21H30O2" en dos renglones con la fuente de 3 × 5 (no entra en un renglón) */
function formulaRows(): string[] {
  const line = (text: string) => {
    const s = textSprite(text, "F");
    const rows = Array.from({ length: s.h }, () => Array<string>(s.w).fill("."));
    for (const p of s.px) rows[p.y]![p.x] = "F";
    return rows.map((r) => r.join(""));
  };
  const a = line("C21H");
  const b = line("30O2");
  const pad = (rows: string[]) => rows.map((r) => (".".repeat(Math.floor((DRAWING_SIZE - r.length) / 2)) + r).padEnd(DRAWING_SIZE, "."));
  return ["................", "................", ...pad(a), "................", "................", ...pad(b), "................", "................"];
}

export const DRAWINGS: readonly Drawing[] = [
  {
    id: "porro",
    nombre: "un porro",
    mapa: [
      "..............SS",
      ".............S..",
      "..............S.",
      ".............S..",
      "............OO..",
      "...........OYO..",
      "..........WWYO..",
      ".........WWWW...",
      "........WWWW....",
      ".......WWWW.....",
      "......WWWW......",
      ".....WWWW.......",
      "....WWWW........",
      "...WWWW.........",
      "..BBWW..........",
      "..BBB...........",
    ],
    colores: { W: "#F3EADB", B: "#C9A063", O: "#FF6A00", Y: "#FFD34E", S: "#C9D6DE" },
  },
  {
    id: "vapo",
    nombre: "un vapo",
    mapa: [
      "......CCC.......",
      ".....CCCCC......",
      "......CCC.......",
      "................",
      ".......MM.......",
      ".....GGGGGG.....",
      ".....GLLLLG.....",
      ".....GLLLLG.....",
      ".....GGGGGG.....",
      ".....GGBBGG.....",
      ".....GGGGGG.....",
      ".....GGGGGG.....",
      ".....GGGGGG.....",
      ".....GGGGGG.....",
      ".....GGGGGG.....",
      "................",
    ],
    colores: { G: "#3B4A9B", L: "#8EE3FF", B: "#FF6F91", M: "#8A8A94", C: "#DDE8F0" },
  },
  {
    id: "gorro-chef",
    nombre: "un gorro de chef",
    mapa: [
      "................",
      ".....WWWWWW.....",
      "...WWwWWwWWWW...",
      "..WWWwWWwWWwWW..",
      "..WWWwWWwWWwWW..",
      "..WWWwWWwWWwWW..",
      "..WWWwWWwWWwWW..",
      "..WWWwWWwWWwWW..",
      "...WWwWWwWWwW...",
      "....WWWWWWWW....",
      "....wwwwwwww....",
      "....WWWWWWWW....",
      "....WWWWWWWW....",
      "....WWWWWWWW....",
      "....WWWWWWWW....",
      "................",
    ],
    colores: { W: "#FFFFFF", w: "#C9D3DC" },
  },
  {
    id: "hongo",
    nombre: "un hongo",
    mapa: [
      "................",
      ".....RRRRRR.....",
      "...RRRWWRRRRR...",
      "..RRRRWWRRRRRR..",
      "..RRRRRRRRRWWR..",
      ".RRWWRRRRRRWWRR.",
      ".RRWWRRRRRRRRRR.",
      ".RRRRRRRWWRRRRR.",
      ".RRRRRRRWWRRRRR.",
      "....SSSSSSSS....",
      "....SsSSSSSS....",
      "....SSSSSSsS....",
      "....SSSSSSSS....",
      "....SsSSSSSS....",
      "....SSSSSSSS....",
      "................",
    ],
    colores: { R: "#E23B3B", W: "#FFFFFF", S: "#F1E4C8", s: "#D9C9A6" },
  },
  {
    id: "24",
    nombre: "el número 24",
    mapa: [
      "................",
      "................",
      ".BBBBBB..BB..BB.",
      ".BBBBBB..BB..BB.",
      ".....BB..BB..BB.",
      ".....BB..BB..BB.",
      ".BBBBBB..BBBBBB.",
      ".BBBBBB..BBBBBB.",
      ".BB..........BB.",
      ".BB..........BB.",
      ".BBBBBB......BB.",
      ".BBBBBB......BB.",
      "................",
      "................",
      "................",
      "................",
    ],
    colores: { B: "#F7D23E" },
  },
  {
    id: "mema",
    nombre: "una mema de bebé",
    mapa: [
      "......PPPP......",
      ".....PPPPPP.....",
      "......PPPP......",
      ".....RRRRRR.....",
      "....RRRRRRRR....",
      "....TWWWWWWT....",
      "....TWWWWWWT....",
      "....TWWWWWWT....",
      "....TWWWWWWT....",
      "....TWwWWWWT....",
      "....TWWWWWWT....",
      "....TWWWWWWT....",
      "....TWWWWWWT....",
      "....TWWWWWWT....",
      "....TTTTTTTT....",
      "................",
    ],
    colores: { P: "#F3B59E", R: "#FF6F91", T: "#9FD8E6", W: "#FFFFFF", w: "#E6EEF2" },
  },
  {
    id: "clipper",
    nombre: "un clipper",
    mapa: [
      "................",
      ".......MM.......",
      "......MMMM......",
      "......SSSS......",
      ".....SSSSSS.....",
      ".....SSSSSS.....",
      ".....CCCCCC.....",
      ".....CCcCCC.....",
      ".....CCcCCC.....",
      ".....CCcCCC.....",
      ".....CCcCCC.....",
      ".....CCcCCC.....",
      ".....CCCCCC.....",
      ".....CCCCCC.....",
      "......CCCC......",
      "................",
    ],
    colores: { M: "#8A8A94", S: "#D9DDE3", C: "#8E4DD6", c: "#B07BE8" },
  },
  {
    id: "sunny",
    nombre: "un Nissan Sunny",
    mapa: [
      "................",
      "................",
      "................",
      "......RRRRRR....",
      ".....RGGGGGGR...",
      "....RGGGRRGGGR..",
      "...RRRRRRRRRRRR.",
      "..RRRRRRRRRRRRR.",
      ".YRRRRRRRRRRRRRL",
      ".RRRRRRRRRRRRRRR",
      ".RRRRRRRRRRRRRRR",
      ".RRTTRRRRRRRTTR.",
      "..TTTTRRRRRTTTT.",
      "..TtTT.....TtTT.",
      "...TT.......TT..",
      "................",
    ],
    colores: { R: "#D62B2B", G: "#2B3A4A", T: "#1B1B1F", t: "#C9CCD2", Y: "#FFF1B0", L: "#FF5A5A" },
  },
  {
    id: "vinilo",
    nombre: "un vinilo",
    mapa: [
      ".....BBBBBB.....",
      "...BBBBBBBBBB...",
      "..BBbBBBBBBbBB..",
      ".BBBBBBBBBBBBBB.",
      ".BbBBBBBBBBBBbB.",
      "BBBBBBLLLLBBBBBB",
      "BBBBBLLLLLLBBBBB",
      "BBbBBLLLBLLLBBbB",
      "BBBBBLLLLLLBBBBB",
      "BBBBBBLLLLBBBBBB",
      ".BbBBBBBBBBBBbB.",
      ".BBBBBBBBBBBBBB.",
      "..BBbBBBBBBbBB..",
      "...BBBBBBBBBB...",
      ".....BBBBBB.....",
      "................",
    ],
    colores: { B: "#1E1E26", b: "#45455A", L: "#F7D23E" },
  },
  {
    id: "formula",
    nombre: "una fórmula química",
    mapa: formulaRows(),
    colores: { F: "#2E7D32" },
  },
];

export const DRAWING_IDS: readonly string[] = DRAWINGS.map((d) => d.id);

export function drawingById(id: string, list: readonly Drawing[] = DRAWINGS): Drawing | undefined {
  return list.find((d) => d.id === id);
}

/** el contorno: toda celda transparente con una vecina pintada (ocho direcciones) pasa a K */
export function outlineRows(mapa: readonly string[], size = DRAWING_SIZE): string[] {
  const g = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => mapa[r]?.[c] ?? "."));
  const painted = (r: number, c: number) => r >= 0 && r < size && c >= 0 && c < size && g[r]![c] !== "." && g[r]![c] !== "K";
  const out = g.map((row) => [...row]);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (g[r]![c] !== ".") continue;
      let near = false;
      for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && painted(r + dr, c + dc)) near = true;
      if (near) out[r]![c] = "K";
    }
  }
  return out.map((row) => row.join(""));
}

const cache = new Map<string, Sprite>();
/** el sprite de un dibujo (16 × 16 con contorno), cacheado por id */
export function drawingSprite(id: string, list: readonly Drawing[] = DRAWINGS): Sprite {
  const key = list === DRAWINGS ? id : `${id}:${list.length}`;
  let s = cache.get(key);
  if (!s) {
    const d = drawingById(id, list);
    if (!d) throw new Error(`no hay dibujo "${id}"`);
    s = buildSprite(outlineRows(d.mapa), { ...d.colores, K: OUTLINE });
    cache.set(key, s);
  }
  return s;
}
