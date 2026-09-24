import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups, pickCurrentGroup } from "@/lib/groups";
import { loadChampion, loadMembers } from "@/lib/today";
import { loadGroupSummary } from "@/lib/group-summary";
import { formatShortDate } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { Crown } from "@/components/crown";
import { InviteButton } from "@/components/invite-button";
import { Ranking, type RankingRow } from "@/components/ranking";
import { GroupSwitcher } from "./group-switcher";
import { ReminderTime } from "./reminder-time";

export const dynamic = "force-dynamic";

export default async function GroupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const groups = await getMyGroups();
  const group = await pickCurrentGroup(groups);
  if (!group || !user) return null; // el layout ya redirige

  const [members, championId, summary, { data: memberships }] = await Promise.all([
    loadMembers(group.id),
    loadChampion(group.id),
    loadGroupSummary(user.id, group),
    supabase.from("group_members").select("profile_id, role, joined_at").eq("group_id", group.id).order("joined_at"),
  ]);

  const tableRows: RankingRow[] = summary.standings.map((s) => {
    const m = members.get(s.profileId);
    return {
      profileId: s.profileId,
      name: m?.name ?? "alguien",
      avatar: m!.avatar,
      rank: s.rank,
      value: s.points,
      unit: "pts",
      detail: s.wins > 0 ? `${s.wins} ${s.wins === 1 ? "victoria" : "victorias"}` : undefined,
      isMe: s.profileId === user.id,
      champion: s.profileId === championId,
    };
  });

  const rows = (memberships ?? []).map((m) => ({ ...m, member: members.get(m.profile_id) }));

  return (
    <main className="flex flex-col gap-8 px-5 py-8">
      <header className="flex flex-col gap-3">
        {groups.length > 1 ? (
          <GroupSwitcher groups={groups.map((g) => ({ id: g.id, name: g.name }))} currentId={group.id} />
        ) : null}
        <h1 className="display text-4xl" data-testid="group-name">
          {group.name}
        </h1>
      </header>

      <section className="flex flex-col gap-3" data-testid="season-table">
        <div className="flex items-baseline justify-between">
          <h2 className="eyebrow">temporada {summary.season.number}</h2>
          <span className="text-xs text-tinta-suave">
            del {formatShortDate(summary.season.starts_on)} al {summary.season.ends_on ? formatShortDate(summary.season.ends_on) : "…"}
          </span>
        </div>
        <Ranking
          rows={tableRows}
          testId="standings"
          emptyText="la tabla arranca cuando cierre el primer día jugado. lo de hoy suma a medianoche."
        />
        {tableRows.length > 0 ? (
          <p className="text-xs text-tinta-suave">puntos de los días ya cerrados. lo de hoy suma a medianoche.</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3" data-testid="history">
        <h2 className="eyebrow">días anteriores</h2>
        {summary.history.length === 0 ? (
          <p className="note">
            todavía no hay días cerrados. jugá hoy y mañana aparece acá.
          </p>
        ) : (
          <ul className="flex flex-col">
            {summary.history.map((h) => {
              const winner = h.winnerId ? members.get(h.winnerId) : undefined;
              return (
                <li key={h.round.id} className="flex items-center gap-3 border-b border-superficie py-3" data-testid="history-row">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-xs text-tinta-suave">{formatShortDate(h.round.play_date)}</span>
                    <span className="font-extrabold">{h.gameName}</span>
                    <span className="truncate text-sm text-tinta-suave">
                      {winner
                        ? `${h.tied ? "empate arriba: " : "ganó "}${winner.name} con ${h.winnerScore}${h.scoring === "low" ? " ms" : ""}. jugaron ${h.players}.`
                        : "nadie jugó"}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-xs text-tinta-suave">vos</span>
                    <span className="display text-xl">
                      {h.myScore !== null ? `${h.myScore}${h.scoring === "low" ? " ms" : ""}` : "—"}
                    </span>
                    {h.myRank ? <span className="text-xs text-tinta-suave">{h.myRank}º</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">
          {rows.length === 1 ? "por ahora sos vos" : `${rows.length} integrantes`}
        </h2>
        <ul className="flex flex-col" data-testid="members">
          {rows.map((r) => (
            <li
              key={r.profile_id}
              data-testid="member"
              className={`flex items-center gap-3 border-b border-superficie py-3 ${
                r.profile_id === user.id ? "-ml-5 border-l-4 border-l-agua pl-4" : ""
              }`}
            >
              <Link href={`/grupo/integrante/${r.profile_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar avatar={r.member!.avatar} name={r.member?.name ?? ""} />
                <span className="flex min-w-0 flex-1 items-center gap-1">
                  <span className="truncate text-lg font-bold">{r.member?.name}</span>
                  {r.profile_id === championId ? <Crown /> : null}
                </span>
              </Link>
              {r.role === "owner" ? <span className="text-xs text-tinta-suave">creó el grupo</span> : null}
              {r.profile_id === user.id ? <span className="text-xs text-agua">vos</span> : null}
            </li>
          ))}
        </ul>
        {rows.length === 1 ? (
          <p className="text-tinta-suave">un grupo de uno no tiene ranking. mandale el link a alguien y se arma.</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="eyebrow">invitar a alguien</h2>
        <InviteButton code={group.invite_code} groupName={group.name} />
      </section>

      {rows.some((r) => r.profile_id === user.id && r.role === "owner") ? (
        <section className="flex flex-col gap-3">
          <h2 className="eyebrow">ajustes del grupo</h2>
          <ReminderTime groupId={group.id} value={group.reminder_time} timezone={group.timezone} />
        </section>
      ) : null}
    </main>
  );
}
