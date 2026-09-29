import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/rng";
import { canarioTimeline, DIFFICULTY, difficultyAt, DURATION_MS, isSafe, MIN_WARNING_MS, NO_FEINT_BEFORE_MS, segmentAt, stateAt, warningAt, type Segment } from "./timeline";
import { check, END_SLACK_MS, MAX_SCORE, outcomeOf, safeTrace, validate } from "./rules";
import { MIN_GAP_MS } from "../lib/taps";
import { canarioSprite, broSprite, CANARIO_STATES, CANARIO_W, CANARIO_H } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const rand = mulberry32(11);

describe("canarioTimeline", () => {
  it("es determinística y cubre los 90 segundos sin huecos ni superposiciones", () => {
    expect(canarioTimeline(SEED)).toEqual(canarioTimeline(SEED));
    expect(canarioTimeline(SEED)).not.toEqual(canarioTimeline("intento-2"));
    for (const seed of SEEDS.slice(0, 200)) {
      const tl = canarioTimeline(seed);
      expect(tl[0]!.start).toBe(0);
      expect(tl[tl.length - 1]!.end).toBe(DURATION_MS);
      for (let i = 1; i < tl.length; i++) expect(tl[i]!.start).toBe(tl[i - 1]!.end);
      for (const s of tl) expect(s.end).toBeGreaterThan(s.start);
    }
  });

  it("en 1.000 semillas: todo girando viene de un aviso, ningún aviso dura menos de 300 ms, sin amagues antes de los 10 s, y amague y aviso duran lo mismo", () => {
    for (const seed of SEEDS) {
      const tl = canarioTimeline(seed);
      for (let i = 0; i < tl.length; i++) {
        const s = tl[i]!;
        if (s.state === "girando") {
          expect(tl[i - 1]!.state).toBe("aviso");
          expect(tl[i + 1]?.state ?? "mirando").toBe("mirando");
        }
        if (s.state === "mirando" && tl[i + 1]) expect(tl[i + 1]!.state).toBe("volviendo");
        if (s.state === "aviso" || s.state === "amague") {
          const d = s.end - s.start;
          // el último puede quedar cortado por los 90 s
          if (s.end < DURATION_MS) {
            expect(d).toBeGreaterThanOrEqual(MIN_WARNING_MS);
            expect(d).toBe(warningAt(s.start));
          }
        }
        if (s.state === "amague") {
          expect(s.start).toBeGreaterThanOrEqual(NO_FEINT_BEFORE_MS);
          expect(tl[i + 1]?.state ?? "espaldas").toBe("espaldas");
        }
        if (s.state === "aviso") expect(tl[i + 1]?.state ?? "girando").toBe("girando");
      }
    }
  });

  it("la frecuencia de amagues sigue la tabla", () => {
    const bands = [
      { from: 10_000, to: 20_000, feints: 0, all: 0, expected: 0 },
      { from: 25_000, to: 35_000, feints: 0, all: 0, expected: 0 },
      { from: 60_000, to: 90_000, feints: 0, all: 0, expected: 0 },
    ];
    for (const seed of SEEDS) {
      for (const s of canarioTimeline(seed)) {
        if (s.state !== "aviso" && s.state !== "amague") continue;
        const b = bands.find((x) => s.start >= x.from && s.start < x.to);
        if (!b) continue;
        b.all++;
        b.expected += difficultyAt(s.start).feint / 1000;
        if (s.state === "amague") b.feints++;
      }
    }
    for (const b of bands) {
      expect(b.all).toBeGreaterThan(1000);
      expect(Math.abs(b.feints / b.all - b.expected / b.all)).toBeLessThan(0.02);
    }
    expect(bands[2]!.feints / bands[2]!.all).toBeGreaterThan(0.25);
  });

  it("la dificultad sube de forma pareja: los tramos de espaldas y el aviso se acortan", () => {
    const d0 = difficultyAt(0);
    const d30 = difficultyAt(30_000);
    const d60 = difficultyAt(60_000);
    expect(d0.warning).toBe(700);
    expect(d30.warning).toBe(400);
    expect(d60.warning).toBe(300);
    expect(difficultyAt(20_000).warning).toBe(500);
    expect(difficultyAt(45_000).warning).toBe(350);
    expect(d0.backMax).toBeGreaterThan(d30.backMax);
    expect(d30.backMax).toBeGreaterThan(d60.backMax);
    expect(d0.turn).toBe(350);
    expect(d60.turn).toBe(150);
    expect(difficultyAt(5_000).feint).toBe(0);
    expect(difficultyAt(10_000).feint).toBe(100);
    expect(difficultyAt(90_000)).toEqual(difficultyAt(60_000));
    expect(difficultyAt(200_000)).toEqual(difficultyAt(60_000));
    expect(DIFFICULTY.every((r) => r.warning >= MIN_WARNING_MS)).toBe(true);
  });

  it("bordes: un toque justo en el start de girando es peligroso; uno 1 ms antes es seguro", () => {
    const tl = canarioTimeline(SEED);
    const g = tl.find((s) => s.state === "girando")!;
    expect(isSafe(stateAt(tl, g.start)!)).toBe(false);
    expect(isSafe(stateAt(tl, g.start - 1)!)).toBe(true);
    expect(stateAt(tl, g.start - 1)).toBe("aviso");
    const v = tl.find((s) => s.state === "volviendo")!;
    expect(isSafe(stateAt(tl, v.end - 1)!)).toBe(false);
    expect(isSafe(stateAt(tl, v.end)!)).toBe(true);
    expect(segmentAt(tl, -1)).toBeNull();
    expect(segmentAt(tl, DURATION_MS)).toBeNull();
    expect(segmentAt(tl, 0)!.state).toBe("espaldas");
  });
});

