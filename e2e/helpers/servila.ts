import { expect, type Page } from "@playwright/test";
import { applyAction, initialState, lineLevel, predictTop, step, SUB, type SimState } from "../../src/games/servila-justa/rules";

// Juega "servila justa" desde el navegador: en cada vaso aprieta la barra
// espaciadora apenas empieza y la suelta tantos ticks después como calcula
// el test en Node con la misma simulación y la semilla del intento (la
// página no anticipa dónde termina la espuma, decisión 228). Devuelve lo
// que mandó a /finish (total y traza).

export interface Snap {
  tick: number;
  glass: number;
  phase: string;
  pressed: boolean;
  line: number;
  score: number;
  end: boolean;
}

export function snapOf(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="servila-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { tick: Number(d.tick ?? -1), glass: Number(d.glass ?? 0), phase: d.phase ?? "", pressed: d.pressed === "1", line: Number(d.line ?? 0), score: Number(d.score ?? 0), end: d.end === "1" };
  });
}

/** una simulación parada al empezar el vaso `index`, con los anteriores vencidos sin servir (la física del vaso no depende de eso) */
function atGlass(seed: string, index: number): SimState {
  const s = initialState(seed);
  while (!s.end && s.current!.index < index) step(s);
  return s;
}

/** cuántos ticks hay que mantener apretado en el vaso `index` para que la espuma termine `marginRows` filas abajo de la raya */
export function holdTicksFor(seed: string, index: number, marginRows: number): number {
  const s = atGlass(seed, index);
  applyAction(s, "down");
  const target = lineLevel(s) - marginRows * SUB;
  let held = 0;
  while (held < 600) {
    const top = predictTop(s);
    if (top !== null && top >= target) return held;
    step(s);
    held++;
  }
  return held;
}

export async function playServila(page: Page, seed: string, marginRows = 1): Promise<{ score: number; events: unknown[]; sentScore: number }> {
  const area = page.getByTestId("servila-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 150_000 });
  const deadline = Date.now() + 120_000;
  let holding = false;
  let servedGlass = -1;
  let releaseAt = -1;
  let last: Snap | null = null;
  while (Date.now() < deadline) {
    const s = await snapOf(page);
    if (!s) break;
    last = s;
    if (s.end) break;
    if (s.phase === "pour" && !holding && servedGlass !== s.glass) {
      // el "apretar" entra en el cuadro siguiente: un tick después de lo que se ve
      releaseAt = s.tick + 1 + holdTicksFor(seed, s.glass, marginRows);
      await page.keyboard.down("Space");
      holding = true;
      servedGlass = s.glass;
      continue;
    }
    if (holding && s.pressed && s.tick >= releaseAt - 1) {
      await page.keyboard.up("Space");
      holding = false;
      continue;
    }
    if (holding && !s.pressed && s.phase !== "pour") {
      // se rebalsó mientras apretaba: soltar igual
      await page.keyboard.up("Space");
      holding = false;
    }
    await page.waitForTimeout(3);
  }
  if (holding) await page.keyboard.up("Space");
  expect(last?.end).toBe(true);
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { score: last?.score ?? -1, events: body.events, sentScore: body.score };
}
