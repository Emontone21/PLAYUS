import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  angDist,
  BOTTOM,
  BREAK_TICKS,
  botTrace,
  broSays,
  check,
  END_TICK,
  FLIGHT_TICKS,
  INGREDIENT_HALF,
  initialState,
  LINES,
  MAX_ACCEL,
  MAX_SCORE,
  MAX_SPEED,
  MIN_SEPARATION,
  MODEL,
  mod,
  POINTS,
  PRE_GAP,
  relativeAngle,
  simulate,
  speedProfile,
  step,
  throwKnife,
  TICKS_PER_S,
  TURN,
  validate,
  wheelSpec,
  type SimState,
  type ThrowEvent,
  type TraceEvent,
  type WheelSpec,
} from "./rules";
import { bigBroSprite } from "../lib/big-bro";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const throwsOf = (events: TraceEvent[]) => events.filter((e): e is ThrowEvent => !("fin" in e)).map((e) => e.tick);

/** una horma quieta en el ángulo `angle` (o girando a `vel`), con cuchillas e ingredientes a mano */
function fixed(s: SimState, angle: number, opts: { vel?: number; stuck?: number[]; ingredients?: number[]; throws?: number; thrown?: number; big?: boolean } = {}): void {
  const vel = opts.vel ?? 0;
  const spec: WheelSpec = { ...s.wheel.spec, big: !!opts.big, throws: opts.throws ?? 10, pre: opts.stuck ?? [], ingredients: (opts.ingredients ?? []).map((a) => ({ angle: a, kind: "tomate" })), pattern: [{ target: vel, ticks: 100_000 }], accel: MAX_ACCEL, startAngle: angle };
  s.wheel = { spec, spin: { angle, vel, seg: 0, left: 100_000 }, stuck: spec.pre.map((rel) => ({ rel, thrown: false, tick: -1 })), ingredients: spec.ingredients.map((g) => ({ ...g, hitAt: -1 })), thrown: opts.thrown ?? 0 };
}
/** tira y espera a que llegue */
function throwAndLand(s: SimState): void {
  expect(throwKnife(s)).toBe("ok");
  for (let i = 0; i < FLIGHT_TICKS; i++) step(s);
}

describe("determinismo", () => {
  it("sin Math.random; la misma semilla y los mismos tiros dan lo mismo (la igualdad con el navegador la comprueba el E2E)", () => {
    expect(readFileSync(new URL("./rules.ts", import.meta.url), "utf8")).not.toMatch(/Math\.random/);
    for (const seed of SEEDS.slice(0, 20)) {
      const a = botTrace(seed, MODEL);
      expect(botTrace(seed, MODEL).events).toEqual(a.events);
      const v = check(seed, a.events);
      expect(v.ok && v.score).toBe(a.state.score);
    }
    expect(wheelSpec("a", 3)).not.toEqual(wheelSpec("b", 3));
  });
});

describe("geometría", () => {
  it("el ángulo relativo de la cuchilla, en los dos sentidos de giro y al pasar por 0 / 3.600", () => {
    expect(relativeAngle(0)).toBe(BOTTOM);
    expect(relativeAngle(BOTTOM)).toBe(0);
    expect(relativeAngle(1000)).toBe(3500);
    expect(relativeAngle(3599)).toBe(901);
    for (const vel of [37, -37]) {
      const s = initialState(SEED);
      fixed(s, 3590, { vel });
      throwAndLand(s);
      // la horma giró 6 ticks a `vel`, pasando por 0 / 3.600
      const arrival = mod(3590 + FLIGHT_TICKS * vel);
      expect(s.wheel.stuck[0]!.rel).toBe(mod(BOTTOM - arrival));
    }
    expect(angDist(10, 3590)).toBe(20);
    expect(angDist(3590, 10)).toBe(20);
  });

  it("a 89 unidades de otra cuchilla choca; a 90, no", () => {
    for (const [gap, crash] of [
      [89, true],
      [90, false],
      [-89, true],
      [-90, false],
    ] as const) {
      const s = initialState(SEED);
      // quieta: la que llega se clava en BOTTOM - 0 = 900
      fixed(s, 0, { stuck: [mod(900 + gap)] });
      throwAndLand(s);
      expect(s.phase === "crash", `separación ${gap}`).toBe(crash);
    }
    // contra una que pasa por el 0
    const s = initialState(SEED);
    fixed(s, 900, { stuck: [3550] });
    throwAndLand(s);
    expect(s.phase).toBe("crash");
  });
});

