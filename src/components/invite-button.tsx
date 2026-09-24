"use client";

import { useEffect, useState } from "react";

// Compartir la invitación: Web Share API si existe, copiar al portapapeles si
// no, y el código siempre visible para dictarlo.
export function InviteButton({ code, groupName }: { code: string; groupName: string }) {
  const [link, setLink] = useState("");
  const [canShare, setCanShare] = useState(false);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    setLink(`${window.location.origin}/g/${code}`);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [code]);

  async function share() {
    const text = `sumate a "${groupName}" en playus: un minijuego por día. código ${code}`;
    if (canShare) {
      try {
        await navigator.share({ title: "playus", text, url: link });
        return;
      } catch {
        // cancelado o sin soporte real: cae a copiar
      }
    }
    await copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    setTimeout(() => setStatus("idle"), 2500);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={share}
        className="btn-primary"
      >
        invitar
      </button>
      <div className="flex items-center justify-between gap-3 bg-superficie px-4 py-3">
        <div className="flex flex-col">
          <span className="text-xs text-tinta-suave">código para dictar</span>
          <span className="display-bold text-2xl tracking-[0.2em]" data-testid="invite-code">
            {code}
          </span>
        </div>
        <button
          type="button"
          onClick={copy}
          className="btn-secondary-sm"
        >
          {status === "copied" ? "copiado" : status === "failed" ? "no se pudo" : "copiar link"}
        </button>
      </div>
      {link ? (
        <p className="break-all text-xs text-tinta-suave" data-testid="invite-link">
          {link}
        </p>
      ) : null}
    </div>
  );
}
