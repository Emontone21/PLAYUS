import type { AdminClient } from "@/lib/supabase/admin";
import type { GroupRow, RoundRow, SeasonRow } from "@/lib/supabase/types";
import { GAME_IDS } from "@/games";
import { gameForDay, roundSeed } from "./deck";
import { bestScores, champion, rankRound, standings } from "./scoring";
import { addDays, daysBetween, todayInTz, type DateString } from "./time";
import { getGame } from "@/games";

// Rondas y temporadas se crean de forma perezosa: la primera persona que abre
// la app ese día dispara la creación. Sin cron, sin condiciones de carrera:
// INSERT ... ON CONFLICT DO NOTHING sobre unique(group_id, play_date).

export const SEASON_DAYS = 30;
export const ABANDON_AFTER_MS = 5 * 60 * 1000;

/** Fecha de hoy del grupo, con la simulación de desarrollo si está activa. */
export function groupToday(group: Pick<GroupRow, "timezone">, fakeToday?: DateString | null): DateString {
  if (fakeToday && process.env.NODE_ENV !== "production") return fakeToday;
  return todayInTz(group.timezone);
}

// ---------------------------------------------------------------------------
// temporadas
// ---------------------------------------------------------------------------

async function latestSeason(admin: AdminClient, groupId: string): Promise<SeasonRow | null> {
  const { data, error } = await admin
    .from("seasons")
    .select("*")
    .eq("group_id", groupId)
    .order("number", { ascending: false })
    .limit(1);
  if (error) throw new Error(`seasons: ${error.message}`);
  return data?.[0] ?? null;
}

async function createSeason(admin: AdminClient, groupId: string, number: number, startsOn: DateString) {
  const { error } = await admin.from("seasons").insert({
    group_id: groupId,
    number,
    starts_on: startsOn,
    ends_on: addDays(startsOn, SEASON_DAYS - 1),
  });
  // unique(group_id, number): si otro request ganó la carrera, leemos la suya
  if (error && error.code !== "23505") throw new Error(`crear temporada: ${error.message}`);
  const season = await latestSeason(admin, groupId);
  if (!season) throw new Error("no se pudo crear la temporada");
  return season;
}

/** Cierra una temporada: calcula el campeón y marca closed_at. Idempotente. */
export async function closeSeason(admin: AdminClient, season: SeasonRow): Promise<SeasonRow> {
  if (season.closed_at) return season;
  const table = await seasonStandings(admin, season);
  const winner = champion(table);
  const { data, error } = await admin
    .from("seasons")
    .update({ winner_profile_id: winner, closed_at: new Date().toISOString() })
    .eq("id", season.id)
    .is("closed_at", null)
    .select();
  if (error) throw new Error(`cerrar temporada: ${error.message}`);
  return data?.[0] ?? { ...season, winner_profile_id: winner, closed_at: new Date().toISOString() };
}

/**
 * Temporada vigente para una fecha. Crea la primera si no hay, y si la última
 * ya terminó la cierra (campeón) y abre la siguiente arrancando en `today`.
 */
export async function ensureSeason(admin: AdminClient, group: GroupRow, today: DateString): Promise<SeasonRow> {
  let season = await latestSeason(admin, group.id);
  if (!season) return createSeason(admin, group.id, 1, today);
  if (season.ends_on && today > season.ends_on) {
    await closeSeason(admin, season);
    season = await createSeason(admin, group.id, season.number + 1, today);
  }
  return season;
}

/** Tabla de la temporada con los puntos de todas sus rondas hasta `upTo` (incluida). */
export async function seasonStandings(admin: AdminClient, season: SeasonRow, upTo?: DateString) {
  let query = admin.from("rounds").select("*").eq("season_id", season.id).order("play_date");
  if (upTo) query = query.lte("play_date", upTo);
  const { data: rounds, error } = await query;
  if (error) throw new Error(`rounds: ${error.message}`);
  const ranked = await Promise.all((rounds ?? []).map((r) => rankedRound(admin, r)));
  return standings(ranked.map((r) => r.ranked));
}

/** Ranking de una ronda a partir de sus intentos completados. */
export async function rankedRound(admin: AdminClient, round: RoundRow) {
  const game = getGame(round.game_id);
  const scoring = game?.scoring ?? "high";
  const { data: attempts, error } = await admin
    .from("attempts")
    .select("profile_id, score, status")
    .eq("round_id", round.id)
    .eq("status", "completed");
  if (error) throw new Error(`attempts: ${error.message}`);
  const entries = bestScores(
    (attempts ?? []).map((a) => ({ profileId: a.profile_id, score: a.score, status: a.status })),
    scoring,
  );
  return { round, ranked: rankRound(entries, scoring) };
}

// ---------------------------------------------------------------------------
// rondas
// ---------------------------------------------------------------------------

async function findRound(admin: AdminClient, groupId: string, playDate: DateString): Promise<RoundRow | null> {
  const { data, error } = await admin
    .from("rounds")
    .select("*")
    .eq("group_id", groupId)
    .eq("play_date", playDate)
    .maybeSingle();
  if (error) throw new Error(`rounds: ${error.message}`);
  return data ?? null;
}

/** La ronda de hoy del grupo. La crea si falta (y la temporada si hace falta). */
export async function ensureRound(admin: AdminClient, group: GroupRow, today: DateString): Promise<RoundRow> {
  const existing = await findRound(admin, group.id, today);
  if (existing) return existing;

  const season = await ensureSeason(admin, group, today);
  const dayIndex = Math.max(0, daysBetween(season.starts_on, today));
  const gameId = gameForDay(group.id, season.number, dayIndex, GAME_IDS);
  const seed = roundSeed(group.id, today, gameId);

  const { error } = await admin
    .from("rounds")
    .insert({ group_id: group.id, season_id: season.id, play_date: today, game_id: gameId, seed })
    .select();
  // unique(group_id, play_date): otro request pudo ganar; leemos la que quedó
  if (error && error.code !== "23505") throw new Error(`crear ronda: ${error.message}`);

  const round = await findRound(admin, group.id, today);
  if (!round) throw new Error("no se pudo crear la ronda de hoy");
  return round;
}

/** Marca abandoned todo intento in_progress de más de 5 minutos. */
export async function abandonStale(admin: AdminClient, roundId?: string, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - ABANDON_AFTER_MS).toISOString();
  let query = admin.from("attempts").update({ status: "abandoned" }).eq("status", "in_progress").lt("started_at", cutoff);
  if (roundId) query = query.eq("round_id", roundId);
  const { error } = await query;
  if (error) throw new Error(`abandonar intentos: ${error.message}`);
}
