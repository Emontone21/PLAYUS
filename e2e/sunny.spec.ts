import { test, expect, type Browser } from "@playwright/test";
import { autoTrace, simulate, validate, type SteerEvent, type TraceEvent } from "../src/games/pisteando-el-sunny/rules";
import { playSunny } from "./helpers/sunny";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";

// Noveno juego real. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida con el conductor automático unos
// segundos que después suelta y se cae llega al ranking con los metros.

test.setTimeout(300_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da"];

function summary(seed: string) {
  const a = autoTrace(seed);
  const inputs = a.events.filter((e): e is SteerEvent => !("fin" in e));
  const replay = simulate(seed, inputs).state;
  const lazy = simulate(seed, []);
  return JSON.stringify({
    auto: { n: a.events.length, first: a.events.slice(0, 40), score: a.result.score, endTick: a.result.endTick, reason: a.result.endReason },
    replay: { x: replay.x, y: replay.y, h: replay.h, m: replay.m, mq: replay.mq, heat: replay.heat, idx: replay.idx, progress: replay.progress, meters: replay.meters, offset: replay.offset },
    lazy: { score: lazy.score, endTick: lazy.endTick, reason: lazy.endReason, x: lazy.state.x, y: lazy.state.y },
  });
}

test("simulate da exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/pisteando-el-sunny?seed=abc");
  await expect(page.getByTestId("sunny-card")).toBeVisible();
  await page.waitForFunction(() => "__sunny" in window);
  await expect(page.getByTestId("dev-viewer")).toBeVisible();
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate((s) => {
      type Ev = { tick: number; fin?: true; steer?: number };
      type St = { x: number; y: number; h: number; m: number; mq: number; heat: number; idx: number; progress: number; meters: number; offset: number };
      type R = {
        autoTrace: (s: string) => { events: Ev[]; result: { score: number; endTick: number; endReason: string | null } };
        simulate: (s: string, t: unknown[]) => { score: number; endTick: number; endReason: string | null; state: St };
      };
      const R = (window as unknown as { __sunny: R }).__sunny;
      const a = R.autoTrace(s);
      const inputs = a.events.filter((e) => !("fin" in e));
      const replay = R.simulate(s, inputs).state;
      const lazy = R.simulate(s, []);
      return JSON.stringify({
        auto: { n: a.events.length, first: a.events.slice(0, 40), score: a.result.score, endTick: a.result.endTick, reason: a.result.endReason },
        replay: { x: replay.x, y: replay.y, h: replay.h, m: replay.m, mq: replay.mq, heat: replay.heat, idx: replay.idx, progress: replay.progress, meters: replay.meters, offset: replay.offset },
        lazy: { score: lazy.score, endTick: lazy.endTick, reason: lazy.endReason, x: lazy.state.x, y: lazy.state.y },
      });
    }, seed);
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área sin scroll, mantener apretado dobla, y una partida que suelta y se cae", async ({ browser }) => {
  const a = await freshPage(browser);
  // en cámara lenta: apretando a fondo desde el arranque, a velocidad normal el auto se cae en menos de 2 s
  await a.page.goto("/dev/juego/pisteando-el-sunny?seed=abc&lento=1");
  const card = a.page.getByTestId("sunny-card");
  await expect(card).toContainText("acelera solo");
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("sunny-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  // apretar la mitad derecha dobla a la derecha mientras está apretado
  const box = (await area.boundingBox())!;
  await a.page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6);
  await a.page.mouse.down();
  await expect(area).toHaveAttribute("data-steer", "1", { timeout: 2_000 });
  // arrastrar a la otra mitad cambia de lado
  await a.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6, { steps: 3 });
  await expect(area).toHaveAttribute("data-steer", "-1", { timeout: 2_000 });
  await a.page.mouse.up();
  await expect(area).toHaveAttribute("data-steer", "0", { timeout: 2_000 });
  await expect(a.page.getByTestId("sunny-kmh")).toContainText("km/h");
  await a.context.close();

  const b = await freshPage(browser);
  await b.page.goto("/dev/juego/pisteando-el-sunny?seed=abc");
  await b.page.getByTestId("game-play").click();
  const score = await playSunny(b.page, "abc", 4);
  expect(score).toBeGreaterThanOrEqual(40);
  await expect(b.page.getByTestId("game-score")).toHaveText(String(score));
  await expect(b.page.getByTestId("sunny-result")).toHaveAttribute("data-reason", /caida|choque/);
  await b.context.close();
});

test("en la ronda real: la partida se valida en el servidor y llega al ranking con los metros", async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Sunny", "pisteando el sunny");
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Pisteo");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  // A maneja 5 s con el conductor automático y suelta; el cuerpo que manda /finish se rearma en Node
  await a.page.goto("/hoy/jugar");
  const seedA = await startAndGetSeed(a.page);
  const finished = a.page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"));
  const score = await playSunny(a.page, seedA, 5);
  const body = (await finished).postDataJSON() as { score: number; events: TraceEvent[] };
  expect(body.score).toBe(score);
  expect(body.score).toBeGreaterThanOrEqual(40);
  expect(validate(body, seedA)).toBe(true);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  await a.page.getByTestId("game-done").click();
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(a.page.getByTestId("ranking-value").first()).toContainText(`${body.score}`);
  await expect(a.page.getByTestId("ranking-value").first()).toContainText("m");

  // B no dobla: se cae en la primera curva con pocos metros y queda detrás
  await b.page.goto("/hoy/jugar");
  await startAndGetSeed(b.page);
  await expect(b.page.getByTestId("sunny-area")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 60_000 });
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(2);
  await expect(b.page.getByTestId("ranking-row").first()).toContainText("Sunny");
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(2, { timeout: 30_000 });
  await a.context.close();
  await b.context.close();
});
