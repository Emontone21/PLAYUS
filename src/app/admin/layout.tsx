import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { Frog } from "@/components/frog/Frog";
import { AdminTabs } from "./_components/admin-tabs";

export const dynamic = "force-dynamic";

// El panel privado del dueño del proyecto (decisiones 236 y 278). La
// comprobación va acá, en el servidor, para todas las páginas de /admin: sin
// permiso, 404, para no revelar que existe. Es una herramienta: sobria, sin
// ranas asomadas salvo la chiquita del encabezado, y sin la barra de pestañas
// de la app; arriba, las pestañas del panel.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const who = await currentAdmin();
  if (!who) notFound();
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5 px-5 py-6" data-testid="admin-panel">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Frog pose="guino" size={44} animate={false} />
          <h1 className="display text-2xl text-tinta">panel de admin</h1>
          <Link href="/hoy" className="chip ml-auto shrink-0 text-xs">
            ← a la app
          </Link>
        </div>
        <AdminTabs />
        <p className="text-xs text-tinta-suave" data-testid="admin-email">
          {who.email}
        </p>
      </header>
      {children}
    </div>
  );
}
