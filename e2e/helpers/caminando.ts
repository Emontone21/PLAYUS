import { expect, type Page } from "@playwright/test";
import { FIELD_H, FIELD_W } from "../../src/games/caminando-por-18/rules";

// Juega "caminando por 18" desde el navegador: toca a los pastosos que están
// viniendo (sus posiciones las expone el juego en data-pastosos, calculadas
// por la misma simulación que corre en Node) hasta juntar `taps` toques que
// cuentan, y después deja pasar al próximo: un contacto y la partida termina.

type Coming = [string, number, number, number];

export async function playCaminando(page: Page, taps: number): Promise<number> {
  const area = page.getByTestId("caminando-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const canvas = page.getByRole("img", { name: "18 de Julio, el personaje y los pastosos" });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const toPage = (x: number, y: number) => [box.x + (x / FIELD_W) * box.width, box.y + (y / FIELD_H) * box.height] as const;
  let done = 0;
  const deadline = Date.now() + 90_000;
  let lastTapAt = 0;
  while (done < taps && Date.now() < deadline) {
    const [coming, end] = await area.evaluate((el) => [JSON.parse(el.dataset.pastosos ?? "[]") as Coming[], el.dataset.end ?? ""] as const);
    if (end) break;
    // el más cercano al personaje (que está en 45, 120)
    const target = [...coming].sort((a, b) => (a[1] - 45) ** 2 + (a[2] - 120) ** 2 - ((b[1] - 45) ** 2 + (b[2] - 120) ** 2))[0];
    if (target && Date.now() - lastTapAt > 120) {
      const [px, py] = toPage(target[1], target[2]);
      await page.mouse.click(px, py);
      lastTapAt = Date.now();
      done++;
    }
    await page.waitForTimeout(40);
  }
  // y ahora deja pasar al próximo
  await expect(area).toHaveAttribute("data-end", "frenado", { timeout: 60_000 });
  await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  return done;
}
