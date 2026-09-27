import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups, pickCurrentGroup } from "@/lib/groups";
import { loadToday } from "@/lib/today";
import { formatShortDate } from "@/lib/time";
import type { RankingRow } from "@/components/ranking";
import { RankingReveal } from "@/components/ranking-reveal";
import { Avatar } from "@/components/avatar";
import { Frog } from "@/components/frog/Frog";
import { LiveRefresh } from "./live-refresh";
import { PushCard } from "@/components/push-card";
import { InstallCard } from "@/components/install-card";

export const dynamic = "force-dynamic";

const FALLBACK_AVATAR = { base: 1, skin: "#C98A5E", hair: 1, hairColor: "#000000", eyes: 1, mouth: 1, accessory: null, bg: "#FFD34E" } as const;

// Hoy: la tarjeta del juego del día si todavía no jugaste (con los puntajes de
// los demás tapados), el ranking en vivo si ya jugaste, y arriba quién ganó ayer.
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

  const played = new Set(t.ranking.map((r) => r.profileId));
  const rows: RankingRow[] = [
    ...t.ranking.map((r) => {
      const m = t.members.get(r.profileId);
      return {
        profileId: r.profileId,
        name: m?.name ?? "alguien",
        avatar: m?.avatar ?? FALLBACK_AVATAR,
        rank: r.rank,
        value: r.bestScore,
        unit,
        detail: `+${r.points}`,
        isMe: r.profileId === user.id,
        champion: r.profileId === t.championId,
      };
    }),
    // los que todavía no jugaron van al final, con la rana dormida
    ...[...t.members.values()]
      .filter((m) => !played.has(m.profileId))
      .map((m) => ({
        profileId: m.profileId,
        name: m.name,
        avatar: m.avatar,
        rank: 0,
        value: 0,
        isMe: m.profileId === user.id,
        champion: m.profileId === t.championId,
        pending: true,
      })),
  ];

  const playedIds = new Set(t.participants.map((p) => p.profileId));
  const others = [...t.members.values()].filter((m) => m.profileId !== user.id);

  return (
    <main className="flex flex-col gap-8 px-5 py-6">
      <header className="flex flex-col gap-1">
        <p className="eyebrow">
          {group.name}, {formatShortDate(t.today)}
        </p>
        {t.yesterday ? (
          <p className="text-sm" data-testid="yesterday-winner">
            ayer {t.yesterday.tied ? "empató arriba" : "ganó"} <span className="display-bold text-tinta">{t.yesterday.winner.name}</span> con{" "}
            <span className="display-bold text-tinta">{t.yesterday.score}</span>
            {t.yesterday.game.scoring === "low" ? " ms" : ""} en {t.yesterday.game.name}.
          </p>
        ) : null}
      </header>

      {!t.hasCompleted ? (
        <section className="flex flex-col gap-6" data-testid="today-game">
          {/* la tarjeta del juego, con la rana asomada en la esquina y su globo */}
          <div className="relative mt-10">
            <div className="absolute -top-12 right-2 z-10 flex items-end gap-1">
              <span className="speech mb-8 -mr-3">¡te toca, dale!</span>
              <Frog pose="lengua" size={120} tilt={8} />
            </div>
            <div className="card card-b flex flex-col gap-4 pt-6">
              <div className="flex flex-col gap-2 pr-24">
                <p className="text-sm text-rana">el juego de hoy</p>
                <h1 className="display-lg text-tinta" style={{ fontSize: 58 }} data-testid="today-game-name">
                  {t.game.name}
                </h1>
                <p className="text-lg">{t.game.tagline}</p>
              </div>
              <ol className="flex flex-col gap-3">
                {t.game.howTo.map((step, i) => (
                  <li key={step} className="flex items-center gap-3">
                    <span className="bubble-number">{i + 1}</span>
                    <span className="text-tinta-media">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {t.attemptsLeft > 0 ? (
            <Link href="/hoy/jugar" className="btn-primary" data-testid="play-link">
              jugar
            </Link>
          ) : (
            <p className="note-alert" data-testid="no-attempts">
              se te fueron los {group.max_attempts} intentos sin terminar ninguna partida. mañana hay revancha.
            </p>
          )}
          <p className="eyebrow -mt-2" data-testid="attempts-left">
            {attemptsText}. el intento cuenta al empezar: si cerrás o recargás a mitad de partida, lo perdés.
          </p>

          <div className="flex flex-col gap-3" data-testid="participants">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="display text-xl text-tinta">los demás</h2>
              <span className="eyebrow">se destapa cuando juegues</span>
            </div>
            {t.participants.length === 0 ? (
              <p className="text-sm">todavía nadie jugó hoy. sé quien abre el ranking.</p>
            ) : (
              <p className="eyebrow">ya jugaron {t.participants.length}.</p>
            )}
            {others.length > 0 ? (
              <ul className="flex flex-col">
                {others.map((m) => {
                  const done = playedIds.has(m.profileId);
                  return (
                    <li key={m.profileId} className="flex items-center gap-3 py-2" style={{ borderBottom: "2px solid var(--superficie-2)" }}>
                      <Avatar avatar={m.avatar} name={m.name} size={36} />
                      <span className="min-w-0 flex-1 truncate display-bold text-base">{m.name}</span>
                      {done ? (
                        <span className="covered" role="img" aria-label="puntaje tapado">
                          <svg viewBox="0 0 40 12" width="34" height="10" aria-hidden="true">
                            <path d="M0 8 Q5 2 10 8 T20 8 T30 8 T40 8" fill="none" stroke="var(--agua)" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                        </span>
                      ) : (
                        <Frog pose="dormida" size={44} />
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-5" data-testid="today-ranking">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-rana">ranking de hoy: {t.game.name}</p>
              <p className="eyebrow" data-testid="attempts-left">
                tu mejor: <span className="display text-tinta">{t.myBest}</span>
                {unit ? ` ${unit}` : ""}. {attemptsText}.
              </p>
            </div>
            {t.attemptsLeft > 0 ? (
              <Link href="/hoy/jugar" className="btn-primary-sm shrink-0" data-testid="play-again-link">
                jugar de nuevo
              </Link>
            ) : null}
          </div>

          {t.overtaker ? (
            <div className="relative ml-6 mt-2" data-testid="overtaken">
              <Frog pose="sorpresa" size={80} tilt={-12} className="absolute -left-9 -top-6 z-10" />
              <p className="note-alert pl-12 text-sm">
                <span className="display-bold">{t.overtaker.member.name}</span> te pasó por {t.overtaker.diff}
                {unit ? ` ${unit}` : ""}. mañana te la cobrás.
              </p>
            </div>
          ) : null}

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
