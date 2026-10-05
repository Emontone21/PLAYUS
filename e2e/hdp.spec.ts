import { test, expect, type Browser } from "@playwright/test";
import { botTrace, broLine, check, idleTimeline, initialState, simulate, step, type SwipeEvent } from "../src/games/hdp/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { playHdp, snapOf, swipeOn } from "./helpers/hdp";

// Juego nuevo. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida que da vuelta las primeras hamburguesas y
// deja quemar alguna llega al ranking con el puntaje correcto.

test.setTimeout(400_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da", "semilla-9"];
const MODEL = { reactionTicks: 36, jitterTicks: 24, errorPerMille: 200, swipeGapTicks: 36 };

function summary(seed: string) {
  const a = botTrace(seed, MODEL);
  const r = simulate(seed, a.events.filter((e): e is SwipeEvent => !("fin" in e)), 3600);
  const s = initialState(seed);
  const lines: string[] = [];
  while (s.tick < 1200) {
    step(s);
    if (s.tick % 100 === 0) lines.push(broLine(s, seed).text);
  }
  return JSON.stringify({ events: a.events, score: a.result.score, burns: a.result.burns, slots: r.state.slots.map((x) => [x.phase, x.dir, x.until, x.cycle]), timeline: idleTimeline(seed).slice(0, 12), lines });
}

test("la simulación da exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/hdp?seed=abc");
  await expect(page.getByTestId("hdp-card")).toBeVisible();
  await page.waitForFunction(() => "__hdp" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate(
      ([s, model]) => {
        type Ev = { tick: number; fin?: true };
        type R = {
          botTrace: (s: string, o: unknown) => { events: Ev[]; result: { score: number; burns: number } };
          simulate: (s: string, t: Ev[], until: number) => { state: { slots: { phase: string; dir: string; until: number; cycle: number }[] } };
          initialState: (s: string) => { tick: number };
          step: (st: unknown) => void;
          broLine: (st: unknown, s: string) => { text: string };
          idleTimeline: (s: string) => unknown[];
        };
        const R = (window as unknown as { __hdp: R }).__hdp;
        const a = R.botTrace(s, model);
        const r = R.simulate(s, a.events.filter((e) => !("fin" in e)), 3600);
        const st = R.initialState(s);
        const lines: string[] = [];
        while (st.tick < 1200) {
          R.step(st);
          if (st.tick % 100 === 0) lines.push(R.broLine(st, s).text);
        }
        return JSON.stringify({ events: a.events, score: a.result.score, burns: a.result.burns, slots: r.state.slots.map((x) => [x.phase, x.dir, x.until, x.cycle]), timeline: R.idleTimeline(s).slice(0, 12), lines });
      },
      [seed, MODEL] as const,
    );
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área, la herramienta y un deslizamiento en la dirección equivocada que no suma", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/hdp?seed=abc");
  const card = a.page.getByTestId("hdp-card");
  await expect(card).toContainText("¿estás listo, asistente?");
  await expect(card.getByRole("img", { name: /Big Bro/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-faces").getByRole("img")).toHaveCount(4);
  await expect(a.page.getByTestId("dev-states").getByRole("img")).toHaveCount(9);
  await expect(a.page.getByTestId("dev-timeline").locator("[data-phase=ready]").first()).toBeAttached();
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("hdp-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const field = a.page.getByTestId("hdp-field");
  expect(await field.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await field.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("hdp-score")).toHaveText("0");
  await expect(a.page.getByTestId("hdp-say")).toBeVisible();
  // esperar la primera flecha y deslizar para el lado equivocado: no suma, y la correcta después sí
  await expect.poll(async () => (await snapOf(a.page))?.slots.findIndex((s) => s.phase === "ready"), { timeout: 20_000 }).toBeGreaterThanOrEqual(0);
  const snap = (await snapOf(a.page))!;
  const i = snap.slots.findIndex((s) => s.phase === "ready");
  const dir = snap.slots[i]!.dir;
  await swipeOn(a.page, i, dir === "up" ? "down" : "up");
  await a.page.waitForTimeout(150);
  await expect(a.page.getByTestId("hdp-score")).toHaveText("0");
  await expect.poll(async () => (await snapOf(a.page))?.slots[i]!.blocked, { timeout: 2_000 }).toBe(false);
  await swipeOn(a.page, i, dir);
  await expect(a.page.getByTestId("hdp-score")).toHaveText("1", { timeout: 3_000 });
  await a.context.close();
});

test("en la ronda real: da vuelta las primeras, deja quemar alguna y llega al ranking con el puntaje correcto", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "Plancha", "hij@ de p**");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  const played = await playHdp(b.page, { ignore: [600, 1000] });
  expect(played.score).toBeGreaterThanOrEqual(8);
  expect(played.burns).toBeGreaterThanOrEqual(1);
  expect(played.sentScore).toBe(played.score);
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-score")).toHaveText(String(played.score));
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (v.ok) {
    expect(v.score).toBe(played.score);
    expect(v.burns).toBe(played.burns);
  }
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText(String(played.score));
  expect(await snapOf(b.page)).toBeNull();
  await b.context.close();
});
