import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BANNER_TICKS,
  botTrace,
  check,
  COMBO_GAP_TICKS,
  DIST,
  END_TICK,
  enterTick,
  FIRST_ROCK_TICK,
  FROM_M,
  generateCourse,
  GRAVITY_FAST,
  HOLD_TICKS,
  initialState,
  applyInput,
  jumpProfile,
  LONG,
  MAX_METERS,
  meters,
  MODEL,
  overlapTicks,
  pairGap,
  score,
  SHORT,
  SHORT_LAND,
  SHORT_RISE,
  SIZES,
  SKY_TOP,
  simulate,
  speedAt,
  speedAtDist,
  step,
  TICKS_PER_S,
  validate,
  type Course,
  type InputEvent,
  type Obstacle,
  type TraceEvent,
} from "./rules";
import { signsAt, SIGNS, zoneFor } from "./index";
import { HIGH_CLEAR_TICKS, LONG_LAND, LONG_RISE_BIG, minGapTicks, SPEED_MAX, SPEED_START } from "./rules";
import { nachSideSprite, rockSprite, STREET } from "../lib/nach";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const inputsOf = (events: TraceEvent[]) => events.filter((e): e is InputEvent => !("fin" in e));

/** una calle con un solo grupo de obstáculos, a la altura del tick `at` */
function lone(build: (x0: number) => Obstacle[], at: number): Course {
  return { obstacles: build(DIST[at]! + 20_000) };
}
const rockAt = (kind: "small" | "big") => (x0: number): Obstacle => ({ kind, x0, x1: x0 + SIZES[kind].w, bottom: 0, top: SIZES[kind].h, group: kind, gi: 0 });
const airAt = (look: "cartel" | "zapatillas" | "paloma") => (x0: number): Obstacle => ({ kind: "air", x0, x1: x0 + SIZES[look].w, bottom: SIZES.airBottom, top: look === "paloma" ? SIZES.paloma.top : SKY_TOP, look, height: "head", group: "air-head", gi: 0 });
const lowAt = (x0: number): Obstacle => ({ kind: "air", x0, x1: x0 + SIZES.paloma.w, bottom: SIZES.lowBottom, top: SIZES.lowTop, look: "paloma", height: "low", group: "air-low", gi: 0 });
const highAt = (look: "cartel" | "paloma") => (x0: number): Obstacle => ({ kind: "air", x0, x1: x0 + SIZES[look].w, bottom: SIZES.highBottom, top: look === "paloma" ? SIZES.highBottom + (SIZES.paloma.top - SIZES.airBottom) : SKY_TOP, look, height: "high", group: "air-high", gi: 0 });

/** ¿hay algún momento de despegue (con este tiempo de mantener) que pase la calle sin chocar? */
function anyJumpClears(course: Course, hold: number, from: number, to: number): boolean {
  for (let take = from; take <= to; take++) {
    const s = simulate(SEED, [{ tick: take, input: "jump-down" }, { tick: take + Math.max(1, hold), input: "jump-up" }], to + 120, course);
    if (!s.crashed) return true;
  }
  return false;
}
/** el rango de despegues que vale la pena probar para un obstáculo cerca del tick `at` */
function window(course: Course): [number, number] {
  const [a] = overlapTicks(course.obstacles[0]!);
  return [a - 70, a + 5];
}

