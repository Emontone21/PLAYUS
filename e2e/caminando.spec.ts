import { test, expect, type Browser } from "@playwright/test";
import { generateStreet, perfectTrace, simulate, validate, type TapEvent, type TraceEvent } from "../src/games/caminando-por-18/rules";
import { playCaminando } from "./helpers/caminando";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";

// Séptimo juego real. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida que toca a los primeros pastosos y
// después deja pasar tres llega al ranking con los metros correctos.

test.setTimeout(300_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da"];

function summary(seed: string) {
  const g = perfectTrace(seed);
  const taps = g.events.filter((e): e is TapEvent => !("fin" in e));
  const lazy = simulate(seed, []);
  return JSON.stringify({
    street: generateStreet(seed),
    perfect: { events: g.events, score: g.result.score, endTick: g.result.endTick, reason: g.result.endReason },
    replay: simulate(seed, taps).state,
    lazy: { score: lazy.score, endTick: lazy.endTick, reason: lazy.endReason, grabbedBy: lazy.state.grabbedBy },
  });
}

test("simulate da exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/caminando-por-18?seed=abc");
  await expect(page.getByTestId("caminando-card")).toBeVisible();
  await page.waitForFunction(() => "__caminando" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate((s) => {
      type Trace = { events: Array<{ tick: number; fin?: true }>; result: { score: number; endTick: number; endReason: string | null } };
      type C = {
        generateStreet: (s: string) => unknown;
        perfectTrace: (s: string) => Trace;
        simulate: (s: string, t: unknown[]) => { score: number; endTick: number; endReason: string | null; state: { grabbedBy: unknown } };
      };
      const C = (window as unknown as { __caminando: C }).__caminando;
      const g = C.perfectTrace(s);
      const taps = g.events.filter((e) => !("fin" in e));
      const lazy = C.simulate(s, []);
      return JSON.stringify({
        street: C.generateStreet(s),
        perfect: { events: g.events, score: g.result.score, endTick: g.result.endTick, reason: g.result.endReason },
        replay: C.simulate(s, taps).state,
        lazy: { score: lazy.score, endTick: lazy.endTick, reason: lazy.endReason, grabbedBy: lazy.state.grabbedBy },
      });
    }, seed);
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área sin scroll, un solo dedo y una partida que toca y después deja pasar a uno", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/caminando-por-18?seed=abc");
  const card = a.page.getByTestId("caminando-card");
  await expect(card).toContainText("don pasta ×4");
  await expect(card.getByRole("img", { name: "tarjetas" })).toBeVisible();
  await expect(a.page.getByTestId("dev-kinds").locator("canvas")).toHaveCount(5);
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("caminando-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  // tocar el vacío no penaliza
  const canvas = a.page.getByRole("img", { name: "18 de Julio, el personaje y los pastosos" });
  const box = (await canvas.boundingBox())!;
  await a.page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
  await expect(area).toHaveAttribute("data-end", "");

  const taps = await playCaminando(a.page, 4);
  expect(taps).toBe(4);
  const score = Number(await a.page.getByTestId("game-score").textContent());
  expect(score).toBeGreaterThan(5);
  await expect(a.page.getByTestId("caminando-result")).toContainText("te frenaron");
  await expect(a.page.getByTestId("caminando-result")).toHaveAttribute("data-reason", "frenado");
  await a.context.close();
});

test("en la ronda real: la partida se valida en el servidor y llega al ranking en metros", async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Peatona", "caminando por 18");
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Pastoso");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  // A toca a los primeros y después deja pasar; el cuerpo que manda /finish se rearma en Node
  await a.page.goto("/hoy/jugar");
  const seedA = await startAndGetSeed(a.page);
  const finished = a.page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"));
  await playCaminando(a.page, 5);
  const body = (await finished).postDataJSON() as { score: number; events: TraceEvent[] };
  expect(validate(body, seedA)).toBe(true);
  expect(body.score).toBeGreaterThan(5);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  await expect(a.page.getByTestId("game-score")).toHaveText(String(body.score));
  await a.page.getByTestId("game-done").click();
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(a.page.getByTestId("ranking-value").first()).toHaveText(new RegExp(`^\\s*${body.score}\\s*m\\s*$`));
  await expect(a.page.getByTestId("attempts-left")).toContainText(`tu mejor: ${body.score} m`);

  // B no toca a nadie: lo frenan enseguida y queda detrás
  await b.page.goto("/hoy/jugar");
  await startAndGetSeed(b.page);
  await expect(b.page.getByTestId("caminando-area")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 130_000 });
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(2);
  await expect(b.page.getByTestId("ranking-row").first()).toContainText("Peatona");
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(2, { timeout: 30_000 });
  await a.context.close();
  await b.context.close();
});
