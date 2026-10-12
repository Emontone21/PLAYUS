"use client";

import Link from "next/link";
import { useState } from "react";
import type { GroupAdminRow } from "@/lib/admin-general";
import { filterGroups } from "@/lib/admin-filters";
import { formatDateTime, formatShortDate } from "@/lib/time";
import { TestSwitch } from "../_components/test-switch";

// La lista de grupos con la búsqueda (por nombre o por código) y el
// interruptor "de prueba" en cada uno. Cada tarjeta lleva al detalle.

export function GroupTable({ groups }: { groups: GroupAdminRow[] }) {
  const [query, setQuery] = useState("");
  const shown = filterGroups(groups, query);
  return (
    <div className="flex flex-col gap-3">
      <input className="input-sm" placeholder="buscar por nombre o código" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="buscar grupos" data-testid="admin-group-search" />
      {shown.length === 0 ? (
        <p className="text-sm text-tinta-suave">{groups.length === 0 ? "no hay grupos." : "ningún grupo con ese nombre o código."}</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="admin-group-table">
          {shown.map((g) => (
            <li key={g.id} className="card flex flex-col gap-2" data-testid="admin-group-row" data-group-id={g.id} data-code={g.inviteCode} data-test={g.isTest ? "1" : "0"}>
              <div className="flex items-start justify-between gap-3">
                <Link href={`/admin/grupos/${g.id}`} className="display min-w-0 text-lg text-tinta underline-offset-4 hover:underline" data-testid="admin-group-link">
                  {g.name}
                </Link>
                <TestSwitch groupId={g.id} isTest={g.isTest} />
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                <dt className="text-tinta-suave">código</dt>
                <dd className="display-bold text-tinta">{g.inviteCode}</dd>
                <dt className="text-tinta-suave">integrantes</dt>
                <dd>{g.members}</dd>
                <dt className="text-tinta-suave">temporada</dt>
                <dd data-testid="admin-group-season">{g.season ? `${g.season.number}, día ${g.season.day} de 30` : "todavía no empezó"}</dd>
                <dt className="text-tinta-suave">hoy</dt>
                <dd data-testid="admin-group-game">
                  {g.round ? g.round.gameName : "todavía no se creó"} <span className="text-xs text-tinta-suave">({formatShortDate(g.today)})</span>
                </dd>
                <dt className="text-tinta-suave">actividad</dt>
                <dd className="text-tinta-media">{formatDateTime(g.lastActivity)}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
