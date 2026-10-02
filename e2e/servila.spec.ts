import { test, expect, type Browser } from "@playwright/test";
import { botTrace, check, generateGlasses, simulate, type PourEvent } from "../src/games/servila-justa/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { playServila, snapOf } from "./helpers/servila";

// Juego nuevo. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida que sirve los 8 vasos cerca de la raya
// (con los momentos de soltar calculados en el test desde la simulación)
// llega al ranking con el total correcto.

test.setTimeout(400_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da", "semilla-9"];
const BOT = { delayTicks: 9, jitterTicks: 4 };

function summary(seed: string) {
  const gs = generateGlasses(seed).map((g) => [g.shape, g.whiskyRows, g.lineRow]);
  const a = botTrace(seed, BOT);
  const r = simulate(seed, a.events.filter((e): e is PourEvent => !("fin" in e)), a.result.endTick + 1);
  return JSON.stringify({ gs, events: a.events, score: a.result.score, results: r.results });
}

test("la simulación da exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/servila-justa?seed=abc");
  await expect(page.getByTestId("servila-card")).toBeVisible();
  await page.waitForFunction(() => "__servila" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate(
      ([s, bot]) => {
        type Ev = { tick: number; fin?: true; action?: string };
        type R = {
          generateGlasses: (s: string) => { shape: string; whiskyRows: number; lineRow: number }[];
          botTrace: (s: string, o: unknown) => { events: Ev[]; result: { score: number; endTick: number } };
          simulate: (s: string, t: Ev[], until: number) => { results: unknown[] };
        };
        const R = (window as unknown as { __servila: R }).__servila;
        const gs = R.generateGlasses(s).map((g) => [g.shape, g.whiskyRows, g.lineRow]);
        const a = R.botTrace(s, bot);
        const r = R.simulate(s, a.events.filter((e) => !("fin" in e)), a.result.endTick + 1);
        return JSON.stringify({ gs, events: a.events, score: a.result.score, results: r.results });
      },
      [seed, BOT] as const,
    );
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área, los perfiles en la herramienta, y apretar y soltar con el mouse y con la barra", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/servila-justa?seed=abc&lento=1");
  const card = a.page.getByTestId("servila-card");
  await expect(card).toContainText("sale la cola");
  await expect(card.getByRole("img", { name: /Nix cola/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-profiles").getByRole("img")).toHaveCount(6);
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("servila-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("servila-glass")).toContainText("vaso 1 de 8");
  // el mouse sostenido sirve, soltar corta
  const box = (await area.boundingBox())!;
  await a.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await a.page.mouse.down();
  await expect(area).toHaveAttribute("data-pressed", "1", { timeout: 3_000 });
  await a.page.waitForTimeout(300);
  await a.page.mouse.up();
  await expect(area).toHaveAttribute("data-pressed", "", { timeout: 3_000 });
  await expect(area).toHaveAttribute("data-phase", "settle", { timeout: 3_000 });
  // ese vaso ya quedó: volver a apretar no sirve
  await a.page.keyboard.down("Space");
  await a.page.waitForTimeout(200);
  await expect(area).toHaveAttribute("data-pressed", "");
  await a.page.keyboard.up("Space");
  await expect(a.page.getByTestId("servila-banner")).toBeVisible({ timeout: 15_000 });
  await a.context.close();
});

test("en la ronda real: sirve los 8 vasos cerca de la raya y llega al ranking con el total", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "Barman", "servila justa");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  const played = await playServila(b.page, seed, 1);
  expect(played.score).toBeGreaterThan(500);
  expect(played.sentScore).toBe(played.score);
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-score")).toHaveText(String(played.score));
  await expect(b.page.getByTestId("servila-summary").locator("li")).toHaveCount(8);
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (v.ok) {
    expect(v.score).toBe(played.score);
    expect(v.results.length).toBe(8);
  }
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText(String(played.score));
  expect(await snapOf(b.page)).toBeNull();
  await b.context.close();
});
