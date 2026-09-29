import { describe, expect, it } from "vitest";
import {
  baseSpeed,
  BOAT_HIT_H,
  BOAT_HIT_W,
  BOAT_SPEED,
  BOTTLE_EVERY_MAX_M,
  BOTTLE_EVERY_MIN_M,
  bottleBudgets,
  check,
  D_PER_M,
  D_PER_UNIT,
  DRIFT_FROM_M,
  drunkTrace,
  END_TICK,
  FIELD_W,
  GAP_MIN,
  generateCourse,
  initialState,
  isBottle,
  itemX,
  MAX_SCORE,
  MULT_MAX,
  multFor,
  playBot,
  reachBetween,
  RIVER_L,
  RIVER_R,
  safePath,
  simulate,
  slowestArrival,
  soberTrace,
  speedAt,
  step,
  SUB,
  TICKS_PER_S,
  validate,
  waypoints,
  type Course,
  type InputEvent,
  type SimState,
  type TraceEvent,
} from "./rules";
import { boatSprite, itemSprite, PIECE_KINDS_ALL, BOAT_SPRITE_H, BOAT_SPRITE_W } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const inputsOf = (events: TraceEvent[]) => events.filter((e): e is InputEvent => !("fin" in e));
const endOf = (events: TraceEvent[]) => events[events.length - 1]!.tick;
/** una duración del intento coherente con la traza: la cuenta regresiva y un segundo de cierre */
const elapsedFor = (events: TraceEvent[]) => 3_000 + Math.floor((endOf(events) * 1000) / TICKS_PER_S) + 1_000;

describe("simulate es determinística", () => {
  it("misma semilla y misma traza dan exactamente lo mismo", () => {
    const { events } = drunkTrace(SEED);
    const a = simulate(SEED, inputsOf(events));
    const b = simulate(SEED, inputsOf(events));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(generateCourse(SEED)).toEqual(generateCourse(SEED));
    expect(generateCourse(SEED)).not.toEqual(generateCourse("intento-2"));
  });

  it("paso a paso y de una dan lo mismo (el cliente avanza de a ticks)", () => {
    const course = generateCourse(SEED);
    const { events } = drunkTrace(SEED, 2_000);
    const inputs = inputsOf(events);
    const s = initialState();
    let target = s.target;
    let k = 0;
    while (s.tick < 2_000 && !s.end) {
      while (k < inputs.length && inputs[k]!.tick <= s.tick) target = inputs[k++]!.x;
      step(s, course, target);
    }
    expect(simulate(SEED, inputs, 2_000).state).toEqual(s);
  });
});

