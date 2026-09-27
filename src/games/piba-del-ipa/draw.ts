// Dibujo del mapa en un <canvas>, en escalado entero. Sin React: lo usan el
// juego, la vista previa de desarrollo y las capturas.

import { MAP_H, MAP_W, type GameMap } from "./map";
import { personPixels, SPRITE_H, SPRITE_W } from "./sprites";

export interface DrawOptions {
  /** cuadro del humo (0 a 2) */
  smokeFrame?: number;
  /** resaltar a la piba (rojo) y a los señuelos (amarillo) */
  highlight?: boolean;
  /** resaltar solo a la piba (al encontrarla) */
  flashPiba?: boolean;
}

/** píxeles del dispositivo por unidad lógica que entran en un espacio dado */
export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return Math.max(1, Math.floor(Math.min((cssWidth * dpr) / MAP_W, (cssHeight * dpr) / MAP_H)));
}

export function drawMap(ctx: CanvasRenderingContext2D, map: GameMap, k: number, opts: DrawOptions = {}) {
  ctx.imageSmoothingEnabled = false;
  const { scene } = map;
  ctx.fillStyle = scene.sky;
  ctx.fillRect(0, 0, MAP_W * k, scene.groundTop * k);
  ctx.fillStyle = scene.ground;
  ctx.fillRect(0, scene.groundTop * k, MAP_W * k, (MAP_H - scene.groundTop) * k);
  for (const r of scene.rects) {
    ctx.fillStyle = r.c;
    ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
  }
  const people = [...map.people].sort((a, b) => a.z - b.z);
  for (const p of people) {
    for (const px of personPixels(p.look, opts.smokeFrame ?? 0)) {
      ctx.fillStyle = px.c;
      ctx.fillRect((p.x + px.x) * k, (p.y + px.y) * k, k, k);
    }
  }
  if (opts.highlight || opts.flashPiba) {
    ctx.lineWidth = Math.max(1, Math.floor(k / 2));
    for (const p of people) {
      if (p.role === "piba") ctx.strokeStyle = "#FF3B30";
      else if (p.role === "senuelo" && opts.highlight) ctx.strokeStyle = "#FFD34E";
      else continue;
      ctx.strokeRect((p.x - 1) * k + ctx.lineWidth / 2, (p.y - 1) * k + ctx.lineWidth / 2, (SPRITE_W + 2) * k - ctx.lineWidth, (SPRITE_H + 2) * k - ctx.lineWidth);
    }
  }
}
