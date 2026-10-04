import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isAdminUser } from "./admin-identity";

// La comprobación de admin, siempre en el servidor: cada página de /admin y
// cada endpoint /api/admin/* la hacen antes de tocar nada. Ocultar botones no
// alcanza. Una página sin permiso responde 404 (no revela que existe); un
// endpoint, 403.

export interface AdminIdentity {
  userId: string;
  email: string;
}

/** el admin de la sesión actual (cookies), o null */
export async function currentAdmin(): Promise<AdminIdentity | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user)) return null;
  return { userId: user.id, email: user.email!.trim().toLowerCase() };
}

/**
 * Las herramientas de desarrollo (/dev/juego/*) están libres fuera de
 * producción; en producción, solo para el admin (decisión 238). Para
 * cualquier otra persona siguen siendo 404.
 */
export async function devToolsAllowed(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return true;
  return (await currentAdmin()) !== null;
}
