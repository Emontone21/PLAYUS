// Pixel art de "Saca el Sunny", visto desde arriba: el sunny rojo (un sedán
// cuadradito de los 90, sin logos), los autos negros con brillos azulados y
// siluetas distintas (sedán, hatchback y camioneta de 3 casillas), el cartel
// de calle "Aguada" y la flecha de la salida. Los autos se dibujan con
// rectángulos sobre una grilla de letras y se giran para los verticales. Sin DOM.

import { buildSprite as build, composeSprite, OUTLINE, type Pixel, type Sprite } from "../lib/sprites";
import { textSprite } from "../lib/font";
import type { Car } from "./rules";

export type { Sprite };
const K = OUTLINE;

/** cada casilla mide 20 unidades */
export const CELL = 20;
/** la franja de arriba: la calle, el cartel y la hdp */
export const TOP = 60;

export const COLORS = {
  noche: "#141A22",
  pared: "#2B2630",
  paredLinea: "#3A3440",
  vereda: "#4A4F57",
  veredaLinea: "#5C616A",
  asfalto: "#23262B",
  asfaltoLuz: "#2C3037",
  linea: "#8E9098",
  farol: "#4A4532",
  salida: "#F2C94C",
  persiana: "#6E7279",
  persianaLinea: "#4A4F57",
  estela: "#FF6F91",
} as const;

// ---------------------------------------------------------------------------
// los autos (grillas de letras armadas con rectángulos)
// ---------------------------------------------------------------------------

type Grid = string[][];
function grid(w: number, h: number): Grid {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => "."));
}
function fill(g: Grid, x: number, y: number, w: number, h: number, ch: string): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (yy >= 0 && yy < g.length && xx >= 0 && xx < g[0]!.length) g[yy]![xx] = ch;
}
function rows(g: Grid): string[] {
  return g.map((r) => r.join(""));
}

const CAR_PALETTE: Record<string, string> = {
  K,
  R: "#C8322B", // el sunny
  r: "#E04A3F", // techo del sunny
  B: "#15161B", // auto negro
  b: "#2A2D3A", // techo
  V: "#6F8FC2", // vidrios azulados
  v: "#9DB8E0", // brillo del vidrio
  W: "#0B0B0E", // ruedas
  L: "#F6E27A", // faros
  l: "#E0574F", // luces traseras
  C: "#3A3D48", // la caja de la camioneta
  c: "#4A4E5C",
};

/** un auto horizontal de `len` casillas con la silueta `look` (0 sedán, 1 hatchback, 2 camioneta), mirando a la derecha */
function carRows(len: 2 | 3, look: 0 | 1 | 2, body: string, roof: string): string[] {
  const w = len * CELL;
  const g = grid(w, CELL);
  const x0 = 2;
  const x1 = w - 3; // último píxel del cuerpo
  // la carrocería con las esquinas redondeadas (contorno) y el cuerpo
  fill(g, x0, 3, x1 - x0 + 1, CELL - 6, "K");
  fill(g, x0 + 1, 4, x1 - x0 - 1, CELL - 8, body);
  fill(g, x0 + 1, 3, x1 - x0 - 1, 1, "K");
  fill(g, x0 + 1, CELL - 4, x1 - x0 - 1, 1, "K");
  // las ruedas, por fuera del cuerpo
  for (const wx of len === 3 ? [6, w - 12] : [5, w - 10]) {
    fill(g, wx, 1, 5, 3, "W");
    fill(g, wx, CELL - 4, 5, 3, "W");
  }
  if (look === 2) {
    // camioneta: cabina adelante (derecha) y caja atrás
    fill(g, x0 + 3, 5, Math.floor(w * 0.45), CELL - 10, "C");
    fill(g, x0 + 4, 6, Math.floor(w * 0.45) - 2, CELL - 12, "c");
    const cab = x0 + 3 + Math.floor(w * 0.45) + 2;
    fill(g, cab, 5, 9, CELL - 10, roof);
    fill(g, cab + 9, 5, 4, CELL - 10, "V");
    fill(g, cab + 9, 6, 1, 2, "v");
    fill(g, cab - 3, 5, 2, CELL - 10, "V");
  } else {
    // sedán: capó, parabrisas, techo, luneta, baúl; hatchback: el techo llega hasta atrás
    const hood = look === 0 ? 7 : 7;
    const trunk = look === 0 ? 7 : 3;
    const roofX = x0 + 1 + trunk + 3;
    const roofW = x1 - hood - 3 - roofX;
    fill(g, roofX - 3, 5, 3, CELL - 10, "V");
    fill(g, roofX - 3, 6, 1, 2, "v");
    fill(g, roofX, 5, roofW, CELL - 10, roof);
    fill(g, roofX + roofW, 5, 3, CELL - 10, "V");
    fill(g, roofX + roofW, 6, 1, 2, "v");
    if (look === 1) fill(g, roofX, 5, 2, CELL - 10, "V");
  }
  // faros adelante (derecha) y luces atrás
  fill(g, x1 - 1, 5, 2, 2, "L");
  fill(g, x1 - 1, CELL - 7, 2, 2, "L");
  fill(g, x0 + 1, 5, 1, 2, "l");
  fill(g, x0 + 1, CELL - 7, 1, 2, "l");
  return rows(g);
}

