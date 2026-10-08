import { test, expect, type Browser } from "@playwright/test";
import { botTrace, check, generateCourse, hasFreeMoment, lickBlocked, posAt, type LickEvent } from "../src/games/la-rana-caza-colillas/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { lickAt, playRana, snapOf } from "./helpers/rana";

// Juego nuevo. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida que come las primeras colillas con los
// toques calculados en el test y después agarra un vapeador llega al ranking
// con el puntaje correcto.

test.setTimeout(400_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da", "semilla-9"];
const MODEL = { reaction: 21, lead: false, aimError: 160, pause: 18 };

function summary(seed: string) {
  const course = generateCourse(seed);
  const things = course.things.slice(0, 20);
  const pos = things.map((th) => [0, 40, 200].map((tq) => posAt(th, tq)));
  const free = things.filter((th) => th.kind === "colilla").map((th) => hasFreeMoment(th, course.things));
  const blocked = [0, 600, 1800, 3000].map((t) => lickBlocked(course.things, { x: 2048, y: 400 }, t));
  const a = botTrace(seed, MODEL);
  return JSON.stringify({ things, pos, free, blocked, events: a.events, score: a.result.score, crashed: a.result.crashed });
}

test("la generación, la geometría y la simulación dan exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/la-rana-caza-colillas?seed=abc");
  await expect(page.getByTestId("rana-card")).toBeVisible();
  await page.waitForFunction(() => "__rana" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate(
      ([s, model]) => {
        type Thing = { kind: string };
        type R = {
          generateCourse: (s: string) => { things: Thing[] };
          posAt: (th: Thing, tq: number) => unknown;
          hasFreeMoment: (th: Thing, all: Thing[]) => boolean;
          lickBlocked: (all: Thing[], p: unknown, t: number) => boolean;
          botTrace: (s: string, o: unknown) => { events: unknown[]; result: { score: number; crashed: boolean } };
        };
        const R = (window as unknown as { __rana: R }).__rana;
        const course = R.generateCourse(s);
        const things = course.things.slice(0, 20);
        const pos = things.map((th) => [0, 40, 200].map((tq) => R.posAt(th, tq)));
        const free = things.filter((th) => th.kind === "colilla").map((th) => R.hasFreeMoment(th, course.things));
        const blocked = [0, 600, 1800, 3000].map((t) => R.lickBlocked(course.things, { x: 2048, y: 400 }, t));
        const a = R.botTrace(s, model);
        return JSON.stringify({ things, pos, free, blocked, events: a.events, score: a.result.score, crashed: a.result.crashed });
      },
      [seed, MODEL] as const,
    );
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área, la herramienta, una lengua que no agarra nada y una que come", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/la-rana-caza-colillas?seed=abc&cajas=1");
  const card = a.page.getByTestId("rana-card");
  await expect(card).toContainText("comé");
  await expect(card).toContainText("ni loco");
  await expect(card.getByRole("img", { name: /la rana de Frog/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-sprites").getByRole("img")).toHaveCount(8);
  await expect(a.page.getByTestId("dev-course")).toContainText("colillas");
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("rana-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const field = a.page.getByTestId("rana-field");
  expect(await field.evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");
  expect(await field.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("rana-score")).toHaveText("0");
  // la lengua sale al tocar, aunque no haya nada ahí, y vuelve sola (una ida corta dura 100 ms: se mira el contador de lengüetazos, no la lengua)
  await lickAt(a.page, { x: 2048, y: 2048 + 600 });
  await expect.poll(async () => (await snapOf(a.page))?.licks, { timeout: 2_000 }).toBe(1);
  await expect.poll(async () => (await snapOf(a.page))?.tongue, { timeout: 2_000 }).toBe(false);
  await expect(a.page.getByTestId("rana-score")).toHaveText("0");
  await expect(area).toHaveAttribute("data-crashed", "0");
  // y come: el primer toque del jugador justo
  const first = botTrace("abc", { reaction: 15 }).events.filter((e): e is LickEvent => !("fin" in e))[0]!;
  while (((await snapOf(a.page))?.tick ?? -1) < first.tick) await a.page.waitForTimeout(4);
  await lickAt(a.page, first);
  await expect(a.page.getByTestId("rana-score")).toHaveText("1", { timeout: 3_000 });
  await a.context.close();
});

test("en la ronda real: come las primeras colillas con los toques del test, agarra un vapeador y llega al ranking con el puntaje", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "Croac", "la rana caza colillas");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  const played = await playRana(b.page, seed, 3);
  expect(played.score).toBeGreaterThanOrEqual(2);
  expect(played.sentScore).toBe(played.score);
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-score")).toHaveText(String(played.score));
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (v.ok) {
    expect(v.score).toBe(played.score);
    expect(v.crashed).toBe(true);
  }
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText(String(played.score));
  expect(await snapOf(b.page)).toBeNull();
  await b.context.close();
});
