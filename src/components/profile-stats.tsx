import { Frog } from "@/components/frog/Frog";

// Estadísticas del perfil. Un null se muestra como "—". Las victorias van en
// luciérnaga y la mejor racha en lengua; al lado del juego donde mejor te va,
// la rana se ríe.
export type ProfileStatsData = {
  roundsPlayed: number | null;
  wins: number | null;
  bestStreak: number | null;
  seasonsWon: number | null;
  bestGame: string | null;
};

export const EMPTY_STATS: ProfileStatsData = {
  roundsPlayed: null,
  wins: null,
  bestStreak: null,
  seasonsWon: null,
  bestGame: null,
};

export function ProfileStats({ stats }: { stats: ProfileStatsData }) {
  const items: Array<{ label: string; value: string; tone?: string }> = [
    { label: "rondas jugadas", value: fmt(stats.roundsPlayed) },
    { label: "victorias", value: fmt(stats.wins), tone: "text-luciernaga" },
    { label: "mejor racha", value: fmt(stats.bestStreak), tone: "text-lengua" },
    { label: "temporadas ganadas", value: fmt(stats.seasonsWon) },
  ];
  const empty = Object.values(stats).every((v) => v === null || v === 0);

  return (
    <div className="flex flex-col gap-3" data-testid="profile-stats">
      <dl className="grid grid-cols-2 gap-x-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col py-3" style={{ borderBottom: "2px solid var(--superficie-2)" }}>
            <dt className="text-xs text-tinta-suave">{item.label}</dt>
            <dd className={`display text-3xl ${item.tone ?? "text-tinta"}`}>{item.value}</dd>
          </div>
        ))}
        <div className="col-span-2 flex items-center justify-between gap-3 py-3" style={{ borderBottom: "2px solid var(--superficie-2)" }}>
          <div className="flex min-w-0 flex-col">
            <dt className="text-xs text-tinta-suave">donde mejor te va</dt>
            <dd className="truncate display text-3xl text-tinta">{stats.bestGame ?? "—"}</dd>
          </div>
          {stats.bestGame ? <Frog pose="risa" size={62} tilt={-8} /> : null}
        </div>
      </dl>
      {empty ? <p className="eyebrow">se llenan con tu primera partida. no hay apuro.</p> : null}
    </div>
  );
}

function fmt(n: number | null): string {
  return n === null ? "—" : String(n);
}
