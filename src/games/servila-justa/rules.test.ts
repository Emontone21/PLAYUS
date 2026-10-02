import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { glassDef, glassRows, glassSprite, interiorCells, SHAPES } from "./glasses";
import {
  applyAction,
  botTrace,
  check,
  END_TICK,
  FLOW_MAX_BASE,
  FLOW_RAMP_TICKS,
  FLOW_START,
  flowAt,
  generateGlasses,
  GLASSES,
  IDLE_TICKS,
  initialState,
  levelFor,
  levels,
  lineLevel,
  LINE_MAX,
  LINE_MIN,
  MAX_SCORE,
  PAUSE_TICKS,
  predictTop,
  scoreFor,
  SETTLE_TICKS,
  simulate,
  step,
  SUB,
  TICKS_PER_S,
  validate,
  type PourEvent,
  type SimState,
  type TraceEvent,
} from "./rules";
import { bottleSprite, filledGlassSprite } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 300 }, (_, i) => `semilla-${i}`);
const inputsOf = (events: TraceEvent[]) => events.filter((e): e is PourEvent => !("fin" in e));
const endOf = (events: TraceEvent[]) => events[events.length - 1]!.tick;
const elapsedFor = (events: TraceEvent[]) => 3_000 + Math.floor((endOf(events) * 1000) / TICKS_PER_S) + 1_000;
/** el jugador modelo: suelta 150 ms después de que la espuma predicha llega a la raya, ±4 ticks */
const HUMAN = { delayTicks: 9, jitterTicks: 4 };

/** sirve `ticks` ticks en el vaso en curso y suelta; devuelve el resultado del vaso */
function pour(s: SimState, ticks: number) {
  applyAction(s, "down");
  for (let t = 0; t < ticks; t++) step(s);
  applyAction(s, "up");
  while (s.phase === "settle") step(s);
  return s.results[s.results.length - 1]!;
}

