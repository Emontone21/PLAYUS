import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyThrow,
  botTrace,
  check,
  clampVector,
  END_TICK,
  fly,
  generateShots,
  GRAVITY,
  initialState,
  LAUNCH_Y,
  MAX_SCORE,
  MOUTH_RADIUS,
  MOUTH_Y,
  PAUSE_TICKS,
  scoreFor,
  SHOT_RANGES,
  SHOTS,
  simulate,
  solveShot,
  speedOk,
  step,
  SUB,
  SUBSTEPS,
  TICKS_PER_S,
  V_MAX,
  V_MIN,
  validate,
  windAccelOf,
  type ShotSetup,
  type ThrowEvent,
  type TraceEvent,
} from "./rules";
import { MAX_DRAG_PX, MIN_DRAG_PX, vectorFromDrag } from "./index";
import { chinoSprite, handSprite, sockSprite } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const throwsOf = (events: TraceEvent[]) => events.filter((e): e is ThrowEvent => !("fin" in e));
const endOf = (events: TraceEvent[]) => events[events.length - 1]!.tick;
const elapsedFor = (events: TraceEvent[]) => 3_000 + Math.floor((endOf(events) * 1000) / TICKS_PER_S) + 1_000;
const HUMAN = { errorPct: 0.06 };

function shotOf(dist: number, wind: number): ShotSetup {
  return { dist, wind, windAccel: windAccelOf(wind) };
}

