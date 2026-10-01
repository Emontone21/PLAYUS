"use client";

import * as React from "react";
import { monotonePath, niceTicks, shortDay, type MemberSeries } from "@/lib/chart";
import { formatShortDate } from "@/lib/time";
import { Frog } from "@/components/frog/Frog";
import { Colilla } from "@/components/colilla";

// La gráfica de la temporada: SVG propio, una línea por integrante con las
// colillas acumuladas al cierre de cada día. Tocar o arrastrar muestra el día
// y una ficha con las colillas de cada uno. Sin animación (decisión 216).

export interface SeasonChartProps {
  days: string[];
  lastClosed: number;
  todayIndex: number | null;
  series: MemberSeries[];
  myId: string;
  label: string;
}

const H = 230;
const PAD = { top: 12, right: 14, bottom: 28, left: 36 };

export function SeasonChart({ days, lastClosed, todayIndex, series, myId, label }: SeasonChartProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(360);
  const [hover, setHover] = React.useState<number | null>(null);
  const pointerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = days.length;
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = series.reduce((m, s) => Math.max(m, ...s.values), 0);
  // sin datos, un eje de muestra (hasta 60: lo que suman dos días ganados)
  const ticks = niceTicks(max > 0 ? max : 50);
  const top = ticks[ticks.length - 1]!;
  const x = (d: number) => PAD.left + (n <= 1 ? 0 : (d / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const empty = lastClosed < 0 || series.every((s) => s.values.length === 0);

  const dayAt = (clientX: number): number | null => {
    const el = wrapRef.current;
    if (!el || empty) return null;
    const r = el.getBoundingClientRect();
    const d = Math.round(((clientX - r.left - PAD.left) / innerW) * (n - 1));
    return Math.max(0, Math.min(lastClosed, d));
  };
  function down(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pointerRef.current !== null) return;
    pointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setHover(dayAt(e.clientX));
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    if (pointerRef.current !== e.pointerId) return;
    setHover(dayAt(e.clientX));
  }
  function up(e: React.PointerEvent<SVGSVGElement>) {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    setHover(null);
  }

  // las líneas: las demás primero, la tuya encima
  const ordered = [...series.filter((s) => s.profileId !== myId), ...series.filter((s) => s.profileId === myId)];
  const hoverRows =
    hover === null
      ? []
      : series
          .filter((s) => s.startDay <= hover && hover - s.startDay < s.values.length)
          .map((s) => ({ ...s, at: s.values[hover - s.startDay]! }))
          .sort((a, b) => b.at - a.at);
  const tipLeft = hover === null ? 0 : Math.max(0, Math.min(width - 190, x(hover) - 95));

  return (
    <div ref={wrapRef} className="relative w-full" data-testid="season-chart" data-days={lastClosed + 1}>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width={width}
        height={H}
        role="img"
        aria-label={label}
        className="block select-none"
        style={{ touchAction: "pan-y", fontVariantNumeric: "tabular-nums" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
      >
        {/* el eje Y: marcas redondas con una guía tenue */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--punteado)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--tinta-suave)" className="display">
              {t}
            </text>
          </g>
        ))}
        {/* el eje X: una marca cada 5 días, la fecha de inicio y de fin */}
        <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="var(--tinta-suave)" strokeWidth={1} />
        {days.map((_, d) =>
          d % 5 === 0 || d === n - 1 ? <line key={d} x1={x(d)} x2={x(d)} y1={PAD.top + innerH} y2={PAD.top + innerH + 4} stroke="var(--tinta-suave)" strokeWidth={1} /> : null,
        )}
        {n > 0 ? (
          <>
            <text x={x(0)} y={H - 8} textAnchor="start" fontSize={11} fill="var(--tinta-suave)" className="display">
              {shortDay(days[0]!)}
            </text>
            <text x={x(n - 1)} y={H - 8} textAnchor="end" fontSize={11} fill="var(--tinta-suave)" className="display">
              {shortDay(days[n - 1]!)}
            </text>
          </>
        ) : null}
        {/* hoy */}
        {todayIndex !== null ? <line x1={x(todayIndex)} x2={x(todayIndex)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--tinta-suave)" strokeWidth={1} strokeDasharray="2 4" opacity={0.6} data-testid="chart-today" /> : null}
        {/* las líneas */}
        {ordered.map((s) => {
          if (s.values.length === 0) return null;
          const me = s.profileId === myId;
          const pts = s.values.map((v, i) => [x(s.startDay + i), y(v)] as const);
          const last = pts[pts.length - 1]!;
          return (
            <g key={s.profileId} data-testid="chart-line" data-profile={s.profileId} data-me={me ? "1" : undefined}>
              <path d={monotonePath(pts)} fill="none" stroke={s.color} strokeWidth={me ? 3.5 : 2} strokeLinecap="round" strokeLinejoin="round" />
              {pts.map(([px, py], i) => (
                <circle key={i} cx={px} cy={py} r={i === pts.length - 1 ? (me ? 5 : 4) : 2} fill={s.color} stroke={i === pts.length - 1 && me ? "var(--agua)" : "none"} strokeWidth={2.5} />
              ))}
              <title>{`${s.name}: ${s.total} colillas`}</title>
              {void last}
            </g>
          );
        })}
        {/* el día tocado */}
        {hover !== null ? (
          <g data-testid="chart-cursor">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--tinta)" strokeWidth={1.5} />
            {hoverRows.map((r) => (
              <circle key={r.profileId} cx={x(hover)} cy={y(r.at)} r={4} fill={r.color} stroke="var(--fondo)" strokeWidth={1.5} />
            ))}
          </g>
        ) : null}
      </svg>
      {empty ? (
        <div className="pointer-events-none absolute inset-x-0 top-6 flex items-center justify-center gap-3 px-6" data-testid="chart-empty">
          <Frog pose="dormida" size={72} tilt={-8} />
          <p className="max-w-[220px] text-sm text-tinta-suave">la gráfica arranca a medianoche, cuando cierre el primer día jugado.</p>
        </div>
      ) : null}
      {hover !== null ? (
        <div className="pointer-events-none absolute top-1 w-[190px] rounded-xl px-3 py-2 text-xs" style={{ left: tipLeft, background: "var(--superficie-2)", border: "2px solid var(--contorno)", boxShadow: "3px 4px 0 var(--contorno)" }} data-testid="chart-tooltip">
          <p className="display text-sm text-tinta">{formatShortDate(days[hover]!)}</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {hoverRows.map((r) => (
              <li key={r.profileId} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" />
                <span className={`min-w-0 flex-1 truncate ${r.profileId === myId ? "text-agua" : "text-tinta-media"}`}>{r.name}</span>
                <span className="display text-tinta">{r.at}</span>
                <Colilla size={10} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
