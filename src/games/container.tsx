"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameModule, GameResult } from "./types";

// El contenedor de partida. Máquina de estados:
//   intro → countdown → loading → playing → submitting → result | error
// Es dueño del cronómetro: arranca con onReady y corta cuando se acaba
// durationMs, usando el último parcial que informó el juego. El juego puede
// terminar antes con onFinish. El juego no sabe nada más.

export type SubmitOutcome = { ok: true } | { ok: false; message: string };

export interface GameContainerProps {
  game: GameModule;
  seed: string;
  /** se llama al tocar "jugar", antes de la cuenta regresiva (etapa 5: /start) */
  onStart?: () => Promise<void>;
  /** se llama con el resultado final (etapa 5: /finish) */
  onSubmit?: (result: GameResult, meta: { elapsedMs: number; cutByTimer: boolean }) => Promise<SubmitOutcome>;
  /** al tocar "listo" en la pantalla de resultado */
  onDone?: () => void;
  /** texto extra en la pantalla previa (ej. "te quedan 2 intentos") */
  note?: string;
  /** aviso destacado en la pantalla previa (ej. recargar cuesta el intento) */
  warning?: string;
  /** la pantalla previa arranca directo en cuenta regresiva */
  autoStart?: boolean;
}

type State =
  | { step: "intro" }
  | { step: "countdown"; n: number }
  | { step: "loading" }
  | { step: "playing" }
  | { step: "submitting" }
  | { step: "result"; result: GameResult; cutByTimer: boolean; saved: boolean }
  | { step: "error"; message: string };

const COUNTDOWN_FROM = 3;

