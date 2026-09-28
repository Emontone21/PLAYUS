import { describe, expect, it } from "vitest";
import {
  CATCH_REACH,
  CLEAR,
  END_TICK,
  FIELD_W,
  generateRain,
  greedyTarget,
  greedyTrace,
  initialState,
  isWish,
  LARRY_SPEED,
  MAX_SCORE,
  NEAR_TICKS,
  playBot,
  REACH_DEN,
  REACH_NUM,
  scheduleAt,
  simulate,
  START_LIVES,
  step,
  SUB,
  TICKS_PER_S,
  validate,
  check,
  BAD_KINDS,
  WISH_KINDS,
  type Drop,
  type InputEvent,
  type SimState,
  type TraceEvent,
} from "./rules";
import { dropSprite, larrySprite, LARRY_SPRITE_H, LARRY_SPRITE_W } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const inputsOf = (events: TraceEvent[]) => events.filter((e): e is InputEvent => !("fin" in e));
const endOf = (events: TraceEvent[]) => events[events.length - 1]!.tick;
/** una duración del intento coherente con la traza: la cuenta regresiva y un segundo de cierre */
const elapsedFor = (events: TraceEvent[]) => 3_000 + Math.floor((endOf(events) * 1000) / TICKS_PER_S) + 1_000;

describe("simulate es determinística", () => {
  it("misma semilla y misma traza dan exactamente lo mismo", () => {
    const { events } = greedyTrace(SEED);
    const a = simulate(SEED, inputsOf(events));
    const b = simulate(SEED, inputsOf(events));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(generateRain(SEED)).toEqual(generateRain(SEED));
    expect(generateRain(SEED)).not.toEqual(generateRain("intento-2"));
  });

  it("paso a paso y de una dan lo mismo (el cliente avanza de a ticks)", () => {
    const rain = generateRain(SEED);
    const { events } = greedyTrace(SEED, 2_000);
    const inputs = inputsOf(events);
    const s = initialState();
    let target = s.target;
    let k = 0;
    while (s.tick < 2_000 && !s.end) {
      while (k < inputs.length && inputs[k]!.tick <= s.tick) target = inputs[k++]!.x;
      step(s, rain, target);
    }
    expect(simulate(SEED, inputs, 2_000).state).toEqual(s);
  });
});

describe("la lluvia, en 1.000 semillas", () => {
  const rains = SEEDS.map((s) => generateRain(s));

  it("todo deseo es alcanzable: el jugador perfecto (que solo usa lo que ve) los agarra todos y llega a los 90 s", () => {
    for (const seed of SEEDS) {
      const { result } = greedyTrace(seed);
      const inGame = generateRain(seed).filter((d) => isWish(d.kind) && d.cross < END_TICK).length;
      expect({ seed, reason: result.endReason, lives: result.lives, score: result.score }).toEqual({ seed, reason: "tiempo", lives: START_LIVES, score: inGame });
    }
  });

  it("cada deseo se alcanza desde el anterior con 3/4 de la velocidad máxima, desde que aparece", () => {
    for (const rain of rains) {
      let prev = { cross: 0, x: 45 };
      for (const d of rain.filter((r) => isWish(r.kind))) {
        const steps = d.cross - Math.max(prev.cross, d.spawn);
        expect(Math.abs(d.x - prev.x) * SUB * REACH_DEN).toBeLessThanOrEqual(steps * LARRY_SPEED * REACH_NUM);
        prev = d;
      }
    }
  });

  it("ningún objeto malo cae pegado a un deseo que cruza casi al mismo tiempo", () => {
    for (const rain of rains) {
      const wishes = rain.filter((d) => isWish(d.kind));
      for (const b of rain.filter((d) => !isWish(d.kind))) {
        for (const w of wishes) {
          if (Math.abs(w.cross - b.cross) <= NEAR_TICKS) expect(Math.abs(w.x - b.x)).toBeGreaterThanOrEqual(CLEAR);
        }
      }
    }
  });

  it("agarrar un deseo nunca obliga a tocar algo malo en el mismo tick: nada cruza a la vez, y hay lugar para uno sin el otro", () => {
    for (const rain of rains) {
      for (let i = 1; i < rain.length; i++) expect(rain[i]!.cross).toBeGreaterThan(rain[i - 1]!.cross);
    }
    // CLEAR deja a Larry centrado en el deseo lejos del malo, con margen
    expect(CLEAR * SUB).toBeGreaterThan(CATCH_REACH);
  });

  it("los objetos quedan dentro del campo", () => {
    for (const rain of rains) for (const d of rain) expect(d.x >= 4 && d.x <= FIELD_W - 4).toBe(true);
  });

  it("hamburguesas y vapos salen parejo, y la proporción de malos sigue el cronograma", () => {
    let burgers = 0;
    let wishes = 0;
    const kinds = new Map<string, number>();
    const bands = [0, 1, 2].map(() => ({ bad: 0, all: 0, expected: 0 }));
    for (const rain of rains) {
      for (const d of rain) {
        kinds.set(d.kind, (kinds.get(d.kind) ?? 0) + 1);
        if (isWish(d.kind)) {
          wishes++;
          if (d.kind === "hamburguesa") burgers++;
        }
        const band = bands[Math.min(2, Math.floor(d.spawn / 1800))]!;
        band.all++;
        band.expected += scheduleAt(d.spawn).bad / 1000;
        if (!isWish(d.kind)) band.bad++;
      }
    }
    expect(burgers / wishes).toBeGreaterThan(0.48);
    expect(burgers / wishes).toBeLessThan(0.52);
    for (const b of bands) expect(Math.abs(b.bad / b.all - b.expected / b.all)).toBeLessThan(0.01);
    for (const k of [...WISH_KINDS, ...BAD_KINDS]) expect(kinds.get(k)).toBeGreaterThan(0);
  });

  it("cae cada vez más seguido y más rápido", () => {
    const rain = rains[0]!;
    const early = rain.filter((d) => d.spawn < 1800);
    const late = rain.filter((d) => d.spawn >= 3600);
    expect(late.length).toBeGreaterThan(early.length * 1.8);
    const avgV = (ds: Drop[]) => ds.reduce((s, d) => s + d.v, 0) / ds.length;
    expect(avgV(late)).toBeGreaterThan(avgV(early) * 1.6);
  });

  it("MAX_SCORE es una cota: ningún jugador puede agarrar más deseos de los que caen", () => {
    for (const rain of rains) expect(rain.filter((d) => isWish(d.kind) && d.cross < END_TICK).length).toBeLessThanOrEqual(MAX_SCORE);
  });
});

