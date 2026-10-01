import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyTap,
  BAR_MAX,
  botTrace,
  check,
  effectiveSpeed,
  END_TICK,
  FREEZE_TICKS,
  initialState,
  isFrozen,
  isHit,
  LIVES,
  MAX_SCORE,
  PASS_TICKS_END,
  PASS_TICKS_START,
  posUnits,
  simulate,
  SPEED_END,
  SPEED_START,
  speedAt,
  step,
  SUB,
  TICKS_PER_S,
  validate,
  VARIATION_PERMILLE,
  zoneHalfAt,
  type TapEvent,
  type TraceEvent,
} from "./rules";
import { hitLine, MISS_LINE } from "./index";
import { remarSprite, remarAtTable, pomoSprite } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 300 }, (_, i) => `semilla-${i}`);
const tapsOf = (events: TraceEvent[]) => events.filter((e): e is TapEvent => !("fin" in e));
const endOf = (events: TraceEvent[]) => events[events.length - 1]!.tick;
const elapsedFor = (events: TraceEvent[]) => 3_000 + Math.floor((endOf(events) * 1000) / TICKS_PER_S) + 1_000;
/** el jugador modelo: apunta al centro con ±50 ms de error, una pasada de cada dos */
const HUMAN = { jitterTicks: 3, every: 2 };

