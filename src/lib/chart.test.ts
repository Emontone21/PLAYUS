import { describe, expect, it } from "vitest";
import { buildSeasonSeries, colorFor, monotoneAt, monotonePath, monotoneSlopes, niceTicks, SERIES_COLORS, seriesSummary, shortDay } from "./chart";
import { rankRound } from "./scoring";

const r = (scores: Record<string, number>) => rankRound(Object.entries(scores).map(([profileId, bestScore]) => ({ profileId, bestScore })), "high");

describe("la interpolación monótona", () => {
  it("entre dos puntos nunca da un valor menor que el anterior ni mayor que el siguiente", () => {
    const xs = [0, 1, 2, 3, 4, 5, 6];
    const ys = [0, 25, 25, 45, 45, 45, 70];
    for (let i = 0; i < xs.length - 1; i++) {
      for (let k = 0; k <= 20; k++) {
        const x = xs[i]! + ((xs[i + 1]! - xs[i]!) * k) / 20;
        const y = monotoneAt(xs, ys, x);
        expect(y).toBeGreaterThanOrEqual(ys[i]! - 1e-9);
        expect(y).toBeLessThanOrEqual(ys[i + 1]! + 1e-9);
      }
    }
    // y la curva pasa exactamente por los puntos
    xs.forEach((x, i) => expect(monotoneAt(xs, ys, x)).toBeCloseTo(ys[i]!, 9));
  });

  it("en un tramo plano la pendiente es 0 en los dos extremos", () => {
    const m = monotoneSlopes([0, 1, 2, 3], [0, 10, 10, 30]);
    expect(m[1]).toBe(0);
    expect(m[2]).toBe(0);
  });

  it("el path arranca con M y sigue con cúbicas; con un punto, solo M", () => {
    expect(monotonePath([[0, 100], [10, 80], [20, 80]])).toMatch(/^M0 100 C[\d. -]+ C[\d. -]+$/);
    expect(monotonePath([[3, 4]])).toBe("M3 4");
    expect(monotonePath([])).toBe("");
  });
});

describe("las marcas del eje", () => {
  it("van de 0 a un poco más que el máximo, con 3 o 4 marcas redondas", () => {
    for (const max of [1, 7, 25, 48, 90, 173, 260, 999, 4000]) {
      const t = niceTicks(max);
      expect(t[0]).toBe(0);
      expect(t.length).toBeGreaterThanOrEqual(3);
      expect(t.length).toBeLessThanOrEqual(4);
      expect(t[t.length - 1]).toBeGreaterThanOrEqual(max);
    }
    expect(niceTicks(173)).toEqual([0, 100, 200]);
    expect(niceTicks(48)).toEqual([0, 20, 40, 60]);
  });

  it("fechas cortas: 27 set, 26 oct", () => {
    expect(shortDay("2026-09-27")).toBe("27 set");
    expect(shortDay("2026-10-26")).toBe("26 oct");
  });
});

