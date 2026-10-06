import { expect, type Page } from "@playwright/test";
import { angDist, BOTTOM, FLIGHT_TICKS, mod, TURN } from "../../src/games/big-bro-afila/rules";

// Juega "Big Bro afila" desde el navegador: lee el estado de la horma que el
// área publica en su dataset (tick, ángulo, velocidad, cuchillas clavadas) y
// calcula en el test cuándo tirar para que la cuchilla llegue al centro del
// hueco más grande (o, para chocar, encima de una cuchilla clavada),
// descontando la demora de la tecla. Devuelve lo que mandó a /finish.

export interface Snap {
  tick: number;
  score: number;
  phase: string;
  wheel: number;
  angle: number;
  vel: number;
  flying: boolean;
  stuck: number[];
}

export function snapOf(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="afila-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return {
      tick: Number(d.tick ?? -1),
      score: Number(d.score ?? 0),
      phase: d.phase ?? "",
      wheel: Number(d.wheel ?? 0),
      angle: Number(d.angle ?? 0),
      vel: Number(d.vel ?? 0),
      flying: d.flying === "1",
      stuck: d.stuck ? d.stuck.split(",").map(Number) : [],
    };
  });
}

/** el centro del hueco más grande entre las clavadas (sin ninguna, el ángulo que pase) */
export function gapCenter(stuck: number[]): number | null {
  if (stuck.length === 0) return null;
  const rels = [...stuck].sort((a, b) => a - b);
  let best = -1;
  let center = 0;
  rels.forEach((a, i) => {
    const b = i + 1 < rels.length ? rels[i + 1]! : rels[0]! + TURN;
    if (b - a > best) {
      best = b - a;
      center = mod(a + Math.floor((b - a) / 2));
    }
  });
  return center;
}

/** dónde se clavaría si sale ahora, contando `lag` ticks de demora */
export function predictRel(s: Snap, lag: number): number {
  return mod(BOTTOM - (s.angle + s.vel * (lag + FLIGHT_TICKS)));
}

/** espera a que el lugar pase por abajo y tira con la barra espaciadora */
export async function throwAt(page: Page, target: (s: Snap) => number | null, tolerance: number, lag = 3): Promise<void> {
  for (let i = 0; i < 2000; i++) {
    const s = (await snapOf(page))!;
    if (s.phase === "play" && !s.flying) {
      const t = target(s);
      if (t === null || angDist(predictRel(s, lag), t) <= tolerance) {
        await page.keyboard.press("Space");
        return;
      }
    }
    await page.waitForTimeout(8);
  }
  throw new Error("no pasó nunca por abajo");
}

/** completa la primera horma apuntando al hueco más grande y después choca contra una cuchilla clavada */
export async function playAfila(page: Page): Promise<{ events: unknown[]; sentScore: number }> {
  const area = page.getByTestId("afila-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 120_000 });
  for (let i = 0; i < 6; i++) {
    await throwAt(page, (s) => gapCenter(s.stuck), 60);
    await expect.poll(async () => (await snapOf(page))?.stuck.length ?? -1, { timeout: 3_000 }).toBe(i + 1);
  }
  await expect(area).toHaveAttribute("data-wheel", "2", { timeout: 5_000 });
  await expect(area).toHaveAttribute("data-phase", "play", { timeout: 5_000 });
  // a chocar: apunta justo encima de una cuchilla clavada hasta que rebote
  for (let i = 0; i < 6; i++) {
    const before = (await snapOf(page))!;
    if (before.phase === "crash") break;
    await throwAt(page, (s) => s.stuck[0] ?? null, 25);
    await expect.poll(async () => {
      const s = await snapOf(page);
      return s ? s.phase === "crash" || s.stuck.length > before.stuck.length : false;
    }).toBe(true);
  }
  await expect(area).toHaveAttribute("data-phase", "crash");
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { events: body.events, sentScore: body.score };
}