describe("la simulación es entera y determinística", () => {
  it("no usa Math.sin, Math.cos ni Math.random, y la misma semilla con la misma traza da lo mismo", () => {
    const src = readFileSync(new URL("./rules.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/Math\.(sin|cos|random)/);
    for (const seed of SEEDS.slice(0, 50)) {
      const a = botTrace(seed, HUMAN);
      const b = botTrace(seed, HUMAN);
      expect(b.events).toEqual(a.events);
      expect([b.result.score, b.result.state.pos, b.result.state.speed]).toEqual([a.result.score, a.result.state.pos, a.result.state.speed]);
      const r = simulate(seed, tapsOf(a.events), a.result.endTick + 1);
      expect([r.score, r.state.pos, r.state.speed, r.endTick]).toEqual([a.result.score, a.result.state.pos, a.result.state.speed, a.result.endTick]);
    }
    // otra semilla, otra partida
    expect(botTrace("a", HUMAN).events).not.toEqual(botTrace("b", HUMAN).events);
  });
});

describe("la barrita", () => {
  it("rebota en los extremos y nunca se sale de la barra", () => {
    const s = initialState(SEED);
    let bounces = 0;
    let last = s.dir;
    for (let t = 0; t < 600; t++) {
      step(s);
      expect(s.pos).toBeGreaterThanOrEqual(0);
      expect(s.pos).toBeLessThanOrEqual(BAR_MAX * SUB);
      if (s.dir !== last) bounces++;
      last = s.dir;
    }
    expect(bounces).toBeGreaterThanOrEqual(5);
  });

  it("la velocidad sube parejo según el cronograma: una pasada de 1,6 s al arrancar y de 0,6 s a los 60 s", () => {
    expect(SPEED_START).toBe(Math.round((BAR_MAX * SUB) / PASS_TICKS_START));
    expect(SPEED_END).toBe(Math.round((BAR_MAX * SUB) / PASS_TICKS_END));
    expect(speedAt(0)).toBe(SPEED_START);
    expect(speedAt(END_TICK)).toBe(SPEED_END);
    expect(speedAt(END_TICK + 999)).toBe(SPEED_END);
    for (let t = 1; t <= END_TICK; t++) {
      const d = speedAt(t) - speedAt(t - 1);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(2);
    }
    expect(speedAt(END_TICK / 2)).toBeCloseTo((SPEED_START + SPEED_END) / 2, -1);
    // una pasada entera a la velocidad inicial dura ~1,6 s
    const s = initialState(SEED);
    let ticks = 0;
    while (s.dir === 1) {
      step(s);
      ticks++;
    }
    expect(Math.abs(ticks - PASS_TICKS_START)).toBeLessThanOrEqual(PASS_TICKS_START * 0.09);
  });

  it("la variación por arranque queda dentro de ±8 %", () => {
    for (const seed of SEEDS) {
      const s = initialState(seed);
      expect(Math.abs(s.variation - 1000)).toBeLessThanOrEqual(VARIATION_PERMILLE);
      expect(s.speed).toBe(effectiveSpeed(0, s.variation));
      expect(Math.abs(s.speed - SPEED_START) / SPEED_START).toBeLessThanOrEqual(0.081);
      // y después de cada toque también
      for (let t = 0; t < 30; t++) step(s);
      applyTap(s);
      while (isFrozen(s)) step(s);
      expect(Math.abs(s.variation - 1000)).toBeLessThanOrEqual(VARIATION_PERMILLE);
      expect(Math.abs(s.speed - effectiveSpeed(s.tick, 1000)) / effectiveSpeed(s.tick, 1000)).toBeLessThanOrEqual(0.081);
    }
    // y las variaciones no son todas iguales
    const vs = new Set(SEEDS.map((seed) => initialState(seed).variation));
    expect(vs.size).toBeGreaterThan(20);
  });

  it("después de cada toque se congela 400 ms donde quedó y arranca desde un extremo", () => {
    const starts = { left: 0, right: 0 };
    for (const seed of SEEDS.slice(0, 60)) {
      const s = initialState(seed);
      for (let t = 0; t < 40; t++) step(s);
      const posBefore = s.pos;
      const tick = s.tick;
      applyTap(s);
      expect(isFrozen(s)).toBe(true);
      for (let t = 0; t < FREEZE_TICKS - 1; t++) {
        step(s);
        expect(s.pos).toBe(posBefore);
        expect(isFrozen(s)).toBe(true);
      }
      step(s);
      expect(s.tick).toBe(tick + FREEZE_TICKS);
      expect(isFrozen(s)).toBe(false);
      if (s.pos === 0) {
        starts.left++;
        expect(s.dir).toBe(1);
      } else {
        expect(s.pos).toBe(BAR_MAX * SUB);
        expect(s.dir).toBe(-1);
        starts.right++;
      }
      expect(s.speed).toBe(effectiveSpeed(s.tick, s.variation));
    }
    expect(starts.left).toBeGreaterThan(10);
    expect(starts.right).toBeGreaterThan(10);
  });
});

describe("la zona del punto justo", () => {
  it("al arrancar, 440 y 560 cuentan como adentro y 439 y 561 como afuera", () => {
    expect(zoneHalfAt(0)).toBe(60);
    expect(isHit(440, 0)).toBe(true);
    expect(isHit(560, 0)).toBe(true);
    expect(isHit(439, 0)).toBe(false);
    expect(isHit(561, 0)).toBe(false);
  });

  it("a los 60 segundos, 475 y 525 cuentan como adentro y 474 y 526 como afuera", () => {
    expect(zoneHalfAt(END_TICK)).toBe(25);
    expect(isHit(475, END_TICK)).toBe(true);
    expect(isHit(525, END_TICK)).toBe(true);
    expect(isHit(474, END_TICK)).toBe(false);
    expect(isHit(526, END_TICK)).toBe(false);
  });

  it("el ancho baja de forma pareja y nunca crece", () => {
    for (let t = 1; t <= END_TICK; t++) {
      const d = zoneHalfAt(t - 1) - zoneHalfAt(t);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
    expect(zoneHalfAt(END_TICK / 2)).toBe(43);
  });

  it("un mismo punto puede ser acierto al principio y error más tarde", () => {
    expect(isHit(555, 0)).toBe(true);
    expect(isHit(555, END_TICK)).toBe(false);
    expect(isHit(445, 60)).toBe(true);
    expect(isHit(445, 3000)).toBe(false);
  });
});

describe("las reglas", () => {
  /** avanza hasta que la barrita (sin congelar) está en el centro o cerca del borde */
  function runUntil(s: ReturnType<typeof initialState>, where: "centro" | "borde") {
    for (let t = 0; t < 400; t++) {
      step(s);
      const p = posUnits(s);
      if (!isFrozen(s) && (where === "centro" ? Math.abs(p - 500) <= 20 : p < 60 || p > 940)) return;
    }
    throw new Error("no llegó");
  }

  it("embocar suma uno; errar resta una vida; no tocar no penaliza", () => {
    const s = initialState(SEED);
    runUntil(s, "centro");
    expect(applyTap(s)).toBe("hit");
    expect(s.score).toBe(1);
    expect(s.lives).toBe(LIVES);
    while (isFrozen(s)) step(s);
    runUntil(s, "borde");
    expect(applyTap(s)).toBe("miss");
    expect(s.score).toBe(1);
    expect(s.lives).toBe(LIVES - 1);
    // sin tocar, nada cambia hasta el final
    const quiet = initialState("quieta");
    while (quiet.tick < END_TICK) step(quiet);
    expect(quiet.score).toBe(0);
    expect(quiet.lives).toBe(LIVES);
    expect(quiet.end).toBeNull();
  });

  it("tres errores terminan la partida en el tick del tercero", () => {
    const s = initialState(SEED);
    for (let i = 0; i < 3; i++) {
      while (isFrozen(s)) step(s);
      runUntil(s, "borde");
      expect(applyTap(s)).toBe("miss");
    }
    expect(s.lives).toBe(0);
    expect(s.end).toEqual({ tick: s.tick, reason: "vidas" });
    const tick = s.tick;
    step(s);
    expect(s.tick).toBe(tick);
    expect(applyTap(s)).toBe("ignored");
  });

  it("los toques durante el congelamiento se ignoran", () => {
    const s = initialState(SEED);
    runUntil(s, "centro");
    expect(applyTap(s)).toBe("hit");
    expect(applyTap(s)).toBe("ignored");
    step(s);
    expect(applyTap(s)).toBe("ignored");
    expect(s.score).toBe(1);
    expect(s.lives).toBe(LIVES);
  });
});

describe("la traza y validate", () => {
  it("acepta una partida real (con su duración), y rechaza embocadas infladas", () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const a = botTrace(seed, HUMAN);
      expect(a.result.score).toBeGreaterThan(0);
      const v = check(seed, a.events, elapsedFor(a.events));
      expect(v.ok, `${seed}: ${JSON.stringify(v)}`).toBe(true);
      if (v.ok) {
        expect(v.score).toBe(a.result.score);
        expect(v.endReason).toBe(a.result.endReason);
      }
      expect(validate({ score: a.result.score, events: a.events }, seed, { elapsedMs: elapsedFor(a.events) })).toBe(true);
      expect(validate({ score: a.result.score + 1, events: a.events }, seed)).toBe(false);
    }
  });

  it("rechaza un toque durante el congelamiento, ticks fuera de orden, toques después de la tercera vida, otra semilla y un fin incoherente", () => {
    const a = botTrace(SEED, HUMAN);
    const taps = tapsOf(a.events);
    const end = endOf(a.events);
    expect(a.result.endReason).toBe("vidas");
    const bad = (events: unknown) => {
      const v = check(SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    // un toque 5 ticks después del primero: cae congelado
    expect(bad([taps[0], { tick: taps[0]!.tick + 5 }, ...taps.slice(1), { tick: end, fin: true }])).toBe("un toque durante el congelamiento");
    expect(bad([taps[1], taps[0], ...taps.slice(2), { tick: end, fin: true }])).toBe("ticks fuera de orden");
    expect(bad([...taps, { tick: end + 30 }, { tick: end + 60, fin: true }])).toBe("toques después de la tercera vida");
    expect(bad([...taps, { tick: end + 60, fin: true }])).toBe("el tick de fin no es el de la tercera vida");
    expect(bad([...taps, { tick: END_TICK + 1, fin: true }])).toBe("tick de fin fuera de rango");
    expect(bad(taps)).toBe("falta el cierre de la traza");
    expect(bad([{ tick: 1.5 }, { tick: end, fin: true }])).toBe("toque mal armado");
    // la misma traza con otra semilla: la barrita está en otro lado
    expect(validate({ score: a.result.score, events: a.events }, "otra")).toBe(false);
    // la duración real
    const endMs = Math.floor((end * 1000) / TICKS_PER_S);
    expect(check(SEED, a.events, endMs - 500)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
    expect(check(SEED, a.events, endMs + 11_000)).toMatchObject({ ok: false, reason: "el intento duró mucho más que la partida" });
    expect(check(SEED, a.events, endMs + 4_000)).toMatchObject({ ok: true });
  });

  it("una partida cortada por tiempo cierra en cualquier tick hasta el 3600, sin toques en el cierre ni después", () => {
    const a = botTrace(SEED, { maxTaps: 2 });
    const taps = tapsOf(a.events);
    expect(check(SEED, [...taps, { tick: 3600, fin: true }])).toMatchObject({ ok: true, score: 2, endReason: null });
    expect(check(SEED, [...taps, { tick: taps[1]!.tick + 100, fin: true }])).toMatchObject({ ok: true, score: 2 });
    expect(check(SEED, [...taps, { tick: taps[1]!.tick, fin: true }])).toMatchObject({ ok: false, reason: "toque después del final" });
    expect(MAX_SCORE).toBe(150);
  });
});

describe("calibración", () => {
  it("el jugador modelo emboca entre 10 y 20 y pierde las vidas entre los 25 y los 50 s; el perfecto no pierde ninguna", () => {
    const stats = (opts: Parameters<typeof botTrace>[1]) => {
      const scores: number[] = [];
      const ends: number[] = [];
      for (const seed of SEEDS.slice(0, 150)) {
        const r = botTrace(seed, opts).result;
        scores.push(r.score);
        ends.push(r.endTick / TICKS_PER_S);
      }
      const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
      return { score: [q(scores, 0.25), q(scores, 0.5), q(scores, 0.75)], end: [q(ends, 0.25), q(ends, 0.5), q(ends, 0.75)] };
    };
    const human = stats(HUMAN);
    const sharp = stats({ jitterTicks: 2, every: 2 });
    const careful = stats({ jitterTicks: 3, every: 3 });
    const perfect = botTrace(SEED, {}).result;
    process.stdout.write(
      [
        `jugador modelo (±50 ms, una pasada de cada dos): embocadas p25/med/p75 ${human.score.join("/")}, fin ${human.end.map((e) => e.toFixed(0)).join("/")} s`,
        `jugador fino (±33 ms): embocadas ${sharp.score.join("/")}, fin ${sharp.end.map((e) => e.toFixed(0)).join("/")} s`,
        `jugador cauto (±50 ms, una de cada tres): embocadas ${careful.score.join("/")}, fin ${careful.end.map((e) => e.toFixed(0)).join("/")} s`,
        `perfecto: ${perfect.score} embocadas, ${perfect.lives} vidas`,
      ].join("\n") + "\n",
    );
    expect(human.score[1]).toBeGreaterThanOrEqual(10);
    expect(human.score[1]).toBeLessThanOrEqual(20);
    expect(human.end[1]).toBeGreaterThanOrEqual(25);
    expect(human.end[1]).toBeLessThanOrEqual(50);
    expect(perfect.lives).toBe(LIVES);
    expect(perfect.score).toBeLessThanOrEqual(MAX_SCORE);
  });
});

describe("el arte y los textos", () => {
  it("Remar tiene tres caras del mismo tamaño, y las frases salen de la semilla", () => {
    for (const face of ["espera", "contento", "enojado"] as const) {
      const s = remarSprite(face);
      expect([s.w, s.h]).toEqual([16, 16]);
    }
    expect(JSON.stringify(remarAtTable("contento", "justo"))).not.toBe(JSON.stringify(remarAtTable("espera")));
    expect([pomoSprite().w, pomoSprite().h]).toEqual([6, 9]);
    expect(["¡eso!", "punto justo"]).toContain(hitLine("x", 10));
    expect(hitLine("x", 10)).toBe(hitLine("x", 10));
    const both = new Set(Array.from({ length: 40 }, (_, i) => hitLine("x", i)));
    expect(both.size).toBe(2);
    expect(MISS_LINE).toBe("no seas sopa");
  });
});
