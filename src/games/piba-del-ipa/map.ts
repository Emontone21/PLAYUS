// Generación del mapa, pura: sin DOM ni React. La usan el cliente para
// dibujar y el servidor para validar, así que todo vive en unidades lógicas
// de píxel de arte (MAP_W × MAP_H), nunca en píxeles de pantalla.
// Importa rng por ruta relativa para que los E2E puedan importar este módulo.

import { rngFromSeed, type Rng } from "../../lib/rng";
import {
  BERET_BLACK,
  HAIR_COLORS,
  isPiba,
  OTHER_HEAD_COLORS,
  PANTS,
  SHIRTS,
  SKINS,
  SPRITE_H,
  SPRITE_W,
  type Hair,
  type Look,
} from "./sprites";

export const MAP_W = 120;
export const MAP_H = 160;
/** la caja de toque sobresale una unidad del sprite por cada lado */
export const HIT_PAD = 1;
/** alto de la cabeza (gorro, cara y pucho) que nunca puede quedar tapada */
export const HEAD_H = 6;

export type Role = "piba" | "senuelo" | "comun";
export type DecoyKind = "boina-estrella-sin-pucho" | "pucho-otro-gorro" | "boina-sin-estrella-con-pucho" | "boina-otro-color-con-pucho";

export interface Person {
  /** esquina superior izquierda, en unidades lógicas */
  x: number;
  y: number;
  look: Look;
  role: Role;
  decoy?: DecoyKind;
  /** orden de dibujo: mayor = más arriba */
  z: number;
}

export type SceneKind = "plaza" | "rambla" | "feria" | "playa" | "parada";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

export interface Scene {
  kind: SceneKind;
  sky: string;
  ground: string;
  /** desde qué fila puede pararse la gente */
  groundTop: number;
  /** rectángulos de ambiente, detrás de la gente */
  rects: Rect[];
}

export interface GameMap {
  index: number;
  seed: string;
  scene: Scene;
  people: Person[];
  /** índice de la piba dentro de people */
  pibaIndex: number;
}

// dificultad: 18 personas y 2 señuelos en el mapa 1, +8 y +2 por mapa,
// tope 70 y 16
export const START_PEOPLE = 18;
export const START_DECOYS = 2;
export const PEOPLE_STEP = 8;
export const DECOY_STEP = 2;
export const MAX_PEOPLE = 70;
export const MAX_DECOYS = 16;

export function difficulty(mapIndex: number): { people: number; decoys: number } {
  const i = Math.max(1, mapIndex) - 1;
  return {
    people: Math.min(START_PEOPLE + PEOPLE_STEP * i, MAX_PEOPLE),
    decoys: Math.min(START_DECOYS + DECOY_STEP * i, MAX_DECOYS),
  };
}

const DECOY_KINDS: DecoyKind[] = ["boina-estrella-sin-pucho", "pucho-otro-gorro", "boina-sin-estrella-con-pucho", "boina-otro-color-con-pucho"];
const SCENES: SceneKind[] = ["plaza", "rambla", "feria", "playa", "parada"];

export function generateMap(attemptSeed: string, mapIndex: number): GameMap {
  const rng = rngFromSeed(`piba:${attemptSeed}:${mapIndex}`);
  const scene = buildScene(rng.pick(SCENES), rng);
  const { people: total, decoys } = difficulty(mapIndex);

  const looks: Array<{ look: Look; role: Role; decoy?: DecoyKind }> = [];
  looks.push({ look: pibaLook(rng), role: "piba" });
  for (let i = 0; i < decoys; i++) {
    const kind = DECOY_KINDS[i % DECOY_KINDS.length]!;
    looks.push({ look: decoyLook(rng, kind), role: "senuelo", decoy: kind });
  }
  while (looks.length < total) looks.push({ look: commonLook(rng), role: "comun" });

  const placed: Person[] = [];
  for (const entry of looks) {
    const pos = place(rng, placed, scene.groundTop, entry.role === "piba");
    placed.push({ ...pos, ...entry, z: 0 });
  }
  // orden de dibujo: quien tiene los pies más abajo se dibuja más arriba
  const order = placed.map((p, i) => i).sort((a, b) => placed[a]!.y - placed[b]!.y || a - b);
  order.forEach((idx, z) => {
    placed[idx]!.z = z;
  });
  const pibaIndex = placed.findIndex((p) => p.role === "piba");
  return { index: mapIndex, seed: attemptSeed, scene, people: placed, pibaIndex };
}

