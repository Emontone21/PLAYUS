import { createClient } from "@supabase/supabase-js";
import type { BrowserContext } from "@playwright/test";

// El admin del E2E local: un usuario con email confirmado y contraseña,
// creado con la clave de servicio del stack local, cuyo email está en
// ADMIN_EMAILS de .env.local. La sesión se mete en el navegador como cookies
// con el mismo formato que usa @supabase/ssr ("base64-" + base64url del JSON
// de la sesión, en trozos de 3.180 caracteres si hace falta), así el servidor
// la lee en la próxima petición. Solo contra el stack local: en producción no
// hay forma de iniciar sesión sin el magic link del dueño.

export const ADMIN_EMAIL = "admin-e2e@frog.test";
const ADMIN_PASSWORD = "frog-admin-e2e-2026";

function env() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // sin .env.local: las variables tienen que venir del entorno
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new Error("faltan las variables de Supabase en .env.local para el admin del E2E");
  return { url, anon, service };
}

export function isProd(): boolean {
  const base = process.env.E2E_BASE_URL ?? "";
  return base !== "" && !/localhost|127\.0\.0\.1/.test(base);
}

function base64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

/** deja al contexto con la sesión del admin; devuelve el id del usuario */
export async function loginAsAdmin(context: BrowserContext, baseURL = "http://127.0.0.1:3000"): Promise<string> {
  const { url, anon, service } = env();
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const created = await admin.auth.admin.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true });
  if (created.error && !/already|exists|registered/i.test(created.error.message)) throw new Error(`crear el admin: ${created.error.message}`);
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (error || !data.session) throw new Error(`entrar como admin: ${error?.message ?? "sin sesión"}`);
  const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const value = "base64-" + base64url(JSON.stringify(data.session));
  const MAX = 3180;
  const chunks = value.length <= MAX ? [{ name: key, value }] : Array.from({ length: Math.ceil(value.length / MAX) }, (_, i) => ({ name: `${key}.${i}`, value: value.slice(i * MAX, (i + 1) * MAX) }));
  const u = new URL(baseURL);
  await context.addCookies(chunks.map((c) => ({ ...c, domain: u.hostname, path: "/", httpOnly: false, secure: false, sameSite: "Lax" as const })));
  return data.user.id;
}
