"use client";

// Solo desarrollo: el eje, el límite de caída y los vectores dibujados como
// líneas sobre la losa; cámara lenta; saltos a los 500, 1.500 y 3.000 m (el
// conductor automático maneja hasta ahí); el conductor automático al
// volante; y el visor del modelo 3D con cámara libre. Deja las reglas en
// window.__sunny para el E2E.
// /dev/juego/pisteando-el-sunny?seed=…&desde=500&eje=1&lento=1&auto=1

import * as React from "react";
import { GameContainer } from "../container";
import type { GameModule, GameProps } from "../types";
import { SunnyGame, pisteandoElSunny, type SunnyDevOptions } from "./index";
import { autoTrace, check, generateCourse, simulate, validate } from "./rules";
import type { Spinner } from "./scene";

const JUMPS = [0, 500, 1500, 3000] as const;

export function SunnyDev({ seed, from = 0, overlay = false, slow = false, auto = false, hitboxes = false }: { seed: string; from?: number; overlay?: boolean; slow?: boolean; auto?: boolean; hitboxes?: boolean }) {
  const [opts, setOpts] = React.useState({ overlay, slow, auto, hitboxes });
  const [start, setStart] = React.useState(from);
  const [run, setRun] = React.useState(0);
  const optsRef = React.useRef<SunnyDevOptions>({});
  optsRef.current = { ...opts, startMeters: start };
  const course = React.useMemo(() => generateCourse(seed), [seed]);
  const angles = React.useMemo(() => {
    const deg = (a: number) => Math.round((a * 360) / 1024);
    const at = (lo: number, hi: number) => course.corners.filter((c) => c.at >= lo && c.at < hi).map((c) => deg(c.angle));
    const span = (arr: number[]) => (arr.length ? `${Math.min(...arr)}° a ${Math.max(...arr)}°` : "ninguna");
    return { a: span(at(0, 1000)), b: span(at(1000, 2000)), c: span(at(2000, 3000)), d: span(at(3000, 6000)) };
  }, [course]);

  const game = React.useMemo<GameModule>(() => {
    function DevSunny(p: GameProps) {
      return <SunnyGame {...p} dev={optsRef.current} />;
    }
    return { ...pisteandoElSunny, Component: DevSunny };
  }, []);

  React.useEffect(() => {
    (window as unknown as { __sunny: unknown }).__sunny = { generateCourse, simulate, autoTrace, check, validate };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="sunny-dev">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="herramientas">
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.overlay} onChange={(e) => setOpts((o) => ({ ...o, overlay: e.target.checked }))} data-testid="dev-overlay" />
          eje y vectores
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.hitboxes} onChange={(e) => setOpts((o) => ({ ...o, hitboxes: e.target.checked }))} data-testid="dev-hitboxes" />
          cajas de choque
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.slow} onChange={(e) => setOpts((o) => ({ ...o, slow: e.target.checked }))} data-testid="dev-slow" />
          ×0,25
        </label>
        <label className="chip flex items-center gap-1">
          <input type="checkbox" checked={opts.auto} onChange={(e) => setOpts((o) => ({ ...o, auto: e.target.checked }))} data-testid="dev-auto" />
          conductor automático
        </label>
        {JUMPS.map((m) => (
          <button
            key={m}
            type="button"
            className={m === start ? "btn-primary-sm" : "btn-secondary-sm"}
            onClick={() => {
              setStart(m);
              setRun((r) => r + 1);
            }}
            data-testid={`dev-from-${m}`}
          >
            desde {m} m
          </button>
        ))}
      </div>
      <p className="text-xs text-tinta-suave">
        los saltos usan el conductor automático hasta esos metros. Esta ruta tiene {course.corners.length} esquinas: {angles.a} hasta los 1.000 m, {angles.b} hasta los 2.000, {angles.c} hasta los 3.000 y {angles.d} después;{" "}
        {course.relax === 0 ? "ninguna necesitó ajuste" : `${course.relax} ${course.relax === 1 ? "ajuste" : "ajustes"} para que el conductor automático la complete`}. Obstáculos: {course.obstacles.length}
        {course.removed > 0 ? ` (${course.removed} sacados por el conductor automático)` : ""}.
      </p>
      <GameContainer key={run} game={game} seed={seed} autoStart={run > 0} onDone={() => setRun((r) => r + 1)} note="modo desarrollo: no consume intentos ni guarda nada." />
      <ModelViewer />
    </div>
  );
}

/** el sunny en 3D con cámara libre (arrastrar para girar, rueda para acercar) */
function ModelViewer() {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let viewer: Spinner | null = null;
    let disposed = false;
    import("./scene").then(async (mod) => {
      const v = await mod.createViewer(el);
      if (disposed) v.dispose();
      else viewer = v;
    });
    return () => {
      disposed = true;
      viewer?.dispose();
    };
  }, []);
  return (
    <div className="flex flex-col gap-2" data-testid="dev-viewer">
      <h2 className="display text-lg">el sunny en 3D (arrastrá para girarlo)</h2>
      <div ref={ref} className="w-full overflow-hidden rounded-lg" style={{ height: 320, background: "linear-gradient(180deg, #5FA8E6 0%, #C9E6FB 100%)", border: "3px solid var(--contorno)" }} />
    </div>
  );
}
