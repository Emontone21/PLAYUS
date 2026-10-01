import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/rng";
import { BOARD_COUNT, BOARD_SIZES, boardSize, memoBoards } from "./boards";
import { DRAWING_IDS, DRAWING_SIZE, DRAWINGS, drawingSprite, outlineRows, type Drawing } from "./drawings";
import { blindAllowance, check, DURATION_MS, flip, honestTrace, initialState, MAX_SCORE, MIN_GAP_MS, validate, type FlipEvent } from "./rules";

const SEED = "intento-1";
const SEEDS = Array.from({ length: 1000 }, (_, i) => `semilla-${i}`);

describe("los dibujos", () => {
  it("son 10, de 16 × 16, cada uno con contorno y colores fuertes, y agregar uno es sumar una entrada", () => {
    expect(DRAWINGS.length).toBe(10);
    expect(new Set(DRAWING_IDS).size).toBe(10);
    for (const d of DRAWINGS) {
      expect(d.mapa.length).toBeLessThanOrEqual(DRAWING_SIZE);
      for (const row of d.mapa) {
        expect(row.length).toBeLessThanOrEqual(DRAWING_SIZE);
        for (const ch of row) if (ch !== ".") expect(d.colores[ch], `${d.id}: la letra ${ch} no tiene color`).toBeDefined();
      }
      const s = drawingSprite(d.id);
      expect([s.w, s.h]).toEqual([DRAWING_SIZE, DRAWING_SIZE]);
      expect(s.px.length).toBeGreaterThan(40);
      // hay contorno alrededor de lo pintado
      expect(s.px.some((p) => p.c === "#141414")).toBe(true);
    }
    // el contorno se agrega solo
    const rows = outlineRows(["....", ".AA.", "....", "...."], 4);
    expect(rows).toEqual(["KKKK", "KAAK", "KKKK", "...."]);
    // un dibujo nuevo entra a los tableros sin tocar nada más
    const extra: Drawing = { id: "prueba", nombre: "de prueba", mapa: [".....", ".PPP.", ".PPP.", "....."], colores: { P: "#FF00FF" } };
    const list = [...DRAWINGS, extra];
    expect(drawingSprite("prueba", list).px.some((p) => p.c === "#FF00FF")).toBe(true);
    let appears = 0;
    for (let i = 0; i < 200; i++) if (memoBoards(`extra-${i}`, list).some((b) => b.cards.includes("prueba"))) appears++;
    expect(appears).toBeGreaterThan(150);
    // con 11 dibujos, el tablero de 10 pares elige un subconjunto
    const big = memoBoards("extra-1", list)[3]!;
    expect(new Set(big.cards).size).toBe(10);
  });
});

