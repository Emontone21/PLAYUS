// Dibujo de "la bolsita del jota" en un <canvas> chico (144 × 160) escalado
// entero: una esquina de noche con un farol, el jota detrás de la mesita (de
// games/lib/jota) con sus manos sobre los vasos, los tres vasos rojos en fila,
// la bolsita (la tussi) y tu pila abajo a la izquierda. Cada movimiento de la
// mezcla se dibuja con su progreso: el intercambio en arco (uno por arriba y
// otro por abajo), el amague hasta la mitad y de vuelta, la ráfaga, el salto
// alto, la rotación de los tres y el cambio de bolsita a la vista.

import { px } from "../lib/canvas-scale";
import { blit } from "../lib/hdp-kitchen";
import { jotaHandSprite, jotaSprite, JOTA_H, JOTA_W, tussiSprite } from "../lib/jota";
import { OUTLINE } from "../lib/sprites";
import { textSprite } from "../lib/font";
import { applyMove, currentShuffle, jotaSays, moveAt, PASS_LIFT_MS, REVEAL_MS, SHOW_MS, type Move, type Pos, type Run } from "./rules";
import { cupSprite, CUP_H, CUP_W, FIELD_H, FIELD_W, JOTA, PILE, SLOT_X, TABLE_Y } from "./sprites";

export interface DrawOptions {
  t: number;
  reduced?: boolean;
  /** herramienta: la bolsita a través de los vasos */
  xray?: boolean;
}

/** cuánto se levanta un vaso para mostrar lo que hay abajo */
const LIFT = 16;

let off: HTMLCanvasElement | null = null;
function offscreen(): HTMLCanvasElement {
  if (!off) {
    off = document.createElement("canvas");
    off.width = FIELD_W;
    off.height = FIELD_H;
  }
  return off;
}

const ease = (q: number) => (q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2);
const lerp = (a: number, b: number, q: number) => a + (b - a) * q;

/** un vaso en la escena: dónde está (x del centro), cuánto sube (dy) y si va adelante */
export interface CupDraw {
  x: number;
  dy: number;
  front: boolean;
}

/** dónde está cada vaso (por el lugar donde empezó el movimiento) en el progreso `q` de un movimiento */
export function cupsDuring(m: Move, q: number): CupDraw[] {
  const out: CupDraw[] = SLOT_X.map((x) => ({ x, dy: 0, front: false }));
  const swapAnim = (pos: number[], a: Pos, b: Pos, qq: number) => {
    // pos[c] = el lugar actual del vaso c
    const ca = pos.indexOf(a);
    const cb = pos.indexOf(b);
    const e = ease(qq);
    out[ca] = { x: lerp(SLOT_X[a], SLOT_X[b], e), dy: -14 * Math.sin(Math.PI * qq), front: false };
    out[cb] = { x: lerp(SLOT_X[b], SLOT_X[a], e), dy: 5 * Math.sin(Math.PI * qq), front: true };
  };
  if (m.kind === "swap") swapAnim([0, 1, 2], m.a, m.b, q);
  else if (m.kind === "fake") swapAnim([0, 1, 2], m.a, m.b, q < 0.5 ? q : 1 - q);
  else if (m.kind === "burst") {
    const k = m.swaps.length;
    const j = Math.min(k - 1, Math.floor(q * k));
    const pos = [0, 1, 2];
    for (let s = 0; s < j; s++) {
      const [a, b] = m.swaps[s]!;
      const ia = pos.indexOf(a);
      const ib = pos.indexOf(b);
      pos[ia] = b;
      pos[ib] = a;
    }
    pos.forEach((p, c) => (out[c] = { x: SLOT_X[p as Pos], dy: 0, front: false }));
    const [a, b] = m.swaps[j]!;
    swapAnim(pos, a, b, q * k - j);
  } else if (m.kind === "jump") {
    const e = ease(q);
    const to = m.from === 0 ? 2 : 0;
    for (let c = 0; c < 3; c++) {
      if (c === m.from) out[c] = { x: lerp(SLOT_X[c], SLOT_X[to], e), dy: -30 * Math.sin(Math.PI * q), front: true };
      else out[c] = { x: lerp(SLOT_X[c as Pos], SLOT_X[(m.from === 0 ? c - 1 : c + 1) as Pos], e), dy: 0, front: false };
    }
  } else if (m.kind === "rotate") {
    const e = ease(q);
    for (let c = 0; c < 3; c++) {
      const to = ((c + m.dir + 3) % 3) as Pos;
      const wraps = Math.abs(to - c) === 2;
      out[c] = { x: lerp(SLOT_X[c as Pos], SLOT_X[to], e), dy: wraps ? -18 * Math.sin(Math.PI * q) : 0, front: !wraps };
    }
  } else if (m.kind === "pass") {
    // se levanta el vaso de la bolsita; viaja la bolsita mientras se levanta el otro; se bajan los dos
    const total = m.ms + 2 * PASS_LIFT_MS;
    const ms = q * total;
    const liftFrom = ms < PASS_LIFT_MS ? ms / PASS_LIFT_MS : ms < PASS_LIFT_MS + m.ms ? 1 : 1 - (ms - PASS_LIFT_MS - m.ms) / PASS_LIFT_MS;
    const travel = Math.max(0, Math.min(1, (ms - PASS_LIFT_MS) / m.ms));
    const liftTo = ms < PASS_LIFT_MS ? 0 : ms < PASS_LIFT_MS + m.ms ? Math.min(1, travel / 0.3) : liftFrom;
    out[m.from] = { x: SLOT_X[m.from], dy: -LIFT * liftFrom, front: false };
    out[m.to] = { x: SLOT_X[m.to], dy: -LIFT * liftTo, front: false };
  }
  return out;
}

