import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applySwipe,
  botTrace,
  CHANGE_HALF,
  CHANGE_TICKS,
  changesNeeded,
  check,
  DIST,
  DOUBLE_FROM_M,
  END_TICK,
  freeLanes,
  generateCourse,
  hitLane,
  initialState,
  INVULN_TICKS,
  LIVES,
  MAX_SCORE,
  metersOf,
  minGapTicks,
  PAIR_FROM_M,
  REACTION_TICKS,
  rockLaneAt,
  ROLL_LEAD_TICKS,
  ROLL_TICKS,
  ROLLING_FROM_M,
  simulate,
  SPEED_END,
  SPEED_START,
  speedAt,
  step,
  TICKS_PER_S,
  tickAtDist,
  validate,
  type Course,
  type LaneEvent,
  type TraceEvent,
} from "./rules";
import { nachSprite, nachDownSprite, rockSprite, vinylSprite } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const inputsOf = (events: TraceEvent[]) => events.filter((e): e is LaneEvent => !("fin" in e));
const endOf = (events: TraceEvent[]) => events[events.length - 1]!.tick;
const elapsedFor = (events: TraceEvent[]) => 3_000 + Math.floor((endOf(events) * 1000) / TICKS_PER_S) + 1_000;
/** el jugador modelo: reacciona 500 ms después de pasar la fila anterior y se equivoca de lado un 3 % de las veces */
const HUMAN = { delayTicks: 30, errorRate: 0.03 };

/** una fila con una roca en `lane`, en el tick `tick` */
function rowAt(tick: number, lanes: number[], extra: Partial<Course["rows"][number]> = {}) {
  return { dist: DIST[tick]!, tick, kind: "simple" as const, rocks: lanes.map((lane) => ({ lane: lane as 0 | 1 | 2 })), ...extra };
}
function courseOf(rows: Course["rows"]): Course {
  return { rows, pushed: 0 };
}

