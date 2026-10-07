import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { setTodayGame } from "../../e2e/helpers/group";
import { findPiba } from "../../e2e/helpers/piba";
import { GAME_IDS } from "../../src/games";
import { roundSeed } from "../../src/lib/deck";
import { addDays, todayInTz } from "../../src/lib/time";

// Capturas (1080 × 1920), el sunny para silueta y dos clips, con datos de
// prueba y nombres inventados, contra el stack local. Nada de esto toca la
// app ni producción.

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "video-assets");
const CAP = path.join(OUT, "capturas");
const CLIPS = path.join(OUT, "clips");
const SPRITES = path.join(OUT, "sprites");
const SEED = "video-promo";
const GROUP = "los del estanque";
const VIEWER = "Juli";
const OTHERS = [
  { name: "Nico", avatar: { base: 2, skin: "#D9A06B", hair: 3, hairColor: "#2B1B12", eyes: 2, mouth: 2, accessory: 1, bg: "#FFD34E" } },
  { name: "Flor", avatar: { base: 4, skin: "#F1C9A5", hair: 6, hairColor: "#B0632B", eyes: 4, mouth: 3, accessory: null, bg: "#6FD3E0" } },
  { name: "Tomi", avatar: { base: 1, skin: "#B5743F", hair: 1, hairColor: "#3C3C48", eyes: 5, mouth: 1, accessory: 3, bg: "#FF6F91" } },
  { name: "Agus", avatar: { base: 5, skin: "#7A4A24", hair: 7, hairColor: "#2B1B12", eyes: 3, mouth: 5, accessory: null, bg: "#8EDC66" } },
];

function env() {
  try {
    process.loadEnvFile(path.join(ROOT, ".env.local"));
  } catch {
    // las variables vienen del entorno
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !anon || !service) throw new Error("faltan las variables de Supabase en .env.local");
  return { url, anon, service };
}

/** el indicador de Next en desarrollo (la "N" abajo a la izquierda) no va en ninguna captura */
async function hideNextBadge(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    const add = () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none}";
      document.head.appendChild(s);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
    else add();
  });
}

/** esconde la cabecera y las herramientas de la página de desarrollo, para que la captura sea solo el juego */
async function hideDevChrome(page: Page) {
  await page.addStyleTag({ content: "nextjs-portal{display:none} main > p:first-child{display:none} [role=group][aria-label=herramientas], [data-testid=dev-timeline], [data-testid=dev-states], [data-testid=parrilla-dev] > p, [data-testid=dev-faces], [data-testid=dev-shots], [data-testid=dev-objects], [data-testid=dev-shapes]{display:none}" });
}

async function stateOf(page: Page): Promise<string> {
  return (await page.getByTestId("parrilla-area").getAttribute("data-state")) ?? "";
}

test("capturas, sunny y clips para el video", async ({ browser }) => {
  for (const d of [CAP, CLIPS, SPRITES]) mkdirSync(d, { recursive: true });
  if (!process.env.SOLO_CLIPS) await capturas(browser);
  await clips(browser);
});

