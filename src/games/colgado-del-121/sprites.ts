// Pixel art de "colgado del 121": el pasajero (parado, inclinado, revoleando
// los brazos y en el piso) y el interior del ómnibus (asientos, ventanillas,
// pasamanos), sin DOM ni React.

import { buildSprite as build, flipSprite, OUTLINE, type Sprite } from "../lib/sprites";

export type { Sprite };
const K = OUTLINE;

// ---------------------------------------------------------------------------
// el pasajero: 14 × 26, de frente
// ---------------------------------------------------------------------------

const P: Record<string, string> = { K, H: "#3B2314", S: "#E0A47A", E: "#1B1B1B", T: "#F2C94C", t: "#D9AE2E", J: "#2F4F8A", j: "#243D6B", Z: "#1B1B1F", W: "#FFFFFF" };

const STAND = [
  ".....KKKK.....",
  "....KHHHHK....",
  "....KHHHHK....",
  "....KSSSSK....",
  "....KSESEK....",
  "....KSSSSK....",
  ".....KSSK.....",
  "...KKTTTTKK...",
  "..KSKTTTTKSK..",
  "..KSKTtTTKSK..",
  "..KSKTTTTKSK..",
  "..KSKTTTTKSK..",
  "..KSKTTTTKSK..",
  "..KKKTTTTKKK..",
  "....KJJJJK....",
  "....KJjJJK....",
  "....KJJJJK....",
  "....KJJJJK....",
  "....KJKKJK....",
  "....KJK.KJK...",
  "....KJK.KJK...",
  "....KJK.KJK...",
  "....KJK.KJK...",
  "...KZZK.KZZK..",
  "...KZZK.KZZK..",
  "...KKKK.KKKK..",
];

/** inclinado hacia la derecha (el cuerpo se va para ese lado) */
const LEAN = [
  "......KKKK....",
  ".....KHHHHK...",
  ".....KHHHHK...",
  ".....KSSSSK...",
  ".....KSESEK...",
  ".....KSSSSK...",
  "......KSSK....",
  "....KKTTTTKK..",
  "...KSKTTTTKSK.",
  "...KSKTtTTKSK.",
  "...KSKTTTTKSK.",
  "...KSKTTTTKSK.",
  "..KSKTTTTKSK..",
  "..KKKTTTTKKK..",
  "....KJJJJK....",
  "....KJjJJK....",
  "....KJJJJK....",
  "....KJJJJK....",
  "....KJKKJK....",
  "....KJK.KJK...",
  "....KJK.KJK...",
  "....KJK.KJK...",
  "....KJK.KJK...",
  "...KZZK.KZZK..",
  "...KZZK.KZZK..",
  "...KKKK.KKKK..",
];

/** revoleando los brazos (dos cuadros), hacia la derecha */
const FLAIL_A = [
  "KS....KKKK...K",
  "KSK..KHHHHK.KS",
  ".KSK.KHHHHK.KS",
  "..KSKKSSSSKKSK",
  "...KSKSESEKSK.",
  "....KSSSSSSK..",
  ".....KKSSKK...",
  "....KKTTTTKK..",
  "....KTTTTTTK..",
  "....KTTtTTTK..",
  "....KTTTTTTK..",
  "....KTTTTTTK..",
  "...KTTTTTTK...",
  "...KKTTTTKK...",
  "....KJJJJK....",
  "....KJjJJK....",
  "....KJJJJK....",
  "....KJJJJK....",
  "....KJKKJK....",
  "....KJK.KJK...",
  "....KJK.KJK...",
  "....KJK.KJK...",
  "....KJK.KJK...",
  "...KZZK.KZZK..",
  "...KZZK.KZZK..",
  "...KKKK.KKKK..",
];
const FLAIL_B = [
  "......KKKK....",
  ".....KHHHHK...",
  "KSK..KHHHHK.KS",
  "KSSK.KSSSSK.KS",
  ".KSSKKSESEKKSK",
  "..KSSKSSSSKSK.",
  "...KKKKSSKKK..",
  "....KKTTTTKK..",
  "....KTTTTTTK..",
  "....KTTtTTTK..",
  "....KTTTTTTK..",
  "....KTTTTTTK..",
  "...KTTTTTTK...",
  "...KKTTTTKK...",
  "....KJJJJK....",
  "....KJjJJK....",
  "....KJJJJK....",
  "....KJJJJK....",
  "....KJKKJK....",
  "....KJK.KJK...",
  "....KJK.KJK...",
  "....KJK.KJK...",
  "....KJK.KJK...",
  "...KZZK.KZZK..",
  "...KZZK.KZZK..",
  "...KKKK.KKKK..",
];

/** en el piso, hacia la derecha: 26 × 14 (el de parado acostado) */
const DOWN = [
  "..........................",
  "....KKKK..KKKKK...KKKKK...",
  "...KZZKKKKJJJJJKKKTTTTKKK.",
  "..KZZJJJJJJjJJJTTTTtTTSSK.",
  "..KZZJJJJJJJJJJTTTTTTTSEKK",
  "..KKKJJJJJJJJJJTTTTTTTSEHK",
  "....KKKKKJJJJJJTTTTTTTSSHK",
  "....KZZJJJJJJJJTTTTTTTHHHK",
  "...KZZZJJJJJJJJTTTTTTTHHHK",
  "...KZZKKKKKKKKKKTTTTKKKKK.",
  "....KKK........KSSSSK.....",
  "...............KKKKK......",
  "..........................",
  "..........................",
];

export type Pose = "parado" | "izq" | "der" | "revoleo-izq" | "revoleo-der" | "piso-izq" | "piso-der";

