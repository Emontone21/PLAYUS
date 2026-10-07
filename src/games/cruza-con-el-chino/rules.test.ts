import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyInput,
  botTrace,
  check,
  COLS,
  createCourse,
  difficultyAt,
  END_TICK,
  FAIRNESS_STARTS,
  hitboxCell,
  HOP_SWITCH,
  HOP_TICKS,
  initialState,
  MARGIN_TICKS,
  MAX_ROWS,
  nextSidewalk,
  occupancyMask,
  occupied,
  simulate,
  solveBlock,
  START_COL,
  step,
  SUB,
  TICKS_PER_S,
  trainAt,
  trainWarning,
  TRAIN_WARN_TICKS,
  validate,
  vehiclesAt,
  type HopEvent,
  type Rail,
  type Road,
  type TraceEvent,
} from "./rules";
import { gestureDir } from "./index";
import { riderSprite, vehicleSprite } from "./sprites";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const hopsOf = (events: TraceEvent[]) => events.filter((e): e is HopEvent => !("fin" in e));
/** el jugador modelo (decisión 260) */
const MODEL = { reaction: 30, pause: 120, hopGap: 24 };

describe("determinismo", () => {
  it("sin Math.random; la misma semilla da el mismo curso y la misma partida (la igualdad con el navegador la comprueba el E2E)", () => {
    const src = readFileSync(new URL("./rules.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/Math\.random/);
    for (const seed of SEEDS.slice(0, 10)) {
      const a = botTrace(seed, { ...MODEL, untilTick: 1800 });
      const b = botTrace(seed, { ...MODEL, untilTick: 1800 });
      expect(b.events).toEqual(a.events);
      const r = simulate(seed, hopsOf(a.events), a.events[a.events.length - 1]!.tick);
      expect(r.rows).toBe(a.result.rows);
    }
    const c1 = createCourse("a");
    const c2 = createCourse("b");
    expect(JSON.stringify(c1.lanes.slice(0, 8))).not.toBe(JSON.stringify(c2.lanes.slice(0, 8)));
  });
});

describe("control", () => {
  it("un toque de menos de 20 px avanza; un deslizamiento horizontal de 30 px o más mueve de costado; en vertical no hace nada", () => {
    expect(gestureDir(0, 0)).toBe("up");
    expect(gestureDir(10, -15)).toBe("up");
    expect(gestureDir(19, 0)).toBe("up");
    expect(gestureDir(35, 5)).toBe("right");
    expect(gestureDir(-40, 10)).toBe("left");
    expect(gestureDir(30, 0)).toBe("right");
    expect(gestureDir(25, 0)).toBeNull();
    expect(gestureDir(5, -50)).toBeNull();
    expect(gestureDir(20, 60)).toBeNull();
    expect(gestureDir(31, 31)).toBeNull();
  });

  it("contra el borde no se mueve; la cola guarda un movimiento y lo aplica al aterrizar", () => {
    const s = initialState(SEED);
    s.col = 0;
    applyInput(s, "left");
    expect(s.hop).toBeNull();
    expect(s.col).toBe(0);
    s.col = COLS - 1;
    applyInput(s, "right");
    expect(s.hop).toBeNull();
    // en el aire: queda en la cola de 1 (el último manda)
    s.col = START_COL;
    applyInput(s, "right");
    expect(s.hop?.dir).toBe("right");
    applyInput(s, "left");
    applyInput(s, "up");
    expect(s.queued).toBe("up");
    for (let t = 0; t < HOP_TICKS; t++) step(s);
    expect(s.col).toBe(START_COL + 1);
    expect(s.queued).toBeNull();
    expect(s.hop?.dir).toBe("up");
    for (let t = 0; t < HOP_TICKS; t++) step(s);
    expect(s.row).toBe(1);
    expect(s.maxRow).toBe(1);
  });

  it("el salto dura 8 ticks: la caja de choque sigue en el origen los primeros 4 y pasa al destino en los últimos 4", () => {
    const s = initialState(SEED);
    applyInput(s, "up");
    expect(hitboxCell(s)).toEqual({ row: 0, col: START_COL });
    for (let t = 1; t <= HOP_TICKS; t++) {
      step(s);
      const h = hitboxCell(s);
      if (t < HOP_SWITCH) expect(h, `tick ${t}`).toEqual({ row: 0, col: START_COL });
      else expect(h, `tick ${t}`).toEqual({ row: 1, col: START_COL });
      if (t < HOP_TICKS) expect(s.hop).not.toBeNull();
    }
    expect(s.hop).toBeNull();
    expect(s.row).toBe(1);
  });
});

describe("tránsito", () => {
  it("los vehículos mantienen su velocidad y su sentido, salen por un lado y vuelven a entrar por el otro", () => {
    const course = createCourse(SEED);
    const road = course.lanes.find((l): l is Road => l.kind === "road")!;
    const ring = road.period * SUB;
    for (let t = 0; t < 2000; t++) {
      const a = vehiclesAt(road, t);
      const b = vehiclesAt(road, t + 1);
      a.forEach((x, i) => expect((((b[i]! - x) % ring) + ring) % ring).toBe(((road.dir * road.speed) % ring + ring) % ring));
    }
    // en una vuelta entera del anillo, cada vehículo pasa por las 9 celdas y por fuera de ellas
    const laps = Math.ceil(ring / road.speed) + 1;
    const seenOut = new Set<number>();
    const seenIn = new Set<number>();
    for (let t = 0; t < laps; t++) {
      vehiclesAt(road, t).forEach((x, i) => {
        if (x >= COLS * SUB) seenOut.add(i);
        else seenIn.add(i);
      });
    }
    expect(seenOut.size).toBe(road.offsets.length);
    expect(seenIn.size).toBe(road.offsets.length);
    // la máscara y la ocupación dicen lo mismo
    for (let t = 0; t < 300; t += 7) for (let c = 0; c < COLS; c++) expect(((occupancyMask(road, t) >> c) & 1) === 1).toBe(occupied(road, c, t));
  });

  it("el tren avisa 1 segundo antes con el semáforo, cruza entero y no vuelve por un buen rato", () => {
    const rail: Rail = { kind: "rail", period: 600, phase: 100 };
    for (let t = 0; t < 1300; t++) {
      const inTrain = trainAt(rail, t);
      const warn = trainWarning(rail, t);
      const rel = (((t - 100) % 600) + 600) % 600;
      expect(inTrain).toBe(rel < 10);
      expect(warn).toBe(rel >= 600 - TRAIN_WARN_TICKS);
      if (inTrain) for (let c = 0; c < COLS; c++) expect(occupied(rail, c, t)).toBe(true);
    }
    expect(TRAIN_WARN_TICKS).toBe(60);
  });
});

describe("dificultad y justicia", () => {
  it("las calles por bloque, los vehículos y las vías aparecen según la tabla", () => {
    expect(difficultyAt(0)).toMatchObject({ roadsMin: 1, roadsMax: 2, motos: false, rails: false });
    expect(difficultyAt(10)).toMatchObject({ roadsMin: 2, roadsMax: 3, motos: true, alternate: true, rails: false });
    expect(difficultyAt(30)).toMatchObject({ roadsMin: 3, roadsMax: 4, rails: false });
    expect(difficultyAt(60)).toMatchObject({ roadsMin: 4, roadsMax: 5, rails: true });
    let rails = 0;
    let motosEarly = 0;
    let sunnies = 0;
    for (const seed of SEEDS.slice(0, 100)) {
      const course = createCourse(seed);
      nextSidewalk(course, 100);
      for (let b = 0; b < course.blocks.length - 1; b++) {
        const from = course.blocks[b]!;
        const to = nextSidewalk(course, from);
        const d = difficultyAt(from);
        const roads = course.lanes.slice(from + 1, to).filter((l) => l.kind === "road");
        expect(roads.length).toBeGreaterThanOrEqual(d.roadsMin);
        expect(roads.length).toBeLessThanOrEqual(d.roadsMax);
        for (const l of course.lanes.slice(from + 1, to)) {
          if (l.kind === "rail") {
            rails++;
            expect(d.rails).toBe(true);
          }
          if (l.kind === "road") {
            if (l.vehicle === "moto" && from < 10) motosEarly++;
            if (l.vehicle === "auto" && l.look === 2) sunnies++;
            expect(l.len).toBe(l.vehicle === "moto" ? 1 : l.vehicle === "auto" ? 2 : l.len);
            if (l.vehicle === "colectivo") expect([3, 4]).toContain(l.len);
            expect(l.speed).toBeGreaterThanOrEqual(4);
            expect(l.speed).toBeLessThanOrEqual(d.speedMax);
          }
        }
      }
      // cada 10 carriles, un cartel
      const signs = course.lanes.flatMap((l) => (l.kind === "sidewalk" && l.sign !== null ? [l.sign] : []));
      // uno por decena: en la primera vereda a partir de cada múltiplo de 10
      expect(signs.length).toBeGreaterThanOrEqual(8);
      for (let i = 1; i < signs.length; i++) expect(Math.floor(signs[i]! / 10)).toBeGreaterThan(Math.floor(signs[i - 1]! / 10));
      expect(signs[0]).toBeGreaterThanOrEqual(10);
    }
    expect(rails).toBeGreaterThan(20);
    expect(motosEarly).toBe(0);
    expect(sunnies).toBeGreaterThan(10);
  });

  it("en 1.000 semillas el buscador encuentra un camino con 250 ms de margen en todos los bloques hasta el carril 100", () => {
    let blocks = 0;
    for (const seed of SEEDS) {
      const course = createCourse(seed);
      nextSidewalk(course, 100);
      for (let b = 0; b < course.blocks.length - 1; b++) {
        const from = course.blocks[b]!;
        if (from > 100) break;
        const to = nextSidewalk(course, from);
        blocks++;
        for (const t0 of FAIRNESS_STARTS) {
          const path = solveBlock(course, from, to, t0);
          expect(path, `${seed} bloque ${from}→${to} desde ${t0}`).not.toBeNull();
          // cada salto del camino tiene su margen: el destino sigue libre 15 ticks después de aterrizar
          let r = from;
          let c = START_COL;
          for (const h of path!) {
            if (h.dir === "up") r++;
            else c += h.dir === "left" ? -1 : 1;
            for (let k = HOP_SWITCH; k <= HOP_TICKS + MARGIN_TICKS; k++) expect(occupied(course.lanes[r]!, c, h.tick + k)).toBe(false);
          }
        }
      }
    }
    expect(blocks).toBeGreaterThan(20_000);
    expect(MARGIN_TICKS).toBe(15);
  }, 600_000);

  it("calibración: el jugador justo nunca choca; el modelo avanza entre 40 y 80 carriles, el lento menos", () => {
    const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * f))]!;
    const seeds = SEEDS.slice(0, 20);
    const perfect = seeds.map((s) => botTrace(s).result);
    expect(perfect.every((r) => !r.crashed)).toBe(true);
    expect(Math.max(...perfect.map((r) => r.rows))).toBeLessThanOrEqual(MAX_ROWS);
    const model = seeds.map((s) => botTrace(s, MODEL).result.rows);
    const slow = seeds.map((s) => botTrace(s, { reaction: 42, pause: 180, hopGap: 36 }).result.rows);
    process.stdout.write(`cruza: justo med ${q(perfect.map((r) => r.rows), 0.5)}; modelo p25/med/p75 ${q(model, 0.25)}/${q(model, 0.5)}/${q(model, 0.75)}; lento ${q(slow, 0.5)}\n`);
    expect(q(model, 0.5)).toBeGreaterThanOrEqual(40);
    expect(q(model, 0.5)).toBeLessThanOrEqual(80);
    expect(q(slow, 0.5)).toBeLessThan(q(model, 0.5));
  }, 300_000);
});