describe("determinismo", () => {
  it("sin Math.random; la misma semilla con la misma traza da lo mismo, y el replay también", () => {
    const src = readFileSync(new URL("./rules.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/Math\.(random|sin|cos)/);
    for (const seed of SEEDS.slice(0, 40)) {
      const a = botTrace(seed, HUMAN);
      const b = botTrace(seed, HUMAN);
      expect(b.events).toEqual(a.events);
      const r = simulate(seed, inputsOf(a.events), a.result.endTick + 1);
      expect(r.score).toBe(a.result.score);
      expect(r.results.map((x) => x.top)).toEqual(a.result.results.map((x) => x.top));
    }
    expect(generateGlasses("a").map((g) => g.shape)).not.toEqual(generateGlasses("b").map((g) => g.shape));
  });
});

describe("los perfiles", () => {
  it("el volumen de cada vaso coincide con su mapa de píxeles", () => {
    for (const shape of SHAPES) {
      const d = glassDef(shape);
      expect(d.cap[d.h]).toBe(interiorCells(shape));
      expect(d.cap[d.h]).toBeGreaterThan(400);
      expect(glassRows(shape).length).toBe(d.h);
      expect(glassSprite(shape).h).toBe(d.h);
      // la raya nunca cae en el pie
      expect(d.firstRow).toBeGreaterThanOrEqual(1);
    }
  });

  it("con el mismo caudal el nivel sube más rápido en la parte angosta", () => {
    const d = glassDef("cintura");
    // abajo es ancho, en el medio angosto: el mismo volumen sube más filas en el medio
    const vWide = d.cap[d.firstRow + 2]! * SUB;
    const risePerCell = (v: number) => levelFor(d, v + 10 * SUB) - levelFor(d, v);
    const mid = d.firstRow + Math.floor((d.h - d.firstRow) / 2);
    const vMid = d.cap[mid]! * SUB;
    expect(risePerCell(vMid)).toBeGreaterThan(risePerCell(vWide));
    // y en el tubo (angosto) sube más que en el ancho
    expect(levelFor(glassDef("tubo"), 100 * SUB)).toBeGreaterThan(levelFor(glassDef("ancho"), 100 * SUB));
    // el nivel es continuo en los bordes de fila
    for (let v = 0; v < d.cap[d.h]! * SUB; v += 777) expect(levelFor(d, v + 1) - levelFor(d, v)).toBeGreaterThanOrEqual(0);
  });

  it("el caudal arranca suave y sube durante el primer segundo; más adelante el máximo es mayor", () => {
    expect(flowAt(0, 0)).toBe(FLOW_START);
    expect(flowAt(FLOW_RAMP_TICKS, 0)).toBe(FLOW_MAX_BASE);
    expect(flowAt(999, 0)).toBe(FLOW_MAX_BASE);
    for (let t = 1; t <= FLOW_RAMP_TICKS; t++) expect(flowAt(t, 0)).toBeGreaterThanOrEqual(flowAt(t - 1, 0));
    expect(flowAt(999, 7)).toBeGreaterThan(flowAt(999, 0));
  });
});

describe("la espuma", () => {
  it("sigue subiendo después de soltar, y después se asienta en un segundo", () => {
    const s = initialState(SEED);
    applyAction(s, "down");
    for (let t = 0; t < 40; t++) step(s);
    const before = levels(s).top;
    applyAction(s, "up");
    let peak = before;
    for (let t = 0; t < 20; t++) {
      step(s);
      peak = Math.max(peak, levels(s).top);
    }
    expect(peak).toBeGreaterThan(before);
    // se asienta: a los 60 ticks del soltar la espuma es menor que el pico pero más que antes de soltar
    while (s.phase === "settle") step(s);
    const r = s.results[0]!;
    expect(r.tick).toBe(s.current!.upTick + SETTLE_TICKS);
    expect(r.top).toBeLessThan(peak);
    expect(r.top).toBeGreaterThan(before);
    expect(SETTLE_TICKS).toBe(60);
  });

  it("sube más si se soltó con más caudal", () => {
    const rise = (ticks: number) => {
      const s = initialState(SEED);
      applyAction(s, "down");
      for (let t = 0; t < ticks; t++) step(s);
      const before = levels(s).top;
      applyAction(s, "up");
      let peak = before;
      for (let t = 0; t < 20; t++) {
        step(s);
        peak = Math.max(peak, levels(s).top);
      }
      return peak - before;
    };
    // a los 10 ticks el caudal todavía está subiendo; a los 70 ya es el máximo
    expect(rise(70)).toBeGreaterThan(rise(10));
  });

  it("los vasos angostos hacen más espuma", () => {
    const riseFor = (seed: string, want: string) => {
      const s = initialState(seed);
      if (s.glasses[0]!.shape !== want) return null;
      applyAction(s, "down");
      for (let t = 0; t < 70; t++) step(s);
      const before = levels(s).top;
      applyAction(s, "up");
      let peak = before;
      for (let t = 0; t < 20; t++) {
        step(s);
        peak = Math.max(peak, levels(s).top);
      }
      return peak - before;
    };
    let tubo: number | null = null;
    let ancho: number | null = null;
    for (const seed of SEEDS) {
      tubo ??= riseFor(seed, "tubo");
      ancho ??= riseFor(seed, "ancho");
      if (tubo !== null && ancho !== null) break;
    }
    expect(tubo).not.toBeNull();
    expect(ancho).not.toBeNull();
    expect(tubo!).toBeGreaterThan(ancho!);
    expect(glassDef("tubo").foamFactor).toBeGreaterThan(glassDef("ancho").foamFactor);
  });
});

describe("el puntaje", () => {
  it("justo en la raya da 100; corto o pasado la misma distancia da lo mismo; 1 fila 95 y 10 filas 50", () => {
    expect(scoreFor(0)).toBe(100);
    expect(scoreFor(SUB)).toBe(95);
    expect(scoreFor(-SUB)).toBe(95);
    expect(scoreFor(10 * SUB)).toBe(50);
    expect(scoreFor(-10 * SUB)).toBe(50);
    expect(scoreFor(3 * SUB)).toBe(scoreFor(-3 * SUB));
    expect(scoreFor(40 * SUB)).toBe(0);
  });

  it("rebalsar da 0 y termina el vaso en el acto; no servir en 6 segundos da 0 y pasa el siguiente", () => {
    const s = initialState(SEED);
    applyAction(s, "down");
    while (!s.current!.result && s.tick < 2000) step(s);
    const r = s.results[0]!;
    expect(r.outcome).toBe("rebalso");
    expect(r.score).toBe(0);
    expect(s.phase).toBe("pause");
    const idle = initialState(SEED);
    for (let t = 0; t < IDLE_TICKS; t++) step(idle);
    expect(idle.results[0]).toMatchObject({ score: 0, outcome: "vacio" });
    for (let t = 0; t < PAUSE_TICKS; t++) step(idle);
    expect(idle.current!.index).toBe(1);
    expect(idle.phase).toBe("pour");
  });

  it("el jugador perfecto suma casi 800; una partida con los 8 vasos termina sola, con la pausa de 600 ms entre vasos", () => {
    const a = botTrace(SEED);
    expect(a.result.finished).toBe(true);
    expect(a.result.score).toBeGreaterThanOrEqual(790);
    expect(a.result.results.length).toBe(GLASSES);
    expect(a.result.results.every((r) => r.outcome === "justa")).toBe(true);
    expect(MAX_SCORE).toBe(800);
    expect(PAUSE_TICKS).toBe(36);
    // la predicción acierta: si se suelta ahora, la espuma termina donde dice
    const s = initialState(SEED);
    applyAction(s, "down");
    for (let t = 0; t < 50; t++) step(s);
    const p = predictTop(s)!;
    applyAction(s, "up");
    while (s.phase === "settle") step(s);
    expect(s.results[0]!.top).toBe(p);
  });
});

describe("la secuencia", () => {
  it("nunca la misma forma dos vasos seguidos; el whisky entre el 15 y el 25 % y las rayas entre el 60 y el 85 %", () => {
    for (const seed of SEEDS) {
      const gs = generateGlasses(seed);
      expect(gs.length).toBe(GLASSES);
      for (let i = 1; i < gs.length; i++) expect(gs[i]!.shape).not.toBe(gs[i - 1]!.shape);
      for (const g of gs) {
        const inner = g.def.h - g.def.firstRow;
        const linePct = ((g.lineRow - g.def.firstRow) * 100) / inner;
        expect(linePct).toBeGreaterThanOrEqual(LINE_MIN - 2);
        expect(linePct).toBeLessThanOrEqual(LINE_MAX + 2);
        const whiskyPct = (g.whiskyRows * 100) / inner;
        expect(whiskyPct).toBeGreaterThanOrEqual(13);
        expect(whiskyPct).toBeLessThanOrEqual(27);
      }
    }
    const all = new Set(SEEDS.flatMap((s) => generateGlasses(s).map((g) => g.shape)));
    expect(all.size).toBe(6);
  });
});

describe("las reglas de servir", () => {
  it("se sirve una sola vez por vaso; los toques en la pausa no cuentan", () => {
    const s = initialState(SEED);
    pour(s, 30);
    expect(s.phase).toBe("pause");
    expect(applyAction(s, "down")).toBe(false);
    for (let t = 0; t < PAUSE_TICKS; t++) step(s);
    expect(s.current!.index).toBe(1);
    expect(applyAction(s, "down")).toBe(true);
    expect(applyAction(s, "down")).toBe(false);
    expect(applyAction(s, "up")).toBe(true);
    expect(applyAction(s, "down")).toBe(false);
    expect(applyAction(s, "up")).toBe(false);
  });
});

describe("la traza y validate", () => {
  it("acepta una partida real (con su duración) y rechaza un total inflado", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const a = botTrace(seed, HUMAN);
      const v = check(seed, a.events, elapsedFor(a.events));
      expect(v.ok, `${seed}: ${JSON.stringify(v)}`).toBe(true);
      if (v.ok) expect(v.score).toBe(a.result.score);
      expect(validate({ score: a.result.score, events: a.events }, seed, { elapsedMs: elapsedFor(a.events) })).toBe(true);
      expect(validate({ score: a.result.score + 1, events: a.events }, seed)).toBe(false);
    }
  });

  it("rechaza dos servidos en un vaso, eventos en la pausa, que no alternen, ticks fuera de orden, otra semilla y un fin incoherente", () => {
    const a = botTrace(SEED, HUMAN);
    const inputs = inputsOf(a.events);
    const end = endOf(a.events);
    const bad = (events: unknown) => {
      const v = check(SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    // un segundo servido en el primer vaso: down y up justo después del primer up (sigue en settle)
    const [d0, u0] = inputs;
    expect(bad([d0, u0, { tick: u0!.tick + 2, action: "down" }, { tick: u0!.tick + 4, action: "up" }, ...inputs.slice(2), { tick: end, fin: true }])).toBe("dos servidos en un vaso");
    // en la pausa: un down justo después de medir el primer vaso
    const pauseTick = u0!.tick + SETTLE_TICKS + 5;
    expect(bad([d0, u0, { tick: pauseTick, action: "down" }, { tick: pauseTick + 3, action: "up" }, ...inputs.slice(2), { tick: end, fin: true }])).toBe("acción en la pausa entre vasos");
    expect(bad([{ tick: 3, action: "up" }, d0, u0, ...inputs.slice(2), { tick: end, fin: true }])).toBe("soltar sin haber apretado");
    // un vaso que rebalsa mientras se aprieta queda sin "up", y eso vale
    const held = botTrace(SEED, { maxGlasses: 0 });
    void held;
    const s2 = initialState(SEED);
    applyAction(s2, "down");
    while (!s2.current!.result) step(s2);
    expect(s2.results[0]!.outcome).toBe("rebalso");
    expect(check(SEED, [{ tick: 0, action: "down" }, { tick: s2.tick + 100, fin: true }])).toMatchObject({ ok: true });
    expect(bad([inputs[2], inputs[3], d0, u0, ...inputs.slice(4), { tick: end, fin: true }])).toBe("ticks fuera de orden");
    expect(bad([{ tick: 5, action: "servir" }, { tick: end, fin: true }])).toBe("acción inválida");
    expect(bad([...inputs, { tick: END_TICK + 1, fin: true }])).toBe("tick de fin fuera de rango");
    expect(bad([...inputs, { tick: end + 30, fin: true }])).toBe("el tick de fin no es el del octavo vaso");
    expect(bad(inputs)).toBe("falta el cierre de la traza");
    expect(validate({ score: a.result.score, events: a.events }, "otra")).toBe(false);
    const endMs = Math.floor((end * 1000) / TICKS_PER_S);
    expect(check(SEED, a.events, endMs - 500)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
    expect(check(SEED, a.events, endMs + 11_000)).toMatchObject({ ok: false, reason: "el intento duró mucho más que la partida" });
    expect(check(SEED, a.events, endMs + 4_000)).toMatchObject({ ok: true });
  });

  it("una partida cortada por tiempo cierra en cualquier tick; los vasos que faltaban valen 0", () => {
    const a = botTrace(SEED, { maxGlasses: 3 });
    const inputs = inputsOf(a.events);
    // el cronómetro corta a los 1.000 ticks: el cuarto vaso ya venció sin servir, el quinto está esperando
    const cut = check(SEED, [...inputs, { tick: 1000, fin: true }]);
    expect(cut).toMatchObject({ ok: true, finished: false });
    if (cut.ok) {
      expect(cut.results.length).toBe(4);
      expect(cut.results[3]).toMatchObject({ score: 0, outcome: "vacio" });
      expect(cut.score).toBe(a.result.score);
    }
    // si se deja correr, los vasos sin servir se vencen solos y la partida termina antes de los 90 s
    const whole = check(SEED, [...inputs, { tick: 3000, fin: true }]);
    expect(whole).toMatchObject({ ok: false, reason: "el tick de fin no es el del octavo vaso" });
  });
});

describe("calibración", () => {
  it("el perfecto 798; el jugador modelo entre 500 y 720; sin aprender el margen se rebalsa seguido", () => {
    const stats = (opts: Parameters<typeof botTrace>[1], n = 100) => {
      const scores: number[] = [];
      const outcomes: Record<string, number> = {};
      for (const seed of SEEDS.slice(0, n)) {
        const r = botTrace(seed, opts).result;
        scores.push(r.score);
        for (const g of r.results) outcomes[g.outcome] = (outcomes[g.outcome] ?? 0) + 1;
      }
      const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
      return { score: [q(scores, 0.25), q(scores, 0.5), q(scores, 0.75)], outcomes };
    };
    const human = stats(HUMAN);
    const slow = stats({ delayTicks: 12, jitterTicks: 5 });
    const careful = stats({ marginRows: 2, delayTicks: 9, jitterTicks: 4 });
    const perfect = botTrace(SEED).result;
    process.stdout.write(
      [
        `jugador modelo (suelta 150 ms después de que la espuma predicha llega a la raya, ±4 ticks): total p25/med/p75 ${human.score.join("/")} ${JSON.stringify(human.outcomes)}`,
        `lento (200 ms, ±5): ${slow.score.join("/")} ${JSON.stringify(slow.outcomes)}`,
        `cauto (2 filas de margen, 150 ms, ±4): ${careful.score.join("/")} ${JSON.stringify(careful.outcomes)}`,
        `perfecto: ${perfect.score}`,
      ].join("\n") + "\n",
    );
    expect(human.score[1]).toBeGreaterThanOrEqual(500);
    expect(human.score[1]).toBeLessThanOrEqual(720);
    expect(careful.score[1]).toBeGreaterThan(human.score[1]!);
    expect(perfect.score).toBeGreaterThanOrEqual(790);
  });
});

describe("el arte", () => {
  it("la botella dice nix cola y el vaso lleno tiene whisky, cola y espuma", () => {
    const b = bottleSprite();
    expect([b.w, b.h]).toEqual([18, 32]);
    const colors = new Set(b.px.map((p) => p.c));
    expect(colors.has("#1E3A8A")).toBe(true);
    const d = glassDef("tubo");
    const f = filledGlassSprite("tubo", 8, 20 * SUB, 24 * SUB, 30);
    const fc = new Set(f.px.map((p) => p.c));
    expect(fc.has("#C8782A")).toBe(true);
    expect(fc.has("#3B1F14")).toBe(true);
    expect(fc.has("#F3E7C8")).toBe(true);
    expect(fc.has("#FFD34E")).toBe(true);
    expect(f.h).toBe(d.h);
    expect(lineLevel(initialState(SEED))).toBeGreaterThan(0);
  });
});
