import { test, expect, type Browser } from "@playwright/test";

// La semilla es por intento y solo la da /start: dos jugadores reciben la
// misma en el mismo número de intento, cada intento propio trae otra, y la
// página de la partida no la contiene antes de tocar "jugar".

test.setTimeout(120_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("misma semilla para dos jugadores en el intento 1, otra en el intento 2, y nunca antes de empezar", async ({ browser }) => {
  const a = await freshPage(browser);
  const b = await freshPage(browser);

  await a.page.goto("/crear");
  await a.page.getByPlaceholder("tu nombre").fill("Ana");
  await a.page.getByRole("button", { name: "seguir" }).click();
  await a.page.getByPlaceholder("los del barrio").fill("semillas");
  await a.page.getByRole("button", { name: "crear grupo" }).click();
  await expect(a.page).toHaveURL(/\/grupo$/);
  const code = (await a.page.getByTestId("invite-code").textContent())?.trim() ?? "";

  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Beto");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  // empezar una partida y quedarse con lo que devuelve /start y con el HTML previo
  async function start(p: typeof a.page) {
    await p.goto("/hoy/jugar");
    await expect(p.getByTestId("game-play")).toBeVisible();
    const html = await p.content();
    const res = p.waitForResponse((r) => r.url().includes("/api/rounds/") && r.url().endsWith("/start"));
    await p.getByTestId("game-play").click();
    const body = (await (await res).json()) as { seed: string; attemptNumber: number };
    await expect(p.getByTestId("game-playing")).toBeVisible({ timeout: 15_000 });
    return { ...body, html };
  }

  const a1 = await start(a.page);
  const b1 = await start(b.page);
  expect(a1.attemptNumber).toBe(1);
  expect(b1.attemptNumber).toBe(1);
  expect(a1.seed).toBe(b1.seed);

  // recargar a mitad de partida gasta el intento; el siguiente trae otra semilla
  const a2 = await start(a.page);
  expect(a2.attemptNumber).toBe(2);
  expect(a2.seed).not.toBe(a1.seed);

  // la página de la partida no traía ninguna de las semillas antes de tocar "jugar"
  for (const { html } of [a1, b1, a2]) {
    expect(html).not.toContain(a1.seed);
    expect(html).not.toContain(a2.seed);
  }

  await a.context.close();
  await b.context.close();
});
