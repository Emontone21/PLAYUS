import { test, expect, type Browser, type Page } from "@playwright/test";
import { createGroupWithGame, setTodayGame } from "./helpers/group";
import { playTarado } from "./helpers/tarado";

// Colillas y la gráfica de la temporada: con dos días cerrados (fecha
// simulada, solo desarrollo), la pestaña Grupo muestra la gráfica con una
// línea por integrante, la ficha al tocar un día, y la tabla con colillas y
// días ganados; un grupo nuevo muestra el estado vacío; y cuando la temporada
// termina, se puede consultar cerrada, con la corona del campeón.
// Con CAPTURAS=1 guarda las capturas del reporte en reports/colillas/.

test.setTimeout(600_000);

const OUT = "reports/colillas";
const shots = !!process.env.CAPTURAS;

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function playTodayTarado(page: Page, taps: number) {
  await page.goto("/hoy");
  await expect(page.getByTestId("today-game-name")).toHaveText("quedó re tarado");
  await page.getByTestId("play-link").click();
  await page.getByTestId("game-play").click();
  await playTarado(page, taps);
  await page.getByTestId("game-done").click();
  await expect(page).toHaveURL(/\/hoy$/);
}

async function nextDay(pages: Page[], code: string) {
  for (const p of pages) {
    await p.goto("/dev/hoy/set?adelantar=1");
    await expect(p.getByTestId("fake-today")).not.toHaveText("real");
  }
  // la ronda del día nuevo se crea al entrar a Hoy; después se le pone el mismo juego
  await pages[0]!.goto("/hoy");
  await expect(pages[0]!.getByTestId("today-game-name")).toBeVisible();
  await setTodayGame(code, "quedo-re-tarado");
}

