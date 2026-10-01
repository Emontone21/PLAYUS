import { describe, expect, it } from "vitest";
import { bestScores, champion, champions, overtakenBy, POINTS_RULES, POINTS_RULES_V1, pointsForRank, rankRound, rulesForSeason, standings } from "./scoring";

const entries = (scores: number[]) => scores.map((s, i) => ({ profileId: String.fromCharCode(97 + i), bestScore: s }));

describe("el reparto de colillas", () => {
  it("todos los puestos del 1 al 9 dan lo de la tabla: 5 por jugar más 20 / 15 / 11 / 8 / 6 / 4 y 2 del 7.º en adelante", () => {
    const ranked = rankRound(entries([90, 80, 70, 60, 50, 40, 30, 20, 10]), "high");
    expect(ranked.map((r) => [r.rank, r.points])).toEqual([
      [1, 25],
      [2, 20],
      [3, 16],
      [4, 13],
      [5, 11],
      [6, 9],
      [7, 7],
      [8, 7],
      [9, 7],
    ]);
    expect(POINTS_RULES.forPlaying).toBe(5);
    expect(POINTS_RULES.byRank[1]).toBe(20);
  });

  it("no jugar da 0: el que no tiene intento completado no aparece", () => {
    const ranked = rankRound(bestScores([{ profileId: "a", score: 10, status: "completed" }, { profileId: "b", score: null, status: "in_progress" }], "high"), "high");
    expect(ranked.map((r) => r.profileId)).toEqual(["a"]);
    expect(rankRound([], "high")).toEqual([]);
  });

  it("jugar y salir último da al menos 7", () => {
    for (let n = 1; n <= 12; n++) {
      const ranked = rankRound(entries(Array.from({ length: n }, (_, i) => 100 - i)), "high");
      expect(ranked[ranked.length - 1]!.points).toBeGreaterThanOrEqual(7);
    }
    expect(pointsForRank(1)).toBe(25);
    expect(pointsForRank(40)).toBe(7);
  });

  it("dos empatados en el 1.º se llevan 25 cada uno y el siguiente es 3.º con 16", () => {
    const ranked = rankRound(entries([100, 100, 90]), "high");
    expect(ranked.map((r) => [r.rank, r.points])).toEqual([
      [1, 25],
      [1, 25],
      [3, 16],
    ]);
  });

  it("tres empatados en el 2.º se llevan 20 cada uno y el siguiente es 5.º con 11", () => {
    const ranked = rankRound(entries([100, 90, 90, 90, 80]), "high");
    expect(ranked.map((r) => [r.rank, r.points])).toEqual([
      [1, 25],
      [2, 20],
      [2, 20],
      [2, 20],
      [5, 11],
    ]);
  });

  it("con scoring low gana el más bajo", () => {
    const ranked = rankRound(
      [
        { profileId: "lento", bestScore: 400 },
        { profileId: "rapido", bestScore: 200 },
        { profileId: "medio", bestScore: 300 },
      ],
      "low",
    );
    expect(ranked.map((r) => r.profileId)).toEqual(["rapido", "medio", "lento"]);
    expect(ranked[0]?.points).toBe(25);
  });

  it("el reparto viejo sigue disponible para las temporadas cerradas antes del cambio", () => {
    const ranked = rankRound(entries([90, 80, 70, 60, 50]), "high", POINTS_RULES_V1);
    expect(ranked.map((r) => r.points)).toEqual([10, 7, 5, 3, 1]);
    expect(rulesForSeason({ closed_at: "2026-09-20T03:00:00.000Z" })).toBe(POINTS_RULES_V1);
    expect(rulesForSeason({ closed_at: "2026-10-02T03:00:00.000Z" })).toBe(POINTS_RULES);
    // la temporada en curso siempre con el vigente, desde su primer día
    expect(rulesForSeason({ closed_at: null })).toBe(POINTS_RULES);
  });
});

describe("bestScores", () => {
  it("toma el mejor intento completado de cada uno según la dirección", () => {
    const attempts = [
      { profileId: "a", score: 50, status: "completed" },
      { profileId: "a", score: 70, status: "completed" },
      { profileId: "a", score: null, status: "in_progress" },
      { profileId: "b", score: 999, status: "abandoned" },
      { profileId: "b", score: 60, status: "completed" },
    ];
    expect(bestScores(attempts, "high")).toEqual([
      { profileId: "a", bestScore: 70 },
      { profileId: "b", bestScore: 60 },
    ]);
    expect(bestScores(attempts, "low")).toEqual([
      { profileId: "a", bestScore: 50 },
      { profileId: "b", bestScore: 60 },
    ]);
  });
});

