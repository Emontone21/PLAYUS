import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getGame } from "@/games";
import type { ProfileStatsData } from "@/components/profile-stats";
import { bestScores, rankRound } from "./scoring";
import { addDays } from "./time";

// Estadísticas de un integrante, calculadas con el cliente del usuario que
// mira: RLS decide qué rondas y puntajes entran. Las rondas de hoy que
// todavía están tapadas no cuentan para victorias (no se ve a todos).

export async function computeStats(profileId: string): Promise<ProfileStatsData> {
  const supabase = await createClient();

  const { data: mine } = await supabase
    .from("attempts")
    .select("round_id, score, status")
    .eq("profile_id", profileId)
    .eq("status", "completed");
  const roundIds = [...new Set((mine ?? []).map((a) => a.round_id))];
  if (roundIds.length === 0) {
    const seasonsWon = await countSeasonsWon(profileId);
    return { roundsPlayed: 0, wins: 0, bestStreak: 0, seasonsWon, bestGame: null };
  }

  const [{ data: rounds }, { data: attempts }, seasonsWon] = await Promise.all([
    supabase.from("rounds").select("id, group_id, play_date, game_id").in("id", roundIds),
    supabase.from("attempts").select("round_id, profile_id, score, status").in("round_id", roundIds),
    countSeasonsWon(profileId),
  ]);

  let wins = 0;
  const winsByGame = new Map<string, { wins: number; played: number }>();
  for (const r of rounds ?? []) {
    const game = getGame(r.game_id);
    const scoring = game?.scoring ?? "high";
    const entries = bestScores(
      (attempts ?? [])
        .filter((a) => a.round_id === r.id)
        .map((a) => ({ profileId: a.profile_id, score: a.score, status: a.status })),
      scoring,
    );
    const ranked = rankRound(entries, scoring);
    const me = ranked.find((e) => e.profileId === profileId);
    const stat = winsByGame.get(r.game_id) ?? { wins: 0, played: 0 };
    stat.played += 1;
    if (me?.rank === 1 && ranked.length > 1) {
      wins += 1;
      stat.wins += 1;
    }
    winsByGame.set(r.game_id, stat);
  }

  // mejor racha: días seguidos con al menos una ronda jugada (en cualquier grupo)
  const dates = [...new Set((rounds ?? []).map((r) => r.play_date))].sort();
  let best = 0;
  let current = 0;
  let prev: string | null = null;
  for (const d of dates) {
    current = prev && addDays(prev, 1) === d ? current + 1 : 1;
    best = Math.max(best, current);
    prev = d;
  }

  let bestGame: string | null = null;
  let bestRatio = -1;
  for (const [gameId, s] of winsByGame) {
    const ratio = s.wins / s.played;
    if (ratio > bestRatio || (ratio === bestRatio && s.played > (winsByGame.get(bestGame ?? "")?.played ?? 0))) {
      bestRatio = ratio;
      bestGame = gameId;
    }
  }

  return {
    roundsPlayed: roundIds.length,
    wins,
    bestStreak: best,
    seasonsWon,
    bestGame: bestGame ? (getGame(bestGame)?.name ?? bestGame) : null,
  };
}

async function countSeasonsWon(profileId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("seasons").select("id").eq("winner_profile_id", profileId);
  return data?.length ?? 0;
}
