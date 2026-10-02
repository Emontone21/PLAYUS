import { test, expect, type Browser } from "@playwright/test";
import { area2, botTrace, check, generateObjects, solveCut } from "../src/games/clase-con-el-bro/rules";
import { SHAPES } from "../src/games/clase-con-el-bro/shapes";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { cutWith, linesFor, playClase, snapOf } from "./helpers/clase";

// Juego nuevo. La geometría exacta tiene que dar lo mismo en el navegador y
// en Node (áreas, objetos, rectas del resolvedor, partidas); una partida con
// los 3 cortes (rectas calculadas en el test) llega al ranking con el total.

test.setTimeout(400_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da", "semilla-9"];
const OFFSETS = [150, -250, 400];

function summary(seed: string) {
  const objs = generateObjects(seed);
  const sols = objs.map((o) => solveCut(o.verts));
  const a = botTrace(seed, { offsets: OFFSETS });
  return JSON.stringify({ areas: SHAPES.map((s) => area2(s.verts).toString()), objs, sols, events: a.events, total: a.state.total, cuts: a.state.cuts.map((c) => [c.outcome.score, c.outcome.leftPct10, c.outcome.rightPct10, c.outcome.left.n.toString(), c.outcome.left.d.toString()]) });
}

test("la geometría exacta da lo mismo en el navegador y en Node: áreas, objetos, resolvedor y partidas", async ({ page }) => {
  await page.goto("/dev/juego/clase-con-el-bro?seed=abc");
  await expect(page.getByTestId("clase-card")).toBeVisible();
  await page.waitForFunction(() => "__clase" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate(
      ([s, offsets]) => {
        type Frac = { n: bigint; d: bigint };
        type Cut = { outcome: { score: number; leftPct10: number; rightPct10: number; left: Frac } };
        type R = {
          generateObjects: (s: string) => { verts: [number, number][] }[];
          solveCut: (v: unknown) => unknown;
          botTrace: (s: string, o: unknown) => { events: unknown[]; state: { total: number; cuts: Cut[] } };
          splitAreas: (v: unknown, l: unknown) => { total: bigint };
          shapes: { verts: unknown }[];
        };
        const R = (window as unknown as { __clase: R }).__clase;
        const shapes = R.shapes;
        const objs = R.generateObjects(s);
        const sols = objs.map((o) => R.solveCut(o.verts));
        const a = R.botTrace(s, { offsets });
        return JSON.stringify({
          areas: shapes.map((sh) => R.splitAreas(sh.verts, { x1: -1, y1: -1, x2: -1, y2: 20000 }).total.toString()),
          objs,
          sols,
          events: a.events,
          total: a.state.total,
          cuts: a.state.cuts.map((c) => [c.outcome.score, c.outcome.leftPct10, c.outcome.rightPct10, c.outcome.left.n.toString(), c.outcome.left.d.toString()]),
        });
      },
      [seed, OFFSETS] as const,
    );
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, la herramienta (caras, formas), el área, la línea punteada al arrastrar y un corte que no toca no gasta", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/clase-con-el-bro?seed=abc&areas=1");
  const card = a.page.getByTestId("clase-card");
  await expect(card).toContainText("deslizá recto");
  await expect(card.getByRole("img", { name: /Big Bro/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-faces").getByRole("img")).toHaveCount(3);
  await expect(a.page.getByTestId("dev-shapes").getByRole("img")).toHaveCount(6);
  await expect(a.page.getByTestId("dev-objects")).toContainText("recta 50/50");
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("clase-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const table = a.page.getByTestId("clase-table");
  expect(await table.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await table.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("clase-cut")).toContainText("corte 1 de 3");
  // una recta que no toca el objeto (por el borde de la mesa): no cuenta
  await cutWith(a.page, { x1: 50, y1: 0, x2: 50, y2: 10000 });
  await a.page.waitForTimeout(300);
  await expect(area).toHaveAttribute("data-phase", "aim");
  await expect(area).toHaveAttribute("data-cut", "0");
  // arrastrando se ve la línea y, con la herramienta, las áreas de cada lado
  const line = linesFor("abc")[0]!;
  await cutWith(a.page, line, { release: false });
  await expect(a.page.getByTestId("dev-areas")).toContainText("izquierda");
  await a.page.mouse.up();
  await expect(area).toHaveAttribute("data-phase", "pause", { timeout: 3_000 });
  await expect(a.page.getByTestId("clase-say")).toBeVisible();
  await expect(a.page.getByTestId("clase-pct")).toHaveCount(2);
  await a.context.close();
});

test("en la ronda real: tres cortes con las rectas del resolvedor corridas, calculadas en el test, llegan al ranking con el total", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "Cuchilla", "clase con el bro");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  const played = await playClase(b.page, seed);
  expect(played.total).toBeGreaterThan(1500);
  expect(played.sentScore).toBe(played.total);
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-score")).toHaveText(String(played.total));
  await expect(b.page.getByTestId("clase-summary-cut")).toHaveCount(3);
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x))).toBe(true);
  if (v.ok) {
    expect(v.state.total).toBe(played.total);
    expect(v.state.cuts.length).toBe(3);
    expect(v.state.cuts[1]!.outcome.good).toBe(true);
  }
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText(String(played.total));
  expect(await snapOf(b.page)).toBeNull();
  await b.context.close();
});
