// Las seis comidas de "clase con el bro": polígonos simples (pueden ser
// cóncavos) con vértices enteros en un espacio de diseño de 0 a 1.000
// centrado en (500, 500), y la tabla de senos entera para rotarlos sin
// flotantes. Los vértices y la tabla son literales (generados una vez y
// pegados): nada trigonométrico se calcula en tiempo de ejecución, así el
// navegador y Node arman exactamente el mismo objeto.

export type Pt = readonly [number, number];
export type Level = "baja" | "media" | "alta";
export type ShapeId = "pizza" | "pan" | "milanesa" | "queso" | "torta" | "sandia";

export interface Shape {
  id: ShapeId;
  name: string;
  level: Level;
  verts: readonly Pt[];
  /** colores del dibujo */
  fill: string;
  texture: string;
}

/** el centro del espacio de diseño */
export const DESIGN_C = 500;

const PIZZA: Pt[] = [[930, 500], [911, 670], [783, 783], [661, 888], [500, 955], [343, 879], [224, 776], [98, 666], [50, 500], [126, 345], [199, 199], [332, 93], [500, 105], [659, 117], [818, 182], [874, 345]];
const PAN: Pt[] = [[960, 500], [877, 684], [722, 784], [578, 836], [417, 861], [280, 772], [131, 680], [30, 500], [123, 316], [278, 216], [425, 174], [580, 154], [714, 236], [869, 320]];
const MILANESA: Pt[] = [[980, 500], [913, 650], [753, 712], [640, 742], [552, 795], [455, 756], [335, 786], [194, 757], [58, 661], [10, 500], [96, 353], [263, 301], [355, 249], [458, 264], [552, 205], [660, 223], [814, 236], [937, 341]];
const TORTA: Pt[] = [[900, 500], [819, 585], [907, 735], [740, 740], [675, 803], [578, 790], [500, 960], [417, 809], [310, 829], [267, 733], [84, 740], [172, 588], [110, 500], [191, 417], [110, 275], [267, 267], [320, 188], [422, 210], [500, 30], [585, 181], [700, 154], [740, 260], [898, 270], [809, 417]];
const QUESO: Pt[] = [[110, 520], [250, 400], [380, 300], [520, 200], [700, 150], [870, 140], [880, 260], [800, 300], [760, 360], [810, 420], [880, 450], [880, 700], [860, 860], [700, 870], [560, 800], [500, 820], [430, 790], [300, 700], [200, 620]];
const SANDIA: Pt[] = [[500, 900], [380, 760], [300, 640], [260, 560], [220, 440], [150, 300], [180, 190], [260, 160], [340, 120], [420, 150], [470, 130], [530, 160], [600, 110], [690, 150], [740, 230], [700, 290], [660, 330], [720, 380], [800, 360], [850, 330], [820, 450], [760, 560], [700, 660], [600, 790]];

export const SHAPES: readonly Shape[] = [
  { id: "pizza", name: "pizza mal estirada", level: "baja", verts: PIZZA, fill: "#E8B66A", texture: "#C8402E" },
  { id: "pan", name: "pan casero deforme", level: "baja", verts: PAN, fill: "#C9924F", texture: "#E0B071" },
  { id: "milanesa", name: "milanesa", level: "media", verts: MILANESA, fill: "#C98A3A", texture: "#A66A26" },
  { id: "queso", name: "pedazo de queso con mordiscos", level: "media", verts: QUESO, fill: "#F2C94C", texture: "#C9941E" },
  { id: "torta", name: "torta derretida", level: "alta", verts: TORTA, fill: "#E58AB4", texture: "#F5B8D3" },
  { id: "sandia", name: "porción de sandía torcida", level: "alta", verts: SANDIA, fill: "#E04848", texture: "#3E9B3E" },
];

export const LEVELS: readonly Level[] = ["baja", "media", "alta"];

export function shapeById(id: ShapeId): Shape {
  return SHAPES.find((s) => s.id === id)!;
}

/** sen(d°) × 10.000 para d de 0 a 90, entero */
const SIN_Q = [0, 175, 349, 523, 698, 872, 1045, 1219, 1392, 1564, 1736, 1908, 2079, 2250, 2419, 2588, 2756, 2924, 3090, 3256, 3420, 3584, 3746, 3907, 4067, 4226, 4384, 4540, 4695, 4848, 5000, 5150, 5299, 5446, 5592, 5736, 5878, 6018, 6157, 6293, 6428, 6561, 6691, 6820, 6947, 7071, 7193, 7314, 7431, 7547, 7660, 7771, 7880, 7986, 8090, 8192, 8290, 8387, 8480, 8572, 8660, 8746, 8829, 8910, 8988, 9063, 9135, 9205, 9272, 9336, 9397, 9455, 9511, 9563, 9613, 9659, 9703, 9744, 9781, 9816, 9848, 9877, 9903, 9925, 9945, 9962, 9976, 9986, 9994, 9998, 10000];

/** sen(d°) × 10.000, entero, para cualquier grado entero */
export function sinT(deg: number): number {
  const d = ((deg % 360) + 360) % 360;
  if (d <= 90) return SIN_Q[d]!;
  if (d <= 180) return SIN_Q[180 - d]!;
  if (d <= 270) return -SIN_Q[d - 180]!;
  return -SIN_Q[360 - d]!;
}
export function cosT(deg: number): number {
  return sinT(deg + 90);
}

/** división entera redondeada al más cercano (mitades hacia arriba), exacta mientras los números entren en 2^53 */
export function divRound(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

/** la mesa: coordenadas lógicas de 0 a GRID */
export const GRID = 10_000;
const GRID_C = GRID / 2;

/**
 * rota (grados enteros) y escala (por ciento entero) una forma del espacio
 * de diseño y la deja en la grilla de la mesa, centrada, con vértices enteros.
 */
export function placeShape(verts: readonly Pt[], rotationDeg: number, scalePct: number): Pt[] {
  const c = cosT(rotationDeg);
  const s = sinT(rotationDeg);
  // (diseño → grilla) ×8,5 (así al 110 % el vértice más lejano, a 523 del centro, sigue dentro de la mesa), (seno ×10.000) y (escala ×100): el divisor junta los tres
  const F = 85;
  const D = 10_000_000;
  return verts.map(([bx, by]) => {
    const dx = bx - DESIGN_C;
    const dy = by - DESIGN_C;
    return [GRID_C + divRound((dx * c - dy * s) * scalePct * F, D), GRID_C + divRound((dx * s + dy * c) * scalePct * F, D)] as const;
  });
}
