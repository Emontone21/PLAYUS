import type { RankedEntry, StandingRow } from "./scoring";
import { standings } from "./scoring";
import { addDays, daysBetween, type DateString } from "./time";

// La gráfica de la temporada: datos y geometría puros (sin DOM ni React),
// compartidos por el servidor (que arma las series), el componente SVG y
// los tests. Cada integrante tiene una serie de colillas acumuladas al cierre
// de cada día ya terminado, desde el día que entró al grupo.

/** ocho colores que se distinguen sobre --fondo; --agua queda reservado para "vos" */
export const SERIES_COLORS: readonly string[] = ["#FFD34E", "#FF6F91", "#8EDC66", "#C58CFF", "#FF9F43", "#4D8DFF", "#F2EFE4", "#FF5252"];

/** el color de un integrante según su orden de ingreso al grupo (estable entre recargas) */
export function colorFor(joinIndex: number): string {
  return SERIES_COLORS[((joinIndex % SERIES_COLORS.length) + SERIES_COLORS.length) % SERIES_COLORS.length]!;
}

export interface MemberSeries {
  profileId: string;
  name: string;
  color: string;
  /** índice del día (desde el primero de la temporada) en que arranca la línea */
  startDay: number;
  /** colillas acumuladas al cierre de cada día desde startDay hasta el último cerrado */
  values: number[];
  /** colillas al último día cerrado */
  total: number;
  wins: number;
}

export interface SeasonSeries {
  /** todos los días de la temporada, del primero al último */
  days: DateString[];
  /** índice del último día cerrado (−1 si todavía no cerró ninguno) */
  lastClosed: number;
  /** índice del día de hoy dentro de la temporada (null si quedó afuera) */
  todayIndex: number | null;
  series: MemberSeries[];
  standings: StandingRow[];
  /** subida o bajada de puesto respecto del día anterior al último cerrado */
  trend: Record<string, "up" | "down" | null>;
}

export interface SeriesInput {
  startsOn: DateString;
  endsOn: DateString;
  today: DateString;
  /** las rondas ya rankeadas, por fecha (solo se usan las de días cerrados) */
  rounds: readonly { playDate: DateString; ranked: RankedEntry[] }[];
  /** los integrantes, con la fecha (local del grupo) en que entraron, en orden de ingreso */
  members: readonly { profileId: string; name: string; joinedOn: DateString }[];
  /** la temporada ya cerró: todos sus días cuentan */
  closed?: boolean;
}

/** Arma las series: un día cerrado es anterior a hoy (o cualquiera, si la temporada cerró). */
export function buildSeasonSeries(input: SeriesInput): SeasonSeries {
  const total = daysBetween(input.startsOn, input.endsOn) + 1;
  const days = Array.from({ length: Math.max(0, total) }, (_, i) => addDays(input.startsOn, i));
  const todayIdx = daysBetween(input.startsOn, input.today);
  const todayIndex = todayIdx >= 0 && todayIdx < days.length ? todayIdx : null;
  const lastClosed = input.closed ? days.length - 1 : Math.min(days.length - 1, todayIdx - 1);

  const byDate = new Map(input.rounds.map((r) => [r.playDate, r.ranked]));
  const closedRounds: RankedEntry[][] = [];
  const perDay: Map<string, number>[] = [];
  const acc = new Map<string, number>();
  for (let d = 0; d <= lastClosed; d++) {
    const ranked = byDate.get(days[d]!) ?? [];
    closedRounds.push(ranked);
    for (const e of ranked) acc.set(e.profileId, (acc.get(e.profileId) ?? 0) + e.points);
    perDay.push(new Map(acc));
  }
  const table = standings(closedRounds);
  const before = standings(closedRounds.slice(0, -1));
  const rankBefore = new Map(before.map((r) => [r.profileId, r.rank]));
  const trend: Record<string, "up" | "down" | null> = {};
  for (const r of table) {
    const prev = rankBefore.get(r.profileId);
    trend[r.profileId] = prev === undefined || prev === r.rank ? null : prev > r.rank ? "up" : "down";
  }

  const series: MemberSeries[] = input.members.map((m, i) => {
    const startDay = Math.max(0, Math.min(days.length - 1, daysBetween(input.startsOn, m.joinedOn)));
    const values: number[] = [];
    for (let d = startDay; d <= lastClosed; d++) values.push(perDay[d]!.get(m.profileId) ?? 0);
    const row = table.find((r) => r.profileId === m.profileId);
    return { profileId: m.profileId, name: m.name, color: colorFor(i), startDay, values, total: row?.points ?? 0, wins: row?.wins ?? 0 };
  });

  return { days, lastClosed, todayIndex, series, standings: table, trend };
}

