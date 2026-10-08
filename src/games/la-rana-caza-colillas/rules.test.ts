import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  alive,
  applyLick,
  botTrace,
  boxesTooClose,
  check,
  clampToReach,
  difficultyAt,
  END_TICK,
  ESCORT_FROM_TICK,
  FIELD,
  GAP,
  generateCourse,
  hasFreeMoment,
  initialState,
  MOUTH,
  posAt,
  REACH,
  simulate,
  step,
  SUBSTEPS,
  TICKS_PER_S,
  TIP_R,
  tipAt,
  tipHits,
  TONGUE_TICKS,
  tongueTicksTo,
  validate,
  type LickEvent,
  type Thing,
  type TraceEvent,
} from "./rules";
import { toField } from "./index";
import { colillaSprite, frogSprite, vapoSprite } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const licksOf = (events: TraceEvent[]) => events.filter((e): e is LickEvent => !("fin" in e));
/** el jugador modelo (decisión 264) */
const MODEL = { reaction: 21, lead: false, aimError: 160, pause: 18 };

/** un estado sin cosas, con una cosa quieta en `p` (una trayectoria de un punto) */
function withThing(kind: "colilla" | "vapo", p: { x: number; y: number }, life = 600) {
  const s = initialState(SEED);
  s.course = { things: [{ id: 1, kind, spawn: 0, life, pts: [p, p, p], ctrl: [p, p], escortOf: null }] };
  return s;
}