describe("el río, en 1.000 semillas", () => {
  const courses = new Map<string, Course>();
  const courseOf = (seed: string) => {
    let c = courses.get(seed);
    if (!c) {
      c = generateCourse(seed);
      courses.set(seed, c);
    }
    return c;
  };

  it("siempre existe un camino seguro: el bot que sigue los huecos llega a los 120 s sin whisky, con todo el whisky y forzado a ×2", () => {
    let drunkBottles = 0;
    let soberBottles = 0;
    for (const seed of SEEDS) {
      const course = courseOf(seed);
      const sober = playBot(seed, safePath(), { course });
      const drunk = playBot(seed, safePath(() => true), { course });
      const forced = playBot(seed, safePath(() => true), { course, mult: MULT_MAX });
      expect({ seed, sober: sober.result.endReason, drunk: drunk.result.endReason, forced: forced.result.endReason }).toEqual({ seed, sober: "tiempo", drunk: "tiempo", forced: "tiempo" });
      expect(drunk.result.bottles).toBeGreaterThanOrEqual(sober.result.bottles);
      expect(drunk.result.score).toBeGreaterThanOrEqual(sober.result.score);
      expect(forced.result.score).toBeGreaterThanOrEqual(drunk.result.score);
      drunkBottles += drunk.result.bottles;
      soberBottles += sober.result.bottles;
    }
    // el que las busca toma bastantes más que el que no (que alguna se lleva por delante igual)
    expect(drunkBottles).toBeGreaterThan(soberBottles * 1.3);
    expect(drunkBottles / SEEDS.length).toBeGreaterThan(6);
  });

  it("ninguna botella condena al bote: cualquier combinación de botellas se sobrevive", () => {
    // políticas por semilla: una de cada dos, una de cada tres, al azar según el índice
    for (const [i, seed] of SEEDS.entries()) {
      const course = courseOf(seed);
      const policies = [(b: number, n: number) => n % 2 === 0, (b: number, n: number) => n % 3 !== 0, (b: number) => (b * 7 + i) % 5 < 2];
      for (const p of policies) {
        const r = playBot(seed, safePath(p), { course });
        expect({ seed, reason: r.result.endReason }).toEqual({ seed, reason: "tiempo" });
      }
    }
  });

  it("toda fila tiene un hueco ancho y alcanzable desde el punto de paso anterior a la velocidad más alta posible", () => {
    for (const seed of SEEDS.slice(0, 300)) {
      const course = courseOf(seed);
      const wps = waypoints(course);
      let prev = { d: 0, x: 45, h: BOAT_HIT_H };
      let lastRow = prev;
      let bottles = 0;
      for (const w of wps) {
        if (w.bottle !== null) {
          // ir a la botella: antes de que termine de pasar, con el whisky de antes
          const b = bottleBudgets(lastRow, w.d, course.rows.find((r) => r.d > w.d)!.d, multFor(bottles), multFor(bottles + 1));
          expect(Math.abs(w.x - lastRow.x)).toBeLessThanOrEqual(b.toBottle);
          bottles++;
        } else if (prev.d !== lastRow.d) {
          // desde la botella al hueco: desde que aparece, y el camino entero dentro del corredor
          const b = bottleBudgets(lastRow, prev.d, w.d, multFor(bottles - 1), multFor(bottles));
          expect(Math.abs(w.x - prev.x)).toBeLessThanOrEqual(b.onward);
          expect(Math.abs(prev.x - lastRow.x) + Math.abs(w.x - prev.x)).toBeLessThanOrEqual(b.total);
          // y directo desde el hueco anterior, para quien la saltea (pudiendo llevársela por delante)
          expect(Math.abs(w.x - lastRow.x)).toBeLessThanOrEqual(reachBetween(lastRow.d, lastRow.h, w.d, w.h, multFor(bottles)));
        } else {
          expect(Math.abs(w.x - prev.x)).toBeLessThanOrEqual(reachBetween(prev.d, prev.h, w.d, w.h, multFor(bottles)));
        }
        prev = { d: w.d, x: w.x, h: w.h };
        if (w.bottle === null) lastRow = prev;
      }
      const byRow = new Map<number, typeof course.items>();
      for (const it of course.items) if (it.row >= 0) byRow.set(it.row, [...(byRow.get(it.row) ?? []), it]);
      course.rows.forEach((r, ri) => {
        expect(r.gapW).toBeGreaterThanOrEqual(GAP_MIN);
        expect(r.gap - r.gapW / 2).toBeGreaterThanOrEqual(RIVER_L);
        expect(r.gap + r.gapW / 2).toBeLessThanOrEqual(RIVER_R);
        // ningún cubierto de la fila pisa el hueco: ni quieto ni en los extremos de su deriva (la deriva es monótona entre ellos)
        for (const it of byRow.get(ri) ?? []) {
          const xs = it.drift ? [it.drift.from, it.drift.to, itemX(it, 0), itemX(it, 1234)] : [it.x];
          for (const x of xs) expect(x + it.w / 2 <= r.gap - r.gapW / 2 || x - it.w / 2 >= r.gap + r.gapW / 2).toBe(true);
        }
      });
    }
  });

  it("los cubiertos que derivan aparecen desde los 400 m y nunca cierran el hueco", () => {
    let drifting = 0;
    for (const seed of SEEDS.slice(0, 200)) {
      for (const it of courseOf(seed).items) {
        if (!it.drift) continue;
        drifting++;
        expect(it.d).toBeGreaterThanOrEqual(DRIFT_FROM_M * D_PER_M);
        expect(it.drift.to - it.drift.from).toBeGreaterThanOrEqual(6);
        const row = courseOf(seed).rows[it.row]!;
        expect(it.drift.from - it.w / 2 >= row.gap + row.gapW / 2 || it.drift.to + it.w / 2 <= row.gap - row.gapW / 2).toBe(true);
      }
    }
    expect(drifting).toBeGreaterThan(100);
  });

  it("las botellas salen cada 80 a 120 m, cómodas y arriesgadas", () => {
    let risky = 0;
    let total = 0;
    for (const seed of SEEDS.slice(0, 200)) {
      const course = courseOf(seed);
      let prevD = 0;
      const wps = waypoints(course);
      for (let i = 0; i < wps.length; i++) {
        const w = wps[i]!;
        if (w.bottle === null) continue;
        const gapM = (w.d - prevD) / D_PER_M;
        // cada 80 a 120 m, corrida al medio del corredor en que cae (hasta 7,5 m para cualquier lado)
        // (si el corredor en que caía era corto, pasa al siguiente que dé)
        expect(gapM).toBeGreaterThanOrEqual(BOTTLE_EVERY_MIN_M - 9);
        expect(gapM).toBeLessThanOrEqual(BOTTLE_EVERY_MAX_M + 40);
        prevD = w.d;
        // antes de los 600 m hay corredor para desviarse: ahí se mide cuántas quedan lejos del camino
        if (w.d < 600 * D_PER_M) {
          total++;
          const before = wps[i - 1]!;
          if (Math.abs(w.x - before.x) > 12) risky++;
        }
      }
    }
    expect(total).toBeGreaterThan(200 * 4);
    expect(risky / total).toBeGreaterThan(0.3);
  });

  it("los obstáculos se generan por distancia y la densidad sube con los metros", () => {
    const course = courseOf(SEEDS[0]!);
    const rowsIn = (from: number, to: number) => course.rows.filter((r) => r.d >= from * D_PER_M && r.d < to * D_PER_M).length;
    expect(rowsIn(600, 800)).toBeGreaterThan(rowsIn(0, 200) * 1.4);
    const gapAt = (m: number) => course.rows.find((r) => r.d >= m * D_PER_M)!.gapW;
    expect(gapAt(900)).toBeLessThan(gapAt(0));
    // el mismo río a ×2 se cruza en la mitad de los ticks: lo que importa es la distancia, no el tiempo
    const slow = playBot(SEEDS[0]!, safePath(), { course, untilTick: 1800 });
    const fast = playBot(SEEDS[0]!, safePath(), { course, mult: MULT_MAX, untilTick: 1800 });
    expect(fast.result.state.first).toBeGreaterThan(slow.result.state.first * 1.7);
    expect(fast.result.score).toBeGreaterThan(slow.result.score * 1.9);
  });

  it("todo queda dentro del río (o asomando apenas sobre la orilla), y la primera fila da tiempo", () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const course = courseOf(seed);
      for (const it of course.items) {
        expect(it.x - it.w / 2).toBeGreaterThanOrEqual(-14);
        expect(it.x + it.w / 2).toBeLessThanOrEqual(FIELD_W + 14);
      }
      expect(course.items[0]!.d).toBeGreaterThanOrEqual(20 * D_PER_M);
    }
  });

  it("MAX_SCORE es una cota: ni el bot forzado a ×2 la supera", () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const r = playBot(seed, safePath(() => true), { course: courseOf(seed), mult: MULT_MAX });
      expect(r.result.score).toBeLessThanOrEqual(MAX_SCORE);
    }
    expect(MAX_SCORE).toBeGreaterThan(1900);
    expect(MAX_SCORE).toBeLessThan(2200);
  });
});

