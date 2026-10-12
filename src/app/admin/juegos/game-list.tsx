"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GameSettingRow } from "@/lib/admin-general";
import { AdminApiError, postAdmin } from "../_components/api";
import { Switch } from "../_components/switch";

export function GameList({ games }: { games: GameSettingRow[] }) {
  const router = useRouter();
  const [state, setState] = useState(() => new Map(games.map((g) => [g.id, g.enabled])));
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; text: string; error: boolean } | null>(null);
  const enabledCount = [...state.values()].filter(Boolean).length;

  async function toggle(id: string, next: boolean) {
    setBusy(id);
    setNote(null);
    try {
      const res = await postAdmin<{ enabled: boolean; summary: string }>("toggle-game", { gameId: id, enabled: next });
      setState((s) => new Map(s).set(id, res.enabled));
      setNote({ id, text: res.summary, error: false });
      router.refresh();
    } catch (e) {
      setNote({ id, text: e instanceof AdminApiError ? e.message : "no se pudo.", error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="flex flex-col" data-testid="admin-game-list">
      {games.map((g) => {
        const on = state.get(g.id) ?? g.enabled;
        const last = on && enabledCount === 1;
        return (
          <li key={g.id} className="flex flex-col gap-2 py-3" style={{ borderBottom: "2px solid var(--superficie-2)" }} data-testid={`admin-game-row-${g.id}`} data-enabled={on ? "1" : "0"}>
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className={`display text-base ${on ? "text-tinta" : "text-tinta-suave"}`}>{g.name}</span>
                <span className="text-xs text-tinta-suave">
                  {g.id} · {g.orientation === "landscape" ? "horizontal" : "vertical"} · {Math.round(g.durationMs / 1000)} s
                </span>
              </div>
              <Switch checked={on} onChange={(n) => void toggle(g.id, n)} label="en rotación" busy={busy === g.id} disabled={last} testId={`admin-rotation-${g.id}`} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/jugar?juego=${encodeURIComponent(g.id)}`} className="chip text-xs" data-testid={`admin-try-${g.id}`}>
                probar
              </Link>
              <Link href={`/dev/juego/${g.id}`} className="chip text-xs">
                herramientas
              </Link>
              {last ? <span className="text-xs text-tinta-suave">es el único en rotación: no se puede apagar.</span> : null}
            </div>
            {note?.id === g.id ? (
              <p className={`text-sm ${note.error ? "text-lengua" : "text-agua"}`} role={note.error ? "alert" : "status"} data-testid={`admin-rotation-note-${g.id}`}>
                {note.text}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
