import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups, pickCurrentGroup } from "@/lib/groups";
import { loadToday } from "@/lib/today";
import { Play } from "./play";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const groups = await getMyGroups();
  const group = await pickCurrentGroup(groups);
  if (!user || !group) redirect("/");

  const t = await loadToday(user.id, group);
  if (t.attemptsLeft <= 0) redirect("/hoy");

  return (
    <main className="px-5 py-6">
      <Play
        roundId={t.round.id}
        gameId={t.game.id}
        seed={t.round.seed}
        attemptsLeft={t.attemptsLeft}
        firstTime={t.attemptsUsed === 0}
      />
    </main>
  );
}
