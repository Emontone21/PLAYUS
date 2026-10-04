"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GroupOverview } from "@/lib/admin-actions";
import { formatShortDate } from "@/lib/time";

// La lista de grupos con el selector del juego de hoy. Dos confirmaciones:
// si nadie jugó, una simple; si ya hay intentos, el aviso con todas las letras
// y un segundo toque en "borrar y cambiar", que aparece recién después del
// primero y va en --lengua para que quede claro que borra.

type Game = { id: string; name: string };
type Pending = { gameId: string; armed: boolean };
type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done"; text: string } | { kind: "error"; text: string };

const DECK = "deck";

function GroupCard({ g, games }: { g: GroupOverview; games: Game[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const current = g.round?.gameId ?? "";
  const targetName = (id: string) => (id === DECK ? "el que toca en el mazo" : (games.find((x) => x.id === id)?.name ?? id));

  async function apply() {
    if (!pending) return;
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/admin/set-game", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: g.id, gameId: pending.gameId }),
      });
      const body = (await res.json()) as { ok?: boolean; message?: string; toGameName?: string; deletedAttempts?: number };
      if (!res.ok || !body.ok) {
        setStatus({ kind: "error", text: body.message ?? "no se pudo cambiar." });
        return;
      }
      setStatus({ kind: "done", text: `listo: hoy ${body.toGameName}${body.deletedAttempts ? `, ${body.deletedAttempts} intentos borrados` : ""}.` });
      setPending(null);
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: "no hay conexión. probá de nuevo." });
    }
  }

  return (
    <li className="card flex flex-col gap-3" data-testid="admin-group" data-group-id={g.id} data-code={g.inviteCode}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="display text-lg text-tinta">{g.name}</span>
        <span className="eyebrow shrink-0">{g.members === 1 ? "1 integrante" : `${g.members} integrantes`}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-tinta-suave">hoy</dt>
        <dd data-testid="admin-group-today">
          {formatShortDate(g.today)} <span className="text-xs text-tinta-suave">({g.timezone})</span>
        </dd>
        <dt className="text-tinta-suave">juego</dt>
        <dd className="display-bold text-tinta" data-testid="admin-group-game">
          {g.round ? g.round.gameName : "todavía no se creó"}
        </dd>
        <dt className="text-tinta-suave">intentos</dt>
        <dd data-testid="admin-group-attempts">{g.attempts === 0 ? "0 intentos hoy" : `${g.attempts} ${g.attempts === 1 ? "intento" : "intentos"} de ${g.people} ${g.people === 1 ? "persona" : "personas"}`}</dd>
      </dl>
      <label className="flex flex-col gap-1 text-xs text-tinta-suave">
        cambiar el juego de hoy a
        <select
          className="input-sm"
          value={pending?.gameId ?? current}
          onChange={(e) => {
            const v = e.target.value;
            setStatus({ kind: "idle" });
            setPending(v && v !== current ? { gameId: v, armed: false } : null);
          }}
          data-testid="admin-group-select"
          disabled={status.kind === "sending"}
        >
          {!g.round ? <option value="">(elegí uno)</option> : null}
          <option value={DECK}>el que toca en el mazo</option>
          {games.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {pending ? (
        <div className="flex flex-col gap-2" data-testid="admin-confirm">
          {g.attempts === 0 ? (
            <>
              <p className="text-sm">
                cambiar el juego de hoy de <span className="display-bold text-tinta">{g.name}</span> a <span className="display-bold text-tinta">{targetName(pending.gameId)}</span>.
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-primary-sm" onClick={() => void apply()} disabled={status.kind === "sending"} data-testid="admin-change">
                  {status.kind === "sending" ? "cambiando…" : "cambiar"}
                </button>
                <button type="button" className="btn-secondary-sm" onClick={() => setPending(null)}>
                  no
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="note-alert text-sm" data-testid="admin-warning">
                se van a borrar {g.attempts} intentos de hoy de {g.people} {g.people === 1 ? "persona" : "personas"}, y van a poder volver a jugar con 3 intentos. el juego de hoy de{" "}
                <span className="display-bold">{g.name}</span> pasa a <span className="display-bold">{targetName(pending.gameId)}</span>.
              </p>
              <div className="flex flex-wrap gap-2">
                {!pending.armed ? (
                  <button type="button" className="btn-secondary-sm" onClick={() => setPending({ ...pending, armed: true })} data-testid="admin-arm">
                    sí, quiero cambiarlo
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary-sm"
                    style={{ background: "var(--lengua)", color: "var(--contorno)" }}
                    onClick={() => void apply()}
                    disabled={status.kind === "sending"}
                    data-testid="admin-delete-and-change"
                  >
                    {status.kind === "sending" ? "borrando…" : "borrar y cambiar"}
                  </button>
                )}
                <button type="button" className="btn-secondary-sm" onClick={() => setPending(null)}>
                  no
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
      {status.kind === "done" ? (
        <p className="note-ok text-sm" role="status" data-testid="admin-done">
          {status.text}
        </p>
      ) : status.kind === "error" ? (
        <p className="text-sm text-lengua" role="alert">
          {status.text}
        </p>
      ) : null}
    </li>
  );
}

export function GroupList({ groups, games }: { groups: GroupOverview[]; games: Game[] }) {
  if (groups.length === 0) return <p className="text-sm text-tinta-suave">no hay grupos.</p>;
  return (
    <ul className="flex flex-col gap-3" data-testid="admin-groups">
      {groups.map((g) => (
        <GroupCard key={g.id} g={g} games={games} />
      ))}
    </ul>
  );
}
