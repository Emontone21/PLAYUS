import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups } from "@/lib/groups";
import { CodeForm } from "@/components/code-form";

// Landing: sin grupos, invita a crear uno o a entrar con un código.
// Con grupos, va directo a Hoy.
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const groups = await getMyGroups();
    if (groups.length > 0) redirect("/hoy");
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-10 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-5xl font-extrabold tracking-tight">playus</h1>
        <p className="text-lg text-tinta-suave">
          un minijuego distinto por día. todos el mismo, el mismo día. gana el ranking del grupo.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <Link
          href="/crear"
          className="rounded-md bg-oro px-4 py-4 text-center text-lg font-extrabold text-fondo"
        >
          crear un grupo
        </Link>
        <p className="text-center text-sm text-tinta-suave">o, si ya te invitaron</p>
        <CodeForm />
      </section>
    </main>
  );
}
