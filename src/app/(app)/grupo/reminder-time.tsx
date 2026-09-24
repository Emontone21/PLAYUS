"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Hora local del recordatorio diario. Solo el owner la edita (RLS).
export function ReminderTime({ groupId, value, timezone }: { groupId: string; value: string | null; timezone: string }) {
  const supabase = useRef(createClient()).current;
  const router = useRouter();
  const [time, setTime] = useState(value ? value.slice(0, 5) : "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(next: string) {
    setState("saving");
    const { error } = await supabase
      .from("groups")
      .update({ reminder_time: next ? `${next}:00` : null })
      .eq("id", groupId);
    setState(error ? "error" : "saved");
    if (!error) router.refresh();
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <div className="flex flex-col gap-2" data-testid="reminder-time">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm">recordatorio diario a las</span>
        <input
          type="time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            void save(e.target.value);
          }}
          className="rounded-md bg-superficie px-3 py-2 font-bold text-tinta tabular-nums"
          aria-label="hora del recordatorio"
        />
      </label>
      <p className="text-xs text-tinta-suave">
        hora de {timezone}. les llega a los que activaron los avisos y todavía no jugaron. borrá la hora para
        apagarlo. {state === "saving" ? "guardando…" : state === "saved" ? "guardado." : state === "error" ? "no se pudo guardar." : ""}
      </p>
    </div>
  );
}