describe("determinismo", () => {
  it("sin Math.random; la misma semilla y la misma traza dan lo mismo (la igualdad con el navegador la comprueba el E2E)", () => {
    expect(readFileSync(new URL("./rules.ts", import.meta.url), "utf8")).not.toMatch(/Math\.random/);
    expect(generateCourse(SEED)).toEqual(generateCourse(SEED));
    expect(generateCourse(SEED)).not.toEqual(generateCourse("otra"));
    for (const seed of SEEDS.slice(0, 20)) {
      const b = botTrace(seed, MODEL);
      const v = check(seed, b.events);
      expect(v.ok && v.score).toBe(score(b.state));
    }
  });

  it("la velocidad sube de forma continua sin mesetas: 10 m/s al arrancar, 20 a los 30 s, 28 a los 60 s y 32 de tope a los 120 s", () => {
    expect(speedAt(0) * TICKS_PER_S).toBe(10_020);
    expect(speedAt(30 * TICKS_PER_S) * TICKS_PER_S).toBe(19_980);
    expect(speedAt(60 * TICKS_PER_S) * TICKS_PER_S).toBe(28_020);
    expect(speedAt(END_TICK) * TICKS_PER_S).toBe(31_980);
    expect(speedAt(END_TICK + 600)).toBe(speedAt(END_TICK));
    for (let t = 1; t <= END_TICK; t++) expect(speedAt(t)).toBeGreaterThanOrEqual(speedAt(t - 1));
    expect(speedAt(15 * TICKS_PER_S)).toBeGreaterThan(speedAt(0));
    expect(speedAt(45 * TICKS_PER_S)).toBeGreaterThan(speedAt(30 * TICKS_PER_S));
    expect(speedAt(90 * TICKS_PER_S)).toBeGreaterThan(speedAt(60 * TICKS_PER_S));
    expect(MAX_METERS).toBe(meters(DIST[END_TICK]!));
    expect(MAX_METERS).toBeGreaterThan(2_900);
  });
});

describe("salto", () => {
  it("un toque corto pasa una roca chica y no una grande; mantener pasa una grande y dos chicas seguidas (lento y rápido)", () => {
    for (const at of [200, 3000, 5400]) {
      const small = lone((x) => [rockAt("small")(x)], at);
      const big = lone((x) => [rockAt("big")(x)], at);
      const v = speedAtDist(DIST[at]! + 20_000);
      const pair = lone((x) => {
        const a = rockAt("small")(x);
        return [a, rockAt("small")(a.x1 + pairGap(v))];
      }, at);
      expect(anyJumpClears(small, 0, ...window(small)), `chica con toque, tick ${at}`).toBe(true);
      expect(anyJumpClears(big, 0, ...window(big)), `grande con toque, tick ${at}`).toBe(false);
      expect(anyJumpClears(big, HOLD_TICKS, ...window(big)), `grande manteniendo, tick ${at}`).toBe(true);
      expect(anyJumpClears(pair, HOLD_TICKS, ...window(pair)), `par manteniendo, tick ${at}`).toBe(true);
      expect(anyJumpClears(pair, 0, ...window(pair)), `par con toque, tick ${at}`).toBe(false);
    }
  });

  it("ningún salto pasa por encima de algo en el aire a la altura de la cabeza; lo bajo se salta como a una chica; lo alto no molesta parado pero sí saltando", () => {
    for (const at of [1500, 3000, 5400, 7000]) {
      for (const look of ["cartel", "zapatillas", "paloma"] as const) {
        const c = lone((x) => [airAt(look)(x)], at);
        for (let hold = 0; hold <= HOLD_TICKS; hold += 3) expect(anyJumpClears(c, hold, ...window(c)), `${look}, mantener ${hold}, tick ${at}`).toBe(false);
      }
      const low = lone((x) => [lowAt(x)], at);
      expect(anyJumpClears(low, 0, ...window(low)), `bajo con toque, tick ${at}`).toBe(true);
      const [la, lb] = overlapTicks(low.obstacles[0]!);
      expect(simulate(SEED, [], lb + 30, low).crashed, `bajo parado, tick ${at}`).toBe(true);
      for (const look of ["cartel", "paloma"] as const) {
        const high = lone((x) => [highAt(look)(x)], at);
        const [a, b] = overlapTicks(high.obstacles[0]!);
        expect(simulate(SEED, [], b + 30, high).crashed, `alto parado, tick ${at}`).toBe(false);
        expect(simulate(SEED, [{ tick: a - 2, input: "duck-down" }, { tick: b + 1, input: "duck-up" }], b + 30, high).crashed, `alto agachado, tick ${at}`).toBe(false);
        expect(simulate(SEED, [{ tick: a - 10, input: "jump-down" }, { tick: a + 5, input: "jump-up" }], b + 60, high).crashed, `alto saltando debajo, tick ${at}`).toBe(true);
      }
      void la;
    }
  });
});

