import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { listGameSettings } from "@/lib/admin-general";
import { createAdminClient } from "@/lib/supabase/admin";
import { GameList } from "./game-list";

export const dynamic = "force-dynamic";

// /admin/juegos: todos los juegos del registro con el interruptor "en
// rotación" y los links a probar y a las herramientas.
export default async function AdminGamesPage() {
  if (!(await currentAdmin())) notFound();
  const games = await listGameSettings(createAdminClient());
  const enabled = games.filter((g) => g.enabled).length;
  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display text-xl text-tinta">juegos</h2>
        <span className="eyebrow" data-testid="admin-games-count">
          {enabled} de {games.length} en rotación
        </span>
      </div>
      <p className="text-xs text-tinta-suave">apagar un juego lo saca del mazo para las rondas que se creen desde ahora; la de hoy, si ya existe, no cambia. prenderlo lo vuelve a meter desde la próxima ronda. tiene que quedar al menos uno.</p>
      <GameList games={games} />
    </main>
  );
}
