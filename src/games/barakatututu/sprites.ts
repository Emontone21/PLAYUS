// Pixel art de "Barakatututu": El negro toto, tamborilero de comparsa
// (gorra y camisa con los colores de la comparsa, faja, el tambor colgado del
// hombro con su lonja y el palillo) en sus tres caras, dibujado como el resto
// de los personajes de la app: simpático y con dignidad, sin rasgos exagerados
// ni caricatura. Más las banderas y las guirnaldas de la calle. Mapas de
// letras, sin DOM. El tambor grande y la regla se dibujan a mano en draw.ts.

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";

export type { Sprite };
const K = OUTLINE;

export const COLORS = {
  noche: "#141A2A",
  nocheClara: "#1E2740",
  calle: "#2B2B33",
  calleLinea: "#3C3C46",
  lonja: "#E8D5B5",
  lonjaLuz: "#F6E8CC",
  lonjaToto: "#FFD34E",
  lonjaFuerte: "#FFB347",
  lonjaVos: "#6FD3E0",
  aro: "#8B5A2B",
  aroLuz: "#B57A3E",
  casco: "#5C3A1E",
  cascoLinea: "#7A4E28",
  regla: "#3A3F4C",
  reglaLinea: "#5B6170",
  pulso: "#6B7280",
  pulsoOn: "#F2E8D0",
  cursor: "#FFD34E",
  marcaToto: "#F2E8D0",
  justo: "#6FD3E0",
  casi: "#FFD34E",
  error: "#FF6F91",
} as const;

/** los colores de la comparsa (camisa, banderas, gorra) */
export const COMPARSA = { a: "#2F6FD6", b: "#F2C94C", c: "#D64545", d: "#F6F6F2" } as const;

// ---------------------------------------------------------------------------
// El negro toto (34 × 46)
// ---------------------------------------------------------------------------

export type TotoFace = "contento" | "eso" | "enojado";

const TOTO_PALETTE: Record<string, string> = {
  K,
  G: COMPARSA.a, // gorra
  g: "#245BB3",
  S: "#6B4226", // piel
  s: "#553319",
  E: "#1B1B1F", // ojos
  W: "#F6F6F2", // camisa y dientes
  A: COMPARSA.a, // rayas de la camisa
  Y: COMPARSA.b,
  F: COMPARSA.c, // faja
  f: "#B23636",
  M: "#3A1A1A", // boca
  m: "#C2574F", // lengua
  P: "#4A3A6A", // pantalón
  T: "#5C3A1E", // tambor
  t: "#7A4E28",
  L: "#E8D5B5", // lonja
  l: "#F6E8CC",
  C: "#C9A062", // palillo
  R: "#8B5A2B", // aro del tambor
};

const TOTO_BASE: readonly string[] = [
  "..........KKKKKKKK................",
  "........KKGGGGGGGGKK..............",
  ".......KGGGGGGGGGGGGK.............",
  ".......KGGGgGGGGGGGGK.............",
  "......KKKKKKKKKKKKKKKK............",
  "......KgggggggggggggK.............",
  ".......KSSSSSSSSSSSSK.............",
  ".......KSSSSSSSSSSSSK.............",
  ".......KSSEESSSSEESSK.............",
  ".......KSSEESSSSEESSK.............",
  ".......KSSSSSSsSSSSSK.............",
  ".......KSSSSSSSSSSSSK.............",
  ".......KSSSSSSSSSSSSK.............",
  ".......KSSSSSSSSSSSSK.............",
  "........KSSSSSSSSSSK..............",
  ".........KKSSSSSSKK...............",
  "..........KKSSSSKK................",
  ".....KKKKKKKWWWWKKKKKKK...........",
  "....KWWAWWYWWWWWWYWWAWWK..........",
  "...KWWWAWWYWWWWWWYWWAWWWK.........",
  "...KWWWAWWYWWWWWWYWWAWWWK.........",
  "...KSSWAWWYWWWWWWYWWAWSSK.........",
  "...KSSWAWWYWWWWWWYWWAWSSK.........",
  "...KKKWAWWYWWWWWWYWWAWKKK.........",
  "......KWAWWYWWWWWWYWWAWK...KKK....",
  "......KFFFFFFFFFFFFFFFFK..KCCCK...",
  "......KFfFfFfFfFfFfFfFfK...KCK....",
  "......KFFFFFFFFFFFFFFFFK...KSK....",
  "......KPPPPPPPPPPPPPPPPK..KSSSK...",
  "......KPPPPPPPPPPPPPPPPK..KSSSK...",
  "......KPPPPPPPKKPPPPPPPK...KKK....",
  "......KPPPPPPK..KPPPPPPK..........",
  "......KPPPPPPK..KPPPPPPK..........",
  "......KPPPPPPK..KPPPPPPK..........",
  "......KPPPPPPK..KPPPPPPK..........",
  "......KPPPPPPK..KPPPPPPK..........",
  "......KPPPPPPK..KPPPPPPK..........",
  "......KPPPPPPK..KPPPPPPK..........",
  "......KPPPPPPK..KPPPPPPK..........",
  "......KPPPPPPK..KPPPPPPK..........",
  "......KPPPPPPK..KPPPPPPK..........",
  "......KPPPPPPK..KPPPPPPK..........",
  "......KPPPPPPK..KPPPPPPK..........",
  "......KPPPPPPK..KPPPPPPK..........",
  ".....KKKKKKKKK..KKKKKKKKK.........",
  ".....KKKKKKKKK..KKKKKKKKK.........",
];

