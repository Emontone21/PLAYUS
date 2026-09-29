// Pixel art del bote y su marinero, de los remos, de los cubiertos, de la
// botella, de los carteles de la orilla y del río, sin DOM ni React. Mapas de
// letras (games/lib/sprites): una letra por unidad lógica, "." transparente.

import { buildSprite as build, composeSprite, flipSprite, OUTLINE, type Sprite } from "../lib/sprites";
import { BANK_W, BOAT_H, BOAT_W, FIELD_H, FIELD_W, PIECE_KINDS, type ItemKind, type PieceKind } from "./rules";

export type { Sprite };

// ---------------------------------------------------------------------------
// el bote: 10 × 16 visto desde atrás y arriba; el marinero mira al frente
// (a nosotros), con gorra blanca de marinero y remera a rayas
// ---------------------------------------------------------------------------

export const BOAT_SPRITE_W = BOAT_W;
export const BOAT_SPRITE_H = BOAT_H;

/** cuánto se le ponen rojos los cachetes: 0 sobrio, 3 muy tomado */
export type Cheeks = 0 | 1 | 2 | 3;
const CHEEK_COLORS: Record<Cheeks, string> = { 0: "#F6DCC8", 1: "#F2B8B0", 2: "#EC8E86", 3: "#E2574C" };

const BOAT_PALETTE: Record<string, string> = {
  K: OUTLINE,
  B: "#8B5A2B", // casco
  b: "#5E3A1A", // banco y popa
  d: "#C48A4E", // cubierta
  W: "#F4F4F4", // gorra
  N: "#1E3A8A", // cinta de la gorra
  S: "#F6DCC8", // piel
  E: "#1B1B1B", // ojos
  m: "#B5524A", // boca
  T: "#F4F4F4", // rayas
  t: "#1E3A8A",
};

const BOAT_ROWS = [
  "....KK....", // 0 proa
  "...KddK...",
  "..KddddK..",
  ".KBddddBK.",
  ".KBKWWKBK.", // 4 gorra
  ".KBWWWWBK.",
  ".KBNNNNBK.",
  ".KBESSEBK.", // 7 ojos
  ".KBcSScBK.", // 8 cachetes
  ".KBSmmSBK.",
  ".KBtTtTBK.", // 10 remera a rayas
  ".KBTtTtBK.",
  ".KBtTtTBK.",
  ".KBbbbbBK.", // 13 banco
  "..KbbbbK..",
  "...KKKK...",
];

/** el remo izquierdo en tres poses; el derecho es el espejo */
const OAR_PALETTE: Record<string, string> = { O: "#A8743A", P: "#6B4420", K: OUTLINE };
const OAR_ROWS: Record<0 | 1 | 2, string[]> = {
  0: ["......", "......", "......", "PPOOOO", "PP....", "......"],
  1: [".....O", "....O.", "...O..", "..O...", "PO....", "PP...."],
  2: ["PP....", "PO....", "..O...", "...O..", "....O.", ".....O"],
};
export const OAR_W = 6;
export const OAR_H = 6;
/** dónde se apoya cada remo respecto de la esquina superior izquierda del bote */
export const OAR_LEFT = { x: -OAR_W + 1, y: 7 };
export const OAR_RIGHT = { x: BOAT_W - 1, y: 7 };

const boatCache = new Map<string, Sprite>();
/** el bote con el marinero; `oar` no cambia el cuerpo (los remos se dibujan aparte) pero deja la clave lista */
export function boatSprite(cheeks: Cheeks = 0, oar: 0 | 1 | 2 = 0): Sprite {
  const key = `${cheeks}:${oar}`;
  let s = boatCache.get(key);
  if (!s) {
    // el marinero se inclina un poco al remar: en las poses 1 y 2 la gorra se corre una unidad
    const rows = [...BOAT_ROWS];
    if (oar === 1) rows[4] = ".KBKWWKBK.".replace("KWWK", "WWKK");
    if (oar === 2) rows[4] = ".KBKWWKBK.".replace("KWWK", "KKWW");
    s = build(rows, { ...BOAT_PALETTE, c: CHEEK_COLORS[cheeks] });
    boatCache.set(key, s);
  }
  return s;
}

const oarCache = new Map<string, Sprite>();
export function oarSprite(side: "izq" | "der", frame: 0 | 1 | 2): Sprite {
  const key = `${side}:${frame}`;
  let s = oarCache.get(key);
  if (!s) {
    s = build(OAR_ROWS[frame], OAR_PALETTE);
    if (side === "der") s = flipSprite(s);
    oarCache.set(key, s);
  }
  return s;
}