async function capturas(browser: Browser) {
  const { url, anon, service } = env();
  const admin = createClient(url, service, { auth: { persistSession: false } });

  // --- el grupo: Juli lo crea desde la app ---------------------------------
  const ctx = await browser.newContext();
  await hideNextBadge(ctx);
  const page = await ctx.newPage();
  await page.goto("/crear");
  const nameField = page.getByPlaceholder("tu nombre");
  await expect(nameField).toBeVisible();
  await nameField.fill(VIEWER);
  await page.getByRole("button", { name: "seguir" }).click();
  const groupField = page.getByPlaceholder("los del barrio");
  await groupField.fill(GROUP);
  await page.getByRole("button", { name: "crear grupo" }).click();
  await expect(page).toHaveURL(/\/grupo$/);
  const code = (await page.getByTestId("invite-code").textContent())!.trim();
  await page.goto("/hoy");
  await expect(page.getByTestId("today-game-name")).toBeVisible();
  await setTodayGame(code, "piba-del-ipa");

  // --- cuatro integrantes más, desde Node ----------------------------------
  const memberIds: string[] = [];
  for (const o of OTHERS) {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { data } = await c.auth.signInAnonymously();
    const id = data.user!.id;
    memberIds.push(id);
    const up = await c.from("profiles").upsert({ id, display_name: o.name, avatar: o.avatar });
    if (up.error) throw new Error(`perfil de ${o.name}: ${up.error.message}`);
    const j = await c.rpc("join_group", { p_code: code });
    if (j.error) throw new Error(`entrar ${o.name}: ${j.error.message}`);
  }
  const g = await admin.from("groups").select("id, timezone").eq("invite_code", code).single();
  if (g.error) throw new Error(g.error.message);
  const groupId = g.data.id as string;
  const today = todayInTz(g.data.timezone as string);
  const viewer = await admin.from("group_members").select("profile_id").eq("group_id", groupId).eq("role", "owner").single();
  const viewerId = viewer.data!.profile_id as string;
  const everyone = [viewerId, ...memberIds];
  // para la gráfica: que todos estén en el grupo desde el primer día de la temporada
  const startsOn = addDays(today, -6);
  const joined = await admin.from("group_members").update({ joined_at: `${startsOn}T12:00:00Z` }).eq("group_id", groupId);
  if (joined.error) throw new Error(`joined_at: ${joined.error.message}`);

  // 1. Hoy antes de jugar, con los demás todavía dormidos
  await page.goto("/hoy");
  await expect(page.getByTestId("today-game-name")).toHaveText("encontrá a la piba del IPA");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(CAP, "hoy-antes-de-jugar.png") });

  // 2. el ranking de hoy: los 5 jugaron (intentos completados, puestos desde Node)
  const round = await admin.from("rounds").select("id").eq("group_id", groupId).eq("play_date", today).single();
  const roundId = round.data!.id as string;
  const scores = [5, 7, 6, 4, 3];
  const now = Date.now();
  const ins = await admin.from("attempts").insert(
    everyone.map((pid, i) => ({
      round_id: roundId,
      profile_id: pid,
      attempt_number: 1,
      status: "completed",
      score: scores[i]!,
      started_at: new Date(now - 300_000 - i * 60_000).toISOString(),
      finished_at: new Date(now - 240_000 - i * 60_000).toISOString(),
    })),
  );
  if (ins.error) throw new Error(`intentos: ${ins.error.message}`);
  await page.goto("/hoy?reveal=1");
  await expect(page.getByTestId("today-ranking")).toBeVisible();
  await page.waitForTimeout(2500);
  // que entren las cinco filas: la cabecera se va para arriba
  await page.evaluate(() => {
    const first = document.querySelector('[data-testid="ranking-row"]');
    const top = first ? first.getBoundingClientRect().top + window.scrollY : 0;
    window.scrollTo(0, Math.max(0, top - 120));
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(CAP, "ranking.png") });

  // 3. la gráfica de la temporada: seis días anteriores con rondas y puntajes
  const season = await admin.from("seasons").select("id, starts_on").eq("group_id", groupId).order("number", { ascending: false }).limit(1).single();
  const seasonId = season.data!.id as string;
  const up = await admin.from("seasons").update({ starts_on: startsOn, ends_on: addDays(startsOn, 29) }).eq("id", seasonId);
  if (up.error) throw new Error(`temporada: ${up.error.message}`);
  const days = Array.from({ length: 6 }, (_, i) => addDays(today, -6 + i));
  const games = ["quedo-re-tarado", "la-mayo", "rastitas-rastotas", "servila-justa", "colgado-del-121", "busca-los-paris"].filter((id) => GAME_IDS.includes(id));
  for (const [d, date] of days.entries()) {
    const gameId = games[d % games.length]!;
    const r = await admin.from("rounds").insert({ group_id: groupId, season_id: seasonId, play_date: date, game_id: gameId, seed: roundSeed(groupId, date, gameId) }).select("id").single();
    if (r.error) throw new Error(`ronda ${date}: ${r.error.message}`);
    const rows = everyone
      .filter((_, i) => (d + i) % 5 !== 3 || i === 0)
      .map((pid, i) => ({
        round_id: r.data.id as string,
        profile_id: pid,
        attempt_number: 1,
        status: "completed",
        score: 100 + ((d * 37 + i * 53) % 900),
        started_at: `${date}T18:${String(10 + i).padStart(2, "0")}:00Z`,
        finished_at: `${date}T18:${String(12 + i).padStart(2, "0")}:00Z`,
      }));
    const a = await admin.from("attempts").insert(rows);
    if (a.error) throw new Error(`intentos ${date}: ${a.error.message}`);
  }
  await page.goto("/grupo");
  await expect(page.getByTestId("season-table")).toBeVisible();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(CAP, "grafica.png") });

  // 4. el mapa 3 de la piba, sin resaltar
  await page.goto(`/dev/juego/piba-del-ipa?seed=${SEED}&map=3`);
  await hideDevChrome(page);
  await page.addStyleTag({ content: "[data-testid=map-preview] > div:first-child, [data-testid=map-preview] > p{display:none} main{min-height:100dvh;justify-content:center}" });
  const mapCanvas = page.getByTestId("preview-canvas");
  await expect(mapCanvas).toBeVisible();
  await page.waitForTimeout(800);
  await mapCanvas.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(CAP, "piba-mapa.png") });
  await mapCanvas.screenshot({ path: path.join(CAP, "piba-mapa-solo.png") });

  // 5. la parrilla del bro: de espaldas, en el aviso y "¡te vi, bro!" (a ×0,25 para atrapar el aviso)
  await page.goto(`/dev/juego/la-parrilla-del-bro?seed=${SEED}&lento=1`);
  await hideDevChrome(page);
  await page.getByTestId("game-play").click();
  const area = page.getByTestId("parrilla-area");
  await expect(area).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => stateOf(page), { timeout: 30_000 }).toBe("espaldas");
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(CAP, "parrilla-espaldas.png") });
  await expect.poll(() => stateOf(page), { timeout: 240_000, intervals: [25] }).toBe("aviso");
  await page.screenshot({ path: path.join(CAP, "parrilla-aviso.png") });
  await expect.poll(() => stateOf(page), { timeout: 240_000, intervals: [25] }).toBe("mirando");
  await page.getByTestId("parrilla-field").tap();
  await expect(page.getByTestId("parrilla-banner")).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(CAP, "parrilla-te-vi.png") });

  // 6. el sunny en 3D sobre su losa, con el cielo del fondo transparente (para silueta)
  await page.goto(`/dev/juego/pisteando-el-sunny?seed=${SEED}`);
  const preview = page.getByTestId("sunny-preview");
  await expect(preview).toBeVisible();
  await expect(preview.locator("canvas")).toBeVisible({ timeout: 20_000 });
  await preview.evaluate((el) => {
    (el as HTMLElement).style.background = "transparent";
    (el as HTMLElement).style.height = "300px";
    for (const n of [document.documentElement, document.body, ...document.querySelectorAll("main, main *:not(canvas)")]) (n as HTMLElement).style.background = "transparent";
  });
  await page.waitForTimeout(2500);
  await preview.locator("canvas").screenshot({ path: path.join(SPRITES, "sunny.png"), omitBackground: true });
  await ctx.close();
}

