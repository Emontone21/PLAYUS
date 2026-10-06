"use client";

// Solo desarrollo: la serie completa de pedidos con sus capas y tiempos,
// saltos al pedido 1, 5, 10 y 15 (el jugador automático arma los
// anteriores), los 9 íconos en grande y en tamaño de botón, las caras de
// Larry y las frases de Big Bro. Deja las reglas en window.__larryhdp para el E2E.
// /dev/juego/larry-en-la-hdp?seed=…&desde=10

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { bigBroSprite } from "../lib/big-bro";
import { larrySprite } from "../lib/larry";
import { broPose, LarryHdpGame, larryEnLaHdp, type LarryHdpDevOptions } from "./index";
import { botTrace, burgerPoints, check, INGREDIENTS, larryOrders, LINES, MODEL, NAMES, validate } from "./rules";
import { iconSprite } from "./sprites";

const JUMPS = [1, 5, 10, 15] as const;
const FACES = [
  ["normal", "esperando"],
  ["feliz", "contento (comiendo)"],
  ["asco", "asco"],
  ["bajon", "bajón"],
] as const;

export function LarryHdpDev({ seed, from = 1 }: { seed: string; from?: number }) {
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<LarryHdpDevOptions>({});
  optsRef.current = { startOrder: start };
  const orders = React.useMemo(() => larryOrders(seed), [seed]);

  const game = React.useMemo<GameModule>(() => {
    function DevLarryHdp(p: GameProps) {
      return <LarryHdpGame {...p} dev={optsRef.current} />;
    }
    return { ...larryEnLaHdp, Component: DevLarryHdp };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __larryhdp: unknown }).__larryhdp = { larryOrders, botTrace, check, validate, burgerPoints, MODEL };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="larryhdp-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        {JUMPS.map((n) => (
          <button
            key={n}
            type="button"
            className={n === start ? "btn-primary-sm" : "btn-secondary-sm"}
            onClick={() => {
              setStart(n);
              setRun((r) => r + 1);
            }}
            data-testid={`dev-from-${n}`}
          >
            pedido {n}
          </button>
        ))}
      </div>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <details className="panel" data-testid="dev-orders">
        <summary className="display-bold cursor-pointer text-tinta">los {orders.length} pedidos de esta semilla</summary>
        <ol className="flex flex-col gap-1">
          {orders.map((o, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-tinta-suave" data-testid="dev-order">
              <span className="w-24 shrink-0">
                {i + 1}. {o.layers.length - 2} del medio · {o.viewMs} ms
              </span>
              <span className="flex flex-wrap items-center gap-0.5">
                {o.layers.map((l, j) => (
                  <SpriteSvg key={j} sprite={iconSprite(l)} height={20} label={NAMES[l]} />
                ))}
              </span>
            </li>
          ))}
        </ol>
      </details>
      <div className="flex flex-wrap items-end gap-3" data-testid="dev-icons">
        {INGREDIENTS.map((ing) => (
          <div key={ing} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={iconSprite(ing)} height={96} label={`${NAMES[ing]} en grande`} />
            <div className="flex h-[96px] w-[96px] flex-col items-center justify-center gap-1 bg-superficie-2" style={{ border: "3px solid var(--contorno)", borderRadius: "16px 16px 16px 6px" }}>
              <SpriteSvg sprite={iconSprite(ing)} height={48} />
              <span className="text-xs text-tinta-media">{NAMES[ing]}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4" data-testid="dev-faces">
        {FACES.map(([face, text]) => (
          <div key={face} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={larrySprite(face)} height={88} label={`Larry ${text}`} />
            <span className="text-xs text-tinta-suave">{text}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4" data-testid="dev-bro">
        {[LINES.start, LINES.streak, LINES.error, LINES.queue].map((line) => (
          <div key={line} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={bigBroSprite(broPose(line))} height={64} label={`Big Bro: ${line}`} />
            <span className="text-xs text-tinta-suave">{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
