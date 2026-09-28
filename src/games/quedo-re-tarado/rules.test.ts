import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/rng";
import {
  createPointerTracker,
  DURATION_MS,
  humanTrace,
  MIN_GAP_MS,
  scoreFor,
  simulate,
  TAPS_TO_FINISH,
  tooRegular,
  validate,
  type TapEvent,
} from "./rules";

const rand = mulberry32(7);

describe("puntaje de quedó re tarado", () => {
  it("con 200 toques, el puntaje es el t del último", () => {
    const events = humanTrace(200, rand);
    expect(scoreFor(events)).toBe(events[199]!.t);
  });

  it("con 150 toques al llegar a los 40 segundos, el puntaje es 45.000", () => {
    expect(scoreFor(humanTrace(150, rand))).toBe(45_000);
    expect(scoreFor([])).toBe(DURATION_MS + TAPS_TO_FINISH * 100);
  });

  it("cualquier partida terminada queda por delante de cualquiera no terminada", () => {
    // la más lenta posible terminada: el toque 200 justo a los 40 s
    const slowest = DURATION_MS;
    const bestUnfinished = scoreFor(humanTrace(199, rand));
    expect(slowest).toBeLessThan(bestUnfinished);
    // un toque 200 después del corte no es legítimo
    const late = humanTrace(199, rand, 55, 160, 400);
    late.push({ t: DURATION_MS + 500 });
    expect(simulate(late)).toEqual({ ok: false, reason: "terminó después del final" });
    // y entre los que no terminaron, queda mejor el que consumió más
    expect(scoreFor(humanTrace(180, rand))).toBeLessThan(scoreFor(humanTrace(120, rand)));
  });
});

describe("validate de quedó re tarado", () => {
  it("acepta una traza humana simulada (intervalos al azar entre 55 y 160 ms)", () => {
    for (let i = 0; i < 20; i++) {
      const events = humanTrace(200, rand);
      const v = simulate(events);
      expect(v.ok, `traza ${i}`).toBe(true);
      expect(validate({ score: scoreFor(events), events })).toBe(true);
    }
    const partial = humanTrace(120, rand);
    expect(validate({ score: 48_000, events: partial })).toBe(true);
  });

  it("rechaza un intervalo de 20 ms", () => {
    const events = humanTrace(50, rand);
    events[10] = { t: events[9]!.t + 20 };
    for (let i = 11; i < events.length; i++) events[i] = { t: events[i - 1]!.t + 80 + (i % 7) * 9 };
    expect(simulate(events)).toEqual({ ok: false, reason: "dos toques demasiado seguidos" });
    expect(MIN_GAP_MS).toBe(35);
  });

  it("rechaza un ritmo fijo de 60 ms y uno de 60 ± 1 ms", () => {
    const fixed: TapEvent[] = Array.from({ length: 200 }, (_, i) => ({ t: 400 + i * 60 }));
    expect(simulate(fixed)).toEqual({ ok: false, reason: "ritmo demasiado parejo" });
    let t = 400;
    const jitter: TapEvent[] = Array.from({ length: 200 }, (_, i) => {
      t += 60 + (i % 3 === 0 ? 1 : i % 3 === 1 ? -1 : 0);
      return { t };
    });
    expect(simulate(jitter)).toEqual({ ok: false, reason: "ritmo demasiado parejo" });
    // el filtro mira ventanas de 30: 29 intervalos parejos seguidos de ritmo humano pasan
    const mixed = [...Array.from({ length: 30 }, (_, i) => ({ t: 400 + i * 60 })), ...humanTrace(40, rand, 55, 160, 400 + 29 * 60 + 90)];
    expect(simulate(mixed).ok).toBe(true);
    expect(tooRegular([60, 60, 60])).toBe(false);
  });

  it("rechaza más de 200 toques, puntaje inflado y toques fuera de orden", () => {
    expect(simulate(humanTrace(201, rand))).toEqual({ ok: false, reason: "más de 200 toques" });
    const events = humanTrace(200, rand);
    expect(validate({ score: events[199]!.t - 1_000, events })).toBe(false);
    const swapped = [...events];
    [swapped[5], swapped[6]] = [swapped[6]!, swapped[5]!];
    expect(simulate(swapped)).toEqual({ ok: false, reason: "tiempos fuera de orden" });
    expect(simulate([{ t: -1 }]).ok).toBe(false);
    expect(simulate([{ t: DURATION_MS + 2_001 }]).ok).toBe(false);
    expect(simulate("x").ok).toBe(false);
    expect(simulate([{}]).ok).toBe(false);
  });
});

describe("un solo dedo", () => {
  it("un segundo pointerdown con el primero apretado no cuenta; al soltar, vuelve a contar", () => {
    const tracker = createPointerTracker();
    expect(tracker.down(1)).toBe(true);
    expect(tracker.down(2)).toBe(false);
    expect(tracker.active).toBe(2);
    tracker.up(2);
    expect(tracker.down(3)).toBe(false); // el 1 sigue apretado
    tracker.up(1);
    tracker.up(3);
    expect(tracker.active).toBe(0);
    expect(tracker.down(4)).toBe(true);
    tracker.cancel(4);
    expect(tracker.down(5)).toBe(true);
  });
});
