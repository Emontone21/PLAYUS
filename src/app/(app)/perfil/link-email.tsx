"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Vincular un email, escondido en un <details>. Convierte la cuenta anónima
// en una con email sin perder nada (updateUser manda un magic link de
// confirmación). Nunca bloquea nada.
export function LinkEmail({
  currentEmail,
  pendingEmail,
}: {
  currentEmail: string | null;
  pendingEmail: string | null;
}) {
  const supabase = useRef(createClient()).current;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "sent"; to: string } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function link() {
    const to = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setState({ kind: "error", message: "ese email no parece válido." });
      return;
    }
    setState({ kind: "sending" });
    const { error } = await supabase.auth.updateUser({ email: to });
    if (error) {
      setState({ kind: "error", message: "no se pudo vincular ahora. probá más tarde." });
      return;
    }
    setState({ kind: "sent", to });
  }

  return (
    <details className="bg-superficie px-4 py-3" data-testid="link-email">
      <summary className="cursor-pointer text-sm font-bold">¿cambiás de teléfono? vinculá un email</summary>
      <div className="flex flex-col gap-3 pt-3">
        {currentEmail ? (
          <p className="text-sm">
            tu cuenta ya está vinculada a <span className="font-bold">{currentEmail}</span>.
          </p>
        ) : (
          <p className="eyebrow">
            sin esto, la cuenta vive solo en este teléfono. con un email podés recuperarla desde otro.
            no hay contraseña: te mandamos un link.
          </p>
        )}
        {pendingEmail && pendingEmail !== currentEmail ? (
          <p className="eyebrow">falta confirmar {pendingEmail}: tocá el link que te mandamos.</p>
        ) : null}
        {state.kind === "sent" ? (
          <p className="note-ok text-sm" role="status">
            te mandamos un link a {state.to}. abrilo desde este teléfono y listo.
          </p>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void link();
            }}
          >
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={currentEmail ? "otro email" : "tu email"}
              aria-label="email"
              className="input-sm min-w-0 flex-1 border-fondo bg-fondo"
            />
            <button
              type="submit"
              disabled={state.kind === "sending"}
              className="btn-secondary-sm"
            >
              {state.kind === "sending" ? "enviando…" : "vincular"}
            </button>
          </form>
        )}
        {state.kind === "error" ? (
          <p className="text-sm text-rosa" role="status">
            {state.message}
          </p>
        ) : null}
      </div>
    </details>
  );
}
