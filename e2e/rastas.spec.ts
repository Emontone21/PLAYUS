import { test, expect, type Browser } from "@playwright/test";
import { greedyTrace, simulate, validate, type TraceEvent, type TurnEvent } from "../src/games/rastitas-rastotas/rules";
import { playRastas } from "./helpers/rastas";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";

// Octavo juego real. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida que come los primeros cigarros con la ruta
// calculada en el test y después choca llega al ranking con los puntos.

test.setTimeout(300_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da"];

function summary(seed: string) {
  const g = greedyTrace(seed);
  const turns = g.events.filter((e): e is TurnEvent => !("fin" in e));
  const replay = simulate(seed, turns).state;
  const lazy = simulate(seed, []);
  return JSON.stringify({
    greedy: { events: g.events, score: g.result.score, cigs: g.result.cigs, endTick: g.result.endTick, reason: g.result.endReason },
    replay: { body: replay.body, blocked: [...replay.blocked], warned: [...replay.warned], cig: replay.cig, score: replay.score },
    lazy: { score: lazy.score, endTick: lazy.endTick, reason: lazy.endReason, cig: lazy.state.cig },
  });
}

test("simulate da exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/rastitas-rastotas?seed=abc");
  await expect(page.getByTestId("rastas-card")).toBeVisible();
  await page.waitForFunction(() => "__rastas" in window);
  // la vista de rastas largas de la herramienta
  await expect(page.getByTestId("rastas-vista")).toBeVisible();
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate((s) => {
      type Trace = { events: Array<{ tick: number; fin?: true }>; result: { score: number; cigs: number; endTick: number; endReason: string | null } };
      type St = { body: number[]; blocked: Set<number>; warned: Map<number, number>; cig: number; score: number };
      type R = { greedyTrace: (s: string) => Trace; simulate: (s: string, t: unknown[]) => { score: number; endTick: number; endReason: string | null; state: St } };
      const R = (window as unknown as { __rastas: R }).__rastas;
      const g = R.greedyTrace(s);
      const turns = g.events.filter((e) => !("fin" in e));
      const replay = R.simulate(s, turns).state;
      const lazy = R.simulate(s, []);
      return JSON.stringify({
        greedy: { events: g.events, score: g.result.score, cigs: g.result.cigs, endTick: g.result.endTick, reason: g.result.endReason },
        replay: { body: replay.body, blocked: [...replay.blocked], warned: [...replay.warned], cig: replay.cig, score: replay.score },
        lazy: { score: lazy.score, endTick: lazy.endTick, reason: lazy.endReason, cig: lazy.state.cig },
      });
    }, seed);
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área sin scroll, deslizar y una partida que come tres cigarros y choca", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/rastitas-rastotas?seed=abc");
  const card = a.page.getByTestId("rastas-card");
  await expect(card).toContainText("+1 y una rasta más");
  await expect(card).toContainText("más rápido y ×2");
  await expect(card).toContainText("no pises");
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("rastas-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  // un deslizamiento con el mouse apretado cambia la dirección
  const canvas = a.page.getByRole("img", { name: "la grilla, la cabeza con rastas y lo que hay en el colchón" });
  const box = (await canvas.boundingBox())!;
  await a.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 });
  await a.page.mouse.up();
  await expect(area).toHaveAttribute("data-dir", "right", { timeout: 2_000 });
  await a.context.close();

  const b = await freshPage(browser);
  await b.page.goto("/dev/juego/rastitas-rastotas?seed=abc");
  await b.page.getByTestId("game-play").click();
  const score = await playRastas(b.page, "abc", 3);
  expect(score).toBeGreaterThanOrEqual(3);
  await expect(b.page.getByTestId("game-score")).toHaveText(String(score));
  await expect(b.page.getByTestId("rastas-result")).toHaveAttribute("data-reason", /borde|rastas|piojos/);
  await b.context.close();
});

test("en la ronda real: la partida se valida en el servidor y llega al ranking con los puntos", async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Rasta", "rastitas rastotas");
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Piojo");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  // A come cuatro cigarros con la ruta de Node y después choca; el cuerpo que manda /finish se rearma en Node
  await a.page.goto("/hoy/jugar");
  const seedA = await startAndGetSeed(a.page);
  const finished = a.page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"));
  const score = await playRastas(a.page, seedA, 4);
  const body = (await finished).postDataJSON() as { score: number; events: TraceEvent[] };
  expect(body.score).toBe(score);
  expect(body.score).toBeGreaterThanOrEqual(4);
  expect(validate(body, seedA)).toBe(true);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  await a.page.getByTestId("game-done").click();
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(a.page.getByTestId("ranking-value").first()).toHaveText(new RegExp(`^\\s*${body.score}\\s*$`));

  // B no gira: choca el borde con 0 y queda detrás
  await b.page.goto("/hoy/jugar");
  await startAndGetSeed(b.page);
  await expect(b.page.getByTestId("rastas-area")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 60_000 });
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(2);
  await expect(b.page.getByTestId("ranking-row").first()).toContainText("Rasta");
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(2, { timeout: 30_000 });
  await a.context.close();
  await b.context.close();
});
