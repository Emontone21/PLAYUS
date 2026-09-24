import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GroupRow, RoundRow } from "@/lib/supabase/types";
import { getGame } from "@/games";
import type { GameModule } from "@/games/types";
import { parseAvatar, type Avatar } from "@/avatar/schema";
import { readFakeToday } from "./api";
import { abandonStale, ensureRound, groupToday, rankedRound } from "./rounds";
import { bestScores, rankRound, type RankedEntry } from "./scoring";
import { addDays, type DateString } from "./time";

// Todo lo que necesita la pestaña Hoy, en una sola llamada. Las lecturas
// van con el cliente del usuario (RLS decide qué puntajes ve); ensureRound y
// el cierre de intentos colgados van con el admin.

export interface Member {
  profileId: string;
  name: string;
  avatar: Avatar;
}

export interface TodayData {
  group: GroupRow;
  today: DateString;
  round: RoundRow;
  game: GameModule;
  members: Map<string, Member>;
  championId: string | null;
  attemptsUsed: number;
  attemptsLeft: number;
  myBest: number | null;
  hasCompleted: boolean;
  /** ranking de hoy; vacío si todavía está tapado */
  ranking: RankedEntry[];
  /** quiénes ya jugaron hoy (sin puntajes), para cuando el ranking está tapado */
  participants: { profileId: string; completedAttempts: number }[];
  yesterday: { game: GameModule; winner: Member; score: number; tied: boolean } | null;
}

export async function loadMembers(groupId: string): Promise<Map<string, Member>> {
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("group_members")
    .select("profile_id, nickname")
    .eq("group_id", groupId);
  const ids = (memberships ?? []).map((m) => m.profile_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, display_name, avatar").in("id", ids)
    : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const out = new Map<string, Member>();
  for (const m of memberships ?? []) {
    const p = byId.get(m.profile_id);
    out.set(m.profile_id, {
      profileId: m.profile_id,
      name: m.nickname ?? p?.display_name ?? "alguien",
      avatar: parseAvatar(p?.avatar),
    });
  }
  return out;
}

/** Campeón de la última temporada cerrada del grupo (lleva corona en la actual). */
export async function loadChampion(groupId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("seasons")
    .select("winner_profile_id, closed_at, number")
    .eq("group_id", groupId)
    .not("closed_at", "is", null)
    .order("number", { ascending: false })
    .limit(1);
  return data?.[0]?.winner_profile_id ?? null;
}

export async function loadToday(userId: string, group: GroupRow): Promise<TodayData> {
  const admin = createAdminClient();
  const fakeToday = await readFakeToday();
  const today = groupToday(group, fakeToday);
  const round = await ensureRound(admin, group, today);
  await abandonStale(admin, round.id);

  const game = getGame(round.game_id);
  if (!game) throw new Error(`el juego ${round.game_id} no está en el registry`);

  const supabase = await createClient();
  const [members, championId, { data: visibleAttempts }, { data: participants }] = await Promise.all([
    loadMembers(group.id),
    loadChampion(group.id),
    supabase.from("attempts").select("profile_id, attempt_number, status, score").eq("round_id", round.id),
    supabase.rpc("round_participants", { p_round_id: round.id }),
  ]);

  const mine = (visibleAttempts ?? []).filter((a) => a.profile_id === userId);
  const attemptsUsed = mine.reduce((m, a) => Math.max(m, a.attempt_number), 0);
  const myCompleted = mine.filter((a) => a.status === "completed" && a.score !== null);
  const hasCompleted = myCompleted.length > 0;
  const myBest = hasCompleted
    ? myCompleted.reduce(
        (b, a) => (b === null ? a.score! : game.scoring === "high" ? Math.max(b, a.score!) : Math.min(b, a.score!)),
        null as number | null,
      )
    : null;

  const ranking = hasCompleted
    ? rankRound(
        bestScores(
          (visibleAttempts ?? []).map((a) => ({ profileId: a.profile_id, score: a.score, status: a.status })),
          game.scoring,
        ),
        game.scoring,
      )
    : [];

  // quién ganó ayer (decisión 9): la ronda de ayer ya cerró, así que es visible
  let yesterday: TodayData["yesterday"] = null;
  const { data: yRound } = await supabase
    .from("rounds")
    .select("*")
    .eq("group_id", group.id)
    .eq("play_date", addDays(today, -1))
    .maybeSingle();
  if (yRound) {
    const yGame = getGame(yRound.game_id);
    const { ranked } = await rankedRound(admin, yRound);
    const top = ranked[0];
    const winner = top ? members.get(top.profileId) : undefined;
    if (yGame && top && winner) {
      yesterday = { game: yGame, winner, score: top.bestScore, tied: ranked.filter((r) => r.rank === 1).length > 1 };
    }
  }

  return {
    group,
    today,
    round,
    game,
    members,
    championId,
    attemptsUsed,
    attemptsLeft: Math.max(0, group.max_attempts - attemptsUsed),
    myBest,
    hasCompleted,
    ranking,
    participants: (participants ?? []).map((p) => ({ profileId: p.profile_id, completedAttempts: p.completed_attempts })),
    yesterday,
  };
}
