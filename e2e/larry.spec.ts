import { test, expect, type Browser } from "@playwright/test";
import { generateRain, greedyTrace, simulate, validate, type InputEvent, type TraceEvent } from "../src/games/los-deseos-de-larry/rules";
import { playLarry } from "./helpers/larry";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";

// Tercer juego real. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida jugada con el dedo llega al ranking.

test.setTimeout(240_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da"];

/** lo mismo que calcula el navegador, para comparar como texto */
function summary(seed: string) {
  const g = greedyTrace(seed);
  const inputs = g.events.filter((e): e is InputEvent => !("fin" in e));
  const lazy = simulate(seed, [{ tick: 0, x: 3 }]);
  return JSON.stringify({
    rain: generateRain(seed),
    greedy: { events: g.events, score: g.result.score, lives: g.result.lives, endTick: g.result.endTick, reason: g.result.endReason },
    replay: simulate(seed, inputs).state,
    lazy: { score: lazy.score, lives: lazy.lives, endTick: lazy.endTick, reason: lazy.endReason, splats: lazy.state.splats },
  });
}

test("simulate da exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/los-deseos-de-larry?seed=abc");
  await expect(page.getByTestId("larry-card")).toBeVisible();
  await page.waitForFunction(() => "__larry" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate((s) => {
      type L = {
        generateRain: (s: string) => unknown;
        greedyTrace: (s: string) => { events: Array<{ tick: number; x?: number; fin?: true }>; result: { score: number; lives: number; endTick: number; endReason: string | null } };
        simulate: (s: string, i: unknown[]) => { score: number; lives: number; endTick: number; endReason: string | null; state: { splats: unknown } };
      };
      const L = (window as unknown as { __larry: L }).__larry;
      const g = L.greedyTrace(s);
      const inputs = g.events.filter((e) => !("fin" in e));
      const lazy = L.simulate(s, [{ tick: 0, x: 3 }]);
      return JSON.stringify({
        rain: L.generateRain(s),
        greedy: { events: g.events, score: g.result.score, lives: g.result.lives, endTick: g.result.endTick, reason: g.result.endReason },
        replay: (L.simulate(s, inputs) as unknown as { state: unknown }).state,
        lazy: { score: lazy.score, lives: lazy.lives, endTick: lazy.endTick, reason: lazy.endReason, splats: lazy.state.splats },
      });
    }, seed);
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área de juego sin scroll y una partida con el dedo", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/los-deseos-de-larry?seed=abc");
  const card = a.page.getByTestId("larry-card");
  await expect(card).toContainText("sí");
  await expect(card).toContainText("no");
  await expect(card.getByRole("img", { name: "la bandera del Frente Amplio" })).toBeVisible();
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("larry-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  // arrastrar no mueve la página
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("larry-lives").getByRole("img")).toHaveCount(0); // las hamburguesitas son decorativas
  await expect(a.page.getByTestId("larry-lives")).toHaveAttribute("aria-label", "3 vidas");

  await playLarry(a.page, "abc", 3);
  const score = Number(await a.page.getByTestId("game-score").textContent());
  expect(score).toBeGreaterThanOrEqual(3);
  await expect(a.page.getByTestId("larry-result")).toContainText("deseos agarrados");
  await a.context.close();
});

test("en la ronda real: la partida se valida en el servidor y llega al ranking en vivo", async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Larry", "los deseos de Larry", 14);
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Quieto");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  // B juega sin moverse: se le caen tres y termina solo
  await b.page.goto("/hoy/jugar");
  const seedB = await startAndGetSeed(b.page);
  await expect(b.page.getByTestId("larry-area")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 100_000 });
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  expect(seedB).toBeTruthy();
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);

  // A juega con el dedo; el cuerpo que manda /finish se rearma en Node
  await a.page.goto("/hoy/jugar");
  const seedA = await startAndGetSeed(a.page);
  const finished = a.page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"));
  await playLarry(a.page, seedA, 4);
  const body = (await finished).postDataJSON() as { score: number; events: TraceEvent[] };
  expect(validate(body, seedA)).toBe(true);
  expect(body.score).toBeGreaterThanOrEqual(4);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  await expect(a.page.getByTestId("game-score")).toHaveText(String(body.score));
  await a.page.getByTestId("game-done").click();

  // en el ranking, A primera con su puntaje exacto
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(2);
  const first = a.page.getByTestId("ranking-row").first();
  await expect(first).toContainText("Larry");
  await expect(first).toContainText("+10");
  await expect(a.page.getByTestId("ranking-value").first()).toHaveText(new RegExp(`^\\s*${body.score}\\s*$`));

  // y B, sin tocar nada, ve aparecer a A arriba
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(2, { timeout: 30_000 });
  await expect(b.page.getByTestId("ranking-row").first()).toContainText("Larry");
  await a.context.close();
  await b.context.close();
});