describe("reglas", () => {
  it("chocar termina la partida y esperar en una vereda no tiene ninguna penalización", () => {
    const s = initialState(SEED);
    for (let t = 0; t < 1800; t++) step(s);
    expect(s.crashed).toBe(false);
    expect(s.maxRow).toBe(0);
    // ahora a la primera calle, a esperar: en algún momento pasa un vehículo
    applyInput(s, "up");
    while (!s.crashed && s.tick < END_TICK) step(s);
    expect(s.crashed).toBe(true);
    expect(s.crashTick).toBeGreaterThan(1800);
    const before = s.tick;
    applyInput(s, "up");
    step(s);
    expect(s.hop).toBeNull();
    expect(s.tick).toBe(before + 1);
    expect(s.maxRow).toBe(1);
  });
});

describe("validate", () => {
  it("acepta una partida real (cortada por tiempo o por choque) con su duración", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const a = botTrace(seed, MODEL);
      const endTick = a.events[a.events.length - 1]!.tick;
      const elapsed = 3000 + Math.floor((endTick * 1000) / TICKS_PER_S) + 1000;
      const v = check(seed, a.events, elapsed);
      expect(v.ok, `${seed}: ${JSON.stringify(v)}`).toBe(true);
      if (v.ok) expect(v.rows).toBe(a.result.rows);
      expect(validate({ score: a.result.rows, events: a.events }, seed, { elapsedMs: elapsed })).toBe(true);
      const parked = botTrace(seed, { blocks: 1 });
      expect(parked.result.crashed).toBe(true);
      expect(validate({ score: parked.result.rows, events: parked.events }, seed)).toBe(true);
    }
  });

  it("rechaza carriles inflados, ticks fuera de orden, dir inválido, otra semilla y un tick de fin incoherente", () => {
    const a = botTrace(SEED, { blocks: 1 });
    const t = hopsOf(a.events);
    const end = a.events[a.events.length - 1]!.tick;
    const bad = (events: unknown) => {
      const v = check(SEED, events);
      return v.ok ? "ok" : v.reason;
    };
    expect(validate({ score: a.result.rows + 1, events: a.events }, SEED)).toBe(false);
    expect(validate({ score: a.result.rows, events: a.events }, "otra")).toBe(false);
    expect(bad([t[1], t[0], ...t.slice(2), { tick: end, fin: true }])).toBe("ticks fuera de orden");
    expect(bad([{ ...t[0], dir: "down" }, ...t.slice(1), { tick: end, fin: true }])).toBe("dirección inválida");
    expect(bad([...t, { tick: END_TICK + 1, fin: true }])).toBe("tick de fin fuera de rango");
    expect(bad([...t, { tick: end + 30, fin: true }])).toBe("el tick de fin no es el del choque");
    expect(bad([...t, { tick: t[t.length - 1]!.tick, fin: true }])).toBe("salto después del final");
    expect(bad(t)).toBe("falta el cierre de la traza");
    expect(bad([])).toBe("traza mal armada");
    const endMs = Math.floor((end * 1000) / TICKS_PER_S);
    expect(check(SEED, a.events, endMs - 500)).toMatchObject({ ok: false, reason: "la partida duró más que el intento" });
    expect(check(SEED, a.events, endMs + 11_000)).toMatchObject({ ok: false, reason: "el intento duró mucho más que la partida" });
    expect(check(SEED, a.events, endMs + 3_000)).toMatchObject({ ok: true });
  });
});

describe("el arte", () => {
  it("la rana con El chino mide 16 × 22 en sus posturas y los vehículos tienen el largo de sus celdas", () => {
    for (const pose of ["quieta", "estirada", "achatada"] as const) expect([riderSprite(pose).w, riderSprite(pose).h]).toEqual([16, 22]);
    expect(vehicleSprite({ kind: "moto", len: 1, look: 0 }, 1).w).toBe(16);
    expect(vehicleSprite({ kind: "auto", len: 2, look: 2 }, -1).w).toBe(32);
    expect(vehicleSprite({ kind: "colectivo", len: 4, look: 1 }, 1).w).toBe(64);
    // el sunny es rojo
    expect(vehicleSprite({ kind: "auto", len: 2, look: 2 }, 1).px.some((p) => p.c === "#C0392B")).toBe(true);
  });
});