/** el bote con los dos remos, para las pantallas previa y de resultado (20 × 16) */
export function boatWithOars(cheeks: Cheeks = 0, frame: 0 | 1 | 2 = 0): Sprite {
  const pad = OAR_W - 1;
  return composeSprite(BOAT_W + 2 * pad, BOAT_H, [
    { sprite: oarSprite("izq", frame), x: OAR_LEFT.x + pad, y: OAR_LEFT.y },
    { sprite: oarSprite("der", frame), x: OAR_RIGHT.x + pad, y: OAR_RIGHT.y },
    { sprite: boatSprite(cheeks, frame), x: pad, y: 0 },
  ]);
}

// ---------------------------------------------------------------------------
// los cubiertos: plateados, en horizontal o en diagonal; la botella, ámbar
// ---------------------------------------------------------------------------

const SILVER: Record<string, string> = { K: OUTLINE, S: "#D9DDE3", s: "#9AA3AE", H: "#3B2A1A" };
const AMBER: Record<string, string> = { K: OUTLINE, A: "#B5651D", a: "#7A3F0F", L: "#F3E4C0", C: "#2B2B2B" };

const ITEMS: Record<ItemKind, { rows: string[]; palette: Record<string, string> }> = {
  tenedor: {
    rows: ["KK.KK.KK....", "KSKKSKKSKKK.", "KSSSSSSSSSSK", ".KKKKKKKKKK."],
    palette: SILVER,
  },
  cuchillo: {
    rows: ["KKKKKKKK......", "KSSSSSSSKKKKKK", ".KSSSSSSSHHHHK", "..KKKKKKKKKKK."],
    palette: SILVER,
  },
  cuchara: {
    rows: [".KKK......", "KSSSKKKKKK", "KSsSSSSSSK", ".KKKKKKKK."],
    palette: SILVER,
  },
  cucharon: {
    rows: [".KKKK...........", "KSSSSKKKKKKKKKKK", "KSSSSSSSSSSSSSSK", "KSssSKKKKKKKKKK.", ".KKKK..........."],
    palette: SILVER,
  },
  "tenedor-d": {
    rows: ["......K.K.", ".....KSKSK", "....KSSSSK", "....KSSSK.", "...KSSSK..", "..KSSSK...", ".KSSSK....", "KSSSK.....", "KKKK......"],
    palette: SILVER,
  },
  "cuchillo-d": {
    rows: ["........KKK", ".......KSSK", "......KSSSK", ".....KSSSK.", "....KSSSK..", "...KSSSK...", "..KHHHK....", ".KHHHK.....", "KHHHK......", "KKKK......."],
    palette: SILVER,
  },
  "cuchara-d": {
    rows: [".....KKK.", "....KSSSK", "....KSsSK", "...KSSSK.", "..KSSK...", ".KSSK....", "KSSK.....", "KKK......"],
    palette: SILVER,
  },
  botella: {
    rows: ["..KK..", ".KCCK.", ".KAAK.", ".KAaK.", "KAAAaK", "KLLLLK", "KLLLLK", "KAAAaK", "KAAAaK", ".KKKK."],
    palette: AMBER,
  },
};

export const PIECE_KINDS_ALL: readonly ItemKind[] = [...PIECE_KINDS, "botella"];

const itemCache = new Map<ItemKind, Sprite>();
export function itemSprite(kind: ItemKind): Sprite {
  let s = itemCache.get(kind);
  if (!s) {
    s = build(ITEMS[kind].rows, ITEMS[kind].palette);
    itemCache.set(kind, s);
  }
  return s;
}

/** el mismo cubierto en horizontal, para la pantalla previa */
export function pieceUpright(kind: PieceKind): PieceKind {
  return kind.endsWith("-d") ? (kind.slice(0, -2) as PieceKind) : kind;
}

// ---------------------------------------------------------------------------
// una fuente de 3 × 5 para los carteles de la orilla y el "hic!"
// ---------------------------------------------------------------------------

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
  h: ["K..", "K..", "KKK", "K.K", "K.K"],
  i: [".K.", "...", ".K.", ".K.", ".K."],
  c: ["KKK", "K..", "K..", "K..", "KKK"],
  m: ["K.K", "KKK", "KKK", "K.K", "K.K"],
  "!": [".K.", ".K.", ".K.", "...", ".K."],
  " ": ["...", "...", "...", "...", "..."],
};

export function textSprite(text: string, color: string): Sprite {
  const rows = ["", "", "", "", ""];
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[" "]!;
    for (let i = 0; i < 5; i++) rows[i] += (rows[i] ? "." : "") + glyph[i];
  }
  return build(rows, { K: color });
}

