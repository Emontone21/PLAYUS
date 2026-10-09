import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advance,
  barMs,
  beatMs,
  bpmFor,
  botTrace,
  CALIBRATION_TAPS,
  candombeRounds,
  check,
  CORRECTION_MAX_MS,
  correctionFrom,
  DURATION_MS,
  expectedAt,
  FAIL_HOLD_MS,
  LIBRARY,
  MAX_SCORE,
  MODEL,
  newRun,
  phaseMs,
  roundAt,
  rowFor,
  STEPS,
  tap,
  validate,
  WINDOW_MS,
  type BeatEvent,
  type Run,
} from "./rules";
import { sayFor, LINES } from "./index";
import { cursorPos, faceFor } from "./draw";
import { totoSprite, totoDrumSprite } from "./sprites";

const SEED = "intento-1";
const seeds = (n: number) => Array.from({ length: n }, (_, i) => `semilla-${i}`);

/** una partida con la cuenta ya hecha (4 toques exactos en los pulsos, o corridos `late` ms), parada al empezar el turno de la ronda 1 */
function atTurn(late = 0): Run {
  const run = newRun(SEED);
  for (let i = 0; i < CALIBRATION_TAPS; i++) tap(run, Math.round(i * beatMs(run.round.bpm)) + late);
  while (run.phase !== "turn") advance(run, run.phaseStart + phaseMs(run, run.phase));
  return run;
}

describe("la biblioteca y las rondas", () => {
  it("la biblioteca tiene de 10 a 12 frases de un compás, inspiradas en el candombe, con golpes en semicorcheas sin repetir", () => {
    expect(LIBRARY.length).toBeGreaterThanOrEqual(10);
    expect(LIBRARY.length).toBeLessThanOrEqual(12);
    for (const p of LIBRARY) {
      expect(p.hits.every((h) => Number.isInteger(h) && h >= 0 && h < STEPS)).toBe(true);
      expect(new Set(p.hits).size).toBe(p.hits.length);
      expect([...p.hits]).toEqual([...p.hits].sort((a, b) => a - b));
    }
    const src = readFileSync(new URL("./rules.ts", import.meta.url), "utf8");
    expect(src).toMatch(/SIMPLIFICACIONES/);
    expect(src).not.toMatch(/Math\.random/);
    expect(LIBRARY.find((p) => p.name === "madera")?.hits).toEqual([0, 3, 6, 8, 11, 13]);
  });

  it("candombeRounds es determinística y, en 1.000 semillas, los compases, los golpes y los tempos siguen la tabla", () => {
    expect(JSON.stringify(candombeRounds(SEED, 10))).toBe(JSON.stringify(candombeRounds(SEED, 10)));
    expect(JSON.stringify(roundAt(SEED, 9))).not.toBe(JSON.stringify(roundAt("otra", 9)));
    for (const seed of seeds(1_000)) {
      for (const r of candombeRounds(seed, 20)) {
        const row = rowFor(r.index);
        const tag = `${seed} ronda ${r.index}`;
        expect(r.bars, tag).toBe(row.bars);
        expect(r.hits.length, tag).toBeGreaterThanOrEqual(row.hits[0]);
        expect(r.hits.length, tag).toBeLessThanOrEqual(row.hits[1]);
        expect(r.bpm, tag).toBe(bpmFor(r.index));
        expect([...r.hits], tag).toEqual([...r.hits].sort((a, b) => a - b));
        expect(r.hits.every((h) => h >= 0 && h < r.bars * STEPS), tag).toBe(true);
        expect(r.phrases.length, tag).toBe(row.bars);
        // las figuras de la fila: las frases vienen de las permitidas
        for (const name of r.phrases) expect(row.figures, tag).toContain(LIBRARY.find((p) => p.name === name)!.figure);
      }
    }
    expect(bpmFor(1)).toBe(95);
    expect(bpmFor(3)).toBe(105);
    expect(bpmFor(6)).toBe(115);
    expect(bpmFor(9)).toBe(125);
    expect(bpmFor(13)).toBe(128);
    expect(bpmFor(14)).toBe(131);
    expect(bpmFor(30)).toBe(140);
  }, 120_000);
});

