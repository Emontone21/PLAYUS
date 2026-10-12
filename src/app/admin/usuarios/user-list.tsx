"use client";

import Link from "next/link";
import { useState } from "react";
import { filterUsers, type UserAdminRow, type UserFilter } from "@/lib/admin-filters";
import { formatDateTime } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { DangerAction } from "../_components/danger-action";

const FILTERS: { key: UserFilter; label: string }[] = [
  { key: "todos", label: "todos" },
  { key: "sin-grupo", label: "sin grupo" },
  { key: "anonimos", label: "anónimos" },
  { key: "con-email", label: "con email" },
];

export function UserList({ users }: { users: UserAdminRow[] }) {
  const [filter, setFilter] = useState<UserFilter>("todos");
  const [query, setQuery] = useState("");
  const shown = filterUsers(users, filter, query);
  const orphans = users.filter((u) => u.groups.length === 0 && !u.isAdmin).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="filtros" data-testid="admin-user-filters">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={`chip ${filter === f.key ? "bg-rana text-contorno" : ""}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} data-testid={`admin-user-filter-${f.key}`}>
            {f.label}
          </button>
        ))}
      </div>
      <input className="input-sm" placeholder="buscar por nombre o email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="buscar usuarios" data-testid="admin-user-search" />
      {filter === "sin-grupo" ? (
        <div className="flex flex-col gap-2" data-testid="admin-orphans">
          <p className="text-xs text-tinta-suave">
            {orphans === 0 ? "no hay usuarios sin grupo (sin contar al admin)." : `${orphans} ${orphans === 1 ? "usuario" : "usuarios"} sin ningún grupo. se pueden borrar todos juntos; al admin nunca.`}
          </p>
          <DangerAction action="delete-orphans" label="borrar a todos los que no tienen grupo" word="borrar" wordHint='para confirmar, escribí "borrar"' testId="admin-delete-orphans" disabled={orphans === 0} disabledText="no hay nada para borrar." />
        </div>
      ) : null}
      {shown.length === 0 ? (
        <p className="text-sm text-tinta-suave">no hay usuarios con ese filtro.</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="admin-user-list">
          {shown.map((u) => (
            <li key={u.id} className="card flex items-center gap-3" data-testid="admin-user-row" data-profile-id={u.id} data-email={u.email ?? ""}>
              <Avatar avatar={u.avatar} name={u.name} size={44} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link href={`/admin/usuarios/${u.id}`} className="display text-base text-tinta underline-offset-4 hover:underline" data-testid="admin-user-link">
                  {u.name || "(sin nombre)"}
                  {u.isAdmin ? <span className="chip-points ml-2">admin</span> : null}
                </Link>
                <span className="truncate text-xs text-tinta-suave" data-testid="admin-user-email">
                  {u.email ?? "anónimo"}
                </span>
                <span className="text-xs text-tinta-suave">{u.groups.length === 0 ? "sin grupo" : u.groups.map((g) => `${g.name}${g.role === "owner" ? " (dueño)" : ""}`).join(", ")}</span>
                <span className="text-xs text-tinta-suave">
                  alta {formatDateTime(u.createdAt)} · {u.lastPlayed ? `última partida ${formatDateTime(u.lastPlayed)}` : "nunca jugó"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
