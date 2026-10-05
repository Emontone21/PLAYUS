import { expect, type Page } from "@playwright/test";
import { FIELD_H, FIELD_W, SLOT_CENTERS } from "../../src/games/hdp/sprites";

// Juega "hij@ de p**" desde el navegador: mira el estado de cada lugar en el
// dataset del área (fase, flecha, ticks que quedan, bloqueo) y desliza con el
// mouse sobre el que está a punto, hacia donde dice la flecha. Durante un
// tramo deja todo para que se queme alguna. Devuelve lo que mandó a /finish.

export interface Snap {
  tick: number;
  score: number;
  burns: number;
  end: boolean;
  slots: { phase: string; dir: string; remaining: number; blocked: boolean }[];
}

export function snapOf(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="hdp-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    const slots = [0, 1, 2, 3].map((i) => {
      const [phase = "", dir = "", rem = "0", blocked = "0"] = (d[`s${i}`] ?? "").split(":");
      return { phase, dir, remaining: Number(rem), blocked: blocked === "1" };
    });
    return { tick: Number(d.tick ?? -1), score: Number(d.score ?? 0), burns: Number(d.burns ?? 0), end: d.end === "1", slots };
  });
}

const DELTA: Record<string, [number, number]> = { up: [0, -60], down: [0, 60], left: [-60, 0], right: [60, 0] };

/** desliza con el mouse sobre un lugar en una dirección */
export async function swipeOn(page: Page, slot: number, dir: string): Promise<void> {
  const box = (await page.getByTestId("hdp-canvas").boundingBox())!;
  const [cx, cy] = SLOT_CENTERS[slot]!;
  const x = box.x + (cx / FIELD_W) * box.width;
  const y = box.y + (cy / FIELD_H) * box.height;
  const [dx, dy] = DELTA[dir] ?? [0, -60];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 2 });
  await page.mouse.move(x + dx, y + dy, { steps: 2 });
  await page.mouse.up();
}

/** juega la partida entera; entre `ignore[0]` y `ignore[1]` (ticks) no atiende nada */
export async function playHdp(page: Page, opts: { ignore?: [number, number] } = {}): Promise<{ score: number; burns: number; events: unknown[]; sentScore: number }> {
  const area = page.getByTestId("hdp-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 120_000 });
  const ignore = opts.ignore ?? [600, 1000];
  let last: Snap | null = null;
  let lastSwipeAt = 0;
  while (true) {
    const s = await snapOf(page);
    if (!s) break;
    last = s;
    if (s.end) break;
    const idle = s.tick >= ignore[0] && s.tick < ignore[1];
    if (!idle && Date.now() - lastSwipeAt > 120) {
      // la que tiene menos tiempo primero
      let pick = -1;
      s.slots.forEach((slot, i) => {
        if (slot.phase !== "ready" || slot.blocked) return;
        if (pick < 0 || slot.remaining < s.slots[pick]!.remaining) pick = i;
      });
      if (pick >= 0) {
        await swipeOn(page, pick, s.slots[pick]!.dir);
        lastSwipeAt = Date.now();
        continue;
      }
    }
    await page.waitForTimeout(30);
  }
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { score: last?.score ?? -1, burns: last?.burns ?? -1, events: body.events, sentScore: body.score };
}