describe("agacharse", () => {
  it("pasa por abajo de todo lo que está en el aire, y parado choca", () => {
    for (const at of [1500, 5400]) {
      for (const look of ["cartel", "zapatillas", "paloma"] as const) {
        const c = lone((x) => [airAt(look)(x)], at);
        const [a, b] = overlapTicks(c.obstacles[0]!);
        expect(simulate(SEED, [{ tick: a - 2, input: "duck-down" }, { tick: b + 1, input: "duck-up" }], b + 30, c).crashed).toBe(false);
        expect(simulate(SEED, [], b + 30, c).crashed).toBe(true);
      }
    }
  });

  it("en el aire, hace caer más rápido", () => {
    const fall = (duckAt: number) => {
      const s = initialState();
      applyInput(s, "jump-down");
      let t = 0;
      while (true) {
        if (t === duckAt) applyInput(s, "duck-down");
        step(s, { obstacles: [] });
        t++;
        if (s.ground) return t;
      }
    };
    expect(fall(5)).toBeLessThan(fall(-1));
    // sin soltar el salto, es el largo
    expect(fall(-1)).toBe(LONG.length);
    expect(GRAVITY_FAST).toBeGreaterThan(5);
    // y el largo dura más que el corto
    expect(LONG.length).toBeGreaterThan(SHORT.length);
    expect(jumpProfile(HOLD_TICKS + 20)).toEqual(LONG);
  });
});