describe("memoBoards", () => {
  it("es determinística y los tamaños siguen la tabla", () => {
    expect(memoBoards(SEED)).toEqual(memoBoards(SEED));
    const boards = memoBoards(SEED);
    expect(boards.length).toBe(BOARD_COUNT);
    expect(boards.slice(0, 4).map((b) => [b.cols, b.rows])).toEqual([
      [2, 3],
      [3, 4],
      [4, 4],
      [4, 5],
    ]);
    for (let i = 4; i < boards.length; i++) expect([boards[i]!.cols, boards[i]!.rows]).toEqual([4, 5]);
    expect(boardSize(99)).toEqual(BOARD_SIZES[BOARD_SIZES.length - 1]);
    expect(memoBoards("otra")[0]!.cards).not.toEqual(boards[0]!.cards);
  });

  it("en 1.000 semillas: cada dibujo aparece dos veces por tablero, los chicos varían, las posiciones se mezclan y todos los dibujos salen parejo", () => {
    const freq = new Map<string, number>();
    const firstBoards = new Set<string>();
    const arrangements = new Set<string>();
    let sameOrder = 0;
    for (const seed of SEEDS) {
      const boards = memoBoards(seed);
      for (const b of boards) {
        expect(b.cards.length).toBe(b.cols * b.rows);
        const count = new Map<string, number>();
        for (const id of b.cards) count.set(id, (count.get(id) ?? 0) + 1);
        for (const [id, n] of count) {
          expect(n, `${seed}: ${id}`).toBe(2);
          expect(DRAWING_IDS).toContain(id);
        }
        // las posiciones están mezcladas: contamos los tableros con el primer par pegado
        if (b.cards[0] === b.cards[1]) sameOrder++;
      }
      firstBoards.add([...new Set(boards[0]!.cards)].sort().join(","));
      arrangements.add(boards[3]!.cards.join(","));
      for (const id of boards[3]!.cards) freq.set(id, (freq.get(id) ?? 0) + 1);
      for (const id of boards[0]!.cards) freq.set(id, (freq.get(id) ?? 0) + 1);
    }
    // en un tablero de 6 cartas el primer par queda pegado 1 de 5 veces; en uno de 20, 1 de 19: sobre los 12.000 tableros, menos del 10 %
    expect(sameOrder / (SEEDS.length * BOARD_COUNT)).toBeLessThan(0.1);
    expect(sameOrder).toBeGreaterThan(0);
    // el 4 × 5 casi nunca se repite entre semillas
    expect(arrangements.size).toBeGreaterThan(SEEDS.length - 5);
    // los tableros chicos eligen subconjuntos distintos (120 posibles para 3 de 10)
    expect(firstBoards.size).toBeGreaterThan(80);
    // frecuencia pareja: en el 2 × 3 cada dibujo sale 3/10 de las veces; con el 4 × 5 (todos) encima
    const values = [...freq.values()];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    for (const v of values) expect(Math.abs(v - mean) / mean).toBeLessThan(0.15);
  });
});

describe("reglas", () => {
  const boards = memoBoards(SEED);
  const pairOf = (b: number, i: number) => boards[b]!.cards.findIndex((id, j) => j !== i && id === boards[b]!.cards[i]);

  it("un par igual suma y queda descubierto; uno distinto se tapa (a los 600 ms o al tocar otra); tocar una descubierta o la misma no hace nada; completar pasa al siguiente", () => {
    const s = initialState();
    const a = 0;
    const b = pairOf(0, a);
    const other = [0, 1, 2, 3, 4, 5].find((i) => i !== a && i !== b)!;
    expect(flip(s, boards, a)).toMatchObject({ ok: true, last: null });
    expect(flip(s, boards, a)).toEqual({ ok: false, reason: "carta ya dada vuelta" });
    expect(flip(s, boards, other)).toMatchObject({ ok: true, last: "distinto" });
    expect(s.current.open).toEqual([a, other]);
    // una tercera tapa las anteriores al instante
    const r = flip(s, boards, b);
    expect(r).toMatchObject({ ok: true, last: null });
    expect(s.current.open).toEqual([b]);
    expect(flip(s, boards, a)).toMatchObject({ ok: true, last: "par", completed: false });
    expect(s.pairs).toBe(1);
    expect(s.current.matched.has(a) && s.current.matched.has(b)).toBe(true);
    expect(flip(s, boards, a)).toEqual({ ok: false, reason: "carta ya descubierta" });
    expect(flip(s, boards, 99)).toEqual({ ok: false, reason: "carta inválida" });
    // completar el tablero
    const rest = [0, 1, 2, 3, 4, 5].filter((i) => i !== a && i !== b);
    const seen = new Set<number>();
    let completed = false;
    for (const i of rest) {
      if (seen.has(i)) continue;
      const j = pairOf(0, i);
      flip(s, boards, i);
      const rr = flip(s, boards, j);
      expect(rr.ok && rr.last).toBe("par");
      seen.add(i);
      seen.add(j);
      if (rr.ok && rr.completed) completed = true;
    }
    expect(completed).toBe(true);
    expect(s.board).toBe(1);
    expect(s.pairs).toBe(3);
    expect(s.current.matched.size).toBe(0);
  });

  it("cuenta los aciertos a ciegas: dos cartas nunca vistas que son par", () => {
    const s = initialState();
    const a = 0;
    const b = pairOf(0, a);
    flip(s, boards, a);
    const r = flip(s, boards, b);
    expect(r.ok && r.blind).toBe(true);
    expect(s.blind).toBe(1);
    // ya vistas: no es a ciegas
    const c = [0, 1, 2, 3, 4, 5].find((i) => i !== a && i !== b)!;
    const d = pairOf(0, c);
    const e = [0, 1, 2, 3, 4, 5].find((i) => ![a, b, c, d].includes(i))!;
    flip(s, boards, c);
    flip(s, boards, e); // distinto: c y e vistas
    flip(s, boards, d); // d nunca vista
    const r2 = flip(s, boards, c); // c ya vista antes del par: no es a ciegas
    expect(r2.ok && r2.last).toBe("par");
    expect(r2.ok && r2.blind).toBe(false);
    expect(s.blind).toBe(1);
  });

  it("el umbral de aciertos a ciegas: 3 más uno cada 3 pares, y la cota de puntos", () => {
    expect(blindAllowance(0)).toBe(3);
    expect(blindAllowance(24)).toBe(11);
    expect(MAX_SCORE).toBe(Math.floor((DURATION_MS + 2_000) / (2 * MIN_GAP_MS)));
  });
});

