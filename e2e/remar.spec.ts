import { test, expect, type Browser } from "@playwright/test";
import { drunkTrace, generateCourse, simulate, soberTrace, validate, type InputEvent, type TraceEvent } from "../src/games/remar-vuelve-a-casa/rules";
import { playRemar } from "./helpers/remar";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";

// Cuarto juego real. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida jugada con el dedo llega al ranking en
// metros.

test.setTimeout(240_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da"];

/** lo mismo que calcula el navegador, para comparar como texto */
function summary(seed: string) {
  const sober = soberTrace(seed);
  const drunk = drunkTrace(seed);
  const inputs = drunk.events.filter((e): e is InputEvent => !("fin" in e));
  const lazy = simulate(seed, [{ tick: 0, x: 45 }]);
  return JSON.stringify({
    course: generateCourse(seed),
    sober: { events: sober.events, score: sober.result.score, bottles: sober.result.bottles, endTick: sober.result.endTick, reason: sober.result.endReason },
    drunk: { events: drunk.events, score: drunk.result.score, bottles: drunk.result.bottles, endTick: drunk.result.endTick, reason: drunk.result.endReason },
    replay: simulate(seed, inputs).state,
    lazy: { score: lazy.score, endTick: lazy.endTick, reason: lazy.endReason, crash: lazy.state.crash },
  });
}

test("simulate da exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/remar-vuelve-a-casa?seed=abc");
  await expect(page.getByTestId("remar-card")).toBeVisible();
  await page.waitForFunction(() => "__remar" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate((s) => {
      type Trace = { events: unknown[]; result: { score: number; bottles: number; endTick: number; endReason: string | null } };
      type R = {
        generateCourse: (s: string) => unknown;
        soberTrace: (s: string) => Trace;
        drunkTrace: (s: string) => Trace;
        simulate: (s: string, i: unknown[]) => { score: number; endTick: number; endReason: string | null; state: { crash: unknown } };
      };
      const R = (window as unknown as { __remar: R }).__remar;
      const sober = R.soberTrace(s);
      const drunk = R.drunkTrace(s);
      const inputs = drunk.events.filter((e) => !("fin" in (e as object)));
      const lazy = R.simulate(s, [{ tick: 0, x: 45 }]);
      return JSON.stringify({
        course: R.generateCourse(s),
        sober: { events: sober.events, score: sober.result.score, bottles: sober.result.bottles, endTick: sober.result.endTick, reason: sober.result.endReason },
        drunk: { events: drunk.events, score: drunk.result.score, bottles: drunk.result.bottles, endTick: drunk.result.endTick, reason: drunk.result.endReason },
        replay: R.simulate(s, inputs).state,
        lazy: { score: lazy.score, endTick: lazy.endTick, reason: lazy.endReason, crash: lazy.state.crash },
      });
    }, seed);
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área de juego sin scroll y una partida con el dedo que esquiva las primeras filas", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/remar-vuelve-a-casa?seed=abc");
  const card = a.page.getByTestId("remar-card");
  await expect(card).toContainText("esquivá");
  await expect(card).toContainText("agarrá si te animás");
  await expect(card.getByRole("img", { name: "botella de whisky" })).toBeVisible();
  await expect(card.getByRole("img", { name: "tenedor" })).toBeVisible();
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("remar-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  // arrastrar no mueve la página
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("remar-bottles")).toHaveAttribute("aria-label", "0 botellas");

  await playRemar(a.page, "abc", 80);
  const score = Number(await a.page.getByTestId("game-score").textContent());
  expect(score).toBeGreaterThanOrEqual(80);
  await expect(a.page.getByTestId("remar-result")).toContainText("chocaste un cubierto");
  await expect(a.page.getByTestId("remar-result")).toHaveAttribute("data-reason", "choque");
  await a.context.close();
});

test("en la ronda real: la partida se valida en el servidor y llega al ranking en metros", async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Remera", "remar vuelve a casa");
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Quieto");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  // B juega sin moverse: tarde o temprano choca y termina solo
  await b.page.goto("/hoy/jugar");
  const seedB = await startAndGetSeed(b.page);
  await expect(b.page.getByTestId("remar-area")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 130_000 });
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  expect(seedB).toBeTruthy();
  const scoreB = Number(await b.page.getByTestId("game-score").textContent());
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);

  // A juega con el dedo 150 m; el cuerpo que manda /finish se rearma en Node
  await a.page.goto("/hoy/jugar");
  const seedA = await startAndGetSeed(a.page);
  const finished = a.page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"));
  await playRemar(a.page, seedA, 150);
  const body = (await finished).postDataJSON() as { score: number; events: TraceEvent[] };
  expect(validate(body, seedA)).toBe(true);
  expect(body.score).toBeGreaterThanOrEqual(150);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  await expect(a.page.getByTestId("game-score")).toHaveText(String(body.score));
  await a.page.getByTestId("game-done").click();

  // en el ranking, los metros con su unidad; A primera si remó más que B
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(2);
  await expect(a.page.getByTestId("ranking-value").first()).toContainText("m");
  if (body.score > scoreB) {
    const first = a.page.getByTestId("ranking-row").first();
    await expect(first).toContainText("Remera");
    await expect(first).toContainText("+10");
    await expect(a.page.getByTestId("ranking-value").first()).toHaveText(new RegExp(`^\\s*${body.score}\\s*m\\s*$`));
  }
  await expect(a.page.getByTestId("attempts-left")).toContainText(`tu mejor: ${body.score} m`);

  // y B, sin tocar nada, ve aparecer a A
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(2, { timeout: 30_000 });
  await a.context.close();
  await b.context.close();
});
