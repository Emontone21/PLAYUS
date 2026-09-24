import { describe, expect, it } from "vitest";
import { bestScores, champion, overtakenBy, rankRound, standings } from "./scoring";

describe("rankRound", () => {
  it("reparte 10/7/5/3 y 1 para el resto", () => {
    const ranked = rankRound(
      [
        { profileId: "a", bestScore: 90 },
        { profileId: "b", bestScore: 80 },
        { profileId: "c", bestScore: 70 },
        { profileId: "d", bestScore: 60 },
        { profileId: "e", bestScore: 50 },
        { profileId: "f", bestScore: 40 },
      ],
      "high",
    );
    expect(ranked.map((r) => [r.profileId, r.rank, r.points])).toEqual([
      ["a", 1, 10],
      ["b", 2, 7],
      ["c", 3, 5],
      ["d", 4, 3],
      ["e", 5, 1],
      ["f", 6, 1],
    ]);
  });

  it("empate: mismo puesto y puntos, se saltea el siguiente", () => {
    const ranked = rankRound(
      [
        { profileId: "a", bestScore: 100 },
        { profileId: "b", bestScore: 100 },
        { profileId: "c", bestScore: 90 },
        { profileId: "d", bestScore: 90 },
        { profileId: "e", bestScore: 90 },
        { profileId: "f", bestScore: 10 },
      ],
      "high",
    );
    expect(ranked.map((r) => [r.rank, r.points])).toEqual([
      [1, 10],
      [1, 10],
      [3, 5],
      [3, 5],
      [3, 5],
      [6, 1],
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
    expect(ranked[0]?.points).toBe(10);
  });

  it("sin jugadores no hay filas; uno solo se lleva 10", () => {
    expect(rankRound([], "high")).toEqual([]);
    expect(rankRound([{ profileId: "solo", bestScore: 1 }], "high")[0]).toMatchObject({ rank: 1, points: 10 });
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

describe("standings y campeón", () => {
  it("suma puntos de varias rondas y desempata por victorias", () => {
    const r1 = rankRound(
      [
        { profileId: "a", bestScore: 10 },
        { profileId: "b", bestScore: 9 },
        { profileId: "c", bestScore: 8 },
      ],
      "high",
    );
    const r2 = rankRound(
      [
        { profileId: "b", bestScore: 10 },
        { profileId: "a", bestScore: 9 },
      ],
      "high",
    );
    const r3 = rankRound([{ profileId: "c", bestScore: 1 }], "high");
    const table = standings([r1, r2, r3]);
    // a: 10+7 = 17 (1 victoria); b: 7+10 = 17 (1 victoria); c: 5+10 = 15 (1 victoria)
    expect(table.map((r) => [r.profileId, r.points, r.wins, r.rank])).toEqual([
      ["a", 17, 1, 1],
      ["b", 17, 1, 1],
      ["c", 15, 1, 3],
    ]);
    expect(champion(table)).toBe("a");
    expect(champion([])).toBeNull();
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