test("colillas: el ranking del día, la gráfica de la temporada, la ficha, la tabla, el estado vacío y una temporada cerrada", async ({ browser }) => {
  const a = await freshPage(browser);
  const b = await freshPage(browser);
  const code = await createGroupWithGame(a.page, "Larry", "quedó re tarado");
  await b.page.goto(`/g/${code}`);
  await b.page.getByPlaceholder("tu nombre").fill("Daño");
  await b.page.getByRole("button", { name: "entrar al grupo" }).click();
  await expect(b.page).toHaveURL(/\/grupo$/);

  // antes de cerrar un día: el estado vacío de la gráfica
  await a.page.goto("/grupo");
  await expect(a.page.getByTestId("season-chart")).toBeVisible();
  await expect(a.page.getByTestId("chart-empty")).toContainText("la gráfica arranca a medianoche");
  await expect(a.page.getByTestId("chart-line")).toHaveCount(0);
  if (shots) await a.page.getByTestId("season-table").screenshot({ path: `${OUT}/vacio.png` });

  // día 1: los dos juegan, Larry mejor (más toques, menos ms)
  await playTodayTarado(a.page, 60);
  await playTodayTarado(b.page, 30);
  // el ranking del día: el 1.º se lleva +25 con el ícono, y el texto explica el reparto en colillas
  const first = a.page.getByTestId("ranking-row").first();
  await expect(first).toHaveAttribute("data-rank", "1");
  await expect(first).toContainText("+25");
  await expect(first.getByTestId("colilla")).toBeVisible();
  await expect(a.page.getByTestId("today-ranking")).toContainText("jugar suma 5 colillas");
  await expect(a.page.getByTestId("today-ranking")).not.toContainText("puntos");
  if (shots) await a.page.getByTestId("today-ranking").screenshot({ path: `${OUT}/ranking-dia.png` });

  // día 2: otra vez los dos, Larry gana de nuevo
  await nextDay([a.page, b.page], code);
  await playTodayTarado(a.page, 60);
  await playTodayTarado(b.page, 30);

  // día 3: Grupo con dos días cerrados
  await nextDay([a.page, b.page], code);
  await a.page.goto("/grupo");
  const chart = a.page.getByTestId("season-chart");
  await expect(chart).toHaveAttribute("data-days", "2");
  await expect(a.page.getByTestId("chart-line")).toHaveCount(2);
  await expect(a.page.locator("[data-testid='chart-line'][data-me='1']")).toHaveCount(1);
  // la línea de hoy (un <line> sin ancho no cuenta como "visible" para Playwright)
  await expect(a.page.getByTestId("chart-today")).toHaveCount(1);
  const label = await chart.getByRole("img").getAttribute("aria-label");
  expect(label).toContain("Larry va primero con 50 colillas");
  expect(label).toContain("Daño segundo con 40 colillas");
  // la tabla: puesto, nombre con su color, días ganados y colillas con el ícono
  const rows = a.page.getByTestId("standings").getByTestId("ranking-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Larry");
  await expect(rows.first()).toContainText("2 días ganados");
  await expect(rows.first().getByTestId("ranking-value")).toContainText("50");
  await expect(rows.first().getByTestId("ranking-value")).toContainText("colillas");
  await expect(rows.first().getByTestId("colilla")).toBeVisible();
  await expect(rows.first().getByTestId("ranking-color")).toBeVisible();
  await expect(rows.nth(1)).toContainText("0 días ganados");
  await expect(rows.nth(1).getByTestId("ranking-value")).toContainText("40");
  await expect(a.page.getByTestId("season-table")).not.toContainText("puntos");
  await expect(a.page.getByTestId("season-dates")).toContainText("quedan");
  if (shots) await a.page.getByTestId("season-table").screenshot({ path: `${OUT}/grafica.png` });

  // tocar el segundo día: la ficha con la fecha y las colillas de cada uno, de mayor a menor
  const box = (await chart.boundingBox())!;
  const svg = chart.getByRole("img");
  const sbox = (await svg.boundingBox())!;
  // el segundo día está a 1/29 del ancho útil; se toca un poco a la derecha del inicio
  const xDay2 = sbox.x + 36 + ((sbox.width - 36 - 14) * 1) / 29;
  await a.page.mouse.move(xDay2, box.y + box.height / 2);
  await a.page.mouse.down();
  const tip = a.page.getByTestId("chart-tooltip");
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Larry");
  await expect(tip).toContainText("50");
  await expect(tip).toContainText("Daño");
  await expect(a.page.getByTestId("chart-cursor")).toHaveCount(1);
  if (shots) await a.page.getByTestId("season-table").screenshot({ path: `${OUT}/ficha.png` });
  await a.page.mouse.up();
  await expect(tip).toHaveCount(0);

  // la temporada termina: 30 días después se cierra, y se puede consultar con la corona
  for (const p of [a.page, b.page]) await p.goto("/dev/hoy/set?adelantar=30");
  await a.page.goto("/grupo");
  await expect(a.page.getByTestId("season-table")).toHaveAttribute("data-season", "2");
  await a.page.getByTestId("season-picker").selectOption("1");
  await expect(a.page).toHaveURL(/temporada=1/);
  await expect(a.page.getByTestId("season-table")).toHaveAttribute("data-closed", "1");
  await expect(a.page.getByTestId("season-dates")).toContainText("terminó");
  const closedRows = a.page.getByTestId("standings").getByTestId("ranking-row");
  await expect(closedRows).toHaveCount(2);
  await expect(closedRows.first().getByTestId("crown")).toBeVisible();
  await expect(closedRows.first()).toContainText("50");
  await expect(a.page.getByTestId("chart-line")).toHaveCount(2);
  if (shots) await a.page.getByTestId("season-table").screenshot({ path: `${OUT}/cerrada.png` });

  // volver al día real para no ensuciar otras pruebas
  await a.page.goto("/dev/hoy/set?reset=1");
  await b.page.goto("/dev/hoy/set?reset=1");
  await a.context.close();
  await b.context.close();
});
