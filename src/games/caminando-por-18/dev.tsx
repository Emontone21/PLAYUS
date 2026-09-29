"use client";

// Solo desarrollo: cajas de toque, cámara lenta, saltos a los 20, 45 y 90 s,
// forzar a don pasta y cada tipo de pastoso por separado. Deja las reglas en
// window.__caminando para el E2E. /dev/juego/caminando-por-18?seed=…&desde=45&cajas=1&lento=1&donpasta=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { CaminandoGame, caminandoPor18, KIND_NAMES, type CaminandoDevOptions } from "./index";
import { check, generateStreet, perfectTrace, simulate, SUB, TICKS_PER_S, validate, type Pastoso } from "./rules";
import { drawKind } from "./draw";
import { FIELD_H, FIELD_W } from "./rules";
import { KINDS_ALL } from "./sprites";

const JUMPS = [0, 20, 45, 90] as const;

export function CaminandoDev({ seed, from = 0, hitboxes = false, slow = false, donpasta = false }: { seed: string; from?: number; hitboxes?: boolean; slow?: boolean; donpasta?: boolean }) {
  const [opts, setOpts] = React.useState({ hitboxes, slow, forceDonPasta: donpasta });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<CaminandoDevOptions>({});
  optsRef.current = { ...opts, startTick: start * TICKS_PER_S };

  const game = React.useMemo<GameModule>(() => {
    function DevCaminando(p: GameProps) {
      return <CaminandoGame {...p} dev={optsRef.current} />;
    }
    return { ...caminandoPor18, Component: DevCaminando };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __caminando: unknown }).__caminando = { generateStreet, simulate, perfectTrace, check, validate };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="caminando-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.hitboxes} onChange={(e) => setOpts((o) => ({ ...o, hitboxes: e.target.checked }))} data-testid="dev-hitboxes" />
          cajas
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        <label className="chip flex items-center gap-1">
          <input
            type="checkbox"
            checked={opts.forceDonPasta}
            onChange={(e) => {
              setOpts((o) => ({ ...o, forceDonPasta: e.target.checked }));
              setRun((r) => r + 1);
            }}
            data-testid="dev-donpasta"
          />
          don pasta ya
        </label>
        {JUMPS.map((s) => (
          <button
            key={s}
            type="button"
            className={s === start ? "btn-primary-sm" : "btn-secondary-sm"}
            onClick={() => {
              setStart(s);
              setRun((r) => r + 1);
            }}
            data-testid={`dev-from-${s}`}
          >
            desde {s} s
          </button>
        ))}
      </div>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <KindGallery />
    </div>
  );
}

/** cada tipo de pastoso solo en la calle, viniendo, para revisar el arte */
function KindGallery() {
  return (
    <div className="flex flex-col gap-2" data-testid="dev-kinds">
      <h2 className="display text-lg">los pastosos</h2>
      <div className="grid grid-cols-3 gap-2">
        {KINDS_ALL.map((kind) => (
          <KindCanvas key={kind} kind={kind} />
        ))}
      </div>
    </div>
  );
}

function KindCanvas({ kind }: { kind: (typeof KINDS_ALL)[number] }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const k = 2;
    c.width = FIELD_W * k;
    c.height = 60 * k;
    c.style.width = `${FIELD_W * k}px`;
    c.style.height = `${60 * k}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const p: Pastoso = { i: 0, kind, x: 45 * SUB, y: 36 * SUB, prevX: 45 * SUB, prevY: 36 * SUB, phase: "viene", hits: 0, sayUntil: 0, pushedUntil: 0, hitAt: -1, since: 0 };
    drawKind(ctx, p, k);
  }, [kind]);
  void FIELD_H;
  return (
    <figure className="flex flex-col items-center gap-1">
      <canvas ref={ref} className="max-w-full [image-rendering:pixelated]" style={{ border: "2px solid var(--contorno)", borderRadius: 6 }} data-testid={`dev-kind-${kind}`} />
      <figcaption className="text-xs text-tinta-suave">{KIND_NAMES[kind]}</figcaption>
    </figure>
  );
}
