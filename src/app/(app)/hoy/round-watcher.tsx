"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Si el admin cambia el juego de hoy, la pantalla se actualiza sola: escucha
// por Realtime los cambios de la fila de la ronda (RLS: solo integrantes) y
// refresca el Server Component; como red de seguridad, también refresca cada
// tanto. El aviso "cambió el juego de hoy" sale de comparar el juego con el
// que había al abrir la pantalla: sobrevive al refresh porque el estado del
// cliente se conserva.
export function RoundWatcher({ roundId, gameId, pollMs = 20_000 }: { roundId: string; gameId: string; pollMs?: number }) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const initial = useRef(gameId);
  const changed = initial.current !== gameId;

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), pollMs);
    if (process.env.NEXT_PUBLIC_DISABLE_REALTIME === "1") return () => clearInterval(interval);
    const channel = supabase
      .channel(`round-row:${roundId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rounds", filter: `id=eq.${roundId}` }, () => router.refresh())
      .subscribe();
    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [roundId, pollMs, router, supabase]);

  if (!changed) return null;
  return (
    <p className="note-ok text-sm" role="status" data-testid="round-changed">
      cambió el juego de hoy.
    </p>
  );
}
