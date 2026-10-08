// Dibujo de "Cazando Colillas" en un <canvas> chico (160 × 160)
// escalado entero: el estanque de noche (agua verde oscura con reflejos,
// nenúfares alrededor), la rana de Frog sentada en un nenúfar en el centro,
// la lengua rosa con la punta redonda, las colillas y los vapeadores con sus
// alitas aleteando, el +1, y la tos con nubes de vapor al final. El estado se
// interpola entre ticks con `alpha`.

import { px } from "../lib/canvas-scale";
import { blit } from "../lib/hdp-kitchen";
import { textSprite } from "../lib/font";
import { alive, CRASH_HOLD_TICKS, MOUTH, posAt, REACH, SIZES, SUBSTEPS, TIP_R, tipAt, type Pt, type SimState, type Thing } from "./rules";
import { bigLilySprite, cloudSprite, colillaSprite, COLILLA_H, COLILLA_W, FIELD_PX, FROG_SCALE, FROG_X, FROG_Y, frogSprite, lilySprite, UNITS_PER_PX, vapoSprite, VAPO_H, VAPO_W, type Mouth } from "./sprites";

export const WATER = "#10342B";
export const WATER_LIGHT = "#1B4D3F";
export const TONGUE = "#FF6F91";
export const TONGUE_DARK = "#C94B6B";
/** después de comer, mastica este tiempo */
export const CHEW_TICKS = 24;
/** el +1 sube durante esto */
export const PLUS_TICKS = 30;

export interface DrawOptions {
  alpha: number;
  reduced?: boolean;
  blink?: boolean;
  /** herramienta: cajas de choque, alcance y trayectorias que vienen */
  debug?: boolean;
}

let off: HTMLCanvasElement | null = null;
function offscreen(): HTMLCanvasElement {
  if (!off) {
    off = document.createElement("canvas");
    off.width = FIELD_PX;
    off.height = FIELD_PX;
  }
  return off;
}

/** unidades lógicas → unidades de la vista */
export function toView(p: Pt): [number, number] {
  return [p.x / UNITS_PER_PX, p.y / UNITS_PER_PX];
}

/** la boca según lo que pasa */
export function mouthFor(s: SimState): Mouth {
  if (s.tongue && s.tongue.turnAt < 0) return "abierta";
  if (s.tongue && s.tongue.carrying !== null) return "abierta";
  if (s.lastEatTick >= 0 && s.tick - s.lastEatTick < CHEW_TICKS) return Math.floor((s.tick - s.lastEatTick) / 6) % 2 ? "masticando" : "cerrada";
  return "cerrada";
}

/** la punta de la lengua ahora (con fracción de tick) */
export function tipNow(s: SimState, alpha: number): Pt | null {
  const tg = s.tongue;
  if (!tg) return null;
  if (tg.turnAt < 0) {
    const n = Math.min(tg.ticks * SUBSTEPS, Math.round((s.tick - tg.start + alpha) * SUBSTEPS));
    return tipAt(tg.target, tg.ticks, Math.max(0, n));
  }
  const p = Math.min(1, (s.tick - tg.turnAt + alpha) / Math.max(1, tg.back));
  return { x: Math.round(tg.reached.x + (MOUTH.x - tg.reached.x) * p), y: Math.round(tg.reached.y + (MOUTH.y - tg.reached.y) * p) };
}

const LILIES: [number, number][] = [
  [8, 14],
  [120, 10],
  [136, 60],
  [6, 100],
  [118, 132],
  [40, 140],
];

