import type { GameModule } from "./types";
import { pibaDelIpa } from "./piba-del-ipa";
import { quedoReTarado } from "./quedo-re-tarado";
import { losDeseosDeLarry } from "./los-deseos-de-larry";
import { remarVuelveACasa } from "./remar-vuelve-a-casa";
import { laParrillaDelBro } from "./la-parrilla-del-bro";
import { pegandoleAlJota } from "./pegandole-al-jota";
import { caminandoPor18 } from "./caminando-por-18";
import { rastitasRastotas } from "./rastitas-rastotas";
import { pisteandoElSunny } from "./pisteando-el-sunny";
import { buscaLosParis } from "./busca-los-paris";
import { colgadoDel121 } from "./colgado-del-121";
import { apilaLasBoludeces } from "./apila-las-boludeces";
import { laMayo } from "./la-mayo";
import { nachYLaRoca } from "./nach-y-la-roca";
import { servilaJusta } from "./servila-justa";
import { fumateAlgoChino } from "./fumate-algo-chino";
import { claseConElBro } from "./clase-con-el-bro";
import { hdp } from "./hdp";
import { larryEnLaHdp } from "./larry-en-la-hdp";

// Registry. Agregar un juego = una línea acá. Los ids se ordenan
// alfabéticamente para armar el mazo (decisión 6), así que el orden no importa.
// Los juegos de relleno de la etapa 4 se borraron (decisión 114).
const ALL: GameModule[] = [pibaDelIpa, quedoReTarado, losDeseosDeLarry, remarVuelveACasa, laParrillaDelBro, pegandoleAlJota, caminandoPor18, rastitasRastotas, pisteandoElSunny, buscaLosParis, colgadoDel121, apilaLasBoludeces, laMayo, nachYLaRoca, servilaJusta, fumateAlgoChino, claseConElBro, hdp, larryEnLaHdp];

export const GAMES: Readonly<Record<string, GameModule>> = Object.freeze(Object.fromEntries(ALL.map((g) => [g.id, g])));

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
if (ALL.length === 0) throw new Error("no hay juegos");
