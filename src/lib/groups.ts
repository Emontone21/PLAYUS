import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { GroupRow } from "@/lib/supabase/types";

export const CURRENT_GROUP_COOKIE = "playus-group";

// Grupos del usuario (RLS ya filtra a los propios), del más viejo al más nuevo.
// Sin sesión devuelve vacío en vez de consultar como anon (que no tiene
// permisos): la página y el layout se renderizan en paralelo, y el layout es
// el que redirige.
export async function getMyGroups(): Promise<GroupRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`no se pudieron leer los grupos: ${error.message}`);
  return data ?? [];
}

// El grupo "actual" es el de la cookie, si sigue siendo uno de los míos;
// si no, el primero.
export async function pickCurrentGroup(groups: GroupRow[]): Promise<GroupRow | null> {
  if (groups.length === 0) return null;
  const cookieStore = await cookies();
  const wanted = cookieStore.get(CURRENT_GROUP_COOKIE)?.value;
  return groups.find((g) => g.id === wanted) ?? groups[0] ?? null;
}
