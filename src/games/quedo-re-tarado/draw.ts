// Dibujo de la cara en un <canvas>, en escalado entero. Sin React.

import { FACE_H, FACE_W, facePixels, type FaceDrawState, type FaceLook } from "./face";

export interface FallingAsh {
  /** unidades del lienzo donde nació */
  x: number;
  y: number;
  /** 0..1 */
  progress: number;
}

export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return Math.max(1, Math.floor(Math.min((cssWidth * dpr) / FACE_W, (cssHeight * dpr) / FACE_H)));
}

export function drawFace(ctx: CanvasRenderingContext2D, look: FaceLook, state: FaceDrawState, k: number, falling: FallingAsh[] = []) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = look.bg;
  ctx.fillRect(0, 0, FACE_W * k, FACE_H * k);
  for (const p of facePixels(look, state)) {
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x * k, p.y * k, k, k);
  }
  // ceniza que cae: baja hasta 8 unidades y se desvanece
  for (const a of falling) {
    const y = a.y + a.progress * 8;
    ctx.globalAlpha = 1 - a.progress;
    ctx.fillStyle = "#B9B9B9";
    ctx.fillRect(a.x * k, Math.round(y) * k, k, k);
    ctx.globalAlpha = 1;
  }
}
