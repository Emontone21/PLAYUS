"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { supabasePublicEnv } from "./env";

// Cliente para componentes de cliente. Guarda la sesión en cookies, así el
// servidor la ve en la próxima petición.
export function createClient() {
  const { url, anonKey } = supabasePublicEnv();
  return createBrowserClient<Database>(url, anonKey);
}
