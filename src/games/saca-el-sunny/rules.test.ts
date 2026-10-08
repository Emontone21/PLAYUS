import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advance,
  botTrace,
  check,
  DURATION_MS,
  EXIT_COL,
  gainFor,
  legalMoves,
  legalRange,
  MAX_SCORE,
  MODEL,
  move,
  newRun,
  parkingPuzzles,
  puzzleAt,
  reset,
  rowFor,
  SIZE,
  solve,
  SUNNY_ROW,
  validate,
  type Car,
  type ParkingEvent,
  type Puzzle,
  type Run,
} from "./rules";
import { dragOffset } from "./index";
import { cellAt, carAtCell, mmss } from "./draw";
import { carSprite, CELL, rotateSprite, sunnySprite, TOP } from "./sprites";

const SEED = "intento-1";
const seeds = (n: number) => Array.from({ length: n }, (_, i) => `semilla-${i}`);

/** un estacionamiento a mano: el sunny en (2, 0-1) y los autos que se pasen */
function hand(cars: Car[], pos: number[], index = 1): Puzzle {
  const all: Car[] = [{ len: 2, horizontal: true, lane: SUNNY_ROW, look: 0 }, ...cars];
  const start = [0, ...pos];
  const sol = solve(all, start);
  return { index, cars: all, start, minMoves: sol ? sol.minMoves : -1, blacks: cars.length };
}
/** una partida parada en ese estacionamiento */
function runFor(p: Puzzle): Run {
  const run = newRun(SEED);
  run.puzzle = p;
  run.pos = [...p.start];
  return run;
}
/** tres movimientos: A (vertical en la columna 3, filas 1-2) tapa al sunny; B (fila 0, columnas 2-3) le tapa la subida y C (fila 4, columnas 3-4) la bajada */
const THREE = hand(
  [
    { len: 2, horizontal: false, lane: 3, look: 0 },
    { len: 2, horizontal: true, lane: 0, look: 1 },
    { len: 2, horizontal: true, lane: 4, look: 0 },
  ],
  [1, 2, 3],
);

describe("el resolvedor", () => {
  it("encuentra el mínimo correcto en estacionamientos armados a mano", () => {
    // libre: un movimiento
    expect(solve(hand([], []).cars, [0])?.minMoves).toBe(1);
    // un auto vertical tapando: lo corre y sale (2)
    const two = hand([{ len: 2, horizontal: false, lane: 2, look: 0 }], [2]);
    expect(two.minMoves).toBe(2);
    expect(solve(two.cars, two.start)?.path).toEqual([
      { car: 1, delta: -2 },
      { car: 0, delta: 4 },
    ]);
    // tres, y la solución encontrada funciona de verdad
    expect(THREE.minMoves).toBe(3);
    const run = runFor(THREE);
    for (const m of solve(THREE.cars, THREE.start)!.path) expect(move(run, run.t + 100, m.car, m.delta)).toBe("ok");
    expect(run.solvedCount).toBe(1);
    // sin solución: la columna de la salida llena de camionetas que no pueden moverse
    const stuck = hand(
      [
        { len: 3, horizontal: false, lane: 5, look: 2 },
        { len: 3, horizontal: false, lane: 5, look: 2 },
      ],
      [0, 3],
    );
    expect(solve(stuck.cars, stuck.start)).toBeNull();
    expect(stuck.minMoves).toBe(-1);
  });

  it("los movimientos legales: solo sobre el eje, sin atravesar ni salir de la grilla", () => {
    const occ = legalRange(THREE.cars, THREE.start, 0);
    expect(occ).toEqual({ min: 0, max: 1 }); // el sunny llega hasta la columna 1 (A está en la 3)
    expect(legalRange(THREE.cars, THREE.start, 1)).toEqual({ min: 0, max: 1 }); // A baja una (sigue tapando) pero no dos (C) ni sube (B)
    expect(legalRange(THREE.cars, THREE.start, 2)).toEqual({ min: -2, max: 2 }); // B va de la 0 a la 4
    expect(legalMoves(THREE.cars, THREE.start).every((m) => m.delta !== 0)).toBe(true);
  });
});

