import { expect, type Page } from "@playwright/test";
import { damajuanaAt, viewFor } from "../../src/games/dale-un-trago-al-pibe/draw";
import { neededTurns, puzzleAt } from "../../src/games/dale-un-trago-al-pibe/rules";
import { DAMAJUANA_H, DAMAJUANA_W, TILE, TOP } from "../../src/games/dale-un-trago-al-pibe/sprites";

// Juega "Dale un trago al pibe" desde el navegador: rearma los puzzles del
// jugador con su semilla (la de /start), toca cada caño del camino las veces
// que hace falta, toca la damajuana, y en el puzzle siguiente la toca
// enseguida para que se derrame. Devuelve lo que mandó a /finish.

export function snapOf(page: Page): Promise<{ t: number; phase: string; puzzle: number; score: number; solved: boolean } | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="trago-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { t: Number(d.t ?? -1), phase: d.phase ?? "", puzzle: Number(d.puzzle ?? 0), score: Number(d.score ?? 0), solved: d.solved === "1" };
  });
}

async function viewPoint(page: Page, seed: string, puzzle: number, x: number, y: number): Promise<{ x: number; y: number }> {
  const p = puzzleAt(seed, puzzle);
  const { W, H } = viewFor(p);
  const canvas = page.getByTestId("trago-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  return { x: box.x + (x / W) * box.width, y: box.y + (y / H) * box.height };
}

/** toca la casilla `cell` del puzzle en curso */
export async function tapCell(page: Page, seed: string, puzzle: number, cell: number): Promise<void> {
  const p = puzzleAt(seed, puzzle);
  const pt = await viewPoint(page, seed, puzzle, (cell % p.cols) * TILE + TILE / 2, TOP + Math.floor(cell / p.cols) * TILE + TILE / 2);
  await page.mouse.click(pt.x, pt.y);
}

/** toca la damajuana */
export async function tapDamajuana(page: Page, seed: string, puzzle: number): Promise<void> {
  const d = damajuanaAt(puzzleAt(seed, puzzle));
  const pt = await viewPoint(page, seed, puzzle, d.x + DAMAJUANA_W / 2, d.y + DAMAJUANA_H / 2);
  await page.mouse.click(pt.x, pt.y);
}

/** espera a que esté el puzzle `n` para resolver */
export async function waitPuzzle(page: Page, n: number): Promise<void> {
  const area = page.getByTestId("trago-area");
  await expect(area).toHaveAttribute("data-puzzle", String(n), { timeout: 30_000 });
  await expect(area).toHaveAttribute("data-phase", "solving", { timeout: 30_000 });
}

/** resuelve el puzzle `n` con los giros calculados acá y larga el vino */
export async function solvePuzzle(page: Page, seed: string, n: number): Promise<void> {
  await waitPuzzle(page, n);
  for (const { cell, turns } of neededTurns(puzzleAt(seed, n))) {
    for (let k = 0; k < turns; k++) {
      await tapCell(page, seed, n, cell);
      await page.waitForTimeout(90);
    }
  }
  await expect(page.getByTestId("trago-area")).toHaveAttribute("data-solved", "1");
  await tapDamajuana(page, seed, n);
  await expect(page.getByTestId("trago-area")).toHaveAttribute("data-phase", "drinking", { timeout: 15_000 });
}

export async function playTrago(page: Page, seed: string, solve = 2): Promise<{ events: unknown[]; sentScore: number; score: number }> {
  const area = page.getByTestId("trago-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 160_000 });
  for (let n = 1; n <= solve; n++) await solvePuzzle(page, seed, n);
  // el siguiente: larga el vino sin armar nada
  await waitPuzzle(page, solve + 1);
  await tapDamajuana(page, seed, solve + 1);
  await expect(area).toHaveAttribute("data-phase", /spilled|over/, { timeout: 30_000 });
  await expect(page.getByTestId("trago-spill")).toHaveText("¡se derramó todo!");
  const last = await snapOf(page);
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { events: body.events, sentScore: body.score, score: last?.score ?? -1 };
}
