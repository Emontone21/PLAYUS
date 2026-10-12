import type { AdminClient } from "@/lib/supabase/admin";
import { GAME_IDS } from "@/games";

// Qué juegos están en la rotación (decisión 281). La tabla game_settings guarda
// solo los apagados (sin fila = habilitado); el mazo de la temporada reparte
// únicamente los habilitados, y cambiarlos afecta solo a las rondas que se
// creen desde ese momento: la ronda de hoy, si ya existe, no cambia.

/** los ids del registro que están apagados */
export async function disabledGameIds(admin: AdminClient): Promise<Set<string>> {
  const { data, error } = await admin.from("game_settings").select("game_id, enabled").eq("enabled", false);
  if (error) throw new Error(`game_settings: ${error.message}`);
  return new Set((data ?? []).map((r) => r.game_id));
}

/**
 * Los ids del registro que están en la rotación, en el orden del registro
 * (ordenado). Si por algún motivo no quedara ninguno, el mazo usa el registro
 * entero antes que romperse: el panel no deja apagar el último.
 */
export async function enabledGameIds(admin: AdminClient): Promise<readonly string[]> {
  const off = await disabledGameIds(admin);
  if (off.size === 0) return GAME_IDS;
  const on = GAME_IDS.filter((id) => !off.has(id));
  return on.length > 0 ? on : GAME_IDS;
}