describe("obstáculos", () => {
  it("en 1.000 semillas: siguen la tabla (grandes y grupos desde los 150 m, lo del aire a tres alturas desde los 300, combinaciones desde los 800); los grupos son de 2 o 3 rocas; nada llega antes de que termine el salto por lo anterior ni antes del tiempo de reacción; las combinaciones dejan 350 ms; y la primera roca no aparece antes de los 2,5 s", () => {
    const early: string[] = [];
    let minReact = Infinity;
    let minCombo = Infinity;
    let minFirst = Infinity;
    let minEnter = Infinity;
    const seen = new Set<string>();
    const sizes = new Set<number>();
    for (const seed of SEEDS) {
      const obs = generateCourse(seed).obstacles;
      minFirst = Math.min(minFirst, enterTick(obs[0]!));
      let prevLeave = -1;
      let prevLand = -1;
      let prevGi = -1;
      let prevHighLeave = -1;
      for (let i = 0; i < obs.length; i++) {
        const o = obs[i]!;
        const m = meters(o.x0);
        seen.add(o.group);
        if (o.kind === "air" && m < FROM_M.air) early.push(`${seed}: aire a ${m} m`);
        if (o.kind === "big" && m < FROM_M.big) early.push(`${seed}: grande a ${m} m`);
        if (o.group === "cluster" && m < FROM_M.cluster) early.push(`${seed}: grupo a ${m} m`);
        if ((o.group === "rock-air" || o.group === "air-rock") && m < FROM_M.combo) early.push(`${seed}: combinación a ${m} m`);
        const [a, b] = overlapTicks(o);
        minEnter = Math.min(minEnter, a - enterTick(o));
        if (o.gi !== prevGi) {
          // entre grupos: el tiempo de reacción mínimo según la velocidad, y el aterrizaje del salto anterior más el despegue de este
          if (prevLeave >= 0) minReact = Math.min(minReact, a - prevLeave - minGapTicks(speedAt(prevLeave)));
          const rise = o.kind === "big" ? LONG_RISE_BIG : o.kind === "small" || o.height === "low" ? SHORT_RISE : 0;
          if (prevLand >= 0 && rise > 0 && a - rise < prevLand) early.push(`${seed}: ${o.group} a ${m} m llega con el salto anterior en el aire (${a - rise} < ${prevLand})`);
          if (prevLand >= 0 && o.group === "air-high" && a < prevLand + HIGH_CLEAR_TICKS) early.push(`${seed}: alto a ${m} m con un salto en el aire`);
          if (prevHighLeave >= 0 && rise > 0 && a - rise < prevHighLeave) early.push(`${seed}: ${o.group} a ${m} m hace despegar debajo de lo alto`);
          const parts = obs.filter((x) => x.gi === o.gi);
          if (o.group === "cluster") {
            sizes.add(parts.length);
            if (parts.length < 2 || parts.length > 3) early.push(`${seed}: grupo de ${parts.length} a ${m} m`);
            if (!parts.every((x) => x.kind === "small" || x.kind === "big")) early.push(`${seed}: grupo con algo que no es roca`);
          }
          const jumpPart = [...parts].reverse().find((x) => x.kind !== "air" || x.height === "low");
          const needsLong = parts.some((x) => x.kind === "big");
          prevLand = jumpPart ? overlapTicks(jumpPart)[0] - (needsLong ? LONG_RISE_BIG : SHORT_RISE) + (needsLong ? LONG_LAND : SHORT_LAND) : -1;
          prevHighLeave = o.group === "air-high" ? overlapTicks(parts[parts.length - 1]!)[1] : -1;
          prevGi = o.gi;
        }
        prevLeave = Math.max(prevLeave, b);
        const n = obs[i + 1];
        if (n && n.gi === o.gi && o.group === "rock-air") minCombo = Math.min(minCombo, overlapTicks(n)[0] - (a + SHORT_LAND - SHORT_RISE));
        if (n && n.gi === o.gi && o.group === "air-rock") minCombo = Math.min(minCombo, overlapTicks(n)[0] - SHORT_RISE - b);
      }
    }
    expect(early.slice(0, 5)).toEqual([]);
    expect(seen).toEqual(new Set(["small", "big", "cluster", "air-low", "air-head", "air-high", "rock-air", "air-rock"]));
    expect(sizes).toEqual(new Set([2, 3]));
    expect(minReact).toBeGreaterThanOrEqual(0);
    expect(minGapTicks(SPEED_START)).toBe(36);
    expect(minGapTicks(467)).toBe(27);
    expect(minGapTicks(SPEED_MAX)).toBe(27);
    expect(minEnter).toBeGreaterThanOrEqual(0.58 * TICKS_PER_S);
    expect(minCombo).toBeGreaterThanOrEqual(COMBO_GAP_TICKS);
    expect(minFirst).toBeGreaterThanOrEqual(FIRST_ROCK_TICK);
  }, 120_000);

  it("con la velocidad vienen más seguidos en el tiempo y más separados en metros", () => {
    const per = (from: number, to: number) => SEEDS.slice(0, 200).reduce((n, seed) => n + generateCourse(seed).obstacles.filter((o) => meters(o.x0) >= from && meters(o.x0) < to).length, 0);
    const perSecond = (from: number, to: number) => per(from, to) / ((overlapTicksAt(to) - overlapTicksAt(from)) / TICKS_PER_S);
    expect(perSecond(1500, 2000)).toBeGreaterThan(perSecond(100, 400));
    expect(per(1500, 2000) / 500).toBeLessThan(per(100, 400) / 300);
    // el mínimo en metros crece con la velocidad
    expect(minGapTicks(SPEED_MAX) * SPEED_MAX).toBeGreaterThan(minGapTicks(SPEED_START) * SPEED_START);
  });
});
function overlapTicksAt(m: number): number {
  return DIST.findIndex((d) => d >= m * 1000);
}

