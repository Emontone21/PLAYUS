import type { Avatar } from "@/avatar/schema";

// Filtros y búsquedas del panel de admin: puros, sin servidor ni registro de
// juegos, así los usan los componentes de cliente y los tests.

export interface UserAdminRow {
  id: string;
  name: string;
  avatar: Avatar;
  /** el email vinculado y confirmado, o null (anónimo) */
  email: string | null;
  createdAt: string;
  lastPlayed: string | null;
  /** suscripciones de avisos */
  push: number;
  groups: { id: string; name: string; role: "owner" | "member"; isTest: boolean }[];
  /** es admin (su email está en ADMIN_EMAILS) */
  isAdmin: boolean;
}

export type UserFilter = "todos" | "sin-grupo" | "anonimos" | "con-email";

/** el filtro y la búsqueda de la pestaña usuarios */
export function filterUsers(users: readonly UserAdminRow[], filter: UserFilter, query: string): UserAdminRow[] {
  const q = query.trim().toLowerCase();
  return users.filter((u) => {
    if (filter === "sin-grupo" && u.groups.length > 0) return false;
    if (filter === "anonimos" && u.email) return false;
    if (filter === "con-email" && !u.email) return false;
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
  });
}

/** la búsqueda de la pestaña grupos: por nombre o por código */
export function filterGroups<T extends { name: string; inviteCode: string }>(groups: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...groups];
  return groups.filter((g) => g.name.toLowerCase().includes(q) || g.inviteCode.toLowerCase().includes(q));
}
