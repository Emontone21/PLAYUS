import { expect, type Page } from "@playwright/test";
import { botTrace, type InputEvent } from "../../src/games/nach-salta/rules";

// Juega "Nach salta" desde el navegador: calcula en el test (con el jugador
// automático justo de las reglas) en qué tick despegar para cada una de las
// primeras rocas, mira el tick que el área publica en su dataset y toca la
// flecha arriba un par de ticks antes, para cubrir la demora. Después deja
// de saltar y The Nach choca con la siguiente. Devuelve lo que mandó a /finish.

export function tickOf(page: Page): Promise<number> {
  return page.evaluate(() => Number((document.querySelector('[data-testid="nachsalta-area"]') as HTMLElement | null)?.dataset.tick ?? -1));
}

/** los ticks de despegue del jugador justo para las primeras `n` rocas */
export function plannedJumps(seed: string, n: number): number[] {
  return botTrace(seed, { reaction: 15 })
    .events.filter((e): e is InputEvent => !("fin" in e) && e.input === "jump-down")
    .slice(0, n)
    .map((e) => e.tick);
}

/** salta las primeras `jumps` rocas (con un toque corto) y después choca */
export async function playNachSalta(page: Page, seed: string, jumps: number, lag = 2): Promise<{ events: unknown[]; sentScore: number }> {
  const area = page.getByTestId("nachsalta-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 120_000 });
  for (const take of plannedJumps(seed, jumps)) {
    while ((await tickOf(page)) < take - lag) await page.waitForTimeout(5);
    await page.keyboard.press("ArrowUp");
  }
  await expect(area).toHaveAttribute("data-crashed", "1", { timeout: 30_000 });
  // el cartel del final, mientras se ve la caída
  await expect(page.getByTestId("nachsalta-crash")).toHaveText("no denuevo nach");
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { events: body.events, sentScore: body.score };
}
