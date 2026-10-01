import { test, expect, type Browser } from "@playwright/test";
import { autoTrace, check, simulate, type ActionEvent } from "../src/games/la-torre/rules";
import { loadRapier } from "../src/games/la-torre/physics";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { playTorre } from "./helpers/torre";

// Juego nuevo. La física de Rapier (WASM determinístico) tiene que dar
// exactamente lo mismo en el navegador y en Node, bit a bit: 24 semillas con
// el jugador automático (partidas enteras, con giros y caídas) y 4 partidas
// largas en modo libre de 120 s. Después, una partida que apila tres objetos
// bien y suelta el cuarto en el vacío llega al ranking con la altura correcta.

test.setTimeout(900_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

const SEEDS = Array.from({ length: 24 }, (_, i) => (i < 4 ? ["abc", "reporte", "intento-1", "7a2f577a"][i]! : `semilla-${i}`));
const BOT = { delayTicks: 3, errorPx: 2, speedErrorPx: 2, layFlat: true, balance: 0.5 };

test("la física da exactamente lo mismo en el navegador y en Node", async ({ page }) => {
  const R = await loadRapier();
  await page.goto("/dev/juego/la-torre?seed=abc");
  await expect(page.getByTestId("torre-card")).toBeVisible();
  await page.waitForFunction(() => "__torre" in window);
  await page.evaluate(async () => {
    const T = (window as unknown as { __torre: { loadRapier: () => Promise<unknown> } }).__torre;
    await T.loadRapier();
  });
  let bodies = 0;
  for (const seed of SEEDS) {
    const a = autoTrace(R, seed, BOT);
    const inputs = a.events.filter((e): e is ActionEvent => !("fin" in e));
    const replay = simulate(R, seed, inputs, a.result.endTick);
    expect(replay.snapshot, `replay en Node, semilla ${seed}`).toBe(a.result.snapshot);
    const inNode = JSON.stringify({ events: a.events, score: a.result.score, endTick: a.result.endTick, reason: a.result.endReason, dropped: a.result.dropped, snapshot: a.result.snapshot });
    const inBrowser = await page.evaluate(
      async ([s, bot]) => {
        type Rep = { score: number; endTick: number; endReason: string | null; dropped: number; snapshot: string };
        type T = { loadRapier: () => Promise<unknown>; autoTrace: (R: unknown, s: string, o: unknown) => { events: unknown[]; result: Rep } };
        const T = (window as unknown as { __torre: T }).__torre;
        const R = await T.loadRapier();
        const a = T.autoTrace(R, s, bot);
        return JSON.stringify({ events: a.events, score: a.result.score, endTick: a.result.endTick, reason: a.result.endReason, dropped: a.result.dropped, snapshot: a.result.snapshot });
      },
      [seed, BOT] as const,
    );
    expect(inBrowser, `semilla ${seed}`).toBe(inNode);
    bodies += a.result.dropped;
  }
  expect(bodies).toBeGreaterThan(SEEDS.length * 3);
  // partidas largas en modo libre: 120 s con muchos objetos, sin que se corte por una caída
  for (const seed of SEEDS.slice(0, 4)) {
    const a = autoTrace(R, seed, { ...BOT, free: true });
    expect(a.result.endTick).toBe(7200);
    const inBrowser = await page.evaluate(
      async ([s, bot]) => {
        type T = { loadRapier: () => Promise<unknown>; autoTrace: (R: unknown, s: string, o: unknown) => { events: unknown[]; result: { snapshot: string; dropped: number; endTick: number } } };
        const T = (window as unknown as { __torre: T }).__torre;
        const R = await T.loadRapier();
        const a = T.autoTrace(R, s, { ...bot, free: true });
        return JSON.stringify([a.result.snapshot, a.result.dropped, a.result.endTick]);
      },
      [seed, BOT] as const,
    );
    expect(inBrowser, `modo libre, semilla ${seed}`).toBe(JSON.stringify([a.result.snapshot, a.result.dropped, a.result.endTick]));
  }
});

test("la pantalla previa, el área sin scroll, girar y soltar, y una partida que apila tres y tira el cuarto", async ({ browser }) => {
  const a = await freshPage(browser);
  await a.page.goto("/dev/juego/la-torre?seed=abc");
  const card = a.page.getByTestId("torre-card");
  await expect(card).toContainText("se hamaca");
  await expect(card.getByRole("img", { name: "botella de whisky" })).toBeVisible();
  await a.page.getByTestId("game-play").click();
  const area = a.page.getByTestId("torre-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  await expect(area).toHaveAttribute("data-loaded", "1", { timeout: 20_000 });
  expect(await area.evaluate((el) => getComputedStyle(el).touchAction)).toBe("none");
  expect(await area.evaluate((el) => getComputedStyle(el).userSelect)).toBe("none");
  // el botón de girar mide al menos 64 px y gira de a 90°
  const btn = a.page.getByTestId("torre-rotate");
  const bb = (await btn.boundingBox())!;
  expect(bb.width).toBeGreaterThanOrEqual(64);
  expect(bb.height).toBeGreaterThanOrEqual(64);
  await expect(area).toHaveAttribute("data-waiting", /.+/, { timeout: 5_000 });
  await btn.dispatchEvent("pointerdown", { pointerType: "touch", button: 0, isPrimary: true });
  await expect(area).toHaveAttribute("data-rot", "1", { timeout: 2_000 });
  await btn.dispatchEvent("pointerdown", { pointerType: "touch", button: 0, isPrimary: true });
  await expect(area).toHaveAttribute("data-rot", "2", { timeout: 2_000 });
  await expect(a.page.getByTestId("torre-height")).toContainText("cm");
  await a.context.close();

  const b = await freshPage(browser);
  const code = await createGroupWithGame(b.page, "torre uno", "la torre");
  void code;
  await b.page.goto("/hoy/jugar");
  const seed = await startAndGetSeed(b.page);
  expect(seed).toMatch(/^[0-9a-f]{8}$/);
  const played = await playTorre(b.page, 3);
  expect(played.dropped).toBe(4);
  expect(played.reason).toBe("caida");
  await expect(b.page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  const shown = (await b.page.getByTestId("game-score").textContent())?.trim() ?? "";
  expect(shown).toMatch(/^\d+ cm$/);
  const score = Number(shown.replace(" cm", ""));
  expect(score).toBeGreaterThan(20);
  expect(played.score).toBe(score);
  // lo que mandó a /finish es lo que la traza recalculada da en Node, y el servidor lo aceptó
  const R = await loadRapier();
  const v = check(R, seed, played.events);
  expect(v.ok, JSON.stringify(v)).toBe(true);
  if (v.ok) expect(v.score).toBe(score);
  await expect(b.page.getByTestId("game-result")).toContainText("quedó guardado");
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(b.page.getByTestId("ranking-value").first()).toHaveText(new RegExp(`^\s*${score} cm\s*$`));
  await b.context.close();
});
