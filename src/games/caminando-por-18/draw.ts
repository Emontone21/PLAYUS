// Dibujo de la partida en un <canvas>, en escalado entero. Sin React: lo usan
// el juego y la herramienta de desarrollo. Dibuja el estado interpolado entre
// el tick anterior y el actual (alpha).
//
// La calle baja: el mosaico se desplaza con los metros. Los pastosos se
// mueven en coordenadas de pantalla (van hacia el personaje, que va fijo).

import { integerScale, px } from "../lib/canvas-scale";
import { paintedCanvas, spriteCanvas } from "../lib/sprites";
import { textSprite } from "../lib/font";
import {
  boxOf,
  DONPASTA_H,
  DONPASTA_W,
  DONPASTA_PHRASE,
  FIELD_H,
  FIELD_W,
  PASTOSO_H,
  PASTOSO_W,
  PHRASES,
  SCROLL_SUB_PER_TICK,
  SUB,
  TICKS_PER_M,
  UNITS_PER_M,
  WALKER_HIT_H,
  WALKER_HIT_W,
  WALKER_X,
  WALKER_Y,
  type Pastoso,
  type SimState,
  type Spawn,
} from "./rules";
import { pastosoSprite, streetRects, walkerSprite, WALKER_SPRITE_H, WALKER_SPRITE_W } from "./sprites";

/** sacudón al ser frenado (decorativo) */
const SHAKE_TICKS = 12;
/** cada cuántos metros hay un cartel de esquina */
export const SIGN_EVERY_M = 100;

export interface DrawOptions {
  alpha: number;
  reduced?: boolean;
  hitboxes?: boolean;
}

export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return integerScale(cssWidth, cssHeight, dpr, FIELD_W, FIELD_H);
}

function background(k: number) {
  return paintedCanvas("18:calle", FIELD_W, FIELD_H, k, (ctx) => {
    for (const r of streetRects()) {
      ctx.fillStyle = r.c;
      ctx.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
    }
  });
}

