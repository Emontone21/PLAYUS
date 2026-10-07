import { expect, type Page } from "@playwright/test";
import { botTrace, type HopEvent } from "../../src/games/cruza-con-el-chino/rules";

// Juega "Cruza con el chino" desde el navegador: calcula en el test, con el
// buscador de caminos de las reglas (el jugador justo), los saltos para
// cruzar los primeros bloques, mira el tick que el área publica en su dataset
// y manda cada salto (tecla arriba, o un deslizamiento) un par de ticks
// antes. Después salta a la primera calle del bloque siguiente y se queda ahí
// hasta que lo atropellan. Devuelve lo que mandó a /finish.

export function snapOf(page: Page): Promise<{ tick: number; row: number; col: number; rows: number; crashed: boolean; end: boolean; lane: string } | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="cruza-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { tick: Number(d.tick ?? -1), row: Number(d.row ?? 0), col: Number(d.col ?? 0), rows: Number(d.rows ?? 0), crashed: d.crashed === "1", end: d.end === "1", lane: d.lane ?? "" };
  });
}

/** el plan del E2E: saltos separados 300 ms y con 30 ticks de margen al aterrizar, así la demora del navegador no los vuelve inseguros */
export const E2E_PLAN = { hopGap: 18, margin: 30 } as const;

/** los saltos para cruzar `blocks` bloques (y el último, a la calle donde se queda) */
export function plannedHops(seed: string, blocks: number): HopEvent[] {
  return botTrace(seed, { blocks, ...E2E_PLAN }).events.filter((e): e is HopEvent => !("fin" in e));
}

/** un gesto sobre el área: toque (adelante) o deslizamiento de costado */
export async function gesture(page: Page, dir: "up" | "left" | "right"): Promise<void> {
  const box = (await page.getByTestId("cruza-canvas").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.6;
  await page.mouse.move(x, y);
  await page.mouse.down();
  if (dir !== "up") await page.mouse.move(x + (dir === "right" ? 60 : -60), y + 4, { steps: 3 });
  await page.mouse.up();
}

export async function playCruza(page: Page, seed: string, blocks = 2, lag = 2): Promise<{ events: unknown[]; sentScore: number; rows: number }> {
  const area = page.getByTestId("cruza-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 150_000 });
  for (const hop of plannedHops(seed, blocks)) {
    while (((await snapOf(page))?.tick ?? -1) < hop.tick - lag) await page.waitForTimeout(4);
    if (hop.dir === "up") await page.keyboard.press("ArrowUp");
    else await gesture(page, hop.dir);
  }
  await expect(area).toHaveAttribute("data-crashed", "1", { timeout: 60_000 });
  await expect(page.getByTestId("cruza-crash")).toHaveText("el chino quedó de a pie");
  const last = await snapOf(page);
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { events: body.events, sentScore: body.score, rows: last?.rows ?? -1 };
}
