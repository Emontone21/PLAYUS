import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyCut,
  area2,
  botTrace,
  check,
  CUTS,
  DURATION_MS,
  evaluateCut,
  frac,
  fracToNumber,
  generateObjects,
  GOOD_SCORE,
  GRID,
  initialState,
  MIN_CUT_UNITS,
  PAUSE_MS,
  ROTATION_MAX,
  SAY_BAD,
  SAY_GOOD,
  sayFor,
  SCALE_MAX,
  SCALE_MIN,
  scoreFor,
  shiftLine,
  solveCut,
  splitAreas,
  validate,
  type CutEvent,
  type Line,
} from "./rules";
import { LEVELS, placeShape, SHAPES, sinT, cosT, type Pt } from "./shapes";
import { pctText } from "./index";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);

const SQUARE: Pt[] = [
  [1000, 1000],
  [9000, 1000],
  [9000, 9000],
  [1000, 9000],
];
/** una U: cortada en horizontal por el medio, un lado queda en dos pedazos (las patas) */
const U_SHAPE: Pt[] = [
  [1000, 1000],
  [3000, 1000],
  [3000, 6000],
  [7000, 6000],
  [7000, 1000],
  [9000, 1000],
  [9000, 9000],
  [1000, 9000],
];

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}
function segmentsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function isSimple(poly: readonly Pt[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(poly[i]!, poly[(i + 1) % n]!, poly[j]!, poly[(j + 1) % n]!)) return false;
    }
  return true;
}

describe("determinismo", () => {
  it("sin Math.random ni Math.sin en las reglas ni en las formas; la misma semilla da los mismos objetos y el replay da lo mismo", () => {
    for (const f of ["./rules.ts", "./shapes.ts"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src, f).not.toMatch(/Math\.(random|sin|cos|atan)/);
    }
    expect(generateObjects("abc")).toEqual(generateObjects("abc"));
    expect(generateObjects("abc")).not.toEqual(generateObjects("abd"));
    const a = botTrace(SEED, { offsets: [200, -300, 150] });
    const v = check(SEED, a.events);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.state.total).toBe(a.state.total);
  });
});

describe("geometría exacta", () => {
  it("las seis formas son polígonos simples de 12 a 30 vértices con área conocida (la misma en Node y en el navegador: la comprueba el E2E)", () => {
    for (const s of SHAPES) {
      expect(s.verts.length).toBeGreaterThanOrEqual(12);
      expect(s.verts.length).toBeLessThanOrEqual(30);
      expect(isSimple(s.verts), s.id).toBe(true);
      expect(area2(s.verts)).toBeGreaterThan(0n);
    }
    expect(area2(SHAPES[0]!.verts)).toBe(1095639n);
    expect(area2(SHAPES[5]!.verts)).toBe(652100n);
    expect(area2(SQUARE)).toBe(2n * 64_000_000n);
    expect(sinT(0)).toBe(0);
    expect(sinT(90)).toBe(10000);
    expect(cosT(180)).toBe(-10000);
    expect(sinT(270)).toBe(-10000);
  });

  it("un cuadrado cortado por el medio da 50/50, con cualquier recta que pase por el centro", () => {
    for (const l of [
      { x1: 5000, y1: 0, x2: 5000, y2: 10000 },
      { x1: 0, y1: 5000, x2: 10000, y2: 5000 },
      { x1: 0, y1: 0, x2: 10000, y2: 10000 },
      { x1: 2000, y1: 9000, x2: 8000, y2: 1000 },
    ]) {
      const o = evaluateCut(SQUARE, l)!;
      expect(o.score).toBe(1000);
      expect(o.leftPct10).toBe(500);
      expect(fracToNumber(o.left)).toBe(fracToNumber(o.right));
    }
    // 60/40 con una vertical en x = 1000 + 0,6 × 8000
    const o = evaluateCut(SQUARE, { x1: 5800, y1: 0, x2: 5800, y2: 10000 })!;
    expect([o.leftPct10, o.rightPct10].sort()).toEqual([400, 600]);
    expect(o.score).toBe(600);
  });

  it("una forma cóncava cortada en tres pedazos suma bien cada lado", () => {
    // la U cortada en y = 3500: arriba (y < 3500) quedan las dos patas de 2000 × 2500 cada una
    const s = splitAreas(U_SHAPE, { x1: 0, y1: 3500, x2: 10000, y2: 3500 });
    const total = area2(U_SHAPE);
    expect(total).toBe(2n * (8000n * 8000n - 4000n * 5000n));
    // mirando de izquierda a derecha, "la izquierda" es y > 3500 (el bloque de abajo con el cuerpo de la U)
    const legs = 2n * 2n * (2000n * 2500n);
    expect(s.right).toEqual(frac(legs, 1n));
    expect(s.left).toEqual(frac(total - legs, 1n));
    // y las intersecciones racionales: una diagonal
    const d = splitAreas(U_SHAPE, { x1: 0, y1: 0, x2: 9000, y2: 7000 });
    expect(fracToNumber(d.left) + fracToNumber(d.right)).toBeCloseTo(Number(total), 3);
  });

  it("una recta que no toca el objeto no cuenta, y tampoco una que lo roza en un vértice", () => {
    expect(evaluateCut(SQUARE, { x1: 9500, y1: 0, x2: 9500, y2: 10000 })).toBeNull();
    expect(evaluateCut(SQUARE, { x1: 0, y1: 1000, x2: 10000, y2: 1000 })).toBeNull();
    const s = initialState(SEED);
    expect(applyCut(s, { x1: -5000, y1: 0, x2: -5000, y2: 10000 }, 100)).toEqual({ ok: false, why: "no toca" });
    expect(applyCut(s, { x1: 5000, y1: 5000, x2: 5000 + MIN_CUT_UNITS - 1, y2: 5000 }, 100)).toEqual({ ok: false, why: "muy corto" });
    expect(s.cuts.length).toBe(0);
  });
});

