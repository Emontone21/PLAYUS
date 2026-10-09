import { test, expect, type Browser } from "@playwright/test";
import { botTrace, candombeRounds, check, MODEL } from "../src/games/barakatututu/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { calibrate, hit, playBaraka, playRound, snapOf } from "./helpers/baraka";

// Juego nuevo. Los patrones y la partida del modelo tienen que dar
// exactamente lo mismo en el navegador y en Node; una partida que pasa tres
// rondas con los toques calculados en el test y erra la cuarta llega al
// ranking con puntaje 3.

test.setTimeout(400_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "semilla-9"];

function summary(seed: string) {
  const a = botTrace(seed, MODEL);
  return JSON.stringify({ rounds: candombeRounds(seed, 15), events: a.events, score: a.run.score, correction: a.run.correction });
}

test("los patrones y la partida del modelo dan exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/barakatututu?seed=abc");
  await expect(page.getByTestId("baraka-card")).toBeVisible();
  await page.waitForFunction(() => "__baraka" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate((s) => {
      type R = { candombeRounds: (s: string, n: number) => unknown; botTrace: (s: string, o: unknown) => { events: unknown[]; run: { score: number; correction: number } }; MODEL: object };
      const R = (window as unknown as { __baraka: R }).__baraka;
      const a = R.botTrace(s, R.MODEL);
      return JSON.stringify({ rounds: R.candombeRounds(s, 15), events: a.events, score: a.run.score, correction: a.run.correction });
    }, seed);
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, la herramienta, el área, la cuenta de ajuste con la barra espaciadora y un toque fuera de turno que se ignora", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/barakatututu?seed=abc&cajas=1");
  const card = a.page.getByTestId("baraka-card");
  await expect(card.getByRole("img", { name: /El negro toto con su tambor/ })).toBeVisible();
  await expect(card.getByRole("img", { name: /la regla del compás/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-sprites").getByRole("img")).toHaveCount(4);
  await expect(a.page.getByTestId("dev-library")).toContainText("simplificaciones inspiradas");
  await expect(a.page.getByTestId("dev-rounds")).toContainText("95");
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("baraka-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const field = a.page.getByTestId("baraka-field");
  expect(await field.evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");
  expect(await field.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("baraka-round")).toHaveText("ajuste");
  await expect(a.page.getByTestId("baraka-say")).toContainText("ayudame con los toques");
  await expect(a.page.getByTestId("baraka-count")).toBeVisible();
  // la barra espaciadora cuenta como golpe (y no repite si se mantiene)
  await a.page.keyboard.press("Space");
  await expect(area).toHaveAttribute("data-taps", "1");
  await a.page.keyboard.down("Space");
  await a.page.waitForTimeout(700);
  await a.page.keyboard.up("Space");
  await expect(area).toHaveAttribute("data-taps", "2");
  await hit(a.page);
  await hit(a.page);
  await expect(area).toHaveAttribute("data-taps", "4");
  // mientras toca El negro toto, los toques se ignoran
  await expect(area).toHaveAttribute("data-phase", "listen", { timeout: 10_000 });
  await expect(a.page.getByTestId("baraka-round")).toHaveText("ronda 1");
  await hit(a.page);
  await expect(area).toHaveAttribute("data-phase", "listen");
  const s = await snapOf(a.page);
  expect(s!.score).toBe(0);
  await a.context.close();
});

test("en la ronda real: pasa tres rondas con los toques del test, erra la cuarta y llega al ranking con puntaje 3", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "Toto", "Barakatututu");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  const played = await playBaraka(b.page, seed, 3);
  expect(played.score).toBe(3);
  expect(played.sentScore).toBe(3);
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-score")).toHaveText("3");
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (v.ok) {
    expect(v.score).toBe(3);
    expect(v.run.fail).not.toBeNull();
  }
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText("3");
  void calibrate;
  void playRound;
  await b.context.close();
});
