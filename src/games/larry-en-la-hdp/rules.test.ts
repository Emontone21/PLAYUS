import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  advance,
  botTrace,
  broLine,
  burgerPoints,
  check,
  currentOrder,
  DURATION_MS,
  EAT_MS,
  END_MARGIN_MS,
  FILLINGS,
  INGREDIENTS,
  larryFace,
  larryLine,
  larryOrders,
  LINES,
  LIVES,
  MAX_SCORE,
  middleCount,
  MODEL,
  newRun,
  ORDER_COUNT,
  PATIENCE_MS,
  phaseEnd,
  tap,
  TRASH_MS,
  trayOpen,
  validate,
  viewMsFor,
  type Ingredient,
  type Run,
  type TapEvent,
} from "./rules";
import { iconSprite, sliceSprite } from "./sprites";
import { bigBroSprite } from "../lib/big-bro";
import { larrySprite as libLarry } from "../lib/larry";
import { pattySprite as libPatty } from "../lib/hdp-kitchen";
import { larrySprite as deseosLarry } from "../los-deseos-de-larry/sprites";
import { broSprite as claseBro } from "../clase-con-el-bro/sprites";
import { broSprite as hdpBro, pattySprite as hdpPatty } from "../hdp/sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);

/** avanza hasta que se tapa la comanda del pedido que viene (o el actual) */
function untilBuild(run: Run): number {
  while (run.phase !== "build") advance(run, phaseEnd(run));
  return run.phaseAt;
}
/** arma bien el pedido actual: el primer toque apenas se tapa, después cada `gap` ms */
function buildRight(run: Run, gap = 200): number {
  let t = untilBuild(run);
  for (const ing of currentOrder(run).layers) {
    tap(run, t, ing);
    t += gap;
  }
  return t - gap;
}
/** un ingrediente que no es el que toca */
function wrongFor(run: Run): Ingredient {
  const right = currentOrder(run).layers[run.built.length]!;
  return right === "pan" ? "carne" : "pan";
}
/** espera a que la bandeja se abra y erra en el primer toque */
function failNext(run: Run): number {
  const t = untilBuild(run);
  tap(run, t, wrongFor(run));
  return t;
}

describe("los pedidos", () => {
  it("larryOrders es determinística y depende de la semilla", () => {
    expect(larryOrders(SEED)).toEqual(larryOrders(SEED));
    expect(larryOrders(SEED)).not.toEqual(larryOrders("otra"));
    expect(larryOrders(SEED)).toHaveLength(ORDER_COUNT);
    expect(readFileSync(new URL("./rules.ts", import.meta.url), "utf8")).not.toMatch(/Math\.random/);
  });

  it("en 1.000 semillas: pan abajo y arriba, nunca tres iguales seguidos, capas y tiempos de la tabla, y los 8 del medio parejos", () => {
    const counts = new Map<Ingredient, number>();
    let total = 0;
    for (const seed of SEEDS) {
      larryOrders(seed).forEach((o, i) => {
        const n = i + 1;
        expect(o.layers[0]).toBe("pan");
        expect(o.layers[o.layers.length - 1]).toBe("pan");
        const middle = o.layers.slice(1, -1);
        expect(middle).toHaveLength(middleCount(n));
        expect(middle).not.toContain("pan");
        for (let j = 2; j < o.layers.length; j++) expect(o.layers[j] === o.layers[j - 1] && o.layers[j] === o.layers[j - 2]).toBe(false);
        expect(o.viewMs).toBe(viewMsFor(n));
        for (const m of middle) {
          counts.set(m, (counts.get(m) ?? 0) + 1);
          total++;
        }
      });
    }
    // la tabla
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 40].map(middleCount)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 5, 6, 6, 7, 7]);
    expect([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 17, 18, 40].map(viewMsFor)).toEqual([3000, 3000, 2800, 2800, 2600, 2600, 2400, 2400, 2300, 2200, 1600, 1500, 1500]);
    // parejos: cada uno entre el 11 % y el 14 % (1/8 = 12,5 %)
    expect(counts.size).toBe(FILLINGS.length);
    for (const f of FILLINGS) {
      const share = counts.get(f)! / total;
      expect(share, f).toBeGreaterThan(0.11);
      expect(share, f).toBeLessThan(0.14);
    }
  });
});

describe("puntaje", () => {
  it("5 capas en 3 s dan 150; más lento que capas × 1.200 ms da 100; un error no suma", () => {
    expect(burgerPoints(5, 3000)).toBe(150);
    expect(burgerPoints(5, 6000)).toBe(100);
    expect(burgerPoints(5, 9000)).toBe(100);
    expect(burgerPoints(4, 0)).toBe(200);
    const run = newRun(larryOrders(SEED));
    failNext(run);
    expect(run.score).toBe(0);
    // la siguiente, bien: suma 100 más el bonus
    advance(run, phaseEnd(run));
    const before = run.score;
    const layers = currentOrder(run).layers.length;
    const end = buildRight(run, 300);
    expect(run.score - before).toBe(burgerPoints(layers, end - (end - (layers - 1) * 300)));
  });
});

