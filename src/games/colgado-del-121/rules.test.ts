import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  amplitudeAt,
  autoTrace,
  BASE_END,
  BASE_END_TICK,
  BASE_MID,
  BASE_MID_TICK,
  BASE_START,
  baseHalfAt,
  check,
  delayedPolicy,
  DURATION_MS,
  END_TICK,
  FAIR_DELAY_TICKS,
  formatMs,
  generateCourse,
  initialState,
  intervalAt,
  msAt,
  playBot,
  rateAt,
  SHAKE_FROM_TICK,
  SHAKE_MAX_TICKS,
  SHAKE_MIN_TICKS,
  shakeGapAt,
  simulate,
  smoothQ10,
  step,
  SUB,
  TICK_MS,
  TICKS_PER_S,
  TILT_MAX,
  validate,
  type Push,
  type PushEvent,
  type TraceEvent,
} from "./rules";
import { passengerSprite } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const pushesOf = (events: TraceEvent[]) => events.filter((e): e is PushEvent => !("fin" in e));
const endOf = (events: TraceEvent[]) => events[events.length - 1]!.tick;
const elapsedFor = (events: TraceEvent[]) => 3_000 + Math.floor((endOf(events) * 1000) / TICKS_PER_S) + 1_000;

describe("la simulación es entera y determinística", () => {
  it("no usa Math.sin ni Math.cos, y la misma semilla con la misma traza da lo mismo", () => {
    const src = readFileSync(new URL("./rules.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/Math\.(sin|cos|atan|atan2|tan)\b/);
    const a = autoTrace(SEED);
    const b = autoTrace(SEED);
    expect(a).toEqual(b);
    const r = simulate(SEED, pushesOf(a.events));
    expect(r.state).toEqual(a.result.state);
    expect(r.score).toBe(a.result.score);
    expect(generateCourse("abc").tilts).not.toEqual(generateCourse("def").tilts);
    expect(smoothQ10(0)).toBe(0);
    expect(smoothQ10(512)).toBe(512);
    expect(smoothQ10(1024)).toBe(1024);
  });
});

describe("la inclinación", () => {
  it("la curva suave nunca cambia más que el límite por tick; la amplitud y la frecuencia suben según lo previsto; los sacudones empiezan a los 10 s, duran de 300 a 500 ms y vienen cada vez más seguidos", () => {
    expect(amplitudeAt(0)).toBeLessThan(amplitudeAt(45 * TICKS_PER_S));
    expect(amplitudeAt(45 * TICKS_PER_S)).toBeLessThan(amplitudeAt(90 * TICKS_PER_S));
    expect(amplitudeAt(90 * TICKS_PER_S)).toBe(TILT_MAX);
    expect(intervalAt(0)).toBeGreaterThan(intervalAt(90 * TICKS_PER_S));
    expect(rateAt(0)).toBeLessThan(rateAt(90 * TICKS_PER_S));
    let maxEarly = 0;
    let maxLate = 0;
    let segsEarly = 0;
    let segsLate = 0;
    let shakesEarly = 0;
    let shakesLate = 0;
    const gapsEarly: number[] = [];
    for (const seed of SEEDS.slice(0, 300)) {
      const c = generateCourse(seed);
      expect(c.tilts.length).toBe(END_TICK + 1);
      let bad = "";
      const inShake = (t: number) => c.shakes.some((sh) => t >= sh.from && t <= sh.to);
      for (let t = 1; t <= END_TICK && !bad; t++) {
        const d = Math.abs(c.base[t]! - c.base[t - 1]!);
        if (d > rateAt(t)) bad = `${seed} tick ${t}: la curva cambió ${d} (límite ${rateAt(t)})`;
        if (Math.abs(c.tilts[t]!) > TILT_MAX) bad = `${seed} tick ${t}: fuera de rango`;
        // fuera de los sacudones, la inclinación es la curva suave; adentro, la curva más el golpe
        if (!inShake(t) && c.tilts[t] !== c.base[t]) bad = `${seed} tick ${t}: sacudón fuera de lugar`;
      }
      expect(bad).toBe("");
      expect(c.shakes.length).toBeGreaterThan(10);
      let prevTo = -1;
      for (const sh of c.shakes) {
        if (sh.from < SHAKE_FROM_TICK) bad = `${seed}: sacudón antes de los 10 s`;
        const dur = sh.to - sh.from;
        if (sh.to < END_TICK && (dur < SHAKE_MIN_TICKS || dur > SHAKE_MAX_TICKS)) bad = `${seed}: sacudón de ${dur} ticks`;
        if (prevTo >= 0 && sh.from - prevTo < 0.6 * shakeGapAt(prevTo) * TICKS_PER_S) bad = `${seed}: sacudones demasiado juntos`;
        if (prevTo >= 0 && sh.from < 40 * TICKS_PER_S) gapsEarly.push((sh.from - prevTo) / TICKS_PER_S);
        if (sh.from < 40 * TICKS_PER_S) shakesEarly++;
        if (sh.from >= 60 * TICKS_PER_S && sh.from < 90 * TICKS_PER_S) shakesLate++;
        // el golpe pega de verdad: en el medio del sacudón la inclinación se separa de la curva hacia su lado (salvo tope)
        const mid = Math.floor((sh.from + sh.to) / 2);
        const delta = (c.tilts[mid]! - c.base[mid]!) * sh.dir;
        if (delta <= 0 && Math.abs(c.tilts[mid]!) < TILT_MAX) bad = `${seed}: el sacudón no pega`;
        prevTo = sh.to;
      }
      expect(bad).toBe("");
      for (let t = 0; t < 20 * TICKS_PER_S; t++) maxEarly = Math.max(maxEarly, Math.abs(c.base[t]!));
      for (let t = 80 * TICKS_PER_S; t <= END_TICK; t++) maxLate = Math.max(maxLate, Math.abs(c.base[t]!));
      for (const s of c.segments) {
        if (s.from < 20 * TICKS_PER_S) segsEarly++;
        if (s.from >= 80 * TICKS_PER_S && s.from < 100 * TICKS_PER_S) segsLate++;
      }
    }
    // más fuerte y más seguido con el tiempo
    expect(maxLate).toBeGreaterThan(maxEarly);
    expect(segsLate).toBeGreaterThan(segsEarly * 1.5);
    // los sacudones: cada 4 a 8 s al principio, y más seguidos después
    const meanGap = gapsEarly.reduce((a, b) => a + b, 0) / gapsEarly.length;
    expect(meanGap).toBeGreaterThan(4);
    expect(meanGap).toBeLessThan(8);
    expect(shakesLate / 300).toBeGreaterThan((shakesEarly / 300) * 1.4);
    expect(rateAt(0)).toBe(28);
    expect(rateAt(90 * TICKS_PER_S)).toBe(70);
  });
});

describe("la base", () => {
  it("se achica de 40 a 12 en los primeros 30 s, después despacio hasta 8 a los 60 s, y queda ahí", () => {
    expect(baseHalfAt(0)).toBe(BASE_START * SUB);
    expect(baseHalfAt(BASE_MID_TICK)).toBe(BASE_MID * SUB);
    expect(baseHalfAt(BASE_END_TICK)).toBe(BASE_END * SUB);
    expect(baseHalfAt(END_TICK)).toBe(BASE_END * SUB);
    expect(baseHalfAt(15 * TICKS_PER_S)).toBe(26 * SUB);
    expect(baseHalfAt(45 * TICKS_PER_S)).toBe(10 * SUB);
    for (let t = 1; t <= END_TICK; t++) expect(baseHalfAt(t)).toBeLessThanOrEqual(baseHalfAt(t - 1));
  });
});

describe("justicia", () => {
  it("sin tocar, se cae antes de los 8 s en el 99 % de las semillas; el jugador automático con 250 ms aguanta 15 s o más en el 99,9 %", () => {
    let fast = 0;
    let survives = 0;
    let relaxed = 0;
    for (const seed of SEEDS) {
      const c = generateCourse(seed);
      if (c.relax > 0) relaxed++;
      const s = initialState();
      while (!s.end) step(s, c, 0);
      if (s.end!.tick < 8 * TICKS_PER_S) fast++;
      const { result } = playBot(c, delayedPolicy(FAIR_DELAY_TICKS), END_TICK);
      if (result.endTick >= 15 * TICKS_PER_S) survives++;
    }
    expect(fast / SEEDS.length).toBeGreaterThanOrEqual(0.99);
    expect(survives / SEEDS.length).toBeGreaterThanOrEqual(0.999);
    expect(relaxed / SEEDS.length).toBeLessThan(0.1);
  }, 120_000);
});

describe("reglas", () => {
  it("salir de la base termina la partida; el empuje cambia de lado con el dedo; sin dedo no hay empuje", () => {
    const course = generateCourse(SEED);
    const s = initialState();
    s.x = baseHalfAt(0) + SUB;
    step(s, course, 0);
    expect(s.end?.reason).toBe("caida");
    expect(s.end?.tick).toBe(1);
    // empujar a la derecha lo mueve a la derecha; a la izquierda, a la izquierda; sin dedo, solo lo mueve la inclinación
    const right = initialState();
    const left = initialState();
    const none = initialState();
    for (let i = 0; i < 20; i++) {
      step(right, course, 1);
      step(left, course, -1);
      step(none, course, 0);
    }
    expect(right.x).toBeGreaterThan(none.x);
    expect(left.x).toBeLessThan(none.x);
    expect(right.push).toBe(1);
    expect(none.push).toBe(0);
    // la inclinación empuja hacia el lado inclinado: con el bondi inclinado a la derecha y sin dedo, x crece
    const tilt = course.tilts[30]!;
    const probe = initialState();
    probe.tick = 30;
    for (let i = 0; i < 10; i++) step(probe, course, 0);
    if (tilt > 200) expect(probe.x).toBeGreaterThan(0);
    if (tilt < -200) expect(probe.x).toBeLessThan(0);
    expect(msAt(60)).toBe(1000);
    expect(formatMs(34_712)).toBe("34,7 s");
    expect(formatMs(0)).toBe("0,0 s");
  });

  it("los sprites del pasajero existen en todas las poses", () => {
    for (const pose of ["parado", "izq", "der", "revoleo-izq", "revoleo-der", "piso-izq", "piso-der"] as const) {
      const s = passengerSprite(pose, 0);
      expect(s.px.length).toBeGreaterThan(60);
    }
    expect(passengerSprite("revoleo-der", 0).px).not.toEqual(passengerSprite("revoleo-der", 1).px);
  });
});

describe("validate de colgado del 121", () => {
  const real = autoTrace(SEED, 600); // 10 s de jugador automático y el cronómetro corta ahí
  const fall = (() => {
    const course = generateCourse(SEED);
    const { events } = playBot(course, delayedPolicy(FAIR_DELAY_TICKS), 300);
    const inputs = [...pushesOf(events), { tick: 300, push: 0 as Push }];
    const r = simulate(SEED, inputs);
    return { inputs, r };
  })();

  it("acepta una traza real (cortada por el cronómetro) y una caída, con la tolerancia de un tick", () => {
    expect(validate({ score: real.result.score, events: real.events }, SEED, { elapsedMs: elapsedFor(real.events) })).toBe(true);
    expect(validate({ score: real.result.score + Math.floor(TICK_MS), events: real.events }, SEED)).toBe(true);
    expect(fall.r.endReason).toBe("caida");
    const events: TraceEvent[] = [...fall.inputs, { tick: fall.r.endTick, fin: true }];
    expect(validate({ score: fall.r.score, events }, SEED, { elapsedMs: elapsedFor(events) })).toBe(true);
    expect(fall.r.score).toBe(msAt(fall.r.endTick));
  });

  it("rechaza tiempo inflado, ticks fuera de orden, empuje inválido, otra semilla y un tick de fin incoherente", () => {
    expect(validate({ score: real.result.score + 100, events: real.events }, SEED)).toBe(false);
    expect(validate({ score: DURATION_MS, events: real.events }, SEED)).toBe(false);
    const inputs = pushesOf(real.events);
    const end = endOf(real.events);
    const swapped = [...inputs];
    [swapped[1], swapped[2]] = [swapped[2]!, swapped[1]!];
    expect(check(SEED, [...swapped, { tick: end, fin: true }]).ok).toBe(false);
    expect(check(SEED, [{ tick: 3, push: 2 }, { tick: end, fin: true }]).ok).toBe(false);
    expect(check(SEED, [{ tick: 3, push: "1" }, { tick: end, fin: true }]).ok).toBe(false);
    expect(check(SEED, inputs).ok).toBe(false);
    expect(check(SEED, []).ok).toBe(false);
    // con otra semilla, el bot de otra inclinación se cae en otro momento (o no se cae)
    const other = autoTrace("otra-semilla", 1800);
    const v = check(SEED, other.events);
    expect(v.ok && v.endReason === other.result.endReason && v.score === other.result.score).toBe(false);
    // la caída tiene que coincidir con el cierre
    expect(check(SEED, [...fall.inputs, { tick: fall.r.endTick + 30, fin: true }]).ok).toBe(false);
    // la duración real del intento
    expect(validate({ score: real.result.score, events: real.events }, SEED, { elapsedMs: 1_000 })).toBe(false);
    expect(validate({ score: real.result.score, events: real.events }, SEED, { elapsedMs: elapsedFor(real.events) + 60_000 })).toBe(false);
  });
});
