// Quién es admin (decisión 236): hay un solo admin, el dueño del proyecto.
// Se reconoce por email: ADMIN_EMAILS (uno o más, separados por coma) y una
// sesión con ese email vinculado y confirmado. Las sesiones anónimas nunca
// son admin: si el dueño cambia de teléfono, entra con su email y sigue
// siéndolo. Funciones puras, sin DOM ni servidor, para poder testearlas.

export interface AdminCandidate {
  email?: string | null;
  email_confirmed_at?: string | null;
  is_anonymous?: boolean;
}

/** la lista de ADMIN_EMAILS, en minúscula y sin espacios */
export function adminEmails(env: string | undefined = process.env.ADMIN_EMAILS): string[] {
  return (env ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** admin = sesión no anónima, con email confirmado, y ese email está en la lista */
export function isAdminUser(user: AdminCandidate | null | undefined, emails: readonly string[] = adminEmails()): boolean {
  if (!user || !user.email || user.is_anonymous) return false;
  if (!user.email_confirmed_at) return false;
  return emails.includes(user.email.trim().toLowerCase());
}
