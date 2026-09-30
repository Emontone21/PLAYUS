import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  autoPolicy,
  autoTrace,
  check,
  COURSE_M,
  END_TICK,
  FALL_MARGIN,
  generateCourse,
  halfWidthAt,
  initialState,
  kmh,
  MAX_SCORE,
  MAX_SLIP,
  minRadiusAt,
  playBot,
  ROAD_MAX_HEADING,
  simulate,
  SLIP_MARK,
  slipOf,
  speedAt,
  step,
  SUB,
  TICKS_PER_S,
  V_MAX,
  V_MIN,
  validate,
  WIDTH_END,
  WIDTH_END_M,
  WIDTH_START,
  type Steer,
  type SteerEvent,
  type TraceEvent,
} from "./rules";
import { ANGLES, angleDiff, cosA, SIN, sinA, TRIG_SCALE, wrapAngle } from "./trig";
import { CAR_BOX, CAR_STEPS, carBaseSprite, carSprite, carStepFor, introSprite } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const steersOf = (events: TraceEvent[]) => events.filter((e): e is SteerEvent => !("fin" in e));
const endOf = (events: TraceEvent[]) => events[events.length - 1]!.tick;
const elapsedFor = (events: TraceEvent[]) => 3_000 + Math.floor((endOf(events) * 1000) / TICKS_PER_S) + 1_000;

/** juega con un control fijo desde el arranque hasta que termine o hasta `until` */
function drive(seed: string, control: (tick: number) => Steer, until = END_TICK) {
  const course = generateCourse(seed);
  const s = initialState();
  while (!s.end && s.tick < until) step(s, course, control(s.tick));
  return { s, course };
}

describe("la tabla de senos", () => {
  it("cubre las 1.024 direcciones, y la simulación no usa Math.sin ni Math.cos", () => {
    expect(SIN.length).toBe(ANGLES);
    expect(SIN[0]).toBe(0);
    expect(SIN[256]).toBe(TRIG_SCALE);
    expect(SIN[512]).toBe(0);
    expect(SIN[768]).toBe(-TRIG_SCALE);
    for (let a = 0; a < ANGLES; a++) {
      expect(Number.isInteger(SIN[a])).toBe(true);
      expect(Math.abs(SIN[a]!)).toBeLessThanOrEqual(TRIG_SCALE);
      // seno y coseno cierran: sin² + cos² ≈ 1
      const r = sinA(a) ** 2 + cosA(a) ** 2;
      expect(Math.abs(r - TRIG_SCALE ** 2)).toBeLessThan(TRIG_SCALE * 3);
    }
    expect(cosA(0)).toBe(TRIG_SCALE);
    expect(sinA(ANGLES + 256)).toBe(TRIG_SCALE);
    expect(wrapAngle(-1)).toBe(ANGLES - 1);
    expect(angleDiff(10, 1020)).toBe(14);
    expect(angleDiff(1020, 10)).toBe(-14);
    for (const file of ["rules.ts", "trig.ts"]) {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(src, file).not.toMatch(/Math\.(sin|cos|atan|atan2|tan)\b/);
    }
  });
});

describe("simulate es determinística", () => {
  it("misma semilla y misma traza dan exactamente lo mismo, paso a paso o de una", () => {
    const a = autoTrace(SEED);
    const b = autoTrace(SEED);
    expect(a).toEqual(b);
    const r1 = simulate(SEED, steersOf(a.events));
    const r2 = simulate(SEED, steersOf(a.events), 1000);
    const course = generateCourse(SEED);
    const cursor = { k: 0, steer: 0 as Steer };
    const inputs = steersOf(a.events);
    while (!r2.state.end && r2.state.tick < END_TICK) {
      while (cursor.k < inputs.length && inputs[cursor.k]!.tick <= r2.state.tick) cursor.steer = inputs[cursor.k++]!.steer;
      step(r2.state, course, cursor.steer);
    }
    expect(r2.state).toEqual(r1.state);
    expect(r1.score).toBe(a.result.score);
  });

  it("dos semillas dan rutas distintas", () => {
    const a = generateCourse("abc");
    const b = generateCourse("def");
    expect([...a.hs.slice(0, 400)]).not.toEqual([...b.hs.slice(0, 400)]);
  });
});

