import { expect, type Page } from "@playwright/test";

// Juega "servila justa" desde el navegador: en cada vaso aprieta la barra
// espaciadora apenas empieza, y la suelta cuando la predicción del juego
// (data-predict: dónde termina la espuma si se suelta ahora, calculada por
// la misma simulación que corre en Node) llega a la raya menos un margen.
// Devuelve lo que mandó a /finish (total y traza).

export interface Snap {
  tick: number;
  glass: number;
  phase: string;
  pressed: boolean;
  predict: number | null;
  line: number;
  score: number;
  end: boolean;
}

export function snapOf(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="servila-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { tick: Number(d.tick ?? -1), glass: Number(d.glass ?? 0), phase: d.phase ?? "", pressed: d.pressed === "1", predict: d.predict ? Number(d.predict) : null, line: Number(d.line ?? 0), score: Number(d.score ?? 0), end: d.end === "1" };
  });
}

export async function playServila(page: Page, marginRows = 1): Promise<{ score: number; events: unknown[]; sentScore: number }> {
  const area = page.getByTestId("servila-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 150_000 });
  const deadline = Date.now() + 120_000;
  let holding = false;
  let servedGlass = -1;
  let last: Snap | null = null;
  while (Date.now() < deadline) {
    const s = await snapOf(page);
    if (!s) break;
    last = s;
    if (s.end) break;
    if (s.phase === "pour" && !holding && servedGlass !== s.glass) {
      await page.keyboard.down("Space");
      holding = true;
      servedGlass = s.glass;
      continue;
    }
    if (holding && s.pressed && s.predict !== null && s.predict >= s.line - marginRows * 1000) {
      await page.keyboard.up("Space");
      holding = false;
      continue;
    }
    if (holding && !s.pressed && s.phase !== "pour") {
      // se rebalsó mientras apretaba: soltar igual
      await page.keyboard.up("Space");
      holding = false;
    }
    await page.waitForTimeout(4);
  }
  if (holding) await page.keyboard.up("Space");
  expect(last?.end).toBe(true);
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { score: last?.score ?? -1, events: body.events, sentScore: body.score };
}
