// Larry, compartido por los juegos donde aparece ("los deseos de Larry",
// "Larry en la hdp"): 14 × 22, con sus cuatro caras y dos cuadros de
// caminata. Mapas de letras, sin DOM.

import { buildSprite as build, OUTLINE, type Sprite } from "./sprites";

// ---------------------------------------------------------------------------
// 14 × 22, de frente. Gorra de visera plana (con la calcomanía dorada),
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
