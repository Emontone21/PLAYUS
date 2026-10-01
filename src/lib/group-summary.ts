import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GroupRow, RoundRow, SeasonRow } from "@/lib/supabase/types";
import { getGame } from "@/games";
import { readFakeToday } from "./api";
import type { SeasonSeries } from "./chart";
import { ensureSeason, groupToday, rankedRound, seasonStandings } from "./rounds";
import { champions, type StandingRow } from "./scoring";
import { loadSeasonSeries } from "./season-series";
import type { Member } from "./today";
import { addDays, type DateString } from "./time";

// Lo que necesita la pestaña Grupo además de los integrantes: la temporada
// elegida (la actual, o una cerrada) con su gráfica y su tabla (en la actual,
// con las rondas ya cerradas: hasta ayer), la lista de temporadas para el
// selector, y el historial de días.

export interface HistoryItem {
  round: RoundRow;
  gameName: string;
  scoring: "high" | "low";
  winnerId: string | null;
  winnerScore: number | null;
  tied: boolean;
  myScore: number | null;
  myRank: number | null;
  players: number;
}

export interface GroupSummary {
  today: DateString;
  /** la temporada que se muestra */
  season: SeasonRow;
  /** la temporada en curso */
  current: SeasonRow;
  seasons: { number: number; closed: boolean }[];
  standings: StandingRow[];
  series: SeasonSeries;
  /** en una temporada cerrada: quiénes la ganaron (título compartido si empatan) */
  champions: string[];
  history: HistoryItem[];
}

export async function loadGroupSummary(userId: string, group: GroupRow, members: Map<string, Member>, seasonNumber?: number): Promise<GroupSummary> {
  const admin = createAdminClient();
  const today = groupToday(group, await readFakeToday());
  const current = await ensureSeason(admin, group, today);
  const yesterday = addDays(today, -1);

  const supabase = await createClient();
  const { data: seasonRows } = await supabase.from("seasons").select("*").eq("group_id", group.id).order("number", { ascending: false });
  const seasons = (seasonRows ?? []).map((s) => ({ number: s.number, closed: !!s.closed_at }));
  const chosen = (seasonRows ?? []).find((s) => s.number === seasonNumber && s.closed_at) ?? current;
  const closed = !!chosen.closed_at;

  // la tabla cuenta hasta ayer: las colillas de hoy se ven en Hoy y cierran a medianoche
  const [standings, series] = await Promise.all([seasonStandings(admin, chosen, closed ? undefined : yesterday), loadSeasonSeries(supabase, group, chosen, members, today)]);

  const { data: rounds } = await supabase
    .from("rounds")
    .select("*")
    .eq("group_id", group.id)
    .lte("play_date", yesterday)
    .order("play_date", { ascending: false })
    .limit(30);

  const history: HistoryItem[] = [];
  for (const round of rounds ?? []) {
    const game = getGame(round.game_id);
    const { ranked } = await rankedRound(admin, round);
    const me = ranked.find((r) => r.profileId === userId);
    const top = ranked[0];
    history.push({
      round,
      gameName: game?.name ?? round.game_id,
      scoring: game?.scoring ?? "high",
      winnerId: top?.profileId ?? null,
      winnerScore: top?.bestScore ?? null,
      tied: ranked.filter((r) => r.rank === 1).length > 1,
      myScore: me?.bestScore ?? null,
      myRank: me?.rank ?? null,
      players: ranked.length,
    });
  }

  return { today, season: chosen, current, seasons, standings, series, champions: closed ? champions(standings) : [], history };
}
