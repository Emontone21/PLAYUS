import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { createGroupWithGame } from "./helpers/group";
import { isProd, localGroupSeason, loginAsAdmin } from "./helpers/admin";
import { gameForDay } from "../src/lib/deck";
import { addDays, daysBetween, todayInTz } from "../src/lib/time";

// La administración general del panel de admin (decisiones 278 a 283). Los
// permisos se prueban en cualquier entorno (también contra producción); el
// resto solo contra el stack local, donde el E2E puede entrar como admin.
// Con CAPTURAS=1 guarda las capturas del reporte en reports/admin-general/.

test.setTimeout(400_000);

const PAGES = ["/admin/grupos", "/admin/usuarios", "/admin/juegos", "/admin/avisos", "/admin/registro", "/admin/grupos/00000000-0000-4000-8000-000000000001", "/admin/usuarios/00000000-0000-4000-8000-000000000001"];
const ACTIONS = ["group-test", "delete-group", "delete-user", "cleanup-test", "delete-orphans", "remove-member", "change-owner", "reset-season", "toggle-game", "push-test", "push-announce"];

const OUT = path.resolve(__dirname, "../reports/admin-general");
async function shot(page: Page, name: string, opts: { full?: boolean; focus?: Locator } = {}) {
  if (!process.env.CAPTURAS) return;
  mkdirSync(OUT, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal{display:none}" });
  if (opts.focus) await opts.focus.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: opts.full ?? false });
}

