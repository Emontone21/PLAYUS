import { test, expect, type Browser } from "@playwright/test";
import { botTrace, check, generateShots, simulate, solveShot, type ThrowEvent } from "../src/games/fumate-algo-chino/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { dragLogical, isRotated, playChino, snapOf } from "./helpers/chino";

// Juego nuevo. La simulación del navegador y la de Node tienen que dar
// exactamente lo mismo; una partida con tres tiros (vectores calculados en el
// test, uno adentro) llega al ranking con el mejor puntaje correcto. Se juega
// en horizontal: en el viewport vertical del teléfono el contenedor rota el
// área 90° y los arrastres del test se convierten a la pantalla física.

test.setTimeout(400_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da", "semilla-9"];
const BOT = { errorPct: 0.06 };

function summary(seed: string) {
  const shots = generateShots(seed);
  const sols = shots.map((s) => solveShot(s));
  const a = botTrace(seed, BOT);
  const r = simulate(seed, a.events.filter((e): e is ThrowEvent => !("fin" in e)), a.result.endTick);
  return JSON.stringify({ shots, sols, events: a.events, best: a.result.best, results: r.results.map((x) => [x.score, x.minDist, x.outcome, x.flight.ticks, x.flight.end]) });
}

test("la simulación y el resolvedor dan exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/fumate-algo-chino?seed=abc");
  await expect(page.getByTestId("chino-card")).toBeVisible();
  await page.waitForFunction(() => "__chino" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate(
      ([s, bot]) => {
        type Ev = { tick: number; fin?: true };
        type R = {
          generateShots: (s: string) => unknown[];
          solveShot: (shot: unknown) => unknown;
          botTrace: (s: string, o: unknown) => { events: Ev[]; result: { best: number; endTick: number } };
          simulate: (s: string, t: Ev[], until: number) => { results: { score: number; minDist: number; outcome: string; flight: { ticks: number; end: string } }[] };
        };
        const R = (window as unknown as { __chino: R }).__chino;
        const shots = R.generateShots(s);
        const sols = shots.map((x) => R.solveShot(x));
        const a = R.botTrace(s, bot);
        const r = R.simulate(s, a.events.filter((e) => !("fin" in e)), a.result.endTick);
        return JSON.stringify({ shots, sols, events: a.events, best: a.result.best, results: r.results.map((x) => [x.score, x.minDist, x.outcome, x.flight.ticks, x.flight.end]) });
      },
      [seed, BOT] as const,
    );
    expect(inBrowser, `semilla ${seed}`).toBe(summary(seed));
  }
});

test("la pantalla previa, el área, las caras en la herramienta, y un arrastre corto que no gasta el tiro", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/fumate-algo-chino?seed=abc");
  const card = a.page.getByTestId("chino-card");
  await expect(card).toContainText("arrastrá hacia atrás");
  await expect(card.getByRole("img", { name: /El chino con la boca abierta/ })).toBeVisible();
  await expect(a.page.getByTestId("dev-faces").getByRole("img")).toHaveCount(4);
  await expect(a.page.getByTestId("dev-shots")).toContainText("el resolvedor emboca");
  await a.page.getByTestId("game-play").click();
  // en el viewport vertical del teléfono: el aviso de girar en la cuenta regresiva, y el área rotada
  await expect(a.page.getByTestId("game-rotate-hint")).toContainText("girá el teléfono");
  const area = a.page.getByTestId("chino-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  await expect(a.page.getByTestId("game-playing")).toHaveAttribute("data-rotated", "1");
  expect(await a.page.getByTestId("game-playing").evaluate((el) => getComputedStyle(el).transform)).not.toBe("none");
  // el cronómetro va adentro del área rotada
  await expect(a.page.getByTestId("game-playing").getByTestId("game-timer")).toBeVisible();
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  await expect(a.page.getByTestId("chino-shot")).toContainText("tiro 1 de 3");
  // un arrastre de 10 px: no tira
  const box = (await area.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await dragLogical(a.page, cx, cy, { dx: -10, dy: 4 });
  await a.page.waitForTimeout(300);
  await expect(area).toHaveAttribute("data-phase", "aim");
  await expect(area).toHaveAttribute("data-shot", "0");
  // uno largo hacia atrás (para el jugador: abajo a la izquierda) tira hacia adelante y arriba
  await dragLogical(a.page, cx, cy, { dx: -90, dy: 60 });
  await expect(area).toHaveAttribute("data-phase", "flight", { timeout: 3_000 });
  await expect(a.page.getByTestId("chino-banner")).toBeVisible({ timeout: 15_000 });
  await a.context.close();
});

test("en una ventana horizontal no rota nada, y la previa y el resultado siguen sin rotar en el teléfono", async ({ browser }) => {
  const wide = await browser.newContext({ viewport: { width: 844, height: 390 } });
  const page = await wide.newPage();
  await page.goto("/dev/juego/fumate-algo-chino?seed=abc");
  await page.getByTestId("game-play").click();
  await expect(page.getByTestId("game-countdown")).toBeVisible();
  await expect(page.getByTestId("game-rotate-hint")).toHaveCount(0);
  await expect(page.getByTestId("chino-area")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("game-playing")).toHaveAttribute("data-rotated", "0");
  expect(await page.getByTestId("game-playing").evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  // un arrastre sin convertir tira igual que siempre
  const box = (await page.getByTestId("chino-area").boundingBox())!;
  await dragLogical(page, box.x + box.width / 2, box.y + box.height / 2, { dx: -90, dy: 60 });
  await expect(page.getByTestId("chino-area")).toHaveAttribute("data-phase", "flight", { timeout: 3_000 });
  await wide.close();
  // en el teléfono (vertical), la previa no está rotada
  const phone = await browser.newContext();
  const p = await phone.newPage();
  await p.goto("/dev/juego/fumate-algo-chino?seed=abc");
  const card = p.getByTestId("chino-card");
  await expect(card).toBeVisible();
  expect((await p.getByTestId("game-play").boundingBox())!.width).toBeGreaterThan(300);
  await phone.close();
});

test("en la ronda real: tres tiros con los vectores calculados en el test, uno adentro, llegan al ranking con el mejor puntaje", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "Gomera", "fumate algo chino");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  // viewport vertical de teléfono: se juega con la gomera rotada
  expect(await isRotated(b.page)).toBe(true);
  const played = await playChino(b.page, seed);
  expect(played.best).toBeGreaterThanOrEqual(900);
  expect(played.sentScore).toBe(played.best);
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-score")).toHaveText(String(played.best));
  await expect(b.page.getByTestId("chino-summary").locator("[data-best='1']")).toHaveCount(1);
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (v.ok) {
    expect(v.best).toBe(played.best);
    expect(v.results.length).toBe(3);
    expect(v.results.some((r) => r.outcome === "adentro")).toBe(true);
  }
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText(String(played.best));
  expect(await snapOf(b.page)).toBeNull();
  await b.context.close();
});