describe("ingredientes", () => {
  it("dentro del rango suma +5 y desaparece; el ingrediente no bloquea", () => {
    const s = initialState(SEED);
    fixed(s, 0, { ingredients: [900 + INGREDIENT_HALF] });
    throwAndLand(s);
    expect(s.phase).toBe("play");
    expect(s.score).toBe(POINTS.knife + POINTS.ingredient);
    expect(s.wheel.ingredients[0]!.hitAt).toBe(s.tick);
    expect(s.wheel.stuck).toHaveLength(1);
    const out = initialState(SEED);
    fixed(out, 0, { ingredients: [900 + INGREDIENT_HALF + 1] });
    throwAndLand(out);
    expect(out.score).toBe(POINTS.knife);
    expect(out.wheel.ingredients[0]!.hitAt).toBe(-1);
  });
});

describe("puntaje", () => {
  it("+1 por cuchilla, +5 por ingrediente, +10 por horma completa y +25 por la grande", () => {
    expect(POINTS).toEqual({ knife: 1, ingredient: 5, wheel: 10, bigWheel: 25 });
    const s = initialState(SEED);
    fixed(s, 0, { throws: 2, thrown: 1, stuck: [2000] });
    throwAndLand(s);
    expect(s.score).toBe(1 + 10);
    expect(s.phase).toBe("break");
    const b = initialState(SEED);
    fixed(b, 0, { throws: 2, thrown: 1, stuck: [2000], big: true });
    throwAndLand(b);
    expect(b.score).toBe(1 + 25);
    // en una partida entera, el puntaje es la suma de todo
    const r = botTrace(SEED, { stopAtWheel: 7 }).state;
    expect(r.done).toBe(6);
  });

  it("el cambio de horma dura 1 s y en él no se puede tirar; la siguiente entra con sus cuchillas", () => {
    const s = initialState(SEED);
    fixed(s, 0, { throws: 1 });
    throwAndLand(s);
    expect(s.phase).toBe("break");
    expect(throwKnife(s)).toBe("cambio");
    for (let i = 0; i < BREAK_TICKS - 1; i++) step(s);
    expect(s.phase).toBe("break");
    step(s);
    expect(s.phase).toBe("play");
    expect(s.wheel.spec.n).toBe(2);
    expect(s.wheel.stuck.map((k) => k.rel)).toEqual(wheelSpec(SEED, 2).pre);
    expect(throwKnife(s)).toBe("ok");
    expect(throwKnife(s)).toBe("volando");
  });
});

