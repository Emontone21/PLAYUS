import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import { roundSeed } from "../../src/lib/deck";

// Crea un grupo y le pone el juego pedido como juego de hoy: en vez de crear
// grupos hasta que el mazo lo reparta (con doce juegos, hasta 68), se cambia
// la ronda de hoy en la base con la misma fórmula de semilla que usa el
// servidor (roundSeed) y se borran los intentos de esa ronda. En local va por
// la API REST del stack (service role de .env.local); contra producción
// (E2E_BASE_URL fuera de localhost), por `supabase db query --linked`.
// Devuelve el código de invitación del grupo.

const GAME_IDS: Record<string, string> = {
  "encontrá a la piba del IPA": "piba-del-ipa",
  "quedó re tarado": "quedo-re-tarado",
  "los deseos de Larry": "los-deseos-de-larry",
  "remar vuelve a casa": "remar-vuelve-a-casa",
  "la parrilla del bro": "la-parrilla-del-bro",
  "pegándole al jota": "pegandole-al-jota",
  "caminando por 18": "caminando-por-18",
  "rastitas rastotas": "rastitas-rastotas",
  "pisteando el sunny": "pisteando-el-sunny",
  "buscá los Paris": "busca-los-paris",
  "colgado del 121": "colgado-del-121",
  "apila las boludeces": "apila-las-boludeces",
  "la mayo": "la-mayo",
  "servila justa": "servila-justa",
  "fumate algo chino": "fumate-algo-chino",
  "clase con el bro": "clase-con-el-bro",
  "hij@ de p**": "hdp",
  "Larry en la hdp": "larry-en-la-hdp",
  "Big Bro afila": "big-bro-afila",
  "Nach salta": "nach-salta",
  "la bolsita del jota": "la-bolsita-del-jota",
  "Cruza con el chino": "cruza-con-el-chino",
  "Cazando Colillas": "cazando-colillas",
};

export async function createGroupWithGame(page: Page, name: string, gameName: string): Promise<string> {
  const gameId = GAME_IDS[gameName];
  if (!gameId) throw new Error(`juego desconocido en el E2E: ${gameName}`);
  await page.goto("/crear");
  // la primera vez pide nombre y avatar; las siguientes, la cuenta ya tiene nombre
  const nameField = page.getByPlaceholder("tu nombre");
  const groupField = page.getByPlaceholder("los del barrio");
  await expect(nameField.or(groupField)).toBeVisible();
  if (await nameField.isVisible()) {
    await nameField.fill(name);
    await page.getByRole("button", { name: "seguir" }).click();
  }
  await groupField.fill(`${gameName.slice(0, 12)} e2e`);
  await page.getByRole("button", { name: "crear grupo" }).click();
  await expect(page).toHaveURL(/\/grupo$/);
  const code = (await page.getByTestId("invite-code").textContent())?.trim() ?? "";
  // /hoy crea la ronda de hoy
  await page.goto("/hoy");
  const today = (await page.getByTestId("today-game-name").textContent())?.trim();
  if (today !== gameName) {
    await setTodayGame(code, gameId);
    await page.goto("/hoy");
    await expect(page.getByTestId("today-game-name")).toHaveText(gameName);
  }
  return code;
}

type RoundRow = { id: string; group_id: string; play_date: string };

/** cambia el juego de la ronda de hoy del grupo con ese código (semilla recalculada, intentos borrados) */
export async function setTodayGame(inviteCode: string, gameId: string): Promise<void> {
  const base = process.env.E2E_BASE_URL ?? "";
  const prod = base !== "" && !/localhost|127\.0\.0\.1/.test(base);
  const round = prod ? await latestRoundProd(inviteCode) : await latestRoundLocal(inviteCode);
  const seed = roundSeed(round.group_id, round.play_date, gameId);
  if (prod) {
    sqlProd(`begin; delete from attempts where round_id = '${round.id}'; update rounds set game_id = '${gameId}', seed = '${seed}' where id = '${round.id}'; commit;`);
  } else {
    const admin = localAdmin();
    const del = await admin.from("attempts").delete().eq("round_id", round.id);
    if (del.error) throw new Error(`borrar intentos: ${del.error.message}`);
    const up = await admin.from("rounds").update({ game_id: gameId, seed }).eq("id", round.id);
    if (up.error) throw new Error(`cambiar la ronda: ${up.error.message}`);
  }
}

function localAdmin() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // sin .env.local: las variables tienen que venir del entorno
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para tocar la base local");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function latestRoundLocal(inviteCode: string): Promise<RoundRow> {
  const admin = localAdmin();
  const g = await admin.from("groups").select("id").eq("invite_code", inviteCode).single();
  if (g.error || !g.data) throw new Error(`grupo ${inviteCode}: ${g.error?.message ?? "no está"}`);
  const r = await admin.from("rounds").select("id, group_id, play_date").eq("group_id", g.data.id).order("play_date", { ascending: false }).limit(1).single();
  if (r.error || !r.data) throw new Error(`ronda de ${inviteCode}: ${r.error?.message ?? "no está"}`);
  return r.data as RoundRow;
}

let tmp: string | null = null;
let n = 0;
function sqlProd<T>(sql: string): T[] {
  // por archivo: las comillas no sobreviven al shell de Windows
  tmp ??= mkdtempSync(join(tmpdir(), "e2e-hoy-"));
  const file = join(tmp, `q${n++}.sql`);
  writeFileSync(file, sql);
  // SUPABASE_CLI elige el paquete de la CLI (por ejemplo "supabase@2.119.0" si la última no corre en esta máquina)
  const cli = process.env.SUPABASE_CLI ?? "supabase";
  const raw = execFileSync("npx", ["--prefer-offline", "-y", cli, "db", "query", "--linked", "-o", "json", "-f", file], { encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "inherit"] });
  const i = raw.indexOf("{");
  if (i < 0) return [];
  return (JSON.parse(raw.slice(i)).rows ?? []) as T[];
}

async function latestRoundProd(inviteCode: string): Promise<RoundRow> {
  const rows = sqlProd<RoundRow>(`select r.id, r.group_id, r.play_date::text from rounds r join groups g on g.id = r.group_id where g.invite_code = '${inviteCode}' order by r.play_date desc limit 1`);
  if (rows.length === 0) throw new Error(`sin ronda para el grupo ${inviteCode} en producción`);
  return rows[0]!;
}
