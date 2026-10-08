import { expect, type Page } from "@playwright/test";
import { botTrace, FIELD, type LickEvent } from "../../src/games/cazando-colillas/rules";

// Juega "Cazando Colillas" desde el navegador: calcula en el test, con el
// jugador automático de las reglas, los toques para comer las primeras
// colillas y después uno que agarra un vapeador; mira el tick que el área
// publica en su dataset y toca en el punto del campo correspondiente cuando
// llega el tick. Devuelve lo que mandó a /finish.

export function snapOf(page: Page): Promise<{ tick: number; score: number; tongue: boolean; licks: number; crashed: boolean; end: boolean } | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="rana-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { tick: Number(d.tick ?? -1), score: Number(d.score ?? 0), tongue: d.tongue === "1", licks: Number(d.licks ?? 0), crashed: d.crashed === "1", end: d.end === "1" };
  });
}

/** los toques del jugador justo: come `eat` colillas y después apunta a un vapeador */
export function plannedLicks(seed: string, eat: number): LickEvent[] {
  return botTrace(seed, { reaction: 15, thenVapo: eat }).events.filter((e): e is LickEvent => !("fin" in e));
}

/** toca en un punto del campo lógico */
export async function lickAt(page: Page, p: { x: number; y: number }): Promise<void> {
  const box = (await page.getByTestId("rana-canvas").boundingBox())!;
  await page.mouse.click(box.x + (p.x / FIELD) * box.width, box.y + (p.y / FIELD) * box.height);
}

export async function playRana(page: Page, seed: string, eat = 3): Promise<{ events: unknown[]; sentScore: number; score: number }> {
  const area = page.getByTestId("rana-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 120_000 });
  for (const lick of plannedLicks(seed, eat)) {
    while (((await snapOf(page))?.tick ?? -1) < lick.tick) await page.waitForTimeout(4);
    await lickAt(page, lick);
    if ((await snapOf(page))?.crashed) break;
  }
  await expect(area).toHaveAttribute("data-crashed", "1", { timeout: 60_000 });
  await expect(page.getByTestId("rana-crash")).toHaveText("¡puaj, un vapo!");
  const last = await snapOf(page);
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { events: body.events, sentScore: body.score, score: last?.score ?? -1 };
}
