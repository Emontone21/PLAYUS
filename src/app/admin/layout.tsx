import Link from "next/link";
import { notFound } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { Frog } from "@/components/frog/Frog";

export const dynamic = "force-dynamic";

// El panel privado del dueño del proyecto (decisión 236). La comprobación va
// acá, en el servidor, para todas las páginas de /admin: sin permiso, 404,
// para no revelar que existe. Es una herramienta: sobria, sin ranas asomadas
// salvo la chiquita del encabezado, y sin la barra de pestañas.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const who = await currentAdmin();
  if (!who) notFound();
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-5 py-6" data-testid="admin-panel">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Frog pose="guino" size={44} animate={false} />
          <h1 className="display text-2xl text-tinta">panel de admin</h1>
        </div>
        <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="panel">
          <Link href="/admin" className="chip">
            grupos
          </Link>
          <Link href="/admin/jugar" className="chip">
            probar juegos
          </Link>
          <Link href="/hoy" className="chip">
            ← a la app
          </Link>
          <span className="ml-auto text-xs text-tinta-suave" data-testid="admin-email">
            {who.email}
          </span>
        </nav>
      </header>
      {children}
    </div>
  );
}
