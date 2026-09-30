import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  autoPolicy,
  autoTrace,
  check,
  CORNER_MAX,
  CORNER_MIN,
  COURSE_M,
  END_TICK,
  FALL_MARGIN,
  generateCourse,
  halfWidthAt,
  initialState,
  insideLeg,
  kmh,
  M_SUB,
  MAX_SCORE,
  MAX_SLIP,
  maxCornerAt,
  onRoad,
  playBot,
  project,
  ROAD_MAX_HEADING,
  signedHeading,
  simulate,
  SLIP_MARK,
  slipOf,
  speedAt,
  step,
  SUB,
  TICKS_PER_S,
  turnRadiusAt,
  V_MAX,
  V_MIN,
  validate,
  WIDTH_END,
  WIDTH_END_M,
  WIDTH_START,
  type Course,
  type Steer,
  type SteerEvent,
  type TraceEvent,
} from "./rules";
import { ANGLES, angleDiff, cosA, SIN, sinA, TRIG_SCALE, wrapAngle } from "./trig";
import { createVisuals, rearWheels, updateVisuals } from "./visuals";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const steersOf = (events: TraceEvent[]) => events.filter((e): e is SteerEvent => !("fin" in e));
const endOf = (events: TraceEvent[]) => events[events.length - 1]!.tick;
const elapsedFor = (events: TraceEvent[]) => 3_000 + Math.floor((endOf(events) * 1000) / TICKS_PER_S) + 1_000;
const deg = (a: number) => (a * 360) / ANGLES;

/** juega con un control fijo desde el arranque hasta que termine o hasta `until` */
function drive(seed: string, control: (tick: number) => Steer, until = END_TICK) {
  const course = generateCourse(seed);
  const s = initialState();
  while (!s.end && s.tick < until) step(s, course, control(s.tick));
  return { s, course };
}

/** el punto del bisector exterior de la esquina j (la punta de afuera), y uno apenas afuera de la losa */
function outerTip(course: Course, j: number, margin: boolean) {
  const dir = course.corners[j - 1]!.dir;
  // la punta exterior está del lado contrario al giro: izquierda si dobla a la derecha
  const outerX = dir === 1 ? (margin ? course.mlx : course.lx) : margin ? course.mrx : course.rx;
  const outerY = dir === 1 ? (margin ? course.mly : course.ly) : margin ? course.mry : course.ry;
  return { x: outerX[j]!, y: outerY[j]! };
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
      const r = sinA(a) ** 2 + cosA(a) ** 2;
      expect(Math.abs(r - TRIG_SCALE ** 2)).toBeLessThan(TRIG_SCALE * 3);
    }
    expect(wrapAngle(-1)).toBe(ANGLES - 1);
    expect(angleDiff(10, 1020)).toBe(14);
    for (const file of ["rules.ts", "trig.ts", "visuals.ts"]) {
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
    expect([...a.hs.slice(0, 20)]).not.toEqual([...b.hs.slice(0, 20)]);
  });
});

