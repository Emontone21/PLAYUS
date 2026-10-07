import { expect, type Page } from "@playwright/test";
import { finalPos, jotaShuffles, type Pos } from "../../src/games/la-bolsita-del-jota/rules";

// Juega "la bolsita del jota" desde el navegador con la posición de la
// bolsita tomada de `jotaShuffles` en el test: espera a que cada mezcla
// termine y toca el vaso (tecla 1, 2 o 3). En la ronda `failAt` elige otro y
// se termina. Devuelve lo que mandó a /finish.

export async function waitPick(page: Page, round: number): Promise<void> {
  const area = page.getByTestId("bolsita-area");
  await expect(area).toHaveAttribute("data-round", String(round), { timeout: 20_000 });
  await expect(area).toHaveAttribute("data-phase", "pick", { timeout: 30_000 });
}

export async function playBolsita(page: Page, seed: string, failAt: number): Promise<{ events: unknown[]; sentScore: number }> {
  await expect(page.getByTestId("bolsita-area")).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 120_000 });
  const shuffles = jotaShuffles(seed);
  for (let round = 1; round <= failAt; round++) {
    await waitPick(page, round);
    const answer = finalPos(shuffles[round - 1]!);
    const cup = (round === failAt ? (answer + 1) % 3 : answer) as Pos;
    await page.keyboard.press(String(cup + 1));
  }
  // el final: el jota se burla mientras se ve
  await expect(page.getByTestId("bolsita-say")).toHaveText("uh, casi, bro");
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { events: body.events, sentScore: body.score };
}
