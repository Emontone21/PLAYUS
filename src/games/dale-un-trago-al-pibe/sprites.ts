// Pixel art de "Dale un trago al pibe": el pibe rasta (gorro tejido a rayas,
// rastas largas, barba, remera holgada y cara de buena onda) en sus cuatro
// poses, la damajuana "Vinaken del pari" de vidrio verde con esterilla de
// mimbre, el corcho, el dedo de la pantalla previa y los colores de los caños
// y el vino. Mapas de letras, sin DOM. Los caños se dibujan a mano en draw.ts.

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";

export type { Sprite };
const K = OUTLINE;

/** las fichas: 20 unidades de lado; la franja de arriba (damajuana) y la de abajo (el pibe) */
export const TILE = 20;
export const TOP = 34;
export const BOTTOM = 34;

export const COLORS = {
  fondo: "#2B2622",
  baldosa: "#E7DBC3",
  baldosaLinea: "#CDBF9F",
  baldosaSombra: "#D7C9A8",
  canoBorde: "#2A2A30",
  cano: "#9AA0A8",
  canoLuz: "#C9CED4",
  canoSombra: "#6E747C",
  vino: "#6B1F3A",
  vinoLuz: "#8E2E52",
  solucion: "#5BD67A",
  arena: "#E3C76B",
  vidrio: "#D9EEF5",
} as const;

// ---------------------------------------------------------------------------
// el pibe rasta (26 × 30)
// ---------------------------------------------------------------------------

export type RastaPose = "espera" | "toma" | "salud" | "triste";

const RASTA_PALETTE: Record<string, string> = {
  K,
  H: "#D23B3B", // gorro rojo
  Y: "#E8C53A", // amarillo
  G: "#3E9B47", // verde
  D: "#4A2F1E", // rastas
  d: "#6B4423",
  S: "#8D5A3C", // piel
  s: "#704528",
  P: "#A4664A", // cachetes inflados
  E: "#1B1B1F", // ojos
  W: "#F6F6F2", // dientes y lágrima
  M: "#3A1A1A", // boca abierta
  m: "#B5484D", // lengua
  B: "#3B2416", // barba
  T: "#4C9F6D", // remera
  t: "#6BBF8A",
  V: "#6B1F3A", // manchas de vino
};

const RASTA_BASE: readonly string[] = [
  ".........KKKKKKKK.........",
  ".......KKHHHHHHHHKK.......",
  "......KHHHHHHHHHHHHK......",
  ".....KYYYYYYYYYYYYYYK.....",
  ".....KGGGGGGGGGGGGGGK.....",
  ".....KHHHHHHHHHHHHHHK.....",
  "....KKYYYYYYYYYYYYYYKK....",
  "...KDDKKKKKKKKKKKKKKDDK...",
  "..KDdDKSSSSSSSSSSSSKDdDK..",
  "..KDDdKSSSSSSSSSSSSKdDDK..",
  "..KdDDKSSEESSSSEESSKDDdK..",
  "..KDDdKSSEESSSSEESSKdDDK..",
  "..KDdDKSSSSSSSSSSSSKDdDK..",
  "..KDDDKSSSSSsSSSSSSKDDDK..",
  "..KdDDKSSSSSSSSSSSSKDDdK..",
  "..KDDdKSSSSSSSSSSSSKdDDK..",
  "..KDdDKSBSSSSSSSSBSKDdDK..",
  "..KDDDKBBBSSSSSSBBBKDDDK..",
  "..KdDDKBBBBBBBBBBBBKDDdK..",
  "..KDDdKKBBBBBBBBBBKKdDDK..",
  "..KDdDDKKBBBBBBBBKKDDdDK..",
  "..KDDDDKKKKBBBBKKKKDDDDK..",
  ".KDDdDDKTTTKKKKTTTKDDdDDK.",
  ".KDdDDKTTTTTtttTTTTKDDDdK.",
  ".KDDDKTTTTTTTTTTTTTTKDDDK.",
  ".KdDDKTTTTTTtTTTTTTTKDDdK.",
  ".KDDDKTTTTTTTTTTTTTTKDDDK.",
  "..KKKKTTTTTTTTTTTTTTKKKK..",
  ".....KTTTTTTTTTTTTTTK.....",
  ".....KKKKKKKKKKKKKKKK.....",
];

function patch(rows: string[], y: number, x: number, text: string): void {
  const row = rows[y]!;
  rows[y] = row.slice(0, x) + text + row.slice(x + text.length);
}

