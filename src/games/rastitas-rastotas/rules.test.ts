import { describe, expect, it } from "vitest";
import {
  BOOST_MIN,
  BOOST_TICKS,
  CELL,
  CELLS,
  cellOf,
  check,
  COLS,
  DELTA,
  END_TICK,
  enqueue,
  greedyPolicy,
  greedyTrace,
  inGrid,
  initialState,
  MAX_BLOCKED,
  MAX_SCORE,
  OPPOSITE,
  pathTo,
  playBot,
  QUEUE_MAX,
  reachable,
  REDBULL_LIFE_TICKS,
  rngFor,
  ROWS,
  SAFE_AHEAD,
  simulate,
  step,
  stepInterval,
  TICKS_PER_S,
  validate,
  WARN_TICKS,
  xOf,
  yOf,
  type Dir,
  type SimState,
  type TraceEvent,
  type TurnEvent,
} from "./rules";
import { canSprite, cigSprite, headSprite, liceSprite } from "./sprites";
import { AXIS, BEAD_COLORS, cellsAhead, centersOf, pariBox, pariVisible, PARI_TICKS, radiusAt, rasterRastas, rastaIntroSprite, RASTA_WIDTH, type Pt } from "./rasta";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);
const turnsOf = (events: TraceEvent[]) => events.filter((e): e is TurnEvent => !("fin" in e));
const endOf = (events: TraceEvent[]) => events[events.length - 1]!.tick;
const elapsedFor = (events: TraceEvent[]) => 3_000 + Math.floor((endOf(events) * 1000) / TICKS_PER_S) + 1_000;

/** juega con el bot y comprueba las garantías tick a tick */
function auditSeed(seed: string) {
  const rng = rngFor(seed);
  const s = initialState(rng);
  const policy = greedyPolicy(seed.endsWith("7"));
  const warnedAt = new Map<number, number>();
  let maxBlocked = 0;
  const checkItem = (c: number) => {
    const body = new Set(s.body);
    expect(body.has(c)).toBe(false);
    expect(s.blocked.has(c)).toBe(false);
    expect(s.warned.has(c)).toBe(false);
    // alcanzable sin contar las rastas (que se mueven): ningún bloqueo lo encierra
    const reach = reachable(s.body[0]!, (n) => !s.blocked.has(n));
    expect(reach.has(c), `${seed} tick ${s.tick}: el casillero ${c} no es alcanzable`).toBe(true);
  };
  let lastCig = -1;
  let lastRb: number | null = null;
  while (!s.end && s.tick < END_TICK) {
    const beforeWarned = new Set(s.warned.keys());
    const beforeBlocked = new Set(s.blocked);
    const d = policy(s);
    step(s, rng, d ? [d] : []);
    // el cigarro y la Red Bull nuevos: libres y alcanzables
    if (s.cig !== lastCig && s.cig >= 0) {
      checkItem(s.cig);
      lastCig = s.cig;
    }
    if (s.redbull && s.redbull.cell !== lastRb) {
      checkItem(s.redbull.cell);
      lastRb = s.redbull.cell;
    }
    if (!s.redbull) lastRb = null;
    // avisos nuevos: no cuerpo, no cigarro, no Red Bull, no los próximos 4
    for (const [c, at] of s.warned) {
      if (beforeWarned.has(c)) continue;
      warnedAt.set(c, s.tick - 1);
      expect(at - (s.tick - 1)).toBe(WARN_TICKS);
      expect(s.body.includes(c)).toBe(false);
      expect(c).not.toBe(s.cig);
      if (s.redbull) expect(c).not.toBe(s.redbull.cell);
      let x = xOf(s.body[0]!);
      let y = yOf(s.body[0]!);
      for (let i = 0; i < SAFE_AHEAD; i++) {
        x += DELTA[s.dir].dx;
        y += DELTA[s.dir].dy;
        if (inGrid(x, y)) expect(cellOf(x, y)).not.toBe(c);
      }
    }
    // bloqueos nuevos: con 90 ticks de aviso y sin rastas encima, y todo lo libre sigue conectado
    for (const c of s.blocked) {
      if (beforeBlocked.has(c)) continue;
      expect(s.tick - 1 - (warnedAt.get(c) ?? -1000)).toBeGreaterThanOrEqual(WARN_TICKS);
      expect(s.body.includes(c)).toBe(false);
      const ok = (n: number) => !s.blocked.has(n);
      const reach = reachable(s.body[0]!, ok);
      for (let n = 0; n < CELLS; n++) if (ok(n)) expect(reach.has(n), `${seed} tick ${s.tick}: el casillero ${n} quedó desconectado al bloquear ${c}`).toBe(true);
    }
    maxBlocked = Math.max(maxBlocked, s.blocked.size + s.warned.size);
  }
  expect(maxBlocked).toBeLessThanOrEqual(MAX_BLOCKED);
  return s;
}

