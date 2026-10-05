import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applySwipe,
  ARROW_GAP_TICKS,
  BLOCK_TICKS,
  botTrace,
  broLine,
  BURNT_TICKS,
  check,
  DIFFICULTY,
  difficultyAt,
  END_TICK,
  idleTimeline,
  initialState,
  LINES,
  MAX_SCORE,
  MIN_SWIPE_GAP_TICKS,
  MIN_WINDOW_TICKS,
  SERVE_TICKS,
  simulate,
  step,
  TICKS_PER_S,
  validate,
  type Dir,
  type SwipeEvent,
  type TraceEvent,
} from "./rules";
import { slotAt, swipeDir } from "./index";
import { arrowSprite, pattySprite } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const swipesOf = (events: TraceEvent[]) => events.filter((e): e is SwipeEvent => !("fin" in e));
/** el jugador modelo (decisión 240) */
const MODEL = { reactionTicks: 36, jitterTicks: 24, errorPerMille: 200, swipeGapTicks: 36 };
const other = (d: Dir): Dir => (d === "up" ? "down" : "up");

/** avanza hasta que el lugar `i` esté a punto */
function untilReady(s: ReturnType<typeof initialState>, i: number) {
  while (s.slots[i]!.phase !== "ready" && s.tick < END_TICK) step(s);
}