describe("puntaje y reacción", () => {
  it("50/50 da 1.000, 52/48 da 920, 55/45 da 800, 60/40 da 600, 75/25 o peor da 0", () => {
    const T = 2000n;
    const pct = (p: number) => frac(BigInt(p) * 20n, 1n); // p % de 2000
    expect(scoreFor(pct(50), T)).toBe(1000);
    expect(scoreFor(pct(52), T)).toBe(920);
    expect(scoreFor(pct(55), T)).toBe(800);
    expect(scoreFor(pct(60), T)).toBe(600);
    expect(scoreFor(pct(75), T)).toBe(0);
    expect(scoreFor(pct(90), T)).toBe(0);
    // con decimales exactos: 50,5 % → 980
    expect(scoreFor(frac(1010n, 1n), T)).toBe(980);
    expect(pctText(487)).toBe("48,7%");
    expect(pctText(500)).toBe("50,0%");
  });

  it("850 o más dice Despegado; menos, Sos un sopa bro", () => {
    expect(GOOD_SCORE).toBe(850);
    expect(sayFor(850)).toBe(SAY_GOOD);
    expect(sayFor(1000)).toBe(SAY_GOOD);
    expect(sayFor(849)).toBe(SAY_BAD);
    expect(sayFor(0)).toBe(SAY_BAD);
    const o = evaluateCut(SQUARE, { x1: 5300, y1: 0, x2: 5300, y2: 10000 })!; // 53,75 / 46,25
    expect(o.score).toBe(850);
    expect(o.good).toBe(true);
  });
});

describe("los objetos", () => {
  it("van de irregularidad baja a alta, ninguna forma se repite, y la rotación y la escala quedan en rango; son polígonos simples", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const objs = generateObjects(seed);
      expect(objs.map((o) => o.level)).toEqual(LEVELS);
      expect(new Set(objs.map((o) => o.shape)).size).toBe(CUTS);
      for (const o of objs) {
        seen.add(o.shape);
        expect(o.rotation).toBeGreaterThanOrEqual(0);
        expect(o.rotation).toBeLessThanOrEqual(ROTATION_MAX);
        expect(o.scale).toBeGreaterThanOrEqual(SCALE_MIN);
        expect(o.scale).toBeLessThanOrEqual(SCALE_MAX);
        expect(isSimple(o.verts), `${seed} ${o.shape}`).toBe(true);
        for (const [x, y] of o.verts) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(GRID);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(GRID);
        }
      }
    }
    expect(seen.size).toBe(SHAPES.length);
    // rotar 90° una forma es rotar sus vértices (con la escala del 100 %)
    const base = SHAPES[0]!.verts;
    const r0 = placeShape(base, 0, 100);
    const r90 = placeShape(base, 90, 100);
    expect(r90[0]![0]).toBe(5000 - (r0[0]![1] - 5000));
    expect(r90[0]![1]).toBe(5000 + (r0[0]![0] - 5000));
    expect(area2(placeShape(base, 0, 110))).toBeGreaterThan(area2(r0));
  });
});

describe("justicia", () => {
  it("en 1.000 semillas el resolvedor encuentra una recta 50/50 (puntaje 1.000) para los 3 objetos", () => {
    let worst = 0;
    for (const seed of SEEDS) {
      for (const o of generateObjects(seed)) {
        const sol = solveCut(o.verts);
        expect(sol.score, `${seed} ${o.shape}`).toBe(1000);
        worst = Math.max(worst, sol.error / Number(area2(o.verts)));
      }
    }
    // el peor reparto encontrado se aleja de la mitad menos del 0,01 %
    expect(worst).toBeLessThan(0.0001);
  }, 180_000);
});

