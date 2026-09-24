// Estadísticas del perfil. Armadas ahora, se llenan en la etapa 5 cuando
// haya rondas e intentos. Un null se muestra como "—".
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
  const items: Array<{ label: string; value: string }> = [
    { label: "rondas jugadas", value: fmt(stats.roundsPlayed) },
    { label: "victorias", value: fmt(stats.wins) },
    { label: "mejor racha", value: fmt(stats.bestStreak) },
    { label: "temporadas ganadas", value: fmt(stats.seasonsWon) },
    { label: "donde mejor te va", value: stats.bestGame ?? "—" },
  ];
  const empty = Object.values(stats).every((v) => v === null);

  return (
    <div className="flex flex-col gap-3" data-testid="profile-stats">
      <dl className="grid grid-cols-2 gap-x-4">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col border-b border-superficie py-3">
            <dt className="text-xs text-tinta-suave">{item.label}</dt>
            <dd className="text-2xl font-extrabold">{item.value}</dd>
          </div>
        ))}
      </dl>
      {empty ? (
        <p className="text-sm text-tinta-suave">se llenan con tu primera partida. no hay apuro.</p>
      ) : null}
    </div>
  );
}

function fmt(n: number | null): string {
  return n === null ? "—" : String(n);
}
