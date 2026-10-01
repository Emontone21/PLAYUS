import { test, expect, type Browser } from "@playwright/test";
import { autoTrace, simulate, validate, type PushEvent, type TraceEvent } from "../src/games/colgado-del-121/rules";
import { playColgado } from "./helpers/colgado";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";

// Juego nuevo. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida con el jugador automático unos segundos
// que después suelta y se cae llega al ranking con el tiempo correcto.

test.setTimeout(300_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da"];

function summary(seed: string) {
  const a = autoTrace(seed);
  const inputs = a.events.filter((e): e is PushEvent => !("fin" in e));
  const replay = simulate(seed, inputs).state;
  const lazy = simulate(seed, []);
  return JSON.stringify({
    auto: { n: a.events.length, first: a.events.slice(0, 40), score: a.result.score, endTick: a.result.endTick, reason: a.result.endReason },
    replay: { x: replay.x, v: replay.v, tick: replay.tick },
    lazy: { score: lazy.score, endTick: lazy.endTick, reason: lazy.endReason, x: lazy.state.x },
  });
}

test("simulate da exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/colgado-del-121?seed=abc");
  await expect(page.getByTestId("colgado-card")).toBeVisible();
  await page.waitForFunction(() => "__colgado" in window);
  await expect(page.getByTestId("dev-graph")).toBeVisible();
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate((s) => {
      type Ev = { tick: number; fin?: true; push?: number };
      type St = { x: number; v: number; tick: number };
      type R = {
        autoTrace: (s: string) => { events: Ev[]; result: { score: number; endTick: number; endReason: string | null } };
        simulate: (s: string, t: unknown[]) => { score: number; endTick: number; endReason: string | null; state: St };
      };
      const R = (window as unknown as { __colgado: R }).__colgado;
      const a = R.autoTrace(s);
      const inputs = a.events.filter((e) => !("fin" in e));
      const replay = R.simulate(s, inputs).state;
      const lazy = R.simulate(s, []);
      return JSON.stringify({
        auto: { n: a.events.length, first: a.events.slice(0, 40), score: a.result.score, endTick: a.result.endTick, reason: a.result.endReason },
        replay: { x: replay.x, v: replay.v, tick: replay.tick },
        lazy: { score: lazy.score, endTick: lazy.endTick, reason: lazy.endReason, x: lazy.state.x },
      });
    }, seed);
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área sin scroll, mantener apretado empuja, y una partida que suelta y se cae", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/colgado-del-121?seed=abc&lento=1");
  const card = a.page.getByTestId("colgado-card");
  await expect(card).toContainText("se inclina sin avisar");
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("colgado-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  const box = (await area.boundingBox())!;
  await a.page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6);
  await a.page.mouse.down();
  await expect(area).toHaveAttribute("data-push", "1", { timeout: 2_000 });
  await a.page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6, { steps: 3 });
  await expect(area).toHaveAttribute("data-push", "-1", { timeout: 2_000 });
  await a.page.mouse.up();
  await expect(area).toHaveAttribute("data-push", "0", { timeout: 2_000 });
  await expect(a.page.getByTestId("colgado-time")).toContainText(" s");
  await a.context.close();

  const b = await freshPage(browser);
  await b.page.goto("/dev/juego/colgado-del-121?seed=abc");
  await b.page.getByTestId("game-play").click();
  const ms = await playColgado(b.page, "abc", 5);
  expect(ms).toBeGreaterThanOrEqual(4_000);
  await expect(b.page.getByTestId("colgado-result")).toHaveAttribute("data-reason", "caida");
  await b.context.close();
});

test("en la ronda real: la partida se valida en el servidor y llega al ranking en segundos", async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Colgado", "colgado del 121");
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Bondi");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  // A aguanta 6 s con el jugador automático y suelta; el cuerpo que manda /finish se rearma en Node
  await a.page.goto("/hoy/jugar");
  const seedA = await startAndGetSeed(a.page);
  const finished = a.page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"));
  const ms = await playColgado(a.page, seedA, 6);
  const body = (await finished).postDataJSON() as { score: number; events: TraceEvent[] };
  expect(Math.abs(body.score - ms)).toBeLessThan(120);
  expect(body.score).toBeGreaterThanOrEqual(5_000);
  expect(validate(body, seedA)).toBe(true);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  await a.page.getByTestId("game-done").click();
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(1);
  // el ranking muestra segundos con un decimal
  await expect(a.page.getByTestId("ranking-value").first()).toHaveText(/^\s*\d+,\d s\s*$/);

  // B no toca nada: se cae a los 2 o 3 segundos y queda detrás
  await b.page.goto("/hoy/jugar");
  await startAndGetSeed(b.page);
  await expect(b.page.getByTestId("colgado-area")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 60_000 });
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(2);
  await expect(b.page.getByTestId("ranking-row").first()).toContainText("Colgado");
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(2, { timeout: 30_000 });
  await a.context.close();
  await b.context.close();
});
