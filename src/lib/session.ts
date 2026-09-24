"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Devuelve el usuario de la sesión actual, abriendo una sesión anónima si no
// hay ninguna. Es el "cero fricción" del brief: nadie se registra.
//
// Si dos llamadas se cruzan (StrictMode en desarrollo monta los efectos dos
// veces; una navegación rápida también puede hacerlo), la segunda espera a
// la primera en vez de abrir otra sesión: si no, se crean dos usuarios y el
// perfil se guarda con el token del otro, y RLS lo rechaza.
let inflight: Promise<User> | null = null;

export function ensureAnonymousUser(supabase: SupabaseClient<Database>): Promise<User> {
  if (!inflight) {
    inflight = ensure(supabase).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function ensure(supabase: SupabaseClient<Database>): Promise<User> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) return sessionData.session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(error?.message ?? "no se pudo abrir la sesión");
  }
  return data.user;
}