describe("reglas", () => {
  it("bien: Larry se la come y el pedido siguiente llega a los 600 ms; la bandeja no responde con la comanda a la vista", () => {
    const run = newRun(larryOrders(SEED));
    expect(trayOpen(run, 0)).toBe(false);
    expect(tap(run, 100, "pan")).toBe("bloqueada");
    expect(tap(run, currentOrder(run).viewMs - 1, "pan")).toBe("bloqueada");
    const end = buildRight(run);
    expect(run.phase).toBe("eat");
    expect(larryFace(run)).toBe("feliz");
    expect(run.served).toBe(1);
    expect(tap(run, end + EAT_MS - 1, "pan")).toBe("bloqueada");
    advance(run, end + EAT_MS);
    expect(run.phase).toBe("view");
    expect(run.index).toBe(1);
    expect(run.phaseAt).toBe(end + EAT_MS);
  });

  it("un ingrediente equivocado resta una vida y tira la hamburguesa en el acto; tres errores terminan la partida", () => {
    const run = newRun(larryOrders(SEED));
    let t = phaseEnd(run);
    advance(run, t);
    tap(run, t, "pan");
    tap(run, t + 200, wrongFor(run));
    expect(run.lives).toBe(LIVES - 1);
    expect(run.phase).toBe("trash");
    expect(run.built).toEqual([]);
    expect(run.dropped).toHaveLength(2);
    expect(larryFace(run)).toBe("asco");
    expect(tap(run, t + 200 + TRASH_MS - 1, "pan")).toBe("bloqueada");
    advance(run, t + 200 + TRASH_MS);
    expect(run.index).toBe(1);
    t = failNext(run);
    expect(run.lives).toBe(1);
    t = failNext(run);
    expect(run.lives).toBe(0);
    expect(run.phase).toBe("over");
    expect(larryFace(run)).toBe("bajon");
    expect(tap(run, t + 5000, "pan")).toBe("terminada");
  });

  it("el pedido siguiente cuenta en la tabla tanto si el anterior salió bien como si se tiró", () => {
    const run = newRun(larryOrders(SEED));
    failNext(run);
    advance(run, phaseEnd(run));
    expect(run.index).toBe(1);
    buildRight(run);
    advance(run, phaseEnd(run));
    expect(run.index).toBe(2);
    expect(currentOrder(run).layers).toHaveLength(2 + middleCount(3));
  });

  it("a los 10 s armando la misma, Larry pregunta por su hamburguesa, y no la corta", () => {
    const run = newRun(larryOrders(SEED));
    const t0 = phaseEnd(run);
    advance(run, t0);
    tap(run, t0, "pan");
    expect(larryLine(run, t0 + PATIENCE_MS - 1)).toBeNull();
    expect(larryLine(run, t0 + PATIENCE_MS)).toBe(LINES.patience);
    let t = t0 + PATIENCE_MS + 2000;
    for (const ing of currentOrder(run).layers.slice(1)) {
      expect(tap(run, t, ing)).not.toBe("error");
      t += 200;
    }
    expect(run.served).toBe(1);
    expect(run.score).toBe(100);
  });
});

describe("Big Bro", () => {
  it("al empezar, 3 bien seguidas, al errar y desde los 60 s", () => {
    const run = newRun(larryOrders(SEED));
    expect(broLine(run, 0)).toBe(LINES.start);
    let end = 0;
    for (let i = 0; i < 3; i++) end = buildRight(run);
    expect(run.streak).toBe(3);
    expect(broLine(run, end + 100)).toBe(LINES.streak);
    expect(broLine(run, end + 2500)).toBeNull();
    const t = failNext(run);
    expect(broLine(run, t + 10)).toBe(LINES.error);
    expect(broLine(run, t + 1600)).toBeNull();
    expect(broLine(run, 60_000)).toBe(LINES.queue);
  });
});

