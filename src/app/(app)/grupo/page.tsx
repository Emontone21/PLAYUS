import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups, pickCurrentGroup } from "@/lib/groups";
import { loadChampion, loadMembers } from "@/lib/today";
import { loadGroupSummary } from "@/lib/group-summary";
import { seriesSummary } from "@/lib/chart";
import { daysBetween, formatShortDate } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { Crown } from "@/components/crown";
import { Frog } from "@/components/frog/Frog";
import { LilyInline } from "@/components/lily";
import { InviteButton } from "@/components/invite-button";
import { Ranking, type RankingRow } from "@/components/ranking";
import { SeasonChart } from "@/components/season-chart";
import { GroupSwitcher } from "./group-switcher";
import { ReminderTime } from "./reminder-time";
import { SeasonPicker } from "./season-picker";

export const dynamic = "force-dynamic";

export default async function GroupPage({ searchParams }: { searchParams: Promise<{ temporada?: string }> }) {
  const { temporada } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const groups = await getMyGroups();
  const group = await pickCurrentGroup(groups);
  if (!group || !user) return null; // el layout ya redirige

  const members = await loadMembers(group.id);
  const [championId, summary, { data: memberships }] = await Promise.all([
    loadChampion(group.id),
    loadGroupSummary(user.id, group, members, temporada ? Number(temporada) : undefined),
    supabase.from("group_members").select("profile_id, role, joined_at").eq("group_id", group.id).order("joined_at"),
  ]);

  const closed = !!summary.season.closed_at;
  const colorOf = new Map(summary.series.series.map((s) => [s.profileId, s.color]));
  const tableRows: RankingRow[] = summary.standings.map((s) => {
    const m = members.get(s.profileId);
    return {
      profileId: s.profileId,
      name: m?.name ?? "alguien",
      avatar: m!.avatar,
      rank: s.rank,
      value: s.points,
      unit: "colillas",
      colillas: true,
      detail: `${s.wins} ${s.wins === 1 ? "día ganado" : "días ganados"}`,
      color: colorOf.get(s.profileId),
      trend: closed ? null : summary.series.trend[s.profileId] ?? null,
      isMe: s.profileId === user.id,
      champion: closed ? summary.champions.includes(s.profileId) : s.profileId === championId,
    };
  });

  const rows = (memberships ?? []).map((m) => ({ ...m, member: members.get(m.profile_id) }));
  const endsOn = summary.season.ends_on;
  const daysLeft = endsOn ? Math.max(0, daysBetween(summary.today, endsOn) + 1) : null;

  return (
    <main className="flex flex-col gap-8 px-5 py-6">
      <header className="flex flex-col gap-3">
        {groups.length > 1 ? (
          <GroupSwitcher groups={groups.map((g) => ({ id: g.id, name: g.name }))} currentId={group.id} />
        ) : null}
        <h1 className="display-lg text-tinta" style={{ fontSize: 40 }} data-testid="group-name">
          {group.name}
        </h1>
      </header>

      <section className="flex flex-col gap-3" data-testid="season-table" data-season={summary.season.number} data-closed={closed ? "1" : ""}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="display text-xl text-tinta">temporada {summary.season.number}</h2>
            {summary.seasons.length > 1 ? <SeasonPicker seasons={summary.seasons} current={summary.current.number} selected={summary.season.number} /> : null}
          </div>
          <p className="text-xs text-tinta-suave" data-testid="season-dates">
            {closed ? "terminó" : daysLeft === null ? "en curso" : `${daysLeft === 1 ? "queda 1 día" : `quedan ${daysLeft} días`}`} · del {formatShortDate(summary.season.starts_on)} al{" "}
            {endsOn ? formatShortDate(endsOn) : "…"}
          </p>
        </div>
        <SeasonChart
          days={summary.series.days}
          lastClosed={summary.series.lastClosed}
          todayIndex={summary.series.todayIndex}
          series={summary.series.series}
          myId={user.id}
          label={seriesSummary(summary.series.series, summary.standings)}
        />
        <Ranking
          rows={tableRows}
          testId="standings"
          emptyText="la tabla se despierta a medianoche, cuando cierre el primer día jugado. lo de hoy ya suma."
          empty={
            closed ? (
              <p className="note text-sm text-tinta-suave">en esta temporada no jugó nadie.</p>
            ) : (
              <p className="note text-sm text-tinta-suave">la tabla se despierta a medianoche, cuando cierre el primer día jugado. lo de hoy ya suma.</p>
            )
          }
        />
        {tableRows.length > 0 ? (
          <p className="text-xs text-tinta-suave">{closed ? "la tabla final de la temporada." : "colillas de los días ya cerrados. lo de hoy suma a medianoche."}</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3" data-testid="history">
        <h2 className="display text-xl text-tinta">días anteriores</h2>
        {summary.history.length === 0 ? (
          <div className="note flex items-center gap-3">
            <LilyInline size={32} />
            <p className="text-sm text-tinta-suave">todavía no hay días cerrados. jugá hoy y mañana aparece acá.</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {summary.history.map((h) => {
              const winner = h.winnerId ? members.get(h.winnerId) : undefined;
              return (
                <li key={h.round.id} className="flex items-center gap-3 py-3" style={{ borderBottom: "2px solid var(--superficie-2)" }} data-testid="history-row">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-xs text-tinta-suave">{formatShortDate(h.round.play_date)}</span>
                    <span className="display text-lg">{h.gameName}</span>
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
        <h2 className="display text-xl text-tinta">
          {rows.length === 1 ? "por ahora sos vos" : `${rows.length} integrantes`}
        </h2>
        <ul className="flex flex-col" data-testid="members">
          {rows.map((r) => {
            const me = r.profile_id === user.id;
            return (
              <li
                key={r.profile_id}
                data-testid="member"
                className={`flex items-center gap-3 py-3 ${me ? "-ml-5 bg-mi-fila pl-[14px] pr-2" : ""}`}
                style={{
                  borderBottom: "2px solid var(--superficie-2)",
                  ...(me ? { borderLeft: "6px solid var(--agua)", borderRadius: "0 14px 14px 0" } : {}),
                }}
              >
                <Link href={`/grupo/integrante/${r.profile_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar avatar={r.member!.avatar} name={r.member?.name ?? ""} />
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="truncate display-bold text-lg">{r.member?.name}</span>
                    {r.profile_id === championId ? <Crown /> : null}
                  </span>
                </Link>
                {r.role === "owner" ? <span className="text-xs text-tinta-suave">creó el grupo</span> : null}
                {me ? <span className="text-xs text-agua">vos</span> : null}
              </li>
            );
          })}
        </ul>
        {rows.length === 1 ? (
          <p className="text-sm">un grupo de uno no tiene ranking. mandale el link a alguien y se arma.</p>
        ) : null}
      </section>

      <section className="relative mt-8 flex flex-col gap-3">
        <Frog pose="risa" size={100} tilt={8} className="absolute -top-14 right-1 z-10" />
        <div className="card card-c flex flex-col gap-3 pt-8">
          <h2 className="display text-xl text-tinta">invitar a alguien</h2>
          <InviteButton code={group.invite_code} groupName={group.name} />
        </div>
      </section>

      {rows.some((r) => r.profile_id === user.id && r.role === "owner") ? (
        <section className="flex flex-col gap-3">
          <h2 className="display text-xl text-tinta">ajustes del grupo</h2>
          <ReminderTime groupId={group.id} value={group.reminder_time} timezone={group.timezone} />
        </section>
      ) : null}
    </main>
  );
}
