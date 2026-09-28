// La cara y el cigarro, en pixel art puro (sin DOM ni React). El lienzo mide
// FACE_W × FACE_H unidades de arte: la cara de frente ocupa 32 × 32 y el
// cigarro sale de la comisura derecha de la boca hacia afuera.
// Importa rng por ruta relativa para que los E2E puedan importar este módulo.

import { rngFromSeed } from "../../lib/rng";

export const FACE_W = 46;
export const FACE_H = 34;

export type HairStyle = "corto" | "largo" | "parado" | "rulos" | "pelado";
export type Accessory = "ninguno" | "anteojos" | "gorro" | "vincha" | "bigote";
/** 0 normal, 1 entrecerrados, 2 rojos y sonrisa boba, 3 espiral y cachetes, 4 colilla sola */
export type Stage = 0 | 1 | 2 | 3 | 4;

export interface FaceLook {
  skin: string;
  hair: HairStyle;
  hairColor: string;
  accessory: Accessory;
  accessoryColor: string;
  bg: string;
}

export interface Pixel {
  x: number;
  y: number;
  c: string;
}

export const SKINS = ["#F1C9A5", "#D9A06B", "#B5743F", "#7A4A24"] as const;
export const HAIR_COLORS = ["#2B1B12", "#5A3A1E", "#B0632B", "#D8B15A", "#3C3C48", "#8E8E8E"] as const;
export const ACCESSORY_COLORS = ["#C0392B", "#2E86C1", "#27AE60", "#F2C94C", "#9B59B6"] as const;
/** fondos dentro de la paleta de la app */
export const BACKGROUNDS = ["#163A2F", "#1E4A3C", "#133329", "#143D32", "#0A1F19"] as const;

const HAIRS: HairStyle[] = ["corto", "largo", "parado", "rulos", "pelado"];
const ACCESSORIES: Accessory[] = ["ninguno", "anteojos", "gorro", "vincha", "bigote"];

const EYE = "#1B1B1B";
const EYE_WHITE = "#F7FFF2";
const EYE_RED = "#E53935";
const CHEEK = "#F08A8A";
const MOUTH = "#7A3B2E";
const CIG_PAPER = "#F7FFF2";
const CIG_FILTER = "#E0A96D";
const EMBER = "#FF7A1A";
const EMBER_FLASH = "#FFE066";
const ASH = "#B9B9B9";
const SMOKE = "#CFD8D3";
const SPIRAL = "#2E3A59";

/** la cara ocupa las columnas 4..35 y las filas 1..32 */
const FX = 4;
const FY = 1;
/** comisura derecha de la boca (arranque del cigarro), en el lienzo */
export const MOUTH_CORNER = { x: FX + 22, y: FY + 24 };
/** largo del cigarro entero, en unidades, sin contar el filtro */
export const CIG_FULL = 14;
export const CIG_BUTT = 2;
/** regiones que ningún accesorio puede tapar */
export const EYE_CELLS: ReadonlyArray<[number, number]> = [
  [FX + 10, FY + 14], [FX + 11, FY + 14], [FX + 10, FY + 15], [FX + 11, FY + 15],
  [FX + 20, FY + 14], [FX + 21, FY + 14], [FX + 20, FY + 15], [FX + 21, FY + 15],
];
export function cigCells(): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let x = MOUTH_CORNER.x; x < MOUTH_CORNER.x + 2 + CIG_FULL; x++) cells.push([x, MOUTH_CORNER.y]);
  return cells;
}

/** la semilla del intento elige solo la apariencia */
export function faceFor(attemptSeed: string): FaceLook {
  const rng = rngFromSeed(`tarado:${attemptSeed}`);
  return {
    skin: rng.pick(SKINS),
    hair: rng.pick(HAIRS),
    hairColor: rng.pick(HAIR_COLORS),
    accessory: rng.pick(ACCESSORIES),
    accessoryColor: rng.pick(ACCESSORY_COLORS),
    bg: rng.pick(BACKGROUNDS),
  };
}

