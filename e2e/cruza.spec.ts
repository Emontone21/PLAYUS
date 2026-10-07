import { test, expect, type Browser } from "@playwright/test";
import { botTrace, check, createCourse, nextSidewalk, occupancyMask, solveBlock, type HopEvent } from "../src/games/cruza-con-el-chino/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { E2E_PLAN, gesture, playCruza, snapOf } from "./helpers/cruza";

// Juego nuevo. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo (curso, buscador, partidas); una partida que cruza los
// primeros bloques con los saltos del buscador y después se deja atropellar
// llega al ranking con los carriles correctos.

test.setTimeout(400_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da", "semilla-9"];

function summary(seed: string) {
  const course = createCourse(seed);
  nextSidewalk(course, 40);
  const lanes = course.lanes.slice(0, 40).map((l) => (l.kind === "road" ? [l.dir, l.speed, l.vehicle, l.len, l.period, l.offsets, l.phase, l.look] : l.kind === "rail" ? [l.period, l.phase] : [l.sign, l.deco]));
  const masks = course.lanes.slice(0, 12).map((l) => [0, 97, 500].map((t) => occupancyMask(l, t)));
  const path = solveBlock(course, 0, nextSidewalk(course, 0), 0);
  const a = botTrace(seed, { reaction: 12, pause: 30, hopGap: 12, untilTick: 2400 });
  return JSON.stringify({ lanes, masks, path, events: a.events, rows: a.result.rows, crashed: a.result.crashed });
}

test("el curso, el buscador y la simulación dan exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/cruza-con-el-chino?seed=abc");
  await expect(page.getByTestId("cruza-card")).toBeVisible();
  await page.waitForFunction(() => "__cruza" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate((s) => {
      type Lane = { kind: string; dir?: number; speed?: number; vehicle?: string; len?: number; period?: number; offsets?: number[]; phase?: number; look?: number; sign?: number | null; deco?: unknown };
      type R = {
        createCourse: (s: string) => { lanes: Lane[] };
        nextSidewalk: (c: unknown, row: number) => number;
        occupancyMask: (l: Lane, t: number) => number;
        solveBlock: (c: unknown, from: number, to: number, t0: number) => unknown;
        botTrace: (s: string, o: unknown) => { events: unknown[]; result: { rows: number; crashed: boolean } };
      };
      const R = (window as unknown as { __cruza: R }).__cruza;
      const course = R.createCourse(s);
      R.nextSidewalk(course, 40);
      const lanes = course.lanes.slice(0, 40).map((l) => (l.kind === "road" ? [l.dir, l.speed, l.vehicle, l.len, l.period, l.offsets, l.phase, l.look] : l.kind === "rail" ? [l.period, l.phase] : [l.sign, l.deco]));
      const masks = course.lanes.slice(0, 12).map((l) => [0, 97, 500].map((t) => R.occupancyMask(l, t)));
      const path = R.solveBlock(course, 0, R.nextSidewalk(course, 0), 0);
      const a = R.botTrace(s, { reaction: 12, pause: 30, hopGap: 12, untilTick: 2400 });
      return JSON.stringify({ lanes, masks, path, events: a.events, rows: a.result.rows, crashed: a.result.crashed });
    }, seed);
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área, la herramienta, un toque que avanza, un deslizamiento de costado y uno vertical que no hace nada", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/cruza-con-el-chino?seed=abc&cajas=1&camino=1");
  const card = a.page.getByTestId("cruza-card");
  await expect(card).toContainText("tocá: salta adelante");
  await expect(card.getByRole("img", { name: /El chino/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-sprites").getByRole("img")).toHaveCount(14);
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("cruza-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const field = a.page.getByTestId("cruza-field");
  expect(await field.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await field.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("cruza-rows")).toHaveText("0");
  // en la vereda del arranque: un deslizamiento vertical no hace nada
  const box = (await a.page.getByTestId("cruza-canvas").boundingBox())!;
  await a.page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
  await a.page.mouse.down();
  await a.page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height * 0.6 - 60, { steps: 3 });
  await a.page.mouse.up();
  await a.page.waitForTimeout(300);
  expect((await snapOf(a.page))?.row).toBe(0);
  expect((await snapOf(a.page))?.col).toBe(4);
  // deslizar a la derecha: una columna
  await gesture(a.page, "right");
  await expect.poll(async () => (await snapOf(a.page))?.col, { timeout: 3_000 }).toBe(5);
  await gesture(a.page, "left");
  await expect.poll(async () => (await snapOf(a.page))?.col, { timeout: 3_000 }).toBe(4);
  // un toque: adelante, y el contador suma
  await gesture(a.page, "up");
  await expect.poll(async () => (await snapOf(a.page))?.row, { timeout: 3_000 }).toBe(1);
  await expect(a.page.getByTestId("cruza-rows")).toHaveText("1");
  await a.context.close();
});

test("en la ronda real: cruza los dos primeros bloques con los saltos del buscador, se queda en una calle hasta que lo atropellan y llega al ranking con los carriles", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "Rana", "Cruza con el chino");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  const played = await playCruza(b.page, seed, 2);
  const planned = botTrace(seed, { blocks: 2, ...E2E_PLAN });
  expect(played.rows).toBe(planned.result.rows);
  expect(played.rows).toBeGreaterThanOrEqual(3);
  expect(played.sentScore).toBe(played.rows);
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-score")).toHaveText(String(played.rows));
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (v.ok) {
    expect(v.rows).toBe(played.rows);
    expect(v.crashed).toBe(true);
  }
  const hops = played.events.filter((e) => !("fin" in (e as object))) as HopEvent[];
  expect(hops.length).toBeGreaterThanOrEqual(3);
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText(`${played.rows}`);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText("carriles");
  expect(await snapOf(b.page)).toBeNull();
  await b.context.close();
});