describe("determinismo", () => {
  it("sin Math.random ni Math.sin; la misma semilla con la misma traza da lo mismo, y el replay también", () => {
    const src = readFileSync(new URL("./rules.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/Math\.(random|sin|cos)/);
    for (const seed of SEEDS.slice(0, 40)) {
      const a = botTrace(seed, HUMAN);
      const b = botTrace(seed, HUMAN);
      expect(b.events).toEqual(a.events);
      const r = simulate(seed, throwsOf(a.events), a.result.endTick);
      expect(r.best).toBe(a.result.best);
      expect(r.results.map((x) => x.minDist)).toEqual(a.result.results.map((x) => x.minDist));
    }
  });
});

describe("los tiros", () => {
  it("las distancias y los vientos quedan en sus rangos, y el viento sopla para los dos lados", () => {
    let left = 0;
    let right = 0;
    for (const seed of SEEDS) {
      const shots = generateShots(seed);
      expect(shots.length).toBe(SHOTS);
      shots.forEach((s, i) => {
        const r = SHOT_RANGES[i]!;
        expect(s.dist).toBeGreaterThanOrEqual(r.distMin);
        expect(s.dist).toBeLessThanOrEqual(r.distMax);
        expect(Math.abs(s.wind)).toBeGreaterThanOrEqual(r.windMin);
        expect(Math.abs(s.wind)).toBeLessThanOrEqual(r.windMax);
        if (s.wind < 0) left++;
        else right++;
      });
    }
    expect(left).toBeGreaterThan(1000);
    expect(right).toBeGreaterThan(1000);
    expect(generateShots("a")).not.toEqual(generateShots("b"));
  });
});

describe("el vuelo", () => {
  it("sin viento el arco es simétrico; con viento se corre hacia donde sopla; la fuerza se limita al tope", () => {
    const still = shotOf(150, 0);
    const v = { vx: 6000, vy: 6000 };
    const f = fly(still, v);
    // el punto más alto queda en el medio: vuelve a la altura de salida al doble de la x de la cima
    const top = f.points.reduce((b, p) => (p.y > b.y ? p : b), f.points[0]!);
    const back = [...f.points].reverse().find((p) => p.y >= LAUNCH_Y * SUB)!;
    const landing = f.points[f.points.length - 1]!;
    expect(Math.abs(top.x - back.x / 2) / SUB).toBeLessThan(2);
    const withWind = fly(shotOf(150, 10), v);
    const against = fly(shotOf(150, -10), v);
    expect(withWind.points[withWind.points.length - 1]!.x).toBeGreaterThan(landing.x);
    expect(against.points[against.points.length - 1]!.x).toBeLessThan(landing.x);
    // el tope
    const c = clampVector(50_000, 50_000);
    expect(speedOk(c)).toBe(true);
    expect(Math.sqrt(c.vx * c.vx + c.vy * c.vy)).toBeLessThanOrEqual(V_MAX);
    expect(speedOk({ vx: V_MAX, vy: 1 })).toBe(false);
    expect(speedOk({ vx: V_MIN - 1, vy: 0 })).toBe(false);
    expect(speedOk({ vx: 1.5, vy: 3000 })).toBe(false);
    expect(GRAVITY).toBe(112);
  });

  it("del arrastre al vector: opuesto, limitado al tope, y menos de 20 px no cuenta", () => {
    expect(vectorFromDrag(5, 5)).toBeNull();
    expect(vectorFromDrag(-MIN_DRAG_PX + 1, 0)).toBeNull();
    const v = vectorFromDrag(-100, 60)!;
    expect(v.vx).toBeGreaterThan(0);
    expect(v.vy).toBeGreaterThan(0);
    expect(speedOk(v)).toBe(true);
    const max = vectorFromDrag(-MAX_DRAG_PX * 3, 0)!;
    expect(Math.sqrt(max.vx * max.vx + max.vy * max.vy)).toBeLessThanOrEqual(V_MAX);
    expect(Math.sqrt(max.vx * max.vx + max.vy * max.vy)).toBeGreaterThan(V_MAX * 0.99);
    const min = vectorFromDrag(-MIN_DRAG_PX, 0)!;
    expect(speedOk(min)).toBe(true);
  });
});

describe("la medición", () => {
  it("los subpasos detectan un paso rápido junto a la boca que entre ticks se perdería", () => {
    const shot = shotOf(100, 0);
    const sol = solveShot(shot);
    const f = fly(shot, sol.v);
    // la posición por tick nunca cae tan cerca como la medida en subpasos para un tiro rápido
    const mouth = { x: shot.dist * SUB, y: MOUTH_Y * SUB };
    const perTick = Math.min(...f.points.map((p) => Math.sqrt((p.x - mouth.x) ** 2 + (p.y - mouth.y) ** 2)));
    expect(f.minDist).toBeLessThanOrEqual(perTick);
    // un tiro rápido y plano: entre dos ticks avanza más de 2 dm, así que la medida por tick puede saltar la boca
    const fast = fly(shotOf(80, 0), { vx: 12500, vy: 2800 });
    const step1 = fast.points[2]!.x - fast.points[1]!.x;
    expect(step1 / SUB).toBeGreaterThan(2);
    expect(SUBSTEPS).toBe(4);
  });

  it("pasar por el centro da 1000; entrar al borde da unos 900; a 1 m, 500; corto o pasado restan igual", () => {
    expect(scoreFor(0)).toBe(MAX_SCORE);
    expect(scoreFor(MOUTH_RADIUS * SUB)).toBe(900);
    expect(scoreFor(10 * SUB)).toBe(500);
    expect(scoreFor(30 * SUB)).toBe(0);
    expect(scoreFor(3 * SUB)).toBe(850);
  });
});

describe("el puntaje de la partida y el ritmo", () => {
  it("es el mejor de los 3; sin tirar, 0; entre tiros hay una pausa de 1,2 s donde no se puede tirar", () => {
    const a = botTrace(SEED, { errorPct: 0.08 });
    expect(a.result.finished).toBe(true);
    expect(a.result.results.length).toBe(3);
    expect(a.result.best).toBe(Math.max(...a.result.results.map((r) => r.score)));
    const s = initialState(SEED);
    for (let t = 0; t < 300; t++) step(s);
    expect(s.best).toBe(0);
    expect(s.results.length).toBe(0);
    // un tiro, su vuelo, y después la pausa
    const sol = solveShot(s.shots[0]!);
    expect(applyThrow(s, sol.v)).toBe(true);
    expect(applyThrow(s, sol.v)).toBe(false);
    while (s.phase === "flight") step(s);
    expect(s.phase).toBe("pause");
    expect(applyThrow(s, sol.v)).toBe(false);
    for (let t = 0; t < PAUSE_TICKS; t++) step(s);
    expect(s.phase).toBe("aim");
    expect(s.current).toBe(1);
    expect(applyThrow(s, { vx: V_MAX + 1, vy: 0 })).toBe(false);
    expect(applyThrow(s, solveShot(s.shots[1]!).v)).toBe(true);
  });
});

describe("justicia", () => {
  it("el resolvedor encuentra un vector que emboca en los 3 tiros de 1.000 semillas", () => {
    let worst = 0;
    for (const seed of SEEDS) {
      for (const shot of generateShots(seed)) {
        const sol = solveShot(shot);
        expect(speedOk(sol.v)).toBe(true);
        expect(sol.minDist).toBeLessThanOrEqual(MOUTH_RADIUS * SUB);
        worst = Math.max(worst, sol.minDist);
      }
    }
    expect(worst / SUB).toBeLessThan(0.5);
  }, 120_000);
});

describe("la traza y validate", () => {
  it("acepta una partida real (con su duración) y rechaza un puntaje inflado", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const a = botTrace(seed, HUMAN);
      const v = check(seed, a.events, elapsedFor(a.events));
      expect(v.ok, `${seed}: ${JSON.stringify(v)}`).toBe(true);
      if (v.ok) expect(v.best).toBe(a.result.best);
      expect(validate({ score: a.result.best, events: a.events }, seed, { elapsedMs: elapsedFor(a.events) })).toBe(true);
      expect(validate({ score: a.result.best + 1, events: a.events }, seed)).toBe(false);
    }
  });

  it("rechaza fuerza fuera de rango, un cuarto tiro, tiros fuera de orden o en la pausa, otra semilla y un fin incoherente", () => {
    const a = botTrace(SEED, HUMAN);
    const t = throwsOf(a.events);
    const end = endOf(a.events);
    const bad = (events: unknown) => {
      const v = check(SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    expect(bad([{ ...t[0], vx: V_MAX, vy: V_MAX }, t[1], t[2], { tick: end, fin: true }])).toBe("fuerza fuera de rango");
    expect(bad([{ ...t[0], vx: 100, vy: 100 }, t[1], t[2], { tick: end, fin: true }])).toBe("fuerza fuera de rango");
    expect(bad([...t, { shot: 4, tick: end - 1, vx: t[0]!.vx, vy: t[0]!.vy }, { tick: end, fin: true }])).toBe("más de 3 tiros");
    expect(bad([t[1], t[0], t[2], { tick: end, fin: true }])).toBe("los tiros no van en orden");
    expect(bad([{ ...t[0], shot: 2 }, { ...t[1], shot: 1 }, t[2], { tick: end, fin: true }])).toBe("los tiros no van en orden");
    // el segundo tiro justo después del vuelo del primero: cae en la pausa
    const flight0 = fly(initialState(SEED).shots[0]!, { vx: t[0]!.vx, vy: t[0]!.vy });
    expect(bad([t[0], { ...t[1], tick: t[0]!.tick + flight0.ticks + 5 }, { ...t[2], tick: t[0]!.tick + flight0.ticks + 500 }, { tick: end, fin: true }])).toBe("un tiro en la pausa");
    expect(bad([t[0], { ...t[1], tick: t[0]!.tick + 2 }, t[2], { tick: end, fin: true }])).toBe("un tiro durante el vuelo");
    expect(bad([...t, { tick: END_TICK + 1, fin: true }])).toBe("tick de fin fuera de rango");
    expect(bad([...t, { tick: end + 30, fin: true }])).toBe("el tick de fin no es el del tercer tiro");
    expect(bad(t)).toBe("falta el cierre de la traza");
    expect(validate({ score: a.result.best, events: a.events }, "otra")).toBe(false);
    const endMs = Math.floor((end * 1000) / TICKS_PER_S);
    expect(check(SEED, a.events, endMs - 500)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
    expect(check(SEED, a.events, endMs + 11_000)).toMatchObject({ ok: false, reason: "el intento duró mucho más que la partida" });
    expect(check(SEED, a.events, endMs + 4_000)).toMatchObject({ ok: true });
  });

  it("una partida cortada por tiempo cierra en cualquier tick con el mejor de los tiros hechos", () => {
    const a = botTrace(SEED, { maxShots: 2 });
    const t = throwsOf(a.events);
    const cut = check(SEED, [...t, { tick: 2000, fin: true }]);
    expect(cut).toMatchObject({ ok: true, finished: false });
    if (cut.ok) {
      expect(cut.results.length).toBe(2);
      expect(cut.best).toBe(a.result.best);
    }
    expect(check(SEED, [{ tick: 500, fin: true }])).toMatchObject({ ok: true, best: 0 });
  });
});

describe("calibración", () => {
  it("el perfecto hace 1000; el jugador modelo (6 % de error en el vector) ronda los 950 con un tiro adentro", () => {
    const stats = (opts: Parameters<typeof botTrace>[1], n = 100) => {
      const bests: number[] = [];
      let inside = 0;
      for (const seed of SEEDS.slice(0, n)) {
        const r = botTrace(seed, opts).result;
        bests.push(r.best);
        inside += r.results.filter((x) => x.outcome === "adentro").length;
      }
      const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
      return { best: [q(bests, 0.25), q(bests, 0.5), q(bests, 0.75)], inside: inside / n };
    };
    const perfect = botTrace(SEED).result;
    const human = stats(HUMAN);
    const sloppy = stats({ errorPct: 0.12 });
    process.stdout.write(
      [
        `perfecto: ${perfect.best}`,
        `jugador modelo (±6 % en el vector): mejor p25/med/p75 ${human.best.join("/")}, ${human.inside.toFixed(1)} tiros adentro por partida`,
        `flojo (±12 %): ${sloppy.best.join("/")}, ${sloppy.inside.toFixed(1)} adentro`,
      ].join("\n") + "\n",
    );
    expect(perfect.best).toBe(1000);
    expect(human.best[1]).toBeGreaterThanOrEqual(900);
    expect(sloppy.best[1]).toBeLessThan(human.best[1]!);
  });
});

describe("el arte", () => {
  it("El chino mide 16 × 32 en las cuatro caras; la mano y la manga tienen tamaño", () => {
    for (const face of ["espera", "adentro", "casi", "quehaces"] as const) expect([chinoSprite(face).w, chinoSprite(face).h]).toEqual([16, 32]);
    expect(JSON.stringify(chinoSprite("adentro"))).not.toBe(JSON.stringify(chinoSprite("espera")));
    expect([handSprite().w, handSprite().h]).toEqual([12, 14]);
    expect(sockSprite(3, true).px.length).toBeGreaterThan(sockSprite(1, true).px.length);
  });
});
