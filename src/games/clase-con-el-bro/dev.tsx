"use client";

// Solo desarrollo: los vértices de cada objeto, la recta 50/50 del
// resolvedor, las áreas de cada lado mientras se arrastra, saltos a cualquiera
// de los 3 cortes, las tres caras de Big Bro y las seis comidas. Deja las
// reglas en window.__clase para el E2E.
// /dev/juego/clase-con-el-bro?seed=…&vertices=1&resolver=1&areas=1&desde=2

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SpriteSvg } from "../lib/sprite-svg";
import { ClaseGame, claseConElBro, type ClaseDevOptions } from "./index";
import { svgPoints } from "./draw";
import { botTrace, check, CUTS, evaluateCut, generateObjects, initialState, applyCut, shiftLine, solveCut, splitAreas, validate } from "./rules";
import { placeShape, SHAPES } from "./shapes";
import { broSprite, type Mood } from "./sprites";

const MOODS: [Mood, string][] = [
  ["espera", "esperando"],
  ["contento", "Despegado"],
  ["enojado", "Sos un sopa bro"],
];

export function ClaseDev({ seed, from = 0, vertices = false, solver = false, areas = false }: { seed: string; from?: number; vertices?: boolean; solver?: boolean; areas?: boolean }) {
  const [opts, setOpts] = React.useState({ vertices, solver, areas });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<ClaseDevOptions>({});
  optsRef.current = { ...opts, startCut: start };
  const objects = React.useMemo(() => generateObjects(seed), [seed]);
  const solutions = React.useMemo(() => objects.map((o) => solveCut(o.verts)), [objects]);

  const game = React.useMemo<GameModule>(() => {
    function DevClase(p: GameProps) {
      return <ClaseGame {...p} dev={optsRef.current} />;
    }
    return { ...claseConElBro, Component: DevClase };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __clase: unknown }).__clase = { generateObjects, solveCut, evaluateCut, splitAreas, botTrace, check, validate, initialState, applyCut, shiftLine, placeShape, shapes: SHAPES };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="clase-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.vertices} onChange={(e) => setOpts((o) => ({ ...o, vertices: e.target.checked }))} data-testid="dev-vertices" />
          vértices
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.solver} onChange={(e) => setOpts((o) => ({ ...o, solver: e.target.checked }))} data-testid="dev-solver" />
          recta 50/50
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.areas} onChange={(e) => setOpts((o) => ({ ...o, areas: e.target.checked }))} data-testid="dev-areas-toggle" />
          áreas al arrastrar
        </label>
        {Array.from({ length: CUTS }, (_, i) => (
          <button
            key={i}
            type="button"
            className={i === start ? "btn-primary-sm" : "btn-secondary-sm"}
            onClick={() => {
              setStart(i);
              setRun((r) => r + 1);
            }}
            data-testid={`dev-from-${i}`}
          >
            corte {i + 1}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-4" data-testid="dev-faces">
        {MOODS.map(([mood, text]) => (
          <div key={mood} className="flex flex-col items-center gap-1">
            <SpriteSvg sprite={broSprite(mood)} height={72} label={`Big Bro ${text}`} />
            <span className="text-xs text-tinta-suave">{text}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3" data-testid="dev-shapes">
        {SHAPES.map((s) => (
          <div key={s.id} className="flex flex-col items-center gap-1">
            <svg viewBox="0 0 10000 10000" width={56} height={56} role="img" aria-label={s.name}>
              <polygon points={svgPoints(placeShape(s.verts, 0, 100), 10000)} fill={s.fill} stroke="#141414" strokeWidth="150" />
            </svg>
            <span className="text-[10px] text-tinta-suave">
              {s.name} ({s.level})
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-tinta-suave" data-testid="dev-objects">
        {objects.map((o, i) => `corte ${i + 1}: ${o.shape} (${o.level}), ${o.rotation}°, ${o.scale} %; recta 50/50 de (${solutions[i]!.line.x1}, ${solutions[i]!.line.y1}) a (${solutions[i]!.line.x2}, ${solutions[i]!.line.y2}), puntaje ${solutions[i]!.score}`).join(". ")}.
      </p>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
    </div>
  );
}
