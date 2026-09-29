// Pixel art de 18 de Julio: el personaje, los pastosos, don pasta, la calle
// y los carteles, sin DOM ni React. Mapas de letras (games/lib/sprites).
//
// Todos los pastosos son pesados de la calle, bien vestidos a su manera, con
// su accesorio (credencial, tablita, volantes, remera de compañía) o el traje
// dorado. Ninguno se dibuja como persona en situación de calle.

import { buildSprite as build, flipSprite, OUTLINE, type Sprite } from "../lib/sprites";
import { FIELD_H, FIELD_W, SIDEWALK_W, type Kind, type Phase } from "./rules";

export type { Sprite };

export const KINDS_ALL: readonly Kind[] = ["promotor", "firmas", "volantes", "celular", "donpasta"];

const K = OUTLINE;

// ---------------------------------------------------------------------------
// el personaje: 12 × 18, de espaldas (camina hacia arriba), apurado, con
// auriculares y mochila; tres cuadros de caminata
// ---------------------------------------------------------------------------

export const WALKER_SPRITE_W = 12;
export const WALKER_SPRITE_H = 18;

const WALKER: Record<string, string> = {
  K,
  H: "#2B1D12", // pelo
  A: "#F2F2F2", // auriculares
  a: "#6FD3E0",
  S: "#EFC9A2", // piel (cuello y manos)
  T: "#4A66C8", // remera
  M: "#3E8E5A", // mochila
  m: "#2E6B44",
  P: "#2F3A4A", // pantalón
  W: "#F7F7F7", // zapatillas
};

function walkerRows(frame: 0 | 1 | 2): string[] {
  const rows = [
    "....KKKK....", // 0 cabeza (de atrás)
    "..AKHHHHKA..", // 1 auriculares
    "..AKHHHHKA..",
    "...KHHHHK...",
    "....KSSK....", // 4 cuello
    "..KKTTTTKK..", // 5 hombros
    ".KTKMMMMKTK.", // 6 mochila
    ".KTKMmMMKTK.",
    ".KTKMMMMKTK.",
    ".KTKMMmMKTK.",
    ".KSKMMMMKSK.", // 10 manos
    ".KKKmmmmKKK.",
    "...KTTTTK...",
    "...KPPPPK...", // 13 pantalón
    "...KPKKPK...",
    "...KPK.KPK..".slice(0, 12),
    "...KWK.KWK..".slice(0, 12),
    "...KKK.KKK..".slice(0, 12),
  ];
  if (frame === 1) {
    rows[15] = "..KPK...KPK.";
    rows[16] = "..KWK...KWK.";
    rows[17] = "..KKK...KKK.";
  } else if (frame === 2) {
    rows[14] = "...KPPKKK...";
    rows[15] = "...KPK.KPK..".slice(0, 12);
    rows[16] = "...KWK..KWK.".slice(0, 12);
    rows[17] = "...KKK..KKK.".slice(0, 12);
  }
  return rows;
}

