import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { supabasePublicEnv } from "./env";
import { uncachedFetch } from "./fetch";

// Cliente para Server Components, Server Actions y Route Handlers.
// Lee la sesión de las cookies de la petición.
export async function createClient() {
  const { url, anonKey } = supabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    global: { fetch: uncachedFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Un Server Component no puede escribir cookies. El middleware
          // ya refresca la sesión, así que acá se puede ignorar.
        }
      },
    },
  });
}
