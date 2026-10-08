import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advance,
  BASE_POINTS,
  bit,
  botTrace,
  check,
  DURATION_MS,
  flowMsFor,
  MAX_SCORE,
  MODEL,
  neededTurns,
  newRun,
  openings,
  pipePuzzles,
  pour,
  puzzleAt,
  rotate,
  rotMask,
  rowFor,
  shortestRoutes,
  timeMsFor,
  turnsBetween,
  validate,
  type Dir,
  type PipeEvent,
  type Puzzle,
  type Run,
} from "./rules";
import { hitTest, viewFor } from "./draw";
import { damajuanaSprite, rastaSprite, TILE, TOP } from "./sprites";

const SEED = "intento-1";
const seeds = (n: number) => Array.from({ length: n }, (_, i) => `semilla-${i}`);

/** un puzzle a mano: 2 columnas × 3 filas, la entrada arriba a la izquierda, la salida abajo a la derecha */
function handPuzzle(tiles: { kind: "recta" | "curva" | "te"; rot: number }[], opts: Partial<Puzzle> = {}): Run {
  const p: Puzzle = {
    index: 1,
    cols: 2,
    rows: 3,
    inCol: 0,
    outCol: 1,
    tiles,
    path: [0, 2, 3, 5],
    solved: tiles.map(() => null),
    timeMs: 25_000,
    flowMs: 350,
    metrics: { len: 4, turns: 2, needed: 0, tees: 0 },
    ...opts,
  };
  const run = newRun(SEED);
  run.puzzle = p;
  run.rots = p.tiles.map((t) => t.rot);
  run.deadline = p.timeMs;
  return run;
}
/** una partida parada en el puzzle `p`, sin volver a generarlo */
function runFor(p: Puzzle): Run {
  const run = newRun(SEED);
  run.puzzle = p;
  run.rots = p.tiles.map((t) => t.rot);
  run.deadline = p.timeMs;
  return run;
}
/** el camino resuelto del puzzle a mano: baja por la columna 0, cruza en la fila 1 y baja por la columna 1 */
const SOLVED_HAND = [
  { kind: "recta" as const, rot: 0 }, // 0: norte-sur
  { kind: "curva" as const, rot: 0 }, // 1: señuelo
  { kind: "curva" as const, rot: 0 }, // 2: norte-este
  { kind: "curva" as const, rot: 2 }, // 3: sur-oeste
  { kind: "recta" as const, rot: 1 }, // 4: señuelo este-oeste
  { kind: "recta" as const, rot: 0 }, // 5: norte-sur, a la boca
];

describe("fichas", () => {
  it("las bocas giran en sentido horario y los toques entre giros respetan el período de cada ficha", () => {
    expect(rotMask(bit(0), 1)).toBe(bit(1));
    expect(rotMask(bit(3), 1)).toBe(bit(0));
    expect(openings("recta", 1)).toBe(bit(1) | bit(3));
    expect(openings("recta", 2)).toBe(openings("recta", 0));
    expect(openings("curva", 3)).toBe(bit(3) | bit(0));
    expect(openings("te", 2)).toBe(bit(2) | bit(3) | bit(0));
    expect(turnsBetween("recta", 1, 0)).toBe(1);
    expect(turnsBetween("curva", 3, 0)).toBe(1);
    expect(turnsBetween("curva", 0, 3)).toBe(3);
    expect(turnsBetween("te", 2, 2)).toBe(0);
  });
});

