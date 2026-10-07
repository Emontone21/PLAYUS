import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advance,
  applyMove,
  baseMs,
  botTrace,
  check,
  currentShuffle,
  DURATION_MS,
  END_MARGIN_MS,
  finalPos,
  firstMsFor,
  FLOOR,
  GAP_MS,
  jotaSays,
  jotaShuffles,
  LAST_FACTOR,
  LINES,
  MAX_SCORE,
  MODEL,
  movesFor,
  moveStarts,
  moveMs,
  newRun,
  PATIENCE_MS,
  phaseEnd,
  pick,
  REVEAL_MS,
  ROUND_COUNT,
  SHOW_MS,
  shuffleMs,
  SPECIAL_FROM,
  specialShare,
  validate,
  type Move,
  type Pos,
  type Run,
} from "./rules";
import { jotaSprite as libJota, tussiSprite } from "../lib/jota";
import { jotaSprite as pegJota, substanceSprite } from "../pegandole-al-jota/sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const ALL: Pos[] = [0, 1, 2];

/** avanza hasta que se pueda elegir en la ronda actual */
function untilPick(run: Run): number {
  while (run.phase !== "pick") advance(run, phaseEnd(run));
  return run.phaseAt;
}

describe("las mezclas", () => {
  it("jotaShuffles es determinística y depende de la semilla", () => {
    expect(jotaShuffles(SEED)).toEqual(jotaShuffles(SEED));
    expect(jotaShuffles(SEED)).not.toEqual(jotaShuffles("otra"));
    expect(jotaShuffles(SEED)).toHaveLength(ROUND_COUNT);
    expect(readFileSync(new URL("./rules.ts", import.meta.url), "utf8")).not.toMatch(/Math\.random/);
  });

  it("la posición de la bolsita después de cada tipo de movimiento", () => {
    const at = (m: Move) => ALL.map((p) => applyMove(p, m));
    // intercambio y amague, en los dos sentidos
    expect(at({ kind: "swap", a: 0, b: 1, ms: 300 })).toEqual([1, 0, 2]);
    expect(at({ kind: "swap", a: 1, b: 0, ms: 300 })).toEqual([1, 0, 2]);
    expect(at({ kind: "swap", a: 0, b: 2, ms: 300 })).toEqual([2, 1, 0]);
    expect(at({ kind: "fake", a: 0, b: 2, ms: 300 })).toEqual([0, 1, 2]);
    expect(at({ kind: "fake", a: 2, b: 1, ms: 300 })).toEqual([0, 1, 2]);
    // rotación, en los dos sentidos
    expect(at({ kind: "rotate", dir: 1, ms: 300 })).toEqual([1, 2, 0]);
    expect(at({ kind: "rotate", dir: -1, ms: 300 })).toEqual([2, 0, 1]);
    // ráfaga: los intercambios uno detrás del otro
    expect(at({ kind: "burst", swaps: [[0, 1], [1, 2], [0, 2]], ms: 180 })).toEqual([0, 2, 1]);
    // salto desde cada punta: la punta pasa a la otra y los otros dos se corren
    expect(at({ kind: "jump", from: 0, ms: 300 })).toEqual([2, 0, 1]);
    expect(at({ kind: "jump", from: 2, ms: 300 })).toEqual([1, 2, 0]);
    // cambio de bolsita hacia cada uno de los otros vasos
    for (const from of ALL) for (const to of ALL.filter((p) => p !== from)) expect(applyMove(from, { kind: "pass", from, to, ms: 350 })).toBe(to);
  });

  it("en 1.000 semillas: la cantidad de movimientos y de jugadas sigue la tabla, la mezcla se acelera hasta el 55 %, nadie baja de su piso, cada jugada desde su ronda, nunca dos seguidas ni dos cambios de bolsita", () => {
    expect([1, 3, 6, 10, 15, 16, 21, 22, 30].map(movesFor)).toEqual([3, 5, 8, 12, 16, 17, 22, 22, 22]);
    expect([1, 3, 6, 10, 15, 30].map(firstMsFor)).toEqual([600, 500, 400, 320, 260, 260]);
    // la aceleración: cada uno más rápido que el anterior y el último al 55 %
    for (let r = 1; r <= ROUND_COUNT; r++) {
      const n = movesFor(r);
      for (let i = 1; i < n; i++) expect(baseMs(r, i, n)).toBeLessThan(baseMs(r, i - 1, n));
      expect(Math.abs(baseMs(r, n - 1, n) - firstMsFor(r) * LAST_FACTOR)).toBeLessThanOrEqual(1);
    }
    const specials = new Map<number, { all: number; sp: number }>();
    const problems: string[] = [];
    for (const seed of SEEDS) {
      jotaShuffles(seed).forEach((s, i) => {
        const r = i + 1;
        if (s.moves.length !== movesFor(r)) problems.push(`${seed} r${r}: ${s.moves.length} movimientos`);
        let passes = 0;
        s.moves.forEach((m, j) => {
          const e = specials.get(r) ?? { all: 0, sp: 0 };
          e.all++;
          if (m.kind !== "swap") e.sp++;
          specials.set(r, e);
          if (m.kind !== "swap" && r < SPECIAL_FROM[m.kind]) problems.push(`${seed} r${r}: ${m.kind} antes de tiempo`);
          if (m.kind !== "swap" && j > 0 && s.moves[j - 1]!.kind !== "swap") problems.push(`${seed} r${r}: dos jugadas seguidas`);
          if (m.kind === "pass") passes++;
          const floor = m.kind === "jump" ? FLOOR.jump : m.kind === "pass" ? FLOOR.pass : FLOOR.common;
          if (m.ms < floor) problems.push(`${seed} r${r}: ${m.kind} a ${m.ms} ms`);
          // con el piso, nunca más lento que la duración base de su lugar
          if (m.kind !== "burst" && m.ms !== Math.max(floor, baseMs(r, j, s.moves.length))) problems.push(`${seed} r${r}: ${m.kind} con duración ${m.ms}`);
        });
        if (passes > 1) problems.push(`${seed} r${r}: ${passes} cambios de bolsita`);
      });
    }
    expect(problems.slice(0, 5)).toEqual([]);
    // la proporción de jugadas: ninguna hasta la 3; cerca de la tabla después (sin dos seguidas, un poco menos)
    for (const r of [1, 2, 3]) expect(specials.get(r)!.sp).toBe(0);
    for (const r of [6, 10, 15, 20]) {
      const e = specials.get(r)!;
      const share = e.sp / e.all;
      expect(share, `ronda ${r}`).toBeGreaterThan(specialShare(r) * 0.85);
      expect(share, `ronda ${r}`).toBeLessThan(specialShare(r) * 1.15);
    }
  });

  it("la mezcla dura lo que suman sus movimientos con 40 ms entre uno y otro, sin superponerse", () => {
    const s = jotaShuffles(SEED)[12]!;
    const starts = moveStarts(s);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBe(moveMs(s.moves[i - 1]!) + GAP_MS);
    expect(shuffleMs(s)).toBe(starts[starts.length - 1]! + moveMs(s.moves[s.moves.length - 1]!));
    // el cambio de bolsita se ve viajar 350 ms o más
    for (const seed of SEEDS.slice(0, 200)) for (const sh of jotaShuffles(seed)) for (const m of sh.moves) if (m.kind === "pass") expect(m.ms).toBeGreaterThanOrEqual(350);
  });
});