describe("justicia", () => {
  it("el jugador automático con 250 ms de demora llega a los 600 m en el 99 % de 1.000 semillas, y el perfecto nunca choca: no hay combinaciones imposibles a la velocidad del momento", () => {
    const ok = SEEDS.filter((seed) => score(botTrace(seed, { reaction: 15, untilTick: overlapTicksAt(600) + 2 }).state) >= 600).length;
    process.stdout.write(`nach-salta: justo (250 ms) a 600 m en ${ok}/1000\n`);
    expect(ok / SEEDS.length).toBeGreaterThanOrEqual(0.99);
    for (const seed of SEEDS.slice(0, 200)) expect(botTrace(seed, { reaction: 0 }).state.crashed, seed).toBe(false);
  }, 300_000);

  it("la cota: nadie pasa los metros de 120 s", () => {
    let best = 0;
    for (const seed of SEEDS.slice(0, 20)) best = Math.max(best, score(botTrace(seed, { reaction: 15 }).state));
    expect(best).toBeLessThanOrEqual(MAX_METERS);
  });
});

describe("calibración", () => {
  it("la partida típica dura entre 20 y 40 s", () => {
    const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
    const r = SEEDS.slice(0, 200).map((seed) => botTrace(seed, MODEL).state);
    const secs = r.map((x) => (x.crashed ? x.crashAt : x.tick) / TICKS_PER_S);
    const fast = SEEDS.slice(0, 200).map((seed) => botTrace(seed, { ...MODEL, jitter: 3, shortPerMille: 40 }).state);
    const slow = SEEDS.slice(0, 200).map((seed) => botTrace(seed, { ...MODEL, jitter: 5 }).state);
    const med = (xs: { crashed: boolean; crashAt: number; tick: number }[]) => q(xs.map((x) => (x.crashed ? x.crashAt : x.tick) / TICKS_PER_S), 0.5);
    process.stdout.write(`nach-salta: modelo s p25/med/p75 ${q(secs, 0.25).toFixed(0)}/${q(secs, 0.5).toFixed(0)}/${q(secs, 0.75).toFixed(0)}, metros med ${q(r.map(score), 0.5)}; preciso ${med(fast).toFixed(0)} s; impreciso ${med(slow).toFixed(0)} s; cota ${MAX_METERS} m\n`);
    expect(q(secs, 0.25)).toBeGreaterThanOrEqual(20);
    expect(q(secs, 0.75)).toBeLessThanOrEqual(40);
    expect(med(slow)).toBeLessThan(q(secs, 0.5));
    expect(med(fast)).toBeGreaterThan(q(secs, 0.5));
  });
});

describe("control y carteles", () => {
  it("antes de los 300 m toda la pantalla salta; desde ahí la izquierda agacha", () => {
    const s = initialState();
    expect(zoneFor(s, 0.1)).toBe("jump");
    expect(zoneFor(s, 0.9)).toBe("jump");
    s.dist = 299_999;
    expect(zoneFor(s, 0.1)).toBe("jump");
    s.dist = 300_000;
    expect(zoneFor(s, 0.1)).toBe("duck");
    expect(zoneFor(s, 0.6)).toBe("jump");
  });

  it("'Nach no caigas en la roca' al empezar, hasta los 1,8 s; '¡ahora agachate!' a los 300 m; 'no denuevo nach' al chocar", () => {
    expect(SIGNS).toEqual({ start: "Nach no caigas en la roca", duck: "¡ahora agachate!", crash: "no denuevo nach" });
    expect(BANNER_TICKS).toBe(108);
    const course = generateCourse(SEED);
    const s = initialState();
    expect(signsAt(s)).toEqual({ start: true, duck: false, crash: false });
    while (s.tick < BANNER_TICKS - 1) step(s, course);
    expect(signsAt(s).start).toBe(true);
    step(s, course);
    expect(signsAt(s).start).toBe(false);
    // sin tocar nada, choca con la primera roca
    while (!s.crashed && s.tick < 2000) step(s, course);
    expect(signsAt(s)).toEqual({ start: false, duck: false, crash: true });
    // el jugador justo pasa los 300 m: ahí sale el cartel
    const b = botTrace(SEED, { reaction: 15, untilTick: overlapTicksAt(350) });
    expect(b.state.splitAt).toBe(overlapTicksAt(300));
    const at = simulate(SEED, inputsOf(b.events), b.state.splitAt + 5);
    expect(signsAt(at).duck).toBe(true);
  });
});

