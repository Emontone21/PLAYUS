import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { announceAllowedAt, lastAnnouncement, pushRecipients } from "@/lib/admin-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushConfigured } from "@/lib/push";
import { AnnounceForm } from "./announce-form";
import { PushTestButton } from "./push-test-button";

export const dynamic = "force-dynamic";

// /admin/avisos: una notificación de prueba solo al admin, y anuncios (hasta
// 120 caracteres) a todos los que tienen avisos activados o a un grupo, con
// vista previa, cuántas personas lo reciben, confirmación y un límite de uno
// cada 10 minutos.
export default async function AdminPushPage() {
  const who = await currentAdmin();
  if (!who) notFound();
  const admin = createAdminClient();
  const [{ data: groups, error }, { data: mine }, everyone, last] = await Promise.all([
    admin.from("groups").select("id, name").order("name"),
    admin.from("push_subscriptions").select("id").eq("profile_id", who.userId),
    pushRecipients(admin, null),
    lastAnnouncement(admin),
  ]);
  if (error) throw new Error(`groups: ${error.message}`);
  const allowedAt = announceAllowedAt(last);
  return (
    <main className="flex flex-col gap-6">
      {!pushConfigured() ? (
        <p className="note-alert text-sm" data-testid="admin-push-unconfigured">
          faltan las claves VAPID en el servidor: el push no está configurado.
        </p>
      ) : null}
      <section className="flex flex-col gap-2" data-testid="admin-push-test">
        <h2 className="display text-xl text-tinta">notificación de prueba</h2>
        <p className="text-xs text-tinta-suave">
          se manda solo a tus suscripciones, para comprobar que el push anda. {mine?.length ? `tenés ${mine.length} ${mine.length === 1 ? "dispositivo" : "dispositivos"} con avisos.` : "no tenés avisos activados en ningún dispositivo: activalos en Perfil."}
        </p>
        <PushTestButton />
      </section>
      <section className="flex flex-col gap-2" data-testid="admin-announce">
        <h2 className="display text-xl text-tinta">anuncio</h2>
        <p className="text-xs text-tinta-suave">hasta 120 caracteres, con el título &quot;frog&quot;. a todos los que tienen avisos activados ({everyone.length}) o a un grupo. uno cada 10 minutos.</p>
        <AnnounceForm groups={groups ?? []} allowedAt={allowedAt?.toISOString() ?? null} />
      </section>
    </main>
  );
}