describe("reglas", () => {
  it("acertar suma una ronda y la siguiente empieza a los 700 ms; errar termina; los toques en mostrar, mezclar y revelar se ignoran", () => {
    const run = newRun(jotaShuffles(SEED));
    expect(pick(run, 100, 0)).toBe("bloqueada");
    expect(pick(run, SHOW_MS + 10, 0)).toBe("bloqueada");
    const t0 = untilPick(run);
    expect(t0).toBe(SHOW_MS + shuffleMs(currentShuffle(run)));
    const answer = finalPos(currentShuffle(run));
    expect(pick(run, t0 + 300, answer)).toBe("bien");
    expect(run.score).toBe(1);
    expect(pick(run, t0 + 300 + REVEAL_MS - 1, answer)).toBe("bloqueada");
    advance(run, t0 + 300 + REVEAL_MS);
    expect(run.index).toBe(1);
    expect(run.phase).toBe("show");
    const t1 = untilPick(run);
    const wrong = ((finalPos(currentShuffle(run)) + 1) % 3) as Pos;
    expect(pick(run, t1 + 200, wrong)).toBe("mal");
    expect(run.phase).toBe("over");
    expect(run.score).toBe(1);
    expect(pick(run, t1 + 5000, 0)).toBe("terminada");
  });

  it("el jota: a los 6 s sin elegir dice '¿y? ¿cuál, bro?' y no corta la ronda; en la ráfaga se concentra; al acertar regala y al errar se burla", () => {
    const run = newRun(jotaShuffles(SEED));
    const t0 = untilPick(run);
    expect(jotaSays(run, t0 + PATIENCE_MS - 1)).toEqual({ face: "neutral", text: null });
    expect(jotaSays(run, t0 + PATIENCE_MS)).toEqual({ face: "impaciente", text: LINES.patience });
    expect(pick(run, t0 + PATIENCE_MS + 3000, finalPos(currentShuffle(run)))).toBe("bien");
    expect(jotaSays(run, run.t + 10)).toEqual({ face: "contento", text: LINES.win });
    // una ráfaga: cara de concentrado y "mirá bien, bro"
    const shuffles = jotaShuffles(SEED);
    const r = shuffles.findIndex((s) => s.moves.some((m) => m.kind === "burst"));
    const b = botTrace(SEED, { stopAtRound: r + 1 });
    const rr = b.run;
    while (rr.phase !== "shuffle") advance(rr, phaseEnd(rr));
    const i = currentShuffle(rr).moves.findIndex((m) => m.kind === "burst");
    expect(jotaSays(rr, rr.phaseAt + moveStarts(currentShuffle(rr))[i]! + 5)).toEqual({ face: "concentrado", text: LINES.burst });
    const lost = botTrace(SEED, { failRounds: [1] }).run;
    expect(jotaSays(lost, lost.t + 10)).toEqual({ face: "burlon", text: LINES.lose });
  });
});

