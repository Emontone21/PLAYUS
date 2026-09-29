import { expect, type Page } from "@playwright/test";
import { BOAT_HIT_H, D_PER_M, D_PER_UNIT, FIELD_W, generateCourse, PIECE_HIT_H } from "../../src/games/remar-vuelve-a-casa/rules";

// Juega "remar vuelve a casa" desde el navegador como el bot del camino
// seguro de los tests: con el dedo (el mouse apretado) lleva el bote al hueco
// de la próxima fila, que calcula en Node con la semilla del intento. Al
// llegar a `meters`, apunta a un cubierto y choca a propósito: así la partida
// termina sola y el resultado llega enseguida.

export async function playRemar(page: Page, seed: string, meters: number) {
  const area = page.getByTestId("remar-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const canvas = page.getByRole("img", { name: "el río, el bote y lo que flota" });
  const box = (await canvas.boundingBox())!;
  const toX = (units: number) => box.x + (units / FIELD_W) * box.width;
  const y = box.y + box.height * 0.85;
  const course = generateCourse(seed);
  const passed = (d: number, dist: number) => dist - d >= ((PIECE_HIT_H + BOAT_HIT_H) / 2) * D_PER_UNIT;

  await page.mouse.move(toX(45), y);
  await page.mouse.down();
  let last = 45;
  let crashing = false;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const [dist, end] = await area.evaluate((el) => [Number(el.dataset.dist ?? 0), el.dataset.end ?? ""] as const);
    if (end) break;
    const next = course.rows.find((r) => !passed(r.d, dist));
    if (!next) break;
    let x = next.gap;
    if (dist >= meters * D_PER_M) {
      // ya está: al primer cubierto de la próxima fila
      crashing = true;
      x = Math.max(4, Math.min(FIELD_W - 4, next.gap - next.gapW / 2 - 6));
    }
    if (x !== last) {
      await page.mouse.move(toX(x), y, { steps: 2 });
      last = x;
    }
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  expect(crashing).toBe(true);
  await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 130_000 });
}
