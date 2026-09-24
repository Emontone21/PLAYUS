import type { ScoringDirection } from "@/games/types";

// Puntos por ronda: se ordena a los jugadores por su mejor puntaje
// (respetando la dirección del juego) y se reparte 10 / 7 / 5 / 3, y 1 punto
// para el resto de los que jugaron. Cero para el que no jugó (no aparece).
// Empate: mismo puesto y mismos puntos, y se saltea el puesto siguiente
// (1, 1, 3, ...). Función pura: no toca la base.

export const POINTS_BY_RANK: Readonly<Record<number, number>> = { 1: 10, 2: 7, 3: 5, 4: 3 };
export const POINTS_FOR_PLAYING = 1;

export interface RoundEntry {
  profileId: string;
  bestScore: number;
}

export interface RankedEntry extends RoundEntry {
  rank: number;
  points: number;
}

export function pointsForRank(rank: number): number {
  return POINTS_BY_RANK[rank] ?? POINTS_FOR_PLAYING;
}

export function rankRound(entries: readonly RoundEntry[], scoring: ScoringDirection): RankedEntry[] {
  const sorted = [...entries].sort((a, b) =>
    scoring === "high" ? b.bestScore - a.bestScore : a.bestScore - b.bestScore,
  );
  const out: RankedEntry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i] as RoundEntry;
    const previous = out[i - 1];
    const rank = previous && previous.bestScore === entry.bestScore ? previous.rank : i + 1;
    out.push({ ...entry, rank, points: pointsForRank(rank) });
  }
  return out;
}

/** El mejor puntaje de cada jugador a partir de sus intentos completados. */
export function bestScores(
  attempts: readonly { profileId: string; score: number | null; status: string }[],
  scoring: ScoringDirection,
): RoundEntry[] {
  const best = new Map<string, number>();
  for (const a of attempts) {
    if (a.status !== "completed" || a.score === null) continue;
    const current = best.get(a.profileId);
    if (current === undefined || (scoring === "high" ? a.score > current : a.score < current)) {
      best.set(a.profileId, a.score);
    }
  }
  return [...best.entries()].map(([profileId, bestScore]) => ({ profileId, bestScore }));
}

export interface StandingRow {
  profileId: string;
  points: number;
  wins: number;
  played: number;
  rank: number;
}

/** Tabla de posiciones acumulando los puntos de varias rondas ya rankeadas. */
export function standings(rounds: readonly RankedEntry[][]): StandingRow[] {
  const acc = new Map<string, { points: number; wins: number; played: number }>();
  for (const round of rounds) {
    for (const e of round) {
      const row = acc.get(e.profileId) ?? { points: 0, wins: 0, played: 0 };
      row.points += e.points;
      row.played += 1;
      if (e.rank === 1) row.wins += 1;
      acc.set(e.profileId, row);
    }
  }
  const sorted = [...acc.entries()]
    .map(([profileId, r]) => ({ profileId, ...r }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.profileId.localeCompare(b.profileId));
  return sorted.map((row, i) => {
    const prev = sorted[i - 1];
    const tied = prev && prev.points === row.points && prev.wins === row.wins;
    const rank = tied ? (i > 0 ? rankOf(sorted, i - 1) : 1) : i + 1;
    return { ...row, rank };
  });

  function rankOf(rows: typeof sorted, idx: number): number {
    // busca el primer índice del bloque empatado
    let j = idx;
    while (j > 0 && rows[j - 1]!.points === rows[idx]!.points && rows[j - 1]!.wins === rows[idx]!.wins) j--;
    return j + 1;
  }
}

/** Campeón de una temporada: más puntos, después más victorias. Null si nadie jugó. */
export function champion(rows: readonly StandingRow[]): string | null {
  return rows[0]?.profileId ?? null;
}
