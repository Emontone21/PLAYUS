// Pixel art de la parrilla, el bro y el canario, sin DOM ni React. Mapas de
// letras (games/lib/sprites): una letra por unidad lógica, "." transparente.

import { buildSprite as build, flipSprite, OUTLINE, type Sprite } from "../lib/sprites";

export type { Sprite };

/** la escena: un parrillero de costado, 96 × 64 unidades */
export const FIELD_W = 96;
export const FIELD_H = 64;
/** el piso empieza acá */
export const FLOOR_Y = 56;

// ---------------------------------------------------------------------------
// el canario: 18 × 30, vestido de chef (gorro alto, chaqueta blanca) y con
// un porro en la boca. Todos los estados miden lo mismo: cambia la vista.
// ---------------------------------------------------------------------------

export const CANARIO_W = 18;
export const CANARIO_H = 30;
export const CANARIO_STATES = ["espaldas", "aviso", "amague", "girando", "mirando", "volviendo", "visto"] as const;
export type CanarioLook = (typeof CANARIO_STATES)[number];

const CHEF: Record<string, string> = {
  K: OUTLINE,
  W: "#F7F7F7", // gorro y chaqueta
  w: "#D8D8DC",
  H: "#3A2A1A", // pelo
  S: "#E7BC8E", // piel
  s: "#C9976A",
  E: "#1B1B1B", // ojos
  R: "#B5524A", // boca
  J: "#F2EBDD", // el porro
  O: "#FF7A1A", // la brasa del porro
  B: "#2A2A2A", // botones
  P: "#2F3A4A", // pantalón
};

/** el gorro alto: filas 0 a 7, con un corrimiento para sacudirlo */
function hat(shift: number): string[] {
  const rows = ["......KKKKKK......", ".....KWWWWWWK.....", ".....KWWWWWWK.....", ".....KWWWWWWK.....", ".....KWWWWWWK.....", ".....KWWWWWWK.....", "....KKWWWWWWKK....", "....KwwwwwwwwK...."];
  if (shift === 0) return rows;
  return rows.map((r) => (shift > 0 ? "." + r.slice(0, -1) : r.slice(1) + "."));
}

/** de espaldas: nuca, chaqueta y los brazos; `arm` levanta el brazo derecho (picando) */
function back(arm: 0 | 1, hatShift = 0): string[] {
  const body = [
    "....KHHHHHHHHK....", // 8 nuca
    "....KHHHHHHHHK....",
    ".....KHHHHHHK.....",
    ".....KSSSSSSK.....", // 11 cuello
    "...KKWWWWWWWWKK...", // 12 hombros
    "..KWWWWWWWWWWWWK..",
    ".KWWKWWWWWWWWKWWK.", // 14 brazos
    ".KWWKWWWWWWWWKWWK.",
    ".KWWKWWWWWWWWKWWK.",
    ".KWWKWWWWWWWWKWWK.",
    ".KSSKWWWWWWWWKSSK.", // 18 manos
    ".KKKKWWWWWWWWKKKK.",
    "....KWWWWWWWWK....",
    "....KWWWWWWWWK....",
    "....KPPPPPPPPK....", // 22 pantalón
    "....KPPPPPPPPK....",
    "....KPPPPPPPPK....",
    "....KPPPKKPPPK....",
    "....KPPPK.KPPPK...".slice(0, 18),
    "....KPPPK.KPPPK...".slice(0, 18),
    "....KKKKK.KKKKK...".slice(0, 18),
    "..................",
  ];
  if (arm === 1) {
    // el brazo derecho (a la derecha del dibujo) sube: la mano queda a la altura del codo
    body[14] = ".KWWKWWWWWWWWKSSK.";
    body[15] = ".KWWKWWWWWWWWKKKK.";
    body[16] = ".KWWKWWWWWWWWK....";
    body[17] = ".KWWKWWWWWWWWK....";
    body[18] = ".KSSKWWWWWWWWK....";
    body[19] = ".KKKKWWWWWWWWK....";
  }
  return [...hat(hatShift), ...body];
}

