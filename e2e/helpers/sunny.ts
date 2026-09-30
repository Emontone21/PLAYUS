import { expect, type Page } from "@playwright/test";
import { autoPolicy, generateCourse, playBot, type Steer, type SteerEvent } from "../../src/games/pisteando-el-sunny/rules";

// Juega "pisteando el sunny" desde el navegador con la traza del conductor
// automático calculada en Node: durante `seconds` segundos aprieta y suelta
// las flechas cuando la simulación llega al tick de cada cambio, y después
// suelta todo: el sunny sigue derecho y se cae en la próxima curva.

/** los cambios de control del conductor automático durante `seconds` segundos, y la suelta */
export function planFor(seed: string, seconds: number): SteerEvent[] {
  const until = seconds * 60;
  const { events } = playBot(generateCourse(seed), autoPolicy(), until);
  const inputs = events.filter((e): e is SteerEvent => !("fin" in e));
  return [...inputs, { tick: until, steer: 0 }];
}

export interface Snap {
  tick: number;
  meters: number;
  end: string;
  slip: number;
}

export function snapOf(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="sunny-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { tick: Number(d.tick ?? -1), meters: Number(d.meters ?? 0), end: d.end ?? "", slip: Number(d.slip ?? 0) };
  });
}

async function setSteer(page: Page, held: { current: Steer }, steer: Steer) {
  if (held.current === steer) return;
  if (held.current === -1) await page.keyboard.up("ArrowLeft");
  if (held.current === 1) await page.keyboard.up("ArrowRight");
  if (steer === -1) await page.keyboard.down("ArrowLeft");
  if (steer === 1) await page.keyboard.down("ArrowRight");
  held.current = steer;
}

/** aplica el plan a medida que avanza la simulación; corta al final, cuando el área desaparece o cuando `stop` dice */
export async function drive(page: Page, plan: SteerEvent[], stop?: (s: Snap) => boolean, maxMs = 150_000): Promise<Snap | null> {
  const held = { current: 0 as Steer };
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
      await setSteer(page, held, p.steer);
      i++;
      continue;
    }
    await page.waitForTimeout(8);
  }
  await setSteer(page, held, 0);
  return last;
}

export async function playSunny(page: Page, seed: string, seconds: number): Promise<number> {
  const area = page.getByTestId("sunny-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  await drive(page, planFor(seed, seconds));
  await page.waitForFunction(
    () => {
      const a = document.querySelector('[data-testid="sunny-area"]') as HTMLElement | null;
      return (a && !!a.dataset.end) || !!document.querySelector('[data-testid="game-result"]');
    },
    undefined,
    { timeout: 130_000 },
  );
  await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  return Number(await page.getByTestId("game-score").textContent());
}
