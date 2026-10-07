import { test, expect, type Browser } from "@playwright/test";
import { botTrace, check, finalPos, jotaShuffles, MODEL } from "../src/games/la-bolsita-del-jota/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { playBolsita, waitPick } from "./helpers/bolsita";

// Juego nuevo. Las mezclas del navegador y las de Node son las mismas; una
// partida que acierta tres rondas y erra la cuarta llega al ranking con 3.

test.setTimeout(300_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da", "semilla-9"];

test("las mezclas y la partida dan exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/la-bolsita-del-jota?seed=abc");
  await expect(page.getByTestId("bolsita-card")).toBeVisible();
  await page.waitForFunction(() => "__bolsita" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate(
      ([s, model]) => {
        type R = {
          jotaShuffles: (s: string) => unknown[];
          finalPos: (x: unknown) => number;
          botTrace: (s: string, o: unknown) => { events: unknown[]; run: { score: number; index: number } };
        };
        const R = (window as unknown as { __bolsita: R }).__bolsita;
        const sh = R.jotaShuffles(s);
        const b = R.botTrace(s, model);
        return JSON.stringify({ sh, finals: sh.map((x) => R.finalPos(x)), events: b.events, score: b.run.score, index: b.run.index });
      },
      [seed, MODEL] as const,
    );
    const sh = jotaShuffles(seed);
    const b = botTrace(seed, MODEL);
    expect(inBrowser, `semilla ${seed}`).toBe(JSON.stringify({ sh, finals: sh.map(finalPos), events: b.events, score: b.run.score, index: b.run.index }));
  }
});

test("la previa, las caras, el área, y los toques durante la mezcla se ignoran", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/la-bolsita-del-jota?seed=abc");
  const card = a.page.getByTestId("bolsita-card");
  await expect(card).toContainText("si adivinás, es tuya");
  await expect(card.getByRole("img", { name: /jota/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-faces").getByRole("img")).toHaveCount(5);
  await expect(a.page.getByTestId("dev-round")).toHaveCount(40);
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("bolsita-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const field = a.page.getByTestId("bolsita-field");
  expect(await field.evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");
  expect(await field.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  // un toque mientras muestra o mezcla no cuenta
  await field.click({ position: { x: 20, y: 200 } });
  await expect(area).toHaveAttribute("data-score", "0");
  await waitPick(a.page, 1);
  await expect(area).toHaveAttribute("data-round", "1");
  // tocar la columna del vaso que tiene la bolsita: acierta
  const answer = finalPos(jotaShuffles("abc")[0]!);
  const box = (await field.boundingBox())!;
  await a.page.mouse.click(box.x + box.width * ((answer + 0.5) / 3), box.y + box.height * 0.9);
  await expect(area).toHaveAttribute("data-score", "1");
  await expect(a.page.getByTestId("bolsita-say")).toHaveText("tomá, bro, es tuya");
  await expect(a.page.getByTestId("bolsita-score")).toHaveText("1");
  await a.context.close();
});

test("en la ronda real: acierta tres, erra la cuarta y llega al ranking con 3", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "Vasos", "la bolsita del jota");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  const played = await playBolsita(b.page, seed, 4);
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v).slice(0, 300)).toBe(true);
  if (!v.ok) return;
  expect(v.score).toBe(3);
  expect(v.lost).toBe(true);
  expect(played.sentScore).toBe(3);
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-score")).toHaveText("3");
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText("3");
  await b.context.close();
});