const cache = new Map<string, Sprite>();
export function passengerSprite(pose: Pose, frame: 0 | 1 = 0): Sprite {
  const key = `${pose}:${frame}`;
  let s = cache.get(key);
  if (s) return s;
  switch (pose) {
    case "parado":
      s = build(STAND, P);
      break;
    case "der":
      s = build(LEAN, P);
      break;
    case "izq":
      s = flipSprite(build(LEAN, P));
      break;
    case "revoleo-der":
      s = build(frame === 0 ? FLAIL_A : FLAIL_B, P);
      break;
    case "revoleo-izq":
      s = flipSprite(build(frame === 0 ? FLAIL_A : FLAIL_B, P));
      break;
    case "piso-der":
      s = build(DOWN, P);
      break;
    case "piso-izq":
      s = flipSprite(build(DOWN, P));
      break;
  }
  cache.set(key, s);
  return s;
}

// ---------------------------------------------------------------------------
// el interior: colores y rectángulos (se pintan en el canvas chico del interior)
// ---------------------------------------------------------------------------

export const INT_W = 180;
export const INT_H = 200;
/** dónde queda el piso del pasillo (los pies del pasajero) en el canvas del interior */
export const FLOOR_Y = 150;
export const AISLE_X = INT_W / 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

export const COLORS = {
  wall: "#C9CFD6",
  wallDark: "#AEB6BF",
  ceiling: "#DDE2E8",
  floor: "#4A4E57",
  floorLine: "#5C616B",
  aisle: "#5A5F69",
  seat: "#2F6FD6",
  seatDark: "#1F4FA0",
  seatBack: "#1A3F80",
  windowFrame: "#141414",
  sky: "#9ED8F5",
  street: "#6B7078",
  building: "#5B6F8A",
  buildingDark: "#46566B",
  pole: "#2A2F3A",
  rail: "#D9DDE3",
  railDark: "#9A9FA8",
  strap: "#F2C94C",
};

/** los rectángulos fijos del interior (sin la calle, que se mueve) */
export function interiorRects(): Rect[] {
  const r: Rect[] = [];
  const c = COLORS;
  r.push({ x: 0, y: 0, w: INT_W, h: INT_H, c: c.wall });
  r.push({ x: 0, y: 0, w: INT_W, h: 44, c: c.ceiling });
  // el piso del pasillo y los costados
  r.push({ x: 0, y: FLOOR_Y - 2, w: INT_W, h: INT_H - FLOOR_Y + 2, c: c.floor });
  r.push({ x: AISLE_X - 34, y: FLOOR_Y - 2, w: 68, h: INT_H - FLOOR_Y + 2, c: c.aisle });
  for (let y = FLOOR_Y + 6; y < INT_H; y += 8) r.push({ x: 0, y, w: INT_W, h: 1, c: c.floorLine });
  // pasamanos arriba con las agarraderas
  r.push({ x: 0, y: 40, w: INT_W, h: 3, c: c.rail });
  r.push({ x: 0, y: 43, w: INT_W, h: 1, c: c.railDark });
  for (const x of [34, 70, 106, 142]) {
    r.push({ x: x - 1, y: 44, w: 3, h: 10, c: c.strap });
    r.push({ x: x - 3, y: 53, w: 7, h: 5, c: c.strap });
    r.push({ x: x - 1, y: 55, w: 3, h: 2, c: c.wallDark });
  }
  // ventanillas (dos por lado): el marco; la calle se pinta aparte
  for (const x of [8, 56, 124, 172 - 40]) {
    r.push({ x: x - 1, y: 63, w: 42, h: 24, c: c.windowFrame });
  }
  // asientos: dos por lado, uno detrás del otro
  for (const side of [0, 1]) {
    for (let row = 0; row < 2; row++) {
      const x = side === 0 ? 10 + row * 4 : INT_W - 10 - 36 - row * 4;
      const y = 100 + row * 22;
      r.push({ x: x - 1, y: y - 1, w: 38, h: 24, c: K });
      r.push({ x, y, w: 36, h: 22, c: c.seat });
      r.push({ x, y, w: 36, h: 6, c: c.seatBack });
      r.push({ x: x + 2, y: y + 6, w: 32, h: 2, c: c.seatDark });
    }
  }
  return r;
}

/** las ventanillas: cielo, calle y edificios que pasan; `scroll` en unidades (crece con el tiempo) */
export function windowRects(scroll: number): Rect[] {
  const r: Rect[] = [];
  const c = COLORS;
  const windows = [8, 56, 124, 132];
  for (const wx of windows) {
    r.push({ x: wx, y: 64, w: 40, h: 22, c: c.sky });
    r.push({ x: wx, y: 80, w: 40, h: 6, c: c.street });
    // edificios y postes que pasan: una secuencia fija desplazada por scroll
    for (let i = 0; i < 6; i++) {
      const bx = ((i * 23 - scroll) % 120) + (((i * 23 - scroll) % 120) < 0 ? 120 : 0);
      const h = 6 + ((i * 5) % 9);
      const x0 = wx + bx - 20;
      const x1 = Math.min(wx + 40, x0 + 12);
      const xs = Math.max(wx, x0);
      if (x1 > xs) r.push({ x: xs, y: 80 - h, w: x1 - xs, h, c: i % 2 ? c.building : c.buildingDark });
      const px = wx + ((bx + 9) % 120) - 20;
      if (px >= wx && px < wx + 40) r.push({ x: px, y: 66, w: 1, h: 14, c: c.pole });
    }
  }
  return r;
}