// ---------------------------------------------------------------------------
// geometría
// ---------------------------------------------------------------------------

/**
 * Pendientes de la interpolación monótona (Fritsch–Carlson): entre dos puntos
 * la curva nunca se sale del intervalo de sus valores, así un acumulado que
 * no baja tampoco baja en la curva.
 */
export function monotoneSlopes(xs: readonly number[], ys: readonly number[]): number[] {
  const n = xs.length;
  if (n < 2) return new Array(n).fill(0);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1]! - xs[i]!;
    d.push(h === 0 ? 0 : (ys[i + 1]! - ys[i]!) / h);
  }
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d[i]!;
    const b = m[i + 1]! / d[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i]!;
      m[i + 1] = t * b * d[i]!;
    }
  }
  return m;
}

/** la curva evaluada en x (Hermite cúbica con las pendientes monótonas); fuera del rango, el extremo */
export function monotoneAt(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (n === 0) return 0;
  if (n === 1 || x <= xs[0]!) return ys[0]!;
  if (x >= xs[n - 1]!) return ys[n - 1]!;
  const m = monotoneSlopes(xs, ys);
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]!) i++;
  const h = xs[i + 1]! - xs[i]!;
  const t = (x - xs[i]!) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * ys[i]! + h10 * h * m[i]! + h01 * ys[i + 1]! + h11 * h * m[i + 1]!;
}

/** el path SVG de la curva por los puntos (en coordenadas de pantalla), con cúbicas de Bézier equivalentes a la Hermite */
export function monotonePath(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${fmt(points[0]![0])} ${fmt(points[0]![1])}`;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const m = monotoneSlopes(xs, ys);
  let d = `M${fmt(xs[0]!)} ${fmt(ys[0]!)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const h = xs[i + 1]! - xs[i]!;
    const c1x = xs[i]! + h / 3;
    const c1y = ys[i]! + (m[i]! * h) / 3;
    const c2x = xs[i + 1]! - h / 3;
    const c2y = ys[i + 1]! - (m[i + 1]! * h) / 3;
    d += ` C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(xs[i + 1]!)} ${fmt(ys[i + 1]!)}`;
  }
  return d;
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** marcas redondas del eje Y: de 0 a un poco más que el máximo, 3 o 4 marcas (contando el 0) */
export function niceTicks(max: number): number[] {
  const target = Math.max(1, max) * 1.1;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  for (const step of steps) {
    const count = Math.ceil(target / step);
    if (count >= 2 && count <= 3) return Array.from({ length: count + 1 }, (_, i) => i * step);
  }
  const step = steps[steps.length - 1]!;
  const count = Math.ceil(target / step);
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

const ORDINALS = ["primero", "segundo", "tercero", "cuarto", "quinto", "sexto", "séptimo", "octavo", "noveno", "décimo"];

/** "Larry va primero con 173 colillas, Daño Remar segundo con 171…" */
export function seriesSummary(series: readonly MemberSeries[], table: readonly StandingRow[]): string {
  if (table.length === 0) return "todavía no cerró ningún día: la gráfica está vacía.";
  const byId = new Map(series.map((s) => [s.profileId, s]));
  const parts = table.map((r, i) => {
    const name = byId.get(r.profileId)?.name ?? "alguien";
    const ord = ORDINALS[r.rank - 1] ?? `${r.rank}.º`;
    return `${name} ${i === 0 ? "va " : ""}${ord} con ${r.points} ${r.points === 1 ? "colilla" : "colillas"}`;
  });
  return `${parts.join(", ")}.`;
}

/** "27 set" (sin el día de la semana) */
export function shortDay(date: DateString): string {
  return new Intl.DateTimeFormat("es-UY", { timeZone: "UTC", day: "numeric", month: "short" })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(/\.$/, "")
    .replace(" de ", " ");
}
