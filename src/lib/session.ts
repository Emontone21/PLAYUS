"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Devuelve el usuario de la sesión actual, abriendo una sesión anónima si no
// hay ninguna. Es el "cero fricción" del brief: nadie se registra.
export async function ensureAnonymousUser(supabase: SupabaseClient<Database>): Promise<User> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) return sessionData.session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(error?.message ?? "no se pudo abrir la sesión");
  }
  return data.user;
}