// ---------------------------------------------------------------------------
// ubicación: nadie tapa la cabeza de la piba (garantizado); y se intenta que
// nadie tape la cabeza de nadie, con tope de intentos
// ---------------------------------------------------------------------------

const TRIES = 200;

function place(rng: Rng, placed: Person[], groundTop: number, isPibaNow: boolean): { x: number; y: number } {
  const xMax = MAP_W - SPRITE_W;
  const yMin = groundTop;
  const yMax = MAP_H - SPRITE_H;
  let fallback: { x: number; y: number } | null = null;
  for (let t = 0; t < TRIES * 3; t++) {
    const x = rng.int(0, xMax);
    const y = rng.int(yMin, yMax);
    const cand = { x, y };
    if (!coversAnyHead(cand, placed, (p) => p.role === "piba")) {
      // condición dura: la cabeza de la piba libre. La blanda: la de todos.
      if (!coversAnyHead(cand, placed, () => true) && !headCovered(cand, placed)) return cand;
      if (!fallback && t >= TRIES) fallback = cand;
    }
  }
  if (isPibaNow) return { x: rng.int(0, xMax), y: rng.int(yMin, yMax) };
  // sin lugar limpio: se acepta tapar cuerpos ajenos, nunca la cabeza de la piba
  return fallback ?? { x: rng.int(0, xMax), y: rng.int(yMin, yMax) };
}

function headRect(p: { x: number; y: number }) {
  return { x: p.x, y: p.y, w: SPRITE_W, h: HEAD_H };
}
function bodyRect(p: { x: number; y: number }) {
  return { x: p.x, y: p.y, w: SPRITE_W, h: SPRITE_H };
}
function intersects(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
/** ¿el candidato, dibujado encima de alguien (pies más abajo), le tapa la cabeza? */
function coversAnyHead(cand: { x: number; y: number }, placed: Person[], only: (p: Person) => boolean): boolean {
  return placed.some((p) => only(p) && cand.y >= p.y && intersects(bodyRect(cand), headRect(p)));
}
/** ¿alguien ya puesto, dibujado encima del candidato, le taparía la cabeza? */
function headCovered(cand: { x: number; y: number }, placed: Person[]): boolean {
  return placed.some((p) => p.y > cand.y && intersects(bodyRect(p), headRect(cand)));
}

// ---------------------------------------------------------------------------
// toques
// ---------------------------------------------------------------------------

export function hitBox(p: Person) {
  return { x: p.x - HIT_PAD, y: p.y - HIT_PAD, w: SPRITE_W + 2 * HIT_PAD, h: SPRITE_H + 2 * HIT_PAD };
}

/** la persona tocada: si hay varias, la de mayor orden de dibujo */
export function personAt(map: GameMap, x: number, y: number): Person | null {
  let best: Person | null = null;
  for (const p of map.people) {
    const b = hitBox(p);
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h && (!best || p.z > best.z)) best = p;
  }
  return best;
}

/** un punto seguro para tocar a la piba: el centro de su cara */
export function pibaTarget(map: GameMap): { x: number; y: number } {
  const p = map.people[map.pibaIndex]!;
  return { x: p.x + 3, y: p.y + 4 };
}

// ---------------------------------------------------------------------------
// pintas
// ---------------------------------------------------------------------------

const WOMAN_HAIR: Hair[] = ["largo", "recogido"];
const ANY_HAIR: Hair[] = ["corto", "largo", "recogido"];

function base(rng: Rng, hair: Hair): Look {
  return {
    skin: rng.pick(SKINS),
    hair,
    hairColor: rng.pick(HAIR_COLORS),
    shirt: rng.pick(SHIRTS),
    pants: rng.pick(PANTS),
    head: "nada",
    headColor: BERET_BLACK,
    star: false,
    cig: false,
  };
}

function pibaLook(rng: Rng): Look {
  return { ...base(rng, rng.pick(WOMAN_HAIR)), head: "boina", headColor: BERET_BLACK, star: true, cig: true };
}

function decoyLook(rng: Rng, kind: DecoyKind): Look {
  const b = base(rng, rng.pick(WOMAN_HAIR));
  switch (kind) {
    case "boina-estrella-sin-pucho":
      return { ...b, head: "boina", headColor: BERET_BLACK, star: true, cig: false };
    case "pucho-otro-gorro":
      return { ...b, head: rng.pick(["nada", "gorro", "gorra"] as const), headColor: rng.pick(OTHER_HEAD_COLORS), star: false, cig: true };
    case "boina-sin-estrella-con-pucho":
      return { ...b, head: "boina", headColor: BERET_BLACK, star: false, cig: true };
    case "boina-otro-color-con-pucho":
      return { ...b, head: "boina", headColor: rng.pick(OTHER_HEAD_COLORS), star: true, cig: true };
  }
}

