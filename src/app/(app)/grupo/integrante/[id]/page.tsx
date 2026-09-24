import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups, pickCurrentGroup } from "@/lib/groups";
import { loadChampion, loadMembers } from "@/lib/today";
import { computeStats } from "@/lib/stats";
import { Avatar } from "@/components/avatar";
import { Crown } from "@/components/crown";
import { ProfileStats } from "@/components/profile-stats";

export const dynamic = "force-dynamic";

// El perfil de otro integrante: avatar, nombre en este grupo y su historial.
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const groups = await getMyGroups();
  const group = await pickCurrentGroup(groups);
  if (!user || !group) return null;

  const [members, championId, stats] = await Promise.all([loadMembers(group.id), loadChampion(group.id), computeStats(id)]);
  const member = members.get(id);
  if (!member) notFound();

  return (
    <main className="flex flex-col gap-8 px-5 py-8">
      <header className="flex flex-col gap-3">
        <Link href="/grupo" className="text-sm text-tinta-suave">
          ← {group.name}
        </Link>
        <div className="flex items-center gap-4">
          <Avatar avatar={member.avatar} name={member.name} size={80} />
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight" data-testid="member-name">
            <span className="truncate">{member.name}</span>
            {id === championId ? <Crown /> : null}
          </h1>
        </div>
      </header>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm text-tinta-suave">{id === user.id ? "tus números" : "sus números"}</h2>
        <ProfileStats stats={stats} />
      </section>
    </main>
  );
}