describe("generación", () => {
  it("pipePuzzles es determinística y distinta entre semillas", () => {
    expect(JSON.stringify(pipePuzzles(SEED, 5))).toBe(JSON.stringify(pipePuzzles(SEED, 5)));
    expect(JSON.stringify(puzzleAt(SEED, 1))).not.toBe(JSON.stringify(puzzleAt("otra", 1)));
    const src = readFileSync(new URL("./rules.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/Math\.random/);
  });

  it("en 10.000 semillas (los puzzles 1 a 12) y 1.000 (hasta el 20): todo puzzle tiene solución única, cae en todos los rangos de su fila, ninguna ficha del camino empieza bien puesta, ninguna T empieza tapada, y la dificultad es pareja entre semillas", () => {
    const by = new Map<number, number[]>();
    const totals: number[] = [];
    const checkPuzzle = (p: Puzzle, seed: string) => {
      const row = rowFor(p.index);
      const tag = `${seed} puzzle ${p.index}`;
      expect([p.cols, p.rows], tag).toEqual([row.cols, row.rows]);
      expect(p.metrics.len, tag).toBeGreaterThanOrEqual(row.len[0]);
      expect(p.metrics.len, tag).toBeLessThanOrEqual(row.len[1]);
      expect(p.metrics.turns, tag).toBeGreaterThanOrEqual(row.turns[0]);
      expect(p.metrics.turns, tag).toBeLessThanOrEqual(row.turns[1]);
      expect(p.metrics.needed, tag).toBeGreaterThanOrEqual(row.needed[0]);
      expect(p.metrics.needed, tag).toBeLessThanOrEqual(row.needed[1]);
      expect(p.timeMs, tag).toBe(timeMsFor(p.index));
      expect(p.flowMs, tag).toBe(flowMsFor(p.index));
      if (p.index < 4) expect(p.metrics.tees, tag).toBe(0);
      // el camino va de la entrada a la salida y ninguna de sus fichas (ni las que tapan) empieza bien
      expect(p.path[0], tag).toBe(p.inCol);
      expect(p.path[p.path.length - 1], tag).toBe((p.rows - 1) * p.cols + p.outCol);
      for (const { turns } of neededTurns(p)) expect(turns, tag).toBeGreaterThan(0);
      // una sola ruta más corta, y es el camino
      const sr = shortestRoutes(p);
      expect(sr.dist, tag).toBe(p.path.length);
      expect(sr.count, tag).toBe(1);
      expect(sr.route, tag).toEqual(p.path);
      // el camino resuelto conecta de verdad: el vino llega a la boca
      const run = runFor(p);
      for (const { cell, turns } of neededTurns(run.puzzle)) for (let k = 0; k < turns; k++) expect(rotate(run, 0, cell)).toBe("ok");
      expect(pour(run, 100)).toBe("ok");
      advance(run, 100 + p.path.length * p.flowMs + 10);
      expect(run.phase, tag).toBe("drinking");
      expect(run.spill, tag).toBeNull();
      // ninguna T del camino empieza con la boca extra tapada: con la T resuelta, la ficha de al lado todavía está abierta hacia ella
      p.path.forEach((cell) => {
        const t = p.tiles[cell]!;
        if (t.kind !== "te") return;
        const solved = p.solved[cell]!;
        const pathMask = (() => {
          const i = p.path.indexOf(cell);
          const prev = i === 0 ? null : p.path[i - 1]!;
          const next = i === p.path.length - 1 ? null : p.path[i + 1]!;
          const side = (a: number, b: number): Dir => {
            const dc = (b % p.cols) - (a % p.cols);
            const dr = Math.floor(b / p.cols) - Math.floor(a / p.cols);
            return dc === 1 ? 1 : dc === -1 ? 3 : dr === 1 ? 2 : 0;
          };
          return (prev === null ? bit(0) : bit(side(cell, prev))) | (next === null ? bit(2) : bit(side(cell, next)));
        })();
        const extra = ([0, 1, 2, 3] as Dir[]).find((d) => openings("te", solved) & bit(d) && !(pathMask & bit(d)))!;
        const nc = (cell % p.cols) + [0, 1, 0, -1][extra]!;
        const nr = Math.floor(cell / p.cols) + [-1, 0, 1, 0][extra]!;
        const n = nr * p.cols + nc;
        expect(nc >= 0 && nc < p.cols && nr >= 0 && nr < p.rows, tag).toBe(true);
        const facing = ((extra + 2) % 4) as Dir;
        expect(openings(p.tiles[n]!.kind, p.tiles[n]!.rot) & bit(facing), `${tag}: la T empieza tapada`).not.toBe(0);
        expect(p.solved[n], tag).not.toBeNull();
      });
      by.set(p.index, [...(by.get(p.index) ?? []), p.metrics.needed]);
    };
    for (const seed of seeds(10_000)) {
      let total = 0;
      for (const p of pipePuzzles(seed, 12)) {
        checkPuzzle(p, seed);
        total += p.metrics.needed;
      }
      totals.push(total);
    }
    for (const seed of seeds(1_000)) for (const p of pipePuzzles(seed, 20).slice(12)) checkPuzzle(p, seed);
    // pareja: por puzzle, la media cerca del medio del rango y el desvío chico; por semilla, el total de los 12 primeros a menos del 8 % de la media
    for (const [index, xs] of by) {
      const row = rowFor(index);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
      expect(Math.abs(mean - (row.needed[0] + row.needed[1]) / 2), `puzzle ${index}: media ${mean}`).toBeLessThanOrEqual(1);
      expect(sd, `puzzle ${index}: desvío ${sd}`).toBeLessThanOrEqual(1.5);
    }
    const meanTotal = totals.reduce((a, b) => a + b, 0) / totals.length;
    const within = totals.filter((x) => Math.abs(x - meanTotal) / meanTotal <= 0.08).length;
    process.stdout.write(`trago: vueltas necesarias de los 12 primeros, media ${meanTotal.toFixed(1)}; ${within}/10000 semillas a menos del 8 %\n`);
    expect(within).toBeGreaterThanOrEqual(9_900);
  }, 600_000);
});

describe("flujo", () => {
  it("avanza a la velocidad prevista: entra por la entrada y recorre cada ficha en flowMs; llegar a la boca resuelve", () => {
    const run = handPuzzle(SOLVED_HAND);
    expect(pour(run, 1_000)).toBe("ok");
    expect(run.wet.get(0)?.at).toBe(1_000);
    advance(run, 1_349);
    expect(run.wet.has(2)).toBe(false);
    advance(run, 1_350);
    expect(run.wet.get(2)?.at).toBe(1_350);
    advance(run, 1_700);
    expect(run.wet.get(3)?.at).toBe(1_700);
    advance(run, 2_050);
    expect(run.wet.get(5)?.at).toBe(2_050);
    advance(run, 2_399);
    expect(run.phase).toBe("flowing");
    advance(run, 2_400);
    expect(run.phase).toBe("drinking");
    expect(run.solvedCount).toBe(1);
    expect(run.solvedT).toBe(2_400);
  });

  it("una ficha con vino no gira; las de adelante, sí", () => {
    const run = handPuzzle(SOLVED_HAND);
    pour(run, 0);
    expect(rotate(run, 100, 0)).toBe("mojada");
    expect(rotate(run, 100, 5)).toBe("ok");
    expect(rotate(run, 100, 5)).toBe("ok");
    expect(rotate(run, 100, 9)).toBe("invalida");
  });

  it("un borde abierto derrama", () => {
    // la primera ficha es una recta este-oeste: el vino de la damajuana no entra
    const run = handPuzzle([{ kind: "recta", rot: 1 }, ...SOLVED_HAND.slice(1)]);
    pour(run, 0);
    expect(run.phase).toBe("spilled");
    expect(run.spill).toMatchObject({ cell: 0, side: 0, at: 0 });
    // una curva en la fila de abajo que sale por el borde izquierdo
    const run2 = handPuzzle([SOLVED_HAND[0]!, SOLVED_HAND[1]!, { kind: "curva", rot: 3 }, ...SOLVED_HAND.slice(3)]);
    pour(run2, 0);
    advance(run2, 700);
    expect(run2.phase).toBe("spilled");
    expect(run2.spill).toMatchObject({ cell: 2, side: 3, at: 700 });
  });

  it("una ficha que no conecta derrama, y una salida de una T sin destino también; una T bien tapada no", () => {
    // la ficha 3 cerrada hacia la 2: el vino llega al final de la 2 y no tiene por dónde seguir
    const run = handPuzzle([SOLVED_HAND[0]!, SOLVED_HAND[1]!, SOLVED_HAND[2]!, { kind: "recta", rot: 0 }, SOLVED_HAND[4]!, SOLVED_HAND[5]!]);
    pour(run, 0);
    advance(run, 1_000);
    expect(run.phase).toBe("spilled");
    expect(run.spill).toMatchObject({ cell: 2, side: 1, at: 700 });
    // la ficha 2 es una T norte-este-sur: su boca extra (sur) da a la 4, que es una recta este-oeste (cerrada al norte): tapada, y el camino sigue
    const capped = handPuzzle([SOLVED_HAND[0]!, SOLVED_HAND[1]!, { kind: "te", rot: 0 }, SOLVED_HAND[3]!, { kind: "recta", rot: 1 }, SOLVED_HAND[5]!]);
    pour(capped, 0);
    advance(capped, 1_500);
    expect(capped.phase).toBe("drinking");
    expect(capped.solvedCount).toBe(1);
    expect(capped.spill).toBeNull();
    // con la 4 abierta al norte (recta norte-sur), el vino entra y sale por el borde de abajo: derrame
    const leak = handPuzzle([SOLVED_HAND[0]!, SOLVED_HAND[1]!, { kind: "te", rot: 0 }, SOLVED_HAND[3]!, { kind: "recta", rot: 0 }, SOLVED_HAND[5]!]);
    pour(leak, 0);
    advance(leak, 2_000);
    expect(leak.phase).toBe("spilled");
    expect(leak.spill).toMatchObject({ cell: 4, side: 2 });
  });

  it("si se acaba el tiempo, el vino entra solo y sin bonus; con el camino armado, resuelve", () => {
    const run = handPuzzle(SOLVED_HAND);
    advance(run, 24_999);
    expect(run.phase).toBe("solving");
    advance(run, 25_000);
    expect(run.phase).toBe("flowing");
    expect(run.tapped).toBe(false);
    advance(run, 26_500);
    expect(run.phase).toBe("drinking");
    expect(run.score).toBe(BASE_POINTS);
    expect(run.lastGain).toEqual({ base: 100, bonus: 0 });
    // y a los 900 ms, el puzzle siguiente
    advance(run, 27_400);
    expect(run.phase).toBe("solving");
    expect(run.puzzle.index).toBe(2);
  });
});

describe("puntaje", () => {
  it("100 por puzzle, más 10 por segundo sobrante solo si se tocó la damajuana; después del puzzle viene el siguiente", () => {
    const run = handPuzzle(SOLVED_HAND);
    expect(pour(run, 3_200)).toBe("ok");
    advance(run, 10_000);
    // sobraban 25.000 − 3.200 = 21.800 ms: 21 segundos enteros
    expect(run.score).toBe(100 + 210);
    expect(run.lastGain).toEqual({ base: 100, bonus: 210 });
    expect(run.index).toBe(1);
    expect(run.puzzle.index).toBe(2);
    expect(run.phase).toBe("solving");
    expect(run.startT).toBe(3_200 + 4 * 350 + 900);
    expect(pour(run, 10_000)).toBe("ok");
    expect(pour(run, 10_100)).toBe("no");
  });

  it("un derrame termina la partida: nada más cuenta, y el fin queda un segundo después", () => {
    const run = handPuzzle([{ kind: "recta", rot: 1 }, ...SOLVED_HAND.slice(1)]);
    pour(run, 2_000);
    expect(run.phase).toBe("spilled");
    expect(run.endT).toBe(3_000);
    expect(rotate(run, 2_100, 5)).toBe("fin");
    expect(pour(run, 2_100)).toBe("no");
    advance(run, DURATION_MS);
    expect(run.phase).toBe("over");
    expect(run.score).toBe(0);
  });

  it("la cota de plausibilidad es alcanzable solo en el mejor caso", () => {
    expect(MAX_SCORE).toBeGreaterThan(3_000);
    expect(MAX_SCORE).toBeLessThan(10_000);
    const best = botTrace(SEED, { think: 0, tap: 60, pourAfter: 60 }).run.score;
    expect(best).toBeLessThan(MAX_SCORE);
  });
});

describe("validate", () => {
  it("acepta una partida real (cortada por el tiempo o por un derrame), con su duración", () => {
    for (const seed of seeds(5)) {
      // por tiempo: un jugador rápido que nunca se queda sin tiempo
      const a = botTrace(seed, { think: 1_000, tap: 300, pourAfter: 300 });
      expect(a.run.spill).toBeNull();
      expect(a.run.solvedCount).toBeGreaterThan(8);
      const v = check(seed, a.events, DURATION_MS + 3_000);
      expect(v.ok, `${seed}: ${JSON.stringify(v)}`).toBe(true);
      if (v.ok) expect(v.score).toBe(a.run.score);
      expect(validate({ score: a.run.score, events: a.events }, seed, { elapsedMs: DURATION_MS + 3_000 })).toBe(true);
      const b = botTrace(seed, { ...MODEL, spillAfter: 2 });
      expect(b.run.spill).not.toBeNull();
      expect(b.run.solvedCount).toBe(2);
      expect(validate({ score: b.run.score, events: b.events }, seed, { elapsedMs: b.run.endT + 2_500 })).toBe(true);
      expect(check(seed, b.events, b.run.endT - 500)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
      expect(check(seed, b.events, b.run.endT + 11_000)).toMatchObject({ ok: false, reason: "el intento duró mucho más que la partida" });
    }
  });

  it("rechaza un puntaje inflado, un giro sobre una ficha con vino, eventos después del derrame, dos pour en un puzzle, intervalos de 30 ms, una casilla que no existe, puzzles salteados, tiempos fuera de orden, y una traza de otra semilla (de otro jugador o la del grupo)", () => {
    const a = botTrace(SEED, { ...MODEL, spillAfter: 2 });
    const ev = a.events;
    const bad = (events: unknown) => {
      const v = check(SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    expect(bad(ev)).toBe("ok");
    expect(validate({ score: a.run.score + 10, events: ev }, SEED)).toBe(false);
    // un giro sobre una ficha con vino: el primer toque del puzzle 1, repetido justo después del pour (la entrada ya está mojada)
    const firstPour = ev.findIndex((e) => e.type === "pour");
    const entry = a.run.seed ? puzzleAt(SEED, 1).inCol : 0;
    expect(bad([...ev.slice(0, firstPour + 1), { t: ev[firstPour]!.t + 100, puzzle: 1, type: "rotate", cell: entry }, ...ev.slice(firstPour + 1).map((e) => ({ ...e, t: e.t + 200 }))])).toBe("giro sobre una ficha con vino");
    // eventos después del derrame
    expect(bad([...ev, { t: ev[ev.length - 1]!.t + 500, puzzle: 3, type: "rotate", cell: 0 }])).toBe("evento después del derrame");
    // dos pour en un puzzle
    expect(bad([...ev.slice(0, firstPour + 1), { t: ev[firstPour]!.t + 100, puzzle: 1, type: "pour" }, ...ev.slice(firstPour + 1).map((e) => ({ ...e, t: e.t + 200 }))])).toBe("más de un pour en el puzzle");
    // intervalos de 30 ms
    expect(bad([ev[0], { ...ev[1], t: ev[0]!.t + 30 }, ...ev.slice(2)])).toBe("dos toques demasiado seguidos");
    // una casilla que no existe
    expect(bad([{ ...ev[0], cell: 99 }, ...ev.slice(1)])).toBe("casilla que no existe");
    expect(bad([{ ...ev[0], cell: -1 }, ...ev.slice(1)])).toBe("casilla que no existe");
    // puzzles salteados
    expect(bad([{ ...ev[0], puzzle: 2 }, ...ev.slice(1)])).toBe("el puzzle no es el que corresponde");
    // tiempos fuera de orden
    expect(bad([ev[1], ev[0], ...ev.slice(2)])).toBe("tiempos fuera de orden");
    expect(bad([...ev.slice(0, -1), { ...ev[ev.length - 1], t: DURATION_MS + 1_000 }])).toBe("evento después de los 150 s");
    expect(bad("nada")).toBe("la traza no es una lista");
    expect(bad([{ t: 1 }])).toBe("evento mal formado");
    // la traza de otro jugador (otra semilla) o la de la ronda no sirven: los puzzles son otros
    const other = botTrace("otro-jugador", { ...MODEL, spillAfter: 2 });
    expect(validate({ score: other.run.score, events: other.events }, SEED)).toBe(false);
    const group = botTrace("semilla-de-la-ronda", MODEL);
    expect(validate({ score: group.run.score, events: group.events }, SEED)).toBe(false);
  });
});

describe("calibración", () => {
  it("el jugador modelo resuelve entre 5 y 8 puzzles; el rápido, más; el que deja correr el tiempo, menos puntos", () => {
    const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
    const ss = seeds(60);
    const model = ss.map((s) => botTrace(s, MODEL).run);
    const fast = ss.map((s) => botTrace(s, { think: 1_500, tap: 450, pourAfter: 500 }).run.solvedCount);
    const lazy = ss.map((s) => botTrace(s, { ...MODEL, pourAfter: null }).run.score);
    const solved = model.map((r) => r.solvedCount);
    process.stdout.write(`trago: modelo puzzles p10/med/p90 ${q(solved, 0.1)}/${q(solved, 0.5)}/${q(solved, 0.9)}, puntos med ${q(model.map((r) => r.score), 0.5)}; rápido ${q(fast, 0.5)}; sin tocar la damajuana ${q(lazy, 0.5)} puntos\n`);
    expect(q(solved, 0.5)).toBeGreaterThanOrEqual(5);
    expect(q(solved, 0.5)).toBeLessThanOrEqual(8);
    expect(q(fast, 0.5)).toBeGreaterThan(q(solved, 0.5));
    expect(q(lazy, 0.5)).toBeLessThan(q(model.map((r) => r.score), 0.5));
  }, 120_000);
});

describe("control y arte", () => {
  it("un toque cae en la casilla o en la damajuana según dónde esté en la vista", () => {
    const p = puzzleAt(SEED, 1);
    const { W, H } = viewFor(p);
    expect(W).toBe(p.cols * TILE);
    expect(hitTest(p, 10, TOP + 10)).toEqual({ kind: "cell", cell: 0 });
    expect(hitTest(p, p.cols * TILE - 1, TOP + p.rows * TILE - 1)).toEqual({ kind: "cell", cell: p.cols * p.rows - 1 });
    expect(hitTest(p, p.inCol * TILE + 10, 12)).toEqual({ kind: "pour" });
    expect(hitTest(p, 5, H - 5)).toBeNull();
  });
  it("el pibe tiene sus cuatro caras (26 × 30) y la damajuana su etiqueta", () => {
    for (const pose of ["espera", "toma", "salud", "triste"] as const) expect([rastaSprite(pose).w, rastaSprite(pose).h]).toEqual([26, 30]);
    expect(JSON.stringify(rastaSprite("espera"))).not.toBe(JSON.stringify(rastaSprite("toma")));
    expect(rastaSprite("triste").px.some((p) => p.c === "#6B1F3A")).toBe(true);
    expect(damajuanaSprite().px.some((p) => p.c === "#B22A3A")).toBe(true);
  });
});

/** no usado directamente: tipa la traza para los tests de arriba */
export type _Ev = PipeEvent;
