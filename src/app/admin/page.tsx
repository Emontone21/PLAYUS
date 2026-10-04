import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { loadGroupsOverview, recentAdminActions } from "@/lib/admin-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { readFakeToday } from "@/lib/api";
import { formatShortDate } from "@/lib/time";
import { GAME_IDS, GAMES, getGame } from "@/games";
import { GroupList } from "./group-list";

export const dynamic = "force-dynamic";

// /admin: todos los grupos con su día de hoy (en su zona horaria), el juego
// de hoy, los intentos que lleva y un selector para cambiarlo; abajo, los
// últimos 20 cambios.
export default async function AdminPage() {
  if (!(await currentAdmin())) notFound();
  const admin = createAdminClient();
  const fakeToday = await readFakeToday();
  const [groups, actions] = await Promise.all([loadGroupsOverview(admin, fakeToday), recentAdminActions(admin)]);
  const games = GAME_IDS.map((id) => ({ id, name: GAMES[id]!.name }));
  return (
    <main className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="display text-xl text-tinta">el juego de hoy, por grupo</h2>
          <span className="eyebrow">{groups.length} grupos</span>
        </div>
        <p className="text-xs text-tinta-suave">solo se puede cambiar el día de hoy de cada grupo. si ya jugaron, se borran los intentos de hoy y vuelven a tener 3.</p>
        <GroupList groups={groups} games={games} />
      </section>
      <section className="flex flex-col gap-3" data-testid="admin-actions">
        <h2 className="display text-xl text-tinta">últimos cambios</h2>
        {actions.length === 0 ? (
          <p className="text-sm text-tinta-suave">todavía no hubo cambios.</p>
        ) : (
          <ul className="flex flex-col">
            {actions.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-2 text-sm" style={{ borderBottom: "2px solid var(--superficie-2)" }} data-testid="admin-action">
                <span>
                  <span className="display-bold text-tinta">{a.groupName}</span>, {formatShortDate(a.play_date)}: {a.from_game_id ? `de ${getGame(a.from_game_id)?.name ?? a.from_game_id} ` : "ronda creada "}a{" "}
                  <span className="display-bold text-tinta">{getGame(a.to_game_id)?.name ?? a.to_game_id}</span>
                  {a.action === "reset_to_deck" ? " (el que tocaba en el mazo)" : ""}
                  {a.deleted_attempts > 0 ? `, ${a.deleted_attempts} intentos borrados` : ""}
                </span>
                <span className="text-xs text-tinta-suave">
                  {a.admin_email}, {new Date(a.created_at).toLocaleString("es-UY", { timeZone: "America/Montevideo", dateStyle: "short", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
