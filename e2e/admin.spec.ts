import { test, expect, type Browser } from "@playwright/test";
import { createGroupWithGame } from "./helpers/group";
import { startAndGetSeed } from "./helpers/piba";
import { cutWith, linesFor, playClase } from "./helpers/clase";
import { isProd, loginAsAdmin } from "./helpers/admin";

// El panel de admin. Los permisos se prueban en cualquier entorno (también
// contra producción); el resto solo contra el stack local, donde el E2E puede
// crear al admin con contraseña y meter su sesión en el navegador.

test.setTimeout(400_000);

async function fresh(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("sin ser admin, /admin y /admin/jugar son 404 y /api/admin/* da 403; en producción, /dev/juego/* también es 404", async ({ browser }) => {
  // sin sesión
  const a = await fresh(browser);
  expect((await a.page.goto("/admin"))?.status()).toBe(404);
  expect((await a.page.goto("/admin/jugar"))?.status()).toBe(404);
  expect((await a.page.request.post("/api/admin/validate", { data: {} })).status()).toBe(403);
  expect((await a.page.request.post("/api/admin/set-game", { data: {} })).status()).toBe(403);
  expect((await a.page.request.get("/api/admin/set-game")).status()).toBe(403);
  // con sesión anónima sin email (la crea la landing)
  await a.page.goto("/");
  await expect(a.page.getByRole("link", { name: "crear un grupo" })).toBeVisible();
  expect((await a.page.goto("/admin"))?.status()).toBe(404);
  expect((await a.page.goto("/admin/jugar"))?.status()).toBe(404);
  expect((await a.page.request.post("/api/admin/validate", { data: { gameId: "la-mayo", seed: "x", result: { score: 0, events: [] }, elapsedMs: 5000 } })).status()).toBe(403);
  if (isProd()) {
    expect((await a.page.goto("/dev/juego/la-mayo?seed=abc"))?.status()).toBe(404);
    expect((await a.page.goto("/dev/juego"))?.status()).toBe(404);
  }
  await a.context.close();
});

test.describe("con el admin (solo contra el stack local)", () => {
  test.skip(isProd(), "en producción no hay forma de entrar como admin sin el magic link del dueño");

  test("el admin entra al panel, ve el link en Perfil y las herramientas de un juego", async ({ browser }) => {
    const a = await fresh(browser);
    await loginAsAdmin(a.context);
    const res = await a.page.goto("/admin");
    expect(res?.status()).toBe(200);
    await expect(a.page.getByTestId("admin-panel")).toContainText("panel de admin");
    await expect(a.page.getByTestId("admin-email")).toContainText("admin-e2e@frog.test");
    expect((await a.page.goto("/admin/jugar"))?.status()).toBe(200);
    await expect(a.page.getByTestId("admin-games").getByTestId("admin-game-la-mayo")).toBeVisible();
    expect((await a.page.goto("/dev/juego/la-mayo?seed=abc"))?.status()).toBe(200);
    expect((await a.page.request.post("/api/admin/validate", { data: { gameId: "no-existe", seed: "x", result: { score: 0, events: [] }, elapsedMs: 5000 } })).status()).toBe(400);
    await a.context.close();
  });

  test("el admin cambia el juego de hoy de un grupo con intentos; el integrante en Hoy ve el juego nuevo sin recargar y tiene sus 3 intentos", async ({ browser }) => {
    // la integrante: crea el grupo con clase con el bro y juega una vez
    const m = await fresh(browser);
    const code = await createGroupWithGame(m.page, "Ana", "clase con el bro");
    await m.page.goto("/hoy/jugar");
    const seed = await startAndGetSeed(m.page);
    await playClase(m.page, seed);
    await expect(m.page.getByTestId("game-result")).toContainText("quedó guardado");
    await m.page.getByTestId("game-done").click();
    await expect(m.page.getByTestId("today-ranking")).toBeVisible();

    // el admin: ve el grupo con su intento y cambia el juego a la mayo
    const a = await fresh(browser);
    await loginAsAdmin(a.context);
    await a.page.goto("/admin");
    const card = a.page.locator(`[data-testid="admin-group"][data-code="${code}"]`);
    await expect(card).toBeVisible();
    await expect(card.getByTestId("admin-group-game")).toHaveText("clase con el bro");
    await expect(card.getByTestId("admin-group-attempts")).toContainText("1 intento de 1 persona");
    await card.getByTestId("admin-group-select").selectOption("la-mayo");
    await expect(card.getByTestId("admin-warning")).toContainText("se van a borrar 1 intentos de hoy de 1 persona, y van a poder volver a jugar con 3 intentos");
    // el botón que borra aparece recién después del primer toque
    await expect(card.getByTestId("admin-delete-and-change")).toHaveCount(0);
    await card.getByTestId("admin-arm").click();
    await card.getByTestId("admin-delete-and-change").click();
    await expect(card.getByTestId("admin-done")).toContainText("1 intentos borrados");
    await expect(card.getByTestId("admin-group-game")).toHaveText("la mayo");
    await expect(card.getByTestId("admin-group-attempts")).toContainText("0 intentos");
    await expect(a.page.getByTestId("admin-actions").getByTestId("admin-action").first()).toContainText("la mayo");

    // la integrante, sin recargar: el juego nuevo, el aviso y los 3 intentos
    await expect(m.page.getByTestId("round-changed")).toBeVisible({ timeout: 25_000 });
    await expect(m.page.getByTestId("today-game-name")).toHaveText("la mayo");
    await expect(m.page.getByTestId("attempts-left")).toContainText("te quedan 3 intentos");

    // "el que toca en el mazo" también pasa por la confirmación simple (ya no hay intentos)
    await card.getByTestId("admin-group-select").selectOption("deck");
    await expect(card.getByTestId("admin-confirm")).toContainText("el que toca en el mazo");
    await card.getByTestId("admin-change").click();
    await expect(card.getByTestId("admin-done")).toContainText("listo");
    await m.context.close();
    await a.context.close();
  });

  test("quien estaba jugando cuando se borró su intento ve el aviso de que el juego cambió, no un error genérico", async ({ browser }) => {
    const m = await fresh(browser);
    const code = await createGroupWithGame(m.page, "Beto", "clase con el bro");
    await m.page.goto("/hoy/jugar");
    const seed = await startAndGetSeed(m.page);
    // mientras juega, el admin cambia el juego
    const a = await fresh(browser);
    await loginAsAdmin(a.context);
    const res = await a.page.request.post("/api/admin/set-game", { data: { groupId: await groupIdOf(a, code), gameId: "la-mayo" } });
    expect(res.status()).toBe(200);
    expect(((await res.json()) as { deletedAttempts: number }).deletedAttempts).toBe(1);
    // termina la partida: /finish no encuentra el intento
    const played = await playClase(m.page, seed).catch(() => null);
    void played;
    await expect(m.page.getByTestId("game-error")).toContainText("el juego de hoy cambió mientras jugabas. tenés tus 3 intentos de nuevo.", { timeout: 60_000 });
    await m.page.getByRole("button", { name: "volver" }).click();
    await expect(m.page).toHaveURL(/\/hoy/);
    await expect(m.page.getByTestId("today-game-name")).toHaveText("la mayo");
    await expect(m.page.getByTestId("attempts-left")).toContainText("te quedan 3 intentos");
    await m.context.close();
    await a.context.close();
  });

  test("el admin juega un juego en /admin/jugar con una semilla y ve \"validado\"", async ({ browser }) => {
    const a = await fresh(browser);
    await loginAsAdmin(a.context);
    await a.page.goto("/admin/jugar");
    await a.page.getByTestId("admin-game-clase-con-el-bro").click();
    await a.page.getByTestId("admin-seed").fill("prueba-admin");
    await a.page.getByTestId("admin-attempt-2").click();
    await a.page.getByTestId("admin-play").click();
    await a.page.getByTestId("game-play").click();
    const area = a.page.getByTestId("clase-area");
    await expect(area).toBeVisible({ timeout: 15_000 });
    const lines = linesFor("prueba-admin");
    for (let i = 0; i < lines.length; i++) {
      await expect(area).toHaveAttribute("data-cut", String(i), { timeout: 20_000 });
      await expect(area).toHaveAttribute("data-phase", "aim", { timeout: 20_000 });
      await cutWith(a.page, lines[i]!);
      await expect(area).not.toHaveAttribute("data-phase", "aim", { timeout: 5_000 });
    }
    await expect(a.page.getByTestId("admin-validation")).toHaveAttribute("data-valid", "1", { timeout: 30_000 });
    await expect(a.page.getByTestId("admin-validation")).toContainText("validado");
    const score = await a.page.getByTestId("game-score").textContent();
    await expect(a.page.getByTestId("admin-recomputed")).toHaveText(score!.trim());
    await expect(a.page.getByTestId("game-result")).toContainText("validada en el servidor, sin guardar");
    await a.context.close();
  });
});

async function groupIdOf(a: { page: import("@playwright/test").Page }, code: string): Promise<string> {
  await a.page.goto("/admin");
  const card = a.page.locator(`[data-testid="admin-group"][data-code="${code}"]`);
  await expect(card).toBeVisible();
  return (await card.getAttribute("data-group-id")) ?? "";
}
