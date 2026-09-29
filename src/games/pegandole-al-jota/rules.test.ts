import { describe, expect, it } from "vitest";
import { digitsFor, DISPLAY_MIN_MS, displayMsFor, formatNumber, isTrivial, jotaRounds, ROUNDS, SUBSTANCE_IDS } from "./rounds";
import { ACCEPT_HOLD_MS, check, DURATION_MS, END_SLACK_MS, IMPATIENT_MS, MAX_SCORE, minAnswerMs, playedTrace, TIMING_SLACK_MS, validate } from "./rules";
import { JOTA_FACES, jotaSprite, substanceSprite, JOTA_H, JOTA_W, SUBSTANCE_SIZE } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);

describe("jotaRounds", () => {
  it("es determinística y genera 60 rondas", () => {
    expect(jotaRounds(SEED)).toEqual(jotaRounds(SEED));
    expect(jotaRounds(SEED)).not.toEqual(jotaRounds("intento-2"));
    expect(jotaRounds(SEED)).toHaveLength(ROUNDS);
    expect(jotaRounds(SEED).map((r) => r.round)).toEqual(Array.from({ length: ROUNDS }, (_, i) => i + 1));
  });

  it("en 1.000 semillas: las cifras siguen la tabla, sin ceros a la izquierda ni números triviales, y la pista baja 200 con piso de 700", () => {
    for (const seed of SEEDS) {
      for (const r of jotaRounds(seed)) {
        const expected = r.round <= 3 ? 2 : r.round <= 6 ? 3 : r.round <= 9 ? 4 : r.round <= 12 ? 5 : 6;
        expect(r.digits).toBe(expected);
        expect(String(r.number)).toHaveLength(expected);
        expect(String(r.number)[0]).not.toBe("0");
        expect(isTrivial(r.number, r.digits)).toBe(false);
        expect(r.displayMs).toBe(Math.max(DISPLAY_MIN_MS, 3000 - 200 * (r.round - 1)));
      }
    }
    expect(displayMsFor(1)).toBe(3000);
    expect(displayMsFor(12)).toBe(800);
    expect(displayMsFor(13)).toBe(700);
    expect(displayMsFor(40)).toBe(700);
    expect(digitsFor(13)).toBe(6);
    expect(digitsFor(60)).toBe(6);
  });

  it("los triviales quedan afuera: todas las cifras iguales y los redondos", () => {
    expect(isTrivial(11, 2)).toBe(true);
    expect(isTrivial(55555, 5)).toBe(true);
    expect(isTrivial(1000, 4)).toBe(true);
    expect(isTrivial(20000, 5)).toBe(true);
    expect(isTrivial(10, 2)).toBe(true);
    expect(isTrivial(24, 2)).toBe(false);
    expect(isTrivial(2450, 4)).toBe(false);
    expect(isTrivial(507213, 6)).toBe(false);
    expect(isTrivial(5, 2)).toBe(true);
  });

  it("todas las sustancias aparecen con frecuencia pareja", () => {
    const count = new Map<string, number>();
    let total = 0;
    for (const seed of SEEDS) {
      for (const r of jotaRounds(seed)) {
        count.set(r.substance, (count.get(r.substance) ?? 0) + 1);
        total++;
      }
    }
    for (const id of SUBSTANCE_IDS) {
      const share = (count.get(id) ?? 0) / total;
      expect(share).toBeGreaterThan(0.09);
      expect(share).toBeLessThan(0.11);
    }
  });

  it("los números se muestran con separador de miles", () => {
    expect(formatNumber(24)).toBe("24");
    expect(formatNumber(137)).toBe("137");
    expect(formatNumber(2450)).toBe("2.450");
    expect(formatNumber(38906)).toBe("38.906");
    expect(formatNumber(507213)).toBe("507.213");
  });
});

