"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { getGame } from "@/games";
import { GameContainer, type SubmitOutcome } from "@/games/container";
import type { GameResult } from "@/games/types";

// Conecta el contenedor con los endpoints antitrampas: "jugar" consume el
// intento en /start (antes de la cuenta regresiva) y el resultado va a
// /finish, que valida tiempo, cotas y traza.
export function Play({
  roundId,
  gameId,
  seed,
  attemptsLeft,
  firstTime,
}: {
  roundId: string;
  gameId: string;
  seed: string;
  attemptsLeft: number;
  firstTime: boolean;
}) {
  const router = useRouter();
  const attemptId = useRef<string | null>(null);
  const game = getGame(gameId);
  if (!game) return <p className="text-rosa">el juego de hoy no está en esta versión de la app. actualizala.</p>;

  async function onStart() {
    const res = await fetch(`/api/rounds/${roundId}/start`, { method: "POST" });
    const body = (await res.json()) as { attemptId?: string; message?: string };
    if (!res.ok || !body.attemptId) throw new Error(body.message ?? "no se pudo empezar la partida.");
    attemptId.current = body.attemptId;
  }

  async function onSubmit(result: GameResult): Promise<SubmitOutcome> {
    if (!attemptId.current) return { ok: false, message: "la partida no había empezado." };
    const res = await fetch(`/api/attempts/${attemptId.current}/finish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
    });
    const body = (await res.json()) as { ok?: boolean; message?: string };
    if (!res.ok || !body.ok) return { ok: false, message: body.message ?? "no se pudo guardar el puntaje." };
    return { ok: true };
  }

  function onDone() {
    router.push("/hoy");
    router.refresh();
  }

  const note = attemptsLeft === 1 ? "es tu último intento de hoy." : `te quedan ${attemptsLeft} intentos hoy.`;
  const warning = firstTime
    ? "el intento se gasta al tocar jugar. si recargás o cerrás la app en medio de la partida, se pierde igual."
    : undefined;

  return <GameContainer game={game} seed={seed} onStart={onStart} onSubmit={onSubmit} onDone={onDone} note={note} warning={warning} />;
}
