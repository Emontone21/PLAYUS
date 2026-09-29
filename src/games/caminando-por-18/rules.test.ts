import { describe, expect, it } from "vitest";
import {
  check,
  contains,
  DONPASTA_FIRST_TICK,
  END_TICK,
  FIELD_H,
  FIELD_W,
  generateStreet,
  initialState,
  INVULN_TICKS,
  MAX_SCORE,
  MAX_TAPS_PER_WINDOW,
  MIN_TAP_GAP_TICKS,
  MIN_TRAVEL_TICKS,
  perfectTrace,
  playBot,
  simulate,
  SPECS,
  START_LIVES,
  step,
  SUB,
  TICKS_PER_M,
  TICKS_PER_S,
  validate,
  WINDOW_TICKS,
  type Spawn,
  type TapEvent,
  type TraceEvent,
} from "./rules";
import { KINDS_ALL, pastosoSprite, walkerSprite, WALKER_SPRITE_H, WALKER_SPRITE_W } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const tapsOf = (events: TraceEvent[]) => events.filter((e): e is TapEvent => !("fin" in e));
const endOf = (events: TraceEvent[]) => events[events.length - 1]!.tick;
const elapsedFor = (events: TraceEvent[]) => 3_000 + Math.floor((endOf(events) * 1000) / TICKS_PER_S) + 1_000;

/** cuándo llega cada pastoso si nadie lo toca: se mide con la simulación */
function arrivalsOf(street: readonly Spawn[]): Map<number, number> {
  const state = initialState();
  const seen = new Map<number, number>();
  while (!state.end && state.tick < END_TICK) {
    const before = new Set(state.pastosos.filter((p) => p.phase === "viene").map((p) => p.i));
    step(state, street, []);
    for (const i of before) {
      const p = state.pastosos.find((q) => q.i === i);
      if (!p || p.phase !== "viene") if (!seen.has(i)) seen.set(i, state.tick - 1);
    }
    // sin vidas, la simulación termina: seguimos midiendo con vidas infinitas
    state.lives = START_LIVES;
    state.end = null;
    if (state.tick >= END_TICK) break;
  }
  return seen;
}

describe("simulate es determinística", () => {
  it("misma semilla y misma traza dan exactamente lo mismo", () => {
    const { events } = perfectTrace(SEED);
    const a = simulate(SEED, tapsOf(events));
    const b = simulate(SEED, tapsOf(events));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(generateStreet(SEED)).toEqual(generateStreet(SEED));
    expect(generateStreet(SEED)).not.toEqual(generateStreet("intento-2"));
  });

  it("paso a paso y de una dan lo mismo", () => {
    const street = generateStreet(SEED);
    const { events } = perfectTrace(SEED, 2_000);
    const taps = tapsOf(events);
    const s = initialState();
    let k = 0;
    while (s.tick < 2_000 && !s.end) {
      const now: { x: number; y: number }[] = [];
      while (k < taps.length && taps[k]!.tick <= s.tick) now.push(taps[k++]!);
      step(s, street, now);
    }
    expect(simulate(SEED, taps, 2_000).state).toEqual(s);
  });
});

