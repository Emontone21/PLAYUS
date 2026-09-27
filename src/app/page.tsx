import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups } from "@/lib/groups";
import { CodeForm } from "@/components/code-form";
import { Frog } from "@/components/frog/Frog";
import { Lily } from "@/components/lily";

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
    <main className="relative isolate flex min-h-dvh flex-col justify-center gap-10 overflow-x-clip px-5 py-10">
      <Lily size={320} className="-right-32 -top-20" />
      <Lily size={220} className="-left-24 bottom-8 -scale-x-100" />
      <header className="flex flex-col gap-4">
        <div className="flex items-end gap-3">
          <Frog pose="feliz" size={120} tilt={-6} />
          <h1 className="display-lg pb-3 text-rana" style={{ fontSize: 64 }}>
            frog
          </h1>
        </div>
        <p className="text-lg">un juego distinto cada día, el mismo para todo el grupo. jugás, comparás y a medianoche se sabe quién ganó.</p>
      </header>

      <section className="flex flex-col gap-4">
        <Link href="/crear" className="btn-primary">
          crear un grupo
        </Link>
        <p className="text-center text-sm text-tinta-suave">o, si ya te invitaron</p>
        <CodeForm />
      </section>
    </main>
  );
}
