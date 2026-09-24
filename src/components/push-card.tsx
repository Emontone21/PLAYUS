"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pushStatus, subscribeToPush, unsubscribeFromPush, type PushStatus } from "@/lib/push-client";

// Notificaciones. Dos usos:
//   variant="offer": tarjeta que aparece después de la primera partida;
//     se puede descartar y no vuelve a molestar.
//   variant="settings": el interruptor de la pestaña Perfil, siempre visible.
// El permiso se pide al tocar, nunca al entrar.

const DISMISS_KEY = "playus-push-dismissed";

export function PushCard({ userId, variant }: { userId: string; variant: "offer" | "settings" }) {
  const supabase = useRef(createClient()).current;
  const [status, setStatus] = useState<PushStatus | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissed(variant === "offer" && localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      /* sin storage */
    }
    void pushStatus().then(setStatus);
  }, [variant]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const next = await subscribeToPush(supabase, userId);
      setStatus(next);
      if (next === "denied") setError("el navegador tiene las notificaciones bloqueadas para playus. se cambia en los ajustes del sitio.");
      if (next === "no-sw") setError("acá no hay service worker (en desarrollo no se genera). probalo en el build.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      setStatus(await unsubscribeFromPush(supabase));
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sin storage */
    }
    setDismissed(true);
  }

  if (status === "loading") return null;
  if (variant === "offer" && (dismissed || status === "subscribed" || status === "unsupported")) return null;

  const enabled = status === "subscribed";

  return (
    <div className="panel" data-testid={`push-${variant}`}>
      <p className="font-extrabold">{variant === "offer" ? "¿te avisamos cuando te pasen?" : "notificaciones"}</p>
      <p className="eyebrow">
        {status === "unsupported"
          ? "este navegador no puede mandar notificaciones. en iPhone hace falta instalar la app primero."
          : enabled
            ? "activadas en este teléfono: el recordatorio del grupo y cuando alguien te pasa en el ranking."
            : "un aviso cuando alguien te pasa en el ranking, y el recordatorio diario a la hora que elija el grupo. nada más."}
      </p>
      {status !== "unsupported" ? (
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <button type="button" disabled={busy} onClick={disable} className="btn-secondary">
              {busy ? "un segundo…" : "desactivar"}
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={enable} className="btn-primary-sm" data-testid="push-enable">
              {busy ? "un segundo…" : "activar avisos"}
            </button>
          )}
          {variant === "offer" ? (
            <button type="button" onClick={dismiss} className="px-2 text-sm text-tinta-suave underline">
              ahora no
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-rosa" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