describe("reglas", () => {
  it("un deseo que cae al piso resta una vida, y tres terminan la partida", () => {
    // Larry quieto en el medio: los deseos se le caen de a uno
    const found = SEEDS.map((seed) => ({ seed, r: simulate(seed, []) })).find((x) => x.r.endReason === "sin-vidas")!;
    const rain = generateRain(found.seed);
    const s = initialState();
    const lives = [s.lives];
    while (!s.end) {
      step(s, rain, 45);
      if (lives[lives.length - 1] !== s.lives) lives.push(s.lives);
    }
    expect(lives).toEqual([3, 2, 1, 0]);
    const plafs = s.splats.filter((p) => isWish(p.kind));
    expect(plafs).toHaveLength(3);
    // termina en el tick del tercer plaf
    expect(s.end).toEqual({ tick: plafs[2]!.tick + 1, reason: "sin-vidas" });
    expect(found.r.endTick).toBe(plafs[2]!.tick + 1);
  });

  it("un objeto malo termina la partida en el acto", () => {
    // un jugador que va a buscar lo malo
    for (const seed of SEEDS.slice(0, 50)) {
      const { result } = playBot(seed, (s: SimState, rain: readonly Drop[]) => {
        const bad = s.falling.map((f) => rain[f.i]!).find((d) => !isWish(d.kind));
        return bad ? bad.x : s.target;
      });
      expect(["verdura", "bandera", "sin-vidas"]).toContain(result.endReason);
      if (result.endReason === "verdura" || result.endReason === "bandera") {
        const caught = result.state.lastCatch!;
        expect(isWish(caught.kind)).toBe(false);
        expect(caught.kind === "bandera" ? "bandera" : "verdura").toBe(result.endReason);
        expect(result.endTick).toBe(caught.tick + 1);
      }
    }
  });

  it("llegar a 90 segundos la termina", () => {
    const { result, events } = greedyTrace(SEED);
    expect(result.endReason).toBe("tiempo");
    expect(result.endTick).toBe(END_TICK);
    expect(endOf(events)).toBe(END_TICK);
    expect(END_TICK).toBe(90 * TICKS_PER_S);
  });

  it("Larry no se teletransporta: camina a velocidad máxima hacia el dedo", () => {
    const rain = generateRain(SEED);
    const s = initialState();
    step(s, rain, 90);
    expect(s.larryX - s.prevLarryX).toBe(LARRY_SPEED);
    let n = 1;
    while (s.larryX !== 84 * SUB) {
      step(s, rain, 90);
      n++;
    }
    expect(n).toBe(Math.ceil(((84 - 45) * SUB) / LARRY_SPEED));
  });

  it("el objetivo del jugador perfecto es siempre un deseo a la vista", () => {
    const rain = generateRain(SEED);
    const s = initialState();
    for (let i = 0; i < 600; i++) {
      const x = greedyTarget(s, rain);
      const visible = s.falling.map((f) => rain[f.i]!);
      if (x !== s.target) expect(visible.some((d) => isWish(d.kind) && d.x === x)).toBe(true);
      step(s, rain, x);
    }
  });
});

