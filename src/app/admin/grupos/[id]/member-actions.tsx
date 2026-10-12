"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminApiError, postAdmin } from "../../_components/api";
import { DangerAction } from "../../_components/danger-action";

// Lo que se puede hacer con un integrante: hacerlo dueño (los roles se
// intercambian; confirmación simple) y sacarlo (vista previa, escribir
// "sacar"). Al dueño no se lo puede sacar sin pasarle antes la propiedad.

type Status = { kind: "idle" } | { kind: "confirm" } | { kind: "sending" } | { kind: "done"; text: string } | { kind: "error"; text: string };

export function MemberActions({ groupId, groupName, member }: { groupId: string; groupName: string; member: { profileId: string; name: string; role: "owner" | "member" } }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function makeOwner() {
    setStatus({ kind: "sending" });
    try {
      const res = await postAdmin<{ summary: string }>("change-owner", { groupId, profileId: member.profileId });
      setStatus({ kind: "done", text: res.summary });
      router.refresh();
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof AdminApiError ? e.message : "no se pudo." });
    }
  }

  if (member.role === "owner") {
    return (
      <p className="text-xs text-tinta-suave" data-testid="admin-member-owner-note">
        es el dueño: para sacarlo, antes hacé dueño a otro integrante.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-2">
        {status.kind === "confirm" ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="admin-owner-confirm">
            <span className="text-sm">
              ¿hacer dueño de &quot;{groupName}&quot; a {member.name}?
            </span>
            <button type="button" className="btn-primary-sm" onClick={() => void makeOwner()} data-testid="admin-owner-yes">
              sí
            </button>
            <button type="button" className="btn-secondary-sm" onClick={() => setStatus({ kind: "idle" })}>
              no
            </button>
          </div>
        ) : (
          <button type="button" className="btn-secondary-sm" onClick={() => setStatus({ kind: "confirm" })} disabled={status.kind === "sending"} data-testid="admin-make-owner">
            {status.kind === "sending" ? "cambiando…" : "hacer dueño"}
          </button>
        )}
        <DangerAction action="remove-member" payload={{ groupId, profileId: member.profileId }} label={`sacar a ${member.name}`} word="sacar" wordHint='para confirmar, escribí "sacar"' testId="admin-remove-member" small />
      </div>
      {status.kind === "done" ? (
        <p className="note-ok text-sm" role="status" data-testid="admin-owner-done">
          {status.text}
        </p>
      ) : status.kind === "error" ? (
        <p className="text-sm text-lengua" role="alert">
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
