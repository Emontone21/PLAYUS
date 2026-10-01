import { test, expect, type Browser, type Page } from "@playwright/test";
import { playPiba } from "./helpers/piba";
import { playTarado } from "./helpers/tarado";
import { playLarry } from "./helpers/larry";
import { playRemar } from "./helpers/remar";
import { playParrilla } from "./helpers/parrilla";
import { playJota } from "./helpers/jota";
import { playCaminando } from "./helpers/caminando";
import { playRastas } from "./helpers/rastas";
import { playSunny } from "./helpers/sunny";
import { playParis } from "./helpers/paris";
import { playColgado } from "./helpers/colgado";

// El "listo cuando" del brief, de punta a punta: dos personas entran por un
// link, arman su avatar, juegan el juego del día, ven el ranking actualizarse,
// y al día siguiente (fecha simulada con /dev/hoy) encuentran otro juego.

test.setTimeout(240_000);

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

// Juega el juego del día: la piba (`hits` aciertos, corta a los 60 s), el
// tarado (`hits` × 50 toques a ritmo humano; con 200 termina antes), Larry
// (agarra `hits` deseos y se queda quieto; el puntaje exacto depende de lo
// que le caiga después, así que no se compara) o remar (sigue el camino
// seguro `hits` × 25 m y después choca a propósito; tampoco se compara) o la
// parrilla (`hits` × 5 toques seguros y después uno peligroso: el exacto) o
// el jota (`hits` rondas acertadas y una errada: el exacto) o caminando por
// 18 (`hits` toques y después deja pasar; los metros no se comparan) o las
// rastas (`hits` cigarros con la ruta de Node y después choca; no se compara)
// o el sunny (`hits` segundos de conductor automático y suelta; no se compara)
// o los Paris (completa el primer tablero: 3 pares exactos, y después espera)
// o colgado del 121 (`hits` segundos de jugador automático y suelta; no se compara).
async function playToday(page: Page, hits = 4): Promise<number> {
  const started = page.waitForResponse((r) => r.url().includes("/api/rounds/") && r.url().endsWith("/start"));
  await page.getByTestId("game-play").click();
  const { seed } = (await (await started).json()) as { seed: string };
  const piba = page.getByTestId("piba-area");
  const tarado = page.getByTestId("tarado-area");
  const larry = page.getByTestId("larry-area");
  const remar = page.getByTestId("remar-area");
  const parrilla = page.getByTestId("parrilla-area");
  const jota = page.getByTestId("jota-area");
  const caminando = page.getByTestId("caminando-area");
  const rastas = page.getByTestId("rastas-area");
  const sunny = page.getByTestId("sunny-area");
  const paris = page.getByTestId("paris-area");
  const colgado = page.getByTestId("colgado-area");
  await expect(piba.or(tarado).or(larry).or(remar).or(parrilla).or(jota).or(caminando).or(rastas).or(sunny).or(paris).or(colgado)).toBeVisible({ timeout: 15_000 });
  if (await colgado.isVisible()) {
    await playColgado(page, seed, hits);
    return -1;
  }
  if (await paris.isVisible()) {
    return playParis(page, seed);
  }
  if (await sunny.isVisible()) {
    await playSunny(page, seed, hits);
    return -1;
  }
  if (await rastas.isVisible()) {
    await playRastas(page, seed, hits);
    return -1;
  }
  if (await caminando.isVisible()) {
    await playCaminando(page, hits);
    return -1;
  }
  if (await jota.isVisible()) {
    return playJota(page, seed, hits);
  }
  if (await parrilla.isVisible()) {
    return playParrilla(page, seed, hits * 5);
  }
  if (await remar.isVisible()) {
    await playRemar(page, seed, hits * 25);
    return -1;
  }
  if (await larry.isVisible()) {
    await playLarry(page, seed, hits);
    return -1;
  }
  if (await tarado.isVisible()) {
    const taps = Math.min(200, hits * 50);
    await playTarado(page, taps);
    return taps === 200 ? -1 : 40_000 + (200 - taps) * 100;
  }
  await playPiba(page, seed, hits);
  return hits;
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
  expect(["encontrá a la piba del IPA", "quedó re tarado", "los deseos de Larry", "remar vuelve a casa", "la parrilla del bro", "pegándole al jota", "caminando por 18", "rastitas rastotas", "pisteando el sunny", "buscá los Paris", "colgado del 121"]).toContain(gameName);
  await expect(a.page.getByTestId("attempts-left")).toContainText("te quedan 3 intentos");
  await expect(a.page.getByTestId("participants")).toContainText("todavía nadie jugó hoy");

  // A juega: el aviso de que recargar cuesta el intento aparece antes de la primera partida
  await a.page.getByTestId("play-link").click();
  await expect(a.page.getByTestId("game-warning")).toContainText("se pierde igual");
  const played = await playToday(a.page, 4);
  await expect(a.page.getByTestId("game-result")).toContainText("quedó guardado");
  const scoreA = Number((await a.page.getByTestId("game-score").textContent())?.replace(/\D/g, ""));
  // el tarado terminado y Larry (-1) no tienen un puntaje previsible; los demás, el exacto
  if (played >= 0) expect(scoreA).toBe(played);
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
  await playToday(b.page, 3);
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
  // el mazo no repite el juego de ayer
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
