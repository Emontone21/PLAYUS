// Antes de publicar una versión de "pisteando el sunny" que cambia la ruta
// (decisión 190): ¿algún grupo tiene el sunny como juego del día `fecha`?
// Mira las rondas ya creadas y, para los grupos con temporada abierta que
// todavía no la tienen, calcula el juego con el mazo (src/lib/deck.ts).
//
//   npx tsx scripts/sunny-gate.ts 2026-10-01
//
// Sale con código 1 si algún grupo tendría el sunny ese día (no publicar).

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gameForDay } from "../src/lib/deck";

const GAME = "pisteando-el-sunny";
const IDS = ["caminando-por-18", "la-parrilla-del-bro", "los-deseos-de-larry", "pegandole-al-jota", "piba-del-ipa", "pisteando-el-sunny", "quedo-re-tarado", "rastitas-rastotas", "remar-vuelve-a-casa"];

const date = process.argv[2];
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error("uso: npx tsx scripts/sunny-gate.ts AAAA-MM-DD");
  process.exit(2);
}

const tmp = mkdtempSync(join(tmpdir(), "sunny-gate-"));
let n = 0;
function query<T>(sql: string): T[] {
  // por archivo: las comillas y los <= no sobreviven al shell de Windows
  const file = join(tmp, `q${n++}.sql`);
  writeFileSync(file, sql);
  const raw = execFileSync("npx", ["supabase", "db", "query", "--linked", "-o", "json", "-f", file], { encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(raw.slice(raw.indexOf("{"))).rows as T[];
}

type Season = { group_id: string; name: string; number: number; starts_on: string };
type Round = { group_id: string; name: string; game_id: string };

const seasons = query<Season>(`select s.group_id, g.name, s.number, s.starts_on::text from seasons s join groups g on g.id = s.group_id where s.closed_at is null and s.starts_on <= '${date}' and s.ends_on >= '${date}'`);
const rounds = query<Round>(`select r.group_id, g.name, r.game_id from rounds r join groups g on g.id = r.group_id where r.play_date = '${date}'`);
const byRound = new Map(rounds.map((r) => [r.group_id, r]));
const dayIndex = (from: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const withSunny: string[] = [];
for (const s of seasons) {
  const existing = byRound.get(s.group_id);
  const game = existing ? existing.game_id : gameForDay(s.group_id, s.number, dayIndex(s.starts_on), IDS);
  if (game === GAME) withSunny.push(`${s.name}${existing ? " (ronda ya creada)" : " (por el mazo)"}`);
}
console.log(`${date}: ${seasons.length} grupos con temporada abierta, ${rounds.length} rondas ya creadas`);
if (withSunny.length) {
  console.log(`NO publicar: ${withSunny.length} grupos tendrían "${GAME}" ese día:\n  ${withSunny.join("\n  ")}`);
  process.exit(1);
}
console.log(`ningún grupo tiene "${GAME}" ese día: se puede publicar`);
