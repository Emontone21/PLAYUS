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

/** el arrastre en px (opuesto al vector; en pantalla y crece hacia abajo) */
export function dragFor(v: Vector): { dx: number; dy: number } {
  const len = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
  const pxLen = (len / V_MAX) * MAX_DRAG_PX;
  return { dx: (-v.vx / len) * pxLen, dy: (v.vy / len) * pxLen };
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
    const { dx, dy } = dragFor(vectors[i]!);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx / 2, cy + dy / 2, { steps: 3 });
    await page.mouse.move(cx + dx, cy + dy, { steps: 3 });
    await page.waitForTimeout(80);
    await page.mouse.up();
    await expect.poll(async () => (await snapOf(page))?.phase, { timeout: 5_000 }).not.toBe("aim");
  }
  await expect(area).toHaveAttribute("data-end", "1", { timeout: 30_000 });
  const last = await snapOf(page);
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { best: last?.best ?? -1, events: body.events, sentScore: body.score };
}
