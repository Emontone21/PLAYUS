import { expect, type Page } from "@playwright/test";
import { memoBoards } from "../../src/games/busca-los-paris/boards";

// Juega "buscá los Paris" desde el navegador con los tableros de memoBoards
// (calculados en Node con la semilla del intento): completa el primer
// tablero dando vuelta antes cada carta una vez (de a dos, como un jugador
// que explora) para no caer en aciertos a ciegas, y después empareja.
// Devuelve los pares del primer tablero (3).

export async function playParis(page: Page, seed: string): Promise<number> {
  const area = page.getByTestId("paris-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const board = memoBoards(seed)[0]!;
  const card = (i: number) => page.getByTestId(`card-${i}`);
  const tapPair = async (a: number, b: number) => {
    await card(a).dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", button: 0, isPrimary: true });
    await card(a).dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", button: 0, isPrimary: true });
    await page.waitForTimeout(160);
    await card(b).dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", button: 0, isPrimary: true });
    await card(b).dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", button: 0, isPrimary: true });
    await page.waitForTimeout(160);
  };
  // explorar: todas las cartas, de a dos
  for (let i = 0; i + 1 < board.cards.length; i += 2) {
    const matched = (await card(i).getAttribute("data-state")) === "par";
    if (matched) continue;
    await tapPair(i, i + 1);
    await page.waitForTimeout(650);
  }
  // emparejar lo que falta
  const done = new Set<number>();
  for (let i = 0; i < board.cards.length; i++) {
    if (done.has(i)) continue;
    const j = board.cards.findIndex((id, k) => k !== i && id === board.cards[i]);
    done.add(i);
    done.add(j);
    if ((await card(i).getAttribute("data-state")) === "par") continue;
    await tapPair(i, j);
    await expect(card(i)).toHaveAttribute("data-state", "par");
  }
  await expect(area).toHaveAttribute("data-pairs", String(board.cards.length / 2));
  await expect(area).toHaveAttribute("data-board", "1", { timeout: 5_000 });
  return board.cards.length / 2;
}
