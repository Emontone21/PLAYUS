import type { GameModule } from "./types";
import { pibaDelIpa } from "./piba-del-ipa";
import { tapRace } from "./tap-race";
import { reflejo } from "./reflejo";

// Registry. Agregar un juego = una línea en ACTIVE. Los ids se ordenan
// alfabéticamente para armar el mazo (decisión 6), así que el orden no importa.
const ACTIVE: GameModule[] = [pibaDelIpa];

// Retirados: no entran en el mazo, pero siguen resolviéndose por id para que la
// ronda de hoy (si ya se creó con uno de ellos), el historial y el perfil sigan
// funcionando (decisión 108). Se conserva el módulo entero porque una ronda ya
// creada se juega y se valida con él.
const RETIRED: GameModule[] = [
  tapRace, // relleno de la etapa 4
  reflejo, // relleno de la etapa 4
];

const ALL = [...ACTIVE, ...RETIRED];

export const GAMES: Readonly<Record<string, GameModule>> = Object.freeze(Object.fromEntries(ALL.map((g) => [g.id, g])));

/** ids activos ordenados alfabéticamente: el mazo se calcula sobre esta lista */
export const GAME_IDS: readonly string[] = Object.freeze(ACTIVE.map((g) => g.id).sort());

/** ids retirados, para las herramientas de desarrollo */
export const RETIRED_GAME_IDS: readonly string[] = Object.freeze(RETIRED.map((g) => g.id).sort());

export function getGame(id: string): GameModule | undefined {
  return GAMES[id];
}

// chequeos en tiempo de carga: un id repetido o mal escrito rompe el mazo
for (const g of ALL) {
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(g.id)) throw new Error(`id de juego inválido: ${g.id}`);
}
if (new Set(ALL.map((g) => g.id)).size !== ALL.length) throw new Error("hay ids de juego repetidos");
if (ACTIVE.length === 0) throw new Error("no hay juegos activos");
