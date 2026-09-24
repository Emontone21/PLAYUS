import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups, pickCurrentGroup } from "@/lib/groups";
import { loadToday } from "@/lib/today";
import { formatShortDate } from "@/lib/time";
import type { RankingRow } from "@/components/ranking";
import { RankingReveal } from "@/components/ranking-reveal";
import { Avatar } from "@/components/avatar";
import { LiveRefresh } from "./live-refresh";
import { PushCard } from "@/components/push-card";
import { InstallCard } from "@/components/install-card";

export const dynamic = "force-dynamic";

// Hoy: el juego del día grande si todavía no jugaste (con los puntajes de los
// demás tapados), el ranking en vivo si ya jugaste, y arriba quién ganó ayer.
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ reveal?: string }> }) {
  const { reveal } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const groups = await getMyGroups();
  const group = await pickCurrentGroup(groups);
  if (!user || !group) return null;

  const t = await loadToday(user.id, group);
  const unit = t.game.scoring === "low" ? "ms" : undefined;
  const attemptsText =
    t.attemptsLeft === 0 ? "no te quedan intentos por hoy" : t.attemptsLeft === 1 ? "te queda 1 intento" : `te quedan ${t.attemptsLeft} intentos`;

  const rows: RankingRow[] = t.ranking.map((r) => {
    const m = t.members.get(r.profileId);
    return {
      profileId: r.profileId,
      name: m?.name ?? "alguien",
      avatar: m?.avatar ?? t.members.values().next().value?.avatar ?? { base: 1, skin: "#C98A5E", hair: 1, hairColor: "#000000", eyes: 1, mouth: 1, accessory: null, bg: "#FFC94A" },
      rank: r.rank,
      value: r.bestScore,
      unit,
      detail: `+${r.points}`,
      isMe: r.profileId === user.id,
      champion: r.profileId === t.championId,
    };
  });

  return (
    <main className="flex flex-col gap-8 px-5 py-8">
      <header className="flex flex-col gap-1">
        <p className="eyebrow">
          {group.name}, {formatShortDate(t.today)}
        </p>
        {t.yesterday ? (
          <p className="text-sm" data-testid="yesterday-winner">
            ayer {t.yesterday.tied ? "empató arriba" : "ganó"} <span className="font-extrabold">{t.yesterday.winner.name}</span> con{" "}
            <span className="font-extrabold tabular-nums">{t.yesterday.score}</span>
            {t.yesterday.game.scoring === "low" ? " ms" : ""} en {t.yesterday.game.name}.
          </p>
        ) : null}
      </header>

      {!t.hasCompleted ? (
        <section className="flex flex-col gap-5" data-testid="today-game">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-oro">el juego de hoy</p>
            <h1 className="display text-5xl" data-testid="today-game-name">
              {t.game.name}
            </h1>
            <p className="text-lg text-tinta-suave">{t.game.tagline}</p>
          </div>
          <ol className="flex flex-col gap-2">
            {t.game.howTo.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="w-6 shrink-0 text-right font-extrabold text-oro">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {t.attemptsLeft > 0 ? (
            <Link
              href="/hoy/jugar"
              className="btn-primary"
              data-testid="play-link"
            >
              jugar
            </Link>
          ) : (
            <p className="note-alert" data-testid="no-attempts">
              se te fueron los {group.max_attempts} intentos sin terminar ninguna partida. mañana hay revancha.
            </p>
          )}
          <p className="eyebrow" data-testid="attempts-left">
            {attemptsText}
            {t.attemptsUsed > 0 && t.attemptsLeft > 0 ? ". las partidas que no terminaste se contaron igual." : ""}
          </p>

          <div className="flex flex-col gap-2" data-testid="participants">
            {t.participants.length === 0 ? (
              <p className="text-tinta-suave">todavía nadie jugó hoy. sé quien abre el ranking.</p>
            ) : (
              <>
                <p className="eyebrow">
                  ya jugaron {t.participants.length}. los puntajes se destapan cuando termines tu primera partida.
                </p>
                <ul className="flex flex-wrap gap-2">
                  {t.participants.map((p) => {
                    const m = t.members.get(p.profileId);
                    if (!m) return null;
                    return (
                      <li key={p.profileId} className="flex items-center gap-2 rounded-full bg-superficie py-1 pl-1 pr-3">
                        <Avatar avatar={m.avatar} name={m.name} size={28} />
                        <span className="font-bold">{m.name}</span>
                        <span className="text-xs text-tinta-suave">???</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-4" data-testid="today-ranking">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col">
              <p className="text-sm text-oro">ranking de hoy: {t.game.name}</p>
              <p className="eyebrow" data-testid="attempts-left">
                tu mejor: <span className="display-bold text-tinta">{t.myBest}</span>
                {unit ? ` ${unit}` : ""}. {attemptsText}.
              </p>
            </div>
            {t.attemptsLeft > 0 ? (
              <Link
                href="/hoy/jugar"
                className="btn-primary-sm shrink-0"
                data-testid="play-again-link"
              >
                jugar de nuevo
              </Link>
            ) : null}
          </div>
          <RankingReveal rows={rows} myId={user.id} reveal={reveal === "1"} />
          <p className="text-xs text-tinta-suave">
            se actualiza solo cuando alguien termina una partida. los cuatro primeros suman 10, 7, 5 y 3; el resto, 1.
          </p>
          <LiveRefresh roundId={t.round.id} />
          {/* el permiso de notificaciones se ofrece después de la primera partida, nunca al entrar */}
          <PushCard userId={user.id} variant="offer" />
          <InstallCard />
        </section>
      )}
    </main>
  );
}