/** dónde está la bolsita durante un cambio de bolsita (x en la mesa) */
function passBagX(m: Extract<Move, { kind: "pass" }>, q: number): number {
  const ms = q * (m.ms + 2 * PASS_LIFT_MS);
  const travel = Math.max(0, Math.min(1, (ms - PASS_LIFT_MS) / m.ms));
  return lerp(SLOT_X[m.from], SLOT_X[m.to], ease(travel));
}

function paintBackground(ctx: CanvasRenderingContext2D): void {
  // la noche, la pared de la esquina y la vereda
  ctx.fillStyle = "#0B1020";
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.fillStyle = "#1C1F2E";
  ctx.fillRect(96, 0, FIELD_W - 96, 120);
  ctx.fillStyle = "#262A3C";
  for (let y = 4; y < 120; y += 8) for (let x = 96 + ((y / 8) % 2 ? 6 : 0); x < FIELD_W; x += 12) ctx.fillRect(x, y, 10, 1);
  ctx.fillStyle = "#2A2D3A";
  ctx.fillRect(0, 120, FIELD_W, FIELD_H - 120);
  ctx.fillStyle = "#3C4050";
  ctx.fillRect(0, 120, FIELD_W, 1);
  // el farol, con su luz
  ctx.fillStyle = "rgba(255, 211, 78, 0.10)";
  ctx.beginPath();
  ctx.moveTo(14, 14);
  ctx.lineTo(62, 120);
  ctx.lineTo(-20, 120);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#3A3D47";
  ctx.fillRect(12, 12, 3, 108);
  ctx.fillRect(10, 118, 7, 2);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(8, 6, 11, 7);
  ctx.fillStyle = "#FFD34E";
  ctx.fillRect(9, 8, 9, 4);
  ctx.fillStyle = "#FFF3C0";
  ctx.fillRect(11, 9, 5, 2);
}

function paintTable(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(10, TABLE_Y - 1, FIELD_W - 20, 22);
  ctx.fillStyle = "#9A6A3E";
  ctx.fillRect(11, TABLE_Y, FIELD_W - 22, 4);
  ctx.fillStyle = "#7A4E2D";
  ctx.fillRect(11, TABLE_Y + 4, FIELD_W - 22, 16);
  ctx.fillStyle = "#5E3A20";
  for (let x = 24; x < FIELD_W - 20; x += 22) ctx.fillRect(x, TABLE_Y + 5, 1, 14);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(16, TABLE_Y + 21, 4, 18);
  ctx.fillRect(FIELD_W - 20, TABLE_Y + 21, 4, 18);
}

/** la bolsita en la mesa, centrada en x */
function paintBag(ctx: CanvasRenderingContext2D, x: number, alpha = 1): void {
  const s = tussiSprite();
  ctx.save();
  ctx.globalAlpha = alpha;
  blit(ctx, "bolsita:bag", s, x - s.w / 2, TABLE_Y - s.h + 1);
  ctx.restore();
}

function paintCup(ctx: CanvasRenderingContext2D, c: CupDraw): void {
  // la sombra en la mesa
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(Math.round(c.x - CUP_W / 2 + 2), TABLE_Y, CUP_W - 4, 2);
  blit(ctx, "bolsita:cup", cupSprite(), c.x - CUP_W / 2, TABLE_Y - CUP_H + c.dy);
}