describe("The Nach compartido", () => {
  it("los sprites y la paleta vienen de games/lib/nach, sin copias; los de costado tienen sus 7 poses", () => {
    expect(STREET.neons).toHaveLength(5);
    expect([rockSprite(1).w, rockSprite(3).h]).toEqual([SIZES.small.w / 100, SIZES.big.h / 100]);
    for (const f of ["./sprites.ts", "./draw.ts", "./index.tsx"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src, f).not.toContain("KLLRRK"); // las rocas
      expect(src, f).not.toContain('"#FF6F91", "#6FD3E0", "#FFD34E", "#8EDC66"'); // los neones
      expect(src, f).not.toContain("KMMMKPPpPPPK"); // The Nach de costado
    }
    for (const pose of ["run0", "run1", "run2", "run3", "jump"] as const) expect([nachSideSprite(pose).w, nachSideSprite(pose).h]).toEqual([16, 24]);
    expect(nachSideSprite("duck").h).toBe(12);
  });
});

describe("validate", () => {
  it("acepta una partida real con su duración", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const b = botTrace(seed, MODEL);
      const end = (b.events[b.events.length - 1] as { tick: number }).tick;
      const ms = Math.floor((end * 1000) / TICKS_PER_S) + 3000;
      expect(check(seed, b.events, ms).ok).toBe(true);
      expect(validate({ score: score(b.state), events: b.events }, seed, { elapsedMs: ms })).toBe(true);
    }
  });

  it("rechaza metros inflados, eventos mal alternados, ticks fuera de orden, otra semilla y un fin incoherente", () => {
    const b = botTrace(SEED, MODEL);
    const ev = b.events;
    const t = inputsOf(ev);
    const end = ev[ev.length - 1] as { tick: number; fin: true };
    const bad = (events: unknown, ms?: number) => {
      const v = check(SEED, events, ms);
      return v.ok ? "ok" : v.reason;
    };
    expect(validate({ score: score(b.state) + 1, events: ev }, SEED)).toBe(false);
    expect(validate({ score: score(b.state), events: ev }, "otra")).toBe(false);
    expect(bad([{ tick: 10, input: "jump-up" }, end])).toBe("eventos mal alternados");
    expect(bad([{ tick: 10, input: "duck-down" }, { tick: 20, input: "duck-down" }, end])).toBe("eventos mal alternados");
    expect(bad([{ tick: 10, input: "jump-down" }, { tick: 12, input: "jump-down" }, end])).toBe("eventos mal alternados");
    expect(bad([{ tick: 20, input: "duck-down" }, { tick: 10, input: "duck-up" }, end])).toBe("ticks fuera de orden");
    expect(t.length).toBeGreaterThan(2);
    expect(bad([{ tick: 10, input: "saltar" }, end])).toBe("control inválido");
    expect(bad([...t, { tick: END_TICK + 1, fin: true }])).toBe("tick de fin fuera de rango");
    expect(bad([{ tick: end.tick, input: "jump-down" }, end])).toBe("evento después del final");
    const endMs = Math.floor((end.tick * 1000) / TICKS_PER_S);
    expect(bad(ev, endMs - 500)).toBe("la partida duró más que el intento");
    expect(bad(ev, endMs + 11_000)).toBe("el intento duró mucho más que la partida");
  });
});
