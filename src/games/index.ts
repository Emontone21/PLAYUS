import type { GameModule } from "./types";
import { tapRace } from "./tap-race";
import { reflejo } from "./reflejo";

// Registry. Agregar un juego = una línea acá. Los ids se ordenan
// alfabéticamente para armar el mazo (decisión 6), así que el orden de esta
// lista no importa.
const ALL: GameModule[] = [
  tapRace, // TEMPORAL
  reflejo, // TEMPORAL
];

export const GAMES: Readonly<Record<string, GameModule>> = Object.freeze(
  Object.fromEntries(ALL.map((g) => [g.id, g])),
);

/** ids ordenados alfabéticamente: el mazo se calcula sobre esta lista */
export const GAME_IDS: readonly string[] = Object.freeze(ALL.map((g) => g.id).sort());

export function getGame(id: string): GameModule | undefined {
  return GAMES[id];
}

// chequeos en tiempo de carga: un id repetido o mal escrito rompe el mazo
for (const g of ALL) {
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(g.id)) throw new Error(`id de juego inválido: ${g.id}`);
}
if (new Set(ALL.map((g) => g.id)).size !== ALL.length) throw new Error("hay ids de juego repetidos");
