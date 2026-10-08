// Pixel art de "Cazando Colillas": la rana de Frog (la grilla de la
// mascota, components/frog/frog-grid, pintada acá con la boca cerrada,
// abierta o masticando, y en verde oscuro cuando tose), la colilla de la
// moneda de la app (components/colilla) con alitas de mosca, el vapeador con
// alitas, los nenúfares y las nubes. Mapas de letras, sin DOM.

import { cellColor, frogGrid, GRID, type FrogPose } from "@/components/frog/frog-grid";
import { COLILLA_SPRITE } from "@/components/colilla";
import { buildSprite as build, composeSprite, OUTLINE, type Pixel, type Sprite } from "../lib/sprites";

export type { Sprite };
const K = OUTLINE;

/** la vista: un cuadrado de 160 unidades; el campo lógico (4096) se escala a eso */
export const FIELD_PX = 160;
export const UNITS_PER_PX = 4096 / FIELD_PX;
/** la rana se dibuja al triple de su grilla de 15 × 15 */
export const FROG_SCALE = 3;
export const FROG_PX = GRID * FROG_SCALE;
/** la boca de la mascota está en la celda (7, 9) de la grilla: la rana se acomoda para que caiga en el centro */
export const FROG_X = FIELD_PX / 2 - 7 * FROG_SCALE - 1;
export const FROG_Y = FIELD_PX / 2 - 9 * FROG_SCALE - 1;

export type Mouth = "cerrada" | "abierta" | "masticando";

/** la rana de la mascota: `pose` de la app (feliz, risa…) y la boca según lo que pasa; `dark` es la de la tos */
const frogCache = new Map<string, Sprite>();
export function frogSprite(mouth: Mouth, opts: { blink?: boolean; dark?: boolean } = {}): Sprite {
  const key = `${mouth}:${opts.blink ? 1 : 0}:${opts.dark ? 1 : 0}`;
  let s = frogCache.get(key);
  if (s) return s;
  const pose: FrogPose = mouth === "masticando" ? "risa" : "feliz";
  const g = frogGrid(pose, { sticker: false, blink: !!opts.blink });
  if (mouth === "abierta") {
    // la boca abierta: un hueco oscuro de dos filas donde estaba la línea de la boca
    for (let c = 4; c <= 9; c++) {
      g[9]![c] = "E";
      g[10]![c] = "E";
    }
    g[9]![3] = "M";
    g[9]![10] = "M";
  }
  const px: Pixel[] = [];
  g.forEach((row, y) =>
    row.forEach((ch, x) => {
      let c = cellColor(ch, "#6CC24A");
      if (!c) return;
      if (opts.dark) {
        if (ch === "G") c = "#2E5F2A";
        else if (ch === "H") c = "#4A8A3E";
        else if (ch === "N") c = "#1F4320";
      }
      px.push({ x, y, c });
    }),
  );
  // un contorno oscuro alrededor, como los otros sprites del juego
  const filled = new Set(px.map((p) => `${p.x},${p.y}`));
  const outline: Pixel[] = [];
  for (const p of px) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const k = `${p.x + dx},${p.y + dy}`;
      if (!filled.has(k) && p.x + dx >= 0 && p.y + dy >= 0 && p.x + dx < GRID && p.y + dy < GRID) {
        filled.add(k);
        outline.push({ x: p.x + dx, y: p.y + dy, c: K });
      }
    }
  }
  s = { w: GRID, h: GRID, px: [...outline, ...px] };
  frogCache.set(key, s);
  return s;
}

// ---------------------------------------------------------------------------
// las alitas y las cosas que vuelan
// ---------------------------------------------------------------------------

const WING_UP = ["WWW.", ".WWW", "..WW"];
const WING_DOWN = ["....", "..WW", "WWWW"];
const WING_PALETTE = { W: "#D9F2FF", K };
function wing(frame: 0 | 1, flip: boolean): Sprite {
  const rows = frame === 0 ? WING_UP : WING_DOWN;
  const r = flip ? rows.map((row) => [...row].reverse().join("")) : rows;
  return build(r, WING_PALETTE);
}