describe("reglas", () => {
  it("chocar un cubierto termina la partida en el acto", () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const course = generateCourse(seed);
      // un jugador que va a buscar el primer cubierto que ve
      const r = playBot(seed, (s: SimState, c: Course) => {
        const it = c.items.slice(s.first, s.first + 8).find((i) => !isBottle(i.kind));
        return it ? itemX(it, s.tick) : s.target;
      }, { course });
      expect(r.result.endReason).toBe("choque");
      const crash = r.result.state.crash!;
      expect(isBottle(course.items[crash.item]!.kind)).toBe(false);
      expect(r.result.endTick).toBe(r.result.state.tick);
      expect(r.result.state.end!.tick).toBe(r.result.state.tick);
    }
  });

  it("cada botella suma un 10 % permanente, con tope en ×2", () => {
    expect(multFor(0)).toBe(100);
    expect(multFor(1)).toBe(110);
    expect(multFor(10)).toBe(200);
    expect(multFor(30)).toBe(200);
    const { result } = drunkTrace(SEED);
    expect(result.bottles).toBeGreaterThan(3);
    expect(result.state.mult).toBe(multFor(result.bottles));
    // la velocidad sube en el tick de la botella y no baja nunca
    const course = generateCourse(SEED);
    const s = initialState();
    const policy = safePath(() => true);
    let ups = 0;
    while (!s.end) {
      const before = s.mult;
      step(s, course, policy(s, course));
      // el avance de este tick fue con el whisky que había al empezarlo; la botella recién agarrada vale desde el próximo
      expect(s.dist - s.prevDist).toBe(speedAt(s.tick - 1, before));
      expect(s.mult).toBeGreaterThanOrEqual(before);
      if (s.mult !== before) {
        expect(s.mult - before).toBe(10);
        ups++;
      }
    }
    // el tope: después de la décima botella no sube más
    expect(ups).toBe(Math.min(10, result.bottles));
    expect(result.bottles).toBeGreaterThan(10);
    expect(result.state.mult).toBe(MULT_MAX);
  });

  it("la velocidad lateral no cambia con el whisky", () => {
    const course = generateCourse(SEED);
    for (const mult of [100, 150, 200]) {
      const s = initialState(mult);
      step(s, course, 90);
      expect(s.boatX - s.prevBoatX).toBe(BOAT_SPEED);
      let n = 1;
      while (s.boatX !== 82 * SUB) {
        step(s, course, 90);
        n++;
      }
      expect(n).toBe(Math.ceil(((82 - 45) * SUB) / BOAT_SPEED));
    }
  });

  it("la velocidad de avance sube despacio de 6 a 10 m/s en 90 s, y ×2 la duplica", () => {
    expect(baseSpeed(0)).toBe(60);
    expect(baseSpeed(90 * TICKS_PER_S)).toBe(100);
    expect(baseSpeed(END_TICK)).toBe(100);
    expect(baseSpeed(45 * TICKS_PER_S)).toBe(80);
    expect(speedAt(0, 200)).toBe(120);
    expect(speedAt(0, 110)).toBe(66);
    // un bote sin whisky llega a los 20 m a los 3,3 s
    expect(slowestArrival(20 * D_PER_M)).toBeGreaterThanOrEqual(195);
    expect(slowestArrival(20 * D_PER_M)).toBeLessThanOrEqual(200);
    expect(slowestArrival(10_000 * D_PER_M)).toBe(END_TICK);
  });

  it("llegar a 120 segundos la termina", () => {
    const { result, events } = soberTrace(SEED);
    expect(result.endReason).toBe("tiempo");
    expect(result.endTick).toBe(END_TICK);
    expect(endOf(events)).toBe(END_TICK);
    expect(END_TICK).toBe(120 * TICKS_PER_S);
    // y el puntaje son metros enteros
    expect(result.score).toBe(Math.floor(result.state.dist / D_PER_M));
    expect(result.score).toBeGreaterThan(900);
  });

  it("el bote no se teletransporta y la caja de choque es más chica que el dibujo", () => {
    expect(BOAT_HIT_W).toBeLessThan(BOAT_SPRITE_W);
    expect(BOAT_HIT_H).toBeLessThan(BOAT_SPRITE_H);
    const course = generateCourse(SEED);
    for (const it of course.items) {
      if (isBottle(it.kind)) continue;
      const sp = itemSprite(it.kind);
      expect(it.w).toBeLessThan(sp.w);
      expect(it.h * D_PER_UNIT).toBeLessThanOrEqual(sp.h * D_PER_UNIT);
    }
  });
});

