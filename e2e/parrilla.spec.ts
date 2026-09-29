import { test, expect, type Browser } from "@playwright/test";
import { canarioTimeline } from "../src/games/la-parrilla-del-bro/timeline";
import { validate, type TapEvent } from "../src/games/la-parrilla-del-bro/rules";
import { playParrilla } from "./helpers/parrilla";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";

// Quinto juego real. El cronograma del navegador es el de Node; una partida
// que toca en los tramos seguros y después en uno peligroso llega al ranking
// con el puntaje exacto.

test.setTimeout(300_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("la pantalla previa, la barra del cronograma, un solo dedo y una partida que termina al ser visto", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/la-parrilla-del-bro?seed=abc");
  const card = a.page.getByTestId("parrilla-card");
  await expect(card).toContainText("de espaldas: tocá");
  await expect(card).toContainText("se mueve: frená");
  await expect(card).toContainText("te mira: quieto");
  // la barra del cronograma tiene los mismos segmentos que Node
  await a.page.waitForFunction(() => "__parrilla" in window);
  const inBrowser = await a.page.evaluate((s) => JSON.stringify((window as unknown as { __parrilla: { canarioTimeline: (s: string) => unknown } }).__parrilla.canarioTimeline(s)), "abc");
  expect(inBrowser).toBe(JSON.stringify(canarioTimeline("abc")));
  expect(await a.page.getByTestId("dev-timeline").locator("[data-state]").count()).toBe(canarioTimeline("abc").length);
  await expect(a.page.getByTestId("dev-state-visto")).toBeVisible();

  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("parrilla-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  // el teclado no cuenta
  await a.page.keyboard.press("Space");
  await a.page.waitForTimeout(100);
  await expect(area).toHaveAttribute("data-taps", "0");

  const taps = await playParrilla(a.page, "abc", 12);
  expect(taps).toBe(12);
  await expect(a.page.getByTestId("game-score")).toHaveText("12");
  await expect(a.page.getByTestId("parrilla-result")).toContainText("te vio, bro");
  await expect(a.page.getByTestId("parrilla-result")).toHaveAttribute("data-reason", "visto");
  await a.context.close();
});

test("en la ronda real: la partida se valida en el servidor y llega al ranking con el puntaje exacto", async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Bro", "la parrilla del bro");
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Canario");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  // A juega: 20 toques seguros y uno peligroso; el cuerpo que manda /finish se rearma en Node
  await a.page.goto("/hoy/jugar");
  const seedA = await startAndGetSeed(a.page);
  const finished = a.page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"));
  const taps = await playParrilla(a.page, seedA, 20);
  const body = (await finished).postDataJSON() as { score: number; events: TapEvent[] };
  expect(body.score).toBe(taps);
  expect(body.events.length).toBe(taps + 1);
  expect(validate(body, seedA)).toBe(true);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  await a.page.getByTestId("game-done").click();
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(a.page.getByTestId("ranking-value").first()).toHaveText(new RegExp(`^\\s*${taps}\\s*$`));
  await expect(a.page.getByTestId("attempts-left")).toContainText(`tu mejor: ${taps}`);

  // B juega 8 toques y queda segundo; A lo ve aparecer sin recargar
  await b.page.goto("/hoy/jugar");
  const seedB = await startAndGetSeed(b.page);
  const tapsB = await playParrilla(b.page, seedB, 8);
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(2);
  await expect(b.page.getByTestId("ranking-row").first()).toContainText("Bro");
  await expect(b.page.getByTestId("ranking-value").nth(1)).toHaveText(new RegExp(`^\\s*${tapsB}\\s*$`));
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(2, { timeout: 30_000 });
  await a.context.close();
  await b.context.close();
});
