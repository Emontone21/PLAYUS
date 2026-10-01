import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { centroid, comOffsetX, heightAt, KINDS, objectSprite, SPECS, shapeArea, siluetteArea, type Kind } from "./objects";
import { addObject, allQuiet, BASE_W, loadRapier, pieceVertices, snapshot, stateOf, topOf, towerTop, type Rapier } from "./physics";
import {
  aimX,
  applyAction,
  autoTrace,
  bodyStates,
  check,
  createSim,
  destroySim,
  END_TICK,
  formatCm,
  generatePlan,
  MAX_OBJECTS,
  MAX_SCORE,
  NEXT_MAX_TICKS,
  parseTrace,
  QUIET_TICKS,
  simulate,
  SPAWN_ABOVE,
  step,
  SWAY_A,
  SWAY_V0,
  swaySpeed,
  swayX,
  TICKS_PER_S,
  validate,
  type ActionEvent,
  type TraceEvent,
} from "./rules";

let R: Rapier;
beforeAll(async () => {
  R = await loadRapier();
}, 60_000);

const SEED = "intento-1";
const SEEDS = Array.from({ length: 200 }, (_, i) => `semilla-${i}`);
const inputsOf = (events: TraceEvent[]) => events.filter((e): e is ActionEvent => !("fin" in e));
const endOf = (events: TraceEvent[]) => events[events.length - 1]!.tick;
const elapsedFor = (events: TraceEvent[]) => 3_000 + Math.floor((endOf(events) * 1000) / TICKS_PER_S) + 1_000;
/** el jugador modelo: 50 ms de demora, ±2 px más 2 px por cada px/tick del vaivén, acuesta el cigarro y la botella */
const HUMAN = { delayTicks: 3, errorPx: 2, speedErrorPx: 2, layFlat: true, balance: 0.5 };

