"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { GameContainer, type SubmitOutcome } from "@/games/container";
import { getGame } from "@/games";
import type { GameResult } from "@/games/types";
import type { AdminValidation } from "@/lib/admin-actions";

// La lista de juegos del registro, la semilla (al azar, editable), el número
// de intento simulado y el juego en el contenedor real. Al terminar, el
// resultado de validar en el servidor.

type GameInfo = { id: string; name: string; orientation: "portrait" | "landscape"; inRotation: boolean; durationMs: number; scoring: string };

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function AdminPlay({ games }: { games: GameInfo[] }) {
  const [gameId, setGameId] = useState<string | null>(null);
  const [seed, setSeed] = useState(randomSeed);
  const [attemptNo, setAttemptNo] = useState(1);
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [validation, setValidation] = useState<(AdminValidation & { gameName: string; seed: string }) | { error: string } | null>(null);
  const game = gameId ? getGame(gameId) : undefined;

  const onSubmit = useCallback(
    async (result: GameResult, meta: { elapsedMs: number; cutByTimer: boolean }): Promise<SubmitOutcome> => {
      if (!game) return { ok: false, message: "no hay juego." };
      try {
        const res = await fetch("/api/admin/validate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ gameId: game.id, seed, result, elapsedMs: meta.elapsedMs }),
        });
        const body = (await res.json()) as (AdminValidation & { ok: true }) | { ok?: false; message?: string };
        if (!res.ok || !body.ok) {
          setValidation({ error: ("message" in body && body.message) || "no se pudo validar." });
          return { ok: false, message: ("message" in body && body.message) || "no se pudo validar." };
        }
        setValidation({ ...body, gameName: game.name, seed });
        return { ok: true };
      } catch {
        setValidation({ error: "no hay conexión." });
        return { ok: false, message: "no hay conexión." };
      }
    },
    [game, seed],
  );

  if (playing && game) {
    return (
      <div className="flex flex-col gap-4">
        {validation ? <ValidationPanel v={validation} /> : null}
        <GameContainer key={run} game={game} seed={seed} onSubmit={onSubmit} onDone={() => setPlaying(false)} note={`partida de prueba con la semilla “${seed}”, intento simulado ${attemptNo}.`} resultNote="partida de prueba: validada en el servidor, sin guardar." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {validation ? <ValidationPanel v={validation} /> : null}
      <ul className="flex flex-col" data-testid="admin-games">
        {games.map((g) => (
          <li key={g.id} className="flex items-center gap-3 py-2" style={{ borderBottom: "2px solid var(--superficie-2)" }}>
            <button type="button" className={`flex min-w-0 flex-1 flex-col text-left ${g.id === gameId ? "text-rana" : "text-tinta"}`} onClick={() => setGameId(g.id)} data-testid={`admin-game-${g.id}`} aria-pressed={g.id === gameId}>
              <span className="display text-base">{g.name}</span>
              <span className="text-xs text-tinta-suave">
                {g.id} · {g.orientation === "landscape" ? "horizontal" : "vertical"} · {g.inRotation ? "en la rotación" : "fuera de la rotación"} · {Math.round(g.durationMs / 1000)} s
              </span>
            </button>
            <Link href={`/dev/juego/${g.id}?seed=${encodeURIComponent(seed)}`} className="chip shrink-0 text-xs" data-testid={`admin-devlink-${g.id}`}>
              herramientas
            </Link>
          </li>
        ))}
      </ul>
      {game ? (
        <div className="card flex flex-col gap-3" data-testid="admin-play-setup">
          <p className="display text-lg text-tinta">{game.name}</p>
          <label className="flex flex-col gap-1 text-xs text-tinta-suave">
            semilla
            <div className="flex gap-2">
              <input className="input-sm min-w-0 flex-1" value={seed} onChange={(e) => setSeed(e.target.value)} aria-label="semilla" data-testid="admin-seed" />
              <button type="button" className="btn-secondary-sm" onClick={() => setSeed(randomSeed())} data-testid="admin-reroll">
                sortear
              </button>
            </div>
          </label>
          <fieldset className="flex items-center gap-2 text-xs text-tinta-suave">
            <legend className="mb-1">intento simulado</legend>
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" className={n === attemptNo ? "btn-primary-sm" : "btn-secondary-sm"} onClick={() => setAttemptNo(n)} aria-pressed={n === attemptNo} data-testid={`admin-attempt-${n}`}>
                {n}
              </button>
            ))}
          </fieldset>
          <p className="text-xs text-tinta-suave">en una partida real, el intento {attemptNo} jugaría con hash(semilla de la ronda:{attemptNo}:pepper). acá el juego recibe la semilla tal cual, sin pepper.</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setValidation(null);
              setRun((r) => r + 1);
              setPlaying(true);
            }}
            disabled={!seed.trim()}
            data-testid="admin-play"
          >
            jugar
          </button>
        </div>
      ) : (
        <p className="text-sm text-tinta-suave">elegí un juego de la lista.</p>
      )}
    </div>
  );
}

function ValidationPanel({ v }: { v: (AdminValidation & { gameName: string; seed: string }) | { error: string } }) {
  if ("error" in v) {
    return (
      <p className="note-alert text-sm" role="alert" data-testid="admin-validation" data-valid="error">
        no se pudo validar: {v.error}
      </p>
    );
  }
  return (
    <div className={`${v.valid ? "note-ok" : "note-alert"} flex flex-col gap-1 text-sm`} role="status" data-testid="admin-validation" data-valid={v.valid ? "1" : "0"}>
      <p className="display text-lg">{v.valid ? "validado" : "rechazado"}</p>
      <p>
        {v.gameName}, semilla “{v.seed}”: el juego informó <span className="display-bold">{v.score}</span>
        {v.recomputed !== null ? (
          <>
            , el servidor recalcula <span className="display-bold" data-testid="admin-recomputed">{v.recomputed}</span>
          </>
        ) : (
          <> (este juego no recalcula el puntaje)</>
        )}
        .
      </p>
      {!v.valid && v.reason ? <p data-testid="admin-reason">{v.reason}</p> : null}
      <p className="text-xs">
        duró {(v.elapsedMs / 1000).toFixed(1)} s. traza de {v.events} eventos, {v.bytes} bytes.
      </p>
    </div>
  );
}
