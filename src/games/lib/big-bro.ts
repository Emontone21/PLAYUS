// Big Bro, el chef grandote de la hdp (gorro alto, chaqueta, delantal y
// bigote), compartido por los juegos donde aparece: "clase con el bro",
// "hij@ de p**" y "Larry en la hdp". Un sprite de 44 × 36 armado con tres
// piezas (gorro, cara y cuerpo) y cinco poses. Mapas de letras, sin DOM.

import { buildSprite as build, OUTLINE, type Sprite } from "./sprites";

const K = OUTLINE;

/**
 * Las poses: espera (brazos cruzados), contento (pulgar arriba), cuchilla
 * (cara roja y los brazos en alto con la cuchilla, la de clase con el bro),
 * enojado (cara roja y brazos cruzados) y grita (cara roja, señalando con el
 * brazo estirado a la izquierda).
 */
export type BigBroPose = "espera" | "contento" | "cuchilla" | "enojado" | "grita";

export const BIG_BRO_PALETTE: Record<string, string> = {
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

export const BIG_BRO_W = 44;
export const BIG_BRO_H = 36;

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
const FACE: Record<"espera" | "contento" | "enojado", string[]> = {
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
const BODY: Record<"espera" | "contento" | "enojado", string[]> = {
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

function pointingBody(): string[] {
  const rows = BODY.espera.map((r) => r.split(""));
  // sin los brazos cruzados
  for (let y = 4; y <= 6; y++) for (let x = 8; x <= 32; x++) rows[y]![x] = "W";
  // el brazo estirado, con el índice
  const ARM = ["KKKKKK", "SSSSWW", "KSSSWW", ".KKKKK"];
  ARM.forEach((line, dy) => line.split("").forEach((c, dx) => c !== "." && (rows[2 + dy]![dx] = c)));
  return rows.map((r) => r.join(""));
}

const cache = new Map<BigBroPose, Sprite>();
export function bigBroSprite(pose: BigBroPose): Sprite {
  let s = cache.get(pose);
  if (!s) {
    const face = pose === "espera" || pose === "contento" ? FACE[pose] : FACE.enojado;
    const body = pose === "grita" ? pointingBody() : pose === "cuchilla" ? BODY.enojado : pose === "enojado" ? BODY.espera : BODY[pose];
    s = build([...HAT, ...face, ...body], BIG_BRO_PALETTE);
    cache.set(pose, s);
  }
  return s;
}
