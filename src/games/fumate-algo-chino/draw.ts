// Dibujo de la partida en un <canvas>, en escalado entero: la placita de
// barrio vista de costado, la mano con la gomera abajo a la izquierda, El
// chino a la distancia del tiro, la manga de viento, y el cigarro volando
// (girando, con su estela) interpolado entre ticks. La cámara encuadra a los
// dos (se aleja en los tiros lejanos) y sigue al cigarro si se sale.

import { integerScale, px } from "../lib/canvas-scale";
import { spriteCanvas } from "../lib/sprites";
import { textSprite } from "../lib/font";
import { cigaretteAt, fly, LAUNCH_X, LAUNCH_Y, MOUTH_RADIUS, MOUTH_Y, SUB, type ShotSetup, type SimState, type Vector } from "./rules";
import { chinoSprite, CHINO_H, CHINO_W, cigaretteSprite, FIELD_H, FIELD_W, HAND_H, HAND_W, handSprite, puffSprite, sockSprite, type Face } from "./sprites";

export interface DrawOptions {
  alpha: number;
  reduced?: boolean;
  /** el arrastre en curso (vector de lanzamiento ya limitado), para la banda y la trayectoria parcial */
  aim?: Vector | null;
  /** herramienta: toda la trayectoria al apuntar */
  fullPath?: boolean;
  /** herramienta: el radio de la boca y la menor distancia */
  debug?: boolean;
  /** herramienta: el vector del resolvedor */
  solver?: Vector | null;
}

export const GROUND_Y = 100;
/** tope de la cámara (unidades por dm): en los tiros cortos no se acerca más que esto */
const CAM_MAX = 2.4;
const SKY = "#1B2A4A";
const SKY_LOW = "#2C3E6B";
const GROUND = "#6B6F62";
const GROUND_DARK = "#4F5349";
const GRASS = "#4E7A3A";

export function scaleFor(cssWidth: number, cssHeight: number, dpr: number): number {
  return integerScale(cssWidth, cssHeight, dpr, FIELD_W, FIELD_H);
}

/** la cámara de un tiro: unidades por dm y el corrimiento, para encuadrar la mano y a El chino */
export interface Camera {
  /** unidades por decímetro */
  s: number;
  /** la x (dm) que queda en el borde izquierdo */
  left: number;
  /** cuánto baja la escena (unidades) para seguir al cigarro */
  dy: number;
}

export function cameraFor(shot: ShotSetup): Camera {
  // encuadra desde un poco antes de la mano hasta un poco después de El chino;
  // con el campo ancho, el tiro más largo (26 m) queda a casi 1 unidad por dm
  const left = -8;
  const right = shot.dist + 10;
  return { s: Math.min(CAM_MAX, FIELD_W / (right - left)), left, dy: 0 };
}

/** mundo (dm) → vista (unidades) */
export function toView(cam: Camera, xDm: number, yDm: number): [number, number] {
  return [(xDm - cam.left) * cam.s, GROUND_Y - yDm * cam.s + cam.dy];
}

let off: HTMLCanvasElement | null = null;
function offscreen(): HTMLCanvasElement {
  if (!off) {
    off = document.createElement("canvas");
    off.width = FIELD_W;
    off.height = FIELD_H;
  }
  return off;
}

export function faceFor(s: SimState): Face {
  const r = s.phase === "pause" || s.end ? s.results[s.results.length - 1] : null;
  if (!r) return "espera";
  return r.outcome === "adentro" ? "adentro" : r.outcome === "casi" ? "casi" : "quehaces";
}

function drawSpriteAt(ctx: CanvasRenderingContext2D, key: string, sprite: ReturnType<typeof handSprite>, x: number, y: number, scale = 1): void {
  const c = spriteCanvas(key, sprite, 1);
  const w = Math.max(1, Math.round(sprite.w * scale));
  const h = Math.max(1, Math.round(sprite.h * scale));
  ctx.drawImage(c, 0, 0, sprite.w, sprite.h, Math.round(x), Math.round(y), w, h);
}