describe("validate", () => {
  it("acepta una partida real", () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const b = botTrace(seed, MODEL);
      const v = check(seed, b.events, 125_000);
      expect(v.ok, JSON.stringify(v).slice(0, 200)).toBe(true);
      expect(validate({ score: b.run.score, events: b.events }, seed, { elapsedMs: 125_000 })).toBe(true);
    }
  });

  it("rechaza rondas infladas, eventos después de un error, rondas salteadas, elecciones antes de que termine la mezcla y otra semilla", () => {
    const b = botTrace(SEED, { react: [400, 400], failRounds: [5] });
    const ev = b.events;
    expect(b.run.score).toBe(4);
    const bad = (events: unknown, ms?: number) => {
      const v = check(SEED, events, ms);
      return v.ok ? "ok" : v.reason;
    };
    expect(validate({ score: 5, events: ev }, SEED)).toBe(false);
    expect(validate({ score: 4, events: ev }, "otra")).toBe(false);
    const last = ev[ev.length - 1]!;
    expect(bad([...ev, { round: 6, t: last.t + 5000, cup: 0 }])).toBe("evento después de un error");
    expect(bad([ev[0], { ...ev[2]! }])).toBe("rondas no consecutivas");
    expect(bad([{ ...ev[0]!, round: 2 }])).toBe("rondas no consecutivas");
    expect(bad([{ ...ev[0]!, t: SHOW_MS + 50 }])).toBe("elección antes de que termine la mezcla");
    expect(bad([ev[0], { ...ev[1]!, t: ev[0]!.t - 5 }])).toBe("tiempos fuera de orden");
    expect(bad([{ round: 1, t: DURATION_MS + END_MARGIN_MS + 1, cup: 0 }])).toBe("elección después del final");
    expect(bad([{ ...ev[0]!, cup: 3 }])).toBe("vaso inválido");
    expect(bad(ev, last.t - 1)).toBe("la partida duró más que el intento");
  });

  it("la cota: el jugador perfecto y rápido no la pasa", () => {
    for (const seed of SEEDS.slice(0, 50)) expect(botTrace(seed).run.score).toBeLessThanOrEqual(MAX_SCORE);
    expect(MAX_SCORE).toBeGreaterThan(15);
  });
});

describe("calibración", () => {
  it("el jugador típico llega a la ronda 8 a 12", () => {
    const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
    const runs = SEEDS.slice(0, 300).map((seed) => botTrace(seed, MODEL).run);
    const reached = runs.map((r) => r.index + 1);
    const sharp = SEEDS.slice(0, 300).map((seed) => botTrace(seed, { ...MODEL, losePerMille: 6 }).run.index + 1);
    const distracted = SEEDS.slice(0, 300).map((seed) => botTrace(seed, { ...MODEL, losePerMille: 20 }).run.index + 1);
    process.stdout.write(`bolsita: modelo ronda p25/med/p75 ${q(reached, 0.25)}/${q(reached, 0.5)}/${q(reached, 0.75)}, aciertos med ${q(runs.map((r) => r.score), 0.5)}; atento ${q(sharp, 0.5)}; distraído ${q(distracted, 0.5)}; perfecto ${botTrace(SEED).run.score}; cota ${MAX_SCORE}\n`);
    expect(q(reached, 0.5)).toBeGreaterThanOrEqual(8);
    expect(q(reached, 0.5)).toBeLessThanOrEqual(12);
    expect(q(sharp, 0.5)).toBeGreaterThan(q(reached, 0.5));
    expect(q(distracted, 0.5)).toBeLessThan(q(reached, 0.5));
  });
});

describe("el jota compartido", () => {
  it("el jota y la tussi vienen de games/lib/jota, sin copias", () => {
    expect(pegJota).toBe(libJota);
    expect(substanceSprite("tussi")).toBe(tussiSprite());
    for (const f of ["./sprites.ts", "./draw.ts", "./index.tsx", "../pegandole-al-jota/sprites.ts"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src, f).not.toContain("KCCKKKKKKKKCCK"); // las orejas del jota
      expect(src, f).not.toContain(".KTPPPPPPTK."); // la tussi
    }
  });
});

