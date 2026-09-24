import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { uncachedFetch } from "./fetch";

export type AdminClient = SupabaseClient<Database>;

// Cliente con service_role: saltea RLS. Solo en el servidor, solo para lo
// que el cliente no puede escribir: rondas, temporadas e intentos.
export function createAdminClient(): AdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("falta SUPABASE_SERVICE_ROLE_KEY (mirá .env.example)");
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: uncachedFetch },
  });
}