describe("determinismo", () => {
  it("sin Math.random; la misma semilla con la misma traza da lo mismo (la igualdad con el navegador la comprueba el E2E)", () => {
    const src = readFileSync(new URL("./rules.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/Math\.random/);
    for (const seed of SEEDS.slice(0, 30)) {
      const a = botTrace(seed, MODEL);
      const b = botTrace(seed, MODEL);
      expect(b.events).toEqual(a.events);
      const r = simulate(seed, swipesOf(a.events), END_TICK);
      expect(r.score).toBe(a.result.score);
      expect(r.burns).toBe(a.result.burns);
    }
    expect(initialState("a").slots.map((s) => s.until)).not.toEqual(initialState("b").slots.map((s) => s.until));
  });
});

describe("el ciclo de una hamburguesa", () => {
  it("cocinándose, a punto, vuelta, cocinándose por el otro lado, a punto, vuelta y servida, con una cruda nueva en su lugar", () => {
    const s = initialState(SEED);
    const slot = s.slots[0]!;
    expect(slot.phase).toBe("cooking");
    expect(slot.side).toBe(0);
    untilReady(s, 0);
    expect(slot.phase).toBe("ready");
    expect(applySwipe(s, 0, slot.dir)).toBe("vuelta");
    expect(s.score).toBe(1);
    expect(slot.phase).toBe("cooking");
    expect(slot.side).toBe(1);
    untilReady(s, 0);
    expect(applySwipe(s, 0, slot.dir)).toBe("vuelta");
    expect(s.score).toBe(2);
    expect(slot.phase).toBe("serving");
    for (let t = 0; t < SERVE_TICKS; t++) step(s);
    expect(slot.phase).toBe("cooking");
    expect(slot.side).toBe(0);
    expect(slot.cycle).toBe(2);
  });

  it("si se termina la ventana, se quema, no suma, queda 600 ms carbonizada y aparece una nueva", () => {
    const s = initialState(SEED);
    const slot = s.slots[0]!;
    untilReady(s, 0);
    const readyAt = s.tick;
    for (let t = 0; t < slot.window; t++) step(s);
    expect(slot.phase).toBe("burnt");
    expect(s.tick - readyAt).toBe(slot.window);
    expect(s.score).toBe(0);
    expect(s.burns).toBe(1);
    expect(applySwipe(s, 0, slot.dir)).toBe("nada");
    for (let t = 0; t < BURNT_TICKS; t++) step(s);
    expect(slot.phase).toBe("cooking");
    expect(slot.side).toBe(0);
    expect(BURNT_TICKS).toBe(36);
  });
});

describe("reglas", () => {
  it("la dirección correcta suma 1; la equivocada no suma ni quema y bloquea ese lugar 350 ms (los otros no); sobre una sin flecha no pasa nada", () => {
    const s = initialState(SEED);
    untilReady(s, 0);
    const slot = s.slots[0]!;
    const t0 = s.tick;
    expect(applySwipe(s, 0, other(slot.dir))).toBe("equivocada");
    expect(s.score).toBe(0);
    expect(slot.phase).toBe("ready");
    expect(slot.blockedUntil).toBe(t0 + BLOCK_TICKS);
    expect(BLOCK_TICKS).toBe(21);
    // bloqueada: ni la correcta entra
    expect(applySwipe(s, 0, slot.dir)).toBe("bloqueada");
    for (let t = 0; t < BLOCK_TICKS - 1; t++) step(s);
    expect(applySwipe(s, 0, slot.dir)).toBe("bloqueada");
    step(s);
    expect(applySwipe(s, 0, slot.dir)).toBe("vuelta");
    expect(s.score).toBe(1);
    // otro lugar sin flecha: nada
    const idle = s.slots.findIndex((x) => x.phase === "cooking");
    expect(applySwipe(s, idle, "up")).toBe("nada");
    expect(s.score).toBe(1);
    // el bloqueo es por lugar: otro a punto se atiende enseguida
    const s2 = initialState(SEED);
    untilReady(s2, 0);
    const first = s2.tick;
    while (s2.slots.filter((x) => x.phase === "ready").length < 2 && s2.tick < first + 400 && s2.slots[0]!.phase === "ready") step(s2);
    if (s2.slots.filter((x) => x.phase === "ready").length >= 2) {
      const [a, b] = s2.slots.map((x, i) => (x.phase === "ready" ? i : -1)).filter((i) => i >= 0) as [number, number];
      expect(applySwipe(s2, a, other(s2.slots[a]!.dir))).toBe("equivocada");
      expect(applySwipe(s2, b, s2.slots[b]!.dir)).toBe("vuelta");
    }
  });

  it("el control: el punto de apoyo elige el cuadrante y el eje dominante la dirección, con umbral de 30 px", () => {
    expect(slotAt(10, 100)).toBe(0);
    expect(slotAt(100, 100)).toBe(1);
    expect(slotAt(10, 140)).toBe(2);
    expect(slotAt(100, 140)).toBe(3);
    expect(slotAt(30, 10)).toBe(0);
    expect(swipeDir(10, 10)).toBeNull();
    expect(swipeDir(29, 0)).toBeNull();
    expect(swipeDir(30, 5)).toBe("right");
    expect(swipeDir(-40, 20)).toBe("left");
    expect(swipeDir(5, -35)).toBe("up");
    expect(swipeDir(-10, 50)).toBe("down");
  });
});

describe("dificultad y justicia", () => {
  it("en 1.000 semillas la cocción y la ventana siguen la tabla, dos flechas nunca aparecen a menos de 350 ms y la ventana nunca baja de 1 s", () => {
    let minGap = Infinity;
    let minWindow = Infinity;
    for (const seed of SEEDS) {
      const arrows: { tick: number; window: number; cook: number }[] = [];
      const s = initialState(seed);
      const seen = new Set<string>();
      while (s.tick < END_TICK) {
        step(s);
        s.slots.forEach((slot, i) => {
          if (slot.phase === "ready" && !seen.has(`${i}:${slot.since}`)) {
            seen.add(`${i}:${slot.since}`);
            arrows.push({ tick: slot.since, window: slot.window, cook: slot.since - (slot.cycle === 1 && slot.side === 0 ? 0 : slot.since) });
          }
        });
      }
      const ticks = arrows.map((a) => a.tick).sort((a, b) => a - b);
      for (let i = 1; i < ticks.length; i++) minGap = Math.min(minGap, ticks[i]! - ticks[i - 1]!);
      for (const a of arrows) {
        minWindow = Math.min(minWindow, a.window);
        const d = difficultyAt(a.tick);
        expect(a.window).toBe(d.window);
      }
    }
    expect(minGap).toBeGreaterThanOrEqual(ARROW_GAP_TICKS);
    expect(minWindow).toBeGreaterThanOrEqual(MIN_WINDOW_TICKS);
    expect(difficultyAt(0)).toEqual({ cookMin: 150, cookMax: 240, window: 90 });
    expect(difficultyAt(1200)).toEqual({ cookMin: 108, cookMax: 180, window: 78 });
    expect(difficultyAt(2400)).toEqual({ cookMin: 72, cookMax: 132, window: 69 });
    expect(difficultyAt(3600)).toEqual({ cookMin: 54, cookMax: 96, window: 60 });
    expect(difficultyAt(600).window).toBe(84);
    expect(DIFFICULTY[0]!.window).toBe(90);
    // la cocción sin tocar nada sale de la tabla: cada tramo de cocinándose dura entre el mínimo y el máximo (más el desfase inicial o la separación de flechas)
    for (const seed of SEEDS.slice(0, 200)) {
      for (const seg of idleTimeline(seed).filter((x) => x.phase === "cooking" && x.start > 0 && x.end < END_TICK)) {
        const d = difficultyAt(seg.start);
        expect(seg.end - seg.start).toBeGreaterThanOrEqual(d.cookMin);
        expect(seg.end - seg.start).toBeLessThanOrEqual(d.cookMax + 3 * ARROW_GAP_TICKS);
      }
    }
  });

  it("con el tiempo es cada vez más común que dos o más pidan vuelta a la vez", () => {
    const together = [0, 0, 0];
    for (const seed of SEEDS.slice(0, 100)) {
      const swipes = swipesOf(botTrace(seed, MODEL).events);
      const s = initialState(seed);
      let k = 0;
      while (s.tick < END_TICK) {
        while (k < swipes.length && swipes[k]!.tick === s.tick) applySwipe(s, swipes[k]!.slot, swipes[k++]!.dir);
        if (s.slots.filter((x) => x.phase === "ready").length >= 2) together[Math.min(2, Math.floor(s.tick / 1200))]!++;
        step(s);
      }
    }
    expect(together[1]).toBeGreaterThan(together[0]!);
    expect(together[2]).toBeGreaterThan(together[1]!);
  });

  it("al principio arrancan desfasadas, y el perfecto nunca pasa la cota", () => {
    const s = initialState(SEED);
    const firsts = s.slots.map((x) => x.until);
    for (let i = 1; i < firsts.length; i++) expect(firsts[i]! - firsts[i - 1]!).toBeGreaterThanOrEqual(ARROW_GAP_TICKS);
    let max = 0;
    for (const seed of SEEDS.slice(0, 100)) max = Math.max(max, botTrace(seed).result.score);
    expect(max).toBeLessThanOrEqual(MAX_SCORE);
    expect(max).toBeGreaterThan(80);
  });

  it("calibración (la tabla original, decisión 240): el jugador modelo da vuelta entre 40 y 60 (con el lento abajo y el rápido arriba) y se le quema alguna en los primeros 20 s", () => {
    const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
    const seeds = SEEDS.slice(0, 60);
    const model = seeds.map((s) => botTrace(s, MODEL).result);
    const fast = seeds.map((s) => botTrace(s, { reactionTicks: 21, jitterTicks: 12, errorPerMille: 80, swipeGapTicks: 21 }).result.score);
    const slow = seeds.map((s) => botTrace(s, { reactionTicks: 48, jitterTicks: 30, errorPerMille: 250, swipeGapTicks: 48 }).result.score);
    const early = seeds.filter((seed) => {
      const ev = swipesOf(botTrace(seed, MODEL).events);
      return simulate(seed, ev.filter((e) => e.tick < 1200), 1200).burns > 0;
    }).length;
    const med = q(model.map((r) => r.score), 0.5);
    process.stdout.write(`hdp: modelo p25/med/p75 ${q(model.map((r) => r.score), 0.25)}/${med}/${q(model.map((r) => r.score), 0.75)}, quemadas med ${q(model.map((r) => r.burns), 0.5)}, quema antes de 20 s en ${early}/${seeds.length}; rápido ${q(fast, 0.5)}; lento ${q(slow, 0.5)}\n`);
    expect(med).toBeGreaterThanOrEqual(40);
    expect(med).toBeLessThanOrEqual(60);
    expect(q(model.map((r) => r.score), 0.25)).toBeGreaterThanOrEqual(40);
    expect(q(model.map((r) => r.score), 0.75)).toBeLessThanOrEqual(60);
    expect(q(slow, 0.5)).toBeLessThan(med);
    expect(q(fast, 0.5)).toBeGreaterThan(med);
    expect(early / seeds.length).toBeGreaterThan(0.8);
  });
});

describe("Big Bro", () => {
  it("las frases cambian según el estado, de forma determinística", () => {
    const s = initialState(SEED);
    expect(broLine(s, SEED).mood).toBe("espera");
    expect(LINES.normal).toContain(broLine(s, SEED).text);
    expect(broLine(s, SEED)).toEqual(broLine(initialState(SEED), SEED));
    // la frase normal sale de la semilla y cambia cada 4 s
    const texts = new Set(SEEDS.slice(0, 30).map((seed) => broLine(initialState(seed), seed).text));
    expect(texts.size).toBe(LINES.normal.length);
    const calm = initialState(SEED);
    const byTime = new Set<string>();
    for (let n = 0; n < 15; n++) {
      calm.tick = n * 240;
      byTime.add(broLine(calm, SEED).text);
    }
    expect(byTime.size).toBeGreaterThan(1);
    // últimos 500 ms de una ventana: grita, rojo
    untilReady(s, 0);
    while (s.slots[0]!.until - s.tick > 30) step(s);
    expect(broLine(s, SEED)).toEqual({ text: LINES.lastMoment, mood: "grita" });
    // se quemó: ¿me estás jodiendo?
    while (s.slots[0]!.phase === "ready") step(s);
    expect(broLine(s, SEED)).toEqual({ text: LINES.burnt, mood: "enojado" });
    // 5 seguidas bien: pulgar arriba
    const p = initialState(SEED);
    const perfect = swipesOf(botTrace(SEED).events);
    let k = 0;
    while (p.streak < 5) {
      while (k < perfect.length && perfect[k]!.tick === p.tick) applySwipe(p, perfect[k]!.slot, perfect[k++]!.dir);
      step(p);
    }
    expect(broLine(p, SEED)).toEqual({ text: LINES.streak, mood: "contento" });
  });
});

describe("validate", () => {
  it("acepta una partida real con su duración", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const a = botTrace(seed, MODEL);
      const v = check(seed, a.events, 63_000);
      expect(v.ok, `${seed}: ${JSON.stringify(v)}`).toBe(true);
      if (v.ok) expect(v.score).toBe(a.result.score);
      expect(validate({ score: a.result.score, events: a.events }, seed, { elapsedMs: 63_000 })).toBe(true);
    }
  });

  it("rechaza vueltas infladas, ticks fuera de orden, slot o dir inválidos, deslizamientos imposiblemente seguidos, otra semilla y un fin incoherente", () => {
    const a = botTrace(SEED, MODEL);
    const t = swipesOf(a.events);
    const bad = (events: unknown) => {
      const v = check(SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    expect(validate({ score: a.result.score + 1, events: a.events }, SEED)).toBe(false);
    expect(validate({ score: a.result.score, events: a.events }, "otra")).toBe(false);
    expect(bad([t[1], t[0], ...t.slice(2), { tick: END_TICK, fin: true }])).toBe("ticks fuera de orden");
    expect(bad([{ ...t[0], slot: 4 }, ...t.slice(1), { tick: END_TICK, fin: true }])).toBe("lugar inválido");
    expect(bad([{ ...t[0], dir: "diagonal" }, ...t.slice(1), { tick: END_TICK, fin: true }])).toBe("dirección inválida");
    expect(bad([t[0], { ...t[1], tick: t[0]!.tick + MIN_SWIPE_GAP_TICKS - 1 }, ...t.slice(2).filter((e) => e.tick > t[0]!.tick + 10), { tick: END_TICK, fin: true }])).toBe("deslizamientos imposiblemente seguidos");
    expect(bad([...t, { tick: END_TICK + 1, fin: true }])).toBe("tick de fin fuera de rango");
    expect(bad([...t, { tick: t[t.length - 1]!.tick, fin: true }])).toBe("deslizamiento después del final");
    expect(bad(t)).toBe("falta el cierre de la traza");
    expect(bad([])).toBe("traza mal armada");
    const endMs = Math.floor((END_TICK * 1000) / TICKS_PER_S);
    expect(check(SEED, a.events, endMs - 500)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
    expect(check(SEED, a.events, endMs + 11_000)).toMatchObject({ ok: false, reason: "el intento duró mucho más que la partida" });
    expect(check(SEED, a.events, endMs + 3_000)).toMatchObject({ ok: true });
    // cortada antes por el cronómetro: vale lo que llevaba
    const cut = check(SEED, [...t.filter((e) => e.tick < 1800), { tick: 1800, fin: true }]);
    expect(cut.ok).toBe(true);
  });
});

describe("el arte", () => {
  it("las hamburguesas miden 16 × 9 en los cinco estados y las flechas 9 × 9 en las cuatro direcciones", () => {
    for (const look of ["cruda", "dorando1", "dorando2", "dorando3", "quemada"] as const) expect([pattySprite(look).w, pattySprite(look).h]).toEqual([16, 9]);
    const up = arrowSprite("up");
    const down = arrowSprite("down");
    const left = arrowSprite("left");
    expect([up.w, up.h]).toEqual([9, 9]);
    expect(up.px.length).toBe(down.px.length);
    expect(up.px.length).toBe(left.px.length);
    // la punta de la de arriba está arriba; la de la izquierda, a la izquierda
    expect(Math.min(...up.px.map((p) => p.y))).toBe(0);
    expect(up.px.filter((p) => p.y === 0).length).toBe(1);
    expect(left.px.filter((p) => p.x === 0).length).toBe(1);
  });
});