describe("ventanas", () => {
  it("un golpe a 84 ms del justo es bien, y uno a 86 ms es error", () => {
    const ok = atTurn();
    expect(tap(ok, Math.round(expectedAt(ok, 0) + 84))).toBe("bien");
    expect(ok.marks[0]!.judgement).toBe("casi");
    const early = atTurn();
    expect(tap(early, Math.round(expectedAt(early, 0) - 84))).toBe("bien");
    // a 86 ms ya pasó la ventana: la partida terminó por el golpe que faltó (y ese toque ya no cuenta)
    const late = atTurn();
    expect(tap(late, Math.round(expectedAt(late, 0) + 86))).toBe("ignorado");
    expect(late.phase).toBe("failed");
    expect(late.fail?.reason).toBe("faltó");
    const soon = atTurn();
    expect(tap(soon, Math.round(expectedAt(soon, 0) - 86))).toBe("error");
    expect(soon.fail?.reason).toBe("adelantado");
    expect(WINDOW_MS).toBe(85);
  });

  it("un golpe de más es error, y que pase una ventana sin tocar es error", () => {
    const extra = atTurn();
    expect(tap(extra, Math.round(expectedAt(extra, 0)))).toBe("bien");
    expect(tap(extra, Math.round(expectedAt(extra, 0) + 40))).toBe("error");
    expect(extra.fail?.reason).toMatch(/adelantado|de más/);
    const missed = atTurn();
    advance(missed, Math.round(expectedAt(missed, 0) + WINDOW_MS + 1));
    expect(missed.phase).toBe("failed");
    expect(missed.fail).toMatchObject({ reason: "faltó", round: 1 });
    expect(missed.endT).toBe(missed.fail!.t + FAIL_HOLD_MS);
  });
});

describe("corrección", () => {
  it("4 toques consistentemente atrasados 40 ms dan una corrección de 40, y con eso un patrón tocado igual de atrasado pasa", () => {
    const run = atTurn(40);
    expect(run.correction).toBe(40);
    for (let i = 0; i < run.round.hits.length; i++) expect(tap(run, Math.round(expectedAt(run, i)) + 40)).toBe("bien");
    expect(run.marks.every((m) => m.judgement === "justo")).toBe(true);
    advance(run, run.phaseStart + phaseMs(run, "turn"));
    expect(run.phase).toBe("result");
    expect(run.score).toBe(1);
    // sin corrección, 40 ms de atraso siguen entrando, pero 100 no
    const raw = atTurn(0);
    expect(raw.correction).toBe(0);
    tap(raw, Math.round(expectedAt(raw, 0)) + 100);
    expect(raw.fail?.reason).toBe("faltó");
    // con una corrección de 60, un toque a +140 todavía entra (la ventana se mide con el tiempo corregido)
    const slow = atTurn(60);
    expect(slow.correction).toBe(60);
    expect(tap(slow, Math.round(expectedAt(slow, 0)) + 140)).toBe("bien");
    const fixed = atTurn(100);
    expect(fixed.correction).toBe(CORRECTION_MAX_MS);
  });

  it("la corrección es la mediana y nunca pasa de ±60 ms", () => {
    expect(correctionFrom([40, 40, 40, 40])).toBe(40);
    expect(correctionFrom([10, 40, 50, 300])).toBe(45);
    expect(correctionFrom([-90, -80, -70, -100])).toBe(-60);
    expect(correctionFrom([200, 200, 200, 200])).toBe(60);
    expect(correctionFrom([])).toBe(0);
  });
});