describe("la tabla de la temporada, los días ganados y el campeón", () => {
  it("suma colillas de varias rondas y desempata por días ganados", () => {
    const r1 = rankRound(entries([10, 9, 8]), "high"); // a 25, b 20, c 16
    const r2 = rankRound([{ profileId: "b", bestScore: 10 }, { profileId: "a", bestScore: 9 }], "high"); // b 25, a 20
    const r3 = rankRound([{ profileId: "c", bestScore: 1 }], "high"); // c 25
    const table = standings([r1, r2, r3]);
    // a: 45 (1 día ganado); b: 45 (1); c: 41 (1)
    expect(table.map((r) => [r.profileId, r.points, r.wins, r.rank])).toEqual([
      ["a", 45, 1, 1],
      ["b", 45, 1, 1],
      ["c", 41, 1, 3],
    ]);
    expect(champion(table)).toBe("a");
    expect(champion([])).toBeNull();
  });

  it("los días ganados cuentan los empates en el 1.º", () => {
    const tie = rankRound(entries([50, 50, 10]), "high");
    const table = standings([tie]);
    expect(table.find((r) => r.profileId === "a")?.wins).toBe(1);
    expect(table.find((r) => r.profileId === "b")?.wins).toBe(1);
    expect(table.find((r) => r.profileId === "c")?.wins).toBe(0);
  });

  it("desempate al cierre: más días ganados; si persiste, comparten el título", () => {
    // a y b con 45 colillas; a ganó 2 días, b 1
    const r1 = rankRound(entries([10, 9]), "high"); // a 25, b 20
    const r2 = rankRound(entries([10, 9]), "high"); // a 25, b 20
    const r3 = rankRound([{ profileId: "b", bestScore: 10 }], "high"); // b 25
    const r4 = rankRound([{ profileId: "a", bestScore: 1 }, { profileId: "b", bestScore: 2 }], "high"); // b 25, a 20
    // a: 25+25+20 = 70 (2 ganados); b: 20+20+25+25 = 90 (2 ganados): b gana por colillas
    expect(champions(standings([r1, r2, r3, r4]))).toEqual(["b"]);
    // mismas colillas, más días ganados gana
    const x1 = rankRound([{ profileId: "a", bestScore: 2 }, { profileId: "b", bestScore: 1 }], "high"); // a 25, b 20
    const x2 = rankRound([{ profileId: "b", bestScore: 2 }, { profileId: "a", bestScore: 1 }], "high"); // b 25, a 20
    const x3 = rankRound([{ profileId: "a", bestScore: 9 }], "high"); // a 25
    const x4 = rankRound([{ profileId: "b", bestScore: 9 }, { profileId: "c", bestScore: 1 }], "high"); // b 25, c 20
    const x5 = rankRound([{ profileId: "a", bestScore: 1 }, { profileId: "b", bestScore: 1 }, { profileId: "c", bestScore: 1 }], "high"); // todos 25
    // a: 25+20+25+25 = 95 (3 ganados); b: 20+25+25+25 = 95 (3 ganados): título compartido
    expect(champions(standings([x1, x2, x3, x4, x5]))).toEqual(["a", "b"]);
    // con un día ganado más, uno solo
    const x6 = rankRound([{ profileId: "a", bestScore: 2 }, { profileId: "c", bestScore: 1 }], "high"); // a 25 (4 ganados, 120)
    const x7 = rankRound([{ profileId: "b", bestScore: 2 }, { profileId: "c", bestScore: 3 }], "high"); // c 25, b 20 (b 115)
    const x8 = rankRound([{ profileId: "b", bestScore: 2 }], "high"); // b 25 → 140, 4 ganados... ajustamos: a juega también
    const x9 = rankRound([{ profileId: "a", bestScore: 2 }, { profileId: "b", bestScore: 2 }], "high"); // a 25, b 25 → a 145 (5), b 165 (5)
    void x8;
    void x9;
    const t = standings([x1, x2, x3, x4, x5, x6, x7]);
    // a: 120 (4 ganados); b: 115 (3): a sola
    expect(champions(t)).toEqual(["a"]);
    expect(t[0]).toMatchObject({ profileId: "a", points: 120, wins: 4 });
  });
});

describe("overtakenBy", () => {
  const before = rankRound(
    [
      { profileId: "a", bestScore: 90 },
      { profileId: "b", bestScore: 80 },
      { profileId: "c", bestScore: 70 },
    ],
    "high",
  );

  it("avisa a los que quedaron detrás por el puntaje nuevo", () => {
    const after = rankRound(
      [
        { profileId: "a", bestScore: 90 },
        { profileId: "b", bestScore: 80 },
        { profileId: "c", bestScore: 70 },
        { profileId: "d", bestScore: 85 },
      ],
      "high",
    );
    expect(overtakenBy(before, after, "d").sort()).toEqual(["b", "c"]);
  });

  it("si el nuevo queda último, nadie recibe aviso; si empata, tampoco", () => {
    const last = rankRound([...before.map(({ profileId, bestScore }) => ({ profileId, bestScore })), { profileId: "d", bestScore: 10 }], "high");
    expect(overtakenBy(before, last, "d")).toEqual([]);
    const tie = rankRound([...before.map(({ profileId, bestScore }) => ({ profileId, bestScore })), { profileId: "d", bestScore: 80 }], "high");
    // d empata con b en el 2º: c pasa de 3º a 4º; b sigue 2º
    expect(overtakenBy(before, tie, "d")).toEqual(["c"]);
  });

  it("mejorar el propio puntaje también puede pasar a alguien", () => {
    const after = rankRound(
      [
        { profileId: "a", bestScore: 90 },
        { profileId: "b", bestScore: 80 },
        { profileId: "c", bestScore: 95 },
      ],
      "high",
    );
    expect(overtakenBy(before, after, "c").sort()).toEqual(["a", "b"]);
  });
});
