// Los cuatro objetos de "la torre": su pixel art (mapas de letras) y su forma
// de choque, armada con piezas simples (cajas y polígonos convexos) que
// siguen la silueta. Sin DOM, sin React y sin el motor de física: acá solo
// hay datos; physics.ts los convierte en colisionadores.
//
// Unidades: píxeles de arte = centímetros. El origen de cada objeto es el
// centro de su caja envolvente (ancho × alto de la tabla), con y hacia arriba.

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";

export type Kind = "vapo" | "cigarro" | "planta" | "botella";
export const KINDS: readonly Kind[] = ["vapo", "cigarro", "planta", "botella"];
export const KIND_NAMES: Record<Kind, string> = { vapo: "vaporizador", cigarro: "cigarro", planta: "planta", botella: "botella de whisky" };

/** una pieza de la forma de choque, en píxeles respecto del centro del objeto (y hacia arriba) */
export type Piece = { type: "box"; cx: number; cy: number; w: number; h: number } | { type: "poly"; points: readonly [number, number][] };

export interface ObjectSpec {
  kind: Kind;
  w: number;
  h: number;
  pieces: readonly Piece[];
  /** masa por área (la botella es la más pesada, el cigarro el más liviano) */
  density: number;
  /** la maceta agarra más que el vidrio */
  friction: number;
}

const K = OUTLINE;

// ---------------------------------------------------------------------------
// vaporizador: un cuadrado de 12 × 12 con la boquilla arriba y un botón
// ---------------------------------------------------------------------------
const VAPO_ROWS = [
  "KKKKKKKKKKKK",
  "KmmmmKKmmmmK",
  "KmmmmKKmmmmK",
  "KGGGGGGGGGGK",
  "KGLLLLLLLLGK",
  "KGLLLLLLLLGK",
  "KGGGGGGGGGGK",
  "KGGGBBGGGGGK",
  "KGGGBBGGGGGK",
  "KGGGGGGGGGGK",
  "KGGGGGGGGGGK",
  "KKKKKKKKKKKK",
];
const VAPO_PAL = { K, G: "#3B4A9B", L: "#8EE3FF", B: "#FF6F91", m: "#8A8A94" };

// ---------------------------------------------------------------------------
// cigarro: blanco con filtro naranja (3 × 18), vertical
// ---------------------------------------------------------------------------
const CIG_ROWS = ["KKK", "KoK", "KWK", "KWK", "KWK", "KWK", "KWK", "KWK", "KWK", "KWK", "KWK", "KWK", "KWK", "KFK", "KFK", "KFK", "KFK", "KKK"];
const CIG_PAL = { K, W: "#F7F2E8", F: "#E8862A", o: "#FF6A00" };

// ---------------------------------------------------------------------------
// planta: maceta de barro (10 de ancho, 8 de alto) y follaje irregular de
// hasta 14 de ancho (14 × 20 en total)
// ---------------------------------------------------------------------------
const PLANT_ROWS = [
  "...KKKKKKKK...",
  "..KgGGGGGGgK..",
  ".KKGGGgGGGGKK.",
  ".KggGGGGGGggK.",
  ".KgGGGgGGGGgK.",
  "..KGgGGGGgGK..",
  "KKKGGGGGGGGKKK",
  "KgGGgGGGGGGGgK",
  ".KKGGGGGGGGKK.",
  "...KGGgGGGK...",
  "....KKKKKK....",
  "...KKKKKKKK...",
  "..KTTTTTTTTK..",
  "..KTtTTTTTTK..",
  "..KTTTTTTTTK..",
  "..KTTTTTTTTK..",
  "..KTtTTTTTTK..",
  "..KTTTTTTTTK..",
  "..KTTTTTTTTK..",
  "..KKKKKKKKKK..",
];
const PLANT_PAL = { K, G: "#4E9A36", g: "#7FC25A", T: "#B5652D", t: "#CF7D42" };

// ---------------------------------------------------------------------------
// botella: cuerpo de 10, hombros, cuello de 4 (10 × 22), ámbar con etiqueta
// ---------------------------------------------------------------------------
const BOTTLE_ROWS = [
  "...KKKK...",
  "...KccK...",
  "...KAAK...",
  "...KAAK...",
  "...KAAK...",
  "...KAAK...",
  "..KAAAAK..",
  ".KAAAAAAK.",
  "KAAAAAAAAK",
  "KAAAAAAAAK",
  "KAAAAAAAAK",
  "KAEEEEEEAK",
  "KAEeEEeEAK",
  "KAEEEEEEAK",
  "KAEEeEEEAK",
  "KAEEEEEEAK",
  "KAAAAAAAAK",
  "KAAaAAAAAK",
  "KAAaAAAAAK",
  "KAAAAAAAAK",
  "KAAAAAAAAK",
  "KKKKKKKKKK",
];
const BOTTLE_PAL = { K, A: "#C8782A", a: "#E09A4A", E: "#F3E9D2", e: "#8A2B2B", c: "#2A2A2A" };