describe("las series de la temporada", () => {
  const base = {
    startsOn: "2026-09-27",
    endsOn: "2026-10-26",
    today: "2026-10-01",
    members: [
      { profileId: "a", name: "Larry", joinedOn: "2026-09-27" },
      { profileId: "b", name: "Daño", joinedOn: "2026-09-27" },
      { profileId: "c", name: "Tarde", joinedOn: "2026-09-29" },
    ],
    rounds: [
      { playDate: "2026-09-27", ranked: r({ a: 10, b: 5 }) }, // a 25, b 20
      { playDate: "2026-09-28", ranked: r({ b: 10, a: 5 }) }, // b 25, a 20
      { playDate: "2026-09-29", ranked: r({ a: 10, b: 9, c: 1 }) }, // a 25, b 20, c 16
      { playDate: "2026-09-30", ranked: r({ c: 10, a: 1 }) }, // c 25, a 20
      { playDate: "2026-10-01", ranked: r({ c: 10 }) }, // hoy: no cuenta
    ],
  };

  it("todos los días de la temporada, el último cerrado es ayer y hoy tiene su índice", () => {
    const s = buildSeasonSeries(base);
    expect(s.days.length).toBe(30);
    expect(s.days[0]).toBe("2026-09-27");
    expect(s.days[29]).toBe("2026-10-26");
    expect(s.lastClosed).toBe(3);
    expect(s.todayIndex).toBe(4);
  });

  it("acumula por día y el día de hoy no aparece", () => {
    const s = buildSeasonSeries(base);
    const a = s.series.find((x) => x.profileId === "a")!;
    expect(a.values).toEqual([25, 45, 70, 90]);
    expect(a.total).toBe(90);
    const c = s.series.find((x) => x.profileId === "c")!;
    expect(c.values[c.values.length - 1]).toBe(41);
    // nadie tiene los 25 de hoy
    expect(c.total).toBe(41);
    expect(s.standings.map((x) => [x.profileId, x.points, x.wins])).toEqual([
      ["a", 90, 2],
      ["b", 65, 1],
      ["c", 41, 1],
    ]);
  });

  it("quien entró a mitad de temporada arranca en su día de ingreso, en 0", () => {
    const s = buildSeasonSeries(base);
    const c = s.series.find((x) => x.profileId === "c")!;
    expect(c.startDay).toBe(2);
    expect(c.values).toEqual([16, 41]);
    // si entró y no jugó ese día, su línea arranca en 0
    const s2 = buildSeasonSeries({ ...base, members: [...base.members, { profileId: "d", name: "Nuevo", joinedOn: "2026-09-30" }] });
    const d = s2.series.find((x) => x.profileId === "d")!;
    expect(d.startDay).toBe(3);
    expect(d.values).toEqual([0]);
    // quien entró antes de la temporada arranca el día 0
    const s3 = buildSeasonSeries({ ...base, members: [{ profileId: "a", name: "Larry", joinedOn: "2026-01-01" }] });
    expect(s3.series[0]!.startDay).toBe(0);
  });

  it("sin días cerrados no hay valores, y una temporada cerrada cuenta todos sus días", () => {
    const s = buildSeasonSeries({ ...base, today: "2026-09-27" });
    expect(s.lastClosed).toBe(-1);
    expect(s.series.every((x) => x.values.length === 0)).toBe(true);
    expect(s.standings).toEqual([]);
    const closed = buildSeasonSeries({ ...base, today: "2026-11-20", closed: true });
    expect(closed.lastClosed).toBe(29);
    expect(closed.todayIndex).toBeNull();
    expect(closed.series.find((x) => x.profileId === "c")!.total).toBe(66);
  });

  it("la flecha: subida o bajada de puesto respecto del día anterior", () => {
    const s = buildSeasonSeries(base);
    // hasta el 29: a 70, b 65, c 16; hasta el 30: a 90, b 65, c 41: nadie cambia de puesto
    expect(s.trend).toEqual({ a: null, b: null, c: null });
    const s2 = buildSeasonSeries({ ...base, rounds: [...base.rounds.slice(0, 3), { playDate: "2026-09-30", ranked: r({ c: 10, b: 9 }) }] });
    // hasta el 30: a 70, b 85, c 41: b sube, a baja
    expect(s2.trend).toEqual({ a: "down", b: "up", c: null });
  });

  it("los colores salen del orden de ingreso y son estables; --agua no está en la paleta", () => {
    const s = buildSeasonSeries(base);
    expect(s.series.map((x) => x.color)).toEqual([SERIES_COLORS[0], SERIES_COLORS[1], SERIES_COLORS[2]]);
    expect(buildSeasonSeries(base).series.map((x) => x.color)).toEqual(s.series.map((x) => x.color));
    expect(SERIES_COLORS.length).toBe(8);
    expect(new Set(SERIES_COLORS.map((c) => c.toLowerCase())).size).toBe(8);
    expect(SERIES_COLORS.map((c) => c.toLowerCase())).not.toContain("#6fd3e0");
    expect(colorFor(8)).toBe(SERIES_COLORS[0]);
  });

  it("el resumen para el aria-label", () => {
    const s = buildSeasonSeries(base);
    expect(seriesSummary(s.series, s.standings)).toBe("Larry va primero con 90 colillas, Daño segundo con 65 colillas, Tarde tercero con 41 colillas.");
    expect(seriesSummary([], [])).toContain("vacía");
  });
});
