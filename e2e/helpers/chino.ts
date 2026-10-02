import { expect, type Page } from "@playwright/test";
import { clampVector, generateShots, solveShot, V_MAX, type Vector } from "../../src/games/fumate-algo-chino/rules";
import { MAX_DRAG_PX } from "../../src/games/fumate-algo-chino/index";

// Juega "fumate algo chino" desde el navegador: calcula en el test los tres
// vectores (el del resolvedor para embocar, y dos con error) y hace cada
// tiro con un arrastre del mouse opuesto al vector, esperando a que el juego
// esté apuntando. Devuelve lo que mandó a /finish.

export interface Snap {
  tick: number;
  shot: number;
  phase: string;
  best: number;
  end: boolean;
}

export function snapOf(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="chino-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { tick: Number(d.tick ?? -1), shot: Number(d.shot ?? 0), phase: d.phase ?? "", best: Number(d.best ?? 0), end: d.end === "1" };
  });
}

/** los tres vectores: el primero y el tercero con error, el segundo el del resolvedor */
export function vectorsFor(seed: string): Vector[] {
  const shots = generateShots(seed);
  return shots.map((shot, i) => {
    const sol = solveShot(shot).v;
    const f = i === 1 ? 1 : i === 0 ? 1.08 : 0.9;
    return clampVector(sol.vx * f, sol.vy * f);
  });
}

/** el arrastre en px en el sistema que ve el jugador (opuesto al vector; y crece hacia abajo) */
export function dragFor(v: Vector): { dx: number; dy: number } {
  const len = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
  const pxLen = (len / V_MAX) * MAX_DRAG_PX;
  return { dx: (-v.vx / len) * pxLen, dy: (v.vy / len) * pxLen };
}

/** el área está rotada 90° (viewport vertical: el contenedor gira el juego) */
export async function isRotated(page: Page): Promise<boolean> {
  return (await page.getByTestId("game-playing").getAttribute("data-rotated")) === "1";
}

/** un desplazamiento del jugador → el de la pantalla física (toPhysical de games/lib/orientation, en diferencias) */
export function physicalDelta(d: { dx: number; dy: number }, rotated: boolean): { dx: number; dy: number } {
  return rotated ? { dx: -d.dy, dy: d.dx } : d;
}

/** arrastra con el mouse desde (cx, cy) físico un desplazamiento que el jugador ve como (dx, dy), y suelta (o no) */
export async function dragLogical(page: Page, cx: number, cy: number, d: { dx: number; dy: number }, opts: { release?: boolean } = {}): Promise<void> {
  const { dx, dy } = physicalDelta(d, await isRotated(page));
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx / 2, cy + dy / 2, { steps: 3 });
  await page.mouse.move(cx + dx, cy + dy, { steps: 3 });
  await page.waitForTimeout(80);
  if (opts.release !== false) await page.mouse.up();
}

export async function playChino(page: Page, seed: string): Promise<{ best: number; events: unknown[]; sentScore: number }> {
  const area = page.getByTestId("chino-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 120_000 });
  const vectors = vectorsFor(seed);
  const box = (await area.boundingBox())!;
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  for (let i = 0; i < vectors.length; i++) {
    await expect.poll(async () => (await snapOf(page))?.shot, { timeout: 20_000 }).toBe(i);
    await expect.poll(async () => (await snapOf(page))?.phase, { timeout: 20_000 }).toBe("aim");
    await dragLogical(page, cx, cy, dragFor(vectors[i]!));
    await expect.poll(async () => (await snapOf(page))?.phase, { timeout: 5_000 }).not.toBe("aim");
  }
  await expect(area).toHaveAttribute("data-end", "1", { timeout: 30_000 });
  const last = await snapOf(page);
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { best: last?.best ?? -1, events: body.events, sentScore: body.score };
}