describe("validate de los deseos de Larry", () => {
  const { events, result } = greedyTrace(SEED, 1_500);
  const elapsed = elapsedFor(events);

  it("acepta una traza real (también la cortada por el cronómetro y la que terminó sola)", () => {
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: elapsed })).toBe(true);
    const full = greedyTrace(SEED);
    expect(validate({ score: full.result.score, events: full.events }, SEED, { elapsedMs: elapsedFor(full.events) })).toBe(true);
    const lazy = playBot(SEED, () => 3);
    expect(lazy.result.endReason).not.toBe("tiempo");
    expect(validate({ score: lazy.result.score, events: lazy.events }, SEED, { elapsedMs: elapsedFor(lazy.events) })).toBe(true);
  });

  it("rechaza un puntaje inflado", () => {
    expect(result.score).toBeGreaterThan(0);
    expect(validate({ score: result.score + 1, events }, SEED, { elapsedMs: elapsed })).toBe(false);
    expect(validate({ score: result.score - 1, events }, SEED, { elapsedMs: elapsed })).toBe(false);
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
    const atEnd = [...inputs, { tick: endOf(events), x: 10 }, { tick: endOf(events), fin: true }];
    expect(check(SEED, atEnd)).toEqual({ ok: false, reason: "entrada después del final" });
  });

  it("rechaza una x fuera del campo", () => {
    const inputs = inputsOf(events);
    for (const x of [-1, FIELD_W + 1, 12.5]) {
      const bad = [{ ...inputs[0]!, x }, ...inputs.slice(1), events[events.length - 1]!];
      expect(check(SEED, bad).ok).toBe(false);
    }
  });

  it("rechaza una traza armada con otra semilla", () => {
    const other = greedyTrace("otra-semilla");
    expect(validate({ score: other.result.score, events: other.events }, "otra-semilla", { elapsedMs: elapsedFor(other.events) })).toBe(true);
    expect(validate({ score: other.result.score, events: other.events }, SEED, { elapsedMs: elapsedFor(other.events) })).toBe(false);
  });

  it("rechaza un tick de fin que no sale de la partida", () => {
    // la partida terminó sola (sin vidas o por algo malo) antes de lo que dice la traza
    const lazy = playBot(SEED, () => 3);
    const stretched = [...lazy.events.slice(0, -1), { tick: endOf(lazy.events) + 60, fin: true }];
    expect(check(SEED, stretched)).toEqual({ ok: false, reason: "el final no coincide con la partida" });
    // más allá de los 90 s, sin cierre o mal armada
    expect(check(SEED, [{ tick: END_TICK + 1, fin: true }]).ok).toBe(false);
    expect(check(SEED, inputsOf(events)).ok).toBe(false);
    expect(check(SEED, "nada").ok).toBe(false);
    expect(check(SEED, []).ok).toBe(false);
  });

  it("rechaza un tick de fin incoherente con la duración real del intento", () => {
    const endMs = Math.floor((endOf(events) * 1000) / TICKS_PER_S);
    // la partida no pudo durar más que el intento
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs - 1 })).toBe(false);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs })).toBe(true);
    // ni el intento durar mucho más que la partida (el mismo margen de 10 s de /finish)
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs + 10_000 })).toBe(true);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs + 10_001 })).toBe(false);
  });
});

describe("sprites", () => {
  it("Larry mide 14 × 22 en todos sus gestos y cuadros, y los objetos son chicos y distintos", () => {
    for (const face of ["normal", "feliz", "asco", "bajon"] as const) {
      for (const walk of [0, 1, 2] as const) {
        const s = larrySprite(face, walk);
        expect([s.w, s.h]).toEqual([LARRY_SPRITE_W, LARRY_SPRITE_H]);
        expect(s.px.every((p) => p.x >= 0 && p.x < s.w && p.y >= 0 && p.y < s.h)).toBe(true);
      }
    }
    expect(larrySprite("normal", 1).px).not.toEqual(larrySprite("normal", 2).px);
    const shapes = new Set<string>();
    for (const k of [...WISH_KINDS, ...BAD_KINDS]) {
      const s = dropSprite(k);
      expect(s.w).toBeLessThanOrEqual(10);
      expect(s.h).toBeLessThanOrEqual(10);
      shapes.add(s.px.map((p) => `${p.x},${p.y}`).join(" "));
    }
    // seis siluetas distintas
    expect(shapes.size).toBe(6);
  });
});
