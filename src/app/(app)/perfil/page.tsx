import { createClient } from "@/lib/supabase/server";
import { parseAvatar } from "@/lib/avatar";
import { Avatar } from "@/components/avatar";

export const dynamic = "force-dynamic";

// Placeholder hasta la etapa 3 (editor de avatar y estadísticas).
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("display_name, avatar").eq("id", user.id).maybeSingle()
    : { data: null };
  const name = profile?.display_name ?? "";

  return (
    <main className="flex flex-col gap-6 px-5 py-8">
      <header className="flex items-center gap-4">
        <Avatar avatar={parseAvatar(profile?.avatar)} name={name} size={64} />
        <h1 className="text-4xl font-extrabold tracking-tight" data-testid="profile-name">
          {name || "sin nombre"}
        </h1>
      </header>
      <p className="rounded-md bg-superficie px-4 py-4 text-tinta-suave">
        el editor de avatar, las estadísticas y vincular un email llegan en la etapa 3.
      </p>
    </main>
  );
}
