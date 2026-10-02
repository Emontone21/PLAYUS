import { expect, type Page } from "@playwright/test";
import { generateObjects, GRID, shiftLine, solveCut, type Line } from "../../src/games/clase-con-el-bro/rules";
import { TABLE } from "../../src/games/clase-con-el-bro/draw";
import { FIELD_W } from "../../src/games/clase-con-el-bro/sprites";

// Juega "clase con el bro" desde el navegador: calcula en el test las tres
// rectas (la del resolvedor, ligeramente corrida) y hace cada corte con un
// arrastre del mouse de un extremo al otro, esperando a que el juego acepte
// cortes. Devuelve lo que mandó a /finish.

export interface Snap {
  cut: number;
  phase: string;
  total: number;
  end: boolean;
}

export function snapOf(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="clase-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { cut: Number(d.cut ?? 0), phase: d.phase ?? "", total: Number(d.total ?? 0), end: d.end === "1" };
  });
}

/** las tres rectas: la del resolvedor corrida un poco (unidades de la mesa) */
export const OFFSETS = [120, 0, -180];
export function linesFor(seed: string): Line[] {
  return generateObjects(seed).map((o, i) => shiftLine(solveCut(o.verts).line, OFFSETS[i] ?? 0));
}

/** de la grilla de la mesa a la pantalla, con la caja del canvas */
export function toScreen(box: { x: number; y: number; width: number }, ux: number, uy: number): { x: number; y: number } {
  const f = box.width / FIELD_W;
  return { x: box.x + (TABLE.x + (ux * TABLE.w) / GRID) * f, y: box.y + (TABLE.y + (uy * TABLE.w) / GRID) * f };
}

export async function cutWith(page: Page, line: Line, opts: { release?: boolean } = {}): Promise<void> {
  const box = (await page.getByTestId("clase-canvas").boundingBox())!;
  const a = toScreen(box, line.x1, line.y1);
  const b = toScreen(box, line.x2, line.y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.waitForTimeout(80);
  if (opts.release !== false) await page.mouse.up();
}

export async function playClase(page: Page, seed: string): Promise<{ total: number; events: unknown[]; sentScore: number }> {
  const area = page.getByTestId("clase-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 120_000 });
  const lines = linesFor(seed);
  for (let i = 0; i < lines.length; i++) {
    await expect.poll(async () => (await snapOf(page))?.cut, { timeout: 20_000 }).toBe(i);
    await expect.poll(async () => (await snapOf(page))?.phase, { timeout: 20_000 }).toBe("aim");
    await cutWith(page, lines[i]!);
    await expect.poll(async () => (await snapOf(page))?.phase, { timeout: 5_000 }).not.toBe("aim");
  }
  await expect(area).toHaveAttribute("data-end", "1", { timeout: 30_000 });
  const last = await snapOf(page);
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { total: last?.total ?? -1, events: body.events, sentScore: body.score };
}