describe("la calle, en 1.000 semillas", () => {
  const streets = SEEDS.map((s) => generateStreet(s));

  it("todo pastoso tarda al menos 900 ms en llegar desde que aparece", () => {
    for (const [i, street] of streets.slice(0, 300).entries()) {
      const arrivals = arrivalsOf(street);
      for (const [idx, at] of arrivals) {
        const s = street[idx]!;
        expect(at - s.tick, `semilla ${i} pastoso ${idx} (${s.kind})`).toBeGreaterThanOrEqual(MIN_TRAVEL_TICKS);
        // y la llegada que calculó la generación es exactamente la real: es la misma simulación
        expect(at).toBe(s.arrive);
      }
    }
  });

  it("ninguna ventana de 1 s exige más de 5 toques, y mientras está don pasta nadie más llega en su mismo segundo", () => {
    // con las llegadas estimadas en las 1.000 calles, y con las reales (medidas con la simulación) en 300
    for (const [i, street] of streets.entries()) {
      const real = i < 300 ? arrivalsOf(street) : null;
      const arrivals = street.map((s, idx) => [real?.get(idx) ?? s.arrive, SPECS[s.kind].hits] as const);
      for (const [t] of arrivals) {
        let sum = 0;
        for (const [u, c] of arrivals) if (Math.abs(u - t) <= WINDOW_TICKS) sum += c;
        expect(sum).toBeLessThanOrEqual(MAX_TAPS_PER_WINDOW);
      }
      for (const dp of street.filter((s) => s.kind === "donpasta")) {
        for (const o of street) {
          if (o === dp) continue;
          if (o.arrive >= dp.tick && o.arrive <= dp.arrive + WINDOW_TICKS) expect(Math.abs(o.arrive - dp.arrive)).toBeGreaterThan(WINDOW_TICKS);
        }
      }
    }
  });

  it("los tipos se suman según la tabla y don pasta sale desde los 20 s cada 25 a 35 s", () => {
    for (const street of streets) {
      for (const s of street) {
        expect(s.tick).toBeGreaterThanOrEqual(SPECS[s.kind].from * TICKS_PER_S);
        expect(s.x === 5 || s.x === 85).toBe(true);
        expect(s.y).toBeGreaterThanOrEqual(SPECS[s.kind].yMin);
        expect(s.y).toBeLessThanOrEqual(SPECS[s.kind].yMax);
      }
      const dps = street.filter((s) => s.kind === "donpasta").map((s) => s.tick);
      expect(dps.length).toBeGreaterThanOrEqual(2);
      expect(dps[0]).toBeGreaterThanOrEqual(DONPASTA_FIRST_TICK);
      for (let i = 1; i < dps.length; i++) {
        expect(dps[i]! - dps[i - 1]!).toBeGreaterThanOrEqual(25 * TICKS_PER_S);
        expect(dps[i]! - dps[i - 1]!).toBeLessThanOrEqual(35 * TICKS_PER_S + 1);
      }
    }
    const kinds = new Map<string, number>();
    for (const street of streets) for (const s of street) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
    for (const k of ["promotor", "firmas", "volantes", "celular", "donpasta"]) expect(kinds.get(k)).toBeGreaterThan(0);
  });

  it("salen cada vez más seguido", () => {
    const street = streets[0]!;
    const early = street.filter((s) => s.tick < 1200 && s.kind !== "donpasta").length;
    const late = street.filter((s) => s.tick >= 5400 && s.tick < 6600 && s.kind !== "donpasta").length;
    expect(late).toBeGreaterThan(early * 1.8);
  });

  it("el jugador perfecto llega a los 120 s con las tres vidas", () => {
    for (const seed of SEEDS.slice(0, 300)) {
      const { result } = perfectTrace(seed);
      expect({ seed, reason: result.endReason, lives: result.lives, score: result.score }).toEqual({ seed, reason: "tiempo", lives: START_LIVES, score: MAX_SCORE });
    }
  });
});

