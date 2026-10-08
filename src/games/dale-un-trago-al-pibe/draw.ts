// Dibujo de "Dale un trago al pibe" en un <canvas> chico escalado entero: la
// damajuana arriba (con el reloj de arena y los segundos), la grilla de
// baldosas con los caños de metal gris, el vino bordó avanzando de forma
// continua por dentro de cada caño, y el pibe abajo. Los caños se dibujan a
// mano (una pata por boca abierta y una unión en el centro) y se giran con la
// transformación del canvas cuando una ficha acaba de girar.

import { px } from "../lib/canvas-scale";
import { blit } from "../lib/hdp-kitchen";
import { textSprite } from "../lib/font";
import { bit, DIRS, DX, DY, openingsAt, timeLeft, type Dir, type Puzzle, type Run } from "./rules";
import { BOTTOM, COLORS, corkSprite, DAMAJUANA_H, DAMAJUANA_W, damajuanaSprite, dropSprite, RASTA_H, RASTA_W, rastaSprite, TILE, TOP, uncorkedSprite, type RastaPose } from "./sprites";

/** una ficha gira en pantalla durante esto después del toque */
export const SPIN_MS = 120;
/** la damajuana tiembla en los últimos… */
export const SHAKE_MS = 3_000;
/** el corcho vuela esto */
export const CORK_MS = 500;
/** el pibe traga esto antes de festejar */
export const GULP_MS = 450;

export interface DrawOptions {
  t: number;
  reduced?: boolean;
  /** herramienta: la solución (las bocas resueltas y los toques que faltan) */
  solution?: boolean;
  /** cuándo tocó cada ficha por última vez (para el giro animado) */
  spins?: ReadonlyMap<number, number>;
}

export function viewFor(p: Pick<Puzzle, "cols" | "rows">): { W: number; H: number } {
  return { W: p.cols * TILE, H: TOP + p.rows * TILE + BOTTOM };
}

let off: HTMLCanvasElement | null = null;
function offscreen(W: number, H: number): HTMLCanvasElement {
  off ??= document.createElement("canvas");
  if (off.width !== W || off.height !== H) {
    off.width = W;
    off.height = H;
  }
  return off;
}

/** dónde está la damajuana (arriba de la entrada) */
export function damajuanaAt(p: Pick<Puzzle, "cols" | "inCol">): { x: number; y: number } {
  const x = Math.max(0, Math.min(p.cols * TILE - DAMAJUANA_W, p.inCol * TILE + (TILE - DAMAJUANA_W) / 2));
  return { x, y: TOP - DAMAJUANA_H - 2 };
}
/** dónde está el pibe (abajo de la salida) */
export function rastaAt(p: Pick<Puzzle, "cols" | "rows" | "outCol">): { x: number; y: number } {
  const x = Math.max(0, Math.min(p.cols * TILE - RASTA_W, p.outCol * TILE + TILE / 2 - RASTA_W / 2));
  return { x, y: TOP + p.rows * TILE + 2 };
}

export type Hit = { kind: "cell"; cell: number } | { kind: "pour" } | null;
/** qué hay en un punto de la vista (unidades lógicas) */
export function hitTest(p: Puzzle, x: number, y: number): Hit {
  const d = damajuanaAt(p);
  if (y < TOP && x >= d.x - 4 && x < d.x + DAMAJUANA_W + 4) return { kind: "pour" };
  if (y >= TOP && y < TOP + p.rows * TILE && x >= 0 && x < p.cols * TILE) {
    const c = Math.floor(x / TILE);
    const r = Math.floor((y - TOP) / TILE);
    return { kind: "cell", cell: r * p.cols + c };
  }
  return null;
}

// ---------------------------------------------------------------------------
// los caños
// ---------------------------------------------------------------------------

/** la pata de cada boca: [x, y, w, h] del contorno y del interior, en coordenadas de la ficha */
const LEG_OUTER: Record<Dir, [number, number, number, number]> = { 0: [5, 0, 10, 10], 1: [10, 5, 10, 10], 2: [5, 10, 10, 10], 3: [0, 5, 10, 10] };
const LEG_INNER: Record<Dir, [number, number, number, number]> = { 0: [6, 0, 8, 10], 1: [10, 6, 10, 8], 2: [6, 10, 8, 10], 3: [0, 6, 10, 8] };