describe("validate", () => {
  it("acepta una partida real", () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const b = botTrace(seed, MODEL);
      const v = check(seed, b.events, 95_000);
      expect(v.ok, JSON.stringify(v)).toBe(true);
      if (v.ok) expect(v.score).toBe(b.run.score);
      expect(validate({ score: b.run.score, events: b.events }, seed, { elapsedMs: 95_000 })).toBe(true);
    }
  });

  it("rechaza puntaje inflado, toques con la comanda a la vista o en la pausa, después de la tercera vida, a 50 ms, un ingrediente inexistente y otra semilla", () => {
    const b = botTrace(SEED, MODEL);
    const ev = b.events;
    const bad = (events: unknown) => {
      const v = check(SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    expect(validate({ score: b.run.score + 1, events: ev }, SEED)).toBe(false);
    expect(validate({ score: b.run.score, events: ev }, "otra")).toBe(false);
    // con la comanda a la vista
    expect(bad([{ t: 500, ingredient: "pan" }, ...ev])).toBe("toque con la comanda a la vista o en la pausa");
    // en la pausa después de servir la primera
    const run = newRun(larryOrders(SEED));
    const taps: TapEvent[] = [];
    let t = phaseEnd(run);
    advance(run, t);
    for (const ing of currentOrder(run).layers) {
      tap(run, t, ing);
      taps.push({ t, ingredient: ing });
      t += 200;
    }
    expect(bad([...taps, { t: t + 100, ingredient: "pan" }])).toBe("toque con la comanda a la vista o en la pausa");
    // después de la tercera vida
    const dead = botTrace(SEED, { failOrders: [0, 1, 2] });
    expect(dead.run.phase).toBe("over");
    const last = dead.events[dead.events.length - 1]!;
    expect(bad([...dead.events, { t: last.t + 300, ingredient: "pan" }])).toBe("toque después de la tercera vida");
    expect(check(SEED, dead.events)).toMatchObject({ ok: true, score: 0, errors: 3 });
    // a 50 ms
    expect(bad([ev[0], { ...ev[1]!, t: ev[0]!.t + 50 }])).toBe("dos toques demasiado seguidos");
    // un ingrediente inexistente
    expect(bad([{ ...ev[0]!, ingredient: "palta" }])).toBe("ingrediente inexistente");
    // fuera de orden y después del final
    expect(bad([ev[1], ev[0]])).toBe("tiempos fuera de orden");
    expect(bad([{ t: DURATION_MS + END_MARGIN_MS + 1, ingredient: "pan" }])).toBe("toque después del final");
    expect(bad("nada")).toBe("traza mal armada");
    expect(check(SEED, ev, ev[ev.length - 1]!.t - 1)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
  });

  it("la cota: el perfecto no la pasa en ninguna semilla, y es la de cualquier semilla", () => {
    for (const seed of SEEDS.slice(0, 50)) expect(botTrace(seed).run.score).toBe(MAX_SCORE);
    expect(MAX_SCORE).toBeGreaterThan(5000);
    expect(botTrace(SEED).run.index).toBeLessThan(ORDER_COUNT);
  });
});

describe("calibración", () => {
  it("el jugador modelo arma entre 8 y 14 (el lento menos, el rápido más)", () => {
    const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
    const seeds = SEEDS.slice(0, 100);
    const model = seeds.map((s) => botTrace(s, MODEL).run);
    const slow = seeds.map((s) => botTrace(s, { firstTap: [700, 1200], tapGap: [500, 850], errBase: 0, errPerLayer: 14 }).run.served);
    const fast = seeds.map((s) => botTrace(s, { firstTap: [350, 600], tapGap: [250, 420], errBase: 0, errPerLayer: 6 }).run.served);
    const served = model.map((r) => r.served);
    process.stdout.write(
      `larry-en-la-hdp: modelo p25/med/p75 ${q(served, 0.25)}/${q(served, 0.5)}/${q(served, 0.75)} hamburguesas, puntaje med ${q(model.map((r) => r.score), 0.5)}, sin vidas antes de los 90 s ${model.filter((r) => r.phase === "over").length}/${seeds.length}; lento ${q(slow, 0.5)}; rápido ${q(fast, 0.5)}; perfecto ${botTrace(SEED).run.served} (${MAX_SCORE})\n`,
    );
    expect(q(served, 0.25)).toBeGreaterThanOrEqual(8);
    expect(q(served, 0.75)).toBeLessThanOrEqual(14);
    expect(q(slow, 0.5)).toBeLessThan(q(served, 0.5));
    expect(q(fast, 0.5)).toBeGreaterThan(q(served, 0.5));
  });
});

describe("arte y reutilización", () => {
  it("los 9 íconos miden 16 × 16 y las fetas 16 de ancho; los pares parecidos comparten color", () => {
    for (const ing of INGREDIENTS) {
      expect([iconSprite(ing).w, iconSprite(ing).h], ing).toEqual([16, 16]);
      expect(sliceSprite(ing).w, ing).toBe(16);
    }
    const yellow = (ing: Ingredient) => iconSprite(ing).px.some((p) => /^#F7[CD]/.test(p.c));
    expect(yellow("queso") && yellow("huevo")).toBe(true);
  });

  it("Big Bro, Larry y la cocina vienen de las mismas piezas de games/lib, sin copias", () => {
    // Larry: la misma función en los dos juegos
    expect(deseosLarry).toBe(libLarry);
    // Big Bro: clase con el bro y hdp dibujan las mismas poses de la lib
    expect(claseBro("espera")).toBe(bigBroSprite("espera"));
    expect(claseBro("enojado")).toBe(bigBroSprite("cuchilla"));
    expect(hdpBro("grita")).toBe(bigBroSprite("grita"));
    // la carne del ícono es la de la plancha de hdp
    expect(hdpPatty).toBe(libPatty);
    // ningún juego guarda sus propias filas de Big Bro, de Larry ni del cartel
    const files = ["../clase-con-el-bro/sprites.ts", "../hdp/sprites.ts", "../hdp/draw.ts", "./sprites.ts", "./draw.ts", "../los-deseos-de-larry/sprites.ts"];
    for (const f of files) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src, f).not.toContain("KWWWWWWWWWWWWWWWWWWK"); // el gorro de Big Bro
      expect(src, f).not.toContain("KBBBBBBBYBBK"); // la visera de Larry
      expect(src, f).not.toContain("K.....K...."); // el "hdp" del neón
    }
  });
});
