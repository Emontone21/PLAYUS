import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { GAME_IDS, GAMES } from "@/games";
import { AdminPlay } from "./admin-play";

export const dynamic = "force-dynamic";

// /admin/jugar: probar cualquier juego con cualquier semilla, en el
// contenedor real, sin crear intentos ni tocar rankings. Al terminar, el
// servidor valida la partida como lo haría /finish.
export default async function AdminPlayPage() {
  if (!(await currentAdmin())) notFound();
  const games = GAME_IDS.map((id) => {
    const g = GAMES[id]!;
    return { id, name: g.name, orientation: g.orientation ?? "portrait", inRotation: true, durationMs: g.durationMs, scoring: g.scoring };
  });
  return (
    <main className="flex flex-col gap-4">
      <h2 className="display text-xl text-tinta">probar un juego</h2>
      <p className="text-xs text-tinta-suave">no crea intentos ni escribe nada en la base: ni rondas, ni rankings, ni notificaciones.</p>
      <AdminPlay games={games} />
    </main>
  );
}