async function fresh(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("sin ser admin, todas las páginas nuevas responden 404 y todos los endpoints nuevos 403", async ({ browser }) => {
  const a = await fresh(browser);
  for (const p of PAGES) expect((await a.page.goto(p))?.status(), p).toBe(404);
  for (const x of ACTIONS) {
    expect((await a.page.request.post(`/api/admin/${x}`, { data: { dryRun: true } })).status(), x).toBe(403);
    expect((await a.page.request.get(`/api/admin/${x}`)).status(), x).toBe(403);
  }
  // con sesión anónima sin email
  await a.page.goto("/");
  await expect(a.page.getByRole("link", { name: "crear un grupo" })).toBeVisible();
  for (const p of PAGES) expect((await a.page.goto(p))?.status(), p).toBe(404);
  for (const x of ACTIONS) expect((await a.page.request.post(`/api/admin/${x}`, { data: { dryRun: true } })).status(), x).toBe(403);
  await a.context.close();
});

test.describe("con el admin (solo contra el stack local)", () => {
  test.skip(isProd(), "en producción no hay forma de entrar como admin sin el magic link del dueño");

  test("el admin marca un grupo como prueba, lo limpia con \"limpiar\" y el grupo y sus usuarios desaparecen", async ({ browser }) => {
    // la integrante crea su grupo
    const m = await fresh(browser);
    const code = await createGroupWithGame(m.page, "Ana", "la mayo");

    const a = await fresh(browser);
    await loginAsAdmin(a.context);
    await a.page.goto("/admin/grupos");
    await expect(a.page.getByTestId("admin-tabs")).toBeVisible();
    await shot(a.page, "grupos");
    // el grupo del seed viene marcado como de prueba: se desmarca para que la limpieza no se lo lleve (lo usan otros E2E);
    // y cualquier otro que haya quedado marcado de una corrida anterior, también
    const seed = a.page.locator('[data-testid="admin-group-row"][data-code="JUEGA7"]');
    const seedWasTest = (await seed.count()) > 0 && (await seed.getByTestId("admin-test-switch").getAttribute("data-checked")) === "1";
    const marked = a.page.locator('[data-testid="admin-group-row"][data-test="1"]');
    for (const sw of await marked.getByTestId("admin-test-switch").all()) {
      await sw.click();
      await expect(sw).toHaveAttribute("data-checked", "0");
    }
    await a.page.reload();
    await expect(marked).toHaveCount(0);

    // marca el grupo nuevo
    const row = a.page.locator(`[data-testid="admin-group-row"][data-code="${code}"]`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("admin-group-game")).toContainText("la mayo");
    await row.getByTestId("admin-test-switch").click();
    await expect(row.getByTestId("admin-test-switch")).toHaveAttribute("data-checked", "1");
    const groupId = (await row.getAttribute("data-group-id")) ?? "";
    // el detalle: la integrante, dueña, con su id
    await row.getByTestId("admin-group-link").click();
    await expect(a.page.getByTestId("admin-group-detail")).toHaveAttribute("data-group-id", groupId);
    const member = a.page.getByTestId("admin-member").first();
    await expect(member).toHaveAttribute("data-role", "owner");
    const profileId = (await member.getAttribute("data-profile-id")) ?? "";
    await expect(a.page.getByTestId("admin-member-owner-note")).toBeVisible();
    await shot(a.page, "grupo-detalle", { full: true });

    // limpiar: vista previa con conteos, confirmación escrita, hecho
    await a.page.goto("/admin/grupos");
    await a.page.getByTestId("admin-cleanup").click();
    const preview = a.page.getByTestId("admin-cleanup-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("se borran 1 grupo de prueba");
    await expect(preview).toContainText("1 integrante, 1 temporada, 1 ronda y 0 intentos");
    await expect(preview).toContainText("se borra a 1 usuario que queda sin ningún grupo: Ana");
    await expect(a.page.getByTestId("admin-cleanup-confirm")).toBeDisabled();
    await shot(a.page, "limpiar-vista-previa", { focus: preview });
    await a.page.getByTestId("admin-cleanup-word").fill("limpia");
    await expect(a.page.getByTestId("admin-cleanup-confirm")).toBeDisabled();
    await a.page.getByTestId("admin-cleanup-word").fill("limpiar");
    await expect(a.page.getByTestId("admin-cleanup-confirm")).toBeEnabled();
    await shot(a.page, "limpiar-confirmacion", { focus: preview });
    await a.page.getByTestId("admin-cleanup-confirm").click();
    await expect(a.page.getByTestId("admin-cleanup-done")).toContainText("se borraron 1 grupos de prueba y 1 usuarios");
    await expect(a.page.locator(`[data-testid="admin-group-row"][data-code="${code}"]`)).toHaveCount(0);
    // el usuario ya no existe
    const gone = await a.page.request.post("/api/admin/delete-user", { data: { profileId, dryRun: true } });
    expect(gone.status()).toBe(404);
    // y quedó en el registro
    await a.page.goto("/admin/registro");
    const entry = a.page.locator('[data-testid="admin-log-entry"][data-action="cleanup_test"]').first();
    await expect(entry).toContainText("limpió los datos de prueba");
    await expect(entry).toContainText("usuarios borrados (1): Ana");
    await shot(a.page, "registro");

    // el grupo del seed vuelve a quedar marcado
    if (seedWasTest) {
      await a.page.goto("/admin/grupos");
      await seed.getByTestId("admin-test-switch").click();
      await expect(seed.getByTestId("admin-test-switch")).toHaveAttribute("data-checked", "1");
    }
    await m.context.close();
    await a.context.close();
  });

  test("el admin deshabilita un juego y la ronda de mañana, simulada, no lo usa; la de hoy no cambia", async ({ browser }) => {
    const m = await fresh(browser);
    const code = await createGroupWithGame(m.page, "Beto", "la mayo");
    const g = await localGroupSeason(code);
    expect(g.season).not.toBeNull();
    const tomorrow = addDays(todayInTz(g.timezone), 1);

    const a = await fresh(browser);
    await loginAsAdmin(a.context);
    await a.page.goto("/admin/juegos");
    const rows = a.page.locator('[data-testid^="admin-game-row-"]');
    const ids = (await rows.evaluateAll((els) => els.map((e) => (e.getAttribute("data-testid") ?? "").replace("admin-game-row-", "")))).sort();
    expect(ids.length).toBeGreaterThan(1);
    // todos en rotación al arrancar (si quedó alguno apagado de otra corrida, se prende)
    for (const id of ids) {
      const sw = a.page.getByTestId(`admin-rotation-${id}`);
      if ((await sw.getAttribute("data-checked")) === "0") {
        await sw.click();
        await expect(sw).toHaveAttribute("data-checked", "1");
      }
    }
    // el juego que le tocaría mañana a este grupo con el mazo completo
    const dayIndex = Math.max(0, daysBetween(g.season!.starts_on, tomorrow));
    const wouldBe = gameForDay(g.id, g.season!.number, dayIndex, ids);
    const sw = a.page.getByTestId(`admin-rotation-${wouldBe}`);
    await sw.click();
    await expect(sw).toHaveAttribute("data-checked", "0");
    await expect(a.page.getByTestId(`admin-rotation-note-${wouldBe}`)).toContainText("no sale en las rondas que se creen desde ahora");
    await expect(a.page.getByTestId("admin-games-count")).toContainText(`${ids.length - 1} de ${ids.length} en rotación`);
    await shot(a.page, "juegos");

    // la integrante, mañana: otro juego, el del mazo sin el deshabilitado
    await m.page.goto("/dev/hoy/set?adelantar=1");
    await expect(m.page.getByTestId("fake-today")).toHaveText(tomorrow);
    await m.page.goto("/hoy");
    const expected = gameForDay(g.id, g.season!.number, dayIndex, ids.filter((x) => x !== wouldBe));
    const shown = (await m.page.getByTestId("today-game-name").textContent())?.trim();
    const nameOf = async (id: string) => (await a.page.locator(`[data-testid="admin-game-row-${id}"] .display`).first().textContent())?.trim();
    expect(shown).not.toBe(await nameOf(wouldBe));
    expect(shown).toBe(await nameOf(expected));
    // la ronda de hoy sigue igual
    await m.page.goto("/dev/hoy/set?reset=1");
    await m.page.goto("/hoy");
    await expect(m.page.getByTestId("today-game-name")).toHaveText("la mayo");

    // se vuelve a prender: entra en el mazo desde la próxima ronda
    await sw.click();
    await expect(sw).toHaveAttribute("data-checked", "1");
    await expect(a.page.getByTestId(`admin-rotation-note-${wouldBe}`)).toContainText("entra en el mazo");
    await m.context.close();
    await a.context.close();
  });

  test("usuarios, avisos y las vistas previas de borrar un grupo y un usuario", async ({ browser }) => {
    const m = await fresh(browser);
    const code = await createGroupWithGame(m.page, "Caro", "la mayo");
    const a = await fresh(browser);
    await loginAsAdmin(a.context);

    // usuarios: filtros y detalle
    await a.page.goto("/admin/usuarios");
    await a.page.getByTestId("admin-user-filter-anonimos").click();
    await a.page.getByTestId("admin-user-search").fill("Caro");
    const urow = a.page.getByTestId("admin-user-row").first();
    await expect(urow).toContainText("Caro");
    await expect(urow.getByTestId("admin-user-email")).toHaveText("anónimo");
    await shot(a.page, "usuarios");
    await urow.getByTestId("admin-user-link").click();
    await expect(a.page.getByTestId("admin-user-name")).toHaveText("Caro");
    // es dueña: no se puede borrar hasta pasar la propiedad
    await expect(a.page.getByTestId("admin-user-owner-note")).toContainText("es dueño de");
    await a.page.getByTestId("admin-delete-user").click();
    await expect(a.page.getByTestId("admin-delete-user-blocked")).toContainText("antes pasale la propiedad");
    await expect(a.page.getByTestId("admin-delete-user-confirm")).toHaveCount(0);
    await shot(a.page, "usuario-dueno-bloqueado", { full: true });

    // borrar el grupo: vista previa con conteos, confirmación con el nombre, aviso de grupo real
    await a.page.goto("/admin/grupos");
    const row = a.page.locator(`[data-testid="admin-group-row"][data-code="${code}"]`);
    const groupId = (await row.getAttribute("data-group-id")) ?? "";
    await a.page.goto(`/admin/grupos/${groupId}`);
    await expect(a.page.getByTestId("admin-group-real")).toBeVisible();
    await a.page.getByTestId("admin-delete-group").click();
    const preview = a.page.getByTestId("admin-delete-group-preview");
    await expect(preview).toContainText("con 1 integrante, 1 temporada, 1 ronda y 0 intentos");
    await expect(a.page.getByTestId("admin-delete-group-warning")).toContainText("no está marcado como de prueba");
    // la opción viene desmarcada porque no es de prueba; al marcarla, la vista previa dice a quién borra
    await expect(a.page.getByTestId("admin-delete-group-option")).not.toBeChecked();
    await expect(preview).toContainText("1 usuario queda sin ningún grupo y no se borran: Caro");
    await a.page.getByTestId("admin-delete-group-option").check();
    await expect(preview).toContainText("también se borra a 1 usuario que queda sin ningún grupo: Caro");
    await a.page.getByTestId("admin-delete-group-word").fill("otro nombre");
    await expect(a.page.getByTestId("admin-delete-group-confirm")).toBeDisabled();
    await shot(a.page, "borrar-grupo-vista-previa", { focus: preview });
    await a.page.getByTestId("admin-delete-group-cancel").click();

    // avisos: la prueba sin suscripción avisa; el anuncio muestra la vista previa y cuántas personas
    await a.page.goto("/admin/avisos");
    await a.page.getByTestId("admin-push-test-button").click();
    await expect(a.page.getByTestId("admin-push-test-error").or(a.page.getByTestId("admin-push-test-done"))).toBeVisible();
    await a.page.getByTestId("admin-announce-text").fill("hoy a las 21 hay un juego especial");
    await expect(a.page.getByTestId("admin-announce-count")).toContainText("34 de 120");
    await a.page.getByTestId("admin-announce-preview").click();
    await expect(a.page.getByTestId("admin-announce-mock-body")).toHaveText("hoy a las 21 hay un juego especial");
    await expect(a.page.getByTestId("admin-announce-recipients")).toBeVisible();
    await shot(a.page, "anuncio", { full: true });
    // el texto largo no pasa
    await a.page.getByTestId("admin-announce-text").fill("x".repeat(121));
    await expect(a.page.getByTestId("admin-announce-preview")).toBeDisabled();
    await m.context.close();
    await a.context.close();
  });
});
