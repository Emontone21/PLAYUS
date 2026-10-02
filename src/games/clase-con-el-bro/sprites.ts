// Pixel art de "clase con el bro": Big Bro, un chef grandote (gorro alto,
// chaqueta, delantal y una cuchilla), con tres caras: esperando con los
// brazos cruzados, contento con el pulgar arriba y enojado con la cara roja y
// los brazos en alto. Mapas de letras (games/lib/sprites), sin DOM.

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";

export type { Sprite };
const K = OUTLINE;

/** la vista: 120 × 150 unidades, en vertical */
export const FIELD_W = 120;
export const FIELD_H = 150;

export type Mood = "espera" | "contento" | "enojado";

const PALETTE: Record<string, string> = {
  K,
  W: "#F6F6F2", // gorro y chaqueta
  w: "#D4D4CE", // sombra de la tela
  S: "#E0A67A", // piel
  s: "#C98A5E", // sombra de la piel
  R: "#E0574F", // cara enojada
  r: "#B23A33",
  E: "#1B1B1F", // ojos
  M: "#7A2E2E", // boca
  T: "#F4F4F4", // dientes
  B: "#2F4E8A", // botones
  A: "#C9B38A", // delantal
  a: "#A8936B",
  G: "#B8C0C8", // hoja de la cuchilla
  g: "#8A939C",
  H: "#6B4226", // mango
  U: "#5A3A2A", // bigote
};

export const BRO_W = 44;
export const BRO_H = 36;

/** el gorro (filas 0 a 9), común */
const HAT = [
  "..............KKKKKKKKKKKKKK................",
  "............KKWWWWWWWWWWWWWWKK..............",
  "...........KWWWWWWWWWWWWWWWWWWK.............",
  "..........KWWWWWWWWWWWWWWWWWWWWK............",
  "..........KWWWWWWWWWWWWWWWWWWWWK............",
  "..........KWWWWWWWWWWWWWWWWWWWWK............",
  "..........KWWWwWWWwWWWwWWWwWWWWK............",
  "...........KKWWWWWWWWWWWWWWWWKK.............",
  ".............KKKKKKKKKKKKKKKK...............",
  "............KwwwwwwwwwwwwwwwwK..............",
];

/** la cara (filas 10 a 19), por humor */
const FACE: Record<Mood, string[]> = {
  espera: [
    "...........KSSSSSSSSSSSSSSSSSSK.............",
    "..........KSSSSSSSSSSSSSSSSSSSSK............",
    "..........KSSSEESSSSSSSSSEESSSSK............",
    "..........KSSSEESSSSSSSSSEESSSSK............",
    "..........KSSSSSSSSSSSSSSSSSSSSK............",
    "..........KSSSSSUUUUUUUUUUSSSSSK............",
    "..........KSSSSUUSSSMMMSSUUSSSSK............",
    "...........KSSSSSSSMMMMMSSSSSSK.............",
    "...........KsSSSSSSSSSSSSSSSsK..............",
    "............KKKSSSSSSSSSSSKKK...............",
  ],
  contento: [
    "...........KSSSSSSSSSSSSSSSSSSK.............",
    "..........KSSSSSSSSSSSSSSSSSSSSK............",
    "..........KSSSKKSSSSSSSSSKKSSSSK............",
    "..........KSSSSSSSSSSSSSSSSSSSSK............",
    "..........KSSSSSSSSSSSSSSSSSSSSK............",
    "..........KSSSSSUUUUUUUUUUSSSSSK............",
    "..........KSSSSUUKTTTTTTTKUUSSSK............",
    "...........KSSSSSSKTTTTTKSSSSSK.............",
    "...........KsSSSSSSSKKKSSSSSSsK.............",
    "............KKKSSSSSSSSSSSKKK...............",
  ],
  enojado: [
    "...........KRRRRRRRRRRRRRRRRRRK.............",
    "..........KRRKKRRRRRRRRRRKKRRRRK............",
    "..........KRRRRKKRRRRRRRKKRRRRRK............",
    "..........KRRRREERRRRRRRREERRRRK............",
    "..........KRRRRRRRRRRRRRRRRRRRRK............",
    "..........KRRRRRUUUUUUUUUURRRRRK............",
    "..........KRRRRUUKMMMMMMMKUURRRK............",
    "...........KRRRRRKMTTTTTMKRRRRK.............",
    "...........KrRRRRRKKKKKKKRRRRrK.............",
    "............KKKRRRRRRRRRRRKKK...............",
  ],
};

