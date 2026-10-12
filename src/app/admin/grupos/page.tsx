import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { loadGroupsAdmin } from "@/lib/admin-general";
import { createAdminClient } from "@/lib/supabase/admin";
import { readFakeToday } from "@/lib/api";
import { DangerAction } from "../_components/danger-action";
import { GroupTable } from "./group-table";

export const dynamic = "force-dynamic";

// /admin/grupos: todos los grupos (nombre, marca de prueba, integrantes,
// temporada y su día, juego de hoy, última actividad), búsqueda por nombre o
// código, y "limpiar datos de prueba".
export default async function AdminGroupsPage() {
  if (!(await currentAdmin())) notFound();
  const admin = createAdminClient();
  const groups = await loadGroupsAdmin(admin, await readFakeToday());
  const test = groups.filter((g) => g.isTest).length;
  return (
    <main className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="display text-xl text-tinta">grupos</h2>
          <span className="eyebrow">
            {groups.length} {groups.length === 1 ? "grupo" : "grupos"}, {test} de prueba
          </span>
        </div>
        <GroupTable groups={groups} />
      </section>
      <section className="flex flex-col gap-2" data-testid="admin-cleanup-section">
        <h2 className="display text-lg text-tinta">limpiar datos de prueba</h2>
        <p className="text-xs text-tinta-suave">borra todos los grupos marcados como de prueba y, después, a los usuarios que quedaron sin ningún grupo. al admin nunca. primero se ve qué se va a borrar.</p>
        <DangerAction action="cleanup-test" label="limpiar datos de prueba" word="limpiar" wordHint='para confirmar, escribí "limpiar"' testId="admin-cleanup" />
      </section>
    </main>
  );
}
