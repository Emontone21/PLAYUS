// Pixel art del sunny (un sedán compacto de los 90 visto desde arriba, sin
// logos, bordó) en 32 rotaciones precalculadas, y la ficha de la pantalla
// previa. Sin DOM ni React. Acá sí se usa Math.cos: es dibujo, no simulación.

import { buildSprite, OUTLINE, type Pixel, type Sprite } from "../lib/sprites";
import { ANGLES } from "./trig";

const K = OUTLINE;
const CAR: Record<string, string> = { K, B: "#7A1F2E", b: "#9A3A48", W: "#2B3A4A", w: "#4C6478", y: "#F7E6A0", r: "#E23B4E", T: "#1B1B1B", t: "#3A3A3A" };

/** el sunny apuntando hacia arriba: 10 × 16 unidades, con las ruedas asomando */
export const CAR_ROWS = [
  "..KKKKKK..",
  ".KyBBBByK.",
  ".KBBBBBBK.",
  "TKBbBBbBKT",
  "tKBBBBBBKt",
  ".KKKKKKKK.",
  ".KWWWWWWK.",
  ".KWwWWwWK.",
  ".KBBBBBBK.",
  ".KBBBBBBK.",
  ".KWWWWWWK.",
  ".KKKKKKKK.",
  "TKBBBBBBKT",
  "tKBbBBBbKt",
  ".KrBBBBrK.",
  "..KKKKKK..",
];

let base: Sprite | null = null;
export function carBaseSprite(): Sprite {
  if (!base) base = buildSprite(CAR_ROWS, CAR);
  return base;
}

/** rotaciones precalculadas: 32 pasos de 11,25° */
export const CAR_STEPS = 32;
/** el sprite girado ocupa 20 × 20, con el centro del auto en (10, 10) */
export const CAR_BOX = 20;

const rotCache = new Map<number, Sprite>();
/** el sunny girado `stepIndex` pasos (0 = hacia arriba, en sentido horario), muestreado al píxel más cercano */
export function carSprite(stepIndex: number): Sprite {
  const i = ((stepIndex % CAR_STEPS) + CAR_STEPS) % CAR_STEPS;
  let s = rotCache.get(i);
  if (s) return s;
  const src = carBaseSprite();
  const grid = new Map<number, string>();
  for (const p of src.px) grid.set(p.y * src.w + p.x, p.c);
  const theta = (i / CAR_STEPS) * 2 * Math.PI;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const c = CAR_BOX / 2;
  const px: Pixel[] = [];
  for (let oy = 0; oy < CAR_BOX; oy++) {
    for (let ox = 0; ox < CAR_BOX; ox++) {
      const x = ox + 0.5 - c;
      const y = oy + 0.5 - c;
      // deshace el giro (horario en pantalla) para buscar el píxel de origen
      const sx = Math.floor(x * cos + y * sin + src.w / 2);
      const sy = Math.floor(-x * sin + y * cos + src.h / 2);
      if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
      const color = grid.get(sy * src.w + sx);
      if (color) px.push({ x: ox, y: oy, c: color });
    }
  }
  s = { w: CAR_BOX, h: CAR_BOX, px };
  rotCache.set(i, s);
  return s;
}

/** el paso de rotación que corresponde a un rumbo de 0 a 1023 */
export function carStepFor(heading: number): number {
  return Math.round((heading / ANGLES) * CAR_STEPS) % CAR_STEPS;
}

// ---------------------------------------------------------------------------
// colores de la ruta y del vacío
// ---------------------------------------------------------------------------

export const VOID = "#0B1020";
export const STAR = "#6E7FA8";
export const STAR_BRIGHT = "#C9D3F2";
export const ASPHALT = "#5A5D66";
export const ASPHALT_DARK = "#4E515A";
export const EDGE_LINE = "#F2F2F2";
export const CENTER_LINE = "#F2C94C";
export const CLIFF = "#2A2D38";
export const MARK = "#1A1A1E";
export const SMOKE = "#F4F4F4";
export const SIGN = "#D8D8DC";

/** la ficha de la pantalla previa: el sunny derrapando sobre un tramo de ruta, 48 × 48 */
export function introSprite(): Sprite {
  const W = 48;
  const H = 48;
  const px: Pixel[] = [];
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < W && y < H) px.push({ x, y, c });
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, VOID);
  for (const [x, y] of [
    [3, 5],
    [44, 9],
    [7, 30],
    [41, 40],
    [45, 26],
    [2, 44],
  ] as const) put(x, y, STAR);
  // la ruta, en diagonal suave hacia arriba a la derecha
  for (let y = 0; y < H; y++) {
    const cx = 22 + Math.round((H - 1 - y) * 0.25);
    const l = cx - 11;
    const r = cx + 11;
    for (let x = l; x <= r; x++) put(x, y, (x + y) % 7 === 0 ? ASPHALT_DARK : ASPHALT);
    put(l, y, EDGE_LINE);
    put(r, y, EDGE_LINE);
    put(l - 1, y, CLIFF);
    put(r + 1, y, CLIFF);
    if (y % 6 < 3) put(cx, y, CENTER_LINE);
  }
  // marcas de goma detrás del auto
  for (let i = 0; i < 14; i++) {
    put(19 + Math.round(i * 0.35), 44 - i, MARK);
    put(24 + Math.round(i * 0.35), 45 - i, MARK);
  }
  // el sunny cruzado (la trompa más a la derecha que el movimiento)
  const car = carSprite(3);
  for (const p of car.px) put(p.x + 16, p.y + 12, p.c);
  // humito
  for (const [x, y] of [
    [17, 34],
    [16, 36],
    [22, 35],
    [23, 37],
  ] as const) put(x, y, SMOKE);
  return { w: W, h: H, px };
}