describe("generación", () => {
  it("parkingPuzzles es determinística y distinta entre semillas", () => {
    expect(JSON.stringify(parkingPuzzles(SEED, 3))).toBe(JSON.stringify(parkingPuzzles(SEED, 3)));
    expect(JSON.stringify(puzzleAt(SEED, 1))).not.toBe(JSON.stringify(puzzleAt("otra", 1)));
    const src = readFileSync(new URL("./rules.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/Math\.random/);
  });

  it("en 600 semillas (los estacionamientos 1 y 2) y 120 (del 3 al 8): todo estacionamiento tiene solución, cae en su fila, el sunny va en la tercera fila y la cantidad de autos sigue la tabla", () => {
    const checkPuzzle = (p: Puzzle, seed: string) => {
      const row = rowFor(p.index);
      const tag = `${seed} estacionamiento ${p.index}`;
      expect(p.cars[0], tag).toMatchObject({ len: 2, horizontal: true, lane: SUNNY_ROW });
      expect(p.start[0], tag).toBeLessThan(EXIT_COL);
      expect(p.blacks, tag).toBe(p.cars.length - 1);
      expect(p.blacks, tag).toBeGreaterThanOrEqual(row.blacks[0]);
      expect(p.blacks, tag).toBeLessThanOrEqual(row.blacks[1]);
      expect(p.minMoves, tag).toBeGreaterThanOrEqual(row.moves[0]);
      expect(p.minMoves, tag).toBeLessThanOrEqual(row.moves[1]);
      // nadie se superpone ni sale de la grilla, y ningún otro auto va horizontal en la fila del sunny
      const seen = new Set<number>();
      p.cars.forEach((c, i) => {
        expect(p.start[i]! + c.len, tag).toBeLessThanOrEqual(SIZE);
        if (i > 0 && c.horizontal) expect(c.lane, tag).not.toBe(SUNNY_ROW);
        for (let k = 0; k < c.len; k++) {
          const cell = c.horizontal ? c.lane * SIZE + p.start[i]! + k : (p.start[i]! + k) * SIZE + c.lane;
          expect(seen.has(cell), `${tag}: casilla ${cell} repetida`).toBe(false);
          seen.add(cell);
        }
      });
      // el resolvedor lo confirma
      const sol = solve(p.cars, p.start);
      expect(sol, tag).not.toBeNull();
      expect(sol!.minMoves, tag).toBe(p.minMoves);
    };
    for (const seed of seeds(600)) for (const p of parkingPuzzles(seed, 2)) checkPuzzle(p, seed);
    for (const seed of seeds(120)) for (const p of parkingPuzzles(seed, 8).slice(2)) checkPuzzle(p, seed);
  }, 900_000);
});

describe("reglas", () => {
  it("un deslizamiento de varias casillas cuenta como un movimiento; soltar el auto donde estaba no cuenta", () => {
    const run = runFor(THREE);
    expect(move(run, 100, 2, -2)).toBe("ok");
    expect(run.moves).toBe(1);
    expect(run.pos[2]).toBe(0);
    expect(move(run, 200, 2, 0)).toBe("quieto");
    expect(run.moves).toBe(1);
    expect(move(run, 300, 1, 2)).toBe("imposible"); // atraviesa a C
    expect(move(run, 300, 1, -2)).toBe("imposible"); // sale de la grilla
    expect(move(run, 300, 9, 1)).toBe("auto");
    expect(run.moves).toBe(1);
  });

  it("empezar de nuevo vuelve el estacionamiento al principio, pone los movimientos en 0 y deja el reloj corriendo", () => {
    const run = runFor(THREE);
    move(run, 1_000, 2, -2);
    move(run, 2_000, 1, -1);
    expect(run.moves).toBe(2);
    expect(reset(run, 3_000)).toBe("ok");
    expect(run.moves).toBe(0);
    expect(run.pos).toEqual(THREE.start);
    expect(run.t).toBe(3_000);
    advance(run, 4_000);
    expect(run.t).toBe(4_000);
    expect(run.phase).toBe("playing");
  });

  it("al sacar el sunny viene el siguiente al segundo; a los 120 s cierra y el estacionamiento en curso no cuenta", () => {
    const run = runFor(THREE);
    for (const m of solve(THREE.cars, THREE.start)!.path) move(run, run.t + 100, m.car, m.delta);
    expect(run.phase).toBe("leaving");
    expect(move(run, run.t + 100, 2, 1)).toBe("fin");
    advance(run, run.solvedT + 999);
    expect(run.phase).toBe("leaving");
    advance(run, run.solvedT + 1_000);
    expect(run.phase).toBe("playing");
    expect(run.index).toBe(1);
    expect(run.puzzle.index).toBe(2);
    expect(run.moves).toBe(0);
    advance(run, DURATION_MS);
    expect(run.phase).toBe("over");
    expect(move(run, DURATION_MS, 1, 1)).toBe("fin");
    expect(reset(run, DURATION_MS)).toBe("fin");
    expect(run.solvedCount).toBe(1);
  });
});

describe("puntaje", () => {
  it("150 con la solución óptima, 120 con 3 de más, 100 con 5 de más o peor; el puntaje de la partida es la suma", () => {
    expect(gainFor(3, 3)).toEqual({ base: 100, bonus: 50 });
    expect(gainFor(6, 3)).toEqual({ base: 100, bonus: 20 });
    expect(gainFor(8, 3)).toEqual({ base: 100, bonus: 0 });
    expect(gainFor(20, 3)).toEqual({ base: 100, bonus: 0 });
    const optimal = runFor(THREE);
    for (const m of solve(THREE.cars, THREE.start)!.path) move(optimal, optimal.t + 100, m.car, m.delta);
    expect(optimal.score).toBe(150);
    expect(optimal.lastGain).toEqual({ base: 100, bonus: 50, moves: 3, minMoves: 3 });
    // tres de más: un ida y vuelta de B, y A que baja una casilla (sigue tapando; desde ahí la solución vuelve a ser de 3)
    const extra = runFor(THREE);
    move(extra, 100, 2, -1);
    move(extra, 200, 2, 1);
    move(extra, 300, 1, 1);
    for (const m of solve(THREE.cars, extra.pos)!.path) move(extra, extra.t + 100, m.car, m.delta);
    expect(extra.moves).toBe(6);
    expect(extra.score).toBe(120);
    // y solo cuentan los movimientos desde el último "empezar de nuevo"
    const again = runFor(THREE);
    for (let i = 0; i < 4; i++) move(again, again.t + 100, 2, i % 2 === 0 ? -1 : 1);
    reset(again, again.t + 100);
    for (const m of solve(THREE.cars, THREE.start)!.path) move(again, again.t + 100, m.car, m.delta);
    expect(again.score).toBe(150);
  });

  it("la cota de plausibilidad es alcanzable solo en el mejor caso", () => {
    expect(MAX_SCORE).toBeGreaterThan(3_000);
    expect(MAX_SCORE).toBeLessThan(12_000);
    const best = botTrace(SEED, { think: 0, perMove: 80, extra: 0 }).run.score;
    expect(best).toBeLessThanOrEqual(MAX_SCORE);
  });
});

describe("validate", () => {
  it("acepta una partida real con su duración (siempre cierra a los 120 s)", () => {
    for (const seed of seeds(3)) {
      const a = botTrace(seed, MODEL);
      expect(a.run.solvedCount).toBeGreaterThanOrEqual(3);
      const v = check(seed, a.events, DURATION_MS + 3_000);
      expect(v.ok, `${seed}: ${JSON.stringify(v)}`).toBe(true);
      if (v.ok) expect(v.score).toBe(a.run.score);
      expect(validate({ score: a.run.score, events: a.events }, seed, { elapsedMs: DURATION_MS + 3_000 })).toBe(true);
      expect(check(seed, a.events, DURATION_MS - 500)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
      expect(check(seed, a.events, DURATION_MS + 11_000)).toMatchObject({ ok: false, reason: "el intento duró mucho más que la partida" });
    }
  });

  it("rechaza un puntaje inflado, un auto que atraviesa a otro o sale de la grilla, un auto que no existe, un movimiento sin cambio, estacionamientos salteados, intervalos de 30 ms, tiempos fuera de orden, un reinicio o movimiento mientras sale el sunny, y una traza de otra semilla (de otro jugador o la del grupo)", () => {
    const a = botTrace(SEED, { ...MODEL, solveOnly: 2 });
    const ev = a.events;
    const bad = (events: unknown) => {
      const v = check(SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    expect(bad(ev)).toBe("ok");
    expect(validate({ score: a.run.score + 10, events: ev }, SEED)).toBe(false);
    // un auto que atraviesa a otro: el primer movimiento con el doble de recorrido fuera de lo legal
    const first = ev[0] as Extract<ParkingEvent, { type: "move" }>;
    const range = legalRange(puzzleAt(SEED, 1).cars, puzzleAt(SEED, 1).start, first.car);
    const beyond = first.delta > 0 ? range.max + 1 : range.min - 1;
    expect(bad([{ ...first, delta: beyond }, ...ev.slice(1)])).toBe("movimiento imposible: atraviesa otro auto o sale de la grilla");
    expect(bad([{ ...first, delta: 9 }, ...ev.slice(1)])).toBe("movimiento imposible: atraviesa otro auto o sale de la grilla");
    expect(bad([{ ...first, car: 99 }, ...ev.slice(1)])).toBe("auto que no existe");
    expect(bad([{ ...first, delta: 0 }, ...ev.slice(1)])).toBe("movimiento sin cambio");
    expect(bad([{ ...first, puzzle: 2 }, ...ev.slice(1)])).toBe("el estacionamiento no es el que corresponde");
    expect(bad([ev[0], { ...ev[1], t: ev[0]!.t + 30 }, ...ev.slice(2)])).toBe("dos movimientos demasiado seguidos");
    expect(bad([ev[1], ev[0], ...ev.slice(2)])).toBe("tiempos fuera de orden");
    // un movimiento mientras sale el sunny (justo después del que lo sacó)
    const solvedAt = ev.findIndex((e, i) => i > 0 && e.puzzle === 1 && ev[i + 1]?.puzzle === 2);
    expect(bad([...ev.slice(0, solvedAt + 1), { t: ev[solvedAt]!.t + 200, puzzle: 1, type: "reset" }, ...ev.slice(solvedAt + 1)])).toBe("movimiento mientras sale el sunny");
    expect(bad([...ev, { t: DURATION_MS + 1_000, puzzle: 3, type: "reset" }])).toBe("evento después de los 120 s");
    expect(bad("nada")).toBe("la traza no es una lista");
    expect(bad([{ t: 1 }])).toBe("evento mal formado");
    // la traza de otro jugador (otra semilla) o la de la ronda no sirven: los estacionamientos son otros
    const other = botTrace("otro-jugador", { ...MODEL, solveOnly: 2 });
    expect(validate({ score: other.run.score, events: other.events }, SEED)).toBe(false);
    const group = botTrace("semilla-de-la-ronda", { ...MODEL, solveOnly: 2 });
    expect(validate({ score: group.run.score, events: group.events }, SEED)).toBe(false);
  });
});

describe("calibración", () => {
  it("el jugador modelo saca entre 4 y 7 sunnys; el rápido, más; el lento, menos", () => {
    const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
    const ss = seeds(12);
    const model = ss.map((s) => botTrace(s, MODEL).run.solvedCount);
    const fast = ss.map((s) => botTrace(s, { think: 2_000, perMove: 800, extra: 0 }).run.solvedCount);
    const slow = ss.map((s) => botTrace(s, { think: 6_000, perMove: 1_800, extra: 2 }).run.solvedCount);
    process.stdout.write(`sunny: modelo sunnys p10/med/p90 ${q(model, 0.1)}/${q(model, 0.5)}/${q(model, 0.9)}; rápido ${q(fast, 0.5)}; lento ${q(slow, 0.5)}\n`);
    expect(q(model, 0.5)).toBeGreaterThanOrEqual(4);
    expect(q(model, 0.5)).toBeLessThanOrEqual(7);
    expect(q(fast, 0.5)).toBeGreaterThan(q(model, 0.5));
    expect(q(slow, 0.5)).toBeLessThan(q(model, 0.5));
  }, 300_000);
});

describe("control y arte", () => {
  it("el arrastre sigue al dedo solo sobre el eje del auto, recortado a lo que puede moverse; lo perpendicular se ignora", () => {
    const range = { min: -1, max: 2 };
    expect(dragOffset(true, { x: 50, y: 50 }, { x: 50 + CELL * 1.4, y: 90 }, range)).toBeCloseTo(1.4);
    expect(dragOffset(true, { x: 50, y: 50 }, { x: 50 + CELL * 5, y: 50 }, range)).toBe(2);
    expect(dragOffset(true, { x: 50, y: 50 }, { x: 50 - CELL * 3, y: 50 }, range)).toBe(-1);
    expect(dragOffset(true, { x: 50, y: 50 }, { x: 50, y: 50 + CELL * 3 }, range)).toBe(0);
    expect(dragOffset(false, { x: 50, y: 50 }, { x: 50 + CELL * 3, y: 50 + CELL * 0.6 }, range)).toBeCloseTo(0.6);
    expect(cellAt(10, TOP + 10)).toEqual({ col: 0, row: 0 });
    expect(cellAt(10, 10)).toBeNull();
    expect(carAtCell(THREE, THREE.start, 1, SUNNY_ROW)).toBe(0);
    expect(carAtCell(THREE, THREE.start, 3, 1)).toBe(1);
    expect(carAtCell(THREE, THREE.start, 5, 5)).toBe(-1);
    expect(mmss(102_000)).toBe("1:42");
    expect(mmss(0)).toBe("0:00");
  });
  it("los autos tienen su tamaño en casillas, el sunny es rojo y los negros tienen brillos azulados; girar un sprite lo pone vertical", () => {
    expect([sunnySprite().w, sunnySprite().h]).toEqual([40, 20]);
    expect(sunnySprite().px.some((p) => p.c === "#C8322B")).toBe(true);
    expect(sunnySprite().px.some((p) => p.c === "#15161B")).toBe(false);
    const truck = carSprite({ len: 3, horizontal: true, look: 2 });
    expect([truck.w, truck.h]).toEqual([60, 20]);
    expect(truck.px.some((p) => p.c === "#6F8FC2")).toBe(true);
    const vertical = carSprite({ len: 2, horizontal: false, look: 1 });
    expect([vertical.w, vertical.h]).toEqual([20, 40]);
    const r = rotateSprite({ w: 3, h: 1, px: [{ x: 0, y: 0, c: "#fff" }] });
    expect([r.w, r.h]).toEqual([1, 3]);
    expect(r.px[0]).toEqual({ x: 0, y: 0, c: "#fff" });
  });
});