describe("validate de la parrilla del bro", () => {
  const tl = canarioTimeline(SEED);
  const firstLook = tl.find((s) => s.state === "mirando")!;

  it("acepta una partida que termina por tiempo, con el puntaje de los toques seguros", () => {
    const events = safeTrace(tl, rand);
    expect(events.length).toBeGreaterThan(100);
    const v = check(SEED, events);
    expect(v).toMatchObject({ ok: true, score: events.length, endReason: "tiempo", seenIn: null });
    expect(validate({ score: events.length, events }, SEED)).toBe(true);
    // unos toques de más justo después del corte, dentro del margen, no cuentan pero no invalidan
    const late = [...events, { t: DURATION_MS + 500 }];
    expect(check(SEED, late)).toMatchObject({ ok: true, score: events.length });
    expect(check(SEED, [...events, { t: DURATION_MS + END_SLACK_MS + 1 }]).ok).toBe(false);
  });

  it("acepta una partida que termina al ser visto: el peligroso es el último y conserva los toques", () => {
    const events = safeTrace(tl, rand, { until: firstLook.start, seenAt: firstLook.start + 100 });
    const safe = events.length - 1;
    expect(safe).toBeGreaterThan(5);
    const v = check(SEED, events);
    expect(v).toMatchObject({ ok: true, score: safe, endReason: "visto", seenIn: "mirando" });
    expect(validate({ score: safe, events }, SEED)).toBe(true);
    // también si te ven girando
    const g = tl.find((s) => s.state === "girando")!;
    const seenTurning = safeTrace(tl, rand, { until: g.start, seenAt: g.start });
    expect(check(SEED, seenTurning)).toMatchObject({ ok: true, seenIn: "girando" });
  });

  it("rechaza puntaje inflado y toques después del peligroso", () => {
    const events = safeTrace(tl, rand, { until: firstLook.start, seenAt: firstLook.start + 100 });
    const safe = events.length - 1;
    expect(validate({ score: safe + 1, events }, SEED)).toBe(false);
    expect(validate({ score: safe - 1, events }, SEED)).toBe(false);
    expect(validate({ score: MAX_SCORE, events }, SEED)).toBe(false);
    const after = [...events, { t: events[events.length - 1]!.t + 200 }];
    expect(check(SEED, after)).toEqual({ ok: false, reason: "toques después de que te vieron" });
  });

  it("rechaza toques fuera de orden, un intervalo de 20 ms y un ritmo fijo", () => {
    const events = safeTrace(tl, rand);
    const swapped = [...events];
    [swapped[3], swapped[4]] = [swapped[4]!, swapped[3]!];
    expect(check(SEED, swapped)).toEqual({ ok: false, reason: "tiempos fuera de orden" });
    const close = [...events];
    close[10] = { t: close[9]!.t + 20 };
    expect(check(SEED, close)).toEqual({ ok: false, reason: "dos toques demasiado seguidos" });
    const fixed = Array.from({ length: 40 }, (_, i) => ({ t: 400 + i * 60 }));
    expect(check(SEED, fixed)).toEqual({ ok: false, reason: "ritmo demasiado parejo" });
    expect(check(SEED, "nada").ok).toBe(false);
    expect(check(SEED, [{}]).ok).toBe(false);
    expect(MIN_GAP_MS).toBe(35);
  });

  it("una traza de otra semilla cae en otro cronograma", () => {
    const other = canarioTimeline("otra");
    const events = safeTrace(other, rand, { until: 40_000, seenAt: other.find((s) => s.state === "mirando")!.start + 50 });
    expect(check("otra", events).ok).toBe(true);
    const mine = check(SEED, events);
    // o la rechaza (toques después del "peligroso" según mi cronograma) o le da otro puntaje
    expect(!mine.ok || mine.score !== events.length - 1 || mine.endReason !== "visto").toBe(true);
  });

  it("MAX_SCORE es una cota", () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const t = canarioTimeline(seed);
      const events = safeTrace(t, () => 0, { min: MIN_GAP_MS, max: MIN_GAP_MS });
      expect(outcomeOf(t, events).score).toBeLessThanOrEqual(MAX_SCORE);
    }
    expect(MAX_SCORE).toBe(2571);
  });
});

describe("sprites", () => {
  it("el canario mide lo mismo en todos sus estados y cuadros; aviso y amague son idénticos", () => {
    for (const st of CANARIO_STATES) {
      for (const frame of [0, 1] as const) {
        const s = canarioSprite(st, frame);
        expect([s.w, s.h]).toEqual([CANARIO_W, CANARIO_H]);
      }
    }
    expect(canarioSprite("amague", 0)).toEqual(canarioSprite("aviso", 0));
    expect(canarioSprite("amague", 1)).toEqual(canarioSprite("aviso", 1));
    // los demás estados se distinguen entre sí
    const shapes = new Set(["espaldas", "aviso", "girando", "mirando", "visto"].map((st) => JSON.stringify(canarioSprite(st as (typeof CANARIO_STATES)[number], 0).px)));
    expect(shapes.size).toBe(5);
    expect(broSprite(false).px).not.toEqual(broSprite(true).px);
  });
});

export type { Segment };
