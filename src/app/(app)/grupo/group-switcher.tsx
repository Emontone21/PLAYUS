"use client";

import { useTransition } from "react";
import { selectGroup } from "@/lib/groups-actions";

// Selector arriba de la pestaña Grupo, solo si hay más de un grupo.
export function GroupSwitcher({
  groups,
  currentId,
}: {
  groups: { id: string; name: string }[];
  currentId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm text-tinta-suave">
      <span>grupo</span>
      <select
        value={currentId}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(async () => {
            await selectGroup(id, "/grupo");
          });
        }}
        className="btn-quiet"
        aria-label="elegir grupo"
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}