export function paintScene(ctx: CanvasRenderingContext2D, s: SimState, o: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  const t = s.tick + o.alpha;
  // el agua, con reflejos que se corren despacio
  ctx.fillStyle = WATER;
  ctx.fillRect(0, 0, FIELD_PX, FIELD_PX);
  ctx.fillStyle = WATER_LIGHT;
  const shift = o.reduced ? 0 : Math.floor(t / 12) % 24;
  for (let y = 6; y < FIELD_PX; y += 12) {
    for (let x = ((y / 12) * 9 + shift) % 24; x < FIELD_PX; x += 24) ctx.fillRect(x, y, 6, 1);
  }
  for (const [lx, ly] of LILIES) blit(ctx, "rana:nenufar", lilySprite(), lx, ly);
  // el nenúfar grande y la rana
  const big = bigLilySprite();
  blit(ctx, "rana:nenufar-grande", big, FIELD_PX / 2 - big.w / 2, FIELD_PX / 2 - 2);
  const mouth = mouthFor(s);
  const frog = frogSprite(mouth, { blink: !!o.blink && !s.crashed, dark: s.crashed });
  blit(ctx, `rana:rana:${mouth}:${o.blink ? 1 : 0}:${s.crashed ? 1 : 0}`, frog, FROG_X, FROG_Y, frog.w * FROG_SCALE, frog.h * FROG_SCALE);
  // herramienta: el alcance y las trayectorias que vienen
  if (o.debug) {
    ctx.strokeStyle = "rgba(111, 211, 224, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(FIELD_PX / 2, FIELD_PX / 2, REACH / UNITS_PER_PX, 0, Math.PI * 2);
    ctx.stroke();
    for (const th of s.course.things) {
      if (!alive(th, s.tick) || s.eaten.has(th.id)) continue;
      ctx.fillStyle = th.kind === "vapo" ? "rgba(255, 111, 145, 0.7)" : "rgba(142, 220, 102, 0.7)";
      for (let tq = (s.tick - th.spawn) * SUBSTEPS; tq < th.life * SUBSTEPS; tq += 24) {
        const [x, y] = toView(posAt(th, tq));
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  }
  // las cosas que vuelan (interpoladas por subpaso)
  const frame: 0 | 1 = o.reduced ? 0 : Math.floor(t / 4) % 2 === 0 ? 0 : 1;
  const tqNow = (th: Thing) => (s.tick - th.spawn) * SUBSTEPS + Math.round(o.alpha * SUBSTEPS);
  for (const th of s.course.things) {
    if (!alive(th, s.tick) || s.eaten.has(th.id)) continue;
    const c = posAt(th, tqNow(th));
    const [x, y] = toView(c);
    if (th.kind === "colilla") blit(ctx, `rana:colilla:${frame}`, colillaSprite(frame), x - COLILLA_W / 2, y - COLILLA_H / 2);
    else blit(ctx, `rana:vapo:${frame}`, vapoSprite(frame), x - VAPO_W / 2, y - VAPO_H / 2);
    if (o.debug) {
      const sz = SIZES[th.kind];
      ctx.strokeStyle = th.kind === "vapo" ? "rgba(255, 111, 145, 0.9)" : "rgba(142, 220, 102, 0.9)";
      ctx.strokeRect(x - sz.hw / UNITS_PER_PX + 0.5, y - sz.hh / UNITS_PER_PX + 0.5, (2 * sz.hw) / UNITS_PER_PX, (2 * sz.hh) / UNITS_PER_PX);
    }
  }
  // la lengua
  const tip = tipNow(s, o.alpha);
  if (tip) {
    const [mx, my] = toView(MOUTH);
    const [tx, ty] = toView(tip);
    ctx.strokeStyle = TONGUE;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.fillStyle = TONGUE;
    ctx.beginPath();
    ctx.arc(tx, ty, TIP_R / UNITS_PER_PX + 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TONGUE_DARK;
    ctx.fillRect(Math.round(tx), Math.round(ty) + 1, 1, 1);
    // la colilla que trae
    if (s.tongue?.carrying !== null && s.tongue?.carrying !== undefined) blit(ctx, "rana:colilla:0", colillaSprite(0), tx - COLILLA_W / 2, ty - COLILLA_H / 2);
  }
  // el +1
  if (s.lastEatTick >= 0 && s.tick - s.lastEatTick < PLUS_TICKS) {
    const p = (s.tick - s.lastEatTick + o.alpha) / PLUS_TICKS;
    const plus = textSprite("+1", "#8EDC66");
    blit(ctx, "rana:plus", plus, FIELD_PX / 2 + 14, FIELD_PX / 2 - 18 - (o.reduced ? 4 : p * 12));
  }
  // la tos: nubes de vapor que suben
  if (s.crashed) {
    const since = Math.min(CRASH_HOLD_TICKS, s.tick - s.crashTick + o.alpha);
    const cloud = cloudSprite();
    for (let k = 0; k < 3; k++) {
      const p = o.reduced ? 0.5 : ((since / 20 + k * 0.33) % 1);
      blit(ctx, "rana:nube", cloud, FIELD_PX / 2 - 12 + k * 9 + (o.reduced ? 0 : Math.round(Math.sin(p * 6.28) * 2)), FIELD_PX / 2 - 24 - p * 16);
    }
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, k: number, s: SimState, o: DrawOptions): void {
  const c = offscreen();
  const octx = c.getContext("2d")!;
  paintScene(octx, s, o);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, FIELD_PX, FIELD_PX, 0, 0, px(FIELD_PX, k), px(FIELD_PX, k));
}
