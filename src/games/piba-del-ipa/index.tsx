// "encontrá a la piba del IPA": un mapa lleno de gente en pixel art; hay que
// tocar a la única con boina negra con estrella roja y pucho en la boca. Cada
// acierto trae un mapa más lleno. Dura 60 s: el contenedor corta y usa el
// último parcial que informamos con onProgress.
//
// Hooks como React.useState (decisión 8): el servidor importa este módulo.

import * as React from "react";
import type { GameModule, GameProps, GameResult } from "../types";
import { generateMap, MAP_H, MAP_W, type GameMap } from "./map";
import { drawMap, scaleFor } from "./draw";
import { personPixels, BERET_BLACK, SPRITE_H, SPRITE_W, type Look } from "./sprites";
import { applyTap, DURATION_MS, initialState, MAP_START_LOCK_MS, MAX_SCORE, validate, type SimState, type TapEvent } from "./rules";

const FOUND_FLASH_MS = 500;
const SMOKE_TICK_MS = 400;

type Notice = { kind: "acierto" | "error"; until: number } | null;

function PibaDelIpa({ seed, onReady, onProgress }: GameProps) {
  const areaRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const sim = React.useRef<SimState>(initialState());
  const events = React.useRef<TapEvent[]>([]);
  const readyAt = React.useRef<number | null>(null);
  const maps = React.useRef(new Map<number, GameMap>());
  const [shownMap, setShownMap] = React.useState(1);
  const [found, setFound] = React.useState(0);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [smoke, setSmoke] = React.useState(0);
  const [k, setK] = React.useState(1);
  const [reduced, setReduced] = React.useState(false);

  const mapFor = React.useCallback(
    (i: number) => {
      let m = maps.current.get(i);
      if (!m) {
        m = generateMap(seed, i);
        maps.current.set(i, m);
      }
      return m;
    },
    [seed],
  );

  // reducir movimiento: el humo queda quieto
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // tamaño: escalado entero ajustado a devicePixelRatio, centrado
  React.useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => {
      const r = area.getBoundingClientRect();
      setK(scaleFor(r.width, r.height, window.devicePixelRatio || 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);

  // dibujar cada vez que cambia algo visible
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = MAP_W * k;
    canvas.height = MAP_H * k;
    canvas.style.width = `${(MAP_W * k) / dpr}px`;
    canvas.style.height = `${(MAP_H * k) / dpr}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawMap(ctx, mapFor(shownMap), k, { smokeFrame: reduced ? 1 : smoke, flashPiba: notice?.kind === "acierto" });
  }, [k, shownMap, smoke, reduced, notice, mapFor]);

  // el humo sube despacito
  React.useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setSmoke((f) => (f + 1) % 3), SMOKE_TICK_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  // listo al montar: el cronómetro arranca acá; un corte sin toques vale 0
  React.useEffect(() => {
    readyAt.current = performance.now();
    onProgress({ score: 0, events: [] });
    onReady();
  }, [onReady, onProgress]);

  // los carteles se apagan solos; al apagarse el de acierto aparece el mapa nuevo
  React.useEffect(() => {
    if (!notice) return;
    const wait = Math.max(0, notice.until - (performance.now() - (readyAt.current ?? 0)));
    const id = window.setTimeout(() => {
      setNotice(null);
      setShownMap(sim.current.map);
    }, wait);
    return () => window.clearTimeout(id);
  }, [notice]);

  function tap(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || readyAt.current === null) return;
    const t = Math.round(performance.now() - readyAt.current);
    const s = sim.current;
    // mientras aparece un mapa (y durante el cartel de acierto) no se toma el toque
    if (t < s.shownAt + MAP_START_LOCK_MS) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * MAP_W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * MAP_H);
    const ev: TapEvent = { t, map: s.map, x, y };
    // se registran todos los toques, incluidos los ignorados por el bloqueo
    events.current.push(ev);
    const outcome = applyTap(s, ev, mapFor);
    if (outcome === "acierto") {
      setFound(s.score);
      setNotice({ kind: "acierto", until: t + FOUND_FLASH_MS });
    } else if (outcome === "error") {
      setNotice({ kind: "error", until: s.lockedUntil });
    }
    const result: GameResult = { score: s.score, events: [...events.current] };
    onProgress(result);
  }

  const locked = notice?.kind === "error";

  return (
    <div className="flex h-full w-full select-none flex-col gap-2" data-testid="piba-area" data-map={shownMap} data-found={found}>
      <div className="flex items-center justify-between px-1">
        <span className="display text-xl text-tinta" data-testid="piba-count">
          {found} {found === 1 ? "encontrada" : "encontradas"}
        </span>
        <span className="eyebrow">mapa {shownMap}</span>
      </div>
      <div ref={areaRef} className="relative flex min-h-0 flex-1 items-center justify-center">
        <canvas
          ref={canvasRef}
          onPointerDown={tap}
          className="touch-none [image-rendering:pixelated]"
          style={{ border: "3px solid var(--contorno)", borderRadius: 8, opacity: locked ? 0.45 : 1, transition: "opacity 120ms" }}
          aria-label="mapa"
          role="img"
        />
        {notice ? (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-6">
            <span className={notice.kind === "acierto" ? "note-ok display text-xl" : "note-alert display text-xl"} role="status" data-testid="piba-notice">
              {notice.kind === "acierto" ? "¡la encontraste!" : "esa no es"}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// la ficha "así es ella" de la pantalla previa, con el mismo dibujo del juego
// ---------------------------------------------------------------------------

export const PIBA_LOOK: Look = {
  skin: "#D9A06B",
  hair: "largo",
  hairColor: "#2B1B12",
  shirt: "#3FAE6A",
  pants: "#2E3A59",
  head: "boina",
  headColor: BERET_BLACK,
  star: true,
  cig: true,
};

/** una persona en SVG, nítida a cualquier tamaño (para la ficha y la hoja de sprites) */
export function SpriteSvg({ look, size = 72, smokeFrame = 1, label }: { look: Look; size?: number; smokeFrame?: number; label?: string }) {
  const px = personPixels(look, smokeFrame);
  return (
    <svg
      viewBox={`0 0 ${SPRITE_W} ${SPRITE_H}`}
      width={(size * SPRITE_W) / SPRITE_H}
      height={size}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {px.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={1} height={1} fill={p.c} />
      ))}
    </svg>
  );
}

function PibaIntro() {
  return (
    <div className="card card-c flex items-center gap-4" data-testid="piba-card">
      <SpriteSvg look={PIBA_LOOK} size={104} label="la piba del IPA" />
      <div className="flex flex-col gap-1">
        <p className="text-sm text-rana">así es ella</p>
        <ul className="flex flex-col gap-1 text-sm text-tinta-media">
          <li>boina negra con estrella roja</li>
          <li>pucho en la boca, con humo</li>
          <li>las dos cosas juntas: las demás tienen una sola</li>
        </ul>
      </div>
    </div>
  );
}

export const pibaDelIpa: GameModule = {
  id: "piba-del-ipa",
  name: "encontrá a la piba del IPA",
  tagline: "boina, pucho y ni una pista más.",
  howTo: [
    "tocá a la piba: boina negra con estrella y pucho en la boca",
    "cada vez que la encontrás aparece otro mapa, más lleno",
    "si tocás a otra persona, te quedás 2 segundos sin poder tocar",
  ],
  durationMs: DURATION_MS,
  scoring: "high",
  minPlausibleScore: 0,
  maxPlausibleScore: MAX_SCORE,
  validate,
  Component: PibaDelIpa,
  Intro: PibaIntro,
};