export const SPECS: Record<Kind, ObjectSpec> = {
  vapo: { kind: "vapo", w: 12, h: 12, pieces: [{ type: "box", cx: 0, cy: 0, w: 12, h: 12 }], density: 0.8, friction: 0.6 },
  cigarro: { kind: "cigarro", w: 3, h: 18, pieces: [{ type: "box", cx: 0, cy: 0, w: 3, h: 18 }], density: 0.3, friction: 0.5 },
  planta: {
    kind: "planta",
    w: 14,
    h: 20,
    pieces: [
      // la maceta (abajo): 10 de ancho, 8 de alto; y la base de la maceta un poco más angosta
      { type: "box", cx: 0, cy: -6, w: 10, h: 8 },
      // el follaje: un polígono convexo ancho y otro que sube irregular (la copa)
      { type: "poly", points: [[-7, 1], [7, 1], [6, 5], [-6, 5]] },
      { type: "poly", points: [[-6, 4], [6, 4], [4, 10], [-4, 10]] },
    ],
    density: 0.9,
    friction: 0.9,
  },
  botella: {
    kind: "botella",
    w: 10,
    h: 22,
    pieces: [
      // el cuerpo, los hombros (trapecio) y el cuello
      { type: "box", cx: 0, cy: -4, w: 10, h: 14 },
      { type: "poly", points: [[-5, 3], [5, 3], [2, 6], [-2, 6]] },
      { type: "box", cx: 0, cy: 8.5, w: 4, h: 5 },
    ],
    density: 1.3,
    friction: 0.4,
  },
};

const ROWS: Record<Kind, { rows: string[]; pal: Record<string, string> }> = {
  vapo: { rows: VAPO_ROWS, pal: VAPO_PAL },
  cigarro: { rows: CIG_ROWS, pal: CIG_PAL },
  planta: { rows: PLANT_ROWS, pal: PLANT_PAL },
  botella: { rows: BOTTLE_ROWS, pal: BOTTLE_PAL },
};

const cache = new Map<Kind, Sprite>();
export function objectSprite(kind: Kind): Sprite {
  let s = cache.get(kind);
  if (!s) {
    s = build(ROWS[kind].rows, ROWS[kind].pal);
    cache.set(kind, s);
  }
  return s;
}

/** cuántos píxeles pintados tiene el mapa (la silueta), para comparar con el área de la forma */
export function siluetteArea(kind: Kind): number {
  return objectSprite(kind).px.length;
}

/** el área de una pieza, en px² */
export function pieceArea(p: Piece): number {
  if (p.type === "box") return p.w * p.h;
  let a = 0;
  for (let i = 0; i < p.points.length; i++) {
    const [x1, y1] = p.points[i]!;
    const [x2, y2] = p.points[(i + 1) % p.points.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function shapeArea(kind: Kind): number {
  return SPECS[kind].pieces.reduce((s, p) => s + pieceArea(p), 0);
}

/** el centroide (por área) de la forma, respecto del centro del objeto, sin girar */
export function centroid(kind: Kind): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let sa = 0;
  for (const p of SPECS[kind].pieces) {
    const a = pieceArea(p);
    if (p.type === "box") {
      sx += p.cx * a;
      sy += p.cy * a;
    } else {
      let cx = 0;
      let cy = 0;
      for (const [x, y] of p.points) {
        cx += x;
        cy += y;
      }
      sx += (cx / p.points.length) * a;
      sy += (cy / p.points.length) * a;
    }
    sa += a;
  }
  return { x: sx / sa, y: sy / sa };
}

/** cuánto queda corrido en x el centro de masa respecto del centro del objeto, girado `rot` cuartos de vuelta */
export function comOffsetX(kind: Kind, rot: number): number {
  const c = centroid(kind);
  switch (rot & 3) {
    case 0:
      return c.x;
    case 1:
      return -c.y;
    case 2:
      return -c.x;
    default:
      return c.y;
  }
}

/** el alto del objeto en cada rotación (0 y 180 → h; 90 y 270 → w) */
export function heightAt(kind: Kind, rot: number): number {
  return rot % 2 === 0 ? SPECS[kind].h : SPECS[kind].w;
}