describe("determinismo", () => {
  it("la misma semilla con la misma traza da exactamente lo mismo dos veces (posiciones, ángulos y velocidades)", () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const a = autoTrace(R, seed, HUMAN);
      const b = autoTrace(R, seed, HUMAN);
      expect(b.result.snapshot).toBe(a.result.snapshot);
      expect(b.events).toEqual(a.events);
      const replay = simulate(R, seed, inputsOf(a.events), a.result.endTick);
      expect(replay.snapshot).toBe(a.result.snapshot);
      expect(replay.score).toBe(a.result.score);
      expect(replay.dropped).toBe(a.result.dropped);
    }
  });

  it("el motor es el paquete determinístico, cargado con import() solo acá, y el renderer no toca la física", () => {
    const physics = readFileSync(new URL("./physics.ts", import.meta.url), "utf8");
    expect(physics).toMatch(/import\("@dimforge\/rapier2d-deterministic-compat"\)/);
    expect(physics).not.toMatch(/^\s*import\s(?!type\s)[^;]*\sfrom\s+["']@dimforge/m);
    const draw = readFileSync(new URL("./draw.ts", import.meta.url), "utf8");
    expect(draw).not.toMatch(/\bstep\(/);
    expect(draw).not.toMatch(/applyAction|createSim|world\.step/);
    for (const f of ["rules.ts", "objects.ts", "draw.ts"]) {
      const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
      expect(src, `${f} usa Math.random`).not.toMatch(/Math\.random/);
    }
  });

  it("un replay de 120 s en Node tarda poco", () => {
    const a = autoTrace(R, SEED, { ...HUMAN, free: true });
    expect(a.result.endTick).toBe(END_TICK);
    expect(a.result.dropped).toBeGreaterThan(20);
    const t0 = performance.now();
    const r = simulate(R, SEED, inputsOf(a.events), END_TICK, { free: true });
    const ms = performance.now() - t0;
    expect(r.snapshot).toBe(a.result.snapshot);
    process.stdout.write(`replay de 120 s en modo libre (${a.result.dropped} objetos soltados): ${ms.toFixed(0)} ms\n`);
    expect(ms).toBeLessThan(2_000);
  });
});

describe("los objetos", () => {
  it("la forma de choque de cada uno cubre su silueta: área a menos del 15 % del mapa de píxeles, y dentro de la tabla", () => {
    for (const k of KINDS) {
      const shape = shapeArea(k);
      const sil = siluetteArea(k);
      expect(Math.abs(shape - sil) / sil, `${k}: forma ${shape}, silueta ${sil}`).toBeLessThan(0.15);
      const sp = objectSprite(k);
      expect(sp.w).toBe(SPECS[k].w);
      expect(sp.h).toBe(SPECS[k].h);
      for (const p of SPECS[k].pieces) {
        for (const [x, y] of pieceVertices(p)) {
          expect(Math.abs(x)).toBeLessThanOrEqual(SPECS[k].w / 2);
          expect(Math.abs(y)).toBeLessThanOrEqual(SPECS[k].h / 2);
        }
      }
    }
  });

  it("las medidas del documento: vapo 12 × 12, cigarro 3 × 18, planta 14 × 20 con maceta de 10, botella 10 × 22 con cuello de 4", () => {
    expect([SPECS.vapo.w, SPECS.vapo.h]).toEqual([12, 12]);
    expect([SPECS.cigarro.w, SPECS.cigarro.h]).toEqual([3, 18]);
    expect([SPECS.planta.w, SPECS.planta.h]).toEqual([14, 20]);
    expect(SPECS.planta.pieces[0]).toMatchObject({ type: "box", w: 10 });
    expect([SPECS.botella.w, SPECS.botella.h]).toEqual([10, 22]);
    expect(SPECS.botella.pieces[0]).toMatchObject({ type: "box", w: 10 });
    expect(SPECS.botella.pieces[2]).toMatchObject({ type: "box", w: 4 });
    expect(heightAt("botella", 1)).toBe(10);
    expect(heightAt("cigarro", 0)).toBe(18);
  });

  it("la botella es la más pesada y el cigarro el más liviano; la maceta agarra más que el vidrio", () => {
    const world = createSim(R, "masas");
    const masses = Object.fromEntries(KINDS.map((k) => [k, addObject(R, world.world, k, 0, 100, 0).body.mass()])) as Record<Kind, number>;
    destroySim(world);
    expect(masses.botella).toBeGreaterThan(masses.planta);
    expect(masses.botella).toBeGreaterThan(masses.vapo);
    expect(masses.cigarro).toBeLessThan(masses.vapo);
    expect(SPECS.planta.friction).toBeGreaterThan(SPECS.botella.friction);
  });

  it("el centro de masa de la botella acostada queda del lado del cuerpo", () => {
    const c = centroid("botella");
    expect(c.y).toBeLessThan(0);
    expect(comOffsetX("botella", 1)).toBeGreaterThan(0);
    expect(comOffsetX("botella", 3)).toBeLessThan(0);
    expect(comOffsetX("vapo", 0)).toBe(0);
  });
});

describe("la secuencia y el vaivén", () => {
  it("nunca hay más de dos iguales seguidos, y la semilla cambia la secuencia", () => {
    for (const seed of SEEDS) {
      const { kinds, phases } = generatePlan(seed);
      expect(kinds.length).toBe(MAX_OBJECTS);
      for (let i = 2; i < kinds.length; i++) expect(kinds[i] === kinds[i - 1] && kinds[i] === kinds[i - 2], `${seed} ${i}`).toBe(false);
      for (const p of phases) expect(p >= 0 && p < 4 * SWAY_A).toBe(true);
    }
    expect(generatePlan("a").kinds).not.toEqual(generatePlan("b").kinds);
    expect(generatePlan("a")).toEqual(generatePlan("a"));
    // los cuatro aparecen
    const all = new Set(SEEDS.flatMap((s) => generatePlan(s).kinds.slice(0, 12)));
    expect(all.size).toBe(4);
  });

  it("el vaivén recorre la base con margen, de ida y vuelta, y se acelera con cada objeto", () => {
    const plan = generatePlan(SEED);
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 2000; t++) {
      const x = swayX(plan, 0, t);
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
      const d = Math.abs(swayX(plan, 0, t + 1) - x);
      expect(d).toBeLessThanOrEqual(SWAY_V0 + 1e-9);
    }
    expect(lo).toBeLessThan(-BASE_W / 2);
    expect(hi).toBeGreaterThan(BASE_W / 2);
    expect(lo).toBeGreaterThanOrEqual(-SWAY_A);
    expect(hi).toBeLessThanOrEqual(SWAY_A);
    expect(swaySpeed(10)).toBeGreaterThan(swaySpeed(0));
    expect(swaySpeed(100)).toBe(swaySpeed(50));
  });
});