describe("reglas", () => {
  const street = generateStreet(SEED);

  it("un toque saca a un pastoso común, y tocar el vacío no hace nada", () => {
    const s = initialState();
    while (s.pastosos.length === 0) step(s, street, []);
    const p = s.pastosos[0]!;
    expect(SPECS[p.kind].hits).toBe(1);
    const before = JSON.stringify(s);
    expect(step(s, street, [{ x: 45, y: 150 }])).toEqual([]);
    const after = JSON.parse(JSON.stringify(s));
    // solo avanzó un tick: nada cambió salvo posiciones y tick
    expect(after.tapsDone).toBe(0);
    expect(after.lives).toBe(JSON.parse(before).lives);
    const counted = step(s, street, [{ x: Math.round(p.x / SUB), y: Math.round(p.y / SUB) }]);
    expect(counted).toHaveLength(1);
    expect(p.phase).toBe("se-va");
    expect(s.tapsDone).toBe(1);
  });

  it("don pasta necesita exactamente 4 toques y retrocede con cada uno", () => {
    // una calle con don pasta solo, para no perder vidas mientras tanto
    const fake: Spawn[] = [{ kind: "donpasta", tick: 0, side: -1, x: 5, y: 40, arrive: 200 }];
    const s = initialState();
    for (let i = 0; i < 6; i++) step(s, fake, []);
    const p = s.pastosos.find((q) => q.kind === "donpasta")!;
    const distBefore = Math.abs(p.y - 120 * SUB);
    for (let hit = 1; hit <= 3; hit++) {
      const tapAt = { x: Math.round(p.x / SUB), y: Math.round(p.y / SUB) };
      expect(step(s, fake, [tapAt])).toHaveLength(1);
      expect(p.hits).toBe(hit);
      expect(p.phase).toBe("viene");
      for (let i = 0; i < MIN_TAP_GAP_TICKS; i++) step(s, fake, []);
    }
    // tres toques (con sus retrocesos) y sigue lejos: no avanzó casi nada
    expect(Math.abs(p.y - 120 * SUB)).toBeGreaterThan(distBefore - 5 * SUB);
    const tapAt = { x: Math.round(p.x / SUB), y: Math.round(p.y / SUB) };
    expect(step(s, fake, [tapAt])).toHaveLength(1);
    expect(p.hits).toBe(4);
    expect(p.phase).toBe("se-va");
  });

  it("un pastoso que llega resta una vida y se va; la invulnerabilidad evita perder dos en el mismo segundo; tres terminan la partida", () => {
    const s = initialState();
    const lives: number[] = [3];
    const lostTicks: number[] = [];
    while (!s.end) {
      step(s, street, []);
      if (lives[lives.length - 1] !== s.lives) {
        lives.push(s.lives);
        lostTicks.push(s.tick - 1);
      }
    }
    expect(lives).toEqual([3, 2, 1, 0]);
    expect(s.end).toEqual({ tick: lostTicks[2]! + 1, reason: "frenado" });
    for (let i = 1; i < lostTicks.length; i++) expect(lostTicks[i]! - lostTicks[i - 1]!).toBeGreaterThanOrEqual(INVULN_TICKS);
    // el que lo agarró se fue
    const grabbers = s.pastosos.filter((p) => p.phase === "agarra");
    expect(grabbers.length).toBeLessThanOrEqual(1);
    expect(s.lostAt).toEqual(lostTicks);
  });

  it("la invulnerabilidad dura un segundo: en ese lapso, otro que llega no resta", () => {
    // dos pastosos que llegan casi juntos: se fuerza con una calle artificial
    const fake: Spawn[] = [
      { kind: "promotor", tick: 0, side: -1, x: 5, y: 60, arrive: 90 },
      { kind: "promotor", tick: 10, side: 1, x: 85, y: 60, arrive: 100 },
    ];
    const s = initialState();
    while (s.tick < 400 && s.lives === 3) step(s, fake, []);
    const firstLoss = s.tick;
    while (s.tick < firstLoss + INVULN_TICKS + 40) step(s, fake, []);
    expect(s.lives).toBe(2);
    expect(s.pastosos.filter((p) => p.phase === "viene")).toHaveLength(0);
  });

  it("los metros son el tiempo por la velocidad: 5 m/s, 12 ticks por metro", () => {
    expect(TICKS_PER_M).toBe(12);
    expect(MAX_SCORE).toBe(600);
    const { result } = perfectTrace(SEED);
    expect(result.score).toBe(600);
    expect(perfectTrace(SEED, 1200).result.score).toBe(100);
    expect(simulate(SEED, [], 1200).endReason).toBe("frenado");
  });

  it("si el toque cae sobre varios, cuenta el más cercano al personaje; las cajas son más grandes que el dibujo", () => {
    const s = initialState();
    const fake: Spawn[] = [
      { kind: "firmas", tick: 0, side: -1, x: 5, y: 60, arrive: 100 },
      { kind: "promotor", tick: 0, side: -1, x: 5, y: 62, arrive: 90 },
    ];
    step(s, fake, []);
    step(s, fake, []);
    const [a, b] = s.pastosos;
    expect(a && b).toBeTruthy();
    const tap = { x: Math.round(a!.x / SUB), y: Math.round((a!.y + b!.y) / 2 / SUB) };
    expect(contains(a!, tap.x, tap.y) && contains(b!, tap.x, tap.y)).toBe(true);
    step(s, fake, [tap]);
    const gone = s.pastosos.find((p) => p.phase === "se-va")!;
    const stays = s.pastosos.find((p) => p.phase === "viene")!;
    expect(gone.kind).toBe("promotor");
    expect(stays.kind).toBe("firmas");
    // margen de 3 unidades alrededor del dibujo
    expect(contains(stays, Math.round(stays.x / SUB) + 8, Math.round(stays.y / SUB))).toBe(true);
    expect(contains(stays, Math.round(stays.x / SUB) + 10, Math.round(stays.y / SUB))).toBe(false);
  });
});