describe("hormas", () => {
  it("en 1.000 semillas: las cantidades siguen la tabla, entran todas con el margen del 75 %, las ya clavadas respetan su separación y ningún ingrediente queda pegado a una cuchilla", () => {
    for (const seed of SEEDS) {
      for (let n = 1; n <= 12; n++) {
        const w = wheelSpec(seed, n);
        const ing = w.ingredients.length;
        if (n === 1) expect([w.throws, w.pre.length, ing]).toEqual([6, 0, 1]);
        else if (n <= 3) {
          expect(w.throws).toBeGreaterThanOrEqual(7);
          expect(w.throws).toBeLessThanOrEqual(8);
          expect([1, 2]).toContain(w.pre.length);
          expect(ing).toBe(2);
        } else if (n === 4) expect([w.throws, w.pre.length, ing]).toEqual([9, 2, 2]);
        else if (n === 5) expect([w.throws, w.pre.length, ing]).toEqual([10, 3, 3]);
        else if (n % 5 === 0) expect([w.throws, w.pre.length, ing]).toEqual([12, 4, 3]);
        else {
          expect(w.throws).toBe(Math.min(12, 10 + (n - 5)));
          expect([3, 4]).toContain(w.pre.length);
          expect([2, 3]).toContain(ing);
        }
        expect(w.big).toBe(n % 5 === 0);
        expect((w.throws + w.pre.length) * MIN_SEPARATION).toBeLessThanOrEqual(0.75 * TURN);
        for (let i = 0; i < w.pre.length; i++) for (let j = i + 1; j < w.pre.length; j++) expect(angDist(w.pre[i]!, w.pre[j]!)).toBeGreaterThanOrEqual(PRE_GAP);
        for (const g of w.ingredients) for (const p of w.pre) expect(angDist(g.angle, p)).toBeGreaterThanOrEqual(INGREDIENT_HALF + MIN_SEPARATION);
      }
    }
  });

  it("la velocidad nunca pasa del máximo (270°/s) ni cambia de golpe; la primera es constante, la 2 y la 3 no cambian de sentido, la 4 sí, y la grande frena", () => {
    expect(MAX_SPEED * TICKS_PER_S).toBe(2700);
    let top = 0;
    let jump = 0;
    let overAccel = 0;
    const wrong: string[] = [];
    for (const seed of SEEDS) {
      for (let n = 1; n <= 10; n++) {
        const w = wheelSpec(seed, n);
        const v = speedProfile(w, 1800);
        let pos = false;
        let neg = false;
        let zero = false;
        for (let i = 0; i < v.length; i++) {
          const x = v[i]!;
          top = Math.max(top, Math.abs(x));
          if (x > 0) pos = true;
          else if (x < 0) neg = true;
          else zero = true;
          if (i > 0) {
            const d = Math.abs(x - v[i - 1]!);
            jump = Math.max(jump, d);
            if (d > w.accel) overAccel++;
          }
        }
        if (n === 1 && (pos === neg || zero || new Set(v).size !== 1)) wrong.push(`${seed}:${n} no es constante`);
        if ((n === 2 || n === 3) && pos === neg) wrong.push(`${seed}:${n} cambia de sentido`);
        if (n === 4 && !(pos && neg)) wrong.push(`${seed}:${n} no cambia de sentido`);
        if (n === 5 && !zero) wrong.push(`${seed}:${n} no frena`);
      }
    }
    expect(top).toBeLessThanOrEqual(MAX_SPEED);
    expect(jump).toBeLessThanOrEqual(MAX_ACCEL);
    expect(overAccel).toBe(0);
    expect(wrong).toEqual([]);
  });
});

describe("justicia", () => {
  it("el jugador automático que tira cuando pasa por abajo un hueco completa 5 hormas en el 99 % de 1.000 semillas", () => {
    const ok = SEEDS.filter((seed) => botTrace(seed, { stopAtWheel: 6 }).state.done >= 5).length;
    expect(ok / SEEDS.length).toBeGreaterThanOrEqual(0.99);
  });

  it("la cota: el jugador justo no la pasa", () => {
    let best = 0;
    for (const seed of SEEDS.slice(0, 30)) best = Math.max(best, botTrace(seed).state.score);
    expect(best).toBeLessThanOrEqual(MAX_SCORE);
    expect(MAX_SCORE).toBeGreaterThan(500);
  });
});

describe("calibración", () => {
  it("el jugador modelo llega a la horma 4 a 6", () => {
    const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
    const r = SEEDS.slice(0, 200).map((seed) => botTrace(seed, MODEL).state);
    const wheel = r.map((x) => x.wheel.spec.n);
    const fast = SEEDS.slice(0, 200).map((seed) => botTrace(seed, { ...MODEL, jitter: 2 }).state.wheel.spec.n);
    const slow = SEEDS.slice(0, 200).map((seed) => botTrace(seed, { ...MODEL, jitter: 6 }).state.wheel.spec.n);
    process.stdout.write(`big-bro-afila: modelo horma p25/med/p75 ${q(wheel, 0.25)}/${q(wheel, 0.5)}/${q(wheel, 0.75)}, puntaje med ${q(r.map((x) => x.score), 0.5)}, llega a los 120 s ${r.filter((x) => x.phase !== "crash").length}/${r.length}; preciso ${q(fast, 0.5)}; impreciso ${q(slow, 0.5)}; cota ${MAX_SCORE}\n`);
    expect(q(wheel, 0.25)).toBeGreaterThanOrEqual(4);
    expect(q(wheel, 0.75)).toBeLessThanOrEqual(6);
    expect(q(slow, 0.5)).toBeLessThanOrEqual(q(wheel, 0.5));
    expect(q(fast, 0.5)).toBeGreaterThanOrEqual(q(wheel, 0.5));
  });
});

