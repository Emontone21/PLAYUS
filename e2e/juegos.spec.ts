import { test, expect, type Browser, type Page } from "@playwright/test";

// Criterio de la etapa 4: la misma semilla produce las mismas esperas en
// reflejo en dos navegadores, y ambos juegos terminan y muestran el resultado.
// Usa la ruta de desarrollo /dev/juego/[id]?seed=…, que no toca el servidor.

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function waitsFor(page: Page, seed: string): Promise<number[]> {
  await page.goto(`/dev/juego/reflejo?seed=${seed}`);
  await expect(page.getByTestId("game-intro")).toBeVisible();
  await page.getByTestId("game-play").click();
  await expect(page.getByTestId("game-countdown")).toBeVisible();
  const area = page.getByTestId("reflejo-area");
  await expect(area).toBeVisible({ timeout: 10_000 });
  return JSON.parse((await area.getAttribute("data-waits")) ?? "[]") as number[];
}

test("reflejo: la misma semilla da las mismas esperas en dos navegadores", async ({ browser }) => {
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  const c = await freshPage(browser);

  const [wa, wb, wc] = await Promise.all([waitsFor(a.page, "abc"), waitsFor(b.page, "abc"), waitsFor(c.page, "xyz")]);
  expect(wa).toHaveLength(5);
  expect(wa).toEqual(wb);
  expect(wc).not.toEqual(wa);
  for (const w of wa) {
    expect(w).toBeGreaterThanOrEqual(1000);
    expect(w).toBeLessThanOrEqual(4000);
  }

  // y el juego se termina: cinco rondas tocando cuando se pone verde
  const area = a.page.getByTestId("reflejo-area");
  for (let round = 0; round < 5; round++) {
    await expect(area).toHaveAttribute("data-phase", "go", { timeout: 8_000 });
    await area.click();
    // en la última ronda el área desaparece: ya está el resultado
    if (round < 4) await expect(area).not.toHaveAttribute("data-phase", "go");
  }
  await expect(a.page.getByTestId("game-result")).toBeVisible({ timeout: 5_000 });
  const score = Number((await a.page.getByTestId("game-score").textContent())?.replace(/\D/g, ""));
  expect(score).toBeGreaterThan(0);
  expect(score).toBeLessThanOrEqual(2000);
  await expect(a.page.getByTestId("game-result")).toContainText("terminaste");

  await a.context.close();
  await b.context.close();
  await c.context.close();
});

test("tap-race: cuenta los toques y el cronómetro corta a los 15 segundos", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/tap-race?seed=abc");
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("tap-area");
  await expect(area).toBeVisible({ timeout: 10_000 });
  await expect(a.page.getByTestId("game-timer")).toBeVisible();

  for (let i = 0; i < 12; i++) await area.click();
  await expect(a.page.getByTestId("tap-count")).toHaveText("12");

  // el juego no termina solo: el sistema lo corta cuando se acaba el tiempo
  await expect(a.page.getByTestId("game-result")).toBeVisible({ timeout: 20_000 });
  await expect(a.page.getByTestId("game-score")).toHaveText("12");
  await expect(a.page.getByTestId("game-result")).toContainText("se acabó el tiempo");

  // "listo" vuelve a la pantalla previa para jugar de nuevo
  await a.page.getByTestId("game-done").click();
  await expect(a.page.getByTestId("game-intro")).toBeVisible();
  await a.context.close();
});
