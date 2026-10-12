import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { GAME_IDS, GAMES, getGame } from "@/games";
import { disabledGameIds } from "@/lib/game-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPlay } from "./admin-play";

export const dynamic = "force-dynamic";

// /admin/jugar: probar cualquier juego con cualquier semilla, en el
// contenedor real, sin crear intentos ni tocar rankings. Al terminar, el
// servidor valida la partida como lo haría /finish.
// ?juego=<id> deja ese juego elegido (el link "probar" de la pestaña juegos).
export default async function AdminPlayPage({ searchParams }: { searchParams: Promise<{ juego?: string }> }) {
  if (!(await currentAdmin())) notFound();
  const { juego } = await searchParams;
  const off = await disabledGameIds(createAdminClient());
  const games = GAME_IDS.map((id) => {
    const g = GAMES[id]!;
    return { id, name: g.name, orientation: g.orientation ?? "portrait", inRotation: !off.has(id), durationMs: g.durationMs, scoring: g.scoring };
  });
  return (
    <main className="flex flex-col gap-4">
      <h2 className="display text-xl text-tinta">probar un juego</h2>
      <p className="text-xs text-tinta-suave">no crea intentos ni escribe nada en la base: ni rondas, ni rankings, ni notificaciones.</p>
      <AdminPlay games={games} initialGameId={juego && getGame(juego) ? juego : null} />
    </main>
  );
}