function rect(ctx: CanvasRenderingContext2D, c: string, r: readonly [number, number, number, number]): void {
  ctx.fillStyle = c;
  ctx.fillRect(r[0], r[1], r[2], r[3]);
}

export interface WineFill {
  /** por qué lado entró y qué fracción de la ficha recorrió (0 a 1) */
  from: Dir;
  frac: number;
}

/** dibuja una ficha en (0, 0): baldosa, caños según la máscara de bocas, y el vino adentro si hay */
export function paintTile(ctx: CanvasRenderingContext2D, mask: number, wine: WineFill | null): void {
  rect(ctx, COLORS.baldosa, [0, 0, TILE, TILE]);
  rect(ctx, COLORS.baldosaLinea, [0, 0, TILE, 1]);
  rect(ctx, COLORS.baldosaLinea, [0, 0, 1, TILE]);
  rect(ctx, COLORS.baldosaSombra, [0, TILE - 1, TILE, 1]);
  rect(ctx, COLORS.baldosaSombra, [TILE - 1, 0, 1, TILE]);
  const open = DIRS.filter((d) => mask & bit(d));
  for (const d of open) rect(ctx, COLORS.canoBorde, LEG_OUTER[d]);
  rect(ctx, COLORS.canoBorde, [5, 5, 10, 10]);
  for (const d of open) rect(ctx, COLORS.cano, LEG_INNER[d]);
  rect(ctx, COLORS.cano, [6, 6, 8, 8]);
  // brillo y sombra a lo largo de cada pata
  for (const d of open) {
    if (d === 0 || d === 2) {
      rect(ctx, COLORS.canoLuz, [7, d === 0 ? 0 : 10, 1, 10]);
      rect(ctx, COLORS.canoSombra, [13, d === 0 ? 0 : 10, 1, 10]);
    } else {
      rect(ctx, COLORS.canoLuz, [d === 3 ? 0 : 10, 7, 10, 1]);
      rect(ctx, COLORS.canoSombra, [d === 3 ? 0 : 10, 13, 10, 1]);
    }
  }
  if (!wine) return;
  // el vino: primero llena la pata de entrada hasta el centro, después las de salida desde el centro
  const inLen = Math.round(Math.min(1, wine.frac * 2) * 10);
  const outLen = Math.round(Math.max(0, wine.frac * 2 - 1) * 10);
  const fillLeg = (d: Dir, len: number, fromEdge: boolean): void => {
    if (len <= 0) return;
    let r: [number, number, number, number];
    if (d === 0) r = fromEdge ? [8, 0, 4, len] : [8, 10 - len, 4, len];
    else if (d === 2) r = fromEdge ? [8, 20 - len, 4, len] : [8, 10, 4, len];
    else if (d === 1) r = fromEdge ? [20 - len, 8, len, 4] : [10, 8, len, 4];
    else r = fromEdge ? [0, 8, len, 4] : [10 - len, 8, len, 4];
    rect(ctx, COLORS.vino, r);
    rect(ctx, COLORS.vinoLuz, d === 0 || d === 2 ? [r[0], r[1], 1, r[3]] : [r[0], r[1], r[2], 1]);
  };
  fillLeg(wine.from, inLen, true);
  if (wine.frac >= 0.5) {
    rect(ctx, COLORS.vino, [8, 8, 4, 4]);
    for (const d of open) if (d !== wine.from) fillLeg(d, outLen, false);
  }
}

// ---------------------------------------------------------------------------
// la escena
// ---------------------------------------------------------------------------

