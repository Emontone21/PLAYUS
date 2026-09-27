// TEMPORAL: juego de relleno. Existe para probar el contrato con scoring
// 'low' y la semilla determinística. Se reemplaza por un juego real.

import * as React from "react";
import { rngFromSeed } from "@/lib/rng";
import type { GameModule, GameProps, GameResult } from "./types";

const ROUNDS = 5;
const MIN_WAIT_MS = 1000;
const MAX_WAIT_MS = 4000;
const GO_TIMEOUT_MS = 2000; // si nadie toca, la ronda vale esto
const PAUSE_MS = 700;

type Phase = "wait" | "go" | "done";
export type RoundEvent = { round: number; waitMs: number; reactionMs: number; falseStarts: number };

// Las esperas salen de la semilla: todos los del grupo esperan lo mismo en
// cada ronda. Esto es lo que comprueba el test de la etapa 4.
export function waitsForSeed(seed: string): number[] {
  const rng = rngFromSeed(`reflejo:${seed}`);
  return Array.from({ length: ROUNDS }, () => rng.int(MIN_WAIT_MS, MAX_WAIT_MS));
}

function Reflejo({ seed, onReady, onFinish, onProgress }: GameProps) {
  const waits = React.useRef(waitsForSeed(seed)).current;
  const [round, setRound] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>("wait");
  const [message, setMessage] = React.useState("esperá el verde…");
  const [last, setLast] = React.useState<number | null>(null);
  const events = React.useRef<RoundEvent[]>([]);
  const falseStarts = React.useRef(0);
  const goAt = React.useRef<number>(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const finishRound = React.useCallback(
    (reactionMs: number) => {
      clear();
      const ev: RoundEvent = {
        round,
        waitMs: waits[round] ?? MAX_WAIT_MS,
        reactionMs,
        falseStarts: falseStarts.current,
      };
      events.current.push(ev);
      falseStarts.current = 0;
      setLast(reactionMs);
      onProgress(projected(events.current, waits));

      if (round + 1 >= ROUNDS) {
        setPhase("done");
        setMessage("listo");
        onFinish({ score: average(events.current), events: [...events.current] });
        return;
      }
      setPhase("done");
      setMessage(`${reactionMs} ms`);
      timer.current = setTimeout(() => {
        setRound(round + 1);
        setPhase("wait");
        setMessage("esperá el verde…");
      }, PAUSE_MS);
    },
    [round, waits, onFinish, onProgress],
  );

  // arma cada ronda: espera determinística, después "go" con un tope
  React.useEffect(() => {
    if (phase !== "wait") return;
    clear();
    timer.current = setTimeout(() => {
      goAt.current = performance.now();
      setPhase("go");
      setMessage("¡tocá!");
      timer.current = setTimeout(() => finishRound(GO_TIMEOUT_MS), GO_TIMEOUT_MS);
    }, waits[round]);
    return clear;
  }, [phase, round, waits, finishRound]);

  // si el cronómetro corta antes de la primera ronda, vale este parcial
  // (una sola vez: después lo actualiza cada ronda terminada)
  const reportedInitial = React.useRef(false);
  React.useEffect(() => {
    if (reportedInitial.current) return;
    reportedInitial.current = true;
    onProgress(projected([], waits));
  }, [onProgress, waits]);

  React.useEffect(() => {
    onReady();
  }, [onReady]);

  function tap() {
    if (phase === "go") {
      finishRound(Math.round(performance.now() - goAt.current));
    } else if (phase === "wait") {
      // salida en falso: la ronda arranca de nuevo con la misma espera
      falseStarts.current += 1;
      clear();
      setMessage("muy pronto. de nuevo…");
      setPhase("done");
      timer.current = setTimeout(() => {
        setPhase("wait");
        setMessage("esperá el verde…");
      }, PAUSE_MS);
    }
  }

  const bg = phase === "go" ? "#22C55E" : phase === "wait" ? "#FF5C8A" : "#26244A";
  // sobre rosa y verde, texto oscuro; entre rondas el fondo es oscuro y el
  // tiempo de la ronda va en claro
  const ink = phase === "done" ? "text-tinta" : "text-fondo";
  const inkSoft = phase === "done" ? "text-tinta-suave" : "text-fondo/80";

  return (
    <button
      type="button"
      onPointerDown={tap}
      className="flex h-full w-full select-none flex-col items-center justify-center gap-3"
      style={{ background: bg }}
      data-testid="reflejo-area"
      data-phase={phase}
      data-round={round}
      data-waits={JSON.stringify(waits)}
    >
      <span className={`text-sm ${inkSoft}`}>ronda {Math.min(round + 1, ROUNDS)} de {ROUNDS}</span>
      <span className={`display text-4xl ${ink}`}>{message}</span>
      {last !== null && phase !== "done" ? (
        <span className={`text-sm ${inkSoft}`}>última: {last} ms</span>
      ) : null}
    </button>
  );
}

// Resultado si el cronómetro corta ahora: las rondas que faltan valen el tope,
// igual que no tocar. Así quedarse sin tiempo da un puntaje válido (y malo)
// en lugar de un intento rechazado.
export function projected(done: RoundEvent[], waits: number[]): GameResult {
  const events: RoundEvent[] = [...done];
  for (let i = done.length; i < ROUNDS; i++) {
    events.push({ round: i, waitMs: waits[i] ?? MAX_WAIT_MS, reactionMs: GO_TIMEOUT_MS, falseStarts: 0 });
  }
  return { score: average(events), events };
}

function average(events: RoundEvent[]): number {
  if (events.length === 0) return 0;
  return Math.round(events.reduce((s, e) => s + e.reactionMs, 0) / events.length);
}

// Los eventos tienen que coincidir con las esperas de la semilla y con el
// promedio declarado.
function validate(result: GameResult, seed: string): boolean {
  const waits = waitsForSeed(seed);
  const events = result.events as RoundEvent[];
  if (events.length !== ROUNDS) return false;
  for (let i = 0; i < ROUNDS; i++) {
    const e = events[i];
    if (!e || e.round !== i || e.waitMs !== waits[i]) return false;
    if (typeof e.reactionMs !== "number" || e.reactionMs < 0 || e.reactionMs > GO_TIMEOUT_MS) return false;
  }
  return average(events) === result.score;
}

export const reflejo: GameModule = {
  id: "reflejo",
  name: "reflejo",
  tagline: "cinco rondas. tocá apenas se pone verde.",
  howTo: ["la pantalla está rosa: esperá", "se pone verde: tocá", "gana el promedio más bajo en ms"],
  // cinco rondas de hasta 4 s de espera + 2 s de tope + pausas
  durationMs: 35_000,
  // termina antes por diseño: cinco esperas de al menos 1 s más reacciones
  minDurationMs: 5_000,
  scoring: "low",
  maxPlausibleScore: GO_TIMEOUT_MS,
  // nadie reacciona en menos de 100 ms
  minPlausibleScore: 100,
  validate,
  Component: Reflejo,
};
