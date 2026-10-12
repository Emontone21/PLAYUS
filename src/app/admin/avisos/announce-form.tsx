"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Frog } from "@/components/frog/Frog";
import { AdminApiError, postAdmin } from "../_components/api";

// El formulario del anuncio: texto, a quién va, "ver cómo queda" (vista previa
// de la notificación y cuántas personas la reciben), confirmación y envío.

// el mismo tope que ANNOUNCE_MAX_CHARS en lib/admin-push (que es solo de servidor)
const ANNOUNCE_MAX_CHARS = 120;

type Preview = { text: string; to: string; recipients: number; allowedAt: string | null };
type Status = { kind: "idle" } | { kind: "loading" } | { kind: "preview"; p: Preview } | { kind: "sending"; p: Preview } | { kind: "done"; text: string } | { kind: "error"; text: string; p?: Preview };

const when = (iso: string) => new Date(iso).toLocaleTimeString("es-UY", { timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function AnnounceForm({ groups, allowedAt }: { groups: { id: string; name: string }[]; allowedAt: string | null }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [groupId, setGroupId] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const body = () => ({ text, groupId: groupId || null });

  async function preview() {
    setStatus({ kind: "loading" });
    try {
      const res = await postAdmin<Preview>("push-announce", { ...body(), dryRun: true });
      setStatus({ kind: "preview", p: { text: res.text, to: res.to, recipients: res.recipients, allowedAt: res.allowedAt } });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof AdminApiError ? e.message : "no se pudo." });
    }
  }

  async function send() {
    if (status.kind !== "preview") return;
    const p = status.p;
    setStatus({ kind: "sending", p });
    try {
      const res = await postAdmin<{ summary: string }>("push-announce", body());
      setStatus({ kind: "done", text: res.summary });
      setText("");
      router.refresh();
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof AdminApiError ? e.message : "no se pudo.", p });
    }
  }

  const p = status.kind === "preview" || status.kind === "sending" ? status.p : status.kind === "error" ? status.p : undefined;
  const tooLong = text.trim().length > ANNOUNCE_MAX_CHARS;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs text-tinta-suave">
        texto
        <textarea className="input-sm min-h-20 resize-y" value={text} onChange={(e) => setText(e.target.value)} maxLength={ANNOUNCE_MAX_CHARS + 20} placeholder="hoy a las 21 hay un juego especial" data-testid="admin-announce-text" />
        <span className={tooLong ? "text-lengua" : ""} data-testid="admin-announce-count">
          {text.trim().length} de {ANNOUNCE_MAX_CHARS}
        </span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-tinta-suave">
        a quién
        <select className="input-sm" value={groupId} onChange={(e) => setGroupId(e.target.value)} data-testid="admin-announce-to">
          <option value="">todos los que tienen avisos activados</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      {allowedAt && new Date(allowedAt).getTime() > Date.now() ? (
        <p className="note text-sm" data-testid="admin-announce-cooldown">
          hubo un anuncio hace menos de 10 minutos: se puede mandar otro a las {when(allowedAt)}.
        </p>
      ) : null}
      <button type="button" className="btn-secondary-sm w-fit" onClick={() => void preview()} disabled={!text.trim() || tooLong || status.kind === "loading" || status.kind === "sending"} data-testid="admin-announce-preview">
        {status.kind === "loading" ? "calculando…" : "ver cómo queda"}
      </button>

      {p && status.kind !== "done" ? (
        <div className="card-c card flex flex-col gap-3" data-testid="admin-announce-card">
          <p className="eyebrow">así se ve la notificación</p>
          <div className="flex items-start gap-3 rounded-2xl bg-superficie-2 p-3" style={{ border: "3px solid var(--contorno)" }} data-testid="admin-announce-mock">
            <Frog pose="feliz" size={36} animate={false} />
            <div className="flex min-w-0 flex-col">
              <span className="display-bold text-sm text-tinta">frog</span>
              <span className="text-sm text-tinta-media" data-testid="admin-announce-mock-body">
                {p.text}
              </span>
            </div>
          </div>
          <p className="text-sm" data-testid="admin-announce-recipients">
            la {p.recipients === 1 ? "va a recibir" : "van a recibir"} <span className="display-bold text-tinta">{p.recipients}</span> {p.recipients === 1 ? "persona" : "personas"} ({p.to}).
          </p>
          {p.allowedAt ? (
            <p className="note-alert text-sm" data-testid="admin-announce-blocked">
              hubo un anuncio hace menos de 10 minutos: se puede mandar otro a las {when(p.allowedAt)}.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary-sm" onClick={() => void send()} disabled={status.kind === "sending" || !!p.allowedAt || p.recipients === 0} data-testid="admin-announce-send">
              {status.kind === "sending" ? "mandando…" : "mandar"}
            </button>
            <button type="button" className="btn-secondary-sm" onClick={() => setStatus({ kind: "idle" })} disabled={status.kind === "sending"}>
              no
            </button>
          </div>
          {status.kind === "error" ? (
            <p className="text-sm text-lengua" role="alert" data-testid="admin-announce-error">
              {status.text}
            </p>
          ) : null}
        </div>
      ) : null}
      {status.kind === "error" && !p ? (
        <p className="text-sm text-lengua" role="alert" data-testid="admin-announce-error">
          {status.text}
        </p>
      ) : null}
      {status.kind === "done" ? (
        <p className="note-ok text-sm" role="status" data-testid="admin-announce-done">
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
