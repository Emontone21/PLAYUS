import { test, expect, type Browser } from "@playwright/test";
import { playTarado, tapHuman } from "./helpers/tarado";
import { createGroupWithGame } from "./helpers/group";

// Segundo juego real, en la ruta de desarrollo (el juego del día lo decide el
// mazo del grupo; la ronda real lo cubre ronda.spec cuando toca).

test.setTimeout(240_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("quedó re tarado: cara, un solo dedo, 200 toques y el resultado con el tiempo", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/quedo-re-tarado?seed=abc");
  await expect(a.page.getByTestId("tarado-card")).toBeVisible();
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("tarado-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  await a.page.waitForTimeout(300);

  // dos punteros: el segundo no cuenta mientras el primero está apretado
  const box = (await area.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await a.page.mouse.move(cx, cy);
  await a.page.mouse.down();
  await a.page.waitForTimeout(60);
  await a.page.touchscreen.tap(cx + 20, cy + 20); // otro puntero mientras el mouse sigue apretado
  await a.page.waitForTimeout(60);
  await a.page.mouse.up();
  await expect(area).toHaveAttribute("data-taps", "1");

  // el teclado no cuenta
  await a.page.keyboard.press("Space");
  await a.page.waitForTimeout(100);
  await expect(area).toHaveAttribute("data-taps", "1");

  // 199 más a ritmo humano: termina solo, con el tiempo en segundos y la cara final
  await playTarado(a.page, 199);
  await expect(a.page.getByTestId("game-result")).toContainText("terminaste");
  await expect(a.page.getByTestId("game-score")).toContainText(/\d+,\d s/);
  await expect(a.page.getByTestId("tarado-result")).toContainText("quedó re tarado");
  await a.context.close();
});

test("en la ronda real: quien termina queda por delante de quien no, y el ranking va de menor a mayor", async ({ browser }) => {
  test.setTimeout(480_000);
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Fumadora", "quedó re tarado");
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Lento");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  // B no termina: 100 toques y espera el corte de los 40 s → 40.000 + 100 × 100
  await b.page.goto("/hoy/jugar");
  await b.page.getByTestId("game-play").click();
  await playTarado(b.page, 100);
  await expect(b.page.getByTestId("game-result")).toContainText("se acabó el tiempo");
  await expect(b.page.getByTestId("game-score")).toContainText("te faltaron 100 toques");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toContainText("50000");

  // A termina los 200 a ritmo humano: el servidor acepta la traza y A queda primera
  await a.page.goto("/hoy/jugar");
  await a.page.getByTestId("game-play").click();
  await playTarado(a.page, 200);
  await expect(a.page.getByTestId("game-result")).toContainText("terminaste");
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  await a.page.getByTestId("game-done").click();
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(2);
  const first = a.page.getByTestId("ranking-row").first();
  await expect(first).toHaveAttribute("data-rank", "1");
  await expect(first).toContainText("Fumadora");
  await expect(first).toContainText("+10");
  const values = await a.page.getByTestId("ranking-value").allInnerTexts();
  const nums = values.map((v) => Number(v.replace(/\D/g, "")));
  expect(nums[0]).toBeLessThan(40_000);
  expect(nums[1]).toBe(50_000);

  // y B, sin tocar nada, ve a A arriba (ranking en vivo)
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(2, { timeout: 30_000 });
  await expect(b.page.getByTestId("ranking-row").first()).toContainText("Fumadora");
  await a.context.close();
  await b.context.close();
});

test("el estado de la cara avanza con los toques y el contador se lee", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/quedo-re-tarado?seed=abc");
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("tarado-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  await expect(area).toHaveAttribute("data-stage", "0");
  await expect(a.page.getByTestId("tarado-left")).toHaveText("quedan 200");
  await tapHuman(a.page, 50);
  await expect(area).toHaveAttribute("data-taps", "50");
  await expect(area).toHaveAttribute("data-stage", "1");
  await expect(a.page.getByTestId("tarado-left")).toHaveText("quedan 150");
  await a.context.close();
});
