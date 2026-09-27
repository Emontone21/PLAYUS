import { describe, expect, it } from "vitest";
import { generateMap, pibaTarget } from "./map";
import { DURATION_MS, END_SLACK_MS, legitTrace, PENALTY_MS, simulate, validate, type TapEvent } from "./rules";

const SEED = "intento-1";

describe("validate de la piba del IPA", () => {
  it("acepta una traza real simulada, con errores y penalizaciones en el medio", () => {
    const events = legitTrace(SEED, 6, { misses: 1 });
    expect(simulate(SEED, events)).toEqual({ ok: true, score: 6 });
    expect(validate({ score: 6, events }, SEED)).toBe(true);
  });

  it("rechaza un puntaje inflado", () => {
    const events = legitTrace(SEED, 3);
    expect(validate({ score: 4, events }, SEED)).toBe(false);
    expect(validate({ score: 2, events }, SEED)).toBe(false);
  });

  it("rechaza toques fuera de orden y después del final", () => {
    const events = legitTrace(SEED, 3);
    const swapped = [events[1]!, events[0]!, events[2]!];
    expect(simulate(SEED, swapped).ok).toBe(false);
    expect(simulate(SEED, [{ t: -5, map: 1, x: 0, y: 0 }]).ok).toBe(false);
    expect(simulate(SEED, [{ t: DURATION_MS + END_SLACK_MS + 1, map: 1, x: 0, y: 0 }]).ok).toBe(false);
  });

  it("un acierto en coordenadas equivocadas no suma", () => {
    // dos toques al fondo, fuera del bloqueo: dos errores, cero aciertos
    const wrong: TapEvent[] = [
      { t: 900, map: 1, x: 0, y: 0 },
      { t: 900 + PENALTY_MS + 100, map: 1, x: 0, y: 0 },
    ];
    expect(simulate(SEED, wrong)).toEqual({ ok: true, score: 0 });
    expect(validate({ score: 1, events: wrong }, SEED)).toBe(false);
    // y una traza que dice haber pasado al mapa 2 sin haber acertado en el 1 se rechaza
    const events = legitTrace(SEED, 2);
    expect(simulate(SEED, [{ ...events[0]!, x: 0, y: 0 }, events[1]!]).ok).toBe(false);
  });

  it("los aciertos durante el bloqueo se ignoran", () => {
    const m1 = generateMap(SEED, 1);
    const t1 = pibaTarget(m1);
    const events: TapEvent[] = [
      { t: 900, map: 1, x: 0, y: 0 }, // error → bloqueo hasta 2900
      { t: 1500, map: 1, x: t1.x, y: t1.y }, // ignorado
      { t: 3000, map: 1, x: t1.x, y: t1.y }, // acierto
    ];
    expect(simulate(SEED, events)).toEqual({ ok: true, score: 1 });
    expect(validate({ score: 2, events }, SEED)).toBe(false);
  });

  it("rechaza un acierto a menos de 400 ms de mostrarse el mapa", () => {
    const m1 = generateMap(SEED, 1);
    const t1 = pibaTarget(m1);
    expect(simulate(SEED, [{ t: 300, map: 1, x: t1.x, y: t1.y }])).toEqual({ ok: false, reason: "acierto demasiado rápido" });
    // también en un mapa posterior: acierto legítimo y otro 350 ms después
    const good = legitTrace(SEED, 1);
    const m2 = generateMap(SEED, 2);
    const t2 = pibaTarget(m2);
    const fast: TapEvent[] = [...good, { t: good[0]!.t + 350, map: 2, x: t2.x, y: t2.y }];
    expect(simulate(SEED, fast).ok).toBe(false);
  });

  it("rechaza el toque que no corresponde al mapa en curso", () => {
    const events = legitTrace(SEED, 2);
    const bad: TapEvent[] = [events[0]!, { ...events[1]!, map: 3 }];
    expect(simulate(SEED, bad)).toEqual({ ok: false, reason: "el toque no corresponde al mapa en curso" });
  });

  it("una traza armada con la semilla de la ronda no vale para la del intento", () => {
    const events = legitTrace("semilla-de-la-ronda", 4);
    expect(validate({ score: 4, events }, "semilla-de-la-ronda")).toBe(true);
    expect(validate({ score: 4, events }, SEED)).toBe(false);
  });

  it("rechaza trazas mal armadas", () => {
    expect(simulate(SEED, "nada").ok).toBe(false);
    expect(simulate(SEED, [{ t: 900 }]).ok).toBe(false);
    expect(simulate(SEED, [{ t: 900, map: 0, x: 1, y: 1 }]).ok).toBe(false);
    expect(simulate(SEED, [{ t: 900, map: 1, x: 1.5, y: 1 }]).ok).toBe(false);
  });

  it("la penalización vale 2 segundos exactos", () => {
    const m1 = generateMap(SEED, 1);
    const t1 = pibaTarget(m1);
    const justBefore: TapEvent[] = [{ t: 900, map: 1, x: 0, y: 0 }, { t: 900 + PENALTY_MS - 1, map: 1, x: t1.x, y: t1.y }];
    const justAfter: TapEvent[] = [{ t: 900, map: 1, x: 0, y: 0 }, { t: 900 + PENALTY_MS, map: 1, x: t1.x, y: t1.y }];
    expect(simulate(SEED, justBefore)).toEqual({ ok: true, score: 0 });
    expect(simulate(SEED, justAfter)).toEqual({ ok: true, score: 1 });
  });
});
