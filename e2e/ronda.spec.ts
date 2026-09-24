import { test, expect, type Browser, type Page } from "@playwright/test";

// El "listo cuando" del brief, de punta a punta: dos personas entran por un
// link, arman su avatar, juegan el juego del día, ven el ranking actualizarse,
// y al día siguiente (fecha simulada con /dev/hoy) encuentran el otro juego.

test.setTimeout(240_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

// Juega lo que sea que toque hoy: tap-race (toca N veces y espera el corte)
// o reflejo (toca cuando se pone verde). Devuelve el juego jugado.
async function playToday(page: Page, taps = 8): Promise<"tap-race" | "reflejo"> {
  await page.getByTestId("game-play").click();
  const tap = page.getByTestId("tap-area");
  const reflejo = page.getByTestId("reflejo-area");
  await expect(tap.or(reflejo)).toBeVisible({ timeout: 15_000 });
  if (await tap.isVisible()) {
    for (let i = 0; i < taps; i++) await tap.click();
    await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 25_000 });
    return "tap-race";
  }
  for (let round = 0; round < 5; round++) {
    await expect(reflejo).toHaveAttribute("data-phase", "go", { timeout: 8_000 });
    await reflejo.click();
    if (round < 4) await expect(reflejo).not.toHaveAttribute("data-phase", "go");
  }
  await expect(page.getByTestId("game-result")).toBeVisible({ timeout: 8_000 });
  return "reflejo";
}

test("dos personas juegan el juego del día, ven el ranking en vivo y al día siguiente hay otro juego", async ({ browser }) => {
  const a = await freshPage(browser);
  const b = await freshPage(browser);

  // A crea el grupo
  await a.page.goto("/crear");
  await a.page.getByPlaceholder("tu nombre").fill("Vale");
  await a.page.getByRole("button", { name: "seguir" }).click();
  await a.page.getByPlaceholder("los del barrio").fill("ronda e2e");
  await a.page.getByRole("button", { name: "crear grupo" }).click();
  await expect(a.page).toHaveURL(/\/grupo$/);
  const code = (await a.page.getByTestId("invite-code").textContent())?.trim() ?? "";

  // B entra por el link
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Nico");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  // Hoy, para A: el juego del día, sin ranking, "te quedan 3 intentos"
  await a.page.goto("/hoy");
  await expect(a.page.getByTestId("today-game")).toBeVisible();
  const gameName = (await a.page.getByTestId("today-game-name").textContent())?.trim() ?? "";
  expect(["tap race", "reflejo"]).toContain(gameName);
  await expect(a.page.getByTestId("attempts-left")).toContainText("te quedan 3 intentos");
  await expect(a.page.getByTestId("participants")).toContainText("todavía nadie jugó hoy");

  // A juega: el aviso de que recargar cuesta el intento aparece antes de la primera partida
  await a.page.getByTestId("play-link").click();
  await expect(a.page.getByTestId("game-warning")).toContainText("se pierde igual");
  const played = await playToday(a.page, 8);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  const scoreA = Number((await a.page.getByTestId("game-score").textContent())?.replace(/\D/g, ""));
  if (played === "tap-race") expect(scoreA).toBe(8);
  await a.page.getByTestId("game-done").click();

  // A ve el ranking con su fila, y le quedan 2 intentos
  await expect(a.page).toHaveURL(/\/hoy$/);
  await expect(a.page.getByTestId("today-ranking")).toBeVisible();
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(1);
  await expect(a.page.getByTestId("attempts-left")).toContainText("te quedan 2 intentos");

  // B todavía no jugó: ve que A jugó, pero no su puntaje
  await b.page.goto("/hoy");
  await expect(b.page.getByTestId("today-game")).toBeVisible();
  await expect(b.page.getByTestId("participants")).toContainText("ya jugaron 1");
  await expect(b.page.getByTestId("participants")).toContainText("Vale");
  await expect(b.page.getByTestId("participants")).not.toContainText(String(scoreA));

  // B juega y ve el ranking con los dos
  await b.page.getByTestId("play-link").click();
  await playToday(b.page, 5);
  await b.page.getByTestId("game-done").click();
  await expect(b.page.getByTestId("ranking-row")).toHaveCount(2);
  await expect(b.page.getByTestId("today-ranking")).toContainText("Vale");
  await expect(b.page.getByTestId("today-ranking")).toContainText("Nico");

  // A, sin tocar nada, ve aparecer a B (refresco en vivo)
  await expect(a.page.getByTestId("ranking-row")).toHaveCount(2, { timeout: 30_000 });
  await expect(a.page.getByTestId("today-ranking")).toContainText("Nico");

  // el ranking respeta la dirección del juego: el 1º lleva +10
  const first = a.page.getByTestId("ranking-row").first();
  await expect(first).toHaveAttribute("data-rank", "1");
  await expect(first).toContainText("+10");

  // el perfil ya tiene números
  await a.page.goto("/perfil");
  await expect(a.page.getByTestId("profile-stats")).toContainText("rondas jugadas");
  await expect(a.page.getByTestId("profile-stats")).not.toContainText("se llenan con tu primera partida");

  // día siguiente (fecha simulada, solo desarrollo) para los dos
  await a.page.goto("/dev/hoy/set?adelantar=1");
  await expect(a.page.getByTestId("fake-today")).not.toHaveText("real");
  await b.page.goto("/dev/hoy/set?adelantar=1");

  // Hoy para A: el OTRO juego, arriba quién ganó ayer, y otra vez 3 intentos
  await a.page.goto("/hoy");
  await expect(a.page.getByTestId("today-game")).toBeVisible();
  const nextGame = (await a.page.getByTestId("today-game-name").textContent())?.trim() ?? "";
  expect(nextGame).not.toBe(gameName);
  await expect(a.page.getByTestId("yesterday-winner")).toContainText("ayer");
  await expect(a.page.getByTestId("attempts-left")).toContainText("te quedan 3 intentos");

  // Grupo: la tabla de la temporada ya tiene el día cerrado, y el historial también
  await a.page.goto("/grupo");
  await expect(a.page.getByTestId("standings").getByTestId("ranking-row")).toHaveCount(2);
  await expect(a.page.getByTestId("history-row")).toHaveCount(1);
  await expect(a.page.getByTestId("history").first()).toContainText(gameName);

  // el perfil de un integrante desde la lista
  await a.page.getByTestId("member").filter({ hasText: "Nico" }).getByRole("link").click();
  await expect(a.page.getByTestId("member-name")).toContainText("Nico");
  await expect(a.page.getByTestId("profile-stats")).toContainText("rondas jugadas");

  // B, en el día siguiente, ve lo mismo
  await b.page.goto("/hoy");
  await expect(b.page.getByTestId("today-game-name")).toHaveText(nextGame);

  // volver al día real para no ensuciar otras pruebas
  await a.page.goto("/dev/hoy/set?reset=1");
  await b.page.goto("/dev/hoy/set?reset=1");
  await a.context.close();
  await b.context.close();
});
