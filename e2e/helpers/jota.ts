import { expect, type Page } from "@playwright/test";
import { jotaRounds } from "../../src/games/pegandole-al-jota/rounds";
import { minAnswerMs } from "../../src/games/pegandole-al-jota/rules";

// Juega "pegándole al jota" desde el navegador con las respuestas de
// jotaRounds (calculadas en Node con la semilla del intento): acierta
// `correct` rondas escribiendo el número en el teclado propio y tocando la
// sustancia en la grilla, y después erra una (la sustancia) para que el jota
// se enoje y la partida termine con el puntaje exacto.

export async function answerRound(page: Page, number: string, substance: string) {
  const area = page.getByTestId("jota-area");
  await expect(area).toHaveAttribute("data-phase", "pregunta", { timeout: 10_000 });
  // nadie escribe tan rápido: validate exige 400 + 150 × cifras desde que se ocultó la pista
  await page.waitForTimeout(minAnswerMs(number.length) + 250);
  for (const d of number) await page.getByTestId(`key-${d}`).click();
  await expect(page.getByTestId("jota-typed")).not.toHaveText("___");
  await page.getByTestId(`sub-${substance}`).click();
  await expect(page.getByTestId("jota-order")).toBeEnabled();
  await page.getByTestId("jota-order").click();
}

export async function playJota(page: Page, seed: string, correct: number): Promise<number> {
  const area = page.getByTestId("jota-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const series = jotaRounds(seed);
  for (let i = 0; i < correct; i++) {
    const r = series[i]!;
    await expect(area).toHaveAttribute("data-round", String(r.round), { timeout: 10_000 });
    await answerRound(page, String(r.number), r.substance);
    await expect(area).toHaveAttribute("data-score", String(i + 1));
  }
  // y ahora errar la sustancia
  const wrong = series[correct]!;
  await expect(area).toHaveAttribute("data-round", String(wrong.round), { timeout: 10_000 });
  await answerRound(page, String(wrong.number), wrong.substance === "merca" ? "tussi" : "merca");
  await expect(area).toHaveAttribute("data-phase", "error");
  await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  return correct;
}
