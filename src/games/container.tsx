"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scoreUnit, type GameModule, type GameResult } from "./types";
import { frameFor, rotatedStyle } from "./lib/orientation";
import { rotationContext } from "./lib/orientation-context";
import { RotateHint } from "./rotate-hint";

// El contenedor de partida. Máquina de estados:
//   intro → countdown → loading → playing → submitting → result | error
// Es dueño del cronómetro: arranca con onReady y corta cuando se acaba
// durationMs, usando el último parcial que informó el juego. El juego puede
// terminar antes con onFinish. El juego no sabe nada más.
//
// Los juegos 'landscape' se juegan con el teléfono de costado: si la ventana
// está en vertical, el área de juego (cronómetro incluido) se rota 90° con
// CSS (games/lib/orientation) y los punteros se pasan al sistema rotado por
// contexto. Sin screen.orientation.lock ni manifest: en iPhone no anda y la
// app sigue siendo vertical para todo lo demás.

export type SubmitOutcome = { ok: true } | { ok: false; message: string };

export interface GameContainerProps {
  game: GameModule;
  /** semilla inicial; si onStart devuelve una, esa manda (la semilla real es por intento) */
  seed?: string;
  /** se llama al tocar "jugar", antes de la cuenta regresiva (etapa 5: /start). Puede devolver la semilla del intento. */
  onStart?: () => Promise<void | { seed?: string }>;
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
  /** texto de la pantalla de resultado en lugar de "quedó guardado." (el panel de admin: validada sin guardar) */
  resultNote?: string;
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

export function GameContainer({ game, seed, onStart, onSubmit, onDone, note, warning, autoStart, resultNote }: GameContainerProps) {
  const [state, setState] = useState<State>({ step: "intro" });
  const [activeSeed, setActiveSeed] = useState<string | undefined>(seed);
  const [timeLeftMs, setTimeLeftMs] = useState(game.durationMs);
  const startedAt = useRef<number | null>(null);
  const lastProgress = useRef<GameResult>({ score: 0, events: [] });
  const finished = useRef(false);
  const ticker = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ vw: 0, vh: 0 });
  useEffect(() => {
    const measure = () => setViewport({ vw: window.innerWidth, vh: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const frame = useMemo(() => frameFor(game.orientation, viewport.vw, viewport.vh), [game.orientation, viewport.vw, viewport.vh]);

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
    let nextSeed = seed;
    if (onStart) {
      try {
        const started = await onStart();
        if (started && started.seed) nextSeed = started.seed;
      } catch (e) {
        setState({ step: "error", message: (e as Error).message || "no se pudo empezar la partida." });
        return;
      }
    }
    if (!nextSeed) {
      setState({ step: "error", message: "no llegó la semilla de la partida. probá de nuevo." });
      return;
    }
    setActiveSeed(nextSeed);
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
  const unit = scoreUnit(game);

  if (state.step === "intro") {
    return (
      <section className="flex min-h-[70dvh] flex-col justify-between gap-6" data-testid="game-intro">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-rana">el juego de hoy</p>
          <h1 className="display-lg text-tinta" style={{ fontSize: 58 }}>
            {game.name}
          </h1>
          <p className="text-lg">{game.tagline}</p>
          <ol className="mt-2 flex flex-col gap-3">
            {game.howTo.map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span className="bubble-number">{i + 1}</span>
                <span className="text-tinta-media">{step}</span>
              </li>
            ))}
          </ol>
          <p className="eyebrow">
            dura {Math.round(game.durationMs / 1000)} segundos como máximo.{" "}
            {game.scoring === "low" ? "gana el más bajo." : "gana el más alto."}
          </p>
          {game.Intro ? <game.Intro seed={seed} /> : null}
        </div>
        <div className="flex flex-col gap-3">
          {warning ? (
            <p className="note-alert text-sm" data-testid="game-warning">
              {warning}
            </p>
          ) : null}
          {note ? <p className="eyebrow">{note}</p> : null}
          <button
            type="button"
            onClick={() => void start()}
            className="btn-primary"
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
        <span className="display-lg text-[9rem] text-rana">{state.n}</span>
        <span className="text-tinta-suave">preparate</span>
        {frame.rotated ? <RotateHint /> : null}
      </section>
    );
  }

  if (state.step === "loading" || state.step === "playing") {
    // rotado: el área ocupa la ventana entera, girada 90°, por encima de todo lo demás
    const rotated = frame.rotated;
    const RotationContext = rotationContext();
    return (
      <RotationContext.Provider value={frame}>
        <section
          className={rotated ? "fixed left-0 top-0 z-40 flex flex-col gap-2 overflow-hidden bg-fondo p-3" : "flex min-h-[80dvh] flex-col gap-3"}
          style={rotated ? rotatedStyle(frame) : undefined}
          data-testid="game-playing"
          data-rotated={rotated ? "1" : "0"}
        >
          <header className="flex items-baseline justify-between">
            <span className="display text-lg">{game.name}</span>
            <span className="display text-4xl" data-testid="game-timer" aria-live="off">
              {formatSeconds(timeLeftMs)}
            </span>
          </header>
          {/* el hijo (la raíz del juego) se estira a todo el alto disponible */}
          <div className={`flex flex-1 flex-col overflow-hidden rounded-lg [&>*]:min-h-0 [&>*]:flex-1 ${rotated ? "min-h-0" : "min-h-[60dvh]"}`}>
            <Game seed={activeSeed ?? ""} onReady={onReady} onFinish={onFinish} onProgress={onProgress} />
          </div>
          {state.step === "loading" ? <p className="eyebrow">cargando…</p> : null}
        </section>
      </RotationContext.Provider>
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
        <p className="note-alert" role="alert">
          {state.message}
        </p>
        {onDone ? (
          <button type="button" onClick={onDone} className="btn-secondary">
            volver
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="flex min-h-[70dvh] flex-col justify-between gap-6" data-testid="game-result">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">{state.cutByTimer ? "se acabó el tiempo" : "terminaste"}</p>
        {game.Result ? (
          <game.Result result={state.result} seed={activeSeed ?? seed ?? ""} cutByTimer={state.cutByTimer} />
        ) : (
          <p className="display-lg text-[7rem] text-tinta" data-testid="game-score">
            {game.formatScore ? game.formatScore(state.result.score) : state.result.score}
            {!game.formatScore && unit ? <span className="ml-2 text-3xl text-tinta-suave">{unit}</span> : null}
          </p>
        )}
        <p className="text-tinta-suave">{state.saved ? (resultNote ?? "quedó guardado.") : "partida de prueba: no se guardó."}</p>
      </div>
      {onDone ? (
        <button
          type="button"
          onClick={onDone}
          className="btn-primary"
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
