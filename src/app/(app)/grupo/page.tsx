import { createClient } from "@/lib/supabase/server";
import { getMyGroups, pickCurrentGroup } from "@/lib/groups";
import { parseAvatar } from "@/lib/avatar";
import { Avatar } from "@/components/avatar";
import { InviteButton } from "@/components/invite-button";
import { GroupSwitcher } from "./group-switcher";

export const dynamic = "force-dynamic";

export default async function GroupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const groups = await getMyGroups();
  const group = await pickCurrentGroup(groups);
  if (!group || !user) return null; // el layout ya redirige

  const { data: members, error: membersError } = await supabase
    .from("group_members")
    .select("profile_id, role, nickname, joined_at")
    .eq("group_id", group.id)
    .order("joined_at", { ascending: true });
  if (membersError) throw new Error(membersError.message);

  const ids = (members ?? []).map((m) => m.profile_id);
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name, avatar")
    .in("id", ids);
  if (profilesError) throw new Error(profilesError.message);

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const rows = (members ?? []).map((m) => {
    const p = byId.get(m.profile_id);
    return {
      id: m.profile_id,
      name: m.nickname ?? p?.display_name ?? "alguien",
      avatar: parseAvatar(p?.avatar),
      role: m.role,
      isMe: m.profile_id === user.id,
    };
  });

  return (
    <main className="flex flex-col gap-8 px-5 py-8">
      <header className="flex flex-col gap-3">
        {groups.length > 1 ? (
          <GroupSwitcher groups={groups.map((g) => ({ id: g.id, name: g.name }))} currentId={group.id} />
        ) : null}
        <h1 className="text-4xl font-extrabold tracking-tight" data-testid="group-name">
          {group.name}
        </h1>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm text-tinta-suave">tabla de la temporada</h2>
        <p className="rounded-md bg-superficie px-4 py-3 text-tinta-suave">
          todavía no se jugó ninguna ronda. la primera partida arma la tabla.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm text-tinta-suave">
          {rows.length === 1 ? "por ahora sos vos" : `${rows.length} integrantes`}
        </h2>
        <ul className="flex flex-col" data-testid="members">
          {rows.map((r) => (
            <li
              key={r.id}
              data-testid="member"
              className={`flex items-center gap-3 border-b border-superficie py-3 ${
                r.isMe ? "-ml-5 border-l-4 border-l-agua pl-4" : ""
              }`}
            >
              <Avatar avatar={r.avatar} name={r.name} />
              <span className="flex-1 text-lg font-bold">{r.name}</span>
              {r.role === "owner" ? <span className="text-xs text-tinta-suave">creó el grupo</span> : null}
              {r.isMe ? <span className="text-xs text-agua">vos</span> : null}
            </li>
          ))}
        </ul>
        {rows.length === 1 ? (
          <p className="text-tinta-suave">
            un grupo de uno no tiene ranking. mandale el link a alguien y se arma.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm text-tinta-suave">invitar a alguien</h2>
        <InviteButton code={group.invite_code} groupName={group.name} />
      </section>
    </main>
  );
}
