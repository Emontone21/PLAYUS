import { test, expect, type Browser } from "@playwright/test";

// Criterio de la etapa 2: una ventana normal crea el grupo, una de incógnito
// entra por el link en menos de 15 segundos, y ambas ven la lista de
// integrantes. Cada contexto de Playwright es una "ventana de incógnito".

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test("crear un grupo, invitar por link y ver la lista en los dos lados", async ({ browser }) => {
  // ventana normal: crea el grupo
  const a = await freshPage(browser);
  await a.page.goto("/");
  await expect(a.page.getByRole("heading", { name: "playus" })).toBeVisible();
  await a.page.getByRole("link", { name: "crear un grupo" }).click();

  await a.page.getByPlaceholder("tu nombre").fill("Vale");
  await a.page.getByRole("tab", { name: "fondo" }).click();
  await a.page.getByRole("radio", { name: "fondo #5BC0BE" }).click();
  await a.page.getByRole("button", { name: "seguir" }).click();

  await a.page.getByPlaceholder("los del barrio").fill("los pibes");
  await a.page.getByRole("button", { name: "crear grupo" }).click();

  await expect(a.page).toHaveURL(/\/grupo$/);
  await expect(a.page.getByTestId("group-name")).toHaveText("los pibes");
  await expect(a.page.getByTestId("member")).toHaveCount(1);
  await expect(a.page.getByTestId("members")).toContainText("Vale");
  await expect(a.page.getByTestId("members")).toContainText("vos");

  const code = (await a.page.getByTestId("invite-code").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  await expect(a.page.getByTestId("invite-link")).toHaveText(new RegExp(`/g/${code}$`));

  // incógnito: entra por el link
  const b = await freshPage(browser);
  const started = Date.now();
  await b.page.goto(`/g/${code}`);
  await expect(b.page.getByText("te invitaron a un grupo")).toBeVisible();
  await b.page.getByPlaceholder("tu nombre").fill("Nico");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();

  await expect(b.page).toHaveURL(/\/grupo$/);
  await expect(b.page.getByTestId("group-name")).toHaveText("los pibes");
  await expect(b.page.getByTestId("member")).toHaveCount(2);
  const elapsed = Date.now() - started;
  expect(elapsed, "entrar por el link tiene que tardar menos de 15 s").toBeLessThan(15_000);

  await expect(b.page.getByTestId("members")).toContainText("Vale");
  await expect(b.page.getByTestId("members")).toContainText("Nico");

  // la ventana normal, al recargar, ve a los dos
  await a.page.reload();
  await expect(a.page.getByTestId("member")).toHaveCount(2);
  await expect(a.page.getByTestId("members")).toContainText("Nico");

  // con grupo, la raíz manda a Hoy; sin sesión, la raíz es la landing
  await a.page.goto("/");
  await expect(a.page).toHaveURL(/\/hoy$/);

  // volver a abrir el link con la sesión ya armada no pide nombre de nuevo
  await b.page.goto(`/g/${code}`);
  await expect(b.page).toHaveURL(/\/grupo$/);
  await expect(b.page.getByTestId("member")).toHaveCount(2);

  // el perfil muestra el nombre guardado
  await b.page.goto("/perfil");
  await expect(b.page.getByTestId("profile-name")).toHaveText("Nico");

  await a.context.close();
  await b.context.close();
});

test("un código inexistente avisa y deja probar otro", async ({ browser }) => {
  const c = await freshPage(browser);
  await c.page.goto("/g/ZZZZZZ");
  await c.page.getByPlaceholder("tu nombre").fill("Flor");
  await c.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(c.page.getByTestId("flow-error")).toContainText("ese código no existe");
  await expect(c.page.getByLabel("código de invitación")).toBeVisible();
  await c.context.close();
});

test("sin sesión ni grupo, las pestañas mandan a la landing", async ({ browser }) => {
  const d = await freshPage(browser);
  await d.page.goto("/grupo");
  await expect(d.page).toHaveURL(/\/$/);
  await expect(d.page.getByRole("heading", { name: "playus" })).toBeVisible();
  await d.context.close();
});
