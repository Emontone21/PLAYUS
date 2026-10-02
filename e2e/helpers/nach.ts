import { expect, type Page } from "@playwright/test";
import { botTrace, type LaneEvent } from "../../src/games/nach-y-la-roca/rules";

// Juega "Nach y la roca" desde el navegador con la traza del jugador
// automático calculada en Node: aprieta la flecha de cada cambio cuando la
// simulación del navegador llega a ese tick (data-tick), esquiva las primeras
// `rows` filas y después deja de moverse: se topa con tres rocas y la partida
// termina. Devuelve lo que mandó a /finish.

export interface Snap {
  tick: number;
  meters: number;
  lane: number;
  lives: number;
  nextRow: number;
  end: string;
}

export function snapOf(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="nach-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { tick: Number(d.tick ?? -1), meters: Number(d.meters ?? 0), lane: Number(d.lane ?? 1), lives: Number(d.lives ?? 3), nextRow: Number(d.nextrow ?? 0), end: d.end ?? "" };
  });
}

/** la traza del jugador perfecto hasta pasar `rows` filas: deslizamientos un poco antes del último momento seguro, para la latencia del navegador */
export function planFor(seed: string, rows: number): LaneEvent[] {
  const { events } = botTrace(seed, { stopAfterRows: rows, delayTicks: 6 });
  return events.filter((e): e is LaneEvent => !("fin" in e));
}

export async function playNach(page: Page, seed: string, rows: number): Promise<{ meters: number; lives: number; end: string; events: unknown[]; sentScore: number }> {
  const area = page.getByTestId("nach-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 150_000 });
  const plan = planFor(seed, rows);
  let i = 0;
  const deadline = Date.now() + 130_000;
  let last: Snap | null = null;
  while (Date.now() < deadline) {
    const s = await snapOf(page);
    if (!s) break;
    last = s;
    if (s.end) break;
    const p = plan[i];
    if (p && s.tick >= p.tick - 2) {
      await page.keyboard.press(p.dir === 1 ? "ArrowRight" : "ArrowLeft");
      i++;
      continue;
    }
    await page.waitForTimeout(5);
  }
  expect(last?.end).toBe("vidas");
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { meters: last?.meters ?? -1, lives: last?.lives ?? -1, end: last?.end ?? "", events: body.events, sentScore: body.score };
}