describe("las reglas de la partida", () => {
  it("girar da vuelta de a 90° y vuelve; soltar pone el objeto donde está el vaivén, sin velocidad", () => {
    const sim = createSim(R, SEED);
    expect(sim.waiting?.rot).toBe(0);
    for (let i = 1; i <= 4; i++) {
      expect(applyAction(sim, "rotate")).toBe(true);
      expect(sim.waiting?.rot).toBe(i % 4);
    }
    for (let t = 0; t < 20; t++) step(sim);
    const x = swayX(sim.plan, 0, sim.tick);
    expect(applyAction(sim, "drop")).toBe(true);
    expect(sim.waiting).toBeNull();
    expect(sim.bodies.length).toBe(1);
    const st = stateOf(sim.bodies[0]!);
    expect(st.x).toBeCloseTo(x, 3);
    expect(st.y).toBeCloseTo(SPAWN_ABOVE, 3);
    const v = sim.bodies[0]!.body.linvel();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    // sin objeto esperando, girar y soltar no hacen nada
    expect(applyAction(sim, "rotate")).toBe(false);
    expect(applyAction(sim, "drop")).toBe(false);
    destroySim(sim);
  });

  it("el próximo aparece cuando la torre está quieta, o a los 2 s de soltar como mucho", () => {
    const sim = createSim(R, SEED);
    applyAction(sim, "drop");
    const dropTick = sim.tick;
    while (!sim.waiting && sim.tick < dropTick + 500) step(sim);
    expect(sim.waiting).not.toBeNull();
    expect(sim.tick - dropTick).toBeLessThanOrEqual(NEXT_MAX_TICKS);
    expect(sim.tick - dropTick).toBeGreaterThanOrEqual(12);
    expect(allQuiet(sim.bodies) || sim.tick - dropTick === NEXT_MAX_TICKS).toBe(true);
    // el que espera está arriba de la torre
    expect(sim.waiting!.y).toBeCloseTo(towerTop(sim.bodies) + SPAWN_ABOVE, 3);
    destroySim(sim);
  });

  it("el puntaje es la altura máxima en cm enteros con la torre quieta 300 ms", () => {
    const sim = createSim(R, SEED);
    // el primer objeto bien puesto: su alto
    const kind = sim.waiting!.kind;
    while (Math.abs(swayX(sim.plan, 0, sim.tick)) > 0.6) step(sim);
    applyAction(sim, "drop");
    let quietAt = -1;
    while (sim.best === 0 && sim.tick < 600) {
      step(sim);
      if (sim.quietTicks === 1) quietAt = sim.tick;
    }
    expect(sim.best).toBe(heightAt(kind, 0));
    expect(sim.tick - quietAt).toBeGreaterThanOrEqual(QUIET_TICKS - 1);
    expect(Math.round(towerTop(sim.bodies))).toBe(heightAt(kind, 0));
    destroySim(sim);
  });

  it("el máximo no baja: con la torre derrumbada el puntaje sigue siendo el de la torre en pie", () => {
    const a = autoTrace(R, "semilla-3", { ...HUMAN, missFrom: 3, maxDrops: 4 });
    expect(a.result.dropped).toBe(4);
    expect(a.result.endReason).toBe("caida");
    expect(a.result.score).toBeGreaterThan(20);
    // el cuarto cayó al vacío: su y está debajo de la base
    const fallen = a.result.bodies[3]!;
    expect(fallen.y).toBeLessThan(0);
  });

  it("si algo baja de la tabla se termina: tirar un objeto al vacío corta la partida en ese tick", () => {
    const sim = createSim(R, SEED);
    while (swayX(sim.plan, 0, sim.tick) < SWAY_A - 1) step(sim);
    applyAction(sim, "drop");
    while (!sim.end && sim.tick < 600) step(sim);
    expect(sim.end?.reason).toBe("caida");
    const endTick = sim.end!.tick;
    step(sim);
    expect(sim.tick).toBe(endTick);
    destroySim(sim);
  });

  it("en modo libre lo que se cae se saca y la partida sigue", () => {
    const sim = createSim(R, SEED, { free: true });
    while (swayX(sim.plan, 0, sim.tick) < SWAY_A - 1) step(sim);
    applyAction(sim, "drop");
    for (let t = 0; t < 300; t++) step(sim);
    expect(sim.end).toBeNull();
    expect(sim.bodies.length).toBe(0);
    expect(sim.waiting).not.toBeNull();
    destroySim(sim);
  });

  it("casos de física a mano: apilados al centro, doce vapos y ocho plantas quedan en pie y dormidos; una botella parada sobre un cigarro parado se cae", () => {
    const stack = (seq: [Kind, number][]) => {
      const sim = createSim(R, "mano");
      sim.waiting = null;
      for (const [kind, rot] of seq) {
        sim.bodies.push(addObject(R, sim.world, kind, 0, towerTop(sim.bodies) + SPAWN_ABOVE, rot));
        sim.dropped++;
        sim.dropTick = sim.tick;
        for (let t = 0; t < 180 && !sim.end; t++) step(sim);
      }
      const out = { end: sim.end?.reason ?? null, top: towerTop(sim.bodies), asleep: sim.bodies.every((b) => b.body.isSleeping()), states: bodyStates(sim) };
      destroySim(sim);
      return out;
    };
    const vapos = stack(Array.from({ length: 12 }, () => ["vapo", 0] as [Kind, number]));
    expect(vapos.end).toBeNull();
    expect(vapos.top).toBeGreaterThan(141);
    expect(vapos.asleep).toBe(true);
    const plantas = stack(Array.from({ length: 8 }, () => ["planta", 0] as [Kind, number]));
    expect(plantas.end).toBeNull();
    expect(plantas.top).toBeGreaterThan(155);
    // el cigarro acostado sobre un vapo, y un vapo encima: aguanta
    const cig = stack([["vapo", 0], ["cigarro", 1], ["vapo", 0]]);
    expect(cig.end).toBeNull();
    expect(cig.top).toBeGreaterThan(26);
    // un vapo con el centro más allá del borde de otro: se vuelca (y queda en la tabla, torcido o más abajo)
    const sim = createSim(R, "mano");
    sim.waiting = null;
    sim.bodies.push(addObject(R, sim.world, "vapo", 0, SPAWN_ABOVE, 0));
    for (let t = 0; t < 120; t++) step(sim);
    sim.bodies.push(addObject(R, sim.world, "vapo", 8, 12 + SPAWN_ABOVE, 0));
    for (let t = 0; t < 240 && !sim.end; t++) step(sim);
    const top = stateOf(sim.bodies[1]!);
    expect(sim.end).toBeNull();
    expect(Math.abs(top.angle) > 0.3 || top.y < 12).toBe(true);
    destroySim(sim);
    // y con el centro más allá del borde de la tabla, se cae y se termina
    const afuera = createSim(R, "mano");
    afuera.waiting = null;
    afuera.bodies.push(addObject(R, afuera.world, "vapo", BASE_W / 2 + 3, SPAWN_ABOVE, 0));
    for (let t = 0; t < 300 && !afuera.end; t++) step(afuera);
    expect(afuera.end?.reason).toBe("caida");
    destroySim(afuera);
  });
});