describe("validate de buscá los Paris", () => {
  const honest = honestTrace(SEED, { rand: mulberry32(1) });

  it("acepta una partida simulada de un jugador honesto (memoria perfecta e imperfecta)", () => {
    expect(honest.score).toBeGreaterThan(10);
    expect(validate({ score: honest.score, events: honest.events }, SEED)).toBe(true);
    const sloppy = honestTrace(SEED, { memory: 0.5, rand: mulberry32(2) });
    expect(validate({ score: sloppy.score, events: sloppy.events }, SEED)).toBe(true);
    const v = check(SEED, honest.events);
    expect(v.ok && v.boards).toBeGreaterThan(1);
  });

  it("rechaza pares inflados, una carta inválida o ya descubierta, un tablero equivocado, toques fuera de orden, un intervalo de 50 ms y todos los aciertos a ciegas", () => {
    const ev = honest.events;
    expect(validate({ score: honest.score + 1, events: ev }, SEED)).toBe(false);
    expect(check(SEED, [{ t: 100, board: 0, card: 7 }]).ok).toBe(false);
    const boards = memoBoards(SEED);
    const a = 0;
    const b = boards[0]!.cards.findIndex((id, j) => j !== 0 && id === boards[0]!.cards[0]);
    expect(check(SEED, [{ t: 100, board: 0, card: a }, { t: 300, board: 0, card: b }, { t: 500, board: 0, card: a }]).ok).toBe(false);
    expect(check(SEED, [{ t: 100, board: 1, card: 0 }]).ok).toBe(false);
    expect(check(SEED, [{ t: 300, board: 0, card: 0 }, { t: 100, board: 0, card: 1 }]).ok).toBe(false);
    expect(check(SEED, [{ t: 100, board: 0, card: 0 }, { t: 150, board: 0, card: 1 }]).ok).toBe(false);
    expect(check(SEED, [{ t: DURATION_MS + 5_000, board: 0, card: 0 }]).ok).toBe(false);
    expect(check(SEED, [{ t: 100, board: 0, card: "0" }]).ok).toBe(false);
    expect(check(SEED, "nada").ok).toBe(false);
    // conoce el tablero: todos los pares a ciegas
    const cheat: FlipEvent[] = [];
    let t = 200;
    const s = initialState();
    for (let bI = 0; bI < 3; bI++) {
      const cards = boards[bI]!.cards;
      const done = new Set<number>();
      for (let i = 0; i < cards.length; i++) {
        if (done.has(i)) continue;
        const j = cards.findIndex((id, k) => k !== i && id === cards[i]);
        cheat.push({ t, board: bI, card: i }, { t: t + 200, board: bI, card: j });
        t += 400;
        done.add(i);
        done.add(j);
        flip(s, boards, i);
        flip(s, boards, j);
      }
    }
    const v = check(SEED, cheat);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toBe("demasiados aciertos a ciegas");
  });
});