/** de frente: la cara, con los ojos según el gesto; `point` extiende el brazo izquierdo (hacia el bro) */
function front(eyes: "entrecerrados" | "abiertos", point: boolean): string[] {
  const eyeRows = eyes === "entrecerrados" ? ["....KSSSSSSSSK....", "....KSKKSSKKSK...."] : ["....KSEESSEESK....", "....KSEESSEESK...."];
  const mouth = eyes === "abiertos" ? "OJJJKSSRRRRSSK...." : "OJJJKSSSRRSSSK....";
  const body = [
    "....KSSSSSSSSK....", // 8 frente
    ...eyeRows, // 9, 10
    "....KSSSSsSSSK....", // 11 nariz
    mouth, // 12 boca con el porro hacia el bro
    ".....KsSSSSsK.....", // 13 mentón
    "...KKWWWWWWWWKK...", // 14 hombros
    "..KWWWWWWBWWWWWK..",
    ".KWWKWWWWBWWWWKWWK",
    ".KWWKWWWWBWWWWKWWK",
    ".KWWKWWWWBWWWWKWWK",
    ".KWWKWWWWBWWWWKWWK",
    ".KSSKWWWWBWWWWKSSK", // 20 manos
    ".KKKKWWWWWWWWWKKKK",
    "....KPPPPPPPPK....",
    "....KPPPPPPPPK....",
    "....KPPPPPPPPK....",
    "....KPPPKKPPPK....",
    "....KPPPK.KPPPK...".slice(0, 18),
    "....KPPPK.KPPPK...".slice(0, 18),
    "....KKKKK.KKKKK...".slice(0, 18),
    "..................",
  ];
  if (point) {
    // el brazo izquierdo (a la izquierda del dibujo) se extiende horizontal, señalando al bro
    body[8] = "KKKKKWWWWBWWWWKWWK".slice(0, 0) + body[8]!;
    body[6] = "KSSKKWWWWWWWWBWWWWKWWK".slice(0, 18);
    body[6] = "KSSKWWWWWWWWBWWWWK";
    body[7] = "KKKKKWWWWWWWBWWWWK".slice(0, 18);
    body[7] = ".KKKKWWWWWWWBWWWWK";
    body[8] = "....KWWWWWWWBWWWWK".slice(0, 0) + ".....KWWWWWWBWWWWK";
    body[9] = ".....KWWWWWWBWWWWK";
    body[10] = ".....KWWWWWWBWWWWK";
    body[11] = ".....KWWWWWWBWWWWK";
    body[12] = ".....KWWWWWWBWWWWK";
    body[13] = ".....KKKKKKKKKKWWK".slice(0, 0) + ".....KKKKKKKKKKKKK";
  }
  return [...hat(0), ...body];
}

/** de perfil, mirando hacia el bro (a la izquierda): la nariz, el porro adelante */
function profile(): string[] {
  const body = [
    ".....KSSSSSSSK....", // 8
    "....KSSSSSSSSK....",
    "....KSESSSSSSK....", // 10 un ojo
    "...KSSSSSSSSSK....", // 11 nariz
    "OJJKSRSSSSSSSK....", // 12 boca y porro
    ".....KsSSSSSK.....",
    "....KKWWWWWWKK....", // 14 hombros de perfil
    "...KWWWWWWWWWWK...",
    "...KWWWKWWWWWWK...",
    "...KWWWKWWWWWWK...",
    "...KWWWKWWWWWWK...",
    "...KWWWKWWWWWWK...",
    "...KSSSKWWWWWWK...", // 20 mano
    "...KKKKWWWWWWWK...",
    "....KPPPPPPPPK....",
    "....KPPPPPPPPK....",
    "....KPPPPPPPPK....",
    "....KPPPPPPPPK....",
    "....KPPPPPPPPK....",
    "....KPPPPPPPPK....",
    "....KKKKKKKKKK....",
    "..................",
  ];
  return [...hat(0), ...body];
}