describe("en 1.000 semillas", () => {
  it("la ruta nunca gira más de 75° respecto de la vertical y siempre sube; el ancho baja según lo previsto; el conductor automático recorre 120 s sin caerse", () => {
    const relax = new Map<number, number>();
    for (const seed of SEEDS) {
      const c = generateCourse(seed);
      expect(c.n).toBe(COURSE_M + 1);
      let bad = "";
      for (let i = 0; i < c.n && !bad; i++) {
        const h = c.hs[i]!;
        const signed = h > ANGLES / 2 ? h - ANGLES : h;
        if (Math.abs(signed) > ROAD_MAX_HEADING) bad = `${seed} m ${i}: rumbo ${signed}`;
        else if (i > 0 && c.ys[i]! >= c.ys[i - 1]!) bad = `${seed} m ${i}: no sube`;
        else if (c.hws[i] !== halfWidthAt(i)) bad = `${seed} m ${i}: ancho`;
      }
      expect(bad).toBe("");
      const { result } = playBot(c, autoPolicy(), END_TICK);
      expect(result.endReason, seed).toBe("tiempo");
      expect(result.score).toBeGreaterThan(3000);
      expect(result.score).toBeLessThanOrEqual(MAX_SCORE);
      relax.set(c.relax, (relax.get(c.relax) ?? 0) + 1);
    }
    // la generación prevista alcanza casi siempre; abrir las curvas es la excepción
    expect((relax.get(0) ?? 0) / SEEDS.length).toBeGreaterThan(0.9);
  }, 300_000);

  it("el ancho va de 5 anchos de auto a 2,5 a los 3.000 m, y los radios mínimos bajan", () => {
    expect(halfWidthAt(0)).toBe((WIDTH_START * SUB) / 2);
    expect(halfWidthAt(WIDTH_END_M)).toBe((WIDTH_END * SUB) / 2);
    expect(halfWidthAt(WIDTH_END_M * 2)).toBe(halfWidthAt(WIDTH_END_M));
    expect(halfWidthAt(1500)).toBeLessThan(halfWidthAt(0));
    expect(halfWidthAt(1500)).toBeGreaterThan(halfWidthAt(3000));
    expect(minRadiusAt(0)).toBeGreaterThan(minRadiusAt(3000));
    const c = generateCourse(SEED);
    expect(c.curves.length).toBeGreaterThan(20);
    for (const cv of c.curves) expect(cv.radius).toBeGreaterThanOrEqual(minRadiusAt(cv.at) - 1e-9);
  });
});

