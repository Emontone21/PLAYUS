// Pixel art de las personas del mapa, sin DOM ni React. Cada persona es un
// sprite de SPRITE_W × SPRITE_H unidades armado con piezas combinables. La
// columna de más a la derecha queda libre para el humo del pucho.
//
//   fila 0      humo / pompón
//   filas 1-2   gorro o pelo
//   filas 3-5   cabeza (cara en las columnas 2 a 5; el pucho en la 7, fila 5)
//   filas 6-9   remera y brazos
//   filas 10-11 pantalón
//   fila 12     zapatos

export const SPRITE_W = 9;
export const SPRITE_H = 13;

export type Hair = "corto" | "largo" | "recogido";
export type Head = "nada" | "boina" | "gorro" | "gorra";

export interface Look {
  skin: string;
  hair: Hair;
  hairColor: string;
  shirt: string;
  pants: string;
  head: Head;
  /** color del gorro, la gorra o la boina ("negra" es la de ella) */
  headColor: string;
  /** estrella roja en la boina */
  star: boolean;
  /** pucho en la boca, con humo */
  cig: boolean;
}

export interface Pixel {
  x: number;
  y: number;
  c: string;
}

export const SKINS = ["#F1C9A5", "#D9A06B", "#B5743F", "#7A4A24"] as const;
export const HAIR_COLORS = ["#2B1B12", "#5A3A1E", "#B0632B", "#D8B15A", "#3C3C48"] as const;
export const SHIRTS = ["#E2574C", "#3F7FCB", "#3FAE6A", "#F2C94C", "#9B59B6", "#F0F0F0", "#FF8C42", "#2E3A59"] as const;
export const PANTS = ["#2E3A59", "#5C4B3B", "#8B8B8B", "#1F5F8B"] as const;
/** boinas que no son la negra, gorros de lana y gorras */
export const OTHER_HEAD_COLORS = ["#C0392B", "#2E86C1", "#27AE60", "#8E5B3A", "#E67E22"] as const;

export const BERET_BLACK = "#111111";
export const STAR_RED = "#FF3B30";
export const CIG_WHITE = "#F7FFF2";
export const CIG_EMBER = "#FF7A1A";
export const SMOKE = "#CFD8D3";
const EYE = "#1B1B1B";
const SHOE = "#1E1E1E";
const HAND = "skin";

/** cuadros del humo: sube despacito por la columna libre */
export const SMOKE_FRAMES: ReadonlyArray<ReadonlyArray<[number, number]>> = [
  [[8, 4]],
  [[8, 4], [8, 3]],
  [[8, 3], [8, 2]],
];

/** todos los píxeles de una persona, relativos a su esquina superior izquierda */
export function personPixels(look: Look, smokeFrame = 0): Pixel[] {
  const px: Pixel[] = [];
  const put = (x: number, y: number, c: string) => px.push({ x, y, c: c === HAND ? look.skin : c });
  const row = (y: number, from: number, to: number, c: string) => {
    for (let x = from; x <= to; x++) put(x, y, c);
  };

  // pelo detrás (largo cae a los costados de la cara)
  if (look.hair === "largo") {
    for (let y = 3; y <= 7; y++) {
      put(1, y, look.hairColor);
      put(6, y, look.hairColor);
    }
  }
  // cabeza
  row(3, 2, 5, look.skin);
  row(4, 2, 5, look.skin);
  row(5, 2, 5, look.skin);
  put(3, 4, EYE);
  put(5, 4, EYE);

  // pelo o gorro arriba
  if (look.head === "nada") {
    if (look.hair === "recogido") {
      row(0, 3, 4, look.hairColor);
      row(1, 2, 5, look.hairColor);
      row(2, 1, 6, look.hairColor);
    } else {
      row(1, 2, 5, look.hairColor);
      row(2, 1, 6, look.hairColor);
    }
  } else if (look.head === "boina") {
    // ladeada a la derecha
    row(1, 3, 6, look.headColor);
    row(2, 1, 6, look.headColor);
    if (look.star) put(5, 1, STAR_RED);
  } else if (look.head === "gorro") {
    // gorro de lana con pompón, cuadrado
    row(0, 3, 4, lighten(look.headColor));
    row(1, 2, 5, look.headColor);
    row(2, 1, 6, darken(look.headColor));
  } else {
    // gorra con visera hacia la derecha
    row(1, 2, 5, look.headColor);
    row(2, 1, 7, look.headColor);
  }

  // pucho y humo
  if (look.cig) {
    put(6, 5, CIG_WHITE);
    put(7, 5, CIG_EMBER);
    for (const [x, y] of SMOKE_FRAMES[smokeFrame % SMOKE_FRAMES.length] ?? []) put(x, y, SMOKE);
  }

  // remera, brazos y manos
  row(6, 2, 5, look.shirt);
  row(7, 1, 6, look.shirt);
  row(8, 1, 6, look.shirt);
  row(9, 2, 5, look.shirt);
  put(1, 9, HAND);
  put(6, 9, HAND);
  // pantalón y zapatos
  row(10, 2, 5, look.pants);
  put(2, 11, look.pants);
  put(3, 11, look.pants);
  put(4, 11, look.pants);
  put(5, 11, look.pants);
  row(12, 2, 3, SHOE);
  row(12, 4, 5, SHOE);
  return px;
}

/** la piba del IPA: boina negra con estrella y pucho, siempre */
export function isPiba(look: Pick<Look, "head" | "headColor" | "star" | "cig">): boolean {
  return look.head === "boina" && look.headColor === BERET_BLACK && look.star && look.cig;
}

function lighten(hex: string): string {
  return mix(hex, 0xffffff, 0.35);
}
function darken(hex: string): string {
  return mix(hex, 0x000000, 0.25);
}
function mix(hex: string, target: number, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - t) + ((target >> s) & 255) * t);
  return "#" + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("");
}
