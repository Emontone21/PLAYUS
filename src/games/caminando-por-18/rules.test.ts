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
  MAX_SCORE,
  MAX_TAPS_PER_WINDOW,
  MIN_TAP_GAP_TICKS,
  MIN_TRAVEL_TICKS,
  OPPOSITE,
  OPPOSITE_TICKS,
  perfectTrace,
  PHRASES,
  playBot,
  sidesAt,
  simulate,
  SPECS,
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
import { relativeSpeed, travelOf } from "./rules";

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
    // un contacto termina la partida: seguimos midiendo como si no
    state.end = null;
    state.pastosos = state.pastosos.filter((p) => p.phase !== "agarra");
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

  it("todo pastoso tarda al menos 700 ms en llegar desde que entra en pantalla", () => {
    for (const [i, street] of streets.slice(0, 120).entries()) {
      const arrivals = arrivalsOf(street);
      for (const [idx, at] of arrivals) {
        const s = street[idx]!;
        expect(at - s.tick, `semilla ${i} pastoso ${idx} (${s.kind})`).toBeGreaterThanOrEqual(MIN_TRAVEL_TICKS);
        // y la llegada que calculó la generación es exactamente la real: es la misma simulación
        expect(at).toBe(s.arrive);
      }
    }
  });

  it("ninguna ventana de 1 s exige más de 6 toques, nadie llega en el segundo de don pasta, y nunca dos de lados opuestos a menos de 400 ms", () => {
    // con las llegadas previstas en las 1.000 calles (que son las reales: el test de arriba lo comprueba)
    for (const street of streets) {
      const arrivals = street.map((s) => ({ t: s.arrive, c: SPECS[s.kind].hits, side: s.side })).sort((a, b) => a.t - b.t);
      let lo = 0;
      for (let i = 0; i < arrivals.length; i++) {
        const a = arrivals[i]!;
        while (arrivals[lo]!.t < a.t - WINDOW_TICKS) lo++;
        let sum = 0;
        for (let j = lo; j < arrivals.length && arrivals[j]!.t <= a.t + WINDOW_TICKS; j++) {
          const b = arrivals[j]!;
          sum += b.c;
          if (j !== i && b.side === OPPOSITE[a.side]) expect(Math.abs(b.t - a.t)).toBeGreaterThanOrEqual(OPPOSITE_TICKS);
        }
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

  it("los tipos se suman según la tabla, aparecen por los cuatro lados (los de atrás desde los 10 s), dicen una de las tres frases, y don pasta sale desde los 20 s cada 25 a 35 s", () => {
    const sides = new Map<string, number>();
    for (const street of streets) {
      for (const s of street) {
        expect(s.tick).toBeGreaterThanOrEqual(SPECS[s.kind].from * TICKS_PER_S);
        expect(sidesAt(s.tick)).toContain(s.side);
        if (s.side === "izq" || s.side === "der") {
          expect(s.x === 5 || s.x === 85).toBe(true);
          expect(s.y).toBeGreaterThanOrEqual(SPECS[s.kind].yMin);
          expect(s.y).toBeLessThanOrEqual(SPECS[s.kind].yMax);
        } else {
          expect(s.y === 2 || s.y === 158).toBe(true);
          expect(s.x).toBeGreaterThanOrEqual(20);
          expect(s.x).toBeLessThanOrEqual(70);
        }
        if (s.kind === "donpasta") expect(s.phrase).toBe(-1);
        else expect(PHRASES[s.phrase]).toBeDefined();
        sides.set(s.side, (sides.get(s.side) ?? 0) + 1);
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
    for (const sd of ["izq", "der", "arriba", "abajo"]) expect(sides.get(sd)).toBeGreaterThan(1000);
    // don pasta también por cualquier lado
    const dpSides = new Set(streets.flatMap((st) => st.filter((s) => s.kind === "donpasta").map((s) => s.side)));
    expect(dpSides.size).toBe(4);
  });

  it("salen cada vez más seguido", () => {
    const street = streets[0]!;
    const early = street.filter((s) => s.tick < 600 && s.kind !== "donpasta").length;
    const late = street.filter((s) => s.tick >= 3600 && s.tick < 4200 && s.kind !== "donpasta").length;
    expect(late).toBeGreaterThan(early * 1.5);
  });

  it("el jugador perfecto llega a los 120 s sin que lo frenen", () => {
    for (const seed of SEEDS.slice(0, 300)) {
      const { result } = perfectTrace(seed);
      expect({ seed, reason: result.endReason, score: result.score }).toEqual({ seed, reason: "tiempo", score: MAX_SCORE });
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
    expect(after.end).toBe(JSON.parse(before).end);
    const counted = step(s, street, [{ x: Math.round(p.x / SUB), y: Math.round(p.y / SUB) }]);
    expect(counted).toHaveLength(1);
    expect(p.phase).toBe("se-va");
    expect(s.tapsDone).toBe(1);
  });

  it("don pasta necesita exactamente 4 toques y retrocede con cada uno", () => {
    // una calle con don pasta solo, para no perder vidas mientras tanto
    const fake: Spawn[] = [{ kind: "donpasta", tick: 0, side: "izq", x: 5, y: 40, arrive: 200, phrase: -1 }];
    const s = initialState();
    for (let i = 0; i < 6; i++) step(s, fake, []);
    const p = s.pastosos.find((q) => q.kind === "donpasta")!;
    const distBefore = Math.abs(p.y - 100 * SUB);
    for (let hit = 1; hit <= 3; hit++) {
      const tapAt = { x: Math.round(p.x / SUB), y: Math.round(p.y / SUB) };
      expect(step(s, fake, [tapAt])).toHaveLength(1);
      expect(p.hits).toBe(hit);
      expect(p.phase).toBe("viene");
      for (let i = 0; i < MIN_TAP_GAP_TICKS; i++) step(s, fake, []);
    }
    // tres toques (con sus retrocesos) y sigue lejos: no avanzó casi nada
    expect(Math.abs(p.y - 100 * SUB)).toBeGreaterThan(distBefore - 5 * SUB);
    const tapAt = { x: Math.round(p.x / SUB), y: Math.round(p.y / SUB) };
    expect(step(s, fake, [tapAt])).toHaveLength(1);
    expect(p.hits).toBe(4);
    expect(p.phase).toBe("se-va");
  });

  it("un solo contacto termina la partida en el acto, venga de donde venga", () => {
    for (const side of ["izq", "der", "arriba", "abajo"] as const) {
      const fake: Spawn[] = [{ kind: "promotor", tick: 0, side, x: side === "izq" ? 5 : side === "der" ? 85 : 45, y: side === "arriba" ? 2 : side === "abajo" ? 158 : 60, arrive: 0, phrase: 0 }];
      const s = initialState();
      while (!s.end && s.tick < 600) step(s, fake, []);
      expect(s.end?.reason).toBe("frenado");
      expect(s.grabbedBy).toBe(0);
      const grabber = s.pastosos.find((p) => p.phase === "agarra")!;
      expect(grabber).toBeTruthy();
      // el tick de fin es el siguiente al contacto, y después nada cambia
      const endTick = s.end!.tick;
      expect(endTick).toBe(s.tick);
      step(s, fake, []);
      expect(s.tick).toBe(endTick);
    }
    // sin tocar a nadie, el primero que llega termina la partida
    const r = simulate(SEED, []);
    expect(r.endReason).toBe("frenado");
    expect(r.endTick).toBeLessThan(600);
  });

  it("los de atrás son más rápidos que la caminata y los de adelante suman el avance", () => {
    for (const kind of ["promotor", "firmas", "volantes", "celular", "donpasta"] as const) {
      expect(travelOf(kind, "abajo", 45, 158)).toBeLessThan(2000);
      expect(travelOf(kind, "arriba", 45, 2)).toBeLessThan(travelOf(kind, "abajo", 45, 158));
      expect(relativeSpeed(kind, "abajo")).toBeGreaterThan(0);
    }
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
      { kind: "firmas", tick: 0, side: "izq", x: 5, y: 60, arrive: 100, phrase: 0 },
      { kind: "promotor", tick: 0, side: "izq", x: 5, y: 62, arrive: 90, phrase: 1 },
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