describe("la traza y validate", () => {
  it("acepta la traza del jugador automático con su puntaje exacto, y la duración real coherente", async () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const a = autoTrace(R, seed, HUMAN);
      const v = check(R, seed, a.events, elapsedFor(a.events));
      expect(v.ok, `${seed}: ${JSON.stringify(v)}`).toBe(true);
      if (v.ok) {
        expect(v.score).toBe(a.result.score);
        expect(v.endReason).toBe(a.result.endReason);
      }
      await expect(validate({ score: a.result.score, events: a.events }, seed, { elapsedMs: elapsedFor(a.events) })).resolves.toBe(true);
    }
  });

  it("rechaza la altura que no cierra, aunque sea por 1 cm", async () => {
    const a = autoTrace(R, SEED, HUMAN);
    await expect(validate({ score: a.result.score + 1, events: a.events }, SEED)).resolves.toBe(false);
    await expect(validate({ score: a.result.score - 1, events: a.events }, SEED)).resolves.toBe(false);
    await expect(validate({ score: MAX_SCORE, events: a.events }, SEED)).resolves.toBe(false);
    // y con otra semilla, la misma traza da otra torre
    await expect(validate({ score: a.result.score, events: a.events }, "otra")).resolves.toBe(false);
  });

  it("rechaza ticks fuera de orden, acciones después del fin, un fin más allá de los 120 s y una traza sin cierre", () => {
    const a = autoTrace(R, SEED, HUMAN);
    const inputs = inputsOf(a.events);
    expect(inputs.length).toBeGreaterThan(2);
    const end = endOf(a.events);
    const bad = (events: unknown) => {
      const v = check(R, SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    expect(bad([inputs[1], inputs[0], ...inputs.slice(2), { tick: end, fin: true }])).toBe("ticks fuera de orden");
    expect(bad([...inputs, { tick: end + 5, action: "drop" }, { tick: end, fin: true }])).toBe("acción después del final");
    expect(bad([...inputs, { tick: END_TICK + 1, fin: true }])).toBe("tick de fin fuera de rango");
    expect(bad(inputs)).toBe("falta el cierre de la traza");
    expect(bad([])).toBe("traza mal armada");
    expect(bad([{ tick: 3, action: "saltar" }, { tick: end, fin: true }])).toBe("acción inválida");
    expect(bad([{ tick: 3.5, action: "drop" }, { tick: end, fin: true }])).toBe("entrada mal armada");
    expect(parseTrace([{ tick: 1, action: "drop" }, { tick: 2, fin: true }]).ok).toBe(true);
  });

  it("rechaza soltar antes de que aparezca el próximo, y girar sin objeto esperando", () => {
    // dos drops en el mismo tick: el segundo no tiene objeto
    expect(check(R, SEED, [{ tick: 30, action: "drop" }, { tick: 30, action: "drop" }, { tick: 200, fin: true }])).toMatchObject({ ok: false, reason: "una acción sin objeto esperando" });
    // un drop y un giro dos ticks después: todavía no apareció el próximo
    expect(check(R, SEED, [{ tick: 30, action: "drop" }, { tick: 32, action: "rotate" }, { tick: 200, fin: true }])).toMatchObject({ ok: false, reason: "una acción sin objeto esperando" });
    // el mismo giro después de que aparece, vale
    expect(check(R, SEED, [{ tick: 30, action: "drop" }, { tick: 30 + NEXT_MAX_TICKS + 1, action: "rotate" }, { tick: 400, fin: true }])).toMatchObject({ ok: true });
  });

  it("rechaza un fin que no coincide con la caída, y una traza que sigue después de que algo se cayó", () => {
    const a = autoTrace(R, "semilla-3", { ...HUMAN, missFrom: 3, maxDrops: 4 });
    expect(a.result.endReason).toBe("caida");
    const inputs = inputsOf(a.events);
    const end = endOf(a.events);
    expect(check(R, "semilla-3", [...inputs, { tick: end + 30, fin: true }])).toMatchObject({ ok: false, reason: "el tick de fin no es el de la caída" });
    expect(check(R, "semilla-3", [...inputs, { tick: end + 10, action: "drop" }, { tick: end + 30, fin: true }])).toMatchObject({ ok: false, reason: "una acción sin objeto esperando" });
    // cortar la traza un tick antes de la caída no gana nada: el puntaje es el máximo quieto, que ya estaba
    const cut = check(R, "semilla-3", [...inputs, { tick: end - 1, fin: true }]);
    expect(cut.ok && cut.score === a.result.score).toBe(true);
  });

  it("la duración real del intento tiene que cerrar con el tick de fin", () => {
    const a = autoTrace(R, SEED, HUMAN);
    const endMs = Math.floor((endOf(a.events) * 1000) / TICKS_PER_S);
    expect(check(R, SEED, a.events, endMs - 500)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
    expect(check(R, SEED, a.events, endMs + 11_000)).toMatchObject({ ok: false, reason: "el intento duró mucho más que la partida" });
    expect(check(R, SEED, a.events, endMs + 4_000)).toMatchObject({ ok: true });
  });
});

describe("calibración", () => {
  it("el jugador modelo apila entre 6 y 14 objetos en la partida típica; el perfecto, más; sin mirar, se cae enseguida", () => {
    const stats = (opts: Parameters<typeof autoTrace>[2], n = 100) => {
      const drops: number[] = [];
      const cms: number[] = [];
      const secs: number[] = [];
      for (const seed of SEEDS.slice(0, n)) {
        const a = autoTrace(R, seed, opts);
        drops.push(a.result.dropped);
        cms.push(a.result.score);
        secs.push(a.result.endTick / TICKS_PER_S);
      }
      const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
      return { drops: [q(drops, 0.25), q(drops, 0.5), q(drops, 0.75), Math.max(...drops)], cm: [q(cms, 0.25), q(cms, 0.5), q(cms, 0.75), Math.max(...cms)], secs: q(secs, 0.5) };
    };
    const human = stats(HUMAN);
    const sloppy = stats({ delayTicks: 6, errorPx: 3, speedErrorPx: 3, layFlat: true, balance: 0.5 });
    const perfect = stats({ layFlat: true, balance: 0.5 });
    const blind = stats({ delayTicks: 30, errorPx: SWAY_A, naive: true }, 40);
    process.stdout.write(
      [
        `jugador modelo (50 ms, ±2 px + 2 por px/tick): objetos p25/med/p75/max ${human.drops.join("/")}, cm ${human.cm.join("/")}, ${human.secs.toFixed(0)} s de mediana`,
        `jugador flojo (100 ms, ±3 + 3): objetos ${sloppy.drops.join("/")}, cm ${sloppy.cm.join("/")}, ${sloppy.secs.toFixed(0)} s`,
        `jugador perfecto: objetos ${perfect.drops.join("/")}, cm ${perfect.cm.join("/")}, ${perfect.secs.toFixed(0)} s`,
        `sin mirar: objetos ${blind.drops.join("/")}, cm ${blind.cm.join("/")}, ${blind.secs.toFixed(0)} s`,
      ].join("\n") + "\n",
    );
    expect(human.drops[1]).toBeGreaterThanOrEqual(6);
    expect(human.drops[1]).toBeLessThanOrEqual(14);
    expect(human.drops[2]).toBeLessThanOrEqual(14);
    expect(perfect.drops[1]).toBeGreaterThan(human.drops[1]!);
    expect(perfect.cm[3]).toBeLessThanOrEqual(MAX_SCORE);
    expect(blind.drops[1]).toBeLessThanOrEqual(3);
  });

  it("apuntar: la cara de arriba del objeto más alto, o el centro de la tabla", () => {
    const sim = createSim(R, SEED);
    expect(aimX(sim)).toBe(0);
    sim.bodies.push(addObject(R, sim.world, "vapo", 5, 6, 0));
    for (let t = 0; t < 60; t++) step(sim);
    expect(aimX(sim)).toBeCloseTo(5, 0);
    expect(topOf("vapo", 5, 6, 0)).toBeCloseTo(12, 5);
    expect(snapshot(sim.bodies)).toContain("vapo");
    destroySim(sim);
  });

  it("formatCm", () => {
    expect(formatCm(0)).toBe("0 cm");
    expect(formatCm(137)).toBe("137 cm");
  });
});
