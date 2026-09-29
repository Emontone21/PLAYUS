// "pegándole al jota": memoria. En cada ronda aparece un número y el dibujo
// de una sustancia un rato corto; después el jota pregunta "¿cuánto querés,
// bro?" y hay que completar "___ de ___" de memoria. Acertar suma una ronda
// (con la pista más corta y números más largos); errar en cualquiera de las
// dos cosas enoja al jota y termina la partida. Gana el que acierta más.
//
// Es un juego de interfaz: DOM y los componentes de la app, con los dibujos
// en pixel art como SVG (SpriteSvg). La serie sale entera de la semilla
// (rounds.ts) y la traza es un evento por ronda respondida, con los tiempos
// medidos con performance.now() desde onReady; `validate` rearma la serie y
// revisa respuestas y tiempos.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { formatNumber, jotaRounds, SUBSTANCES, substanceName, type JotaRound, type SubstanceId } from "./rounds";
import { ACCEPT_HOLD_MS, check, DURATION_MS, ERROR_HOLD_MS, IMPATIENT_MS, isCorrect, MAX_SCORE, validate, type AnswerEvent } from "./rules";
import { jotaSprite, substanceSprite, type JotaFace } from "./sprites";

export interface JotaDevOptions {
  /** arrancar en esta ronda (1 en adelante); las anteriores se dan por acertadas */
  startRound?: number;
}

type Phase = { step: "pista"; round: JotaRound; until: number } | { step: "pregunta"; round: JotaRound; hiddenAt: number } | { step: "joya"; round: JotaRound } | { step: "error"; round: JotaRound; number: string; substance: string };