describe("reglas", () => {
  it("la velocidad sube sola de 60 a 140 km/h en 90 s y no hay acelerador", () => {
    expect(kmh(speedAt(0))).toBe(60);
    expect(kmh(speedAt(45 * TICKS_PER_S))).toBe(100);
    expect(kmh(speedAt(90 * TICKS_PER_S))).toBe(140);
    expect(speedAt(END_TICK)).toBe(V_MAX);
    expect(speedAt(0)).toBe(V_MIN);
    expect(MAX_SCORE).toBeGreaterThanOrEqual(Math.ceil((V_MAX * END_TICK) / (4 * SUB)));
  });

  it("sin doblar, el auto sigue derecho y se cae en la primera curva; salir del margen cae, rozar el borde no", () => {
    const { s, course } = drive(SEED, () => 0);
    expect(s.end?.reason).toBe("caida");
    expect(s.meters).toBeGreaterThan(40);
    expect(s.meters).toBeLessThan(400);
    // al caer, el centro está a más de medio ancho + medio auto del eje
    const limit = course.hws[s.idx]! + FALL_MARGIN * SUB;
    expect(Math.abs(s.offset)).toBeGreaterThan(limit - SUB);
    // rozar: un auto corrido casi hasta el margen, en la recta del arranque, no cae
    const t = initialState();
    t.x = course.hws[0]! + FALL_MARGIN * SUB - 2 * SUB; // una rueda afuera del borde, el centro adentro del margen
    step(t, course, 0);
    expect(t.end).toBeNull();
    expect(Math.abs(t.offset)).toBeGreaterThan(course.hws[0]!);
    const u = initialState();
    u.x = course.hws[0]! + FALL_MARGIN * SUB + 2 * SUB;
    step(u, course, 0);
    expect(u.end?.reason).toBe("caida");
  });

  it("zigzaguear no suma metros: cuentan los del eje", () => {
    // un zigzag suave alrededor del rumbo de la ruta: 4 ticks a la derecha y después 8 y 8
    const zig = drive(SEED, (tick) => (tick < 4 ? 1 : Math.floor((tick - 4) / 8) % 2 === 0 ? -1 : 1), 120);
    const straight = drive(SEED, () => 0, 120);
    expect(zig.s.end).toBeNull();
    expect(zig.s.meters).toBeLessThanOrEqual(straight.s.meters);
    // el metro alcanzado nunca baja aunque el auto se corra
    const course = generateCourse(SEED);
    const s = initialState();
    let last = 0;
    for (let i = 0; i < 400 && !s.end; i++) {
      step(s, course, i < 4 ? 1 : Math.floor((i - 4) / 8) % 2 === 0 ? -1 : 1);
      expect(s.meters).toBeGreaterThanOrEqual(last);
      last = s.meters;
    }
  });

  it("a velocidad alta con giro sostenido la dirección de movimiento queda atrás del rumbo (derrapa); a velocidad baja, casi no", () => {
    const course = generateCourse(SEED);
    const slow = initialState();
    for (let i = 0; i < 30; i++) step(slow, course, 1);
    const slowSlip = Math.abs(slipOf(slow));
    const fast = initialState();
    fast.tick = 90 * TICKS_PER_S;
    for (let i = 0; i < 30; i++) step(fast, course, 1);
    const fastSlip = Math.abs(slipOf(fast));
    expect(fastSlip).toBeGreaterThan(slowSlip * 2);
    expect(fastSlip).toBeGreaterThan(SLIP_MARK);
    expect(slowSlip).toBeLessThan(SLIP_MARK);
    expect(fastSlip).toBeLessThanOrEqual(MAX_SLIP);
    // al soltar, se endereza de a poco: el deslizamiento baja pero no de golpe
    const before = slipOf(fast);
    step(fast, course, 0);
    expect(Math.abs(slipOf(fast))).toBeLessThan(Math.abs(before));
    expect(Math.abs(slipOf(fast))).toBeGreaterThan(Math.abs(before) / 2);
  });

  it("el conductor automático necesita derrapar en alguna curva y termina por tiempo", () => {
    const course = generateCourse(SEED);
    const s = initialState();
    const bot = autoPolicy();
    let maxSlip = 0;
    while (!s.end) {
      step(s, course, bot(s, course));
      maxSlip = Math.max(maxSlip, Math.abs(slipOf(s)));
    }
    expect(s.end?.reason).toBe("tiempo");
    expect(maxSlip).toBeGreaterThan(SLIP_MARK);
  });
});