/** etapa de la cara según el porcentaje consumido (0..1) */
export function stageFor(progress: number): Stage {
  if (progress >= 1) return 4;
  if (progress >= 0.75) return 3;
  if (progress >= 0.5) return 2;
  if (progress >= 0.25) return 1;
  return 0;
}

/** largo actual del cigarro: baja un píxel cada tantos toques, nunca menos que la colilla */
export function cigLength(progress: number): number {
  return Math.max(CIG_BUTT, Math.round(CIG_FULL * (1 - progress)));
}

export interface FaceDrawState {
  progress: number;
  /** la brasa encendida por el toque */
  ember?: boolean;
  /** cuadro del humo (0..2) */
  smokeFrame?: number;
  /** ceniza acumulada en la punta (0..3 unidades) */
  ash?: number;
}

/** todos los píxeles de la cara con el cigarro en su estado actual */
export function facePixels(look: FaceLook, state: FaceDrawState): Pixel[] {
  const px: Pixel[] = [];
  const put = (x: number, y: number, c: string) => px.push({ x: FX + x, y: FY + y, c });
  const row = (y: number, from: number, to: number, c: string) => {
    for (let x = from; x <= to; x++) put(x, y, c);
  };
  const stage = stageFor(state.progress);

  // cabeza: un óvalo de 24 × 28 (columnas 4..27, filas 2..29)
  for (let y = 2; y <= 29; y++) {
    const cut = y <= 3 || y >= 28 ? 4 : y <= 5 || y >= 26 ? 2 : y <= 6 || y >= 25 ? 1 : 0;
    row(y, 4 + cut, 27 - cut, look.skin);
  }
  // orejas
  row(14, 3, 3, look.skin);
  row(15, 3, 3, look.skin);
  row(14, 28, 28, look.skin);
  row(15, 28, 28, look.skin);

  // pelo
  const hc = look.hairColor;
  if (look.hair !== "pelado" && look.accessory !== "gorro") {
    row(2, 8, 23, hc);
    row(3, 6, 25, hc);
    row(4, 5, 26, hc);
    row(5, 4, 27, hc);
    row(6, 4, 27, hc);
    if (look.hair === "parado") {
      for (const x of [7, 10, 13, 16, 19, 22, 25]) {
        put(x, 1, hc);
        put(x, 0, hc);
      }
    }
    if (look.hair === "rulos") {
      for (const x of [5, 8, 11, 14, 17, 20, 23, 26]) put(x, 1, hc);
      row(7, 4, 27, hc);
    }
    if (look.hair === "largo") {
      for (let y = 7; y <= 24; y++) {
        row(y, 3, 4, hc);
        row(y, 27, 28, hc);
      }
    }
  }
  // gorro de lana: tapa el pelo de arriba, deja libres los ojos
  if (look.accessory === "gorro") {
    row(0, 12, 19, lighten(look.accessoryColor));
    row(1, 8, 23, look.accessoryColor);
    for (let y = 2; y <= 6; y++) row(y, 4, 27, look.accessoryColor);
    row(7, 4, 27, darken(look.accessoryColor));
    row(8, 4, 27, darken(look.accessoryColor));
  }
  if (look.accessory === "vincha") {
    row(8, 4, 27, look.accessoryColor);
    row(9, 4, 27, look.accessoryColor);
  }

  // ojos (columnas 10-11 y 20-21, filas 14-15)
  const eye = (x: number) => {
    if (stage === 0) {
      row(13, x - 1, x + 2, EYE_WHITE);
      row(14, x - 1, x + 2, EYE_WHITE);
      row(15, x - 1, x + 2, EYE_WHITE);
      put(x, 14, EYE);
      put(x + 1, 14, EYE);
      put(x, 15, EYE);
      put(x + 1, 15, EYE);
    } else if (stage === 1) {
      row(14, x - 1, x + 2, EYE_WHITE);
      row(15, x - 1, x + 2, EYE);
    } else if (stage === 2) {
      row(13, x - 1, x + 2, EYE_RED);
      row(14, x - 1, x + 2, EYE_RED);
      row(15, x - 1, x + 2, EYE_RED);
      put(x, 14, EYE);
      put(x + 1, 15, EYE);
    } else {
      // espiral de 4 × 4
      row(13, x - 1, x + 2, EYE_WHITE);
      row(14, x - 1, x + 2, EYE_WHITE);
      row(15, x - 1, x + 2, EYE_WHITE);
      row(16, x - 1, x + 2, EYE_WHITE);
      for (const [dx, dy] of [[-1, 13], [0, 13], [1, 13], [2, 13], [2, 14], [2, 15], [1, 15], [0, 15], [0, 14]] as const) put(x + dx, dy, SPIRAL);
    }
  };
  eye(10);
  eye(20);
  // cachetes
  if (stage >= 3) {
    row(20, 6, 7, CHEEK);
    row(20, 24, 25, CHEEK);
  }
  // nariz
  put(15, 19, darken(look.skin));
  put(16, 20, darken(look.skin));
  // boca (fila 24): normal, o sonrisa boba desde la etapa 2
  if (stage >= 2) {
    put(9, 23, MOUTH);
    row(24, 10, 21, MOUTH);
    put(22, 23, MOUTH);
  } else {
    row(24, 11, 21, MOUTH);
  }
  // bigote: arriba de la boca, sin tocar el cigarro
  if (look.accessory === "bigote") {
    row(22, 11, 20, hc);
    row(23, 10, 21, hc);
  }
  // anteojos: marco alrededor de los ojos, sin tapar los ojos
  if (look.accessory === "anteojos") {
    const frame = look.accessoryColor;
    for (const x0 of [8, 18]) {
      row(12, x0, x0 + 5, frame);
      row(17, x0, x0 + 5, frame);
      for (let y = 13; y <= 16; y++) {
        put(x0, y, frame);
        put(x0 + 5, y, frame);
      }
    }
    row(14, 14, 17, frame);
  }

  // cigarro: filtro de 2 y papel de largo variable, desde la comisura
  const len = cigLength(state.progress);
  const cx = MOUTH_CORNER.x - FX;
  const cy = MOUTH_CORNER.y - FY;
  put(cx, cy, CIG_FILTER);
  put(cx + 1, cy, CIG_FILTER);
  for (let i = 0; i < len - 1; i++) put(cx + 2 + i, cy, CIG_PAPER);
  const tipX = cx + 2 + len - 1;
  put(tipX, cy, state.ember ? EMBER_FLASH : EMBER);
  // ceniza acumulada más allá de la brasa
  for (let i = 1; i <= Math.min(3, state.ash ?? 0); i++) put(tipX + i, cy, ASH);
  // humo: sube desde la brasa; más humo cuanto más avanzado
  const puffs = 1 + Math.floor(Math.min(0.99, state.progress) * 5);
  const f = (state.smokeFrame ?? 0) % 3;
  for (let i = 0; i < puffs; i++) {
    const dy = 2 + i * 2 + f;
    const dx = (i + f) % 2 === 0 ? 0 : 1;
    if (cy - dy >= 0) put(tipX + dx, cy - dy, SMOKE);
  }
  return px;
}

/** ¿algún píxel del accesorio pisa los ojos o el cigarro? (para el test) */
export function accessoryCollides(look: FaceLook): boolean {
  const cells = new Set([...EYE_CELLS, ...cigCells()].map(([x, y]) => `${x},${y}`));
  const a = look.accessory === "ninguno" ? [] : accessoryPixels(look);
  return a.some((p) => cells.has(`${p.x},${p.y}`));
}

function accessoryPixels(look: FaceLook): Pixel[] {
  const all = facePixels(look, { progress: 0 });
  const bare = facePixels({ ...look, accessory: "ninguno" }, { progress: 0 });
  const bareSet = new Set(bare.map((p) => `${p.x},${p.y},${p.c}`));
  return all.filter((p) => !bareSet.has(`${p.x},${p.y},${p.c}`));
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