export function JotaGame({ seed, onReady, onFinish, onProgress, dev }: GameProps & { dev?: JotaDevOptions }) {
  const series = React.useMemo(() => jotaRounds(seed), [seed]);
  const startIndex = Math.max(0, Math.min(series.length - 1, (dev?.startRound ?? 1) - 1));
  const readyAt = React.useRef<number | null>(null);
  const events = React.useRef<AnswerEvent[]>([]);
  const score = React.useRef(0);
  const done = React.useRef(false);
  const timer = React.useRef<number | undefined>(undefined);
  const [phase, setPhase] = React.useState<Phase>({ step: "pista", round: series[startIndex]!, until: 0 });
  const [rounds, setRounds] = React.useState(startIndex);
  const [typed, setTyped] = React.useState("");
  const [picked, setPicked] = React.useState<SubstanceId | null>(null);
  const [impatient, setImpatient] = React.useState(false);
  const [now, setNow] = React.useState(0);
  const [reduced, setReduced] = React.useState(false);

  const elapsed = React.useCallback(() => (readyAt.current === null ? 0 : performance.now() - readyAt.current), []);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /** muestra la pista de la ronda `index` y programa que se oculte a los displayMs */
  const showRound = React.useCallback(
    (index: number) => {
      const round = series[index];
      if (!round) return;
      const start = elapsed();
      setTyped("");
      setPicked(null);
      setImpatient(false);
      setPhase({ step: "pista", round, until: start + round.displayMs });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setPhase({ step: "pregunta", round, hiddenAt: Math.round(elapsed()) });
      }, round.displayMs);
    },
    [series, elapsed],
  );

  // listo al montar: arranca la primera pista
  React.useEffect(() => {
    readyAt.current = performance.now();
    onProgress({ score: 0, events: [] });
    onReady();
    showRound(startIndex);
    return () => window.clearTimeout(timer.current);
  }, [onReady, onProgress, showRound, startIndex]);

  // la barra de la pista y el "bro?" se mueven con el reloj
  React.useEffect(() => {
    if (phase.step !== "pista" && phase.step !== "pregunta") return;
    let raf = 0;
    const tick = () => {
      const t = elapsed();
      setNow(t);
      if (phase.step === "pregunta" && t - phase.hiddenAt >= IMPATIENT_MS) setImpatient(true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, elapsed]);

  function order() {
    if (phase.step !== "pregunta" || done.current || !picked || typed.length === 0) return;
    const round = phase.round;
    const answeredAt = Math.round(elapsed());
    const ev: AnswerEvent = { round: round.round, hiddenAt: phase.hiddenAt, answeredAt, number: typed, substance: picked };
    events.current.push(ev);
    if (isCorrect(round, typed, picked)) {
      score.current++;
      setRounds(score.current + startIndex);
      onProgress({ score: score.current, events: [...events.current] });
      setPhase({ step: "joya", round });
      window.clearTimeout(timer.current);
      const next = series.indexOf(round) + 1;
      timer.current = window.setTimeout(() => showRound(next), ACCEPT_HOLD_MS);
    } else {
      done.current = true;
      const result: GameResult = { score: score.current, events: [...events.current] };
      onProgress(result);
      setPhase({ step: "error", round, number: typed, substance: picked });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => onFinish(result), ERROR_HOLD_MS);
    }
  }

  const face: JotaFace = phase.step === "error" ? "enojado" : phase.step === "joya" ? "contento" : impatient ? "impaciente" : "neutral";
  const bubble = phase.step === "error" ? "¿me estás jodiendo, bro?" : phase.step === "joya" ? "joya" : impatient ? "bro?" : "¿cuánto querés, bro?";
  const canOrder = phase.step === "pregunta" && typed.length > 0 && picked !== null;
  const shown = phase.step === "pista" ? Math.max(0, Math.min(1, (phase.until - now) / phase.round.displayMs)) : 0;

  return (
    <div className="flex h-full w-full select-none flex-col gap-3" style={{ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }} data-testid="jota-area" data-phase={phase.step} data-round={phase.round.round} data-score={score.current} data-face={face} onContextMenu={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between px-1">
        <span className="display text-xl text-tinta" data-testid="jota-round" aria-live="off">
          ronda {phase.round.round}
        </span>
        <span className="eyebrow" data-testid="jota-score">
          {rounds} {rounds === 1 ? "acierto" : "aciertos"}
        </span>
      </div>

      {phase.step === "pista" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4" data-testid="jota-hint">
          <p className="display-lg text-tinta" style={{ fontSize: "clamp(56px, 18vw, 84px)", fontVariantNumeric: "tabular-nums" }} data-testid="jota-hint-number">
            {formatNumber(phase.round.number)}
          </p>
          <SpriteSvg sprite={substanceSprite(phase.round.substance)} height={132} label="la sustancia" />
          <div className="h-1.5 w-2/3 overflow-hidden rounded-full" style={{ background: "var(--superficie-2)" }} aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${shown * 100}%`, background: "var(--rana)" }} data-testid="jota-hint-bar" />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center gap-3">
            <SpriteSvg sprite={jotaSprite(face)} height={80} label={`el jota, ${face}`} />
            <span className={phase.step === "error" ? "note-alert display text-lg" : "speech display text-lg"} role="status" data-testid="jota-bubble">
              {bubble}
            </span>
          </div>

          {phase.step === "error" ? (
            <div className="flex flex-col items-center gap-2 py-2" data-testid="jota-error">
              <p className="text-sm text-tinta-suave">era</p>
              <p className="display text-3xl text-tinta" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatNumber(phase.round.number)} de {substanceName(phase.round.substance)}
              </p>
              <p className="text-sm text-tinta-suave">
                pediste {phase.number.length ? formatNumber(Number(phase.number)) : "nada"} de {substanceName(phase.substance as SubstanceId)}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 display text-2xl text-tinta" data-testid="jota-answer">
                <span className="min-w-[5ch] rounded-lg px-3 py-1 text-center" style={{ background: "var(--superficie-2)", fontVariantNumeric: "tabular-nums", border: "2px solid var(--contorno)" }} data-testid="jota-typed">
                  {typed.length ? formatNumber(Number(typed)) : "___"}
                </span>
                <span className="text-tinta-media">de</span>
                <span className="min-w-[6ch] rounded-lg px-3 py-1 text-center" style={{ background: "var(--superficie-2)", border: "2px solid var(--contorno)" }} data-testid="jota-picked">
                  {picked ? substanceName(picked) : "___"}
                </span>
              </div>

              {/* teclado propio: nunca el del sistema */}
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="teclado" data-testid="jota-keypad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <Key key={d} label={d} onPress={() => phase.step === "pregunta" && setTyped((t) => (t.length < 9 ? t + d : t))} testId={`key-${d}`} />
                ))}
                <Key label="borrar" onPress={() => setTyped((t) => t.slice(0, -1))} testId="key-borrar" small />
                <Key label="0" onPress={() => phase.step === "pregunta" && setTyped((t) => (t.length < 9 ? t + "0" : t))} testId="key-0" />
                <button type="button" className="btn-primary-sm min-h-14 text-lg" disabled={!canOrder} onClick={order} data-testid="jota-order">
                  pedir
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="sustancias" data-testid="jota-grid">
                {SUBSTANCES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`flex min-h-14 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-xs ${picked === s.id ? "text-tinta" : "text-tinta-media"}`}
                    style={{ background: picked === s.id ? "var(--rana)" : "var(--superficie-2)", border: `2px solid ${picked === s.id ? "var(--contorno)" : "transparent"}`, color: picked === s.id ? "#0B1A12" : undefined }}
                    onClick={() => phase.step === "pregunta" && setPicked(s.id)}
                    aria-pressed={picked === s.id}
                    data-testid={`sub-${s.id}`}
                  >
                    <SpriteSvg sprite={substanceSprite(s.id)} height={30} />
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {reduced ? null : null}
    </div>
  );
}

function Key({ label, onPress, testId, small }: { label: string; onPress: () => void; testId: string; small?: boolean }) {
  return (
    <button type="button" className={`min-h-14 rounded-xl display ${small ? "text-base" : "text-2xl"} text-tinta`} style={{ background: "var(--superficie-2)", border: "2px solid var(--contorno)", fontVariantNumeric: "tabular-nums" }} onClick={onPress} data-testid={testId}>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// la pantalla previa y la de resultado
// ---------------------------------------------------------------------------

function Intro() {
  return (
    <div className="card card-c flex items-center gap-4" data-testid="jota-card">
      <SpriteSvg sprite={jotaSprite("neutral")} height={120} label="el jota: un canguro con capucha, gorra, lentes oscuros y riñonera" />
      <div className="flex flex-col gap-2">
        <span className="speech display text-lg">¿qué vas a llevar?</span>
        <p className="text-xs text-tinta-media">la pista dura cada vez menos y los números son cada vez más largos.</p>
      </div>
    </div>
  );
}

function Result({ result, seed, cutByTimer }: { result: GameResult; seed: string; cutByTimer: boolean }) {
  const v = React.useMemo(() => check(seed, result.events), [seed, result.events]);
  const angry = v.ok ? v.endedByError : !cutByTimer;
  return (
    <div className="flex flex-col items-center gap-3" data-testid="jota-result" data-reason={angry ? "error" : "tiempo"}>
      <SpriteSvg sprite={jotaSprite(angry ? "enojado" : "contento")} height={150} label="el jota" />
      <p className="display-lg text-tinta" style={{ fontSize: 88 }} data-testid="game-score">
        {result.score}
      </p>
      <p className="text-lg text-tinta-media">
        {result.score === 1 ? "ronda acertada" : "rondas acertadas"}. {angry ? "le erraste y se enojó." : "aguantaste los 3 minutos."}
      </p>
    </div>
  );
}

export const pegandoleAlJota: GameModule = {
  id: "pegandole-al-jota",
  name: "pegándole al jota",
  tagline: "acordate bien lo que pediste.",
  howTo: ["mirá el número y la sustancia antes de que desaparezcan", "cuando el jota pregunte, completá cuánto y qué", "si le errás en algo, se enoja y se termina"],
  durationMs: DURATION_MS,
  // se puede errar en la primera ronda: 3 s de pista, 0,7 s de respuesta, más la cuenta regresiva y el segundo de enojo
  minDurationMs: 5_000,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  Component: JotaGame,
  Intro,
  Result,
};
