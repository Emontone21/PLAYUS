// Dibujo de "Barakatututu" en un <canvas> chico (120 × 180) escalado entero:
// la calle de Barrio Sur de noche (fachadas de conventillo de colores,
// banderas de comparsa, guirnaldas), la regla del compás con sus pulsos, el
// cursor y las marcas, El negro toto con su tambor, y el tambor grande en
// primer plano con la lonja que destella con cada golpe (los suyos en
// amarillo, más fuerte en los tiempos; los tuyos en agua). Sin sonido: el
// pulso se ve acá.

import { px } from "../lib/canvas-scale";
import { blit } from "../lib/hdp-kitchen";
import { textSprite } from "../lib/font";
import { barMs, beatMs, expectedAt, phaseMs, stepMs, STEPS, WINDOW_MS, type Run } from "./rules";
import { bulbSprite, COLORS, COMPARSA, flagSprite, GARLAND_COLORS, totoDrumSprite, totoSprite, TOTO_H, TOTO_W, type TotoFace } from "./sprites";

export const W = 120;
export const H = 180;
/** la regla: de x 6 a x 114, en y 66 */
export const RULER_X = 6;
export const RULER_W = 108;
export const RULER_Y = 66;
/** el tambor grande: el centro y el radio de la lonja */
export const DRUM_CX = 78;
export const DRUM_CY = 140;
export const DRUM_R = 26;
/** un golpe destella esto */
export const FLASH_MS = 220;
/** un anillo se expande esto */
export const RING_MS = 420;

export interface Flash {
  t: number;
  /** de El negro toto (fuerte o no) o tuyo */
  who: "toto" | "toto-fuerte" | "vos";
}

export interface DrawOptions {
  t: number;
  reduced?: boolean;
  /** los destellos recientes (el cliente los va juntando) */
  flashes?: readonly Flash[];
  /** herramienta: las ventanas de cada golpe en la regla */
  windows?: boolean;
}

let off: HTMLCanvasElement | null = null;
function offscreen(): HTMLCanvasElement {
  if (!off) {
    off = document.createElement("canvas");
    off.width = W;
    off.height = H;
  }
  return off;
}

