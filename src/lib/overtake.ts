import "server-only";

import type { AdminClient } from "@/lib/supabase/admin";
import type { RoundRow } from "@/lib/supabase/types";
import { getGame } from "@/games";
import { overtakenBy, type RankedEntry } from "./scoring";
import { sendPushToProfiles } from "./push";

// Aviso "te pasaron": se llama desde /finish con el ranking de la ronda antes
// y después del puntaje nuevo. A cada uno que quedó atrás le llega un push.
export async function notifyOvertaken(
  admin: AdminClient,
  round: RoundRow,
  finisherId: string,
  before: readonly RankedEntry[],
  after: readonly RankedEntry[],
): Promise<string[]> {
  const losers = overtakenBy(before, after, finisherId);
  if (losers.length === 0) return [];

  const game = getGame(round.game_id);
  const [{ data: membership }, { data: profile }] = await Promise.all([
    admin.from("group_members").select("nickname").eq("group_id", round.group_id).eq("profile_id", finisherId).maybeSingle(),
    admin.from("profiles").select("display_name").eq("id", finisherId).maybeSingle(),
  ]);
  const name = membership?.nickname ?? profile?.display_name ?? "alguien";
  const mine = after.find((e) => e.profileId === finisherId);
  const unit = game?.scoring === "low" ? " ms" : "";

  await sendPushToProfiles(admin, losers, {
    title: `${name} te pasó en ${game?.name ?? round.game_id}`,
    body: `hizo ${mine?.bestScore ?? "?"}${unit}. todavía podés responder si te quedan intentos.`,
    url: "/hoy",
    tag: `pasaron-${round.id}`,
  });
  return losers;
}