describe("simulate es determinística", () => {
  it("misma semilla y misma traza dan exactamente lo mismo", () => {
    const { events } = greedyTrace(SEED);
    const a = simulate(SEED, turnsOf(events));
    const b = simulate(SEED, turnsOf(events));
    expect(JSON.stringify([a.score, a.endTick, a.state.body, [...a.state.blocked]])).toBe(JSON.stringify([b.score, b.endTick, b.state.body, [...b.state.blocked]]));
    expect(simulate(SEED, []).state.cig).not.toBe(simulate("intento-2", []).state.cig);
  });

  it("paso a paso y de una dan lo mismo (el cliente avanza de a ticks)", () => {
    const { events } = greedyTrace(SEED, 1_500);
    const turns = turnsOf(events);
    const rng = rngFor(SEED);
    const s = initialState(rng);
    let k = 0;
    while (s.tick < 1_500 && !s.end) {
      const now: Dir[] = [];
      while (k < turns.length && turns[k]!.tick <= s.tick) now.push(turns[k++]!.dir);
      step(s, rng, now);
    }
    const one = simulate(SEED, turns, 1_500).state;
    expect([s.body, s.score, [...s.blocked], [...s.warned], s.cig]).toEqual([one.body, one.score, [...one.blocked], [...one.warned], one.cig]);
  });
});

describe("en 1.000 semillas, con trazas de juego simuladas", () => {
  it("el cigarro y la Red Bull aparecen libres y alcanzables; las oleadas avisan 90 ticks, no pisan rastas ni los próximos 4, dejan todo conectado y no pasan del 20 %", () => {
    let totalWaves = 0;
    let redbulls = 0;
    for (const seed of SEEDS) {
      const s = auditSeed(seed);
      totalWaves += s.waves;
      if (s.boostUntil > 0) redbulls++;
    }
    expect(totalWaves).toBeGreaterThan(1000);
    expect(redbulls).toBeGreaterThan(50);
  }, 180_000);

  it("la grilla es de 15 × 21 y la cota de puntos aguanta", () => {
    expect([COLS, ROWS, CELLS]).toEqual([15, 21, 315]);
    expect(MAX_BLOCKED).toBe(63);
    for (const seed of SEEDS.slice(0, 100)) expect(playBot(seed, greedyPolicy(true)).result.score).toBeLessThanOrEqual(MAX_SCORE);
  });
});

