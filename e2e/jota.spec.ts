import { test, expect, type Browser } from "@playwright/test";
import { jotaRounds, formatNumber } from "../src/games/pegandole-al-jota/rounds";
import { validate, type AnswerEvent } from "../src/games/pegandole-al-jota/rules";
import { answerRound, playJota } from "./helpers/jota";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";

// Sexto juego real. La serie del navegador es la de Node; una partida que
// acierta tres rondas y erra la cuarta llega al ranking con puntaje 3.

test.setTimeout(300_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("la pantalla previa, la pista, el teclado propio, el bro? a los 15 s y una partida que termina en error", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/pegandole-al-jota?seed=abc");
  const card = a.page.getByTestId("jota-card");
  await expect(card).toContainText("¿qué vas a llevar?");
  await a.page.waitForFunction(() => "__jota" in window);
  const inBrowser = await a.page.evaluate((s) => JSON.stringify((window as unknown as { __jota: { jotaRounds: (s: string) => unknown } }).__jota.jotaRounds(s)), "abc");
  expect(inBrowser).toBe(JSON.stringify(jotaRounds("abc")));
  await expect(a.page.getByTestId("dev-faces").getByRole("img")).toHaveCount(4);
  await expect(a.page.getByTestId("dev-substances").getByRole("img")).toHaveCount(10);

  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("jota-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const series = jotaRounds("abc");
  // la pista: el número con separador de miles y sin nombre de la sustancia
  await expect(area).toHaveAttribute("data-phase", "pista");
  await expect(a.page.getByTestId("jota-hint-number")).toHaveText(formatNumber(series[0]!.number));
  await expect(a.page.getByTestId("jota-hint")).not.toContainText(series[0]!.substance);
  // no hay ningún input del sistema: el teclado es propio
  await expect(area).toHaveAttribute("data-phase", "pregunta", { timeout: 10_000 });
  expect(await area.locator("input, textarea").count()).toBe(0);
  await expect(a.page.getByTestId("jota-order")).toBeDisabled();
  // a los 15 s sin responder, "bro?" en el globo; y la ronda sigue
  await expect(a.page.getByTestId("jota-bubble")).toHaveText("¿cuánto querés, bro?");
  await a.page.waitForTimeout(15_300);
  await expect(a.page.getByTestId("jota-bubble")).toHaveText("bro?");
  await expect(area).toHaveAttribute("data-phase", "pregunta");
  // borrar funciona y la longitud no se limita
  await a.page.getByTestId("key-9").click();
  await a.page.getByTestId("key-9").click();
  await a.page.getByTestId("key-9").click();
  await expect(a.page.getByTestId("jota-typed")).toHaveText("999");
  for (let i = 0; i < 3; i++) await a.page.getByTestId("key-borrar").click();
  await expect(a.page.getByTestId("jota-typed")).toHaveText("___");
  await answerRound(a.page, String(series[0]!.number), series[0]!.substance);
  await expect(area).toHaveAttribute("data-score", "1");
  await expect(a.page.getByTestId("jota-bubble")).toHaveText("joya");
  // dos aciertos más y un error en el número
  for (const i of [1, 2]) {
    await expect(area).toHaveAttribute("data-round", String(i + 1), { timeout: 10_000 });
    await answerRound(a.page, String(series[i]!.number), series[i]!.substance);
  }
  await expect(area).toHaveAttribute("data-round", "4", { timeout: 10_000 });
  await answerRound(a.page, "1", series[3]!.substance);
  await expect(area).toHaveAttribute("data-phase", "error");
  await expect(a.page.getByTestId("jota-bubble")).toHaveText("¿me estás jodiendo, bro?");
  await expect(a.page.getByTestId("jota-error")).toContainText(formatNumber(series[3]!.number));
  await expect(a.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  await expect(a.page.getByTestId("game-score")).toHaveText("3");
  await expect(a.page.getByTestId("jota-result")).toHaveAttribute("data-reason", "error");
  await a.context.close();
});

test("en la ronda real: acierta tres, erra la cuarta y llega al ranking con 3", async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Memoria", "pegándole al jota");
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Jota");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  await a.page.goto("/hoy/jugar");
  const seedA = await startAndGetSeed(a.page);
  const finished = a.page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"));
  await playJota(a.page, seedA, 3);
  const body = (await finished).postDataJSON() as { score: number; events: AnswerEvent[] };
  expect(body.score).toBe(3);
  expect(body.events).toHaveLength(4);
  expect(validate(body, seedA)).toBe(true);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  await a.page.getByTestId("game-done").click();
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(a.page.getByTestId("ranking-value").first()).toHaveText(/^\s*3\s*$/);

  // B acierta una y erra; A lo ve aparecer sin recargar
  await b.page.goto("/hoy/jugar");
  const seedB = await startAndGetSeed(b.page);
  await playJota(b.page, seedB, 1);
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(2);
  await expect(b.page.getByTestId("ranking-row").first()).toContainText("Memoria");
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(2, { timeout: 30_000 });
  await a.context.close();
  await b.context.close();
});
