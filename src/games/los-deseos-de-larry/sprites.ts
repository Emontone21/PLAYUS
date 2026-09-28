// Pixel art de Larry, de lo que cae y de la calle, sin DOM ni React. Cada
// sprite es un mapa de letras (una por unidad lógica) con su paleta; "." es
// transparente. Lo usan el canvas del juego, los SVG de la pantalla previa y
// del resultado, y los tests.

import { FIELD_H, FIELD_W, FLOOR_Y, type Kind } from "./rules";

export interface Pixel {
  x: number;
  y: number;
  c: string;
}

export interface Sprite {
  w: number;
  h: number;
  px: Pixel[];
}

function build(rows: readonly string[], palette: Record<string, string>): Sprite {
  const px: Pixel[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === ".") continue;
      const c = palette[ch];
      if (!c) throw new Error(`sin color para "${ch}"`);
      px.push({ x, y, c });
    }
  });
  return { w: Math.max(...rows.map((r) => r.length)), h: rows.length, px };
}

const OUTLINE = "#141414";

// ---------------------------------------------------------------------------
// Larry: 14 × 22, de frente. Gorra de visera plana (con la calcomanía dorada),
// buzo oversize, cadena de oro, pantalón ancho, zapatillas grandes y el vapo
// asomando del bolsillo derecho.
// ---------------------------------------------------------------------------

export const LARRY_SPRITE_W = 14;
export const LARRY_SPRITE_H = 22;

const LARRY_PALETTE: Record<string, string> = {
  K: OUTLINE,
  C: "#E2574C", // gorra
  B: "#1C1C24", // visera plana
  Y: "#FFD34E", // calcomanía
  S: "#F6DCC8", // piel
  s: "#E6BCA2",
  E: "#1B1B1B", // ojos
  m: "#B5524A", // boca
  t: "#FF6F91", // lengua
  T: "#6FD3E0", // lágrima
  H: "#F2F2F2", // buzo
  h: "#C9C9D3",
  G: "#FFD34E", // cadena
  g: "#C99A1E",
  P: "#3B5BA5", // pantalón
  p: "#2E477F",
  V: "#B46BFF", // vapo en el bolsillo
  v: "#2A2A2A",
  W: "#FFFFFF", // zapatillas
  R: "#E2574C",
  w: "#9A9AA5",
};

const LARRY_BODY = [
  "....KKKKKK....", // 0 gorra
  "...KCCCCCCK...",
  "..KCCCCCCCCK..",
  ".KBBBBBBBYBBK.", // 3 visera plana
  "...KSSSSSSK...", // 4 cara (se reemplaza según el gesto)
  "...KSESSESK...",
  "...KSSSSSSK...",
  "...KSSmmSSK...",
  "....KSSSSK....", // 8
  "..KKHGsSGHKK..", // 9 cuello y cadena
  ".KHHHHGGGHHHK.",
  "KHHhHHHgHHHhHK", // 11 dije
  "KHhHHHHHHHHhHK",
  "KHhHHHHHHHHhHK",
  "KHhHHHHHHHHhHK",
  "KSKHHHHHHHvKSK", // 15 manos y la boquilla del vapo
  ".KPPPPPPPPVPK.", // 16 pantalón ancho, el vapo asoma
  ".KPPPpPPPPVPK.",
  ".KPPPPKKPpPPK.",
  ".KPPPPKKPPPPK.",
  "KWWRWWKKWWRWWK", // 20 zapatillas grandes
  "KwwwwwKKwwwwwK",
];

export type Face = "normal" | "feliz" | "asco" | "bajon";

const FACES: Record<Face, string[]> = {
  normal: ["...KSSSSSSK...", "...KSESSESK...", "...KSSSSSSK...", "...KSSmmSSK...", "....KSSSSK...."],
  feliz: ["...KSESSESK...", "...KSSSSSSK...", "...KSmSSmSK...", "...KSSmmSSK...", "....KSSSSK...."],
  asco: ["...KSSSSSSK...", "...KEESSEEK...", "...KSSSSSSK...", "...KSmmmmSK...", "....KStSSK...."],
  bajon: ["...KESSSSEK...", "...KSESSESK...", "...KSTSSSSK...", "...KSSSSSSK...", "....KmmmmK...."],
};

/** Larry con un gesto y un cuadro de caminata (0 quieto, 1 y 2 caminando). */
export function larrySprite(face: Face = "normal", walk: 0 | 1 | 2 = 0): Sprite {
  const rows = [...LARRY_BODY];
  FACES[face].forEach((r, i) => (rows[4 + i] = r));
  if (walk !== 0) {
    // un pie levantado: de ese lado, la pierna y la zapatilla suben una fila
    const [from, to] = walk === 1 ? [0, 7] : [7, 14];
    const grid = rows.map((r) => r.split(""));
    for (let x = from; x < to; x++) {
      for (let y = 18; y <= 20; y++) grid[y]![x] = rows[y + 1]![x]!;
      grid[21]![x] = ".";
    }
    return build(grid.map((r) => r.join("")), LARRY_PALETTE);
  }
  return build(rows, LARRY_PALETTE);
}

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
export function greyed(sprite: Sprite): Sprite {
  return {
    ...sprite,
    px: sprite.px.map((p) => {
      const n = parseInt(p.c.slice(1), 16);
      const l = Math.round((((n >> 16) & 255) * 3 + ((n >> 8) & 255) * 6 + (n & 255)) / 10 / 2.4) + 30;
      const h = l.toString(16).padStart(2, "0");
      return { ...p, c: `#${h}${h}${h}` };
    }),
  };
}

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
