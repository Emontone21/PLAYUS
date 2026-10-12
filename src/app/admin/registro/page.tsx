import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { loadLog } from "@/lib/admin-general";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

// /admin/registro: las últimas 100 acciones de admin_actions, con fecha,
// acción, sobre qué y el detalle.
export default async function AdminLogPage() {
  if (!(await currentAdmin())) notFound();
  const entries = await loadLog(createAdminClient(), 100);
  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display text-xl text-tinta">registro</h2>
        <span className="eyebrow">últimas {entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-tinta-suave">todavía no hubo acciones.</p>
      ) : (
        <ul className="flex flex-col" data-testid="admin-log">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 py-2 text-sm" style={{ borderBottom: "2px solid var(--superficie-2)" }} data-testid="admin-log-entry" data-action={e.action}>
              <span className="text-xs text-tinta-suave">
                {formatDateTime(e.createdAt)} · {e.adminEmail}
              </span>
              <span>
                <span className="display-bold text-tinta">{e.label}</span>
                {e.target ? (
                  <>
                    {" · "}
                    {e.groupId ? (
                      <Link href={`/admin/grupos/${e.groupId}`} className="display-bold text-tinta underline-offset-4 hover:underline">
                        {e.target}
                      </Link>
                    ) : (
                      <span className="display-bold text-tinta">{e.target}</span>
                    )}
                  </>
                ) : null}
              </span>
              {e.details.map((d, i) => (
                <span key={i} className="text-xs text-tinta-media">
                  {d}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