describe("validate de remar vuelve a casa", () => {
  const { events, result } = drunkTrace(SEED, 1_500);
  const elapsed = elapsedFor(events);

  it("acepta una traza real (también la cortada por el cronómetro, la que chocó y la que llegó a los 120 s)", () => {
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: elapsed })).toBe(true);
    const full = soberTrace(SEED);
    expect(validate({ score: full.result.score, events: full.events }, SEED, { elapsedMs: elapsedFor(full.events) })).toBe(true);
    const lazy = playBot(SEED, () => 45);
    expect(lazy.result.endReason).toBe("choque");
    expect(validate({ score: lazy.result.score, events: lazy.events }, SEED, { elapsedMs: elapsedFor(lazy.events) })).toBe(true);
  });

  it("rechaza metros inflados", () => {
    expect(result.score).toBeGreaterThan(0);
    expect(validate({ score: result.score + 1, events }, SEED, { elapsedMs: elapsed })).toBe(false);
    expect(validate({ score: result.score - 1, events }, SEED, { elapsedMs: elapsed })).toBe(false);
    expect(validate({ score: MAX_SCORE, events }, SEED, { elapsedMs: elapsed })).toBe(false);
  });

  it("rechaza ticks fuera de orden, repetidos o después del final", () => {
    const inputs = inputsOf(events);
    expect(inputs.length).toBeGreaterThan(2);
    const swapped = [inputs[1]!, inputs[0]!, ...inputs.slice(2), events[events.length - 1]!];
    expect(check(SEED, swapped).ok).toBe(false);
    const repeated = [inputs[0]!, { ...inputs[1]!, tick: inputs[0]!.tick }, ...inputs.slice(2), events[events.length - 1]!];
    expect(check(SEED, repeated)).toEqual({ ok: false, reason: "ticks fuera de orden" });
    const late = [...inputs, { tick: endOf(events) + 5, x: 10 }, events[events.length - 1]!];
    expect(check(SEED, late)).toEqual({ ok: false, reason: "entrada después del final" });
  });

  it("rechaza una x fuera del campo", () => {
    const inputs = inputsOf(events);
    for (const x of [-1, FIELD_W + 1, 12.5]) {
      const bad = [{ ...inputs[0]!, x }, ...inputs.slice(1), events[events.length - 1]!];
      expect(check(SEED, bad).ok).toBe(false);
    }
  });

  it("rechaza una traza armada con otra semilla", () => {
    const other = drunkTrace("otra-semilla", 1_500);
    expect(validate({ score: other.result.score, events: other.events }, "otra-semilla", { elapsedMs: elapsedFor(other.events) })).toBe(true);
    expect(validate({ score: other.result.score, events: other.events }, SEED, { elapsedMs: elapsedFor(other.events) })).toBe(false);
  });

  it("rechaza un tick de fin que no sale de la partida", () => {
    // chocó antes de lo que dice la traza
    const lazy = playBot(SEED, () => 45);
    const stretched = [...lazy.events.slice(0, -1), { tick: endOf(lazy.events) + 60, fin: true }];
    expect(check(SEED, stretched)).toEqual({ ok: false, reason: "el final no coincide con la partida" });
    // más allá de los 120 s, sin cierre o mal armada
    expect(check(SEED, [{ tick: END_TICK + 1, fin: true }]).ok).toBe(false);
    expect(check(SEED, inputsOf(events)).ok).toBe(false);
    expect(check(SEED, "nada").ok).toBe(false);
    expect(check(SEED, []).ok).toBe(false);
  });

  it("rechaza un tick de fin incoherente con la duración real del intento", () => {
    const endMs = Math.floor((endOf(events) * 1000) / TICKS_PER_S);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs - 1 })).toBe(false);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs })).toBe(true);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs + 10_000 })).toBe(true);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs + 10_001 })).toBe(false);
  });
});

describe("sprites", () => {
  it("el bote mide 10 × 16 en todos sus cuadros, y los cubiertos y la botella tienen siluetas distintas", () => {
    for (const cheeks of [0, 1, 2, 3] as const) {
      for (const oar of [0, 1, 2] as const) {
        const s = boatSprite(cheeks, oar);
        expect([s.w, s.h]).toEqual([BOAT_SPRITE_W, BOAT_SPRITE_H]);
        expect(s.px.every((p) => p.x >= 0 && p.x < s.w && p.y >= 0 && p.y < s.h)).toBe(true);
      }
    }
    expect(boatSprite(0, 0).px).not.toEqual(boatSprite(0, 1).px);
    expect(boatSprite(0, 0).px).not.toEqual(boatSprite(3, 0).px);
    const shapes = new Set<string>();
    for (const k of PIECE_KINDS_ALL) {
      const s = itemSprite(k);
      expect(s.px.length).toBeGreaterThan(10);
      shapes.add(s.px.map((p) => `${p.x},${p.y}`).join(" "));
    }
    expect(shapes.size).toBe(PIECE_KINDS_ALL.length);
  });
});
