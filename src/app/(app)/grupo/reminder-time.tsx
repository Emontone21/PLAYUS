"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cityFromTimezone } from "@/lib/time";

// Hora local del recordatorio diario. Solo el owner la edita (RLS).
// Guarda al cambiar la hora, con una pausa corta para no mandar una escritura
// por cada dígito en el selector de escritorio, y avisa "guardado" al lado del
// campo, como el apodo.
export function ReminderTime({ groupId, value, timezone }: { groupId: string; value: string | null; timezone: string }) {
  const supabase = useRef(createClient()).current;
  const router = useRouter();
  const [time, setTime] = useState(value ? value.slice(0, 5) : "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
      if (reset.current) clearTimeout(reset.current);
    },
    [],
  );

  async function save(next: string) {
    setState("saving");
    const { data, error } = await supabase
      .from("groups")
      .update({ reminder_time: next ? `${next}:00` : null })
      .eq("id", groupId)
      .select("id");
    // sin error pero sin filas = RLS no dejó (no sos owner): también es un error
    const ok = !error && (data?.length ?? 0) > 0;
    setState(ok ? "saved" : "error");
    if (ok) router.refresh();
    if (reset.current) clearTimeout(reset.current);
    reset.current = setTimeout(() => setState("idle"), 2500);
  }

  function schedule(next: string) {
    setTime(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void save(next), 600);
  }

  return (
    <div className="flex flex-col gap-2" data-testid="reminder-time">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm">recordatorio diario a las</span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-tinta-suave" aria-live="polite" data-testid="reminder-status">
            {state === "saving" ? "guardando" : state === "saved" ? "guardado" : ""}
          </span>
          <input
            type="time"
            value={time}
            onChange={(e) => schedule(e.target.value)}
            className="btn-quiet tabular-nums"
            aria-label="hora del recordatorio"
          />
        </span>
      </label>
      {state === "error" ? (
        <p className="text-sm text-lengua" role="status">
          no se pudo guardar la hora. probá de nuevo.
        </p>
      ) : null}
      <p className="text-xs text-tinta-suave">
        hora de {cityFromTimezone(timezone)}. les llega a los que activaron los avisos y todavía no jugaron. borrá la
        hora para apagarlo.
      </p>
    </div>
  );
}
