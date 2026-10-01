"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Selector chico de temporada: "temporada actual" o una cerrada ("temporada N").
export function SeasonPicker({ seasons, current, selected }: { seasons: { number: number; closed: boolean }[]; current: number; selected: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <select
      value={selected}
      disabled={pending}
      onChange={(e) => {
        const n = Number(e.target.value);
        startTransition(() => router.push(n === current ? "/grupo" : `/grupo?temporada=${n}`));
      }}
      className="btn-quiet text-xs"
      aria-label="elegir temporada"
      data-testid="season-picker"
    >
      {seasons.map((s) => (
        <option key={s.number} value={s.number}>
          {s.number === current ? "temporada actual" : `temporada ${s.number}`}
        </option>
      ))}
    </select>
  );
}
