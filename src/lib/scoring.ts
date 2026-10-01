import type { ScoringDirection } from "@/games/types";

// Colillas (los puntos de la temporada; en el código siguen siendo `points`,
// decisión 214) por ronda: se ordena a los jugadores por su mejor puntaje
// (respetando la dirección del juego) y cada uno que jugó se lleva lo de
// participar más lo de su puesto, según la tabla POINTS_RULES. Cero para el
// que no jugó (no aparece). Empate: mismo puesto y mismas colillas, y se
// saltea el puesto siguiente (1, 1, 3, ...). Funciones puras: no tocan la base.

export interface PointsRules {
  /** por jugar (al menos un intento completado) */
  forPlaying: number;
  /** por el puesto; los puestos que no figuran llevan `otherRank` */
  byRank: Readonly<Record<number, number>>;
  otherRank: number;
}

/** el reparto vigente: 5 por jugar; 20 / 15 / 11 / 8 / 6 / 4 por el puesto, 2 del 7.º en adelante */
export const POINTS_RULES: PointsRules = {
  forPlaying: 5,
  byRank: { 1: 20, 2: 15, 3: 11, 4: 8, 5: 6, 6: 4 },
  otherRank: 2,
};

/** el reparto anterior (10 / 7 / 5 / 3 y 1 para el resto), que conservan las temporadas cerradas antes del cambio */
export const POINTS_RULES_V1: PointsRules = {
  forPlaying: 0,
  byRank: { 1: 10, 2: 7, 3: 5, 4: 3 },
  otherRank: 1,
};

/** desde este día rige POINTS_RULES; una temporada cerrada antes se sigue leyendo con el reparto viejo */
export const POINTS_RULES_SINCE = "2026-10-01";

/** el reparto con que se lee una temporada: la en curso (y toda cerrada desde el cambio) con el vigente */
export function rulesForSeason(season: { closed_at: string | null }): PointsRules {
  if (season.closed_at && season.closed_at.slice(0, 10) < POINTS_RULES_SINCE) return POINTS_RULES_V1;
  return POINTS_RULES;
}

export interface RoundEntry {
  profileId: string;
  bestScore: number;
}

export interface RankedEntry extends RoundEntry {
  rank: number;
  points: number;
}

export function pointsForRank(rank: number, rules: PointsRules = POINTS_RULES): number {
  return rules.forPlaying + (rules.byRank[rank] ?? rules.otherRank);
}

export function rankRound(entries: readonly RoundEntry[], scoring: ScoringDirection, rules: PointsRules = POINTS_RULES): RankedEntry[] {
  const sorted = [...entries].sort((a, b) =>
    scoring === "high" ? b.bestScore - a.bestScore : a.bestScore - b.bestScore,
  );
  const out: RankedEntry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i] as RoundEntry;
    const previous = out[i - 1];
    const rank = previous && previous.bestScore === entry.bestScore ? previous.rank : i + 1;
    out.push({ ...entry, rank, points: pointsForRank(rank, rules) });
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
  /** días ganados: veces que terminó 1.º (los empates en el 1.º cuentan) */
  wins: number;
  played: number;
  rank: number;
}

/** Tabla de posiciones acumulando las colillas de varias rondas ya rankeadas. Desempate: días ganados. */
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

/**
 * Campeones de una temporada: más colillas, después más días ganados; si
 * siguen empatados, comparten el título (todos los del puesto 1). Vacío si
 * nadie jugó.
 */
export function champions(rows: readonly StandingRow[]): string[] {
  return rows.filter((r) => r.rank === 1).map((r) => r.profileId);
}

/** El campeón que se guarda en la temporada (una sola columna): el primero de la tabla. Null si nadie jugó. */
export function champion(rows: readonly StandingRow[]): string | null {
  return rows[0]?.profileId ?? null;
}

/**
 * Quiénes quedaron atrás por un puntaje nuevo: estaban por delante del
 * jugador (o el jugador no figuraba) y ahora tienen peor puesto. Sirve para
 * el aviso "te pasaron".
 */
export function overtakenBy(before: readonly RankedEntry[], after: readonly RankedEntry[], profileId: string): string[] {
  const rankBefore = new Map(before.map((e) => [e.profileId, e.rank]));
  const meAfter = after.find((e) => e.profileId === profileId);
  if (!meAfter) return [];
  return after
    .filter((e) => e.profileId !== profileId && e.rank > meAfter.rank)
    .filter((e) => {
      const prev = rankBefore.get(e.profileId);
      return prev !== undefined && prev < e.rank;
    })
    .map((e) => e.profileId);
}