// los clips: Playwright graba a la resolución CSS del viewport (360 × 640) y
// solo achica, nunca agranda; el escalado ×3 a 1080 × 1920 con vecino más
// cercano y el recorte a 3 s los hace ffmpeg después
async function clips(browser: Browser) {
  const marks: Record<string, number> = {};
  for (const clip of ["piba", "parrilla"] as const) {
    const vctx = await browser.newContext({ recordVideo: { dir: CLIPS, size: { width: 360, height: 640 } } });
    await hideNextBadge(vctx);
    const t0 = Date.now();
    const vp = await vctx.newPage();
    if (clip === "piba") {
      await vp.goto(`/dev/juego/piba-del-ipa?seed=${SEED}`);
      await hideDevChrome(vp);
      await vp.getByTestId("game-play").click();
      await expect(vp.getByTestId("piba-area")).toBeVisible({ timeout: 15_000 });
      marks[clip] = (Date.now() - t0) / 1000;
      await findPiba(vp, SEED, 1);
      await findPiba(vp, SEED, 2);
      await findPiba(vp, SEED, 3);
      await vp.waitForTimeout(800);
    } else {
      await vp.goto(`/dev/juego/la-parrilla-del-bro?seed=${SEED}`);
      await hideDevChrome(vp);
      await vp.getByTestId("game-play").click();
      await expect(vp.getByTestId("parrilla-area")).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => stateOf(vp), { timeout: 20_000 }).toBe("espaldas");
      marks[clip] = (Date.now() - t0) / 1000;
      const until = Date.now() + 4_500;
      while (Date.now() < until) {
        const s = await stateOf(vp);
        if (s === "espaldas" || s === "aviso" || s === "amague") await vp.getByTestId("parrilla-field").tap();
        await vp.waitForTimeout(260);
      }
    }
    const video = vp.video();
    await vctx.close();
    await video?.saveAs(path.join(CLIPS, `${clip}-bruto.webm`));
  }
  writeFileSync(path.join(CLIPS, "marcas.json"), JSON.stringify(marks));
  process.stdout.write(`marcas de inicio: ${JSON.stringify(marks)}\n`);
}
