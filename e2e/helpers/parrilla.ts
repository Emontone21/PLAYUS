import { expect, type Page } from "@playwright/test";
import { canarioTimeline, isSafe, type Segment } from "../../src/games/la-parrilla-del-bro/timeline";

// Juega "la parrilla del bro" desde el navegador: toca a ritmo humano solo
// mientras el cronograma (calculado en Node con la semilla del intento) está
// en un estado seguro, según el reloj del propio juego (data-t). Al llegar a
// `safeTaps`, espera al próximo "mirando" y toca ahí: te ven y la partida
// termina con el puntaje exacto de los toques seguros.

export async function playParrilla(page: Page, seed: string, safeTaps: number): Promise<number> {
  const area = page.getByTestId("parrilla-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  // en la página de desarrollo la galería alarga la página: el área tiene que estar a la vista para que el mouse la toque
  const canvas = page.getByRole("img", { name: "el parrillero, el bro y el canario" });
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const timeline = canarioTimeline(seed);
  const gameT = () => area.evaluate((el) => Number(el.dataset.t ?? 0));
  const segAt = (t: number): Segment | undefined => timeline.find((s) => t >= s.start && t < s.end);

  let taps = 0;
  const deadline = Date.now() + 100_000;
  while (taps < safeTaps && Date.now() < deadline) {
    const t = await gameT();
    const seg = segAt(t);
    // toca solo bien adentro de un tramo seguro: lejos del final, por la latencia del navegador
    if (seg && isSafe(seg.state) && seg.state !== "aviso" && seg.end - t > 250) {
      await page.mouse.down();
      await page.mouse.up();
      taps++;
      await page.waitForTimeout(90 + Math.random() * 120);
    } else {
      await page.waitForTimeout(30);
    }
  }
  await expect(area).toHaveAttribute("data-taps", String(taps));

  // y ahora que te vea: un toque bien adentro de "mirando"
  while (Date.now() < deadline) {
    const t = await gameT();
    const seg = segAt(t);
    if (seg && seg.state === "mirando" && t - seg.start > 150 && seg.end - t > 250) {
      await page.mouse.down();
      await page.mouse.up();
      break;
    }
    await page.waitForTimeout(20);
  }
  await expect(area).toHaveAttribute("data-seen", "1", { timeout: 5_000 });
  await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  return taps;
}