describe("reglas", () => {
  it("la cuenta se repite hasta juntar los 4 toques; después toca El negro toto, la cuenta, tu turno y el resultado, cada tramo lo que dura el patrón", () => {
    const run = newRun(SEED);
    const bar = barMs(run.round.bpm);
    advance(run, bar * 3);
    expect(run.phase).toBe("calibration");
    expect(sayFor(run, 100).text).toBe(LINES.hola);
    for (let i = 0; i < 4; i++) tap(run, Math.round(bar * 3 + i * beatMs(run.round.bpm)));
    expect(run.calibrationTaps.length).toBe(4);
    expect(tap(run, Math.round(bar * 3.9))).toBe("ignorado");
    advance(run, bar * 4);
    expect(run.phase).toBe("listen");
    expect(run.phaseStart).toBeCloseTo(bar * 4, 6);
    expect(phaseMs(run, "listen")).toBeCloseTo(run.round.bars * bar, 6);
    expect(phaseMs(run, "count")).toBeCloseTo(bar, 6);
    expect(phaseMs(run, "turn")).toBeCloseTo(run.round.bars * bar + WINDOW_MS, 6);
    // los toques fuera del turno se ignoran
    expect(tap(run, run.phaseStart + 100)).toBe("ignorado");
    advance(run, run.phaseStart + phaseMs(run, "listen"));
    expect(run.phase).toBe("count");
    expect(sayFor(run, run.phaseStart + beatMs(run.round.bpm) * 2.5).count).toBe(3);
    expect(tap(run, run.phaseStart + 100)).toBe("ignorado");
    advance(run, run.phaseStart + phaseMs(run, "count"));
    expect(run.phase).toBe("turn");
    expect(cursorPos(run, run.phaseStart)).toBe(0);
  });

  it("pasar una ronda suma 1 y viene la siguiente; errar termina la partida con El negro toto enojado", () => {
    const run = atTurn();
    for (let i = 0; i < run.round.hits.length; i++) tap(run, Math.round(expectedAt(run, i)));
    advance(run, run.phaseStart + phaseMs(run, "turn"));
    expect(run.score).toBe(1);
    expect(run.phase).toBe("result");
    expect(faceFor(run)).toBe("eso");
    advance(run, run.phaseStart + phaseMs(run, "result"));
    expect(run.phase).toBe("listen");
    expect(run.index).toBe(1);
    expect(run.round.index).toBe(2);
    // errar
    while (run.phase !== "turn") advance(run, run.phaseStart + phaseMs(run, run.phase));
    expect(tap(run, Math.round(expectedAt(run, 0) - 200))).toBe("error");
    expect(faceFor(run)).toBe("enojado");
    expect(sayFor(run, run.t).text).toBe(LINES.error);
    expect(tap(run, run.t + 50)).toBe("ignorado");
    advance(run, DURATION_MS);
    expect(run.phase).toBe("over");
    expect(run.score).toBe(1);
  });

  it("a los 180 s cierra y la ronda en curso no cuenta; la cota es alcanzable solo con todo justo", () => {
    const perfect = botTrace(SEED, { device: 0, jitter: 0 });
    expect(perfect.run.fail).toBeNull();
    expect(perfect.run.phase).toBe("over");
    expect(perfect.run.score).toBeLessThanOrEqual(MAX_SCORE);
    expect(MAX_SCORE).toBeGreaterThanOrEqual(15);
    expect(MAX_SCORE).toBeLessThanOrEqual(25);
  });
});