describe("reglas", () => {
  function fresh(seed = SEED) {
    const rng = rngFor(seed);
    return { rng, s: initialState(rng) };
  }
  /** lleva la cabeza hasta el cigarro con el bot y devuelve cuántos ticks tardó */
  function eatOne(s: SimState, rng: ReturnType<typeof rngFor>, policy = greedyPolicy()) {
    const cigs = s.cigs;
    let n = 0;
    while (s.cigs === cigs && !s.end && n < 3000) {
      const d = policy(s);
      step(s, rng, d ? [d] : []);
      n++;
    }
    return n;
  }

  it("un cigarro suma 1 y alarga 1; con Red Bull suma 2", () => {
    const { rng, s } = fresh();
    const len = s.body.length;
    eatOne(s, rng);
    expect(s.score).toBe(1);
    expect(s.body.length).toBe(len + 1);
    // con Red Bull activa, el próximo vale 2
    s.boostUntil = s.tick + BOOST_TICKS;
    eatOne(s, rng);
    expect(s.score).toBe(3);
    expect(s.cigs).toBe(2);
    expect(s.body.length).toBe(len + 2);
  });

  it("la Red Bull acelera 5 s, se renueva al agarrar otra y desaparece a los 6 s si no la agarrás", () => {
    const { rng, s } = fresh();
    const base = stepInterval(s);
    s.boostUntil = s.tick + BOOST_TICKS;
    expect(stepInterval(s)).toBe(Math.max(BOOST_MIN, Math.ceil((base * 2) / 3)));
    s.boostUntil = 0;
    expect(stepInterval(s)).toBe(base);
    // una lata forzada: vence sola
    s.nextRedbull = s.tick;
    step(s, rng, []);
    expect(s.redbull).not.toBeNull();
    const until = s.redbull!.until;
    expect(until - (s.tick - 1)).toBe(REDBULL_LIFE_TICKS);
    // el bot sobrio sigue comiendo cigarros mientras la lata vence sola
    const sober = greedyPolicy(false);
    while (s.tick <= until && !s.end) {
      const d = sober(s);
      step(s, rng, d ? [d] : []);
    }
    expect(s.end).toBeNull();
    expect(s.redbull).toBeNull();
    // agarrar una renueva los 5 s
    const t2 = fresh("otra");
    t2.s.nextRedbull = t2.s.tick;
    step(t2.s, t2.rng, []);
    const bot = greedyPolicy(true);
    let n = 0;
    while (t2.s.redbull && !t2.s.end && n++ < 2000) {
      const d = bot(t2.s);
      step(t2.s, t2.rng, d ? [d] : []);
    }
    expect(t2.s.boostUntil).toBe(t2.s.tick - 1 + BOOST_TICKS);
    const firstUntil = t2.s.boostUntil;
    t2.s.nextRedbull = t2.s.tick;
    step(t2.s, t2.rng, []);
    n = 0;
    while (t2.s.redbull && !t2.s.end && n++ < 2000) {
      const d = bot(t2.s);
      step(t2.s, t2.rng, d ? [d] : []);
    }
    if (!t2.s.end) expect(t2.s.boostUntil).toBeGreaterThan(firstUntil);
  });

  it("la dirección opuesta y la repetida se ignoran, y la cola guarda hasta 2 giros que se aplican de a uno por paso", () => {
    const { rng, s } = fresh();
    expect(enqueue(s, "down")).toBe(false); // opuesta a arriba
    expect(enqueue(s, "up")).toBe(false); // la misma
    expect(enqueue(s, "left")).toBe(true);
    expect(enqueue(s, "left")).toBe(false); // repetida en la cola
    expect(enqueue(s, "right")).toBe(false); // opuesta a la última de la cola
    expect(enqueue(s, "down")).toBe(true);
    expect(enqueue(s, "left")).toBe(false); // llena
    expect(s.queue).toEqual(["left", "down"]);
    expect(QUEUE_MAX).toBe(2);
    // una "U": izquierda y abajo, en dos pasos seguidos
    const head0 = s.body[0]!;
    while (s.lastMove === 0 && !s.end) step(s, rng, []);
    expect(s.dir).toBe("left");
    expect(s.body[0]).toBe(head0 - 1);
    const t1 = s.lastMove;
    while (s.lastMove === t1 && !s.end) step(s, rng, []);
    expect(s.dir).toBe("down");
    expect(OPPOSITE.down).toBe("up");
  });

  it("chocar el borde, las rastas o un casillero bloqueado termina la partida; pasar por uno avisado no", () => {
    // borde: derecho hasta arriba
    const a = simulate(SEED, []);
    expect(a.endReason).toBe("borde");
    expect(a.endTick).toBe(a.state.tick);
    // rastas: con rastas largas, un giro en U cerrado (izquierda, abajo, derecha) se muerde
    const u = fresh();
    const head = u.s.body[0]!;
    u.s.body = [head, head + COLS, head + 2 * COLS, head + 3 * COLS, head + 4 * COLS, head + 5 * COLS];
    u.s.prevBody = [...u.s.body];
    step(u.s, u.rng, ["left", "down"]);
    while (u.s.dir !== "down" && !u.s.end) step(u.s, u.rng, []);
    step(u.s, u.rng, ["right"]);
    while (!u.s.end) step(u.s, u.rng, []);
    expect(u.s.end!.reason).toBe("rastas");
    // piojos y aviso: un casillero delante, primero avisado (se pasa) y después bloqueado (choca)
    const { rng, s } = fresh();
    const ahead = s.body[0]! - COLS * 3;
    s.warned.set(ahead, s.tick + 100_000);
    while (s.body[0]! !== ahead - COLS && !s.end) step(s, rng, []);
    expect(s.end).toBeNull();
    const c2 = fresh();
    const ahead2 = c2.s.body[0]! - COLS * 3;
    c2.s.blocked.add(ahead2);
    while (!c2.s.end) step(c2.s, c2.rng, []);
    expect(c2.s.end!.reason).toBe("piojos");
    expect(c2.s.body[0]).toBe(ahead2 + COLS);
  });

  it("el intervalo baja un tick cada 5 cigarros con piso 5, y arranca en 9", () => {
    const { s } = fresh();
    expect(stepInterval(s)).toBe(9);
    s.cigs = 5;
    expect(stepInterval(s)).toBe(8);
    s.cigs = 20;
    expect(stepInterval(s)).toBe(5);
    s.cigs = 100;
    expect(stepInterval(s)).toBe(5);
    s.boostUntil = s.tick + 10;
    expect(stepInterval(s)).toBe(4);
  });

  it("pathTo encuentra el camino más corto evitando piojos", () => {
    const { s } = fresh();
    const p = pathTo(s, s.cig)!;
    expect(p.length).toBe(Math.abs(xOf(s.cig) - xOf(s.body[0]!)) + Math.abs(yOf(s.cig) - yOf(s.body[0]!)));
  });
});