describe("validate de caminando por 18", () => {
  const { events, result } = perfectTrace(SEED, 1_800);
  const elapsed = elapsedFor(events);

  it("acepta una traza real (cortada por el cronómetro, terminada sola y la partida entera)", () => {
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: elapsed })).toBe(true);
    const full = perfectTrace(SEED);
    expect(validate({ score: full.result.score, events: full.events }, SEED, { elapsedMs: elapsedFor(full.events) })).toBe(true);
    const lazy = playBot(SEED, () => null);
    expect(lazy.result.endReason).toBe("frenado");
    expect(validate({ score: lazy.result.score, events: lazy.events }, SEED, { elapsedMs: elapsedFor(lazy.events) })).toBe(true);
  });

  it("rechaza metros inflados", () => {
    expect(result.score).toBeGreaterThan(0);
    expect(validate({ score: result.score + 1, events }, SEED, { elapsedMs: elapsed })).toBe(false);
    expect(validate({ score: result.score - 1, events }, SEED, { elapsedMs: elapsed })).toBe(false);
  });

  it("rechaza ticks fuera de orden, después del final, coordenadas fuera del campo y un intervalo de 20 ms", () => {
    const taps = tapsOf(events);
    expect(taps.length).toBeGreaterThan(3);
    const fin = events[events.length - 1]!;
    const swapped = [taps[1]!, taps[0]!, ...taps.slice(2), fin];
    expect(check(SEED, swapped)).toEqual({ ok: false, reason: "ticks fuera de orden" });
    expect(check(SEED, [...taps, { tick: endOf(events) + 5, x: 10, y: 10 }, fin])).toEqual({ ok: false, reason: "toque después del final" });
    for (const bad of [{ x: -1, y: 10 }, { x: FIELD_W + 1, y: 10 }, { x: 10, y: FIELD_H + 1 }, { x: 10.5, y: 10 }]) {
      expect(check(SEED, [{ ...taps[0]!, ...bad }, ...taps.slice(1), fin]).ok).toBe(false);
    }
    const close = [taps[0]!, { ...taps[1]!, tick: taps[0]!.tick + 1 }, ...taps.slice(2), fin];
    expect(check(SEED, close)).toEqual({ ok: false, reason: "dos toques demasiado seguidos" });
    expect(MIN_TAP_GAP_TICKS).toBe(3);
  });

  it("rechaza una traza armada con otra semilla y un toque al vacío", () => {
    const other = perfectTrace("otra-semilla", 1_800);
    expect(validate({ score: other.result.score, events: other.events }, "otra-semilla", { elapsedMs: elapsedFor(other.events) })).toBe(true);
    expect(validate({ score: other.result.score, events: other.events }, SEED, { elapsedMs: elapsedFor(other.events) })).toBe(false);
    const fin = events[events.length - 1]!;
    const taps = tapsOf(events);
    expect(check(SEED, [{ tick: 5, x: 45, y: 150 }, ...taps, fin]).ok).toBe(false);
  });

  it("rechaza un tick de fin que no sale de la partida y uno incoherente con la duración real", () => {
    const lazy = playBot(SEED, () => null);
    const stretched = [...lazy.events.slice(0, -1), { tick: endOf(lazy.events) + 60, fin: true }];
    expect(check(SEED, stretched)).toEqual({ ok: false, reason: "el final no coincide con la partida" });
    expect(check(SEED, [{ tick: END_TICK + 1, fin: true }]).ok).toBe(false);
    expect(check(SEED, tapsOf(events)).ok).toBe(false);
    expect(check(SEED, []).ok).toBe(false);
    const endMs = Math.floor((endOf(events) * 1000) / TICKS_PER_S);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs - 1 })).toBe(false);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs })).toBe(true);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs + 10_000 })).toBe(true);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs + 10_001 })).toBe(false);
  });
});

describe("sprites", () => {
  it("el personaje tiene tres cuadros del mismo tamaño y los cinco pastosos se distinguen", () => {
    for (const f of [0, 1, 2] as const) {
      const s = walkerSprite(f);
      expect([s.w, s.h]).toEqual([WALKER_SPRITE_W, WALKER_SPRITE_H]);
    }
    const shapes = new Set<string>();
    for (const k of KINDS_ALL) shapes.add(JSON.stringify(pastosoSprite(k, "viene", 0).px));
    expect(shapes.size).toBe(KINDS_ALL.length);
    expect(pastosoSprite("donpasta", "viene", 0).px).not.toEqual(pastosoSprite("donpasta", "viene", 3).px);
    expect(pastosoSprite("promotor", "viene", 0).px).not.toEqual(pastosoSprite("promotor", "se-va", 0).px);
  });
});
