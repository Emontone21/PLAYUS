import { test, expect, type Browser } from "@playwright/test";
import { botTrace, check, MODEL, neededTurns, pipePuzzles, puzzleAt } from "../src/games/dale-un-trago-al-pibe/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { playTrago, snapOf, tapCell, tapDamajuana, waitPuzzle } from "./helpers/trago";

// Juego nuevo, el primero con semilla por jugador. Los puzzles del navegador y
// los de Node tienen que ser exactamente los mismos; dos jugadores del mismo
// grupo reciben semillas y puzzles distintos; una partida que resuelve dos
// puzzles con los giros calculados en el test y deja derramar el tercero
// llega al ranking con el puntaje correcto.

test.setTimeout(400_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "semilla-9"];

function summary(seed: string) {
  const a = botTrace(seed, MODEL);
  return JSON.stringify({ puzzles: pipePuzzles(seed, 6), needed: neededTurns(puzzleAt(seed, 8)), events: a.events, score: a.run.score, solved: a.run.solvedCount });
}

test("los puzzles, los giros necesarios y la partida del modelo dan exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/dale-un-trago-al-pibe?seed=abc");
  await expect(page.getByTestId("trago-card")).toBeVisible();
  await page.waitForFunction(() => "__trago" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate((s) => {
      type R = {
        pipePuzzles: (s: string, n: number) => unknown;
        puzzleAt: (s: string, n: number) => unknown;
        neededTurns: (p: unknown) => unknown;
        botTrace: (s: string, o: unknown) => { events: unknown[]; run: { score: number; solvedCount: number } };
        MODEL: unknown;
      };
      const R = (window as unknown as { __trago: R }).__trago;
      const a = R.botTrace(s, R.MODEL);
      return JSON.stringify({ puzzles: R.pipePuzzles(s, 6), needed: R.neededTurns(R.puzzleAt(s, 8)), events: a.events, score: a.run.score, solved: a.run.solvedCount });
    }, seed);
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, la herramienta, el área, un caño que gira al toque y una ficha con vino que ya no gira", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/dale-un-trago-al-pibe?seed=abc&solucion=1");
  const card = a.page.getByTestId("trago-card");
  await expect(card).toContainText("Vinaken del pari");
  await expect(card.getByRole("img", { name: /la damajuana/ })).toBeVisible();
  await expect(card.getByRole("img", { name: /un caño de ejemplo/ })).toBeVisible();
  await expect(card.getByRole("img", { name: /el pibe esperando/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-sprites").getByRole("img")).toHaveCount(5);
  await expect(a.page.getByTestId("dev-metrics")).toContainText("4 × 5");
  await a.page.getByTestId("dev-distribution-run").click();
  await expect(a.page.getByTestId("dev-distribution")).toContainText("7–9");
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("trago-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const field = a.page.getByTestId("trago-field");
  expect(await field.evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");
  expect(await field.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("trago-score")).toHaveText("0");
  await expect(a.page.getByTestId("trago-puzzle")).toHaveText("puzzle 1");
  await waitPuzzle(a.page, 1);
  // un giro por toque: con los giros justos, la grilla queda resuelta
  const p = puzzleAt("abc", 1);
  for (const { cell, turns } of neededTurns(p)) {
    for (let k = 0; k < turns; k++) {
      await tapCell(a.page, "abc", 1, cell);
      await a.page.waitForTimeout(90);
    }
  }
  await expect(area).toHaveAttribute("data-solved", "1");
  // la damajuana larga el vino: la entrada se moja y ya no gira (el estado sigue resuelto), y el puzzle se resuelve con bonus
  await tapDamajuana(a.page, "abc", 1);
  await expect(area).toHaveAttribute("data-phase", "flowing");
  await tapCell(a.page, "abc", 1, p.inCol);
  await expect(area).toHaveAttribute("data-solved", "1");
  await expect(area).toHaveAttribute("data-phase", "drinking", { timeout: 10_000 });
  await expect(a.page.getByTestId("trago-gain")).toContainText("+100");
  await expect(a.page.getByTestId("trago-gain")).toContainText("de bonus");
  const snap = await snapOf(a.page);
  expect(snap!.score).toBeGreaterThan(100);
  await a.context.close();
});

test("en la ronda real: dos jugadores del mismo grupo reciben puzzles distintos, y una partida que resuelve dos y deja derramar el tercero llega al ranking", async ({ browser }) => {
  const a = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Vale", "Dale un trago al pibe");
  const b = await freshPage(browser);
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Nico");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  await a.page.goto("/hoy/jugar");
  const seedA = await startAndGetSeed(a.page);
  await b.page.goto("/hoy/jugar");
  const seedB = await startAndGetSeed(b.page);
  expect(seedB).not.toBe(seedA);
  expect(JSON.stringify(puzzleAt(seedB, 1))).not.toBe(JSON.stringify(puzzleAt(seedA, 1)));
  await expect(b.page.getByTestId("trago-area")).toBeVisible({ timeout: 15_000 });

  const played = await playTrago(a.page, seedA, 2);
  expect(played.score).toBeGreaterThanOrEqual(200);
  expect(played.sentScore).toBe(played.score);
  await expect(a.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(a.page.getByTestId("game-score")).toHaveText(String(played.score));
  await expect(a.page.getByTestId("trago-result")).toContainText("2 puzzles resueltos");
  const v = check(seedA, played.events);
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (v.ok) expect(v.score).toBe(played.score);
  // la misma traza con la semilla del otro jugador no vale
  const other = check(seedB, played.events);
  expect(other.ok && other.score === played.score).toBe(false);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  await a.page.getByTestId("game-done").click();
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(a.page.getByTestId("ranking-value").first()).toContainText(String(played.score));
  await a.context.close();
  await b.context.close();
});
