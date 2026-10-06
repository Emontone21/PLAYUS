import { expect, type Page } from "@playwright/test";
import { larryOrders, type Ingredient } from "../../src/games/larry-en-la-hdp/rules";

// Juega "Larry en la hdp" desde el navegador con los pedidos calculados en el
// test (`larryOrders` con la semilla del intento): espera a que se tape cada
// comanda y toca los ingredientes en orden; en los pedidos de `fail` toca uno
// equivocado de entrada. Devuelve lo que mandó a /finish.

/** espera a que el pedido `index` (desde 0) esté para armar */
export async function waitBuild(page: Page, index: number): Promise<void> {
  const area = page.getByTestId("larryhdp-area");
  await expect(area).toHaveAttribute("data-index", String(index), { timeout: 15_000 });
  await expect(area).toHaveAttribute("data-phase", "build", { timeout: 15_000 });
}

export async function tapIngredient(page: Page, ing: Ingredient): Promise<void> {
  await page.getByTestId(`larryhdp-${ing}`).click();
  // un dedo no toca dos en menos de 80 ms
  await page.waitForTimeout(110);
}

/** un ingrediente que no es el que toca */
export function wrongFor(right: Ingredient): Ingredient {
  return right === "pan" ? "queso" : "pan";
}

/** arma `good` pedidos bien y después erra `bad` veces seguidas (3 terminan la partida) */
export async function playLarryHdp(page: Page, seed: string, good: number, bad: number): Promise<{ events: unknown[]; sentScore: number }> {
  await expect(page.getByTestId("larryhdp-area")).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 120_000 });
  const orders = larryOrders(seed);
  for (let i = 0; i < good + bad; i++) {
    await waitBuild(page, i);
    const layers = orders[i]!.layers;
    if (i < good) for (const ing of layers) await tapIngredient(page, ing);
    else await tapIngredient(page, wrongFor(layers[0]!));
  }
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { events: body.events, sentScore: body.score };
}