function rect(ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

const FACADES = [
  { x: 0, w: 26, h: 44, c: "#C25B4A", d: "#9E4538" },
  { x: 26, w: 30, h: 50, c: "#E0A93A", d: "#B6862A" },
  { x: 56, w: 24, h: 40, c: "#4A8FD6", d: "#3869A6" },
  { x: 80, w: 22, h: 48, c: "#5FA874", d: "#468158" },
  { x: 102, w: 18, h: 42, c: "#B06AC4", d: "#8A4E9C" },
];

function paintStreet(ctx: CanvasRenderingContext2D, t: number, reduced: boolean): void {
  rect(ctx, COLORS.noche, 0, 0, W, H);
  // las fachadas de conventillo
  for (const f of FACADES) {
    const y0 = 60 - f.h;
    rect(ctx, f.c, f.x, y0, f.w, f.h);
    rect(ctx, f.d, f.x, y0, f.w, 2);
    rect(ctx, f.d, f.x + f.w - 1, y0, 1, f.h);
    for (let wy = y0 + 8; wy < 54; wy += 12) {
      for (let wx = f.x + 4; wx + 5 < f.x + f.w; wx += 9) {
        rect(ctx, "#1B1B1F", wx, wy, 5, 7);
        rect(ctx, "#F2C94C", wx + 1, wy + 1, 3, 3);
      }
    }
    rect(ctx, "#1B1B1F", f.x + Math.floor(f.w / 2) - 3, 50, 6, 10);
  }
  // las banderas de la comparsa, al fondo
  const flags: [string, string][] = [
    [COMPARSA.a, COMPARSA.b],
    [COMPARSA.c, COMPARSA.d],
    [COMPARSA.b, COMPARSA.a],
    [COMPARSA.d, COMPARSA.c],
  ];
  flags.forEach(([a, b], i) => blit(ctx, `baraka:bandera:${i}`, flagSprite(a, b), 10 + i * 30, 2));
  // las guirnaldas: dos hilos con lamparitas que cambian de color (quietas con reducir movimiento)
  for (const [y0, phase] of [
    [20, 0],
    [34, 2],
  ] as const) {
    rect(ctx, "#3C3C46", 0, y0 + 3, W, 1);
    for (let i = 0; i < 12; i++) {
      const x = 3 + i * 10;
      const y = y0 + (i % 2 === 0 ? 1 : 3);
      const shift = reduced ? 0 : Math.floor(t / 450);
      const c = GARLAND_COLORS[(i + phase + shift) % GARLAND_COLORS.length]!;
      blit(ctx, `baraka:luz:${c}`, bulbSprite(c), x, y);
    }
  }
  // la calle
  rect(ctx, COLORS.calle, 0, 60, W, H - 60);
  rect(ctx, COLORS.calleLinea, 0, 60, W, 1);
  for (let y = 100; y < H; y += 14) rect(ctx, COLORS.calleLinea, 0, y, W, 1);
}

/** la posición del cursor sobre la regla (0 a 1), según el tramo */
export function cursorPos(run: Run, t: number): number | null {
  const bar = barMs(run.round.bpm);
  const span = run.round.bars * bar;
  if (run.phase === "listen" || run.phase === "turn") return Math.max(0, Math.min(1, (t - run.phaseStart) / span));
  if (run.phase === "count" || run.phase === "calibration") return Math.max(0, Math.min(1, ((t - run.phaseStart) % bar) / span));
  return null;
}

function paintRuler(ctx: CanvasRenderingContext2D, run: Run, o: DrawOptions): void {
  const t = o.t;
  const bars = run.round.bars;
  rect(ctx, COLORS.regla, RULER_X, RULER_Y - 4, RULER_W, 9);
  rect(ctx, COLORS.reglaLinea, RULER_X, RULER_Y, RULER_W, 1);
  const xOf = (q: number) => RULER_X + Math.round(q * (RULER_W - 1));
  const pos = cursorPos(run, t);
  const bar = barMs(run.round.bpm);
  const span = bars * bar;
  // los 4 puntos de pulso por compás: se encienden cuando el cursor pasa
  for (let b = 0; b < bars; b++) {
    for (let k = 0; k < 4; k++) {
      const q = (b * 4 + k) / (bars * 4);
      const lit = pos !== null && pos >= q && pos < q + beatMs(run.round.bpm) / span;
      rect(ctx, lit ? COLORS.pulsoOn : COLORS.pulso, xOf(q) - 1, RULER_Y - 1, 3, 3);
      if (k === 0) rect(ctx, COLORS.reglaLinea, xOf(q), RULER_Y - 4, 1, 9);
    }
  }
  // mientras El negro toto toca, los golpes del patrón como marcas; en tu turno, las ventanas (herramienta) y tus marcas
  if (run.phase === "listen") {
    for (const h of run.round.hits) {
      const q = h / (bars * STEPS);
      const strong = h % 4 === 0;
      rect(ctx, COLORS.marcaToto, xOf(q), RULER_Y - (strong ? 4 : 3), 1, strong ? 9 : 7);
    }
  } else if (run.phase === "turn" || run.phase === "result" || run.phase === "failed") {
    if (o.windows && run.phase === "turn") {
      ctx.fillStyle = "rgba(111, 211, 224, 0.25)";
      run.round.hits.forEach((_, i) => {
        const from = (expectedAt(run, i) - WINDOW_MS - run.turnStart) / span;
        const to = (expectedAt(run, i) + WINDOW_MS - run.turnStart) / span;
        ctx.fillRect(xOf(Math.max(0, from)), RULER_Y - 4, Math.max(1, xOf(Math.min(1, to)) - xOf(Math.max(0, from))), 9);
      });
    }
    for (const m of run.marks) {
      const q = Math.max(0, Math.min(1, (m.t - run.turnStart) / span));
      const c = m.judgement === "justo" ? COLORS.justo : m.judgement === "casi" ? COLORS.casi : COLORS.error;
      rect(ctx, c, xOf(q), RULER_Y - 4, 1, 9);
    }
  }
  // el cursor
  if (pos !== null) rect(ctx, COLORS.cursor, xOf(pos), RULER_Y - 6, 1, 13);
}

export function faceFor(run: Run): TotoFace {
  if (run.phase === "failed" || (run.phase === "over" && run.fail)) return "enojado";
  if (run.phase === "result") return "eso";
  return "contento";
}

/** los golpes de El negro toto que ya sonaron en el tramo en curso (para los destellos del cliente) */
export function totoHitsUntil(run: Run, t: number): { t: number; strong: boolean }[] {
  if (run.phase !== "listen") return [];
  const step = stepMs(run.round.bpm);
  return run.round.hits.map((h) => ({ t: run.phaseStart + h * step, strong: h % 4 === 0 })).filter((h) => h.t <= t);
}

function paintDrum(ctx: CanvasRenderingContext2D, o: DrawOptions): void {
  const t = o.t;
  // el casco (de costado, debajo de la lonja) y el aro
  rect(ctx, COLORS.casco, DRUM_CX - DRUM_R - 2, DRUM_CY, DRUM_R * 2 + 4, 30);
  for (let x = DRUM_CX - DRUM_R + 2; x < DRUM_CX + DRUM_R; x += 6) rect(ctx, COLORS.cascoLinea, x, DRUM_CY + 2, 2, 28);
  // la lonja: el color según el último destello
  let lonja: string = COLORS.lonja;
  let ring: Flash | null = null;
  for (const f of o.flashes ?? []) {
    if (t - f.t <= FLASH_MS) lonja = f.who === "vos" ? COLORS.lonjaVos : f.who === "toto-fuerte" ? COLORS.lonjaFuerte : COLORS.lonjaToto;
    if (t - f.t <= RING_MS && (!ring || f.t > ring.t)) ring = f;
  }
  ctx.fillStyle = COLORS.aro;
  ctx.beginPath();
  ctx.ellipse(DRUM_CX, DRUM_CY, DRUM_R + 3, Math.round((DRUM_R + 3) * 0.62), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lonja;
  ctx.beginPath();
  ctx.ellipse(DRUM_CX, DRUM_CY, DRUM_R, Math.round(DRUM_R * 0.62), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.lonjaLuz;
  ctx.fillRect(DRUM_CX - 8, DRUM_CY - 9, 10, 2);
  // el anillo que se expande (con reducir movimiento, no)
  if (ring && !o.reduced) {
    const q = (t - ring.t) / RING_MS;
    ctx.strokeStyle = ring.who === "vos" ? COLORS.lonjaVos : COLORS.lonjaFuerte;
    ctx.globalAlpha = 1 - q;
    ctx.lineWidth = ring.who === "toto-fuerte" ? 2 : 1;
    ctx.beginPath();
    ctx.ellipse(DRUM_CX, DRUM_CY, 4 + q * (DRUM_R - 4), Math.round((4 + q * (DRUM_R - 4)) * 0.62), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export function paintScene(ctx: CanvasRenderingContext2D, run: Run, o: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  paintStreet(ctx, o.t, !!o.reduced);
  paintRuler(ctx, run, o);
  // El negro toto con su tambor, a la izquierda
  const face = faceFor(run);
  blit(ctx, `baraka:toto:${face}`, totoSprite(face), 6, 84);
  blit(ctx, "baraka:toto-tambor", totoDrumSprite(), 26, 108);
  paintDrum(ctx, o);
  // el tempo, chiquito, arriba de la regla
  const label = textSprite(`${run.round.bpm} bpm`, COLORS.pulso);
  blit(ctx, `baraka:bpm:${run.round.bpm}`, label, W - label.w - 6, RULER_Y + 8);
  void TOTO_W;
  void TOTO_H;
  void phaseMs;
}

export function drawScene(ctx: CanvasRenderingContext2D, k: number, run: Run, o: DrawOptions): void {
  const c = offscreen();
  const octx = c.getContext("2d")!;
  paintScene(octx, run, o);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, W, H, 0, 0, px(W, k), px(H, k));
}
