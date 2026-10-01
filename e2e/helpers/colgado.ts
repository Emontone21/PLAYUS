import { expect, type Page } from "@playwright/test";
import { autoTrace, type Push, type PushEvent } from "../../src/games/colgado-del-121/rules";

// Juega "colgado del 121" desde el navegador con la traza del jugador
// automático calculada en Node: durante `seconds` segundos aprieta y suelta
// las flechas cuando la simulación llega al tick de cada cambio, y después
// suelta todo: el pasajero se va al piso en un par de segundos.

export function planFor(seed: string, seconds: number): PushEvent[] {
  const until = seconds * 60;
  const { events } = autoTrace(seed, until);
  const inputs = events.filter((e): e is PushEvent => !("fin" in e));
  return [...inputs, { tick: until, push: 0 }];
}

export interface Snap {
  tick: number;
  ms: number;
  end: string;
}

export function snapOf(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="colgado-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { tick: Number(d.tick ?? -1), ms: Number(d.ms ?? 0), end: d.end ?? "" };
  });
}

async function setPush(page: Page, held: { current: Push }, push: Push) {
  if (held.current === push) return;
  if (held.current === -1) await page.keyboard.up("ArrowLeft");
  if (held.current === 1) await page.keyboard.up("ArrowRight");
  if (push === -1) await page.keyboard.down("ArrowLeft");
  if (push === 1) await page.keyboard.down("ArrowRight");
  held.current = push;
}

export async function drive(page: Page, plan: PushEvent[], stop?: (s: Snap) => boolean, maxMs = 150_000): Promise<Snap | null> {
  const held = { current: 0 as Push };
  let i = 0;
  let last: Snap | null = null;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const s = await snapOf(page);
    if (!s) break;
    last = s;
    if (s.end || stop?.(s)) break;
    const p = plan[i];
    if (p && s.tick >= p.tick) {
      await setPush(page, held, p.push);
      i++;
      continue;
    }
    await page.waitForTimeout(6);
  }
  await setPush(page, held, 0);
  return last;
}

export async function playColgado(page: Page, seed: string, seconds: number): Promise<number> {
  const area = page.getByTestId("colgado-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  await drive(page, planFor(seed, seconds));
  await page.waitForFunction(
    () => {
      const a = document.querySelector('[data-testid="colgado-area"]') as HTMLElement | null;
      return (a && !!a.dataset.end) || !!document.querySelector('[data-testid="game-result"]');
    },
    undefined,
    { timeout: 130_000 },
  );
  await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  const text = (await page.getByTestId("game-score").textContent()) ?? "";
  // "34,7 s" → ms (con un decimal)
  return Math.round(Number(text.replace(" s", "").replace(",", ".")) * 1000);
}
