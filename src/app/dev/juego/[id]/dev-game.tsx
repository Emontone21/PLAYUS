"use client";

import { useState } from "react";
import { getGame } from "@/games";
import { GameContainer } from "@/games/container";

export function DevGame({ id, seed }: { id: string; seed: string }) {
  const [run, setRun] = useState(0);
  const game = getGame(id);
  if (!game) return null;
  return (
    <GameContainer
      key={run}
      game={game}
      seed={seed}
      onDone={() => setRun((r) => r + 1)}
      note="modo desarrollo: no consume intentos ni guarda nada."
    />
  );
}
