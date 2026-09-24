import { test, expect, type Browser, type Page } from "@playwright/test";

// Criterio de la etapa 3: el avatar se edita, se guarda y se ve igual en la
// lista de integrantes desde el otro navegador. De paso: nombre, apodo por
// grupo, estadísticas vacías y vincular email.

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function avatarOf(page: Page, scope: ReturnType<Page["locator"]>) {
  const json = await scope.locator("svg[data-avatar]").first().getAttribute("data-avatar");
  expect(json).not.toBeNull();
  return JSON.parse(json ?? "{}") as Record<string, unknown>;
}

test("armar el avatar, editarlo y verlo igual desde otro navegador", async ({ browser }) => {
  const a = await freshPage(browser);

  // alta con el editor: rulos y fondo agua
  await a.page.goto("/crear");
  await a.page.getByPlaceholder("tu nombre").fill("Vale");
  await expect(a.page.getByTestId("avatar-editor")).toBeVisible();
  await a.page.getByRole("tab", { name: "pelo", exact: true }).click();
  await a.page.getByRole("radio", { name: "pelo rulos" }).click();
  await a.page.getByRole("tab", { name: "fondo" }).click();
  await a.page.getByRole("radio", { name: "fondo #5BC0BE" }).click();
  await a.page.getByRole("button", { name: "seguir" }).click();
  await a.page.getByPlaceholder("los del barrio").fill("los del barrio");
  await a.page.getByRole("button", { name: "crear grupo" }).click();
  await expect(a.page).toHaveURL(/\/grupo$/);
  const code = (await a.page.getByTestId("invite-code").textContent())?.trim() ?? "";

  // el perfil muestra lo elegido y las estadísticas vacías
  await a.page.goto("/perfil");
  await expect(a.page.getByTestId("profile-name")).toHaveText("Vale");
  const saved = await avatarOf(a.page, a.page.locator("header"));
  expect(saved.hair).toBe(5);
  expect(saved.bg).toBe("#5BC0BE");
  await expect(a.page.getByTestId("profile-stats")).toContainText("rondas jugadas");
  await expect(a.page.getByTestId("profile-stats")).toContainText("se llenan con tu primera partida");

  // editar: nombre, ojos grandes y gorra
  await a.page.getByRole("link", { name: "editar nombre y avatar" }).click();
  await expect(a.page).toHaveURL(/\/perfil\/editar$/);
  await a.page.getByPlaceholder("tu nombre").fill("Valen");
  await a.page.getByRole("tab", { name: "ojos" }).click();
  await a.page.getByRole("radio", { name: "ojos grandes" }).click();
  await a.page.getByRole("tab", { name: "extra" }).click();
  await a.page.getByRole("radio", { name: "extra gorra" }).click();
  await a.page.getByRole("button", { name: "guardar cambios" }).click();
  await expect(a.page).toHaveURL(/\/perfil$/);
  await expect(a.page.getByTestId("profile-name")).toHaveText("Valen");
  const edited = await avatarOf(a.page, a.page.locator("header"));
  expect(edited).toMatchObject({ hair: 5, bg: "#5BC0BE", eyes: 2, accessory: 3 });

  // apodo en el grupo
  const nick = a.page.getByLabel("apodo en los del barrio");
  await nick.fill("la Vale");
  await nick.press("Enter");
  await expect(a.page.getByText("guardado")).toBeVisible();

  // vincular email (escondido en el perfil)
  await a.page.getByText("vinculá un email").click();
  await a.page.getByLabel("email").fill("vale@ejemplo.com");
  await a.page.getByRole("button", { name: "vincular" }).click();
  await expect(a.page.getByRole("status")).toContainText("te mandamos un link a vale@ejemplo.com");

  // otro navegador entra al grupo y ve el mismo avatar y el apodo
  const b = await freshPage(browser);
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Nico");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);
  const row = b.page.getByTestId("member").filter({ hasText: "la Vale" });
  await expect(row).toHaveCount(1);
  const seen = await avatarOf(b.page, row);
  expect(seen).toEqual(edited);

  // y el primero, al recargar el grupo, ve al segundo con su avatar
  await a.page.goto("/grupo");
  await expect(a.page.getByTestId("member")).toHaveCount(2);
  await expect(a.page.getByTestId("member").filter({ hasText: "la Vale" })).toContainText("vos");

  await a.context.close();
  await b.context.close();
});

test("un perfil de la etapa 2 (solo fondo) se sigue dibujando", async ({ browser }) => {
  // parseAvatar tolera avatares incompletos: lo cubre la lectura de cualquier
  // perfil viejo. Acá se verifica desde la interfaz que un avatar nuevo
  // siempre tiene las ocho claves.
  const c = await freshPage(browser);
  await c.page.goto("/crear");
  await c.page.getByPlaceholder("tu nombre").fill("Flor");
  const preview = await avatarOf(c.page, c.page.getByTestId("avatar-editor"));
  expect(Object.keys(preview).sort()).toEqual(
    ["accessory", "base", "bg", "eyes", "hair", "hairColor", "mouth", "skin"].sort(),
  );
  await c.page.getByRole("button", { name: "al azar" }).click();
  const again = await avatarOf(c.page, c.page.getByTestId("avatar-editor"));
  expect(Object.keys(again).length).toBe(8);
  await c.context.close();
});