function paintHourglass(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number): void {
  // 9 × 13: dos cámaras de 4 filas; la de arriba se vacía con el tiempo
  rect(ctx, COLORS.canoBorde, [x, y, 9, 1]);
  rect(ctx, COLORS.canoBorde, [x, y + 12, 9, 1]);
  for (let i = 0; i < 5; i++) {
    const w = i === 4 ? 1 : 7 - i * 2;
    const xx = x + 1 + i;
    rect(ctx, COLORS.canoBorde, [xx - 1, y + 1 + i, 1, 1]);
    rect(ctx, COLORS.canoBorde, [xx + w, y + 1 + i, 1, 1]);
    rect(ctx, COLORS.vidrio, [xx, y + 1 + i, w, 1]);
    rect(ctx, COLORS.canoBorde, [xx - 1, y + 11 - i, 1, 1]);
    rect(ctx, COLORS.canoBorde, [xx + w, y + 11 - i, 1, 1]);
    rect(ctx, COLORS.vidrio, [xx, y + 11 - i, w, 1]);
  }
  rect(ctx, COLORS.canoBorde, [x + 4, y + 6, 1, 1]);
  const topRows = Math.round(frac * 4);
  for (let i = 0; i < topRows; i++) {
    const row = 4 - i; // de abajo hacia arriba de la cámara de arriba
    const w = 7 - (row - 1) * 2;
    rect(ctx, COLORS.arena, [x + 1 + (row - 1), y + row, w, 1]);
  }
  for (let i = 0; i < 4 - topRows; i++) {
    const row = 4 - i;
    const w = 7 - (row - 1) * 2;
    rect(ctx, COLORS.arena, [x + 1 + (row - 1), y + 12 - row, w, 1]);
  }
}

export function rastaPose(run: Run, t: number): RastaPose {
  if (run.phase === "spilled" || (run.phase === "over" && run.spill)) return "triste";
  if (run.phase === "drinking") return t - run.solvedT < GULP_MS ? "toma" : "salud";
  return "espera";
}