/** un globo de texto chico, con la fuente de la app (no es pixel art: es texto) */
function bubble(ctx: CanvasRenderingContext2D, text: string, cx: number, top: number, k: number, alert = false) {
  const fontPx = Math.max(8, Math.round(4.2 * k));
  ctx.font = `700 ${fontPx}px Fredoka, "Instrument Sans", sans-serif`;
  const w = ctx.measureText(text).width + 6 * k;
  const h = fontPx + 4 * k;
  let x = px(cx, k) - w / 2;
  x = Math.max(k, Math.min(FIELD_W * k - w - k, x));
  const y = Math.max(k, px(top, k) - h);
  ctx.fillStyle = alert ? "#FF6F91" : "#FFFFFF";
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = Math.max(1, Math.floor(k / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3 * k);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#141414";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, x + w / 2, y + h / 2);
}

/** hacia dónde mira un pastoso: de frente si baja (o está quieto), de espaldas si sube */
function facing(p: Pastoso, side: Spawn["side"]): "viene" | "se-va" {
  const dy = p.y - p.prevY;
  if (dy > 0) return "viene";
  if (dy < 0) return "se-va";
  return side === "abajo" ? "se-va" : "viene";
}

export function drawScene(ctx: CanvasRenderingContext2D, state: SimState, street: readonly Spawn[], k: number, opts: DrawOptions) {
  ctx.imageSmoothingEnabled = false;
  const a = state.end ? 1 : opts.alpha;
  const tick = state.tick - 1 + a;
  ctx.save();
  if (!opts.reduced && state.end?.reason === "frenado" && state.tick - state.end.tick < SHAKE_TICKS) ctx.translate(state.tick % 2 === 0 ? k : -k, 0);

  // la calle baja con los metros
  const scroll = ((tick * SCROLL_SUB_PER_TICK) / SUB) % FIELD_H;
  ctx.drawImage(background(k), 0, px(scroll - FIELD_H, k));
  ctx.drawImage(background(k), 0, px(scroll, k));

  // carteles de esquina cada 100 m (el cartel de los N metros pasa por el personaje al llegar a N)
  const meters = tick / TICKS_PER_M;
  const firstSign = Math.max(1, Math.floor((meters - (FIELD_H - WALKER_Y) / UNITS_PER_M) / SIGN_EVERY_M));
  for (let m = firstSign * SIGN_EVERY_M; ; m += SIGN_EVERY_M) {
    const y = WALKER_Y - (m - meters) * UNITS_PER_M;
    if (y < -12) break;
    const sp = textSprite(`${m / SIGN_EVERY_M}`, "#F7F7F7");
    const board = 9 + sp.w;
    ctx.fillStyle = "#3B6BD6";
    ctx.fillRect(px(1, k), px(y - 8, k), board * k, 7 * k);
    ctx.fillStyle = "#141414";
    ctx.fillRect(px(1, k), px(y - 1, k), board * k, k);
    ctx.drawImage(spriteCanvas(`18:cuadra:${m}`, sp, k), px(6, k), px(y - 7, k));
    ctx.fillStyle = "#F7F7F7";
    ctx.fillRect(px(2, k), px(y - 6, k), 3 * k, 3 * k);
  }

  // los pastosos (los que se van, primero: quedan detrás)
  const sorted = [...state.pastosos].sort((p, q) => (p.phase === "se-va" ? -1 : 1) - (q.phase === "se-va" ? -1 : 1) || p.y - q.y);
  const frame = (Math.floor(state.tick / 8) % 2) as 0 | 1;
  // los que vienen de atrás (o se van hacia arriba) se ven de espaldas
  const behindWalker = sorted.filter((p) => p.y > WALKER_Y * SUB);
  const inFront = sorted.filter((p) => p.y <= WALKER_Y * SUB);
  const drawPastoso = (p: Pastoso) => {
    const x = (p.prevX + (p.x - p.prevX) * a) / SUB;
    const y = (p.prevY + (p.y - p.prevY) * a) / SUB;
    const look = p.phase === "agarra" ? "viene" : facing(p, street[p.i]!.side);
    const f = p.phase === "viene" && !opts.reduced ? frame : 0;
    const sp = pastosoSprite(p.kind, look, p.hits, f);
    ctx.drawImage(spriteCanvas(`18:p:${p.kind}:${look}:${Math.min(3, p.hits)}:${f}`, sp, k), px(x - sp.w / 2, k), px(y - sp.h / 2, k));
  };
  for (const p of inFront) drawPastoso(p);

  // el personaje
  const wf = state.end ? 0 : ((Math.floor(state.tick / 7) % 3) as 0 | 1 | 2);
  ctx.drawImage(spriteCanvas(`18:walker:${wf}`, walkerSprite(wf), k), px(WALKER_X - WALKER_SPRITE_W / 2, k), px(WALKER_Y - WALKER_SPRITE_H / 2, k));
  for (const p of behindWalker) drawPastoso(p);

  // los globos: al aparecer (una de las tres frases) y al irse; don pasta con las suyas
  for (const p of state.pastosos) {
    if (state.tick >= p.sayUntil) continue;
    const x = (p.prevX + (p.x - p.prevX) * a) / SUB;
    const y = (p.prevY + (p.y - p.prevY) * a) / SUB;
    const top = y - (p.kind === "donpasta" ? DONPASTA_H : PASTOSO_H) / 2 - 1;
    const text = p.phase === "se-va" ? (p.kind === "donpasta" ? "bueno, bueno" : "¡uh, bueno!") : phraseOf(street[p.i]!);
    bubble(ctx, text, x, Math.max(top, 7), k);
  }

  if (opts.hitboxes) {
    ctx.lineWidth = Math.max(1, Math.floor(k / 3));
    ctx.strokeStyle = "#FF3B30";
    ctx.strokeRect(px(WALKER_X - WALKER_HIT_W / 2, k), px(WALKER_Y - WALKER_HIT_H / 2, k), WALKER_HIT_W * k, WALKER_HIT_H * k);
    for (const p of state.pastosos) {
      if (p.phase !== "viene") continue;
      const b = boxOf(p);
      const x = (p.prevX + (p.x - p.prevX) * a) / SUB;
      const y = (p.prevY + (p.y - p.prevY) * a) / SUB;
      ctx.strokeStyle = p.kind === "donpasta" ? "#FFD34E" : "#6FD3E0";
      ctx.strokeRect(px(x - b.w / 2, k), px(y - b.h / 2, k), b.w * k, b.h * k);
      const dw = p.kind === "donpasta" ? DONPASTA_W : PASTOSO_W;
      const dh = p.kind === "donpasta" ? DONPASTA_H : PASTOSO_H;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.strokeRect(px(x - dw / 2, k), px(y - dh / 2, k), dw * k, dh * k);
    }
  }
  ctx.restore();
}

/** lo que dice al aparecer */
export function phraseOf(s: Spawn): string {
  return s.kind === "donpasta" ? DONPASTA_PHRASE : PHRASES[s.phrase] ?? PHRASES[0];
}

/** para la herramienta de desarrollo: un pastoso solo, grande, en su escena */
export function drawKind(ctx: CanvasRenderingContext2D, p: Pastoso, k: number) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(background(k), 0, 0);
  const sp = pastosoSprite(p.kind, p.phase, p.hits, 0);
  ctx.drawImage(spriteCanvas(`18:g:${p.kind}:${p.phase}:${p.hits}`, sp, k), px(p.x / SUB - sp.w / 2, k), px(p.y / SUB - sp.h / 2, k));
  bubble(ctx, p.kind === "donpasta" ? DONPASTA_PHRASE : PHRASES[p.i % PHRASES.length]!, p.x / SUB, p.y / SUB - sp.h / 2 - 1, k);
}
