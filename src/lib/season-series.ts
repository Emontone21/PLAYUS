import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { GroupRow, SeasonRow } from "@/lib/supabase/types";
import { buildSeasonSeries, type SeasonSeries } from "./chart";
import { rankedRound } from "./rounds";
import { rulesForSeason } from "./scoring";
import { todayInTz, type DateString } from "./time";
import type { Member } from "./today";

// La gráfica de la temporada: colillas acumuladas por integrante y por día
// cerrado, más los días ganados. Se lee con el cliente del usuario, así RLS
// decide: las rondas y los intentos de un grupo ajeno no se ven (y los de la
// ronda de hoy no cuentan: solo entran los días ya cerrados).

export type UserClient = SupabaseClient<Database>;

export async function loadSeasonSeries(supabase: UserClient, group: GroupRow, season: SeasonRow, members: Map<string, Member>, today: DateString): Promise<SeasonSeries> {
  const [{ data: rounds, error }, { data: memberships }] = await Promise.all([
    supabase.from("rounds").select("*").eq("season_id", season.id).order("play_date"),
    supabase.from("group_members").select("profile_id, joined_at").eq("group_id", group.id).order("joined_at"),
  ]);
  if (error) throw new Error(`rounds: ${error.message}`);
  const rules = rulesForSeason(season);
  const closed = !!season.closed_at;
  // solo los días cerrados (ayer para atrás): lo de hoy sigue tapado
  const visible = (rounds ?? []).filter((r) => closed || r.play_date < today);
  const ranked = await Promise.all(visible.map((r) => rankedRound(supabase, r, rules)));
  return buildSeasonSeries({
    startsOn: season.starts_on,
    endsOn: season.ends_on ?? season.starts_on,
    today,
    closed,
    rounds: ranked.map((r) => ({ playDate: r.round.play_date, ranked: r.ranked })),
    members: (memberships ?? [])
      .filter((m) => members.has(m.profile_id))
      .map((m) => ({ profileId: m.profile_id, name: members.get(m.profile_id)!.name, joinedOn: todayInTz(group.timezone, new Date(m.joined_at)) })),
  });
}