export function paintScene(ctx: CanvasRenderingContext2D, run: Run, o: DrawOptions): void {
  const p = run.puzzle;
  const { W, H } = viewFor(p);
  const t = o.t;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = COLORS.fondo;
  ctx.fillRect(0, 0, W, H);

  // la grilla
  for (let cell = 0; cell < p.cols * p.rows; cell++) {
    const x0 = (cell % p.cols) * TILE;
    const y0 = TOP + Math.floor(cell / p.cols) * TILE;
    const wet = run.wet.get(cell);
    const wine: WineFill | null = wet ? { from: wet.from, frac: Math.max(0, Math.min(1, (t - wet.at) / p.flowMs)) } : null;
    const spunAt = o.spins?.get(cell);
    const spin = !o.reduced && spunAt !== undefined && t - spunAt < SPIN_MS ? (1 - (t - spunAt) / SPIN_MS) * (-Math.PI / 2) : 0;
    ctx.save();
    ctx.translate(x0 + TILE / 2, y0 + TILE / 2);
    if (spin) ctx.rotate(spin);
    ctx.translate(-TILE / 2, -TILE / 2);
    paintTile(ctx, openingsAt(run, cell), wine);
    ctx.restore();
    if (o.solution) {
      const solved = p.solved[cell];
      if (solved !== null && solved !== undefined) {
        const mask = openingsAt({ ...run, rots: run.rots.map((r, i) => (i === cell ? solved : r)) } as Run, cell);
        ctx.fillStyle = COLORS.solucion;
        for (const d of DIRS) if (mask & bit(d)) ctx.fillRect(x0 + TILE / 2 - 1 + DX[d] * 8, y0 + TILE / 2 - 1 + DY[d] * 8, 2, 2);
        const kind = p.tiles[cell]!.kind;
        const period = kind === "recta" ? 2 : 4;
        const turns = (((solved - run.rots[cell]!) % period) + period) % period;
        if (turns > 0) blit(ctx, `trago:n${turns}`, textSprite(String(turns), COLORS.solucion), x0 + 1, y0 + 1);
      }
    }
  }

  // la entrada y la salida: una boca en el borde
  rect(ctx, COLORS.canoBorde, [p.inCol * TILE + 5, TOP - 3, 10, 3]);
  rect(ctx, COLORS.cano, [p.inCol * TILE + 6, TOP - 3, 8, 3]);
  rect(ctx, COLORS.canoBorde, [p.outCol * TILE + 5, TOP + p.rows * TILE, 10, 3]);
  rect(ctx, COLORS.cano, [p.outCol * TILE + 6, TOP + p.rows * TILE, 8, 3]);

  // la damajuana, con el reloj de arena y los segundos
  const d = damajuanaAt(p);
  const left = timeLeft(run);
  const pouring = run.phase !== "solving";
  let shake = 0;
  if (!o.reduced && run.phase === "solving" && left <= SHAKE_MS && left > 0) shake = Math.floor(t / 70) % 2 ? 1 : -1;
  if (pouring) {
    // se da vuelta sobre su centro (la boca queda abajo, sobre la entrada) y se descorcha
    const flip = o.reduced ? Math.PI : Math.min(Math.PI, ((t - run.pourT) / 300) * Math.PI);
    ctx.save();
    ctx.translate(d.x + DAMAJUANA_W / 2, d.y + DAMAJUANA_H / 2);
    ctx.rotate(flip);
    blit(ctx, "trago:damajuana-abierta", uncorkedSprite(), -DAMAJUANA_W / 2, -DAMAJUANA_H / 2);
    ctx.restore();
    // el corcho vuela
    const cp = Math.min(1, (t - run.pourT) / CORK_MS);
    if (!o.reduced && cp < 1) blit(ctx, "trago:corcho", corkSprite(), d.x + 8 + cp * 14, d.y - 2 - Math.sin(cp * Math.PI) * 10 + cp * 6);
    // el chorro de la boca a la entrada
    if ((run.phase === "flowing" || run.phase === "drinking") && flip >= Math.PI) {
      rect(ctx, COLORS.vino, [p.inCol * TILE + 8, d.y + DAMAJUANA_H - 3, 4, TOP - d.y - DAMAJUANA_H + 3]);
      rect(ctx, COLORS.vinoLuz, [p.inCol * TILE + 8, d.y + DAMAJUANA_H - 3, 1, TOP - d.y - DAMAJUANA_H + 3]);
    }
  } else {
    blit(ctx, "trago:damajuana", damajuanaSprite(), d.x + shake, d.y);
  }
  const hx = d.x + DAMAJUANA_W + 4 + 9 + 14 <= W ? d.x + DAMAJUANA_W + 4 : d.x - 4 - 9 - 14;
  const frac = run.phase === "solving" ? left / p.timeMs : 0;
  paintHourglass(ctx, hx, 10, frac);
  const secs = textSprite(String(Math.ceil(left / 1000)), left <= SHAKE_MS && run.phase === "solving" ? "#FF6F91" : "#F2E8D0");
  blit(ctx, `trago:secs:${Math.ceil(left / 1000)}:${left <= SHAKE_MS ? 1 : 0}`, secs, hx + 11, 14);

  // el derrame: chorros desde la boca que falló
  if (run.spill) {
    const sx = (run.spill.cell % p.cols) * TILE + TILE / 2 + DX[run.spill.side] * 10;
    const sy = TOP + Math.floor(run.spill.cell / p.cols) * TILE + TILE / 2 + DY[run.spill.side] * 10;
    const since = t - run.spill.at;
    const drop = dropSprite();
    if (o.reduced) {
      rect(ctx, COLORS.vino, [sx - 5, sy - 2, 10, 5]);
    } else {
      for (let i = 0; i < 6; i++) {
        const dt = (since + i * 110) % 660;
        const q = dt / 660;
        const spread = ((i % 3) - 1) * 6;
        const x = sx + DX[run.spill.side] * q * 14 + spread * q + (DY[run.spill.side] ? 0 : 0);
        const y = sy + DY[run.spill.side] * q * 8 + (DX[run.spill.side] ? spread * q : 0) + q * q * 16;
        blit(ctx, "trago:gota", drop, Math.round(x) - 1, Math.round(y) - 2);
      }
    }
  }

  // el pibe
  const r = rastaAt(p);
  const pose = rastaPose(run, t);
  blit(ctx, `trago:pibe:${pose}`, rastaSprite(pose), r.x, r.y);
  if (pose === "triste" && !o.reduced) {
    const drop = dropSprite();
    for (let i = 0; i < 3; i++) {
      const q = ((t - (run.spill?.at ?? t)) / 500 + i / 3) % 1;
      blit(ctx, "trago:gota", drop, r.x + 4 + i * 9, r.y + 6 + q * (RASTA_H - 8));
    }
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, k: number, run: Run, o: DrawOptions): void {
  const { W, H } = viewFor(run.puzzle);
  const c = offscreen(W, H);
  const octx = c.getContext("2d")!;
  paintScene(octx, run, o);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, W, H, 0, 0, px(W, k), px(H, k));
}
