import { expect, type Page } from "@playwright/test";
import { generateMap, MAP_H, MAP_W, pibaTarget } from "../../src/games/piba-del-ipa/map";

// Juega "encontrá a la piba del IPA" desde el navegador: toca a la piba en las
// coordenadas que da generateMap con la semilla del intento. Los mismos
// helpers los usan ronda.spec y piba.spec.

/** empieza la partida y devuelve la semilla del intento que dio /start */
export async function startAndGetSeed(page: Page): Promise<string> {
  const res = page.waitForResponse((r) => r.url().includes("/api/rounds/") && r.url().endsWith("/start"));
  await page.getByTestId("game-play").click();
  const body = (await (await res).json()) as { seed: string };
  return body.seed;
}

/** toca a la piba en el mapa que está en pantalla; espera a que sume */
export async function findPiba(page: Page, seed: string, mapIndex: number) {
  const area = page.getByTestId("piba-area");
  await expect(area).toHaveAttribute("data-map", String(mapIndex), { timeout: 15_000 });
  // el mapa no toma toques en sus primeros 500 ms
  await page.waitForTimeout(650);
  const canvas = page.getByRole("img", { name: "mapa" });
  const box = (await canvas.boundingBox())!;
  const target = pibaTarget(generateMap(seed, mapIndex));
  await page.mouse.click(box.x + ((target.x + 0.5) * box.width) / MAP_W, box.y + ((target.y + 0.5) * box.height) / MAP_H);
  await expect(area).toHaveAttribute("data-found", String(mapIndex), { timeout: 5_000 });
}

/** encuentra a la piba `hits` veces y espera a que el cronómetro corte (60 s) */
export async function playPiba(page: Page, seed: string, hits: number) {
  for (let i = 1; i <= hits; i++) await findPiba(page, seed, i);
  await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 70_000 });
}
