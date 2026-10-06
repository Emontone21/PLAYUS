import { test, expect, type Browser } from "@playwright/test";
import { botTrace, check, larryOrders, MODEL } from "../src/games/larry-en-la-hdp/rules";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { playLarryHdp, tapIngredient, waitBuild, wrongFor } from "./helpers/larry-hdp";

// Juego nuevo. Los pedidos del navegador y los de Node son los mismos; una
// partida que arma tres hamburguesas bien y después erra tres veces llega al
// ranking con el puntaje correcto.

test.setTimeout(300_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = ["abc", "reporte", "intento-1", "7a2f577a", "11fcb7da", "semilla-9"];

test("los pedidos y la partida dan exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  await page.goto("/dev/juego/larry-en-la-hdp?seed=abc");
  await expect(page.getByTestId("larryhdp-card")).toBeVisible();
  await page.waitForFunction(() => "__larryhdp" in window);
  for (const seed of SEEDS) {
    const inBrowser = await page.evaluate(
      ([s, model]) => {
        type R = {
          larryOrders: (s: string) => unknown;
          botTrace: (s: string, o: unknown) => { events: unknown[]; run: { score: number; served: number; errors: number } };
        };
        const R = (window as unknown as { __larryhdp: R }).__larryhdp;
        const b = R.botTrace(s, model);
        return JSON.stringify({ orders: R.larryOrders(s), events: b.events, score: b.run.score, served: b.run.served, errors: b.run.errors });
      },
      [seed, MODEL] as const,
    );
    const b = botTrace(seed, MODEL);
    expect(inBrowser, `semilla ${seed}`).toBe(JSON.stringify({ orders: larryOrders(seed), events: b.events, score: b.run.score, served: b.run.served, errors: b.run.errors }));
  }
});

test("la previa, la bandeja, la comanda que se tapa y la bandeja que no responde con la comanda a la vista", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/larry-en-la-hdp?seed=abc");
  const card = a.page.getByTestId("larryhdp-card");
  await expect(card.getByRole("img", { name: /Larry/ })).toBeVisible();
  await expect(card.getByTestId("larryhdp-ejemplo")).toBeVisible();
  await expect(a.page.getByTestId("dev-faces").getByRole("img")).toHaveCount(4);
  await expect(a.page.getByTestId("dev-bro").getByRole("img")).toHaveCount(4);
  await expect(a.page.getByTestId("dev-order")).toHaveCount(40);
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("larryhdp-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  // los botones de la bandeja miden 96 px o más
  const box = (await a.page.getByTestId("larryhdp-pan").boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(96);
  expect(box.width).toBeGreaterThanOrEqual(96);
  // con la comanda a la vista, la bandeja está atenuada y no responde
  await expect(a.page.getByTestId("larryhdp-comanda")).toBeVisible();
  await expect(a.page.getByTestId("larryhdp-tray")).toHaveAttribute("data-open", "");
  // (aria-disabled: Playwright esperaría a que se habilite; el dedo toca igual)
  await a.page.getByTestId("larryhdp-pan").click({ force: true });
  await a.page.waitForTimeout(150);
  await expect(area).toHaveAttribute("data-phase", "view");
  await expect(area).toHaveAttribute("data-built", "0");
  await expect(a.page.getByTestId("larryhdp-say")).toHaveText("atendé a Larry, asistente");
  // se tapa: el dorso con "hdp" y la bandeja abierta
  await waitBuild(a.page, 0);
  await expect(a.page.getByTestId("larryhdp-dorso")).toBeVisible();
  await expect(a.page.getByTestId("larryhdp-comanda")).toHaveCount(0);
  const layers = larryOrders("abc")[0]!.layers;
  await tapIngredient(a.page, layers[0]!);
  await tapIngredient(a.page, layers[1]!);
  await expect(area).toHaveAttribute("data-built", "2");
  await expect(a.page.getByTestId("larryhdp-count")).toHaveText(`2 de ${layers.length}`);
  // un error: al tacho en el acto, una vida menos, Big Bro se queja
  await tapIngredient(a.page, wrongFor(layers[2]!));
  await expect(area).toHaveAttribute("data-phase", "trash");
  await expect(a.page.getByTestId("larryhdp-lives")).toHaveAttribute("data-lives", "2");
  await expect(a.page.getByTestId("larryhdp-say")).toHaveText("¿me estás jodiendo?");
  await a.context.close();
});

test("en la ronda real: tres bien y tres errores llegan al ranking con el puntaje correcto", async ({ browser }) => {
  const b = await freshPage(browser);
  await createGroupWithGame(b.page, "Mostrador", "Larry en la hdp");
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  const played = await playLarryHdp(b.page, seed, 3, 3);
  const v = check(seed, played.events);
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (!v.ok) return;
  expect(v.served).toBe(3);
  expect(v.errors).toBe(3);
  expect(v.score).toBe(played.sentScore);
  expect(v.score).toBeGreaterThanOrEqual(300);
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("game-score")).toHaveText(String(v.score));
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText(String(v.score));
  await b.context.close();
});
