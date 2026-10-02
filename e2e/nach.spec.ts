import { test, expect, type Browser } from "@playwright/test";
import { botTrace, check, generateCourse, simulate, type LaneEvent } from "../src/games/nach-y-la-roca/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { playNach, snapOf } from "./helpers/nach";

// Juego nuevo. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida que esquiva las primeras filas con la
// traza calculada en el test y después se topa con tres rocas llega al
// ranking con los metros correctos.

test.setTimeout(400_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da", "semilla-9"];
const BOT = { delayTicks: 30, errorRate: 0.03 };

function summary(seed: string) {
  const c = generateCourse(seed);
  const a = botTrace(seed, BOT);
  const inputs = a.events.filter((e): e is LaneEvent => !("fin" in e));
  const r = simulate(seed, inputs, a.result.endTick);
  return JSON.stringify({ rows: c.rows.length, first: c.rows.slice(0, 20), pushed: c.pushed, events: a.events, score: a.result.score, lives: a.result.lives, endTick: a.result.endTick, lane: r.state.lane, broken: [...r.state.broken] });
}

test("simulate y el curso dan exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/nach-y-la-roca?seed=abc");
  await expect(page.getByTestId("nach-card")).toBeVisible();
  await page.waitForFunction(() => "__nach" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate(
      ([s, bot]) => {
        type Ev = { tick: number; fin?: true; dir?: number };
        type R = {
          generateCourse: (s: string) => { rows: unknown[]; pushed: number };
          botTrace: (s: string, o: unknown) => { events: Ev[]; result: { score: number; lives: number; endTick: number } };
          simulate: (s: string, t: Ev[], until: number) => { state: { lane: number; broken: Set<string> } };
        };
        const R = (window as unknown as { __nach: R }).__nach;
        const c = R.generateCourse(s);
        const a = R.botTrace(s, bot);
        const inputs = a.events.filter((e) => !("fin" in e));
        const r = R.simulate(s, inputs, a.result.endTick);
        return JSON.stringify({ rows: c.rows.length, first: c.rows.slice(0, 20), pushed: c.pushed, events: a.events, score: a.result.score, lives: a.result.lives, endTick: a.result.endTick, lane: r.state.lane, broken: [...r.state.broken] });
      },
      [seed, BOT] as const,
    );
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área, los sprites en la herramienta y las flechas", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/nach-y-la-roca?seed=abc&lento=1");
  const card = a.page.getByTestId("nach-card");
  await expect(card).toContainText("cambia de carril");
  await expect(card.getByRole("img", { name: /The Nach de espaldas/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-sprites").getByRole("img")).toHaveCount(8);
  await expect(a.page.getByTestId("dev-topdown")).toBeVisible();
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("nach-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("nach-meters")).toContainText(" m");
  await expect(a.page.getByTestId("nach-lives")).toHaveAttribute("data-lives", "3");
  // las flechas cambian de carril; contra el borde no hace nada
  await a.page.keyboard.press("ArrowRight");
  await expect(area).toHaveAttribute("data-lane", "2", { timeout: 5_000 });
  await a.page.keyboard.press("ArrowRight");
  await a.page.waitForTimeout(400);
  await expect(area).toHaveAttribute("data-lane", "2");
  await a.page.keyboard.press("ArrowLeft");
  await expect(area).toHaveAttribute("data-lane", "1", { timeout: 5_000 });
  // deslizar con el dedo (un puntero) también
  const box = (await area.boundingBox())!;
  await a.page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await a.page.mouse.down();
  await a.page.mouse.move(box.x + box.width * 0.6 - 60, box.y + box.height * 0.6, { steps: 4 });
  await a.page.mouse.up();
  await expect(area).toHaveAttribute("data-lane", "0", { timeout: 5_000 });
  await a.context.close();
});

test("en la ronda real: esquiva las primeras filas con la traza calculada en el test, se topa con tres rocas y llega al ranking con los metros", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "DJ", "Nach y la roca");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  const played = await playNach(b.page, seed, 6);
  expect(played.end).toBe("vidas");
  expect(played.lives).toBe(0);
  expect(played.meters).toBeGreaterThan(80);
  expect(played.sentScore).toBe(played.meters);
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-score")).toContainText(String(played.meters));
  await expect(b.page.getByTestId("nach-result")).toContainText("se le rayó el disco");
  // la traza que mandó se rearma en Node con los mismos metros, y el servidor la aceptó
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (v.ok) expect(v.score).toBe(played.meters);
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText(`${played.meters}`);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText("m");
  const s = await snapOf(b.page);
  expect(s).toBeNull();
  await b.context.close();
});