describe("validate de rastitas rastotas", () => {
  const { events, result } = greedyTrace(SEED, 1_500);
  const elapsed = elapsedFor(events);

  it("acepta una traza real (cortada por el cronómetro y terminada sola)", () => {
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: elapsed })).toBe(true);
    const full = greedyTrace(SEED);
    expect(full.result.endReason).not.toBe("tiempo");
    expect(validate({ score: full.result.score, events: full.events }, SEED, { elapsedMs: elapsedFor(full.events) })).toBe(true);
    const lazy = playBot(SEED, () => null);
    expect(lazy.result.endReason).toBe("borde");
    expect(validate({ score: lazy.result.score, events: lazy.events }, SEED, { elapsedMs: elapsedFor(lazy.events) })).toBe(true);
  });

  it("rechaza puntos inflados", () => {
    expect(result.score).toBeGreaterThan(0);
    expect(validate({ score: result.score + 1, events }, SEED, { elapsedMs: elapsed })).toBe(false);
    expect(validate({ score: result.score - 1, events }, SEED, { elapsedMs: elapsed })).toBe(false);
  });

  it("rechaza ticks fuera de orden, después del final y direcciones inválidas", () => {
    const turns = turnsOf(events);
    expect(turns.length).toBeGreaterThan(2);
    const fin = events[events.length - 1]!;
    const swapped = [turns[1]!, turns[0]!, ...turns.slice(2), fin];
    if (turns[1]!.tick !== turns[0]!.tick) expect(check(SEED, swapped)).toEqual({ ok: false, reason: "ticks fuera de orden" });
    expect(check(SEED, [...turns, { tick: endOf(events) + 5, dir: "up" }, fin])).toEqual({ ok: false, reason: "giro después del final" });
    expect(check(SEED, [{ tick: 3, dir: "arriba" }, fin])).toEqual({ ok: false, reason: "dirección inválida" });
    expect(check(SEED, [{ tick: 3 }, fin]).ok).toBe(false);
    expect(check(SEED, "nada").ok).toBe(false);
    expect(check(SEED, []).ok).toBe(false);
  });

  it("rechaza una traza armada con otra semilla y un tick de fin incoherente", () => {
    const other = greedyTrace("otra-semilla", 1_500);
    expect(validate({ score: other.result.score, events: other.events }, "otra-semilla", { elapsedMs: elapsedFor(other.events) })).toBe(true);
    expect(validate({ score: other.result.score, events: other.events }, SEED, { elapsedMs: elapsedFor(other.events) })).toBe(false);
    const lazy = playBot(SEED, () => null);
    const stretched = [...lazy.events.slice(0, -1), { tick: endOf(lazy.events) + 60, fin: true }];
    expect(check(SEED, stretched)).toEqual({ ok: false, reason: "el final no coincide con la partida" });
    const endMs = Math.floor((endOf(events) * 1000) / TICKS_PER_S);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs - 1 })).toBe(false);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs })).toBe(true);
    expect(validate({ score: result.score, events }, SEED, { elapsedMs: endMs + 10_001 })).toBe(false);
  });
});

