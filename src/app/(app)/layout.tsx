import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups } from "@/lib/groups";
import { TabBar } from "@/components/tab-bar";

// Las tres pestañas exigen sesión y al menos un grupo. Si falta algo, la
// landing ofrece crear o entrar con código.
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
      <div className="pb-24">{children}</div>
      <TabBar />
    </>
  );
}