const walkerCache = new Map<number, Sprite>();
export function walkerSprite(frame: 0 | 1 | 2): Sprite {
  let s = walkerCache.get(frame);
  if (!s) {
    s = build(walkerRows(frame), WALKER);
    walkerCache.set(frame, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// los pastosos: 12 × 16, de frente cuando vienen y de espaldas cuando se van.
// Se distinguen por el accesorio y el color de la ropa.
// ---------------------------------------------------------------------------

export const PASTOSO_SPRITE_W = 12;
export const PASTOSO_SPRITE_H = 16;

const PEOPLE: Record<string, string> = {
  K,
  S: "#E7BC8E", // piel
  s: "#C9976A",
  E: "#1B1B1B",
  m: "#B5524A",
  H: "#3A2A1A", // pelo
  h: "#8A6A3A",
  W: "#F7F7F7",
  C: "#D9482B", // credencial roja
  c: "#F7D23E", // folleto de tarjeta
  B: "#8B5A2B", // tablita
  b: "#F2EBDD", // hoja
  L: "#3B6BD6", // lapicera
  V: "#FFB13B", // volantes
  v: "#FFE39A",
  N: "#2F3A4A", // pantalón
  P: "#7A4E27",
  R: "#E23B6B", // remera de compañía
  T: "#1F1F26", // tablet
  t: "#6FD3E0",
  G: "#8A8A94", // camisa gris
  A: "#3F7F5A", // chaleco verde
};

/** de frente: cabeza y cuerpo base; el accesorio va en las manos (filas 8 a 11) */
function personFront(shirt: string, hair: string, accessory: string[]): string[] {
  const rows = [
    "....KKKK....", // 0
    `...K${hair}${hair}${hair}${hair}K...`,
    `..K${hair}SSSS${hair}K..`,
    "..KSESSESK..", // 3 ojos
    "..KSSSSSSK..",
    "...KSmmSK...",
    "....KSSK....", // 6 cuello
    `..KK${shirt}${shirt}${shirt}${shirt}KK..`,
    `.K${shirt}K${shirt}${shirt}${shirt}${shirt}K${shirt}K.`, // 8 brazos
    `.K${shirt}K${shirt}${shirt}${shirt}${shirt}K${shirt}K.`,
    `.KSK${shirt}${shirt}${shirt}${shirt}KSK.`, // 10 manos
    `.KKK${shirt}${shirt}${shirt}${shirt}KKK.`,
    "...KNNNNK...", // 12
    "...KNKKNK...",
    "...KNK.KNK.".slice(0, 12).padEnd(12, "."),
    "...KKK.KKK..",
  ];
  accessory.forEach((r, i) => (rows[8 + i] = r));
  return rows;
}

/** de espaldas: se va a su puerta */
function personBack(shirt: string, hair: string): string[] {
  return [
    "....KKKK....",
    `...K${hair}${hair}${hair}${hair}K...`,
    `..K${hair}${hair}${hair}${hair}${hair}${hair}K..`,
    `..K${hair}${hair}${hair}${hair}${hair}${hair}K..`,
    `...K${hair}${hair}${hair}${hair}K...`,
    "....KSSK....",
    "....KSSK....",
    `..KK${shirt}${shirt}${shirt}${shirt}KK..`,
    `.K${shirt}K${shirt}${shirt}${shirt}${shirt}K${shirt}K.`,
    `.K${shirt}K${shirt}${shirt}${shirt}${shirt}K${shirt}K.`,
    `.KSK${shirt}${shirt}${shirt}${shirt}KSK.`,
    `.KKK${shirt}${shirt}${shirt}${shirt}KKK.`,
    "...KNNNNK...",
    "...KNKKNK...",
    "...KNK.KNK..".slice(0, 12),
    "...KKK.KKK..",
  ];
}

const KIND_ART: Record<Exclude<Kind, "donpasta">, { shirt: string; hair: string; accessory: string[] }> = {
  // credencial roja colgada y el folleto amarillo de la tarjeta en la mano
  promotor: { shirt: "G", hair: "H", accessory: [".KGKGCCGGKGK.", ".KGKGCCGGKGK.", ".KSKGGGGKccK.", ".KKKGGGGKccK."] },
  // la tablita con la hoja y la lapicera
  firmas: { shirt: "A", hair: "h", accessory: [".KAKAAAAKAK.", ".KAKAAAAKBBK", ".KSKAAAAKbLK", ".KKKAAAAKbbK"] },
  // la pila de volantes contra el pecho
  volantes: { shirt: "W", hair: "H", accessory: [".KWKVVVVKWK.", ".KWKvVVvKWK.", ".KSKVVVVKSK.", ".KKKvvvvKKK."] },
  // la remera de color de la compañía y la tablet
  celular: { shirt: "R", hair: "h", accessory: [".KRKRRRRKRK.", ".KRKRRRRKTTK", ".KSKRRRRKttK", ".KKKRRRRKTTK"] },
};

// ---------------------------------------------------------------------------
// don pasta: 14 × 18, traje dorado brillante, sonrisa grande; la cara cambia
// con cada toque (0 a 3) y al cuarto se va de espaldas
// ---------------------------------------------------------------------------

export const DONPASTA_SPRITE_W = 14;
export const DONPASTA_SPRITE_H = 18;

const GOLD: Record<string, string> = {
  K,
  S: "#E7BC8E",
  E: "#1B1B1B",
  m: "#B5524A",
  W: "#FFFFFF", // dientes
  H: "#1F1F26", // pelo engominado
  D: "#F7D23E", // traje dorado
  d: "#C99A1E",
  g: "#FFF3B0", // brillo
  N: "#F7D23E",
  Z: "#2A1B10", // zapatos
  T: "#D9482B", // corbata
  X: "#6FD3E0", // gotita
};

function donPastaRows(stage: 0 | 1 | 2 | 3): string[] {
  const mouths = ["....KSWWWWSK..", "....KSSWWSSK..", "....KSSmmSSK..", "....KSmSSmSK.."];
  const eyes = ["...KSESSSSESK.", "...KSESSSSESK.", "...KSEESSEESK.", "...KKESSSSEKK."];
  const rows = [
    ".....KKKK.....",
    "....KHHHHK....",
    "...KHHHHHHK...",
    "...KSSSSSSK...",
    eyes[stage]!,
    "...KSSSSSSK...",
    mouths[stage]!,
    ".....KSSK.....",
    "..KKDDDTDDKK..", // 8 hombros con corbata
    ".KDKDDgTDDDKDK",
    ".KDKDDDTgDDKDK",
    ".KDKDgDDDDDKDK",
    ".KSKDDDDgDDKSK", // 12 manos
    ".KKKDDDDDDDKKK",
    "...KddddddK...",
    "...KddKKddK...",
    "...KddK.KddK..",
    "...KZZK.KZZK..",
  ];
  if (stage >= 2) {
    // le cae una gotita de sudor
    rows[3] = "...KSSSSSSKX..";
  }
  return rows;
}

function donPastaBack(): string[] {
  return [
    ".....KKKK.....",
    "....KHHHHK....",
    "...KHHHHHHK...",
    "...KHHHHHHK...",
    "....KHHHHK....",
    ".....KSSK.....",
    ".....KSSK.....",
    "..KKDDDDDDKK..",
    ".KDKDDDDDDDKDK",
    ".KDKDDgDDDDKDK",
    ".KDKDDDDDgDKDK",
    ".KDKDDDDDDDKDK",
    ".KSKDDDDDDDKSK",
    ".KKKDDDDDDDKKK",
    "...KddddddK...",
    "...KddKKddK...",
    "...KddK.KddK..",
    "...KZZK.KZZK..",
  ];
}

const pastosoCache = new Map<string, Sprite>();
/** el pastoso según su tipo, si viene o se va, y (don pasta) cuántos toques lleva */
export function pastosoSprite(kind: Kind, phase: Phase, hits: number, frame: 0 | 1 = 0): Sprite {
  const stage = Math.max(0, Math.min(3, hits)) as 0 | 1 | 2 | 3;
  const key = `${kind}:${phase}:${stage}:${frame}`;
  let s = pastosoCache.get(key);
  if (!s) {
    if (kind === "donpasta") {
      s = build(phase === "se-va" ? donPastaBack() : donPastaRows(stage), GOLD);
    } else {
      const art = KIND_ART[kind];
      const rows = phase === "se-va" ? personBack(art.shirt, art.hair) : personFront(art.shirt, art.hair, art.accessory);
      if (frame === 1) {
        // un paso: las piernas cambian
        rows[14] = "..KNK...KNK.";
        rows[15] = "..KKK...KKK.";
      }
      s = build(rows, PEOPLE);
    }
    if (frame === 1 && kind !== "donpasta" && phase === "viene") s = flipSprite(s);
    pastosoCache.set(key, s);
  }
  return s;
}

/** una vida: una zapatilla */
export function shoeSprite(on: boolean): Sprite {
  const rows = ["....KKKK..", "...KWWWWK.", "KKKWWWWWWK", "KwwwwwwwwK", "KKKKKKKKKK"];
  return build(rows, on ? { K, W: "#F7F7F7", w: "#6FD3E0" } : { K: "#3A3A44", W: "#4E4E58", w: "#44444E" });
}

// ---------------------------------------------------------------------------
// la calle: un mosaico de 90 × 160 que se repite (veredas, edificios con
// puertas y galerías, kioscos, una parada y árboles) y carteles de esquina
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

export const STREET = "#4A4A52";
const STREET_LINE = "#D8D2A0";
const SIDEWALK = "#A9A6A0";
const SIDEWALK_LINE = "#8F8C86";
const BUILDING = "#B9836A";
const BUILDING_2 = "#C9B4A0";
const WINDOW = "#3B4A5E";
const DOOR = "#5E3A1A";
const GALLERY = "#2A2A34";
const KIOSK = "#D9482B";
const KIOSK_2 = "#F7D23E";
const STOP = "#3B6BD6";
const TREE = "#3E8E5A";
const TREE_2 = "#2E6B44";
const TRUNK = "#6E4B24";

function fixedSequence(): () => number {
  let a = 0x1234567;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** el mosaico: no depende de la semilla, es decoración */
export function streetRects(): Rect[] {
  const r: Rect[] = [];
  const next = fixedSequence();
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  // calzada y línea del medio
  r.push({ x: 0, y: 0, w: FIELD_W, h: FIELD_H, c: STREET });
  for (let y = 0; y < FIELD_H; y += 12) r.push({ x: FIELD_W / 2, y, w: 1, h: 6, c: STREET_LINE });
  // veredas
  r.push({ x: 0, y: 0, w: SIDEWALK_W, h: FIELD_H, c: SIDEWALK }, { x: FIELD_W - SIDEWALK_W, y: 0, w: SIDEWALK_W, h: FIELD_H, c: SIDEWALK });
  r.push({ x: SIDEWALK_W - 1, y: 0, w: 1, h: FIELD_H, c: SIDEWALK_LINE }, { x: FIELD_W - SIDEWALK_W, y: 0, w: 1, h: FIELD_H, c: SIDEWALK_LINE });
  for (let y = 0; y < FIELD_H; y += 8) {
    r.push({ x: 0, y, w: SIDEWALK_W - 1, h: 1, c: SIDEWALK_LINE }, { x: FIELD_W - SIDEWALK_W + 1, y, w: SIDEWALK_W - 1, h: 1, c: SIDEWALK_LINE });
  }
  // edificios: una franja de 6 unidades pegada al borde, con ventanas, puertas y galerías
  for (const side of [0, FIELD_W - 6]) {
    let y = 0;
    while (y < FIELD_H) {
      const h = int(18, 30);
      r.push({ x: side, y, w: 6, h: Math.min(h, FIELD_H - y), c: next() < 0.5 ? BUILDING : BUILDING_2 });
      r.push({ x: side, y: Math.min(y + h - 1, FIELD_H - 1), w: 6, h: 1, c: K });
      for (let wy = y + 2; wy < y + h - 8 && wy < FIELD_H - 3; wy += 5) r.push({ x: side + 1, y: wy, w: 2, h: 3, c: WINDOW }, { x: side + 3, y: wy, w: 2, h: 3, c: WINDOW });
      // la puerta o la galería, abajo
      const door = next() < 0.6;
      if (y + h - 7 > 0 && y + h - 1 < FIELD_H) r.push({ x: side + 1, y: y + h - 7, w: 4, h: 6, c: door ? DOOR : GALLERY });
      y += h;
    }
  }
  // kioscos, parada y árboles sobre la vereda
  r.push({ x: 7, y: 30, w: 6, h: 6, c: KIOSK }, { x: 7, y: 30, w: 6, h: 1, c: KIOSK_2 }, { x: 9, y: 33, w: 2, h: 2, c: KIOSK_2 });
  r.push({ x: FIELD_W - 13, y: 110, w: 6, h: 6, c: KIOSK }, { x: FIELD_W - 13, y: 110, w: 6, h: 1, c: KIOSK_2 });
  r.push({ x: FIELD_W - 12, y: 60, w: 5, h: 7, c: STOP }, { x: FIELD_W - 12, y: 60, w: 5, h: 1, c: "#F7F7F7" });
  for (const [x, y] of [
    [9, 80],
    [9, 130],
    [FIELD_W - 11, 20],
    [FIELD_W - 11, 150],
  ] as const) {
    r.push({ x: x + 1, y: y + 4, w: 1, h: 3, c: TRUNK });
    r.push({ x: x - 1, y: y + 1, w: 5, h: 3, c: TREE }, { x, y, w: 3, h: 1, c: TREE }, { x, y: y + 3, w: 3, h: 1, c: TREE_2 });
  }
  return r;
}