export const COLILLA_W = 24;
export const COLILLA_H = 10;
const colillaCache = new Map<number, Sprite>();
/** la colilla de la moneda con alitas (24 × 10); `frame` 0 o 1 para el aleteo */
export function colillaSprite(frame: 0 | 1 = 0): Sprite {
  let s = colillaCache.get(frame);
  if (!s) {
    s = composeSprite(COLILLA_W, COLILLA_H, [
      { sprite: wing(frame, true), x: 0, y: frame === 0 ? 0 : 1 },
      { sprite: wing(frame, false), x: 20, y: frame === 0 ? 0 : 1 },
      { sprite: COLILLA_SPRITE, x: 4, y: 3 },
    ]);
    colillaCache.set(frame, s);
  }
  return s;
}

export const VAPO_W = 16;
export const VAPO_H = 14;
const VAPO_ROWS = ["......KK........", ".....KvvK.......", "......KK........", "....KKKKKK......", "...KPPLLPPK.....", "...KPPLLPPK.....", "...KPPPPPPK.....", "...KPpPPPpK.....", "...KPPPPPPK.....", "...KPPPPPPK.....", "...KPPCCPPK.....", "....KKKKKK......"];
const VAPO_PALETTE = { K, P: "#7B5FE0", p: "#5A42B8", L: "#BFE3FF", C: "#6FD3E0", v: "#E6E6F0" };
const vapoCache = new Map<number, Sprite>();
/** un vape de bolsillo con su nubecita y alitas (16 × 14) */
export function vapoSprite(frame: 0 | 1 = 0): Sprite {
  let s = vapoCache.get(frame);
  if (!s) {
    s = composeSprite(VAPO_W, VAPO_H, [
      { sprite: wing(frame, true), x: 0, y: frame === 0 ? 4 : 5 },
      { sprite: wing(frame, false), x: 12, y: frame === 0 ? 4 : 5 },
      { sprite: build(VAPO_ROWS, VAPO_PALETTE), x: 0, y: 1 },
    ]);
    vapoCache.set(frame, s);
  }
  return s;
}

/** una nube de vapor (7 × 4) */
let cloud: Sprite | null = null;
export function cloudSprite(): Sprite {
  cloud ??= build(["..WWW..", ".WWWWW.", "WWWWWWW", ".WW.WW."], { W: "#C9D6E2" });
  return cloud;
}

/** un nenúfar: un círculo con una cuña faltante, como los de la app (18 × 12) */
const LILY_ROWS = ["....KKKKKKK.....", "..KKGGGGGGGKK...", ".KGGGgGGGGGGGK..", "KGGGGGGGGGGGGGKK", "KGGgGGGGGGGGGGK.", "KGGGGGGGGGGGGK..", ".KGGGGGGGGGKK...", "..KKGGGGGGK.....", "....KKKKKK......"];
let lily: Sprite | null = null;
export function lilySprite(): Sprite {
  lily ??= build(LILY_ROWS, { K: "#0B1F19", G: "#2E6B3A", g: "#4E9A36" });
  return lily;
}
/** el nenúfar grande donde está sentada la rana (46 × 22) */
let bigLily: Sprite | null = null;
export function bigLilySprite(): Sprite {
  if (!bigLily) {
    const w = 46;
    const h = 22;
    const px: Pixel[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - w / 2 + 0.5) / (w / 2);
        const dy = (y - h / 2 + 0.5) / (h / 2);
        const r = dx * dx + dy * dy;
        if (r > 1) continue;
        // la cuña que falta, abajo a la derecha
        if (dx > 0.15 && dy > 0.15 && dy < dx * 1.2) continue;
        px.push({ x, y, c: r > 0.82 ? "#0B1F19" : (x + y) % 7 === 0 ? "#4E9A36" : "#2E6B3A" });
      }
    }
    bigLily = { w, h, px };
  }
  return bigLily;
}