describe("en 1.000 semillas, la ruta en zigzag", () => {
  it("tramos dentro de 70° de la vertical y siempre subiendo; giros entre 30° y 110° (acotados por lo que el auto puede doblar); piso continuo en las esquinas; la prueba de ruta correcta en la punta de afuera; el eje nunca retrocede; el conductor automático sobrevive 120 s", () => {
    let relaxed = 0;
    let sharpest = 0;
    let overCap = 0;
    for (const seed of SEEDS) {
      const c = generateCourse(seed);
      let bad = "";
      expect(c.cum[c.n]! / M_SUB).toBeGreaterThanOrEqual(COURSE_M);
      for (let i = 0; i < c.n && !bad; i++) {
        if (Math.abs(signedHeading(c.hs[i]!)) > ROAD_MAX_HEADING) bad = `${seed} tramo ${i}: rumbo ${signedHeading(c.hs[i]!)}`;
        else if (c.vy[i + 1]! >= c.vy[i]!) bad = `${seed} tramo ${i}: no sube`;
        else if (c.hws[i] !== halfWidthAt(Math.floor(c.cum[i]! / M_SUB))) bad = `${seed} tramo ${i}: ancho`;
      }
      expect(bad).toBe("");
      for (const k of c.corners) {
        // el giro pedido va de 30° a 110°; se acota por la capacidad del auto a esa velocidad (y por el tope de 70°)
        if (k.angle < CORNER_MIN * 0.7 || k.angle > CORNER_MAX) bad = `${seed} esquina en ${k.at} m: ${deg(k.angle)}°`;
        if (k.angle > maxCornerAt(k.at)) overCap++;
        sharpest = Math.max(sharpest, k.angle);
        if (k.relax > 0) relaxed++;
      }
      expect(bad).toBe("");
      // piso continuo: en cada esquina, el vértice, la punta de afuera y un punto entre los dos tramos están sobre la ruta;
      // y justo afuera de la punta (más allá del margen), no
      for (let j = 1; j < c.n && !bad; j++) {
        const tip = outerTip(c, j, false);
        const tipM = outerTip(c, j, true);
        const vx = c.vx[j]!;
        const vy = c.vy[j]!;
        const midX = Math.floor((tip.x + vx) / 2);
        const midY = Math.floor((tip.y + vy) / 2);
        if (!onRoad(c, j - 1, vx, vy) || !onRoad(c, j, vx, vy)) bad = `${seed} esquina ${j}: el vértice no está en la ruta`;
        else if (!onRoad(c, j - 1, midX, midY)) bad = `${seed} esquina ${j}: hueco en el triángulo de afuera`;
        else if (!onRoad(c, j - 1, tip.x, tip.y)) bad = `${seed} esquina ${j}: la punta de la losa no cuenta`;
        else if (!insideLeg(c, j - 1, tip.x, tip.y) && !insideLeg(c, j, tip.x, tip.y)) bad = `${seed} esquina ${j}: la punta no pertenece a ningún tramo`;
        else {
          // apenas más allá de la punta del margen: se cae
          const bx = tipM.x + (tipM.x - vx > 0 ? 3 * SUB : -3 * SUB);
          const by = tipM.y + (tipM.y - vy > 0 ? 3 * SUB : -3 * SUB);
          if (onRoad(c, j - 1, bx, by)) bad = `${seed} esquina ${j}: más allá de la punta sigue contando`;
        }
      }
      expect(bad).toBe("");
      // el conductor automático: 120 s sin caerse, y los metros nunca retroceden
      const s = initialState();
      const bot = autoPolicy();
      let last = 0;
      let retro = false;
      while (!s.end) {
        step(s, c, bot(s, c));
        if (s.meters < last) retro = true;
        last = s.meters;
      }
      expect(retro, seed).toBe(false);
      expect(s.end?.reason, seed).toBe("tiempo");
      expect(s.meters).toBeGreaterThan(3000);
      expect(s.meters).toBeLessThanOrEqual(MAX_SCORE);
    }
    expect(overCap).toBe(0);
    // alguna esquina pasa de 90°; los ajustes son la excepción (acá, ninguno)
    expect(deg(sharpest)).toBeGreaterThan(90);
    expect(relaxed).toBe(0);
  }, 300_000);

  it("el ancho va de 5 anchos de auto a 2,5 a los 3.000 m; las esquinas se cierran y los tramos se acortan con la distancia", () => {
    expect(halfWidthAt(0)).toBe((WIDTH_START * SUB) / 2);
    expect(halfWidthAt(WIDTH_END_M)).toBe((WIDTH_END * SUB) / 2);
    expect(halfWidthAt(WIDTH_END_M * 2)).toBe(halfWidthAt(WIDTH_END_M));
    const c = generateCourse(SEED);
    const early = c.corners.filter((k) => k.at < 800);
    const late = c.corners.filter((k) => k.at > 2200 && k.at < 3000);
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    expect(avg(late.map((k) => k.angle))).toBeGreaterThan(avg(early.map((k) => k.angle)) * 1.5);
    const legs = (lo: number, hi: number) => {
      const out: number[] = [];
      for (let i = 0; i < c.n; i++) if (c.cum[i]! / M_SUB >= lo && c.cum[i]! / M_SUB < hi) out.push(c.len[i]! / M_SUB);
      return out;
    };
    expect(avg(legs(2200, 3000))).toBeLessThan(avg(legs(0, 800)));
    // zigzags encadenados: hay esquinas seguidas para lados opuestos
    let chained = 0;
    for (let i = 1; i < c.corners.length; i++) if (c.corners[i]!.dir !== c.corners[i - 1]!.dir) chained++;
    expect(chained).toBeGreaterThan(c.corners.length / 3);
    // la esquina más cerrada posible baja con la velocidad: a 140 km/h el auto dobla en unos 10 m
    expect(maxCornerAt(4000)).toBeLessThan(maxCornerAt(100));
    expect(turnRadiusAt(V_MAX) / M_SUB).toBeLessThan(11);
    expect(turnRadiusAt(V_MIN) / M_SUB).toBeLessThan(5);
  });
});

