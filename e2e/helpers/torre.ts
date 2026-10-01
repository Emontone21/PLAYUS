import { expect, type Page } from "@playwright/test";

// Juega "apila las boludeces" desde el navegador: suelta `good` objetos cuando el vaivén
// (data-x, calculado por la misma simulación que corre en Node) pasa por el
// centro de la tabla, y después tira el siguiente en el vacío: se cae y la
// partida termina. Devuelve lo que mandó a /finish (puntaje y traza).

export interface Snap {
  tick: number;
  x: number | null;
  waiting: string;
  rot: string;
  dropped: number;
  best: number;
  end: string;
  loaded: boolean;
}

export function snapOf(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="torre-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { tick: Number(d.tick ?? -1), x: d.x ? Number(d.x) : null, waiting: d.waiting ?? "", rot: d.rot ?? "", dropped: Number(d.dropped ?? 0), best: Number(d.best ?? 0), end: d.end ?? "", loaded: d.loaded === "1" };
  });
}

/** espera a que haya un objeto esperando y suelta cuando su x pasa por `aim` (±tol) */
async function dropNear(page: Page, aim: number, tol: number, maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const s = await snapOf(page);
    if (!s) return false;
    if (s.end) return false;
    if (s.waiting && s.x !== null && Math.abs(s.x - aim) <= tol) {
      await page.keyboard.press("Space");
      return true;
    }
    await page.waitForTimeout(5);
  }
  return false;
}

export async function playTorre(page: Page, good: number): Promise<{ dropped: number; reason: string; score: number; events: unknown[] }> {
  const area = page.getByTestId("torre-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  await expect(area).toHaveAttribute("data-loaded", "1", { timeout: 20_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 150_000 });
  for (let i = 0; i < good; i++) {
    // espera al próximo objeto
    await expect
      .poll(async () => (await snapOf(page))?.dropped, { timeout: 15_000 })
      .toBe(i);
    await expect.poll(async () => (await snapOf(page))?.waiting, { timeout: 15_000 }).not.toBe("");
    // el cigarro y la botella, acostados (más estable)
    const w = (await snapOf(page))?.waiting;
    if (w === "cigarro" || w === "botella") {
      await page.keyboard.press("ArrowUp");
      await expect.poll(async () => (await snapOf(page))?.rot, { timeout: 3_000 }).toBe("1");
    }
    if (!(await dropNear(page, 0, 1.2, 15_000))) break;
    await expect.poll(async () => (await snapOf(page))?.dropped, { timeout: 5_000 }).toBe(i + 1);
  }
  // el siguiente, al vacío: lejos de la tabla (si la torre ya se vino abajo sola, no hace falta)
  if (!(await snapOf(page))?.end) {
    await expect.poll(async () => (await snapOf(page))?.waiting, { timeout: 15_000 }).not.toBe("");
    await dropNear(page, 35, 3, 30_000);
  }
  await page.waitForFunction(
    () => {
      const a = document.querySelector('[data-testid="torre-area"]') as HTMLElement | null;
      return (a && !!a.dataset.end) || !!document.querySelector('[data-testid="game-result"]');
    },
    undefined,
    { timeout: 130_000 },
  );
  const last = await snapOf(page);
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { dropped: last?.dropped ?? -1, reason: last?.end ?? "", score: body.score, events: body.events };
}
