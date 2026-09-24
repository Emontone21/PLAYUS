"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CURRENT_GROUP_COOKIE } from "@/lib/groups";

// Guarda el grupo elegido en una cookie de un año. Se llama después de crear
// o unirse a un grupo, y desde el selector de la pestaña Grupo.
export async function selectGroup(groupId: string, redirectTo?: string) {
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_GROUP_COOKIE, groupId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  if (redirectTo) redirect(redirectTo);
}
