import { hashHex, rngFromSeed } from "./rng";
import type { DateString } from "./time";

// Rotación diaria: el juego del día sale de un mazo barajado por temporada,
// no de una elección al azar día a día. Se baraja el registry completo con
// semilla hash(group_id + season.number + vuelta), se reparte uno por día y
// se vuelve a barajar cuando se agota. Así ningún juego se repite hasta que
// pasaron todos, y el mismo juego no sale dos días seguidos (decisión 5).

/** Un mazo (una vuelta) para un grupo, temporada y número de vuelta. */
export function deckFor(groupId: string, seasonNumber: number, lap: number, gameIds: readonly string[]): string[] {
  const sorted = [...gameIds].sort();
  const deck = rngFromSeed(`deck:${groupId}:${seasonNumber}:${lap}`).shuffle(sorted);
  if (lap > 0 && deck.length >= 2) {
    const previous = deckFor(groupId, seasonNumber, lap - 1, gameIds);
    const lastOfPrevious = previous[previous.length - 1];
    if (deck[0] === lastOfPrevious) {
      [deck[0], deck[1]] = [deck[1] as string, deck[0] as string];
    }
  }
  return deck;
}

/** Juego del día `dayIndex` (0 = primer día de la temporada). */
export function gameForDay(groupId: string, seasonNumber: number, dayIndex: number, gameIds: readonly string[]): string {
  if (gameIds.length === 0) throw new Error("no hay juegos en el registry");
  const n = gameIds.length;
  const lap = Math.floor(dayIndex / n);
  const position = dayIndex % n;
  return deckFor(groupId, seasonNumber, lap, gameIds)[position] as string;
}

/** Semilla de la ronda: hash(group_id + play_date + game_id). */
export function roundSeed(groupId: string, playDate: DateString, gameId: string): string {
  return hashHex(`round:${groupId}:${playDate}:${gameId}`);
}
