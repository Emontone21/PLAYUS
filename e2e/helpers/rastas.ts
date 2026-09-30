import { expect, type Page } from "@playwright/test";
import { greedyPolicy, initialState, rngFor, step, type Dir, type SimState } from "../../src/games/rastitas-rastotas/rules";

// Juega "rastitas rastotas" desde el navegador con la ruta calculada en Node
// por el bot codicioso: arma la lista de giros como "después del paso N,
// apretar la flecha D", y en el navegador espera a que la simulación haga
// ese paso (data-lastmove) para apretar la flecha, dentro de la misma ventana
// entre pasos. Come `cigs` cigarros y después deja de girar: la cabeza sigue
// derecho hasta un borde (o lo que haya) y la partida termina.

export interface Press {
  /** el tick del paso después del cual se aprieta */
  afterMove: number;
  dir: Dir;
}

/** arma los giros recorriendo la simulación con una política que puede devolver varios giros por paso */
export function planWith(seed: string, policy: (s: SimState) => Dir[], init?: (s: SimState) => void): { presses: Press[]; final: SimState } {
  const rng = rngFor(seed);
  const s = initialState(rng);
  init?.(s);
  const presses: Press[] = [];
  while (!s.end) {
    const dirs = policy(s);
    for (const d of dirs) presses.push({ afterMove: s.lastMove, dir: d });
    step(s, rng, dirs);
  }
  return { presses, final: s };
}

/** los primeros pasos van derecho: el navegador tiene ese margen para llegar al primer giro (contra producción el arranque es más lento) */
const STRAIGHT_TICKS = 36;

export function planFor(seed: string, cigs: number): Press[] {
  const bot = greedyPolicy();
  return planWith(seed, (s) => {
    if (s.cigs >= cigs || s.lastMove < STRAIGHT_TICKS) return [];
    const d = bot(s);
    return d ? [d] : [];
  }).presses;
}

const KEY: Record<Dir, string> = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

export interface Snap {
  tick: number;
  lastMove: number;
  end: string;
  score: number;
  boost: boolean;
}

/** el estado que publica el área del juego, o null si ya no está (pantalla de resultado) */
export function snapOf(page: Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="rastas-area"]') as HTMLElement | null;
    if (!el) return null;
    const d = el.dataset;
    return { tick: Number(d.tick ?? -1), lastMove: Number(d.lastmove ?? -1), end: d.end ?? "", score: Number(d.score ?? 0), boost: d.boost === "1" };
  });
}

/** aprieta las flechas del plan a medida que la simulación avanza; corta al final, cuando el área desaparece o cuando `stop` dice */
export async function drive(page: Page, presses: Press[], stop?: (s: Snap) => boolean, maxMs = 120_000): Promise<Snap | null> {
  let i = 0;
  let last: Snap | null = null;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const s = await snapOf(page);
    if (!s) return last;
    last = s;
    if (s.end || stop?.(s)) return s;
    const p = presses[i];
    if (p && s.lastMove >= p.afterMove) {
      await page.keyboard.press(KEY[p.dir]);
      i++;
      // los giros seguidos del mismo paso van uno atrás del otro
      continue;
    }
    await page.waitForTimeout(8);
  }
  return last;
}

export async function playRastas(page: Page, seed: string, cigs: number): Promise<number> {
  const area = page.getByTestId("rastas-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  await drive(page, planFor(seed, cigs));
  // el final: el área publica data-end un segundo y después viene la pantalla de resultado
  await page.waitForFunction(
    () => {
      const a = document.querySelector('[data-testid="rastas-area"]') as HTMLElement | null;
      return (a && !!a.dataset.end) || !!document.querySelector('[data-testid="game-result"]');
    },
    undefined,
    { timeout: 60_000 },
  );
  await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 15_000 });
  return Number(await page.getByTestId("game-score").textContent());
}
