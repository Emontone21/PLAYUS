import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { loadUsersAdmin } from "@/lib/admin-general";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserList } from "./user-list";

export const dynamic = "force-dynamic";

// /admin/usuarios: todos los usuarios (nombre, avatar, email o "anónimo",
// grupos, alta, última partida), filtros "sin grupo", "anónimos" y "con
// email", búsqueda por nombre o email, y borrar a todos los que no tienen
// grupo. Nunca datos de la sesión ni tokens.
export default async function AdminUsersPage() {
  if (!(await currentAdmin())) notFound();
  const users = await loadUsersAdmin(createAdminClient());
  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display text-xl text-tinta">usuarios</h2>
        <span className="eyebrow">
          {users.length} {users.length === 1 ? "usuario" : "usuarios"}
        </span>
      </div>
      <UserList users={users} />
    </main>
  );
}