export function paintScene(ctx: CanvasRenderingContext2D, s: SimState, cam: Camera, opts: DrawOptions): void {
  ctx.imageSmoothingEnabled = false;
  const shot = s.shots[s.current]!;
  // el cielo, de noche, con un degradé de dos tonos
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  ctx.fillStyle = SKY_LOW;
  ctx.fillRect(0, Math.round(GROUND_Y - 30 + cam.dy), FIELD_W, 30);
  // el fondo: edificios bajos y un árbol con hojas que se mueven con el viento
  const windDir = Math.sign(shot.wind);
  for (let i = 0; i < 12; i++) {
    const bx = 6 + i * 24;
    const bh = 14 + ((i * 7) % 9);
    ctx.fillStyle = i % 2 ? "#243352" : "#2A3A5E";
    ctx.fillRect(bx, Math.round(GROUND_Y - bh + cam.dy), 18, bh);
    ctx.fillStyle = "#FFD34E";
    ctx.fillRect(bx + 4, Math.round(GROUND_Y - bh + 4 + cam.dy), 2, 2);
    ctx.fillRect(bx + 11, Math.round(GROUND_Y - bh + 8 + cam.dy), 2, 2);
  }
  {
    const tx = 200;
    ctx.fillStyle = "#4A3524";
    ctx.fillRect(tx, Math.round(GROUND_Y - 14 + cam.dy), 2, 14);
    const sway = opts.reduced ? 0 : windDir * ((Math.floor(s.tick / 10) % 2) + Math.abs(shot.wind) / 8);
    ctx.fillStyle = GRASS;
    ctx.fillRect(Math.round(tx - 6 + sway), Math.round(GROUND_Y - 22 + cam.dy), 14, 9);
    ctx.fillStyle = "#6AA34C";
    ctx.fillRect(Math.round(tx - 3 + sway * 1.5), Math.round(GROUND_Y - 25 + cam.dy), 8, 4);
    if (!opts.reduced) {
      // hojas sueltas que van con el viento
      ctx.fillStyle = "#8EDC66";
      for (let i = 0; i < 3; i++) {
        const t = (s.tick * (1 + Math.abs(shot.wind) / 6) + i * 37) % 160;
        const lx = windDir > 0 ? (tx + t) % FIELD_W : (tx - t + FIELD_W) % FIELD_W;
        ctx.fillRect(Math.round(lx), Math.round(GROUND_Y - 18 - ((t / 9) % 7) + cam.dy), 1, 1);
      }
    }
  }
  // el piso: una vereda con baldosas
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, Math.round(GROUND_Y + cam.dy), FIELD_W, FIELD_H);
  ctx.fillStyle = GROUND_DARK;
  for (let x = 0; x < FIELD_W; x += 8) ctx.fillRect(x, Math.round(GROUND_Y + 3 + cam.dy), 1, 1);
  ctx.fillRect(0, Math.round(GROUND_Y + cam.dy), FIELD_W, 1);

  // la manga de viento, a un tercio del camino
  {
    const [wx, wy] = toView(cam, shot.dist * 0.4, 0);
    const fill = (Math.abs(shot.wind) <= 6 ? 1 : Math.abs(shot.wind) <= 12 ? 2 : 3) as 1 | 2 | 3;
    const sock = sockSprite(fill, windDir > 0);
    const sx = windDir > 0 ? wx - 1 : wx - sock.w + 3;
    drawSpriteAt(ctx, `chino:manga:${fill}:${windDir > 0}`, sock, sx, wy - sock.h);
    const label = spriteCanvas(`chino:viento:${Math.abs(shot.wind)}`, textSprite(String(Math.round(Math.abs(shot.wind) / 2)), "#F7FFF2"), 1);
    ctx.drawImage(label, 0, 0, label.width, label.height, Math.round(wx + (windDir > 0 ? sock.w + 1 : -sock.w - label.width + 1)), Math.round(wy - sock.h), label.width, label.height);
  }

  // El chino, con los pies en el piso a la distancia del tiro; la boca a MOUTH_Y
  {
    const face = faceFor(s);
    const sp = chinoSprite(face);
    const [cx, cy] = toView(cam, shot.dist, 0);
    // el sprite mide 32 unidades por 18 dm de alto: se escala con la cámara
    const scale = (18 * cam.s) / CHINO_H;
    drawSpriteAt(ctx, `chino:chino:${face}`, sp, cx - (CHINO_W * scale) / 2, cy - CHINO_H * scale, scale);
    if (face === "adentro" && !opts.reduced) {
      const p = puffSprite();
      const [mx, my] = toView(cam, shot.dist + 2, MOUTH_Y + 2);
      const t = s.tick - (s.results[s.results.length - 1]?.tick ?? s.tick);
      drawSpriteAt(ctx, "chino:humo", p, mx + t * 0.15, my - 6 - t * 0.2, Math.max(0.5, scale));
    }
    if (opts.debug) {
      const [mx, my] = toView(cam, shot.dist, MOUTH_Y);
      ctx.strokeStyle = "#6FD3E0";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mx, my, MOUTH_RADIUS * cam.s, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // la mano con la gomera
  {
    const [hx, hy] = toView(cam, LAUNCH_X, LAUNCH_Y);
    const hs = Math.max(1, (6 * cam.s) / HAND_H);
    drawSpriteAt(ctx, "chino:mano", handSprite(), hx - (HAND_W * hs) / 2, hy - 3 * hs, hs);
    // la banda estirada
    if (opts.aim) {
      const len = Math.sqrt(opts.aim.vx * opts.aim.vx + opts.aim.vy * opts.aim.vy);
      const ux = -opts.aim.vx / (len || 1);
      const uy = opts.aim.vy / (len || 1);
      const stretch = (4 + (len / 13000) * 18) * hs;
      ctx.strokeStyle = "#D9534F";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx - 5 * hs, hy - 3 * hs);
      ctx.lineTo(hx + ux * stretch, hy + uy * stretch);
      ctx.lineTo(hx + 5 * hs, hy - 3 * hs);
      ctx.stroke();
      // el cigarro en la banda
      drawSpriteAt(ctx, "chino:cig", cigaretteSprite(), hx + ux * stretch - 3, hy + uy * stretch - 1, 1);
    }
  }

  // la trayectoria prevista al apuntar: el primer 25 %, en puntitos (o entera, en la herramienta)
  if (opts.aim && s.phase === "aim") {
    const f = fly(shot, opts.aim);
    const n = opts.fullPath ? f.points.length : Math.max(2, Math.floor(f.points.length * 0.25));
    ctx.fillStyle = "#F7FFF2";
    for (let i = 1; i < n; i += 2) {
      const p = f.points[i]!;
      const [x, y] = toView(cam, p.x / SUB, p.y / SUB);
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  if (opts.solver && s.phase === "aim") {
    const f = fly(shot, opts.solver);
    ctx.fillStyle = "#6FD3E0";
    for (let i = 1; i < f.points.length; i += 2) {
      const p = f.points[i]!;
      const [x, y] = toView(cam, p.x / SUB, p.y / SUB);
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  // el cigarro volando: gira y deja una estela
  const c = cigaretteAt(s, opts.alpha);
  // si entró, el cigarro queda en la boca: no se dibuja tirado en el piso
  const swallowed = s.phase !== "flight" && s.flight?.result.outcome === "adentro";
  if (c && s.flight && !swallowed) {
    const f = s.flight.result.flight;
    if (!opts.reduced && s.phase === "flight") {
      ctx.fillStyle = "rgba(220, 220, 220, 0.55)";
      const i = Math.min(f.points.length - 1, s.tick - s.flight.startTick);
      for (let k = Math.max(1, i - 12); k < i; k += 2) {
        const p = f.points[k]!;
        const [x, y] = toView(cam, p.x / SUB, p.y / SUB);
        ctx.fillRect(Math.round(x), Math.round(y - 1), 1, 1);
      }
    }
    const [x, y] = toView(cam, c.x / SUB, c.y / SUB);
    const angle = s.phase === "flight" ? ((s.tick - s.flight.startTick + opts.alpha) * 0.5) % (Math.PI * 2) : 0;
    const cg = spriteCanvas("chino:cig", cigaretteSprite(), 1);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(angle);
    ctx.drawImage(cg, -3, -1);
    ctx.restore();
  }

  if (opts.debug) {
    const r = s.flight?.result;
    const t = textSprite(r ? `min ${(r.minDist / SUB).toFixed(1)}`.replace(".", " ") : "", "#F7FFF2");
    if (r) {
      const tc = spriteCanvas(`chino:dbg:${r.minDist}`, t, 1);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, FIELD_H - 8, tc.width + 2, 8);
      ctx.drawImage(tc, 1, FIELD_H - 7);
    }
  }
}

/** cuánto hay que bajar la escena para que el cigarro no se salga por arriba (unidades) */
export function followDy(s: SimState, cam: Camera, alpha: number): number {
  const c = cigaretteAt(s, alpha);
  if (!c || s.phase !== "flight") return 0;
  const [, y] = toView({ ...cam, dy: 0 }, c.x / SUB, c.y / SUB);
  return y < 8 ? 8 - y : 0;
}

export function drawScene(ctx: CanvasRenderingContext2D, s: SimState, cam: Camera, k: number, opts: DrawOptions): void {
  const o = offscreen();
  const octx = o.getContext("2d")!;
  paintScene(octx, s, cam, opts);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(o, 0, 0, FIELD_W, FIELD_H, 0, 0, px(FIELD_W, k), px(FIELD_H, k));
}