/** un cartel de madera con los metros, clavado en la orilla (el texto adentro, el poste abajo) */
const signCache = new Map<number, Sprite>();
export function signSprite(meters: number): Sprite {
  let s = signCache.get(meters);
  if (!s) {
    const text = textSprite(`${meters}m`, "#2B1A0A");
    const w = text.w + 4;
    const h = 9;
    const board = build(
      Array.from({ length: h }, (_, y) => (y === 0 || y === h - 1 ? "K".repeat(w) : `K${"D".repeat(w - 2)}K`)),
      { K: OUTLINE, D: "#D2A165" },
    );
    const post = build(["KPK", "KPK", "KPK"], { K: OUTLINE, P: "#8B5A2B" });
    s = composeSprite(w, h + 3, [
      { sprite: board, x: 0, y: 0 },
      { sprite: text, x: 2, y: 2 },
      { sprite: post, x: Math.floor(w / 2) - 1, y: h },
    ]);
    signCache.set(meters, s);
  }
  return s;
}

/** el globito "hic!" */
let hic: Sprite | null = null;
export function hicSprite(): Sprite {
  if (!hic) {
    const text = textSprite("hic!", "#1B1B1B");
    const w = text.w + 2;
    const bubble = build(
      Array.from({ length: 7 }, (_, y) => (y === 0 || y === 6 ? `.${"K".repeat(w - 2)}.` : `K${"W".repeat(w - 2)}K`)),
      { K: OUTLINE, W: "#FFFFFF" },
    );
    hic = composeSprite(w, 7, [
      { sprite: bubble, x: 0, y: 0 },
      { sprite: text, x: 1, y: 1 },
    ]);
  }
  return hic;
}

// ---------------------------------------------------------------------------
// el río de mayonesa: un mosaico de 90 × 160 que se repite, con remolinos y
// brillos, y las orillas a los costados
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

export const MAYO = "#F3E7B3";
const MAYO_LIGHT = "#FBF3D2";
const MAYO_DARK = "#E4D48F";
const GLINT = "#FFFFFF";
const BANK = "#6C9A3C";
const BANK_DARK = "#4E7529";
const BANK_EDGE = "#C9B56A";

/** una secuencia fija (no depende de la semilla: es decoración) */
function fixedSequence(): () => number {
  let a = 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function riverRects(): Rect[] {
  const r: Rect[] = [];
  const next = fixedSequence();
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  r.push({ x: 0, y: 0, w: FIELD_W, h: FIELD_H, c: MAYO });
  // remolinos: anillos rotos de 5 × 5 y 7 × 7, claros y oscuros
  for (let i = 0; i < 26; i++) {
    const cx = int(BANK_W + 4, FIELD_W - BANK_W - 5);
    const cy = int(3, FIELD_H - 4);
    const big = next() < 0.4;
    const c = next() < 0.5 ? MAYO_LIGHT : MAYO_DARK;
    if (big) {
      r.push(
        { x: cx - 3, y: cy - 1, w: 1, h: 3, c },
        { x: cx + 3, y: cy - 1, w: 1, h: 3, c },
        { x: cx - 2, y: cy - 3, w: 3, h: 1, c },
        { x: cx - 1, y: cy + 3, w: 3, h: 1, c },
        { x: cx - 2, y: cy - 2, w: 1, h: 1, c },
        { x: cx + 2, y: cy + 2, w: 1, h: 1, c },
        { x: cx, y: cy, w: 1, h: 1, c },
      );
    } else {
      r.push({ x: cx - 2, y: cy, w: 1, h: 2, c }, { x: cx + 2, y: cy - 1, w: 1, h: 2, c }, { x: cx - 1, y: cy - 2, w: 2, h: 1, c }, { x: cx, y: cy + 2, w: 2, h: 1, c });
    }
  }
  // brillos
  for (let i = 0; i < 18; i++) r.push({ x: int(BANK_W + 2, FIELD_W - BANK_W - 3), y: int(0, FIELD_H - 1), w: 2, h: 1, c: GLINT });
  // orillas: pasto con el borde de tierra clara
  r.push({ x: 0, y: 0, w: BANK_W, h: FIELD_H, c: BANK }, { x: FIELD_W - BANK_W, y: 0, w: BANK_W, h: FIELD_H, c: BANK });
  r.push({ x: BANK_W - 1, y: 0, w: 1, h: FIELD_H, c: BANK_EDGE }, { x: FIELD_W - BANK_W, y: 0, w: 1, h: FIELD_H, c: BANK_EDGE });
  for (let y = 2; y < FIELD_H; y += 7) {
    r.push({ x: 0, y, w: 1, h: 2, c: BANK_DARK }, { x: FIELD_W - 2, y: y + 3, w: 1, h: 2, c: BANK_DARK });
  }
  return r;
}
