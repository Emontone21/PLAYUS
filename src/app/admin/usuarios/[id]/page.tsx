import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { loadUsersAdmin } from "@/lib/admin-general";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { DangerAction } from "../../_components/danger-action";

export const dynamic = "force-dynamic";

// /admin/usuarios/{id}: sus grupos con su rol en cada uno y el botón de
// borrar (nunca al admin; si es dueño de un grupo, la vista previa lo dice
// con el link al grupo).
export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = (await loadUsersAdmin(createAdminClient())).find((u) => u.id === id);
  if (!user) notFound();
  const owns = user.groups.filter((g) => g.role === "owner");
  return (
    <main className="flex flex-col gap-6" data-testid="admin-user-detail" data-profile-id={user.id}>
      <p>
        <Link href="/admin/usuarios" className="text-xs text-tinta-suave underline">
          ← usuarios
        </Link>
      </p>
      <section className="flex items-center gap-4">
        <Avatar avatar={user.avatar} name={user.name} size={64} />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="display text-2xl text-tinta" data-testid="admin-user-name">
            {user.name || "(sin nombre)"}
          </h2>
          <p className="text-sm text-tinta-suave" data-testid="admin-user-email">
            {user.email ?? "anónimo"}
            {user.isAdmin ? " · admin" : ""}
          </p>
          <p className="text-xs text-tinta-suave">
            alta {formatDateTime(user.createdAt)} · {user.lastPlayed ? `última partida ${formatDateTime(user.lastPlayed)}` : "nunca jugó"} · {user.push} {user.push === 1 ? "dispositivo con avisos" : "dispositivos con avisos"}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="display text-xl text-tinta">sus grupos</h3>
        {user.groups.length === 0 ? (
          <p className="text-sm text-tinta-suave">no está en ningún grupo.</p>
        ) : (
          <ul className="flex flex-col" data-testid="admin-user-groups">
            {user.groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-2 text-sm" style={{ borderBottom: "2px solid var(--superficie-2)" }}>
                <Link href={`/admin/grupos/${g.id}`} className="display-bold text-tinta underline-offset-4 hover:underline">
                  {g.name}
                </Link>
                <span className="text-tinta-suave">
                  {g.role === "owner" ? "dueño" : "integrante"}
                  {g.isTest ? " · de prueba" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2" data-testid="admin-delete-user-section">
        <h3 className="display text-xl text-tinta">borrar el usuario</h3>
        <p className="text-xs text-tinta-suave">se borra junto con su perfil, sus membresías, sus intentos y sus suscripciones de avisos.</p>
        {owns.length > 0 ? (
          <p className="note text-sm" data-testid="admin-user-owner-note">
            es dueño de {owns.map((g) => g.name).join(", ")}: no se puede borrar hasta pasarle la propiedad a otro integrante o borrar ese grupo.{" "}
            {owns.map((g) => (
              <Link key={g.id} href={`/admin/grupos/${g.id}`} className="underline">
                {g.name} →
              </Link>
            ))}
          </p>
        ) : null}
        <DangerAction action="delete-user" payload={{ profileId: user.id }} label="borrar el usuario" word="borrar" wordHint='para confirmar, escribí "borrar"' afterHref="/admin/usuarios" testId="admin-delete-user" disabled={user.isAdmin} disabledText="es el admin: no se puede borrar." />
      </section>
    </main>
  );
}