export function GameContainer({ game, seed, onStart, onSubmit, onDone, note, warning, autoStart }: GameContainerProps) {
  const [state, setState] = useState<State>({ step: "intro" });
  const [timeLeftMs, setTimeLeftMs] = useState(game.durationMs);
  const startedAt = useRef<number | null>(null);
  const lastProgress = useRef<GameResult>({ score: 0, events: [] });
  const finished = useRef(false);
  const ticker = useRef<number | null>(null);

  const stopTicker = () => {
    if (ticker.current !== null) cancelAnimationFrame(ticker.current);
    ticker.current = null;
  };

  const finalize = useCallback(
    async (result: GameResult, cutByTimer: boolean) => {
      if (finished.current) return;
      finished.current = true;
      stopTicker();
      const elapsedMs = startedAt.current === null ? 0 : Math.round(performance.now() - startedAt.current);
      setState({ step: "submitting" });
      if (!onSubmit) {
        setState({ step: "result", result, cutByTimer, saved: false });
        return;
      }
      try {
        const outcome = await onSubmit(result, { elapsedMs, cutByTimer });
        if (outcome.ok) setState({ step: "result", result, cutByTimer, saved: true });
        else setState({ step: "error", message: outcome.message });
      } catch (e) {
        setState({ step: "error", message: (e as Error).message || "no se pudo guardar el puntaje." });
      }
    },
    [onSubmit],
  );

  // cronómetro: arranca en onReady, corta solo
  const onReady = useCallback(() => {
    if (startedAt.current !== null) return;
    startedAt.current = performance.now();
    setState({ step: "playing" });
    const tick = () => {
      const elapsed = performance.now() - (startedAt.current ?? 0);
      const left = Math.max(0, game.durationMs - elapsed);
      setTimeLeftMs(left);
      if (left <= 0) {
        void finalize(lastProgress.current, true);
        return;
      }
      ticker.current = requestAnimationFrame(tick);
    };
    ticker.current = requestAnimationFrame(tick);
  }, [game.durationMs, finalize]);

  const onProgress = useCallback((result: GameResult) => {
    lastProgress.current = result;
  }, []);

  const onFinish = useCallback(
    (result: GameResult) => {
      lastProgress.current = result;
      void finalize(result, false);
    },
    [finalize],
  );

  useEffect(() => stopTicker, []);

  async function start() {
    setState({ step: "countdown", n: COUNTDOWN_FROM });
    if (onStart) {
      try {
        await onStart();
      } catch (e) {
        setState({ step: "error", message: (e as Error).message || "no se pudo empezar la partida." });
        return;
      }
    }
    for (let n = COUNTDOWN_FROM; n >= 1; n--) {
      setState({ step: "countdown", n });
      await sleep(1000);
    }
    setState({ step: "loading" });
  }

  useEffect(() => {
    if (autoStart && state.step === "intro") void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const Game = game.Component;
  const unit = game.scoring === "low" ? "ms" : "";

  if (state.step === "intro") {
    return (
      <section className="flex min-h-[70dvh] flex-col justify-between gap-6" data-testid="game-intro">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-tinta-suave">el juego de hoy</p>
          <h1 className="text-5xl font-extrabold tracking-tight">{game.name}</h1>
          <p className="text-lg text-tinta-suave">{game.tagline}</p>
          <ol className="mt-2 flex flex-col gap-2">
            {game.howTo.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="w-6 shrink-0 text-right font-extrabold text-oro">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-tinta-suave">
            dura {Math.round(game.durationMs / 1000)} segundos como máximo.{" "}
            {game.scoring === "low" ? "gana el más bajo." : "gana el más alto."}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {warning ? (
            <p className="rounded-md border-l-4 border-rosa bg-superficie px-4 py-3 text-sm" data-testid="game-warning">
              {warning}
            </p>
          ) : null}
          {note ? <p className="text-sm text-tinta-suave">{note}</p> : null}
          <button
            type="button"
            onClick={() => void start()}
            className="rounded-md bg-oro px-4 py-4 text-xl font-extrabold text-fondo"
            data-testid="game-play"
          >
            jugar
          </button>
        </div>
      </section>
    );
  }

  if (state.step === "countdown") {
    return (
      <section className="flex min-h-[70dvh] flex-col items-center justify-center gap-2" data-testid="game-countdown">
        <span className="text-[9rem] font-extrabold leading-none text-oro tabular-nums">{state.n}</span>
        <span className="text-tinta-suave">preparate</span>
      </section>
    );
  }

  if (state.step === "loading" || state.step === "playing") {
    return (
      <section className="flex min-h-[80dvh] flex-col gap-3" data-testid="game-playing">
        <header className="flex items-baseline justify-between">
          <span className="font-extrabold">{game.name}</span>
          <span className="text-3xl font-extrabold tabular-nums" data-testid="game-timer" aria-live="off">
            {formatSeconds(timeLeftMs)}
          </span>
        </header>
        {/* el hijo (la raíz del juego) se estira a todo el alto disponible */}
        <div className="flex min-h-[60dvh] flex-1 flex-col overflow-hidden rounded-md [&>*]:min-h-0 [&>*]:flex-1">
          <Game seed={seed} onReady={onReady} onFinish={onFinish} onProgress={onProgress} />
        </div>
        {state.step === "loading" ? <p className="text-sm text-tinta-suave">cargando…</p> : null}
      </section>
    );
  }

  if (state.step === "submitting") {
    return (
      <section className="flex min-h-[70dvh] items-center justify-center" data-testid="game-submitting">
        <p className="text-tinta-suave">guardando…</p>
      </section>
    );
  }

  if (state.step === "error") {
    return (
      <section className="flex min-h-[70dvh] flex-col justify-center gap-4" data-testid="game-error">
        <p className="rounded-md border-l-4 border-rosa bg-superficie px-4 py-3" role="alert">
          {state.message}
        </p>
        {onDone ? (
          <button type="button" onClick={onDone} className="rounded-md border-2 border-agua px-4 py-3 font-extrabold text-agua">
            volver
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="flex min-h-[70dvh] flex-col justify-between gap-6" data-testid="game-result">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-tinta-suave">{state.cutByTimer ? "se acabó el tiempo" : "terminaste"}</p>
        <p className="text-[7rem] font-extrabold leading-none tabular-nums" data-testid="game-score">
          {state.result.score}
          {unit ? <span className="ml-2 text-3xl text-tinta-suave">{unit}</span> : null}
        </p>
        <p className="text-tinta-suave">{state.saved ? "quedó guardado." : "partida de prueba: no se guardó."}</p>
      </div>
      {onDone ? (
        <button
          type="button"
          onClick={onDone}
          className="rounded-md bg-oro px-4 py-4 text-xl font-extrabold text-fondo"
          data-testid="game-done"
        >
          listo
        </button>
      ) : null}
    </section>
  );
}

function formatSeconds(ms: number): string {
  return `${Math.ceil(ms / 1000)}s`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
