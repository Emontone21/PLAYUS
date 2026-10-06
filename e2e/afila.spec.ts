import { test, expect, type Browser } from "@playwright/test";
import { botTrace, check, MODEL, wheelSpec } from "../src/games/big-bro-afila/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { playAfila, snapOf } from "./helpers/afila";

// Juego nuevo. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida que completa la primera horma y después
// choca llega al ranking con el puntaje correcto.

test.setTimeout(300_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da", "semilla-9"];

test("la simulación da exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/big-bro-afila?seed=abc");
  await expect(page.getByTestId("afila-card")).toBeVisible();
  await page.waitForFunction(() => "__afila" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate(
      ([s, model]) => {
        type R = {
          botTrace: (s: string, o: unknown) => { events: unknown[]; state: { score: number; done: number; tick: number; wheel: { spin: unknown; stuck: unknown } } };
          wheelSpec: (s: string, n: number) => unknown;
        };
        const R = (window as unknown as { __afila: R }).__afila;
        const a = R.botTrace(s, model);
        const fair = R.botTrace(s, {});
        return JSON.stringify({ specs: [1, 4, 5, 8].map((n) => R.wheelSpec(s, n)), events: a.events, score: a.state.score, done: a.state.done, spin: a.state.wheel.spin, stuck: a.state.wheel.stuck, fair: fair.state.score, fairTick: fair.state.tick });
      },
      [seed, MODEL] as const,
    );
    const a = botTrace(seed, MODEL);
    const fair = botTrace(seed);
    expect(inBrowser, `semilla ${seed}`).toBe(
      JSON.stringify({ specs: [1, 4, 5, 8].map((n) => wheelSpec(seed, n)), events: a.events, score: a.state.score, done: a.state.done, spin: a.state.wheel.spin, stuck: a.state.wheel.stuck, fair: fair.state.score, fairTick: fair.state.tick }),
    );
  }
});

test("la pantalla previa, la herramienta, el área y la barra espaciadora que tira sin repetir", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/big-bro-afila?seed=abc");
  const card = a.page.getByTestId("afila-card");
  await expect(card.getByRole("img", { name: /Big Bro/ })).toBeVisible();
  await expect(card.getByRole("img", { name: /horma/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-faces").getByRole("img")).toHaveCount(4);
  await expect(a.page.getByTestId("dev-speed").getByRole("img")).toHaveCount(8);
  await expect(a.page.getByTestId("dev-art").getByRole("img")).toHaveCount(6);
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("afila-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("afila-wheel")).toHaveText("horma 1");
  // la barra mantenida tira una sola
  await a.page.keyboard.down("Space");
  await a.page.waitForTimeout(400);
  await a.page.keyboard.up("Space");
  await expect.poll(async () => (await snapOf(a.page))?.stuck.length).toBe(1);
  await a.page.waitForTimeout(300);
  expect((await snapOf(a.page))!.stuck.length).toBe(1);
  await expect(a.page.getByTestId("afila-score")).toHaveText("1");
  // un toque en el canvas también tira
  await a.page.getByTestId("afila-canvas").click({ force: true });
  await expect.poll(async () => (await snapOf(a.page))?.stuck.length).toBeGreaterThanOrEqual(1);
  await a.context.close();
});

test("en la ronda real: completa la primera horma, choca y llega al ranking con el puntaje correcto", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "Afilador", "Big Bro afila");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  const played = await playAfila(b.page);
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v).slice(0, 300)).toBe(true);
  if (!v.ok) return;
  expect(v.done).toBe(1);
  expect(v.crashed).toBe(true);
  expect(v.score).toBe(played.sentScore);
  expect(v.score).toBeGreaterThanOrEqual(16);
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-score")).toHaveText(String(v.score));
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText(String(v.score));
  await b.context.close();
});
