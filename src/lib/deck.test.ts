import { describe, expect, it } from "vitest";
import { deckFor, gameForDay, roundSeed } from "./deck";

const GAMES = ["tap-race", "reflejo", "memoria", "sopa", "puntería"];

describe("mazo por temporada", () => {
  it("cada vuelta reparte todos los juegos sin repetir", () => {
    const n = GAMES.length;
    for (let lap = 0; lap < 20; lap++) {
      const days = Array.from({ length: n }, (_, i) => gameForDay("g1", 1, lap * n + i, GAMES));
      expect([...days].sort()).toEqual([...GAMES].sort());
    }
  });

  it("es determinístico y depende del grupo y de la temporada", () => {
    expect(deckFor("g1", 1, 0, GAMES)).toEqual(deckFor("g1", 1, 0, GAMES));
    const others = [deckFor("g2", 1, 0, GAMES), deckFor("g1", 2, 0, GAMES), deckFor("g1", 1, 1, GAMES)];
    expect(others.some((d) => JSON.stringify(d) !== JSON.stringify(deckFor("g1", 1, 0, GAMES)))).toBe(true);
  });

  it("no importa el orden del registry: se ordena alfabéticamente", () => {
    expect(deckFor("g1", 1, 0, GAMES)).toEqual(deckFor("g1", 1, 0, [...GAMES].reverse()));
  });

  it("el mismo juego nunca sale dos días seguidos (decisión 5), en muchas semillas", () => {
    let swaps = 0;
    for (let g = 0; g < 200; g++) {
      const groupId = `grupo-${g}`;
      for (let season = 1; season <= 3; season++) {
        let prev = "";
        for (let day = 0; day < GAMES.length * 6; day++) {
          const game = gameForDay(groupId, season, day, GAMES);
          expect(game).not.toBe(prev);
          prev = game;
        }
        // ¿hubo alguna vuelta donde hizo falta intercambiar? (para saber que el caso se ejercita)
        for (let lap = 1; lap < 6; lap++) {
          const raw = deckFor(groupId, season, lap, GAMES);
          const before = deckFor(groupId, season, lap - 1, GAMES);
          if (raw[0] !== before[before.length - 1]) continue;
          swaps++;
        }
      }
    }
    // con 5 juegos, ~1 de cada 5 vueltas arranca con la última carta anterior
    // antes del intercambio; acá contamos las que quedaron iguales después,
    // que tienen que ser cero
    expect(swaps).toBe(0);
  });

  it("con dos juegos alterna siempre", () => {
    const two = ["tap-race", "reflejo"];
    for (let g = 0; g < 50; g++) {
      let prev = "";
      for (let day = 0; day < 30; day++) {
        const game = gameForDay(`g${g}`, 1, day, two);
        expect(game).not.toBe(prev);
        prev = game;
      }
    }
  });

  it("con un solo juego no explota (se repite, no hay alternativa)", () => {
    expect(gameForDay("g1", 1, 0, ["solo"])).toBe("solo");
    expect(gameForDay("g1", 1, 7, ["solo"])).toBe("solo");
  });
});

describe("roundSeed", () => {
  it("cambia con el grupo, la fecha y el juego", () => {
    const base = roundSeed("g1", "2026-09-24", "tap-race");
    expect(base).toMatch(/^[0-9a-f]{8}$/);
    expect(roundSeed("g1", "2026-09-24", "tap-race")).toBe(base);
    expect(roundSeed("g2", "2026-09-24", "tap-race")).not.toBe(base);
    expect(roundSeed("g1", "2026-09-25", "tap-race")).not.toBe(base);
    expect(roundSeed("g1", "2026-09-24", "reflejo")).not.toBe(base);
  });
});
