import { expect, type Page } from "@playwright/test";
import { FIELD_W, generateRain, isWish } from "../../src/games/los-deseos-de-larry/rules";

// Juega "los deseos de Larry" desde el navegador, como el jugador perfecto de
// los tests: con el dedo (el mouse apretado) sigue al próximo deseo a la vista,
// que calcula en Node con la semilla del intento. Cuando lleva `wishes`
// agarrados, suelta y deja que Larry se quede quieto: se le caen tres y la
// partida termina sola (o antes, si le cae algo malo encima).

/** el próximo deseo en cruzar entre los que ya aparecieron, en el tick dado */
function targetAt(rain: ReturnType<typeof generateRain>, tick: number): number | null {
  for (const d of rain) if (isWish(d.kind) && d.spawn < tick && d.cross >= tick) return d.x;
  return null;
}

export async function playLarry(page: Page, seed: string, wishes: number) {
  const area = page.getByTestId("larry-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const canvas = page.getByRole("img", { name: "la calle, Larry y lo que cae" });
  const box = (await canvas.boundingBox())!;
  const toX = (units: number) => box.x + (units / FIELD_W) * box.width;
  const y = box.y + box.height * 0.8;
  const rain = generateRain(seed);

  await page.mouse.move(toX(45), y);
  await page.mouse.down();
  let last = 45;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const [tick, score, end] = await area.evaluate((el) => [Number(el.dataset.tick ?? 0), Number(el.dataset.score ?? 0), el.dataset.end ?? ""] as const);
    if (end || score >= wishes) break;
    const x = targetAt(rain, tick + 1);
    if (x !== null && x !== last) {
      await page.mouse.move(toX(x), y, { steps: 2 });
      last = x;
    }
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 100_000 });
}
