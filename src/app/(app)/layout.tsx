import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups } from "@/lib/groups";
import { TabBar } from "@/components/tab-bar";
import { Brand } from "@/components/brand";
import { Lily } from "@/components/lily";

// Las tres pestañas exigen sesión y al menos un grupo. Si falta algo, la
// landing ofrece crear o entrar con código. La marca va arriba de todas, y
// dos nenúfares grandes quedan detrás del contenido, recortados contra el borde.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const groups = await getMyGroups();
  if (groups.length === 0) redirect("/");

  return (
    <>
      <div className="relative isolate overflow-x-clip pb-28">
        <Lily size={300} className="-right-28 -top-16" />
        <Lily size={220} className="-left-24 top-[62%] -scale-x-100" />
        <header className="px-5 pt-5">
          <Brand />
        </header>
        {children}
      </div>
      <TabBar />
    </>
  );
}