/** el tambor colgado al costado (16 × 22), con la lonja arriba y la correa */
const DRUM_ROWS: readonly string[] = [
  "....KKKKKKKK....",
  "..KKllLLLLllKK..",
  ".KlLLLLLLLLLLlK.",
  ".KRRRRRRRRRRRRK.",
  ".KTtTTtTTtTTtTK.",
  ".KTtTTtTTtTTtTK.",
  ".KTtTTtTTtTTtTK.",
  ".KRRRRRRRRRRRRK.",
  ".KTtTTtTTtTTtTK.",
  ".KTtTTtTTtTTtTK.",
  ".KTtTTtTTtTTtTK.",
  ".KTtTTtTTtTTtTK.",
  ".KTtTTtTTtTTtTK.",
  ".KRRRRRRRRRRRRK.",
  ".KTtTTtTTtTTtTK.",
  ".KTtTTtTTtTTtTK.",
  ".KTtTTtTTtTTtTK.",
  ".KTtTTtTTtTTtTK.",
  ".KTtTTtTTtTTtTK.",
  ".KRRRRRRRRRRRRK.",
  "..KKTTTTTTTTKK..",
  "....KKKKKKKK....",
];

function patch(rows: string[], y: number, x: number, text: string): void {
  const row = rows[y]!;
  rows[y] = row.slice(0, x) + text + row.slice(x + text.length);
}

export const TOTO_W = 34;
export const TOTO_H = 46;
const totoCache = new Map<TotoFace, Sprite>();
/** El negro toto con su cara; el tambor va aparte (`totoDrumSprite`) para que el palillo quede encima */
export function totoSprite(face: TotoFace): Sprite {
  let s = totoCache.get(face);
  if (s) return s;
  const rows = [...TOTO_BASE];
  if (face === "contento") {
    patch(rows, 12, 9, "KSSSSSSK");
    patch(rows, 13, 10, "KWWWWK");
  } else if (face === "eso") {
    // ojos cerrados de contento y una sonrisa grande
    patch(rows, 8, 10, "SS");
    patch(rows, 8, 16, "SS");
    patch(rows, 9, 10, "KK");
    patch(rows, 9, 16, "KK");
    patch(rows, 12, 9, "KMMMMMMK");
    patch(rows, 13, 9, "KWWWWWWK");
    patch(rows, 14, 10, "KKKKKK");
  } else {
    // el ceño fruncido y la boca apretada
    patch(rows, 7, 10, "KK");
    patch(rows, 7, 16, "KK");
    patch(rows, 8, 11, "K");
    patch(rows, 8, 16, "K");
    patch(rows, 12, 9, "SKKKKKKS");
    patch(rows, 13, 10, "KSSSSK");
  }
  s = build(rows, TOTO_PALETTE);
  totoCache.set(face, s);
  return s;
}
let totoDrum: Sprite | null = null;
export function totoDrumSprite(): Sprite {
  totoDrum ??= build(DRUM_ROWS, TOTO_PALETTE);
  return totoDrum;
}

// ---------------------------------------------------------------------------
// la calle: banderas y guirnaldas
// ---------------------------------------------------------------------------

/** una bandera de comparsa (10 × 14): a rayas, en un mástil */
const flagCache = new Map<string, Sprite>();
export function flagSprite(a: string, b: string): Sprite {
  const key = `${a}:${b}`;
  let s = flagCache.get(key);
  if (!s) {
    s = build(["KAAAAAAAK.", "KBBBBBBBK.", "KAAAAAAAK.", "KBBBBBBBK.", "KAAAAAAAK.", "KBBBBBBBK.", "KAAAAAAAK.", "KBBBBBBBK.", "K.........", "K.........", "K.........", "K.........", "K.........", "K........."], { K, A: a, B: b });
    flagCache.set(key, s);
  }
  return s;
}

/** una lamparita de la guirnalda (3 × 3) */
const bulbCache = new Map<string, Sprite>();
export function bulbSprite(color: string): Sprite {
  let s = bulbCache.get(color);
  if (!s) {
    s = build([".C.", "CCC", ".C."], { C: color });
    bulbCache.set(color, s);
  }
  return s;
}
export const GARLAND_COLORS = ["#FF6F91", "#F2C94C", "#6FD3E0", "#8EDC66"] as const;
