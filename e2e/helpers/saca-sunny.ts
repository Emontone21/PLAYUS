import { expect, type Page } from "@playwright/test";
import { H, W } from "../../src/games/saca-el-sunny/draw";
import { puzzleAt, solve, type Move } from "../../src/games/saca-el-sunny/rules";
import { CELL, TOP } from "../../src/games/saca-el-sunny/sprites";

// Juega "Saca el Sunny" desde el navegador: rearma los estacionamientos del
// jugador con su semilla (la de /start), resuelve cada uno arrastrando los
// autos con la solución del resolvedor, y espera a que cierre la hdp.
// Devuelve lo que mandó a /finish.

export function snapOf(page: Page): Promise<{ t: number; phase: string; puzzle: number; score: number; moves: number; pos: number[] } | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="saca-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { t: Number(d.t ?? -1), phase: d.phase ?? "", puzzle: Number(d.puzzle ?? 0), score: Number(d.score ?? 0), moves: Number(d.moves ?? 0), pos: (d.pos ?? "").split(",").map(Number) };
  });
}

async function viewPoint(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId("saca-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  return { x: box.x + (x / W) * box.width, y: box.y + (y / H) * box.height };
}

/** arrastra el auto `car` `delta` casillas (con signo) sobre su eje, desde su centro; `sideways` arrastra perpendicular (no tiene que mover nada) */
export async function dragCar(page: Page, seed: string, puzzle: number, car: number, delta: number, sideways = false): Promise<void> {
  const p = puzzleAt(seed, puzzle);
  const snap = (await snapOf(page))!;
  const c = p.cars[car]!;
  const pos = snap.pos[car]!;
  const cx = c.horizontal ? (pos + c.len / 2) * CELL : (c.lane + 0.5) * CELL;
  const cy = TOP + (c.horizontal ? (c.lane + 0.5) * CELL : (pos + c.len / 2) * CELL);
  const from = await viewPoint(page, cx, cy);
  const dx = (c.horizontal ? !sideways : sideways) ? delta * CELL : 0;
  const dy = (c.horizontal ? sideways : !sideways) ? delta * CELL : 0;
  const to = await viewPoint(page, cx + dx, cy + dy);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

/** espera a que esté el estacionamiento `n` para jugar */
export async function waitPuzzle(page: Page, n: number): Promise<void> {
  const area = page.getByTestId("saca-area");
  await expect(area).toHaveAttribute("data-puzzle", String(n), { timeout: 30_000 });
  await expect(area).toHaveAttribute("data-phase", "playing", { timeout: 30_000 });
}

/** resuelve el estacionamiento `n` con la solución óptima */
export async function solvePuzzle(page: Page, seed: string, n: number): Promise<Move[]> {
  await waitPuzzle(page, n);
  const p = puzzleAt(seed, n);
  const path = solve(p.cars, p.start)!.path;
  for (let i = 0; i < path.length; i++) {
    const m = path[i]!;
    await dragCar(page, seed, n, m.car, m.delta);
    await expect(page.getByTestId("saca-area")).toHaveAttribute("data-moves", String(i + 1), { timeout: 5_000 });
    await page.waitForTimeout(120);
  }
  await expect(page.getByTestId("saca-area")).toHaveAttribute("data-phase", "leaving", { timeout: 5_000 });
  return path;
}

export async function playSacaSunny(page: Page, seed: string, solveCount = 2): Promise<{ events: unknown[]; sentScore: number; score: number }> {
  const area = page.getByTestId("saca-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 160_000 });
  for (let n = 1; n <= solveCount; n++) await solvePuzzle(page, seed, n);
  const last = await snapOf(page);
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { events: body.events, sentScore: body.score, score: last?.score ?? -1 };
}