describe("Big Bro", () => {
  it("reacciona de forma determinística y usa el sprite compartido", () => {
    const s = initialState(SEED);
    expect(broSays(s)).toEqual({ text: null, face: "espera" });
    throwKnife(s);
    expect(broSays(s).face).toBe("tira");
    while (s.tick < 400) step(s);
    expect(broSays(s).text).toBe(LINES.sharpen);
    const c = initialState(SEED);
    fixed(c, 0, { stuck: [900] });
    throwAndLand(c);
    expect(broSays(c)).toEqual({ text: LINES.crash, face: "enojado" });
    const d = initialState(SEED);
    fixed(d, 0, { throws: 1 });
    throwAndLand(d);
    expect(broSays(d)).toEqual({ text: LINES.done, face: "contento" });
    // la pose de tirar es de la lib: la cara de siempre con los brazos en alto
    expect(bigBroSprite("tira").px).not.toEqual(bigBroSprite("cuchilla").px);
    expect(readFileSync(new URL("./sprites.ts", import.meta.url), "utf8")).not.toContain("KWWWWWWWWWWWWWWWWWWK");
  });
});

describe("validate", () => {
  it("acepta una partida real con su duración", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const b = botTrace(seed, MODEL);
      const end = (b.events[b.events.length - 1] as { tick: number }).tick;
      const ms = Math.floor((end * 1000) / TICKS_PER_S) + 3000;
      const v = check(seed, b.events, ms);
      expect(v.ok, JSON.stringify(v).slice(0, 200)).toBe(true);
      expect(validate({ score: b.state.score, events: b.events }, seed, { elapsedMs: ms })).toBe(true);
    }
  });

  it("rechaza puntaje inflado, un tiro con otra en vuelo o en el cambio de horma, ticks fuera de orden, otra semilla y un fin incoherente", () => {
    const b = botTrace(SEED, { stopAtWheel: 3 });
    const t = throwsOf(b.events);
    const end = { tick: 2000, fin: true as const };
    const ev = [...t.map((tick) => ({ tick })), end];
    const bad = (events: unknown, ms?: number) => {
      const v = check(SEED, events, ms);
      return v.ok ? "ok" : v.reason;
    };
    const score = check(SEED, ev);
    expect(score.ok).toBe(true);
    if (!score.ok) return;
    expect(validate({ score: score.score + 1, events: ev }, SEED)).toBe(false);
    const full = botTrace(SEED, MODEL);
    expect(validate({ score: full.state.score, events: full.events }, SEED)).toBe(true);
    expect(validate({ score: full.state.score, events: full.events }, "otra")).toBe(false);
    expect(bad([{ tick: t[0]! }, { tick: t[0]! + 3 }, end])).toBe("tiro con otra cuchilla en vuelo");
    // el último tiro de la primera horma la completa: uno al tick siguiente cae en el cambio
    const sim = simulate(SEED, t, 2000);
    expect(sim.ok).toBe(true);
    const last1 = t[5]!; // la primera horma tiene 6
    expect(bad([...t.slice(0, 6).map((tick) => ({ tick })), { tick: last1 + FLIGHT_TICKS + 10 }, end])).toBe("tiro durante el cambio de horma");
    expect(bad([{ tick: t[1]! }, { tick: t[0]! }, end])).toBe("ticks fuera de orden");
    expect(bad([...t.map((tick) => ({ tick })), { tick: END_TICK + 1, fin: true }])).toBe("tick de fin fuera de rango");
    expect(bad([{ tick: 2500 }, end])).toBe("tiro después del final");
    expect(bad(t.map((tick) => ({ tick })))).toBe("falta el cierre de la traza");
    const endMs = Math.floor((2000 * 1000) / TICKS_PER_S);
    expect(bad(ev, endMs - 500)).toBe("la partida duró más que el intento");
    expect(bad(ev, endMs + 11_000)).toBe("el intento duró mucho más que la partida");
    // un tiro después del choque
    const c = botTrace(SEED, { ...MODEL });
    if (c.state.phase === "crash") {
      const ct = throwsOf(c.events);
      expect(bad([...ct.map((tick) => ({ tick })), { tick: c.state.crashAt + 5 }, { tick: c.state.crashAt + 60, fin: true }])).toBe("tiro después del choque");
    }
  });
});
