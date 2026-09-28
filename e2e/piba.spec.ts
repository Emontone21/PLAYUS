import { test, expect, type Browser } from "@playwright/test";
import { playPiba, startAndGetSeed } from "./helpers/piba";
import { createGroupWithGame } from "./helpers/group";
import { MAP_H, MAP_W } from "../src/games/piba-del-ipa/map";

// El primer juego real: se juega una partida tocando a la piba en las
// coordenadas que da generateMap, y el puntaje llega al ranking.

test.setTimeout(180_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("la piba del IPA: la pantalla previa la muestra, un error bloquea 2 s, y el puntaje llega al ranking", async ({ browser }) => {
  const a = await freshPage(browser);
  // un grupo al que hoy le toque la piba (el mazo se baraja por grupo)
  await createGroupWithGame(a.page, "Buscadora", "encontrá a la piba del IPA");
  await a.page.goto("/hoy");
  await expect(a.page.getByTestId("today-game-name")).toHaveText("encontrá a la piba del IPA");
  await a.page.getByTestId("play-link").click();
  await expect(a.page.getByTestId("piba-card")).toBeVisible();
  await expect(a.page.getByTestId("piba-card")).toContainText("así es ella");

  const seed = await startAndGetSeed(a.page);
  const area = a.page.getByTestId("piba-area");
  await expect(area).toBeVisible({ timeout: 15_000 });

  // un toque al cielo (nunca hay gente arriba de todo): "esa no es" y bloqueo
  await a.page.waitForTimeout(650);
  const box = (await a.page.getByRole("img", { name: "mapa" }).boundingBox())!;
  await a.page.mouse.click(box.x + box.width / 2, box.y + (2 * box.height) / MAP_H);
  await expect(a.page.getByTestId("piba-notice")).toHaveText("esa no es");
  await expect(area).toHaveAttribute("data-found", "0");
  await a.page.waitForTimeout(2_100);

  // tres aciertos, y el cronómetro corta a los 60 s
  await playPiba(a.page, seed, 3);
  await expect(a.page.getByTestId("game-result")).toContainText("se acabó el tiempo");
  await expect(a.page.getByTestId("game-score")).toHaveText("3");
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  await a.page.getByTestId("game-done").click();

  await expect(a.page).toHaveURL(/\/hoy$/);
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(a.page.getByTestId("ranking-value").first()).toContainText("3");
  await a.context.close();
});

test("el mapa entero entra en la pantalla y se dibuja en escalado entero", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/piba-del-ipa?seed=abc");
  await a.page.getByTestId("game-play").click();
  const canvas = a.page.getByRole("img", { name: "mapa" });
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const info = await canvas.evaluate((c: HTMLCanvasElement) => {
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, right: r.right, bottom: r.bottom, vw: window.innerWidth, vh: window.innerHeight };
  });
  expect(info.w % MAP_W).toBe(0);
  expect(info.h % MAP_H).toBe(0);
  expect(info.w / MAP_W).toBe(info.h / MAP_H);
  expect(info.right).toBeLessThanOrEqual(info.vw + 1);
  expect(info.bottom).toBeLessThanOrEqual(info.vh + 1);
  await a.context.close();
});
