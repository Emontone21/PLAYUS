import { test, expect, type Browser } from "@playwright/test";
import { botTrace, check, MODEL, parkingPuzzles, puzzleAt, solve } from "../src/games/saca-el-sunny/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { dragCar, playSacaSunny, snapOf, waitPuzzle } from "./helpers/saca-sunny";

// Juego nuevo con semilla por jugador. Los estacionamientos y el resolvedor
// del navegador tienen que dar exactamente lo mismo que en Node; dos jugadores
// del mismo grupo reciben estacionamientos distintos; una partida que resuelve
// dos con la solución del resolvedor llega al ranking con 300 puntos.

test.setTimeout(400_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "semilla-9"];

function summary(seed: string) {
  const puzzles = parkingPuzzles(seed, 4);
  const a = botTrace(seed, { ...MODEL, solveOnly: 3 });
  return JSON.stringify({ puzzles, path: solve(puzzles[2]!.cars, puzzles[2]!.start), events: a.events, score: a.run.score });
}

test("los estacionamientos, el resolvedor y la partida del modelo dan exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/saca-el-sunny?seed=abc");
  await expect(page.getByTestId("saca-card")).toBeVisible();
  await page.waitForFunction(() => "__saca" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate((s) => {
      type P = { cars: unknown[]; start: number[] };
      type R = {
        parkingPuzzles: (s: string, n: number) => P[];
        solve: (cars: unknown[], start: number[]) => unknown;
        botTrace: (s: string, o: unknown) => { events: unknown[]; run: { score: number } };
        MODEL: object;
      };
      const R = (window as unknown as { __saca: R }).__saca;
      const puzzles = R.parkingPuzzles(s, 4);
      const a = R.botTrace(s, { ...R.MODEL, solveOnly: 3 });
      return JSON.stringify({ puzzles, path: R.solve(puzzles[2]!.cars, puzzles[2]!.start), events: a.events, score: a.run.score });
    }, seed);
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, la herramienta, el área, un auto que se desliza (y no de costado) y empezar de nuevo", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/saca-el-sunny?seed=abc&solucion=1");
  const card = a.page.getByTestId("saca-card");
  await expect(card.getByRole("img", { name: /el sunny rojo trabado/ })).toBeVisible();
  await expect(card.getByRole("img", { name: /el neón de la hdp/ })).toBeVisible();
  await expect(card).toContainText("cierra en 2:00");
  await expect(a.page.getByTestId("dev-metrics")).toContainText("4–6");
  await expect(a.page.getByTestId("dev-solution")).toContainText("movimientos");
  await a.page.getByTestId("dev-distribution-run").click();
  await expect(a.page.getByTestId("dev-distribution")).toContainText("16–22", { timeout: 60_000 });
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("saca-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const field = a.page.getByTestId("saca-field");
  expect(await field.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await field.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("saca-score")).toHaveText("0");
  await expect(a.page.getByTestId("saca-solved")).toHaveText("0 sacados");
  await waitPuzzle(a.page, 1);
  const p = puzzleAt("abc", 1);
  const first = solve(p.cars, p.start)!.path[0]!;
  // de costado no pasa nada
  await dragCar(a.page, "abc", 1, first.car, 2, true);
  await a.page.waitForTimeout(200);
  expect((await snapOf(a.page))!.moves).toBe(0);
  // sobre su eje, el primer movimiento de la solución
  await dragCar(a.page, "abc", 1, first.car, first.delta);
  await expect(area).toHaveAttribute("data-moves", "1");
  await expect(a.page.getByTestId("saca-moves")).toContainText("1 movimiento");
  // empezar de nuevo
  await a.page.getByTestId("saca-reset").click();
  await expect(area).toHaveAttribute("data-moves", "0");
  expect((await snapOf(a.page))!.pos).toEqual(p.start);
  await a.context.close();
});

test("en la ronda real: dos jugadores del mismo grupo reciben estacionamientos distintos, y una partida que resuelve dos con el resolvedor llega al ranking con 300 puntos", async ({ browser }) => {
  const a = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Vale", "Saca el Sunny");
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
  await expect(b.page.getByTestId("saca-area")).toBeVisible({ timeout: 15_000 });
  await b.context.close();

  const played = await playSacaSunny(a.page, seedA, 2);
  expect(played.score).toBe(300);
  expect(played.sentScore).toBe(300);
  await expect(a.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(a.page.getByTestId("game-score")).toHaveText("300");
  await expect(a.page.getByTestId("saca-result")).toContainText("2 sunnys sacados");
  const v = check(seedA, played.events);
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (v.ok) expect(v.score).toBe(300);
  const other = check(seedB, played.events);
  expect(other.ok && other.score === 300).toBe(false);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  await a.page.getByTestId("game-done").click();
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(a.page.getByTestId("ranking-value").first()).toContainText("300");
  await a.context.close();
});
