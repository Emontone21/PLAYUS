import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseAvatar } from "@/avatar/schema";
import { ProfileEditor } from "./profile-editor";

export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <ProfileEditor
      userId={user.id}
      initialName={profile?.display_name ?? ""}
      initialAvatar={parseAvatar(profile?.avatar)}
    />
  );
}