describe("validate de pegándole al jota", () => {
  const series = jotaRounds(SEED);

  it("acepta una partida que termina en error (número o sustancia) y una que termina por tiempo", () => {
    const byNumber = playedTrace(series, 3, { thenWrong: "numero" });
    expect(check(SEED, byNumber)).toEqual({ ok: true, score: 3, endedByError: true });
    expect(validate({ score: 3, events: byNumber }, SEED)).toBe(true);
    const bySubstance = playedTrace(series, 5, { thenWrong: "sustancia" });
    expect(check(SEED, bySubstance)).toEqual({ ok: true, score: 5, endedByError: true });
    const byTime = playedTrace(series, 8, { thenWrong: null });
    expect(check(SEED, byTime)).toEqual({ ok: true, score: 8, endedByError: false });
    expect(validate({ score: 8, events: byTime }, SEED)).toBe(true);
    expect(validate({ score: 0, events: [] }, SEED)).toBe(true);
    // errar en la primera
    const first = playedTrace(series, 0, { thenWrong: "numero" });
    expect(check(SEED, first)).toEqual({ ok: true, score: 0, endedByError: true });
  });

  it("rechaza puntaje inflado", () => {
    const events = playedTrace(series, 4, { thenWrong: "sustancia" });
    expect(validate({ score: 5, events }, SEED)).toBe(false);
    expect(validate({ score: 3, events }, SEED)).toBe(false);
  });

  it("rechaza eventos después de un error y rondas salteadas o repetidas", () => {
    const events = playedTrace(series, 2, { thenWrong: "numero" });
    const extra = playedTrace(series, 4)[3]!;
    expect(check(SEED, [...events, { ...extra, hiddenAt: events[2]!.answeredAt + ACCEPT_HOLD_MS + series[3]!.displayMs, answeredAt: events[2]!.answeredAt + 5000 }])).toEqual({ ok: false, reason: "eventos después de un error" });
    const ok = playedTrace(series, 4);
    expect(check(SEED, [ok[0]!, ok[2]!])).toEqual({ ok: false, reason: "rondas no consecutivas" });
    expect(check(SEED, [ok[1]!])).toEqual({ ok: false, reason: "rondas no consecutivas" });
    expect(check(SEED, [ok[0]!, { ...ok[1]!, round: 1 }])).toEqual({ ok: false, reason: "rondas no consecutivas" });
  });

  it("rechaza tiempos fuera de orden y después del final", () => {
    const ok = playedTrace(series, 3);
    expect(check(SEED, [ok[0]!, { ...ok[1]!, hiddenAt: ok[0]!.answeredAt - 10 }]).ok).toBe(false);
    expect(check(SEED, [{ ...ok[0]!, answeredAt: ok[0]!.hiddenAt - 1 }]).ok).toBe(false);
    expect(check(SEED, [{ ...ok[0]!, hiddenAt: -5 }]).ok).toBe(false);
    const late = playedTrace(series, 1).map((e) => ({ ...e, hiddenAt: e.hiddenAt, answeredAt: DURATION_MS + END_SLACK_MS + 1 }));
    expect(check(SEED, late)).toEqual({ ok: false, reason: "respuesta después del final" });
  });

  it("rechaza una respuesta imposiblemente rápida (400 + 150 × cifras)", () => {
    for (const digits of [2, 3, 4, 5, 6]) expect(minAnswerMs(digits)).toBe(400 + 150 * digits);
    const fast = playedTrace(series, 2, { answerMs: (d) => minAnswerMs(d) - 1 });
    expect(check(SEED, fast)).toEqual({ ok: false, reason: "respuesta demasiado rápida" });
    const justOk = playedTrace(series, 2, { answerMs: (d) => minAnswerMs(d) });
    expect(check(SEED, justOk).ok).toBe(true);
  });

  it("rechaza una pista mostrada más tiempo del debido (o que se ocultó antes)", () => {
    const ok = playedTrace(series, 3);
    // la segunda pista se ocultó tarde: el jugador la vio de más
    const longer = [ok[0]!, { ...ok[1]!, hiddenAt: ok[1]!.hiddenAt + TIMING_SLACK_MS + 1, answeredAt: ok[1]!.answeredAt + TIMING_SLACK_MS + 1 }];
    expect(check(SEED, longer)).toEqual({ ok: false, reason: "la pista no se ocultó cuando debía" });
    // la primera también se mide desde onReady
    expect(check(SEED, [{ ...ok[0]!, hiddenAt: ok[0]!.hiddenAt + 1000, answeredAt: ok[0]!.answeredAt + 1000 }]).ok).toBe(false);
    // dentro del margen (temporizadores del navegador), pasa
    const jitter = [ok[0]!, { ...ok[1]!, hiddenAt: ok[1]!.hiddenAt + 120, answeredAt: ok[1]!.answeredAt + 120 }];
    expect(check(SEED, jitter).ok).toBe(true);
  });

  it("rechaza trazas mal armadas y de otra semilla", () => {
    expect(check(SEED, "nada").ok).toBe(false);
    expect(check(SEED, [{}]).ok).toBe(false);
    expect(check(SEED, [{ round: 1, hiddenAt: 3000, answeredAt: 4000, number: 24, substance: "merca" }]).ok).toBe(false);
    const other = playedTrace(jotaRounds("otra"), 4, { thenWrong: "numero" });
    expect(validate({ score: 4, events: other }, "otra")).toBe(true);
    expect(validate({ score: 4, events: other }, SEED)).toBe(false);
  });

  it("MAX_SCORE es la cota de rondas en 180 s al ritmo mínimo, y el jota se impacienta a los 15 s", () => {
    const fastest = playedTrace(series, ROUNDS, { answerMs: (d) => minAnswerMs(d) });
    const within = fastest.filter((e) => e.answeredAt <= DURATION_MS + END_SLACK_MS);
    expect(within.length).toBe(MAX_SCORE);
    expect(MAX_SCORE).toBeGreaterThan(40);
    expect(IMPATIENT_MS).toBe(15_000);
  });
});

describe("sprites", () => {
  it("las diez sustancias miden 12 × 12 y son distintas; el jota tiene cuatro caras de 16 × 18, todas distintas", () => {
    const shapes = new Set<string>();
    for (const id of SUBSTANCE_IDS) {
      const s = substanceSprite(id);
      expect([s.w, s.h]).toEqual([SUBSTANCE_SIZE, SUBSTANCE_SIZE]);
      shapes.add(JSON.stringify(s.px));
    }
    expect(shapes.size).toBe(SUBSTANCE_IDS.length);
    const faces = new Set<string>();
    for (const f of JOTA_FACES) {
      const s = jotaSprite(f);
      expect([s.w, s.h]).toEqual([JOTA_W, JOTA_H]);
      faces.add(JSON.stringify(s.px));
    }
    expect(faces.size).toBe(4);
  });
});
