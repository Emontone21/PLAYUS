import { expect, type Page } from "@playwright/test";

// Juega "quedó re tarado" desde el navegador: `taps` toques a ritmo humano
// (intervalos al azar entre 55 y 160 ms) en el área del juego. Con 200 el
// juego termina solo; con menos, espera a que el cronómetro corte (40 s).

export async function tapHuman(page: Page, taps: number) {
  const area = page.getByTestId("tarado-area");
  const box = (await area.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < taps; i++) {
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(55 + Math.random() * 105);
  }
}

export async function playTarado(page: Page, taps: number) {
  await expect(page.getByTestId("tarado-area")).toBeVisible({ timeout: 15_000 });
  await tapHuman(page, taps);
  await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 50_000 });
}