describe("la partida y validate", () => {
  it("suma los 3 cortes, respeta la pausa de 1,5 s y termina con el tercero; el jugador modelo ronda los 2.400", () => {
    const s = initialState(SEED);
    const l1 = solveCut(s.objects[0]!.verts).line;
    expect(applyCut(s, l1, 500).ok).toBe(true);
    expect(applyCut(s, l1, 500 + PAUSE_MS - 1)).toEqual({ ok: false, why: "en la pausa" });
    const l2 = shiftLine(solveCut(s.objects[1]!.verts).line, 300);
    const r2 = applyCut(s, l2, 500 + PAUSE_MS);
    expect(r2.ok).toBe(true);
    const l3 = solveCut(s.objects[2]!.verts).line;
    expect(applyCut(s, l3, 4000).ok).toBe(true);
    expect(s.total).toBe(s.cuts.reduce((a, c) => a + c.outcome.score, 0));
    expect(applyCut(s, l3, 9000)).toEqual({ ok: false, why: "terminó" });
    const totals: number[] = [];
    for (const seed of SEEDS.slice(0, 100)) totals.push(botTrace(seed, { offsets: [250, 250, 250] }).state.total);
    totals.sort((a, b) => a - b);
    process.stdout.write(`perfecto: 3000; corrido 250 unidades (2,5 % de la mesa): p25/med/p75 ${totals[25]}/${totals[50]}/${totals[75]}\n`);
    expect(totals[50]!).toBeGreaterThan(2000);
    expect(totals[50]!).toBeLessThan(2800);
  });

  it("acepta una partida real y rechaza un total inflado, un corte que no toca, un cuarto corte, cortes fuera de orden o en la pausa, un corte corto y otra semilla", () => {
    const a = botTrace(SEED, { offsets: [100, -200, 300] });
    const ev = a.events;
    const total = a.state.total;
    expect(validate({ score: total, events: ev }, SEED, { elapsedMs: 20_000 })).toBe(true);
    expect(validate({ score: total + 1, events: ev }, SEED)).toBe(false);
    expect(validate({ score: total, events: ev }, "otra")).toBe(false);
    const bad = (events: unknown) => {
      const v = check(SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    expect(bad([{ ...ev[0], x1: -5000, x2: -5000, y1: 0, y2: 10000 }, ev[1], ev[2]])).toBe("un corte que no toca el objeto");
    expect(bad([...ev, { ...ev[2], cut: 4, t: ev[2]!.t + 3000 }])).toBe("más de 3 cortes");
    expect(bad([ev[1], ev[0], ev[2]])).toBe("los cortes no van en orden");
    expect(bad([ev[0], { ...ev[1], t: ev[0]!.t + PAUSE_MS - 1 }, ev[2]])).toBe("un corte en la pausa");
    expect(bad([ev[0], { ...ev[1], t: ev[0]!.t }, ev[2]])).toBe("los tiempos no crecen");
    expect(bad([ev[0], ev[1], { ...ev[2], t: DURATION_MS + 5000 }])).toBe("tiempo fuera de rango");
    const short: CutEvent = { ...ev[0]!, x2: ev[0]!.x1 + 10, y2: ev[0]!.y1 + 10 };
    expect(bad([short, ev[1], ev[2]])).toBe("un corte muy corto");
    expect(bad([{ ...ev[0], x1: 1.5 }])).toBe("evento inválido");
    expect(bad("nada")).toBe("la traza no es una lista");
    expect(check(SEED, ev, ev[2]!.t - 1)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
    // una partida cortada por tiempo: valen los cortes hechos
    const cut = check(SEED, ev.slice(0, 2));
    expect(cut).toMatchObject({ ok: true, finished: false });
    if (cut.ok) expect(cut.state.total).toBe(ev.slice(0, 2).reduce((acc, e, i) => acc + a.state.cuts[i]!.outcome.score + 0 * e.t, 0));
    expect(check(SEED, [])).toMatchObject({ ok: true, finished: false });
  });
});

describe("el resolvedor corrido", () => {
  it("una recta corrida 500 unidades reparte peor que una corrida 100", () => {
    const o = generateObjects(SEED)[0]!;
    const sol = solveCut(o.verts).line;
    const near = evaluateCut(o.verts, shiftLine(sol, 100))!;
    const far = evaluateCut(o.verts, shiftLine(sol, 500))!;
    expect(near.score).toBeGreaterThan(far.score);
    const l: Line = shiftLine(sol, 0);
    expect(l).toEqual(sol);
  });
});
