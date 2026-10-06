import { test, expect, type Browser } from "@playwright/test";
import { botTrace, check, generateCourse, MODEL } from "../src/games/nach-salta/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { playNachSalta, tickOf } from "./helpers/nach-salta";

// Juego nuevo. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida que salta las primeras rocas y después
// choca llega al ranking con los metros correctos.

test.setTimeout(300_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da", "semilla-9"];

test("la simulación da exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/nach-salta?seed=abc");
  await expect(page.getByTestId("nachsalta-card")).toBeVisible();
  await page.waitForFunction(() => "__nachsalta" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate(
      ([s, model]) => {
        type R = {
          botTrace: (s: string, o: unknown) => { events: unknown[]; state: unknown };
          generateCourse: (s: string) => unknown;
        };
        const R = (window as unknown as { __nachsalta: R }).__nachsalta;
        const a = R.botTrace(s, model);
        const fair = R.botTrace(s, { reaction: 15 });
        return JSON.stringify({ course: R.generateCourse(s), events: a.events, state: a.state, fair: fair.state });
      },
      [seed, MODEL] as const,
    );
    const a = botTrace(seed, MODEL);
    const fair = botTrace(seed, { reaction: 15 });
    expect(inBrowser, `semilla ${seed}`).toBe(JSON.stringify({ course: generateCourse(seed), events: a.events, state: a.state, fair: fair.state }));
  }
});

test("la previa, los sprites, el cartel de arranque, el área, y antes de los 400 m toda la pantalla salta", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/nach-salta?seed=abc");
  await expect(a.page.getByTestId("nachsalta-card").getByRole("img", { name: /The Nach/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-sprites").getByRole("img")).toHaveCount(8);
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("nachsalta-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const field = a.page.getByTestId("nachsalta-field");
  expect(await field.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await field.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  // el cartel de arranque, que se va a los 1,8 s
  await expect(a.page.getByTestId("nachsalta-start")).toHaveText("Nach no caigas en la roca");
  await expect(a.page.getByTestId("nachsalta-start")).toHaveCount(0, { timeout: 4_000 });
  // la mitad izquierda también salta mientras no hay nada en el aire
  const box = (await field.boundingBox())!;
  await a.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await a.page.mouse.down();
  await expect(area).toHaveAttribute("data-ground", "");
  await a.page.mouse.up();
  await expect(area).toHaveAttribute("data-ground", "1");
  await expect(a.page.getByTestId("nachsalta-split")).toHaveCount(0);
  expect(await tickOf(a.page)).toBeGreaterThan(0);
  await a.context.close();
});

test("en la ronda real: salta las primeras rocas, choca y llega al ranking con los metros correctos", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "Corredor", "Nach salta");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  const played = await playNachSalta(b.page, seed, 3);
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v).slice(0, 300)).toBe(true);
  if (!v.ok) return;
  expect(v.crashed).toBe(true);
  expect(v.score).toBe(played.sentScore);
  // pasó las tres primeras rocas: chocó con la cuarta o más adelante
  expect(v.state.hit).toBeGreaterThanOrEqual(3);
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-score")).toHaveText(`${v.score} m`);
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText(String(v.score));
  await b.context.close();
});
