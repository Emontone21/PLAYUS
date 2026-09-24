import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { parseAvatar } from "@/avatar/schema";
import { Avatar } from "@/components/avatar";
import { ProfileStats } from "@/components/profile-stats";
import { computeStats } from "@/lib/stats";
import { getMyGroups } from "@/lib/groups";
import { Nicknames } from "./nicknames";
import { LinkEmail } from "./link-email";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // el layout redirige

  const [{ data: profile }, groups, { data: memberships }, stats] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar").eq("id", user.id).maybeSingle(),
    getMyGroups(),
    supabase.from("group_members").select("group_id, nickname").eq("profile_id", user.id),
    computeStats(user.id),
  ]);

  const name = profile?.display_name ?? "";
  const avatar = parseAvatar(profile?.avatar);
  const nicknameByGroup = new Map((memberships ?? []).map((m) => [m.group_id, m.nickname]));
  const groupsWithNickname = groups.map((g) => ({
    id: g.id,
    name: g.name,
    nickname: nicknameByGroup.get(g.id) ?? null,
  }));

  return (
    <main className="flex flex-col gap-8 px-5 py-8">
      <header className="flex items-center gap-4">
        <Avatar avatar={avatar} name={name} size={80} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="truncate text-3xl font-extrabold tracking-tight" data-testid="profile-name">
            {name || "sin nombre"}
          </h1>
          <Link href="/perfil/editar" className="text-sm font-bold text-agua">
            editar nombre y avatar
          </Link>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm text-tinta-suave">tus números</h2>
        <ProfileStats stats={stats} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm text-tinta-suave">apodo por grupo</h2>
        <p className="text-sm text-tinta-suave">
          en cada grupo te pueden conocer distinto. si lo dejás vacío, se usa tu nombre.
        </p>
        <Nicknames groups={groupsWithNickname} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm text-tinta-suave">ajustes</h2>
        <p className="rounded-md bg-superficie px-4 py-3 text-sm text-tinta-suave">
          las notificaciones llegan en la etapa 6.
        </p>
        <LinkEmail currentEmail={user.email ?? null} pendingEmail={user.new_email ?? null} />
      </section>
    </main>
  );
}
