import { test, expect, type Browser } from "@playwright/test";
import { botTrace, check, simulate, type TapEvent } from "../src/games/la-mayo/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { playMayo } from "./helpers/mayo";

// Juego nuevo. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida que emboca tres veces (con los ticks
// calculados en el test) y después erra tres llega al ranking con 3.

test.setTimeout(300_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da", "semilla-9"];
const BOT = { jitterTicks: 3, every: 2 };

function summary(seed: string) {
  const a = botTrace(seed, BOT);
  const taps = a.events.filter((e): e is TapEvent => !("fin" in e));
  const r = simulate(seed, taps, a.result.endTick + 1);
  return JSON.stringify({ events: a.events, score: a.result.score, lives: a.result.lives, endTick: a.result.endTick, pos: r.state.pos, speed: r.state.speed, variation: r.state.variation });
}

test("la simulación da exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/la-mayo?seed=abc");
  await expect(page.getByTestId("mayo-card")).toBeVisible();
  await page.waitForFunction(() => "__mayo" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate(
      ([s, bot]) => {
        type Ev = { tick: number; fin?: true };
        type St = { pos: number; speed: number; variation: number };
        type R = {
          botTrace: (s: string, o: unknown) => { events: Ev[]; result: { score: number; lives: number; endTick: number } };
          simulate: (s: string, t: Ev[], until: number) => { state: St };
        };
        const R = (window as unknown as { __mayo: R }).__mayo;
        const a = R.botTrace(s, bot);
        const taps = a.events.filter((e) => !("fin" in e));
        const r = R.simulate(s, taps, a.result.endTick + 1);
        return JSON.stringify({ events: a.events, score: a.result.score, lives: a.result.lives, endTick: a.result.endTick, pos: r.state.pos, speed: r.state.speed, variation: r.state.variation });
      },
      [seed, BOT] as const,
    );
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área, las caras en la herramienta y la barra espaciadora sin repetir", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/la-mayo?seed=abc");
  const card = a.page.getByTestId("mayo-card");
  await expect(card).toContainText("punto justo");
  await expect(card.getByRole("img", { name: /Remar a la mesa/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-faces").getByRole("img")).toHaveCount(3);
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("mayo-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("mayo-score")).toContainText("0 embocadas");
  await expect(a.page.getByTestId("mayo-lives")).toHaveAttribute("data-lives", "3");
  // la barra espaciadora mantenida no repite: un solo toque cuenta
  await a.page.keyboard.down("Space");
  await a.page.waitForTimeout(300);
  await a.page.keyboard.up("Space");
  await expect.poll(async () => Number(await area.getAttribute("data-score")) + (3 - Number(await area.getAttribute("data-lives")))).toBe(1);
  await a.context.close();
});

test("en la ronda real: tres embocadas (con los ticks calculados en el test) y tres errores llegan al ranking con 3", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "Remar", "la mayo");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  const played = await playMayo(b.page, 3);
  expect(played.score).toBe(3);
  expect(played.lives).toBe(0);
  expect(played.end).toBe("vidas");
  expect(played.sentScore).toBe(3);
  expect(played.say).toContain("no seas sopa");
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("mayo-result")).toContainText("no seas sopa");
  await expect(b.page.getByTestId("game-score")).toHaveText("3");
  await expect(b.page.getByTestId("mayo-result")).toHaveAttribute("data-reason", "vidas");
  // la traza que mandó se rearma en Node con el mismo puntaje, y el servidor la aceptó
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (v.ok) expect(v.score).toBe(3);
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText("3");
  await b.context.close();
});
