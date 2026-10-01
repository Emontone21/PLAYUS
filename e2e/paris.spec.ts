import { test, expect, type Browser } from "@playwright/test";
import { memoBoards } from "../src/games/busca-los-paris/boards";
import { validate, type FlipEvent } from "../src/games/busca-los-paris/rules";
import { playParis } from "./helpers/paris";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";

// Décimo juego real. Una partida que completa el primer tablero con las
// posiciones de memoBoards (explorando antes cada carta) llega al ranking
// con el puntaje correcto.

test.setTimeout(300_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("la pantalla previa, los tableros del navegador y de Node, y el primer tablero completo", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/busca-los-paris?seed=abc");
  const card = a.page.getByTestId("paris-card");
  await expect(card).toContainText("dos tapadas y un par descubierto");
  await a.page.waitForFunction(() => "__paris" in window);
  // los tableros del navegador son los de Node
  for (const seed of ["abc", "reporte", "intento-1"]) {
    const inBrowser = await a.page.evaluate((s) => JSON.stringify((window as unknown as { __paris: { memoBoards: (s: string) => unknown } }).__paris.memoBoards(s)), seed);
    expect(inBrowser).toBe(JSON.stringify(memoBoards(seed)));
  }
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("paris-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  // el tablero de 2 × 3 con cartas de 64 px o más
  const box = (await a.page.getByTestId("card-0").boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(64);
  const pairs = await playParis(a.page, "abc");
  expect(pairs).toBe(3);
  await expect(a.page.getByTestId("paris-pairs")).toContainText("3 pares");
  await expect(a.page.getByTestId("paris-board")).toContainText("tablero 2");
  await a.context.close();
});

test("en la ronda real: la partida se valida en el servidor y llega al ranking con los pares", async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Paris", "buscá los Paris");
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Memo");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  // A completa el primer tablero y espera a que corte el cronómetro (60 s); el cuerpo que manda /finish se rearma en Node
  await a.page.goto("/hoy/jugar");
  const seedA = await startAndGetSeed(a.page);
  const finished = a.page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 90_000 });
  const pairs = await playParis(a.page, seedA);
  const body = (await finished).postDataJSON() as { score: number; events: FlipEvent[] };
  expect(body.score).toBe(pairs);
  expect(validate(body, seedA)).toBe(true);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado", { timeout: 90_000 });
  await a.page.getByTestId("game-done").click();
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(a.page.getByTestId("ranking-value").first()).toHaveText(new RegExp(`^\\s*${pairs}\\s*$`));

  // B no toca nada: 0 pares y queda detrás
  await b.page.goto("/hoy/jugar");
  await startAndGetSeed(b.page);
  await expect(b.page.getByTestId("paris-area")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 90_000 });
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(2);
  await expect(b.page.getByTestId("ranking-row").first()).toContainText("Paris");
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(2, { timeout: 30_000 });
  await a.context.close();
  await b.context.close();
});