/** gira un sprite 90° en sentido horario */
export function rotateSprite(s: Sprite): Sprite {
  const px: Pixel[] = s.px.map((p) => ({ x: s.h - 1 - p.y, y: p.x, c: p.c }));
  return { w: s.h, h: s.w, px };
}

const carCache = new Map<string, Sprite>();
/** el sprite de un auto (el sunny si `sunny`), horizontal o vertical */
export function carSprite(car: Pick<Car, "len" | "horizontal" | "look">, sunny = false): Sprite {
  const key = `${car.len}:${car.look}:${car.horizontal ? "h" : "v"}:${sunny ? 1 : 0}`;
  let s = carCache.get(key);
  if (!s) {
    const h = build(carRows(car.len, car.look, sunny ? "R" : "B", sunny ? "r" : "b"), CAR_PALETTE);
    s = car.horizontal ? h : rotateSprite(h);
    carCache.set(key, s);
  }
  return s;
}
export function sunnySprite(): Sprite {
  return carSprite({ len: 2, horizontal: true, look: 0 }, true);
}

// ---------------------------------------------------------------------------
// la calle
// ---------------------------------------------------------------------------

/** el cartel de calle "Aguada" en su poste (34 × 30) */
let street: Sprite | null = null;
export function streetSignSprite(): Sprite {
  if (!street) {
    const text = textSprite("Aguada", "#F6F6F2");
    const plate = build(Array.from({ length: 11 }, (_, y) => (y === 0 || y === 10 ? "K".repeat(34) : "K" + "G".repeat(32) + "K")), { K, G: "#2E6B3A" });
    const pole = build(Array.from({ length: 19 }, () => "KPPK"), { K, P: "#8C9096" });
    street = composeSprite(34, 30, [
      { sprite: pole, x: 15, y: 11 },
      { sprite: plate, x: 0, y: 0 },
      { sprite: text, x: Math.floor((34 - text.w) / 2), y: 3 },
    ]);
  }
  return street;
}

/** la flecha de la salida (6 × 9) */
let arrow: Sprite | null = null;
export function exitArrowSprite(): Sprite {
  arrow ??= build(["...Y..", "....Y.", "YYYYYY", "....Y.", "...Y..", "......", "......", "......", "......"], { Y: COLORS.salida });
  return arrow;
}

/** la flecha de deslizar de la pantalla previa (16 × 7) */
let swipe: Sprite | null = null;
export function swipeArrowSprite(): Sprite {
  swipe ??= build([".............W..", "..............W.", "WWWWWWWWWWWWWWWW", "..............W.", ".............W..", "................", "................"], { W: "#F2E8D0" });
  return swipe;
}