describe("determinismo", () => {
  it("sin Math.random ni trigonometría; la misma semilla da lo mismo (la igualdad con el navegador la comprueba el E2E)", () => {
    const src = readFileSync(new URL("./rules.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/Math\.(random|sin|cos|atan)/);
    for (const seed of SEEDS.slice(0, 10)) {
      const a = botTrace(seed, MODEL);
      const b = botTrace(seed, MODEL);
      expect(b.events).toEqual(a.events);
      const r = simulate(seed, licksOf(a.events), a.events[a.events.length - 1]!.tick);
      expect("ok" in r).toBe(false);
      if (!("ok" in r)) expect(r.score).toBe(a.result.score);
    }
    expect(JSON.stringify(generateCourse("a").things.slice(0, 3))).not.toBe(JSON.stringify(generateCourse("b").things.slice(0, 3)));
  });
});

describe("la lengua", () => {
  it("llega a su alcance máximo en 150 ms (9 ticks) y a un punto cercano en menos; fuera del alcance va hasta el máximo en esa dirección", () => {
    expect(TONGUE_TICKS).toBe(9);
    expect(tongueTicksTo(clampToReach({ x: MOUTH.x + REACH, y: MOUTH.y }))).toBe(9);
    expect(tongueTicksTo(clampToReach({ x: MOUTH.x + 400, y: MOUTH.y }))).toBe(2);
    expect(tongueTicksTo(clampToReach({ x: MOUTH.x + 4000, y: MOUTH.y }))).toBe(9);
    const far = clampToReach({ x: FIELD, y: FIELD });
    const d = Math.sqrt((far.x - MOUTH.x) ** 2 + (far.y - MOUTH.y) ** 2);
    expect(d).toBeLessThanOrEqual(REACH);
    expect(d).toBeGreaterThan(REACH - 3);
    // una ida y una vuelta de la misma duración
    const s = withThing("colilla", { x: -5000, y: -5000 });
    applyLick(s, { x: MOUTH.x + REACH, y: MOUTH.y });
    for (let t = 0; t < 9; t++) {
      step(s);
      expect(s.tongue).not.toBeNull();
    }
    expect(s.tongue!.turnAt).toBe(9);
    for (let t = 0; t < 8; t++) step(s);
    expect(s.tongue).not.toBeNull();
    step(s);
    expect(s.tongue).toBeNull();
    expect(s.score).toBe(0);
  });

  it("agarra lo primero que toca su punta, vuelve con ella y suma 1; la vuelta dura lo que duró la ida", () => {
    const s = withThing("colilla", { x: MOUTH.x + 600, y: MOUTH.y });
    applyLick(s, { x: MOUTH.x + 1700, y: MOUTH.y });
    let caughtAt = -1;
    for (let t = 0; t < 12 && caughtAt < 0; t++) {
      step(s);
      if (s.score === 1) caughtAt = s.tick;
    }
    expect(caughtAt).toBe(2);
    expect(s.tongue!.carrying).toBe(1);
    expect(s.tongue!.back).toBe(2);
    for (let t = 0; t < 2; t++) step(s);
    expect(s.tongue).toBeNull();
    expect(s.eaten.has(1)).toBe(true);
    // mientras vuelve no agarra nada: una segunda colilla en el camino sigue ahí
  });

  it("los subpasos detectan una colilla rápida que entre ticks se perdería", () => {
    // una colilla que cruza a 2.000 unidades por tick la línea de la lengua, a 1.200 unidades de la boca
    const s = initialState(SEED);
    const y = MOUTH.y + 1200;
    const th: Thing = { id: 1, kind: "colilla", spawn: 0, life: 11, pts: [{ x: MOUTH.x - 11000, y }, { x: MOUTH.x + 11000, y }], ctrl: [{ x: MOUTH.x, y }], escortOf: null };
    s.course = { things: [th] };
    // la lengua tarda 6 ticks en llegar; en los ticks enteros 5, 6 y 7 la punta no la toca (está a 1.000 de distancia)
    const target = { x: MOUTH.x, y };
    expect(tongueTicksTo(target)).toBe(6);
    const posTick = (t: number) => posAt(th, t * SUBSTEPS);
    expect(Math.abs(posTick(6).x - MOUTH.x)).toBeGreaterThanOrEqual(999);
    for (const t of [5, 6, 7]) expect(tipHits(tipAt(target, 6, Math.min(24, t * SUBSTEPS)), posTick(t), "colilla")).toBe(false);
    // pero a mitad del tick 6 la colilla pasa por el centro y la punta está a 1.100: la agarra
    applyLick(s, target);
    for (let t = 0; t < 6; t++) step(s);
    expect(s.score).toBe(1);
  });

  it("si no toca nada vuelve vacía sin penalizar, y mientras está afuera los toques se ignoran", () => {
    const s = withThing("colilla", { x: MOUTH.x - 1500, y: MOUTH.y });
    expect(applyLick(s, { x: MOUTH.x + 1500, y: MOUTH.y })).toBe("lengua");
    expect(applyLick(s, { x: MOUTH.x - 1500, y: MOUTH.y })).toBe("ocupada");
    for (let t = 0; t < 16; t++) step(s);
    expect(s.tongue).toBeNull();
    expect(s.score).toBe(0);
    expect(s.crashed).toBe(false);
    expect(applyLick(s, { x: MOUTH.x - 1500, y: MOUTH.y })).toBe("lengua");
    for (let t = 0; t < 10; t++) step(s);
    expect(s.score).toBe(1);
  });
});

describe("reglas y control", () => {
  it("agarrar un vapeador termina la partida; después no pasa nada más", () => {
    const s = withThing("vapo", { x: MOUTH.x, y: MOUTH.y - 900 });
    applyLick(s, { x: MOUTH.x, y: MOUTH.y - 1200 });
    for (let t = 0; t < 10; t++) step(s);
    expect(s.crashed).toBe(true);
    expect(s.crashTick).toBeLessThanOrEqual(5);
    expect(applyLick(s, { x: 0, y: 0 })).toBe("fin");
    expect(s.score).toBe(0);
  });

  it("el toque pasa de la pantalla al campo lógico, recortado al área", () => {
    const rect = { left: 10, top: 20, width: 300, height: 300 };
    expect(toField(10, 20, rect)).toEqual({ x: 0, y: 0 });
    expect(toField(160, 170, rect)).toEqual({ x: 2048, y: 2048 });
    expect(toField(400, 500, rect)).toEqual({ x: FIELD, y: FIELD });
    expect(toField(-50, 0, rect)).toEqual({ x: 0, y: 0 });
  });
});

describe("generación", () => {
  it("en 1.000 semillas: cantidad, velocidad y vapeadores según la tabla; nunca un vapeador encima de una colilla; toda colilla con un momento libre; sin escoltas antes de los 30 s", () => {
    const counts = { early: [] as number[], late: [] as number[] };
    let vapos = 0;
    let total = 0;
    let lateVapos = 0;
    let lateTotal = 0;
    let escorts = 0;
    for (const seed of SEEDS) {
      const course = generateCourse(seed);
      const things = course.things;
      counts.early.push(things.filter((t) => alive(t, 600)).length);
      counts.late.push(things.filter((t) => alive(t, 3300)).length);
      for (const th of things) {
        total++;
        if (th.kind === "vapo") vapos++;
        if (th.spawn >= 2400) {
          lateTotal++;
          if (th.kind === "vapo") lateVapos++;
        }
        const d = difficultyAt(th.spawn);
        if (th.escortOf === null) {
          expect(th.life).toBeGreaterThanOrEqual(d.lifeMin);
          expect(th.life).toBeLessThanOrEqual(d.lifeMax);
        }
        if (th.escortOf !== null) {
          escorts++;
          expect(th.spawn).toBeGreaterThanOrEqual(ESCORT_FROM_TICK);
          expect(th.kind).toBe("vapo");
        }
        if (th.kind === "vapo") {
          for (const other of things) {
            if (other.kind !== "colilla") continue;
            const from = Math.max(th.spawn, other.spawn);
            const to = Math.min(th.spawn + th.life, other.spawn + other.life);
            for (let t = from; t < to; t += 4) expect(boxesTooClose(posAt(th, (t - th.spawn) * SUBSTEPS), "vapo", posAt(other, (t - other.spawn) * SUBSTEPS), "colilla", GAP - 30), `${seed} ${th.id}/${other.id} en ${t}`).toBe(false);
          }
        }
      }
      // toda colilla tiene un momento libre (se muestrea de a 3 ticks, como en la generación)
      for (const th of things) if (th.kind === "colilla") expect(hasFreeMoment(th, things), `${seed} colilla ${th.id}`).toBe(true);
    }
    const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * f)]!;
    expect(q(counts.early, 0.5)).toBeGreaterThanOrEqual(3);
    expect(q(counts.early, 0.5)).toBeLessThanOrEqual(5);
    expect(q(counts.late, 0.5)).toBeGreaterThanOrEqual(6);
    expect(q(counts.late, 0.5)).toBeLessThanOrEqual(10);
    expect(vapos / total).toBeGreaterThan(0.15);
    expect(vapos / total).toBeLessThan(0.4);
    expect(lateVapos / lateTotal).toBeGreaterThan(vapos / total);
    expect(escorts).toBeGreaterThan(1000);
    expect(difficultyAt(0)).toMatchObject({ countMin: 3, countMax: 4, vapoPct: 10 });
    expect(difficultyAt(1200)).toMatchObject({ countMin: 5, countMax: 6, vapoPct: 20 });
    expect(difficultyAt(2400)).toMatchObject({ countMin: 6, countMax: 8, vapoPct: 30 });
    expect(difficultyAt(3600)).toMatchObject({ countMin: 8, countMax: 9, vapoPct: 40 });
    expect(difficultyAt(600).lifeMax).toBeLessThan(difficultyAt(0).lifeMax);
  }, 300_000);

  it("justicia: el jugador automático con 250 ms de demora, que solo tira con el camino libre, come 15 o más en el 99 % de 1.000 semillas", () => {
    let ok = 0;
    let worst = Infinity;
    for (const seed of SEEDS) {
      const r = botTrace(seed, { reaction: 15 }).result;
      expect(r.crashed, `${seed} agarró un vapo`).toBe(false);
      if (r.score >= 15) ok++;
      worst = Math.min(worst, r.score);
    }
    process.stdout.write(`rana: jugador justo (250 ms): ${ok}/1000 con 15 o más, el peor ${worst}\n`);
    expect(ok).toBeGreaterThanOrEqual(990);
  }, 300_000);

  it("calibración: el jugador modelo come entre 20 y 40 (mediana) y el lento, menos", () => {
    const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
    const seeds = SEEDS.slice(0, 80);
    const model = seeds.map((s) => botTrace(s, MODEL).result.score);
    const slow = seeds.map((s) => botTrace(s, { reaction: 30, lead: false, aimError: 220, pause: 30 }).result.score);
    process.stdout.write(`rana: modelo p25/med/p75 ${q(model, 0.25)}/${q(model, 0.5)}/${q(model, 0.75)}; lento ${q(slow, 0.5)}\n`);
    expect(q(model, 0.5)).toBeGreaterThanOrEqual(20);
    expect(q(model, 0.5)).toBeLessThanOrEqual(40);
    expect(q(slow, 0.5)).toBeLessThanOrEqual(q(model, 0.5));
  }, 120_000);
});

