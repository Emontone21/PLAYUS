// La rana mascota en pixel art. Acá se calcula la grilla (15×15 celdas, una
// letra por celda) sin React, para poder testearla y para generar los íconos
// con el mismo dibujo. Frog.tsx la convierte en SVG.

export type FrogPose = "feliz" | "risa" | "lengua" | "guino" | "sorpresa" | "dormida" | "corona";
export type FrogColor = "#6CC24A" | "#5FCB8F" | "#B8E04A";

export const GRID = 15;
/** el mapa base (12×8) va con su esquina superior izquierda en esta celda */
const BASE_ROW = 4;
const BASE_COL = 1;

const BASE = [
  ".HHHH..HHHH.",
  "GHEEHGGHEEHG",
  "GGEEGGGGEEGG",
  "GGGGGGGGGGGG",
  "GGGGGGGGGGGG",
  "GGGMMMMMMGGG",
  "GGGGGGGGGGGG",
  ".NNNNNNNNNN.",
];

/** lomas de los ojos (H) y base (N) según el color del cuerpo (G) */
export const SHADES: Record<FrogColor, { H: string; N: string }> = {
  "#6CC24A": { H: "#8EDC66", N: "#4E9A36" },
  "#5FCB8F": { H: "#8BE3AF", N: "#3E9F68" },
  "#B8E04A": { H: "#D4F07A", N: "#8FB52E" },
};

export const FIXED_COLORS: Record<string, string> = {
  E: "#10201A", // ojos
  M: "#F07A3C", // boca
  T: "#FF6F91", // lengua y joya de la corona
  Y: "#FFD34E", // corona
  B: "#6FD3E0", // gota de sudor
  Z: "#F7FFF2", // letra de sueño
  O: "#F7FFF2", // borde de sticker
  X: "#071611", // sombra
};

/** las poses que no parpadean: ya tienen los ojos distintos */
export const NO_BLINK: ReadonlySet<FrogPose> = new Set(["risa", "guino", "dormida"]);

/** grilla[fila][columna]; "." es transparente */
export type FrogGrid = string[][];

export interface FrogGridOptions {
  /** borde blanco y sombra dura alrededor (default true) */
  sticker?: boolean;
  /** ojos cerrados (parpadeo). Se ignora en las poses de NO_BLINK. */
  blink?: boolean;
}

export function frogGrid(pose: FrogPose, opts: FrogGridOptions = {}): FrogGrid {
  const g: FrogGrid = Array.from({ length: GRID }, () => Array<string>(GRID).fill("."));

  // put(fila, columna, texto): coordenadas relativas al mapa base; las
  // negativas quedan arriba. Un "." dentro del texto borra la celda.
  const put = (row: number, col: number, text: string) => {
    const r = BASE_ROW + row;
    if (r < 0 || r >= GRID) throw new RangeError(`fila ${row} fuera de la grilla`);
    [...text].forEach((ch, i) => {
      const c = BASE_COL + col + i;
      if (c < 0 || c >= GRID) throw new RangeError(`columna ${col + i} fuera de la grilla`);
      g[r]![c] = ch;
    });
  };
  const ojosPlanos = () => {
    put(1, 2, "HH");
    put(1, 8, "HH");
  };

  BASE.forEach((row, r) => put(r, 0, row));

  switch (pose) {
    case "feliz":
      break;
    case "risa":
      ojosPlanos();
      put(5, 3, "MMMMMM");
      put(6, 4, "MMMM");
      break;
    case "lengua":
      put(6, 5, "TT");
      put(7, 5, "TT");
      break;
    case "guino":
      put(1, 8, "HH");
      break;
    case "sorpresa":
      put(5, 3, "GGEEGG");
      put(6, 5, "EE");
      put(-2, 11, "B");
      put(-1, 11, "B");
      break;
    case "dormida":
      ojosPlanos();
      put(5, 3, "GGMMGG");
      put(-4, 9, "ZZZ");
      put(-3, 10, "Z");
      put(-2, 9, "ZZZ");
      break;
    case "corona":
      put(-1, 4, "Y..Y");
      put(0, 4, "YTYY");
      break;
  }

  if (opts.blink && !NO_BLINK.has(pose)) ojosPlanos();
  if (opts.sticker !== false) sticker(g);
  return g;
}

// 1) toda celda transparente con una vecina ocupada (8 direcciones) pasa a O;
// 2) toda celda que siga transparente con la de arriba, la izquierda o la de
//    arriba a la izquierda ocupada pasa a X (la sombra, abajo a la derecha).
function sticker(g: FrogGrid) {
  const occupied = (r: number, c: number) => r >= 0 && r < GRID && c >= 0 && c < GRID && g[r]![c] !== ".";
  const outline: Array<[number, number]> = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (g[r]![c] !== ".") continue;
      let near = false;
      for (let dr = -1; dr <= 1 && !near; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if ((dr || dc) && occupied(r + dr, c + dc)) {
            near = true;
            break;
          }
        }
      }
      if (near) outline.push([r, c]);
    }
  }
  for (const [r, c] of outline) g[r]![c] = "O";

  const shadow: Array<[number, number]> = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (g[r]![c] !== ".") continue;
      if (occupied(r - 1, c) || occupied(r, c - 1) || occupied(r - 1, c - 1)) shadow.push([r, c]);
    }
  }
  for (const [r, c] of shadow) g[r]![c] = "X";
}

/** color de una letra de la grilla para un color de cuerpo dado */
export function cellColor(ch: string, color: FrogColor): string | null {
  if (ch === ".") return null;
  if (ch === "G") return color;
  if (ch === "H" || ch === "N") return SHADES[color][ch];
  return FIXED_COLORS[ch] ?? null;
}

/** un path SVG por color: cada celda aporta M{c} {r}h1v1h-1z */
export function frogPaths(pose: FrogPose, color: FrogColor, opts: FrogGridOptions = {}): Array<{ color: string; d: string }> {
  const g = frogGrid(pose, opts);
  const byColor = new Map<string, string[]>();
  g.forEach((row, r) =>
    row.forEach((ch, c) => {
      const fill = cellColor(ch, color);
      if (!fill) return;
      const list = byColor.get(fill) ?? [];
      list.push(`M${c} ${r}h1v1h-1z`);
      byColor.set(fill, list);
    }),
  );
  return [...byColor.entries()].map(([fill, cells]) => ({ color: fill, d: cells.join("") }));
}