describe("sprites", () => {
  it("la cabeza mira hacia donde va y todo mide un casillero", () => {
    const dirs: Dir[] = ["up", "down", "left", "right"];
    const shapes = new Set(dirs.map((d) => JSON.stringify(headSprite(d).px)));
    expect(shapes.size).toBe(4);
    for (const sp of [headSprite("up"), cigSprite(), canSprite(), liceSprite(0), liceSprite(1)]) {
      expect([sp.w, sp.h]).toEqual([8, 8]);
    }
    expect(liceSprite(0).px).not.toEqual(liceSprite(1).px);
    const intro = rastaIntroSprite();
    expect(intro.w).toBe(8);
    expect(intro.px.length).toBeGreaterThan(100);
  });
});

describe("las rastas como tubo", () => {
  const straight = (n: number): Pt[] => Array.from({ length: n }, (_, i) => ({ x: 7 * CELL + AXIS, y: 4 * CELL + AXIS + i * CELL }));
  type R = ReturnType<typeof rasterRastas>;
  const opaque = (r: R, x: number, y: number) => r.data[(y * r.w + x) * 4 + 3]! > 0;
  const rowWidth = (r: R, y: number) => {
    let n = 0;
    for (let x = 0; x < r.w; x++) if (opaque(r, x, y)) n++;
    return n;
  };
  const hexAt = (r: R, i: number) => `#${[0, 1, 2].map((j) => r.data[i * 4 + j]!.toString(16).padStart(2, "0")).join("")}`.toUpperCase();

  it("ocupa 7 de 8 unidades, es continuo entre casilleros y se afina en los últimos dos", () => {
    const r = rasterRastas(straight(12));
    // en el medio del cuerpo: 7 unidades (u 8 con un bultito) en cada fila, también en las uniones
    for (let y = 5 * CELL; y < 8 * CELL; y++) expect([RASTA_WIDTH, RASTA_WIDTH + 1]).toContain(rowWidth(r, y));
    // la punta: más angosta que el cuerpo, y termina en una colita de 1 o 2 unidades
    const tipY = 4 * CELL + 4 + 11 * CELL + 3;
    expect(rowWidth(r, tipY)).toBeLessThanOrEqual(2);
    expect(rowWidth(r, tipY)).toBeGreaterThan(0);
    expect(rowWidth(r, 4 * CELL + 4 + 10 * CELL)).toBeLessThan(RASTA_WIDTH);
    expect(radiusAt(0, 1)).toBeLessThan(radiusAt(40, 1));
    // tres tonos de marrón más el contorno (en tramos sin cuentita)
    const colors = new Set<string>();
    for (let y = 7 * CELL + 2; y < 9 * CELL + 2; y++) for (let x = 0; x < r.w; x++) if (opaque(r, x, y)) colors.add(hexAt(r, y * r.w + x));
    expect(colors.size).toBe(4);
  });

  it("las curvas quedan llenas (sin cortes en las esquinas) y las cuentitas son pocas", () => {
    const pts: Pt[] = [];
    for (let i = 0; i < 6; i++) pts.push({ x: 4 + i * CELL, y: 4 + 6 * CELL });
    for (let i = 1; i < 6; i++) pts.push({ x: 4 + 5 * CELL, y: 4 + (6 - i) * CELL });
    for (let i = 1; i < 4; i++) pts.push({ x: 4 + (5 + i) * CELL, y: 4 + CELL });
    pts.reverse(); // la cabeza primero
    const r = rasterRastas(pts);
    // cada centro del recorrido está pintado, y también el punto medio entre centros (la unión)
    for (let i = 1; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      expect(opaque(r, Math.floor(a.x), Math.floor(a.y))).toBe(true);
      expect(opaque(r, Math.floor((a.x + b.x) / 2), Math.floor((a.y + b.y) / 2))).toBe(true);
    }
    // la esquina interior de la curva también está llena (redondeada, no cortada)
    expect(opaque(r, 4 + 5 * CELL - 3, 4 + 6 * CELL - 3)).toBe(true);
    let beads = 0;
    for (let i = 0; i < r.w * r.h; i++) if (r.data[i * 4 + 3]! > 0 && (BEAD_COLORS as readonly string[]).includes(hexAt(r, i))) beads++;
    // 14 puntos (13 tramos): dos cuentitas de 3 × 3
    expect(beads).toBe(2 * 9);
  });

  it("con Red Bull el brillo va encima de la textura: los tonos siguen ahí y aparece el halo", () => {
    const plain = rasterRastas(straight(10));
    const glow = rasterRastas(straight(10), { boosted: true, pulse: 1 });
    expect(rowWidth(glow, 6 * CELL)).toBeGreaterThan(rowWidth(plain, 6 * CELL));
    const tones = new Set<string>();
    for (let y = 5 * CELL; y < 8 * CELL; y++) for (let x = 0; x < glow.w; x++) if (glow.data[(y * glow.w + x) * 4 + 3] === 255) tones.add(hexAt(glow, y * glow.w + x));
    expect(tones.size).toBeGreaterThanOrEqual(4);
  });

  it("los centros interpolan entre el paso anterior y el actual", () => {
    const rng = rngFor(SEED);
    const s = initialState(rng);
    while (s.lastMove === 0) step(s, rng);
    const before = centersOf(s, 0);
    const after = centersOf(s, 1);
    expect(after[0]!.y - before[0]!.y).toBe(-CELL);
  });
});

