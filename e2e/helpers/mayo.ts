import { expect, type Page } from "@playwright/test";
import { CENTER, SUB } from "../../src/games/la-mayo/rules";

// Juega "la mayo" desde el navegador: emboca `hits` veces calculando en el
// test el tick en que el pomo pasa por el centro (con la posición, dirección
// y velocidad que expone el juego, las de la misma simulación que corre en
// Node) y tocando con la barra espaciadora cuando el juego llega a ese tick;
// después erra tres veces tocando cerca de un extremo. Devuelve lo que mandó
// a /finish.

export interface Snap {
  tick: number;
  pos: number;
  dir: number;
  speed: number;
  frozen: boolean;
  score: number;
  lives: number;
  end: string;
}

export function snapOf(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="mayo-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { tick: Number(d.tick ?? -1), pos: Number(d.pos ?? 0), dir: Number(d.dir ?? 1), speed: Number(d.speed ?? 0), frozen: d.frozen === "1", score: Number(d.score ?? 0), lives: Number(d.lives ?? 3), end: d.end ?? "" };
  });
}

/** espera una pasada que vaya hacia el objetivo y toca en el tick calculado (o apenas después) */
async function tapAt(page: Page, target: number, maxMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  let planned: number | null = null;
  let plannedDir = 0;
  while (Date.now() < deadline) {
    const s = await snapOf(page);
    if (!s || s.end) return false;
    if (s.frozen) {
      planned = null;
      await page.waitForTimeout(8);
      continue;
    }
    if (planned === null || plannedDir !== s.dir) {
      const ahead = s.dir === 1 ? s.pos < target : s.pos > target;
      if (ahead && s.speed > 0) {
        // la posición está en unidades; la velocidad en subunidades por tick
        planned = s.tick + Math.round((Math.abs(target - s.pos) * SUB) / s.speed);
        plannedDir = s.dir;
      } else {
        planned = null;
      }
    }
    if (planned !== null && s.tick >= planned - 1) {
      await page.keyboard.press("Space");
      return true;
    }
    await page.waitForTimeout(4);
  }
  return false;
}

export async function playMayo(page: Page, hits: number): Promise<{ score: number; lives: number; end: string; say: string; events: unknown[]; sentScore: number }> {
  const area = page.getByTestId("mayo-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  const finished = page.waitForRequest((r) => r.url().includes("/api/attempts/") && r.url().endsWith("/finish"), { timeout: 120_000 });
  for (let i = 0; i < hits; i++) {
    expect(await tapAt(page, CENTER, 20_000)).toBe(true);
    await expect.poll(async () => (await snapOf(page))?.score, { timeout: 5_000 }).toBe(i + 1);
    await expect.poll(async () => (await snapOf(page))?.frozen, { timeout: 5_000 }).toBe(false);
  }
  // y ahora tres errores: cerca del extremo hacia el que va
  for (let i = 0; i < 3; i++) {
    const s = await snapOf(page);
    if (!s || s.end) break;
    const target = s.dir === 1 ? 940 : 60;
    expect(await tapAt(page, target, 20_000)).toBe(true);
    await expect.poll(async () => (await snapOf(page))?.lives, { timeout: 5_000 }).toBe(2 - i);
    if (i < 2) await expect.poll(async () => (await snapOf(page))?.frozen, { timeout: 5_000 }).toBe(false);
  }
  await expect(area).toHaveAttribute("data-end", "vidas", { timeout: 10_000 });
  const last = await snapOf(page);
  // Remar enojado se ve un segundo antes del resultado
  const say = (await page.getByTestId("mayo-say").textContent({ timeout: 2_000 }).catch(() => "")) ?? "";
  const body = (await finished).postDataJSON() as { score: number; events: unknown[] };
  return { score: last?.score ?? -1, lives: last?.lives ?? -1, end: last?.end ?? "", say, events: body.events, sentScore: body.score };
}