describe("reglas", () => {
  it("la velocidad sube sola de 60 a 140 km/h en 90 s y no hay acelerador", () => {
    expect(kmh(speedAt(0))).toBe(60);
    expect(kmh(speedAt(45 * TICKS_PER_S))).toBe(100);
    expect(kmh(speedAt(90 * TICKS_PER_S))).toBe(140);
    expect(speedAt(END_TICK)).toBe(V_MAX);
    expect(MAX_SCORE).toBeGreaterThanOrEqual(Math.ceil((V_MAX * END_TICK) / (4 * SUB)));
  });

  it("sin doblar, el auto sigue derecho y se cae en la primera esquina; salir del margen cae, rozar el borde no", () => {
    const { s, course } = drive(SEED, () => 0);
    expect(s.end?.reason).toBe("caida");
    expect(s.meters).toBeGreaterThan(40);
    expect(s.meters).toBeLessThan(120);
    // en la recta del arranque: una rueda afuera del borde con el centro adentro del margen no cae; más allá, sí
    const t = initialState();
    t.x = course.hws[0]! + FALL_MARGIN * SUB - 2 * SUB;
    step(t, course, 0);
    expect(t.end).toBeNull();
    expect(Math.abs(t.offset)).toBeGreaterThan(course.hws[0]!);
    const u = initialState();
    u.x = course.hws[0]! + FALL_MARGIN * SUB + 2 * SUB;
    step(u, course, 0);
    expect(u.end?.reason).toBe("caida");
  });

  it("zigzaguear no suma metros: cuentan los del eje, y cortar una esquina no los retrocede", () => {
    const zig = drive(SEED, (tick) => (tick < 4 ? 1 : Math.floor((tick - 4) / 8) % 2 === 0 ? -1 : 1), 120);
    const straight = drive(SEED, () => 0, 120);
    expect(zig.s.end).toBeNull();
    expect(zig.s.meters).toBeLessThanOrEqual(straight.s.meters);
    // el conductor automático corta por adentro en cada esquina: el avance proyectado nunca baja
    const course = generateCourse(SEED);
    const s = initialState();
    const bot = autoPolicy();
    let last = 0;
    let lastProgress = 0;
    let drops = 0;
    for (let i = 0; i < 4000 && !s.end; i++) {
      step(s, course, bot(s, course));
      expect(s.meters).toBeGreaterThanOrEqual(last);
      if (s.progress < lastProgress) drops++;
      last = s.meters;
      lastProgress = s.progress;
    }
    // el avance instantáneo puede bajar apenas al cambiar de tramo en una esquina, pero los metros no
    expect(drops).toBeLessThan(200);
    // la proyección sobre un tramo: en el medio del tramo, la mitad del largo
    const mid = project(course, 0, Math.floor(course.vx[1]! / 2), Math.floor(course.vy[1]! / 2));
    expect(Math.abs(mid.progress - course.len[0]! / 2)).toBeLessThan(SUB);
    expect(mid.d2).toBeLessThan(SUB * SUB);
  });

  it("a velocidad alta con giro sostenido la dirección de movimiento queda atrás del rumbo (derrapa); a velocidad baja, casi no", () => {
    const course = generateCourse(SEED);
    const slow = initialState();
    for (let i = 0; i < 12; i++) step(slow, course, 1);
    const slowSlip = Math.abs(slipOf(slow));
    const fast = initialState();
    fast.tick = 90 * TICKS_PER_S;
    for (let i = 0; i < 12; i++) step(fast, course, 1);
    const fastSlip = Math.abs(slipOf(fast));
    expect(fastSlip).toBeGreaterThan(slowSlip * 1.5);
    expect(fastSlip).toBeGreaterThan(SLIP_MARK);
    expect(fastSlip).toBeLessThanOrEqual(MAX_SLIP);
    // al soltar, se endereza de a poco: el deslizamiento baja pero no de golpe
    const before = slipOf(fast);
    step(fast, course, 0);
    expect(Math.abs(slipOf(fast))).toBeLessThan(Math.abs(before));
    expect(Math.abs(slipOf(fast))).toBeGreaterThan(Math.abs(before) / 3);
  });

  it("el conductor automático necesita derrapar en alguna esquina y termina por tiempo", () => {
    const course = generateCourse(SEED);
    const s = initialState();
    const bot = autoPolicy();
    let maxSlip = 0;
    while (!s.end) {
      step(s, course, bot(s, course));
      maxSlip = Math.max(maxSlip, Math.abs(slipOf(s)));
    }
    expect(s.end?.reason).toBe("tiempo");
    expect(maxSlip).toBeGreaterThan(SLIP_MARK * 2);
  });

  it("lo visual no toca la simulación: las marcas salen de las ruedas de atrás cuando desliza, y el humo no con prefers-reduced-motion", () => {
    const course = generateCourse(SEED);
    const s = initialState();
    s.tick = 90 * TICKS_PER_S;
    const vis = createVisuals();
    const before = JSON.stringify(s);
    updateVisuals(vis, s, false);
    expect(vis.marks.length).toBe(0);
    for (let i = 0; i < 20; i++) {
      step(s, course, 1);
      const snapshot = JSON.stringify(s);
      updateVisuals(vis, s, true);
      expect(JSON.stringify(s)).toBe(snapshot);
    }
    expect(vis.marks.length).toBeGreaterThan(0);
    expect(vis.smoke.length).toBe(0);
    const [l, r] = rearWheels(s);
    expect(Math.hypot(l.x - r.x, l.y - r.y)).toBeCloseTo(8 * SUB, -2);
    expect(before).not.toBe(JSON.stringify(s));
  });
});

describe("validate de pisteando el sunny", () => {
  const real = autoTrace(SEED, 600); // 10 s de conductor automático y el cronómetro corta ahí
  const fall = (() => {
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
    expect(check(SEED, inputs).ok).toBe(false);
    expect(check(SEED, [{ tick: END_TICK + 1, fin: true }]).ok).toBe(false);
    expect(check(SEED, []).ok).toBe(false);
  });

  it("rechaza una traza armada con otra semilla y un tick de fin incoherente", () => {
    const other = autoTrace("otra-semilla", 1200);
    const v = check(SEED, other.events);
    expect(v.ok && v.score === other.result.score && v.endReason === other.result.endReason).toBe(false);
    const events: TraceEvent[] = [...fall.inputs, { tick: fall.r.endTick + 30, fin: true }];
    expect(check(SEED, events).ok).toBe(false);
    expect(validate({ score: real.result.score, events: real.events }, SEED, { elapsedMs: 1_000 })).toBe(false);
    expect(validate({ score: real.result.score, events: real.events }, SEED, { elapsedMs: elapsedFor(real.events) + 60_000 })).toBe(false);
  });
});
