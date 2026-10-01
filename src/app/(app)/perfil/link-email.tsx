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
      const message =
        error.code === "email_exists"
          ? "ese email ya está vinculado a otra cuenta."
          : "no se pudo vincular ahora. probá más tarde.";
      setState({ kind: "error", message });
      return;
    }
    setState({ kind: "sent", to });
  }

  return (
    <details className="note text-tinta" data-testid="link-email">
      <summary className="cursor-pointer display-bold text-sm text-tinta">¿cambiás de teléfono? vinculá un email</summary>
      <div className="flex flex-col gap-3 pt-3">
        {currentEmail ? (
          <p className="text-sm">
            tu cuenta ya está vinculada a <span className="display-bold text-tinta">{currentEmail}</span>.
          </p>
        ) : (
          <p className="eyebrow">
            te mandamos un link y listo. sin contraseña. es solo para no perder tus colillas si cambiás de teléfono.
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
              className="input-sm min-w-0 flex-1"
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
          <p className="text-sm text-lengua" role="status">
            {state.message}
          </p>
        ) : null}
      </div>
    </details>
  );
}
