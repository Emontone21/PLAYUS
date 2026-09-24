import Link from "next/link";
import { getMyGroups, pickCurrentGroup } from "@/lib/groups";

export const dynamic = "force-dynamic";

// Placeholder hasta la etapa 5 (rondas e intentos).
export default async function TodayPage() {
  const groups = await getMyGroups();
  const group = await pickCurrentGroup(groups);
  return (
    <main className="flex flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-tinta-suave">{group?.name}</p>
        <h1 className="text-4xl font-extrabold tracking-tight">hoy</h1>
      </header>
      <p className="rounded-md bg-superficie px-4 py-4 text-tinta-suave">
        el juego del día llega en la etapa 5. mientras tanto, armá el grupo desde la pestaña{" "}
        <Link href="/grupo" className="font-bold text-agua">
          grupo
        </Link>
        .
      </p>
    </main>
  );
}