const canarioCache = new Map<string, Sprite>();
/** el canario en un estado y un cuadro de animación (0 o 1). Aviso y amague son idénticos. */
export function canarioSprite(look: CanarioLook, frame: 0 | 1 = 0): Sprite {
  const key = `${look}:${frame}`;
  let s = canarioCache.get(key);
  if (!s) {
    switch (look) {
      case "espaldas":
        s = build(back(frame), CHEF);
        break;
      case "aviso":
      case "amague":
        // frena de cocinar y el gorro se sacude
        s = build(back(0, frame === 0 ? 1 : -1), CHEF);
        break;
      case "girando":
        s = build(profile(), CHEF);
        break;
      case "volviendo":
        s = flipSprite(build(profile(), CHEF));
        break;
      case "mirando":
        s = build(front("entrecerrados", false), CHEF);
        break;
      case "visto":
        s = build(front("abiertos", true), CHEF);
        break;
    }
    canarioCache.set(key, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// el bro: 16 × 24, común y corriente (remera lisa, pelo corto); con el brazo
// extendido hacia la parrilla cuando toca (columnas de la izquierda)
// ---------------------------------------------------------------------------

export const BRO_W = 16;
export const BRO_H = 24;

const BRO: Record<string, string> = {
  K: OUTLINE,
  H: "#2B1D12", // pelo
  S: "#F0C9A0", // piel
  E: "#1B1B1B",
  R: "#B5524A",
  T: "#3FA36B", // remera lisa
  t: "#2E7F52",
  P: "#3B5BA5", // jean
  W: "#F2F2F2", // zapatillas
};

function broRows(touching: boolean): string[] {
  const rows = [
    ".....KKKKKK.....", // 0 pelo
    "....KHHHHHHK....",
    "....KHHHHHHK....",
    "....KSSSSSSK....", // 3 cara
    "....KSESSESK....",
    "....KSSSSSSK....",
    "....KSSRRSSK....",
    ".....KSSSSK.....",
    "....KKTTTTKK....", // 8 hombros
    "...KTTTTTTTTK...",
    "..KTKTTTTTTKTK..", // 10 brazos
    "..KTKTTTtTTKTK..",
    "..KTKTTTTTTKTK..",
    "..KSKTTTTTTKSK..", // 13 manos
    "..KKKTTTTTTKKK..",
    "....KTTTTTTK....",
    "....KTTTTTTK....",
    "....KPPPPPPK....", // 17 jean
    "....KPPPPPPK....",
    "....KPPKKPPK....",
    "....KPPK.KPPK...".slice(0, 16),
    "....KPPK.KPPK...".slice(0, 16),
    "...KWWWK.KWWWK..".slice(0, 16),
    "...KKKKK.KKKKK..".slice(0, 16),
  ];
  if (touching) {
    // el brazo izquierdo se estira horizontal hacia la parrilla
    rows[10] = "KKKKKTTTTTTKTK..";
    rows[11] = "KSSTTTTTtTTKTK..";
    rows[12] = "KKKKKTTTTTTKTK..";
    rows[13] = "....KTTTTTTKSK..";
    rows[14] = "....KTTTTTTKKK..";
  }
  return rows;
}

const broCache = new Map<string, Sprite>();
export function broSprite(touching: boolean): Sprite {
  const key = String(touching);
  let s = broCache.get(key);
  if (!s) {
    s = build(broRows(touching), BRO);
    broCache.set(key, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// la parrilla (un asador con brasas y chorizos), la mesada del canario y el
// fondo del parrillero
// ---------------------------------------------------------------------------

export const GRILL_W = 30;
export const GRILL_H = 22;

const GRILL: Record<string, string> = {
  K: OUTLINE,
  L: "#9A4A2E", // ladrillos
  l: "#7A3722",
  M: "#C9B99A", // junta
  G: "#4A4A50", // la parrilla (rejilla)
  g: "#2F2F35",
  C: "#8A3B1E", // chorizos
  c: "#B4552E",
  B: "#FF6A00", // brasas
  b: "#FFB13B",
  d: "#7A1E00",
};

function grillRows(embers: 0 | 1): string[] {
  const e1 = embers === 0 ? "KdBbBdBBbBdBbBBdBbBdBBbBdBbBdK" : "KBbBdBbBdBBbBdBbBdBbBBdBbBdBBK";
  const e2 = embers === 0 ? "KbBdBBbBdBbBBdBbBdBbBdBBbBdBbK" : "KdBBbBdBbBdBbBBdBbBdBBbBdBbBdK";
  return [
    "..KKKKKKKKKKKKKKKKKKKKKKKKKK..", // 0
    "..KcCCCcKKKcCCCcKKKKcCCCcKKK..", // 1 chorizos sobre la rejilla
    ".KCCCCCCCKKCCCCCCCKKCCCCCCCKK.",
    ".KKCCCCCKKKKCCCCCKKKKCCCCCKKKK",
    "KGgGgGgGgGgGgGgGgGgGgGgGgGgGgK", // 4 rejilla
    "KgGgGgGgGgGgGgGgGgGgGgGgGgGgGK",
    e1, // 6 brasas
    e2,
    e1,
    "KLLLMLLLLMLLLLMLLLLMLLLLMLLLLK", // 9 ladrillos
    "KMMMMMMMMMMMMMMMMMMMMMMMMMMMMK",
    "KLMLLLLMLLLLMLLLLMLLLLMLLLLMLK",
    "KMMMMMMMMMMMMMMMMMMMMMMMMMMMMK",
    "KLLLMLLLLMLLLLMLLLLMLLLLMLLLLK",
    "KMMMMMMMMMMMMMMMMMMMMMMMMMMMMK",
    "KLMLLLLMLLLLMLLLLMLLLLMLLLLMLK",
    "KMMMMMMMMMMMMMMMMMMMMMMMMMMMMK",
    "KLLLMLLLLMLLLLMLLLLMLLLLMLLLLK",
    "KlllMllllMllllMllllMllllMllllK",
    "KMMMMMMMMMMMMMMMMMMMMMMMMMMMMK",
    "KlMllllMllllMllllMllllMllllMlK",
    "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  ];
}

const grillCache = new Map<number, Sprite>();
export function grillSprite(embers: 0 | 1): Sprite {
  let s = grillCache.get(embers);
  if (!s) {
    s = build(grillRows(embers), GRILL);
    grillCache.set(embers, s);
  }
  return s;
}

export const COUNTER_W = 34;
export const COUNTER_H = 16;
const COUNTER: Record<string, string> = { K: OUTLINE, T: "#D2A165", t: "#B5834A", F: "#8B5A2B", f: "#6E4420", V: "#5BC236", v: "#3E9A22", N: "#C9C9D3" };
let counter: Sprite | null = null;
export function counterSprite(): Sprite {
  if (!counter) {
    counter = build(
      [
        "..........KVVK....KNNNNNK.........",
        ".........KVvVVK...KNNNNNK.........",
        "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTK",
        "KttttttttttttttttttttttttttttttttK",
        "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "KFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFK",
        "KFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFK",
        "KFffFFFFFFFFFFFFffFFFFFFFFFFFFffFK",
        "KFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFK",
        "KFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFK",
        "KFffFFFFFFFFFFFFffFFFFFFFFFFFFffFK",
        "KFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFK",
        "KFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFK",
        "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "..................................",
      ],
      COUNTER,
    );
  }
  return counter;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

export const WALL = "#C8A27A";
const WALL_LINE = "#B08A62";
const FLOOR = "#8E8E96";
const FLOOR_LINE = "#74747C";

/** el fondo: pared de ladrillo apagada y piso de baldosas */
export function backgroundRects(): Rect[] {
  const r: Rect[] = [];
  r.push({ x: 0, y: 0, w: FIELD_W, h: FLOOR_Y, c: WALL });
  for (let y = 4; y < FLOOR_Y; y += 5) {
    r.push({ x: 0, y, w: FIELD_W, h: 1, c: WALL_LINE });
    const off = (Math.floor(y / 5) % 2) * 5;
    for (let x = off; x < FIELD_W; x += 10) r.push({ x, y: y - 4, w: 1, h: 4, c: WALL_LINE });
  }
  r.push({ x: 0, y: FLOOR_Y, w: FIELD_W, h: FIELD_H - FLOOR_Y, c: FLOOR });
  r.push({ x: 0, y: FLOOR_Y, w: FIELD_W, h: 1, c: FLOOR_LINE });
  for (let x = 6; x < FIELD_W; x += 12) r.push({ x, y: FLOOR_Y + 1, w: 1, h: FIELD_H - FLOOR_Y - 1, c: FLOOR_LINE });
  r.push({ x: 0, y: FLOOR_Y + 4, w: FIELD_W, h: 1, c: FLOOR_LINE });
  return r;
}
