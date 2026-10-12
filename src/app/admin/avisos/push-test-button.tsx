"use client";

import { useState } from "react";
import { AdminApiError, postAdmin } from "../_components/api";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done"; text: string } | { kind: "error"; text: string };

export function PushTestButton() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  async function send() {
    setStatus({ kind: "sending" });
    try {
      const res = await postAdmin<{ summary: string }>("push-test", {});
      setStatus({ kind: "done", text: res.summary });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof AdminApiError ? e.message : "no se pudo." });
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="btn-primary-sm w-fit" onClick={() => void send()} disabled={status.kind === "sending"} data-testid="admin-push-test-button">
        {status.kind === "sending" ? "mandando…" : "mandarme una de prueba"}
      </button>
      {status.kind === "done" ? (
        <p className="note-ok text-sm" role="status" data-testid="admin-push-test-done">
          {status.text}
        </p>
      ) : status.kind === "error" ? (
        <p className="text-sm text-lengua" role="alert" data-testid="admin-push-test-error">
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
