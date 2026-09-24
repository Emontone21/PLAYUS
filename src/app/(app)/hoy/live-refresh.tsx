"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Ranking del día en vivo: escucha cambios en attempts de la ronda por
// Realtime (respeta RLS: solo llegan las filas que el usuario puede leer) y
// refresca el Server Component. Como red de seguridad, también refresca cada
// tanto por si el socket no conecta. NEXT_PUBLIC_DISABLE_REALTIME=1 apaga la
// suscripción (el emulador local no tiene Realtime).
export function LiveRefresh({ roundId, pollMs = 15_000 }: { roundId: string; pollMs?: number }) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), pollMs);
    if (process.env.NEXT_PUBLIC_DISABLE_REALTIME === "1") return () => clearInterval(interval);

    const channel = supabase
      .channel(`round:${roundId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attempts", filter: `round_id=eq.${roundId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [roundId, pollMs, router, supabase]);

  return null;
}
