import { expect, type Page } from "@playwright/test";
import { barMs, beatMs, roundAt, stepMs } from "../../src/games/barakatututu/rules";

// Juega "Barakatututu" desde el navegador: hace la cuenta de ajuste tocando
// con los 4 pulsos, y en cada turno toca en los tiempos del patrón calculado
// con `candombeRounds` en el test, mirando el reloj que el área publica en su
// dataset. En la ronda `failAt` toca dos veces seguidas y se termina.
// Devuelve lo que mandó a /finish.

export function snapOf(page: Page): Promise<{ t: number; phase: string; round: number; score: number; turnStart: number; phaseStart: number; correction: number; taps: number } | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="baraka-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { t: Number(d.t ?? -1), phase: d.phase ?? "", round: Number(d.round ?? 0), score: Number(d.score ?? 0), turnStart: Number(d.turnStart ?? 0), phaseStart: Number(d.phaseStart ?? 0), correction: Number(d.correction ?? 0), taps: Number(d.taps ?? 0) };
  });
}

/** cuándo empieza el turno de la ronda en curso: se calcula desde la cuenta (un compás antes), para estar listos desde el primer golpe */
export async function turnStartOf(page: Page, seed: string, n: number): Promise<number> {
  const area = page.getByTestId("baraka-area");
  await expect(area).toHaveAttribute("data-round", String(n), { timeout: 30_000 });
  await expect(area).toHaveAttribute("data-phase", /count|turn/, { timeout: 30_000 });
  const s = (await snapOf(page))!;
  return s.phase === "turn" ? s.turnStart : s.phaseStart + barMs(roundAt(seed, n).bpm);
}

/** un golpe: un toque en el medio del canvas */
export async function hit(page: Page): Promise<void> {
  const box = (await page.getByTestId("baraka-canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.75);
}

/** espera a que el reloj del juego llegue a `t` (ms) */
async function waitT(page: Page, t: number): Promise<void> {
  for (;;) {
    const s = await snapOf(page);
    if (!s || s.t >= t) return;
    await page.waitForTimeout(3);
  }
}

/** la cuenta de ajuste: 4 toques con los 4 pulsos del primer compás */
export async function calibrate(page: Page, seed: string): Promise<void> {
  const area = page.getByTestId("baraka-area");
  await expect(area).toHaveAttribute("data-phase", "calibration", { timeout: 15_000 });
  const beat = beatMs(roundAt(seed, 1).bpm);
  for (let i = 0; i < 4; i++) {
    await waitT(page, Math.round(i * beat));
    await hit(page);
  }
  await expect(area).toHaveAttribute("data-taps", "4");
}

/** espera el turno de la ronda `n` y toca el patrón; con `fail`, toca dos veces seguidas en el primer golpe */
export async function playRound(page: Page, seed: string, n: number, fail = false): Promise<void> {
  const turnStart = await turnStartOf(page, seed, n);
  const r = roundAt(seed, n);
  const step = stepMs(r.bpm);
  for (const h of r.hits) {
    await waitT(page, Math.round(turnStart + h * step) - 8);
    await hit(page);
    if (fail) {
      await page.waitForTimeout(40);
      await hit(page);
      return;
    }
  }
}

export async function playBaraka(page: Page, seed: string, pass = 3): Promise<{ events: unknown[]; sentScore: number; score: number }> {
  const area = page.getByTestId("baraka-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 200_000 });
  await calibrate(page, seed);
  for (let n = 1; n <= pass; n++) playRound: {
    await playRound(page, seed, n);
    break playRound;
  }
  await playRound(page, seed, pass + 1, true);
  await expect(area).toHaveAttribute("data-phase", /failed|over/, { timeout: 15_000 });
  await expect(page.getByTestId("baraka-say")).toHaveText("quedate quieto mano");
  const last = await snapOf(page);
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { events: body.events, sentScore: body.score, score: last?.score ?? -1 };
}