function commonLook(rng: Rng): Look {
  const b = base(rng, rng.pick(ANY_HAIR));
  const head = rng.pick(["nada", "nada", "gorro", "gorra"] as const);
  return { ...b, head, headColor: rng.pick(OTHER_HEAD_COLORS), star: false, cig: false };
}

// ---------------------------------------------------------------------------
// escenarios: suelo y 3 o 4 elementos de ambiente; nada con forma de persona
// ---------------------------------------------------------------------------

function buildScene(kind: SceneKind, rng: Rng): Scene {
  const rects: Rect[] = [];
  const r = (x: number, y: number, w: number, h: number, c: string) => rects.push({ x, y, w, h, c });
  switch (kind) {
    case "plaza": {
      // dos árboles y dos bancos
      for (const tx of [rng.int(6, 30), rng.int(80, 104)]) {
        r(tx + 5, 14, 4, 14, "#6B4A2B");
        r(tx, 4, 14, 12, "#2F7D3A");
        r(tx + 3, 0, 8, 6, "#3C9A48");
      }
      for (const bx of [rng.int(8, 40), rng.int(64, 100)]) {
        r(bx, 22, 18, 3, "#8A5A32");
        r(bx, 26, 2, 4, "#8A5A32");
        r(bx + 16, 26, 2, 4, "#8A5A32");
      }
      return { kind, sky: "#9ED1F2", ground: "#5E9C4B", groundTop: 30, rects };
    }
    case "rambla": {
      // mar, muro bajo y vereda
      r(0, 0, MAP_W, 34, "#2E6FB0");
      for (let y = 6; y < 34; y += 7) r(rng.int(0, 60), y, rng.int(20, 50), 1, "#8FC3EA");
      r(0, 34, MAP_W, 6, "#7A7F86");
      r(0, 40, MAP_W, 2, "#5C6167");
      return { kind, sky: "#C9DCEC", ground: "#B7B1A3", groundTop: 42, rects };
    }
    case "feria": {
      // tres puestos con toldos rayados
      for (const px of [4, 46, 88]) {
        r(px, 8, 28, 12, "#8A5A32");
        for (let i = 0; i < 7; i++) r(px + i * 4, 2, 4, 8, i % 2 ? "#F2F2F2" : rng.pick(["#E2574C", "#3F7FCB", "#27AE60"]));
        r(px + 1, 20, 2, 8, "#5A3A1E");
        r(px + 25, 20, 2, 8, "#5A3A1E");
      }
      return { kind, sky: "#F4E7C3", ground: "#C7A56B", groundTop: 30, rects };
    }
    case "playa": {
      // mar, orilla y tres sombrillas
      r(0, 0, MAP_W, 30, "#2E9AC7");
      r(0, 30, MAP_W, 3, "#DCEFF7");
      for (const ux of [rng.int(4, 24), rng.int(46, 66), rng.int(88, 106)]) {
        r(ux, 36, 12, 4, rng.pick(["#E2574C", "#F2C94C", "#3F7FCB"]));
        r(ux + 2, 40, 8, 2, "#F2F2F2");
        r(ux + 5, 42, 2, 10, "#8A5A32");
      }
      return { kind, sky: "#BFE3F5", ground: "#EBD7A4", groundTop: 44, rects };
    }
    case "parada": {
      // refugio con techo y vidrio, cartel con poste
      r(30, 4, 60, 4, "#2E3A59");
      r(30, 8, 3, 22, "#2E3A59");
      r(87, 8, 3, 22, "#2E3A59");
      r(33, 8, 54, 20, "#B9DCEB");
      r(100, 2, 10, 8, "#F2C94C");
      r(104, 10, 2, 20, "#5C6167");
      r(0, 30, MAP_W, 3, "#5C6167");
      return { kind, sky: "#D9D9D9", ground: "#9A9A9A", groundTop: 34, rects };
    }
  }
}

/** para tests y herramientas: cuántas personas cumplen los tres rasgos */
export function countPibas(map: GameMap): number {
  return map.people.filter((p) => isPiba(p.look)).length;
}