describe("validate", () => {
  it("acepta una partida real (por tiempo o por vapeador) con su duración", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const a = botTrace(seed, MODEL);
      const endTick = a.events[a.events.length - 1]!.tick;
      const elapsed = 3000 + Math.floor((endTick * 1000) / TICKS_PER_S) + 1000;
      const v = check(seed, a.events, elapsed);
      expect(v.ok, `${seed}: ${JSON.stringify(v)}`).toBe(true);
      if (v.ok) expect(v.score).toBe(a.result.score);
      expect(validate({ score: a.result.score, events: a.events }, seed, { elapsedMs: elapsed })).toBe(true);
      const vapo = botTrace(seed, { reaction: 15, thenVapo: 3 });
      expect(vapo.result.crashed).toBe(true);
      expect(validate({ score: vapo.result.score, events: vapo.events }, seed)).toBe(true);
    }
  });

  it("rechaza colillas infladas, un toque con la lengua afuera, ticks fuera de orden, coordenadas fuera de rango, otra semilla y un fin incoherente", () => {
    const a = botTrace(SEED, { reaction: 15, thenVapo: 4 });
    const t = licksOf(a.events);
    const end = a.events[a.events.length - 1]!.tick;
    const bad = (events: unknown) => {
      const v = check(SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    expect(validate({ score: a.result.score + 1, events: a.events }, SEED)).toBe(false);
    expect(validate({ score: a.result.score, events: a.events }, "otra")).toBe(false);
    expect(bad([t[0], { ...t[0], tick: t[0]!.tick + 1 }, ...t.slice(1), { tick: end, fin: true }])).toBe("un toque con la lengua afuera");
    expect(bad([t[1], t[0], ...t.slice(2), { tick: end, fin: true }])).toBe("ticks fuera de orden");
    expect(bad([{ ...t[0], x: FIELD + 1 }, ...t.slice(1), { tick: end, fin: true }])).toBe("coordenada fuera del área");
    expect(bad([{ ...t[0], y: -1 }, ...t.slice(1), { tick: end, fin: true }])).toBe("coordenada fuera del área");
    expect(bad([...t, { tick: END_TICK + 1, fin: true }])).toBe("tick de fin fuera de rango");
    expect(bad([...t, { tick: end + 30, fin: true }])).toBe("el tick de fin no es el del vapeador");
    expect(bad([...t, { tick: t[t.length - 1]!.tick, fin: true }])).toBe("toque después del final");
    expect(bad(t)).toBe("falta el cierre de la traza");
    const endMs = Math.floor((end * 1000) / TICKS_PER_S);
    expect(check(SEED, a.events, endMs - 500)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
    expect(check(SEED, a.events, endMs + 11_000)).toMatchObject({ ok: false, reason: "el intento duró mucho más que la partida" });
    expect(check(SEED, a.events, endMs + 3_000)).toMatchObject({ ok: true });
  });
});

describe("el arte", () => {
  it("la rana es la grilla de la mascota (15 × 15) con la boca cerrada, abierta y masticando; la colilla y el vapo tienen alitas del mismo tamaño", () => {
    for (const m of ["cerrada", "abierta", "masticando"] as const) expect([frogSprite(m).w, frogSprite(m).h]).toEqual([15, 15]);
    expect(JSON.stringify(frogSprite("abierta"))).not.toBe(JSON.stringify(frogSprite("cerrada")));
    expect(frogSprite("cerrada", { dark: true }).px.some((p) => p.c === "#2E5F2A")).toBe(true);
    expect([colillaSprite(0).w, colillaSprite(0).h]).toEqual([24, 10]);
    expect([vapoSprite(0).w, vapoSprite(0).h]).toEqual([16, 14]);
    expect(JSON.stringify(colillaSprite(0))).not.toBe(JSON.stringify(colillaSprite(1)));
    expect(TIP_R).toBe(70);
  });
});