describe("determinismo", () => {
  it("sin Math.random ni Math.sin; la misma semilla con la misma traza da lo mismo, y el replay también", () => {
    const src = readFileSync(new URL("./rules.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/Math\.(random|sin|cos)/);
    for (const seed of SEEDS.slice(0, 40)) {
      const a = botTrace(seed, HUMAN);
      const b = botTrace(seed, HUMAN);
      expect(b.events).toEqual(a.events);
      const r = simulate(seed, inputsOf(a.events), a.result.endTick);
      expect([r.score, r.lives, r.endTick, r.state.lane]).toEqual([a.result.score, a.result.lives, a.result.endTick, a.result.state.lane]);
    }
    expect(generateCourse("a").rows.map((r) => r.dist)).not.toEqual(generateCourse("b").rows.map((r) => r.dist));
  });

  it("la velocidad sube pareja de 8 a 20 m/s a los 90 s, y la distancia es una función del tick", () => {
    expect(SPEED_START).toBe(133);
    expect(SPEED_END).toBe(333);
    expect(speedAt(0)).toBe(SPEED_START);
    expect(speedAt(90 * TICKS_PER_S)).toBe(SPEED_END);
    expect(speedAt(END_TICK)).toBe(SPEED_END);
    for (let t = 1; t <= END_TICK; t++) expect(speedAt(t) - speedAt(t - 1)).toBeGreaterThanOrEqual(0);
    expect(DIST[60]).toBeGreaterThanOrEqual(60 * 133);
    expect(DIST[60]).toBeLessThan(60 * 136);
    expect(Math.floor(DIST[END_TICK]! / 1000)).toBe(1854);
    expect(MAX_SCORE).toBe(2400);
    expect(tickAtDist(DIST[500]!)).toBe(500);
    expect(tickAtDist(DIST[500]! + 1)).toBe(501);
  });
});

describe("el curso, en 1.000 semillas", () => {
  const courses = SEEDS.map((s) => generateCourse(s));

  it("toda fila tiene al menos un carril libre, incluso cuando pasa una rodante", () => {
    for (const c of courses) {
      for (const r of c.rows) {
        expect(freeLanes(r).length).toBeGreaterThanOrEqual(1);
        // y en cualquier tick alrededor del paso (mientras rueda), también
        for (const rock of r.rocks) {
          if (rock.rollStart === undefined) continue;
          for (let t = rock.rollStart; t <= r.tick; t += 3) {
            const taken = new Set(r.rocks.map((k) => rockLaneAt(k, t)));
            expect(taken.size).toBeLessThan(3);
          }
        }
      }
    }
  });

  it("siempre da el tiempo: entre fila y fila hay 400 ms más 8 ticks por cada cambio necesario", () => {
    let min = Infinity;
    for (const c of courses) {
      for (let k = 1; k < c.rows.length; k++) {
        const p = c.rows[k - 1]!;
        const r = c.rows[k]!;
        const need = minGapTicks(changesNeeded(freeLanes(p), freeLanes(r)));
        expect(r.tick - p.tick, `${k}`).toBeGreaterThanOrEqual(need);
        min = Math.min(min, r.tick - p.tick - need);
      }
      // la primera fila también deja tiempo desde el arranque (en el medio)
      const first = c.rows[0]!;
      expect(first.tick).toBeGreaterThanOrEqual(minGapTicks(changesNeeded([1], freeLanes(first))));
    }
    expect(min).toBe(0);
    expect(REACTION_TICKS).toBe(24);
    expect(minGapTicks(2)).toBe(40);
  });

  it("las rodantes empiezan a rodar al menos 1 s antes de llegar, terminan de cruzar antes, y no cierran el único carril libre", () => {
    let rolling = 0;
    for (const c of courses) {
      for (const r of c.rows) {
        for (const rock of r.rocks) {
          if (rock.to === undefined || rock.rollStart === undefined) continue;
          rolling++;
          expect(r.tick - rock.rollStart).toBeGreaterThanOrEqual(60);
          expect(r.tick - rock.rollStart).toBe(ROLL_LEAD_TICKS);
          expect(rock.rollStart + ROLL_TICKS).toBeLessThan(r.tick);
          expect(Math.abs(rock.to - rock.lane)).toBe(1);
          // el carril que deja queda libre al pasar
          expect(freeLanes(r)).toContain(rock.lane);
        }
      }
    }
    expect(rolling).toBeGreaterThan(500);
  });

  it("los tipos de fila aparecen según la tabla: dobles desde los 200 m, pares desde los 600, rodantes desde los 1.000", () => {
    const firstOf: Record<string, number> = {};
    const count: Record<string, number> = {};
    for (const c of courses) {
      for (const r of c.rows) {
        const m = r.dist / 1000;
        count[r.kind] = (count[r.kind] ?? 0) + 1;
        firstOf[r.kind] = Math.min(firstOf[r.kind] ?? Infinity, m);
        if (r.kind === "doble") expect(m).toBeGreaterThanOrEqual(DOUBLE_FROM_M);
        if (r.kind === "par") expect(m).toBeGreaterThanOrEqual(PAIR_FROM_M);
        if (r.kind === "rodante") expect(m).toBeGreaterThanOrEqual(ROLLING_FROM_M);
        if (r.kind === "doble") expect(r.rocks.length).toBe(2);
      }
    }
    expect(firstOf.doble).toBeLessThan(DOUBLE_FROM_M + 60);
    expect(firstOf.par).toBeLessThan(PAIR_FROM_M + 80);
    expect(firstOf.rodante).toBeLessThan(ROLLING_FROM_M + 80);
    expect(count.simple).toBeGreaterThan(count.doble!);
    // la segunda fila de un par va a lo justo más 6 ticks
    for (const c of courses.slice(0, 50)) {
      for (let k = 1; k < c.rows.length; k++) {
        const r = c.rows[k]!;
        if (r.kind !== "par") continue;
        const p = c.rows[k - 1]!;
        expect(r.tick - p.tick).toBe(minGapTicks(changesNeeded(freeLanes(p), freeLanes(r))) + 6);
      }
    }
  });
});

describe("las reglas", () => {
  it("el cambio dura 8 ticks: la caja de choque está en el origen la primera mitad y en el destino la segunda", () => {
    const s = initialState();
    const c = courseOf([]);
    expect(applySwipe(s, 1)).toBe(true);
    for (let t = 0; t < CHANGE_TICKS; t++) {
      expect(hitLane(s)).toBe(t < CHANGE_HALF ? 1 : 2);
      step(s, c);
    }
    expect(s.change).toBeNull();
    expect(s.lane).toBe(2);
    expect(hitLane(s)).toBe(2);
  });

  it("deslizar contra el borde no hace nada; la cola guarda un cambio", () => {
    const s = initialState();
    const c = courseOf([]);
    applySwipe(s, 1);
    for (let t = 0; t < CHANGE_TICKS; t++) step(s, c);
    expect(s.lane).toBe(2);
    expect(applySwipe(s, 1)).toBe(false);
    expect(s.change).toBeNull();
    // dos deslizamientos seguidos: el segundo espera en la cola y se aplica al terminar
    applySwipe(s, -1);
    applySwipe(s, -1);
    applySwipe(s, 1); // pisa la cola: queda el último
    expect(s.queued).toBe(1);
    for (let t = 0; t < CHANGE_TICKS; t++) step(s, c);
    expect(s.lane).toBe(1);
    expect(s.change).toEqual({ from: 1, to: 2, t: 0 });
    expect(s.queued).toBeNull();
  });

  it("topar con una roca resta una vida, la roca desaparece, y la invulnerabilidad dura 1,5 s", () => {
    const c = courseOf([rowAt(100, [1]), rowAt(140, [1]), rowAt(300, [1])]);
    const s = initialState();
    while (s.tick < 100) step(s, c);
    expect(s.lives).toBe(LIVES - 1);
    expect(s.broken.has("0:0")).toBe(true);
    expect(s.invulnUntil).toBe(100 + INVULN_TICKS);
    // la segunda fila cae dentro de la invulnerabilidad: no resta
    while (s.tick < 141) step(s, c);
    expect(s.lives).toBe(LIVES - 1);
    expect(s.broken.has("1:0")).toBe(false);
    // la tercera, ya vulnerable, sí
    while (s.tick < 300) step(s, c);
    expect(s.lives).toBe(LIVES - 2);
    expect(s.end).toBeNull();
  });

  it("tres vidas perdidas terminan la partida en el tick del tercer golpe", () => {
    const c = courseOf([rowAt(100, [1]), rowAt(300, [1]), rowAt(500, [0, 1])]);
    const s = initialState();
    while (!s.end && s.tick < 1000) step(s, c);
    expect(s.end).toEqual({ tick: 500, reason: "vidas" });
    expect(s.lives).toBe(0);
    const tick = s.tick;
    step(s, c);
    expect(s.tick).toBe(tick);
    expect(applySwipe(s, 1)).toBe(false);
  });

  it("esquivar: con un cambio a tiempo la roca pasa de largo; la rodante choca en el carril de destino", () => {
    const c = courseOf([rowAt(100, [1]), rowAt(300, [0], { kind: "rodante", rocks: [{ lane: 0, to: 1, rollStart: 300 - ROLL_LEAD_TICKS }] })]);
    const s = initialState();
    while (s.tick < 100 - 10) step(s, c);
    applySwipe(s, 1);
    while (s.tick < 110) step(s, c);
    expect(s.lives).toBe(LIVES);
    // vuelve al medio: la rodante termina en el 1 y lo golpea
    applySwipe(s, -1);
    while (s.tick < 301) step(s, c);
    expect(s.lives).toBe(LIVES - 1);
    expect(rockLaneAt(c.rows[1]!.rocks[0]!, 300)).toBe(1);
    expect(rockLaneAt(c.rows[1]!.rocks[0]!, 300 - ROLL_LEAD_TICKS)).toBe(0);
  });
});

describe("la traza y validate", () => {
  it("acepta una traza real (con su duración) y rechaza metros inflados", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const a = botTrace(seed, HUMAN);
      const v = check(seed, a.events, elapsedFor(a.events));
      expect(v.ok, `${seed}: ${JSON.stringify(v)}`).toBe(true);
      if (v.ok) expect(v.score).toBe(a.result.score);
      expect(validate({ score: a.result.score, events: a.events }, seed, { elapsedMs: elapsedFor(a.events) })).toBe(true);
      expect(validate({ score: a.result.score + 1, events: a.events }, seed)).toBe(false);
    }
  });

  it("rechaza ticks fuera de orden, dir inválido, otra semilla, un fin más allá de los 120 s y un fin incoherente", () => {
    const a = botTrace(SEED, HUMAN);
    const inputs = inputsOf(a.events);
    const end = endOf(a.events);
    expect(a.result.endReason).toBe("vidas");
    const bad = (events: unknown) => {
      const v = check(SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    expect(bad([inputs[1], inputs[0], ...inputs.slice(2), { tick: end, fin: true }])).toBe("ticks fuera de orden");
    expect(bad([{ tick: 5, dir: 2 }, { tick: end, fin: true }])).toBe("dir inválido");
    expect(bad([{ tick: 5, dir: "left" }, { tick: end, fin: true }])).toBe("dir inválido");
    expect(bad([...inputs, { tick: END_TICK + 1, fin: true }])).toBe("tick de fin fuera de rango");
    expect(bad([...inputs, { tick: end + 30, fin: true }])).toBe("el tick de fin no es el de la tercera vida");
    expect(bad([...inputs, { tick: end + 5, dir: 1 }, { tick: end + 30, fin: true }])).toBe("el tick de fin no es el de la tercera vida");
    expect(bad(inputs)).toBe("falta el cierre de la traza");
    // otra semilla: otro curso, otros metros al perder las vidas
    expect(validate({ score: a.result.score, events: a.events }, "otra")).toBe(false);
    // la duración real
    const endMs = Math.floor((end * 1000) / TICKS_PER_S);
    expect(check(SEED, a.events, endMs - 500)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
    expect(check(SEED, a.events, endMs + 11_000)).toMatchObject({ ok: false, reason: "el intento duró mucho más que la partida" });
    expect(check(SEED, a.events, endMs + 4_000)).toMatchObject({ ok: true });
  });

  it("una partida cortada por tiempo cierra en cualquier tick hasta el 7200, con los metros de ese tick", () => {
    const a = botTrace(SEED);
    expect(a.result.endReason).toBeNull();
    expect(a.result.endTick).toBe(END_TICK);
    expect(a.result.score).toBe(1854);
    expect(check(SEED, [...inputsOf(a.events).filter((e) => e.tick < 600), { tick: 600, fin: true }])).toMatchObject({ ok: true, score: Math.floor(DIST[600]! / 1000) });
  });
});

describe("calibración", () => {
  it("el jugador modelo llega a los 30 a 60 s; el perfecto aguanta los 120 s; sin moverse se cae antes de los 60", () => {
    const stats = (opts: Parameters<typeof botTrace>[1], n = 150) => {
      const scores: number[] = [];
      const ends: number[] = [];
      for (const seed of SEEDS.slice(0, n)) {
        const r = botTrace(seed, opts).result;
        scores.push(r.score);
        ends.push(r.endTick / TICKS_PER_S);
      }
      const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
      return { score: [q(scores, 0.25), q(scores, 0.5), q(scores, 0.75)], end: [q(ends, 0.25), q(ends, 0.5), q(ends, 0.75)] };
    };
    const human = stats(HUMAN);
    const sharp = stats({ delayTicks: 24, errorRate: 0.03 });
    const slow = stats({ delayTicks: 36, errorRate: 0.03 });
    const still = stats({ stopAfterRows: 0 }, 60);
    const perfect = botTrace(SEED).result;
    process.stdout.write(
      [
        `jugador modelo (500 ms desde la fila anterior, 3 % de errores): metros p25/med/p75 ${human.score.join("/")}, fin ${human.end.map((e) => e.toFixed(0)).join("/")} s`,
        `jugador rápido (400 ms): metros ${sharp.score.join("/")}, fin ${sharp.end.map((e) => e.toFixed(0)).join("/")} s`,
        `jugador lento (600 ms): metros ${slow.score.join("/")}, fin ${slow.end.map((e) => e.toFixed(0)).join("/")} s`,
        `sin moverse: metros ${still.score.join("/")}, fin ${still.end.map((e) => e.toFixed(0)).join("/")} s`,
        `perfecto: ${perfect.score} m, ${perfect.lives} vidas`,
      ].join("\n") + "\n",
    );
    expect(human.end[1]).toBeGreaterThanOrEqual(30);
    expect(human.end[1]).toBeLessThanOrEqual(60);
    expect(perfect.lives).toBe(LIVES);
    expect(perfect.score).toBeLessThanOrEqual(MAX_SCORE);
    expect(still.end[1]).toBeLessThan(60);
    expect(metersOf(perfect.state)).toBe(perfect.score);
  });
});

describe("el arte", () => {
  it("The Nach mide 16 × 24 en todas las poses; las rocas crecen de tamaño; el vinilo es cuadrado", () => {
    for (const pose of ["a", "b", "izq", "der"] as const) expect([nachSprite(pose).w, nachSprite(pose).h]).toEqual([16, 24]);
    expect([nachDownSprite().w, nachDownSprite().h]).toEqual([16, 24]);
    expect(rockSprite(0).w).toBeLessThan(rockSprite(1).w);
    expect(rockSprite(1).w).toBeLessThan(rockSprite(2).w);
    expect(rockSprite(1, 2).px.length).toBe(rockSprite(1, 0).px.length);
    expect(vinylSprite().w).toBe(vinylSprite().h);
  });
});
