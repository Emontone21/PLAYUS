import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GroupRow, RoundRow, SeasonRow } from "@/lib/supabase/types";
import { getGame } from "@/games";
import { readFakeToday } from "./api";
import { ensureSeason, groupToday, rankedRound, seasonStandings } from "./rounds";
import type { StandingRow } from "./scoring";
import { addDays, type DateString } from "./time";

// Lo que necesita la pestaña Grupo además de los integrantes: tabla de la
// temporada (con las rondas ya cerradas: hasta ayer) e historial de días.

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
  season: SeasonRow;
  standings: StandingRow[];
  history: HistoryItem[];
}

export async function loadGroupSummary(userId: string, group: GroupRow): Promise<GroupSummary> {
  const admin = createAdminClient();
  const today = groupToday(group, await readFakeToday());
  const season = await ensureSeason(admin, group, today);
  const yesterday = addDays(today, -1);

  // la tabla cuenta hasta ayer: los puntos de hoy se ven en Hoy y cierran a medianoche
  const standings = await seasonStandings(admin, season, yesterday);

  const supabase = await createClient();
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

  return { today, season, standings, history };
}