describe("el globo ¡PARI!", () => {
  const dirs: Dir[] = ["up", "down", "left", "right"];
  it("nunca tapa los tres casilleros de adelante y siempre entra en la grilla", () => {
    for (const dir of dirs) {
      for (let cx = 0; cx < COLS; cx++) {
        for (let cy = 0; cy < ROWS; cy++) {
          const b = pariBox(cx * CELL, cy * CELL, dir);
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.y).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w).toBeLessThanOrEqual(COLS * CELL);
          expect(b.y + b.h).toBeLessThanOrEqual(ROWS * CELL);
          for (const c of cellsAhead(cx * CELL, cy * CELL, dir)) {
            const overlaps = b.x < c.x + CELL && b.x + b.w > c.x && b.y < c.y + CELL && b.y + b.h > c.y;
            expect(overlaps).toBe(false);
          }
        }
      }
    }
    // en el medio va del lado contrario; pegado al borde de atrás, a un costado
    expect(pariBox(7 * CELL, 10 * CELL, "up").side).toBe("down");
    expect(pariBox(7 * CELL, 20 * CELL, "up").side).not.toBe("down");
    expect(["up", "down"]).toContain(pariBox(0, 10 * CELL, "right").side);
  });

  it("aparece al comer un cigarro o una Red Bull, dura 42 ticks y vuelve a empezar si se come otra cosa", () => {
    const rng = rngFor(SEED);
    const s = initialState(rng);
    expect(pariVisible(s)).toBe(false);
    const bot = greedyPolicy();
    while (s.cigs < 1 && !s.end) {
      const d = bot(s);
      step(s, rng, d ? [d] : []);
    }
    expect(pariVisible(s)).toBe(true);
    const ate = s.lastEat;
    while (s.tick - ate < PARI_TICKS - 1) step(s, rng);
    expect(pariVisible(s)).toBe(true);
    s.boostUntil = s.tick + BOOST_TICKS; // como si agarrara una Red Bull ahora
    step(s, rng);
    step(s, rng);
    expect(pariVisible(s)).toBe(true);
    s.tick += PARI_TICKS;
    expect(pariVisible(s)).toBe(false);
  });
});