/** el cuerpo (filas 20 a 35), por humor: brazos cruzados, pulgar arriba o brazos en alto */
const BODY: Record<Mood, string[]> = {
  espera: [
    "........KKKKWWWWWWWWWWWWWWWWWWKKKK..........",
    "......KKWWWWWWWWWWWWBWWWWWWWWWWWWKK.........",
    ".....KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK........",
    "....KWWWWWWWWWWWWWWWBWWWWWWWWWWWWWWWK.......",
    "....KWWWKSSSSSSSSSSSSSSSSSSSSSSSKWWWWK......",
    "....KWWWKSSSSSSSSSSSSSSSSSSSSSSSKWWWWK......",
    "....KWWWWKKKKKKKKKKKKKKKKKKKKKKKWWWWWK......",
    "....KWWWWWWWWWWWWWWWBWWWWWWWWWWWWWWWWK......",
    "....KWWWWWWWAAAAAAAAAAAAAAAAWWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAaAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK......",
  ],
  contento: [
    "........KKKKWWWWWWWWWWWWWWWWWWKKKK..........",
    "......KKWWWWWWWWWWWWBWWWWWWWWWWWWKK....KSK..",
    ".....KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK...KSSK.",
    "....KWWWWWWWWWWWWWWWBWWWWWWWWWWWWWWWKKKSSSK.",
    "....KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSSK.",
    "....KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSSK.",
    "....KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWKSSSK..",
    "....KWWWWWWWWWWWWWWWBWWWWWWWWWWWWWWWWKKKK...",
    "....KWWWWWWWAAAAAAAAAAAAAAAAWWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAaAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK......",
  ],
  enojado: [
    ".KGK....KKKKWWWWWWWWWWWWWWWWWWKKKK....KSSK..",
    ".KGGK.KKWWWWWWWWWWWWBWWWWWWWWWWWWKK..KSSSSK.",
    ".KGGKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWKKWSSSSK.",
    ".KGGKWWWWWWWWWWWWWWWBWWWWWWWWWWWWWWWWWKSSK..",
    ".KHHKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWKK...",
    ".KHHKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK....",
    ".KSSKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK.....",
    ".KSSKWWWWWWWWWWWWWWWBWWWWWWWWWWWWWWWWK......",
    "..KKWWWWWWWAAAAAAAAAAAAAAAAWWWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAaAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KWWWWWWKAAAAAAAAAAAAAAAAKWWWWWWWWK......",
    "....KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK......",
  ],
};

const broCache = new Map<Mood, Sprite>();
export function broSprite(mood: Mood): Sprite {
  let s = broCache.get(mood);
  if (!s) {
    s = build([...HAT, ...FACE[mood], ...BODY[mood]], PALETTE);
    broCache.set(mood, s);
  }
  return s;
}

/** la cuchilla apoyada en la mesa (14 × 6), para la previa y la espera */
const CLEAVER_ROWS = ["KKKKKKKKKK....", "KGGGGGGGGGKKK.", "KGGGGGGGGGKHHK", "KGGGGGGGGGKHHK", "KgggggggggKKK.", ".KKKKKKKKK...."];
let cleaver: Sprite | null = null;
export function cleaverSprite(): Sprite {
  cleaver ??= build(CLEAVER_ROWS, PALETTE);
  return cleaver;
}