export const RASTA_W = 26;
export const RASTA_H = 30;
const rastaCache = new Map<RastaPose, Sprite>();
export function rastaSprite(pose: RastaPose): Sprite {
  let s = rastaCache.get(pose);
  if (s) return s;
  const rows = [...RASTA_BASE];
  if (pose === "espera") {
    // la boca abierta, esperando
    patch(rows, 14, 9, "KKKKKKKK");
    patch(rows, 15, 9, "KMMMMMMK");
    patch(rows, 16, 9, "KMmmmmMK");
    patch(rows, 17, 9, "KKKKKKKK");
  } else if (pose === "toma") {
    // los cachetes inflados y la boca cerrada
    patch(rows, 15, 9, "SSSSSSSS");
    patch(rows, 16, 9, "KKKKKKKK");
    for (const y of [12, 13, 14, 15]) {
      patch(rows, y, 7, "PP");
      patch(rows, y, 17, "PP");
    }
  } else if (pose === "salud") {
    // ojos cerrados de contento y una sonrisa
    patch(rows, 10, 9, "SS");
    patch(rows, 10, 15, "SS");
    patch(rows, 11, 9, "KK");
    patch(rows, 11, 15, "KK");
    patch(rows, 15, 8, "KSSSSSSSSK");
    patch(rows, 16, 9, "KWWWWWWK");
    patch(rows, 17, 10, "KKKKKK");
  } else {
    // empapado y triste: ceño, lágrima y manchas de vino
    patch(rows, 9, 9, "KK");
    patch(rows, 9, 15, "KK");
    patch(rows, 12, 10, "W");
    patch(rows, 15, 9, "SSKKKKSS");
    patch(rows, 16, 9, "SKSSSSKS");
    patch(rows, 2, 8, "VVV");
    patch(rows, 3, 12, "VV");
    patch(rows, 5, 7, "VV");
    patch(rows, 23, 8, "VVV");
    patch(rows, 24, 13, "VV");
    patch(rows, 25, 9, "V");
    patch(rows, 26, 15, "VVV");
  }
  s = build(rows, RASTA_PALETTE);
  rastaCache.set(pose, s);
  return s;
}

// ---------------------------------------------------------------------------
// la damajuana "Vinaken del pari" (20 × 25), el corcho y el dedo
// ---------------------------------------------------------------------------

const DAMAJUANA_ROWS = [
  "........KKKK........",
  "........KCCK........",
  "........KCcK........",
  ".......KKGGKK.......",
  ".......KgGGGK.......",
  ".......KgGGGK.......",
  ".....KKKgGGGKKK.....",
  "....KGGGgGGGGGGK....",
  "...KGGGgGGGGGGGGK...",
  "..KGGGgGGGGGGGGGGK..",
  "..KGGgGGGGGGGGGGGK..",
  ".KGGGgGGGGGGGGGGGGK.",
  ".KAaAaAaAaAaAaAaAaK.",
  ".KaAaALLLLLLLLAaAaK.",
  ".KAaAaLRLLLLRLAaAaK.",
  ".KaAaALRLLLLRLAaAaK.",
  ".KAaAaLLRLLRLLAaAaK.",
  ".KaAaALLLRRLLLAaAaK.",
  ".KAaAaLLLLLLLLAaAaK.",
  ".KaAaAaAaAaAaAaAaAK.",
  ".KAaAaAaAaAaAaAaAaK.",
  "..KaAaAaAaAaAaAaAK..",
  "..KAaAaAaAaAaAaAaK..",
  "...KaAaAaAaAaAaAK...",
  "....KKKKKKKKKKKK....",
];
const DAMAJUANA_PALETTE: Record<string, string> = { K, C: "#B8864E", c: "#9A6D3A", G: "#3F7D3A", g: "#6FB069", A: "#C9A062", a: "#A67C3B", L: "#F2E8D0", R: "#B22A3A" };
export const DAMAJUANA_W = 20;
export const DAMAJUANA_H = 25;
let damajuana: Sprite | null = null;
export function damajuanaSprite(): Sprite {
  damajuana ??= build(DAMAJUANA_ROWS, DAMAJUANA_PALETTE);
  return damajuana;
}
/** la misma sin el corcho (ya descorchada) */
let uncorked: Sprite | null = null;
export function uncorkedSprite(): Sprite {
  uncorked ??= build(["....................", "....................", "....................", ...DAMAJUANA_ROWS.slice(3)], DAMAJUANA_PALETTE);
  return uncorked;
}
let cork: Sprite | null = null;
export function corkSprite(): Sprite {
  cork ??= build(["KKKK", "KCCK", "KCcK", "KKKK"], DAMAJUANA_PALETTE);
  return cork;
}

/** el dedo de la pantalla previa (10 × 12) */
let finger: Sprite | null = null;
export function fingerSprite(): Sprite {
  finger ??= build(
    ["....KK....", "...KSSK...", "...KSSK...", "...KSSK...", ".KKKSSKK..", "KSSKSSKSK.", "KSSSSSSSSK", "KSSSSSSSSK", ".KSSSSSSSK", ".KSSSSSSK.", "..KSSSSK..", "...KKKK..."],
    { K, S: "#E0A67A" },
  );
  return finger;
}

/** una gota de vino (3 × 4) */
let drop: Sprite | null = null;
export function dropSprite(): Sprite {
  drop ??= build([".V.", "VVV", "VVV", ".V."], { V: COLORS.vino });
  return drop;
}