export function paintScene(ctx: CanvasRenderingContext2D, run: Run, o: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  const { t } = o;
  paintBackground(ctx);
  // el jota detrás de la mesa
  const says = jotaSays(run, t);
  blit(ctx, `bolsita:jota:${says.face}`, jotaSprite(says.face), JOTA.x, JOTA.y, JOTA_W * JOTA.zoom, JOTA_H * JOTA.zoom);
  paintTable(ctx);

  const s = currentShuffle(run);
  let cups: CupDraw[] = SLOT_X.map((x) => ({ x, dy: 0, front: false }));
  let bagX: number | null = null;
  let bagVisible = false;
  const hands: [number, number][] = [];
  const dt = t - run.phaseAt;
  if (run.phase === "show") {
    // los tres se levantan, se ve la bolsita y se bajan
    const lift = dt < 250 ? dt / 250 : dt < SHOW_MS - 250 ? 1 : Math.max(0, (SHOW_MS - dt) / 250);
    cups = cups.map((c) => ({ ...c, dy: -LIFT * lift }));
    bagX = SLOT_X[s.start];
    bagVisible = true;
    hands.push([SLOT_X[s.start], TABLE_Y - CUP_H - LIFT * lift]);
  } else if (run.phase === "shuffle") {
    const cur = moveAt(run, t);
    let bag = s.start;
    const upTo = cur ? cur.i : s.moves.length;
    for (let i = 0; i < upTo; i++) bag = applyMove(bag, s.moves[i]!);
    if (cur) {
      cups = cupsDuring(cur.m, cur.q);
      if (cur.m.kind === "pass") {
        bagX = passBagX(cur.m, cur.q);
        bagVisible = true;
        hands.push([SLOT_X[cur.m.from], TABLE_Y - CUP_H + cups[cur.m.from]!.dy], [bagX, TABLE_Y - 8]);
      } else {
        bagX = cups[bag]!.x;
        // las manos sobre los vasos que se mueven
        const moving = cups.map((c, i) => ({ c, i })).filter(({ c, i }) => Math.abs(c.x - SLOT_X[i as Pos]) > 0.5 || c.dy !== 0);
        for (const { c } of moving.slice(0, 2)) hands.push([c.x, TABLE_Y - CUP_H + c.dy]);
      }
    } else {
      bagX = SLOT_X[bag];
    }
  } else if (run.phase === "pick") {
    bagX = SLOT_X[s.moves.reduce<Pos>((p, m) => applyMove(p, m), s.start)];
  } else if (run.phase === "reveal" || run.phase === "over") {
    const lift = Math.min(1, dt / 180);
    if (run.picked >= 0) cups[run.picked as Pos] = { ...cups[run.picked as Pos]!, dy: -LIFT * lift };
    if (run.phase === "over" && run.answer >= 0 && run.answer !== run.picked) {
      // enseguida se levanta el que la tenía
      const l2 = Math.max(0, Math.min(1, (dt - 300) / 180));
      cups[run.answer as Pos] = { ...cups[run.answer as Pos]!, dy: -LIFT * l2 };
    }
    if (run.answer >= 0) {
      const bx = SLOT_X[run.answer as Pos];
      bagX = bx;
      bagVisible = true;
      if (run.phase === "reveal") {
        // tomá, bro: la bolsita se desliza a tu pila
        const p = Math.max(0, (dt - 250) / (REVEAL_MS - 250));
        if (o.reduced ? dt > 250 : p >= 1) bagVisible = false;
        else if (!o.reduced && p > 0) {
          const s2 = tussiSprite();
          blit(ctx, "bolsita:bag", s2, lerp(bx, PILE.x + s2.w / 2, ease(p)) - s2.w / 2, lerp(TABLE_Y - s2.h, PILE.y - s2.h, ease(p)));
          bagVisible = false;
        }
      }
    }
  }
  // la bolsita va abajo de los vasos (se ve si uno se levanta), salvo con la herramienta
  if (bagX !== null && (bagVisible || run.phase === "shuffle" || run.phase === "pick")) paintBag(ctx, bagX);
  const order = cups.map((c, i) => ({ c, i })).sort((a, b) => Number(a.c.front) - Number(b.c.front));
  for (const { c } of order) paintCup(ctx, c);
  if (o.xray && bagX !== null && run.phase !== "show") paintBag(ctx, bagX, 0.65);
  // las manos del jota (si no mezcla, apoyadas a los costados)
  if (hands.length === 0) hands.push([JOTA.x - 6, TABLE_Y - 4], [JOTA.x + JOTA_W * JOTA.zoom + 6, TABLE_Y - 4]);
  const h = jotaHandSprite();
  for (const [hx, hy] of hands) blit(ctx, "bolsita:mano", h, hx - h.w, hy - h.h * 2 + 2, h.w * 2, h.h * 2);
  // tu pila
  const pile = Math.min(run.score - (run.phase === "reveal" && (o.reduced ? dt <= 250 : dt < REVEAL_MS) ? 1 : 0), 12);
  const ts = tussiSprite();
  for (let i = 0; i < Math.max(0, pile); i++) blit(ctx, "bolsita:bag", ts, PILE.x, PILE.y - ts.h - i * 3);
  // el número al lado de la pila
  const shown = Math.max(0, run.score - (run.phase === "reveal" && (o.reduced ? dt <= 250 : dt < REVEAL_MS) ? 1 : 0));
  if (shown > 0) {
    const n = textSprite(`${shown}`, "#F7FFF2");
    blit(ctx, `bolsita:n:${shown}`, n, PILE.x + ts.w + 3, PILE.y - n.h * 2, n.w * 2, n.h * 2);
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, k: number, run: Run, o: DrawOptions): void {
  const c = offscreen();
  const octx = c.getContext("2d")!;
  paintScene(octx, run, o);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, FIELD_W, FIELD_H, 0, 0, px(FIELD_W, k), px(FIELD_H, k));
}