describe("validate", () => {
  it("acepta una partida real (por tiempo o por error), con su duración", () => {
    for (const seed of seeds(4)) {
      const a = botTrace(seed, MODEL);
      const v = check(seed, a.events, a.run.endT + 3_000);
      expect(v.ok, `${seed}: ${JSON.stringify(v)}`).toBe(true);
      if (v.ok) {
        expect(v.score).toBe(a.run.score);
        expect(v.run.correction).toBe(a.run.correction);
      }
      expect(validate({ score: a.run.score, events: a.events }, seed, { elapsedMs: a.run.endT + 3_000 })).toBe(true);
      const b = botTrace(seed, { ...MODEL, failAt: 2 });
      expect(b.run.score).toBe(2);
      expect(b.run.fail).not.toBeNull();
      expect(validate({ score: 2, events: b.events }, seed, { elapsedMs: b.run.endT + 2_000 })).toBe(true);
      expect(check(seed, b.events, b.run.endT - 500)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
      expect(check(seed, b.events, b.run.endT + 11_000)).toMatchObject({ ok: false, reason: "el intento duró mucho más que la partida" });
    }
  });

  it("rechaza rondas infladas, una cantidad de toques de ajuste distinta de 4, toques fuera de su tramo, toques después de un error, tiempos fuera de orden y una traza con otra semilla", () => {
    const a = botTrace(SEED, { ...MODEL, failAt: 3 });
    const ev = a.events;
    const bad = (events: unknown) => {
      const v = check(SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    expect(bad(ev)).toBe("ok");
    expect(validate({ score: 4, events: ev }, SEED)).toBe(false);
    const cal = ev.filter((e) => e.phase === "calibration");
    const turn = ev.filter((e) => e.phase === "turn");
    expect(cal.length).toBe(4);
    // con 3 toques de ajuste la cuenta nunca termina: los de turno quedan fuera de su tramo, y sin ellos faltan toques de ajuste
    expect(bad([...cal.slice(0, 3), ...turn])).toBe("toque de turno fuera de su tramo");
    expect(bad(cal.slice(0, 3))).toBe("los toques de ajuste no son 4");
    expect(bad([...cal, { t: cal[3]!.t + 100, phase: "calibration", round: 0 }, ...turn])).toBe("más de 4 toques de ajuste");
    // un toque de turno durante la cuenta (antes del turno de la ronda 1)
    expect(bad([...cal, { t: turn[0]!.t - 900, phase: "turn", round: 1 }, ...turn])).toBe("toque de turno fuera de su tramo");
    // un toque de ajuste en pleno turno
    expect(bad([...cal, turn[0], { t: turn[0]!.t + 30, phase: "calibration", round: 0 }, ...turn.slice(1)])).toBe("toque de ajuste fuera de la cuenta");
    // después del error
    expect(bad([...ev, { t: ev[ev.length - 1]!.t + 300, phase: "turn", round: 4 }])).toBe("toque después de un error");
    // la ronda equivocada
    const firstTurn = ev.findIndex((e) => e.phase === "turn");
    expect(bad([...ev.slice(0, firstTurn), { ...ev[firstTurn], round: 2 }, ...ev.slice(firstTurn + 1)])).toBe("la ronda no es la que corresponde");
    expect(bad([ev[1], ev[0], ...ev.slice(2)])).toBe("tiempos fuera de orden");
    expect(bad([...ev.slice(0, -1), { ...ev[ev.length - 1], t: DURATION_MS + 1_000 }])).toBe("toque después de los 180 s");
    expect(bad("nada")).toBe("la traza no es una lista");
    expect(bad([{ t: 1 }])).toBe("evento mal formado");
    const other = botTrace("otra-semilla", { ...MODEL, failAt: 3 });
    expect(validate({ score: 3, events: other.events }, SEED)).toBe(false);
  });
});

describe("calibración", () => {
  it("el jugador modelo pasa entre 6 y 10 rondas; el fino, más; el torpe, menos", () => {
    const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
    const ss = seeds(40);
    const model = ss.map((s) => botTrace(s, MODEL).run.score);
    const fine = ss.map((s) => botTrace(s, { device: 20, jitter: 25 }).run.score);
    const clumsy = ss.map((s) => botTrace(s, { device: 40, jitter: 75 }).run.score);
    process.stdout.write(`baraka: modelo rondas p10/med/p90 ${q(model, 0.1)}/${q(model, 0.5)}/${q(model, 0.9)}; fino ${q(fine, 0.5)}; torpe ${q(clumsy, 0.5)}\n`);
    expect(q(model, 0.5)).toBeGreaterThanOrEqual(6);
    expect(q(model, 0.5)).toBeLessThanOrEqual(10);
    expect(q(fine, 0.5)).toBeGreaterThan(q(model, 0.5));
    expect(q(clumsy, 0.5)).toBeLessThan(q(model, 0.5));
  }, 60_000);
});

describe("arte", () => {
  it("El negro toto tiene sus tres caras (34 × 46) y su tambor", () => {
    for (const f of ["contento", "eso", "enojado"] as const) expect([totoSprite(f).w, totoSprite(f).h]).toEqual([34, 46]);
    expect(JSON.stringify(totoSprite("eso"))).not.toBe(JSON.stringify(totoSprite("enojado")));
    expect([totoDrumSprite().w, totoDrumSprite().h]).toEqual([16, 22]);
    const ev: BeatEvent = { t: 1, phase: "turn", round: 1 };
    expect(ev.phase).toBe("turn");
  });
});