describe("validate de pisteando el sunny", () => {
  const real = autoTrace(SEED, 600); // 10 s de conductor automático y el cronómetro corta ahí
  const fall = (() => {
    // 5 s de conductor automático y suelta: se cae
    const course = generateCourse(SEED);
    const { events } = playBot(course, autoPolicy(), 300);
    const inputs = [...steersOf(events), { tick: 300, steer: 0 as Steer }];
    const r = simulate(SEED, inputs);
    return { inputs, r };
  })();

  it("acepta una traza real (cortada por el cronómetro) y una caída", () => {
    expect(validate({ score: real.result.score, events: real.events }, SEED, { elapsedMs: elapsedFor(real.events) })).toBe(true);
    expect(fall.r.endReason).toBe("caida");
    const events: TraceEvent[] = [...fall.inputs, { tick: fall.r.endTick, fin: true }];
    expect(validate({ score: fall.r.score, events }, SEED, { elapsedMs: elapsedFor(events) })).toBe(true);
    const v = check(SEED, events);
    expect(v.ok && v.endReason).toBe("caida");
  });

  it("rechaza metros inflados", () => {
    expect(validate({ score: real.result.score + 1, events: real.events }, SEED)).toBe(false);
    expect(validate({ score: MAX_SCORE, events: real.events }, SEED)).toBe(false);
  });

  it("rechaza ticks fuera de orden, después del final y controles inválidos", () => {
    const inputs = steersOf(real.events);
    const end = endOf(real.events);
    const swapped = [...inputs];
    [swapped[1], swapped[2]] = [swapped[2]!, swapped[1]!];
    expect(check(SEED, [...swapped, { tick: end, fin: true }]).ok).toBe(false);
    expect(check(SEED, [...inputs, { tick: end + 5, steer: 1 }, { tick: end, fin: true }]).ok).toBe(false);
    expect(check(SEED, [{ tick: 3, steer: 2 }, { tick: end, fin: true }]).ok).toBe(false);
    expect(check(SEED, [{ tick: 3, steer: "1" }, { tick: end, fin: true }]).ok).toBe(false);
    expect(check(SEED, [{ tick: 3 }, { tick: end, fin: true }]).ok).toBe(false);
    expect(check(SEED, inputs).ok).toBe(false); // sin cierre
    expect(check(SEED, [{ tick: END_TICK + 1, fin: true }]).ok).toBe(false);
    expect(check(SEED, []).ok).toBe(false);
  });

  it("rechaza una traza armada con otra semilla y un tick de fin incoherente", () => {
    const other = autoTrace("otra-semilla", 1200);
    // con otra ruta, el conductor automático de la otra semilla termina cayéndose antes o después
    const v = check(SEED, other.events);
    expect(v.ok && v.score === other.result.score && v.endReason === other.result.endReason).toBe(false);
    // la caída tiene que coincidir con el cierre
    const events: TraceEvent[] = [...fall.inputs, { tick: fall.r.endTick + 30, fin: true }];
    expect(check(SEED, events).ok).toBe(false);
    // la duración real del intento
    expect(validate({ score: real.result.score, events: real.events }, SEED, { elapsedMs: 1_000 })).toBe(false);
    expect(validate({ score: real.result.score, events: real.events }, SEED, { elapsedMs: elapsedFor(real.events) + 60_000 })).toBe(false);
  });
});

describe("sprites", () => {
  it("el sunny mide 10 × 16, tiene 32 rotaciones distintas dentro de 20 × 20, y la ficha de la previa existe", () => {
    const base = carBaseSprite();
    expect([base.w, base.h]).toEqual([10, 16]);
    const shapes = new Set<string>();
    for (let i = 0; i < CAR_STEPS; i++) {
      const s = carSprite(i);
      expect([s.w, s.h]).toEqual([CAR_BOX, CAR_BOX]);
      expect(s.px.length).toBeGreaterThan(100);
      shapes.add(JSON.stringify(s.px));
    }
    expect(shapes.size).toBe(CAR_STEPS);
    expect(carSprite(0).px.length).toBe(base.px.length);
    expect(carStepFor(0)).toBe(0);
    expect(carStepFor(256)).toBe(8);
    expect(carStepFor(1023)).toBe(0);
    const intro = introSprite();
    expect([intro.w, intro.h]).toEqual([48, 48]);
  });
});
