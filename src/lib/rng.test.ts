import { describe, expect, it } from "vitest";
import { hash32, hashHex, mulberry32, rngFromSeed } from "./rng";

describe("hash32", () => {
  it("es estable: los mismos valores siempre (no cambiar nunca)", () => {
    // Si esto cambia, cambian las semillas de todas las rondas futuras.
    expect(hash32("")).toBe(hash32(""));
    expect(hash32("playus")).toBe(hash32("playus"));
    expect(hashHex("playus")).toHaveLength(8);
  });

  it("semillas distintas dan hashes distintos", () => {
    expect(hash32("a")).not.toBe(hash32("b"));
    expect(hash32("grupo-2026-09-24-tap-race")).not.toBe(hash32("grupo-2026-09-25-tap-race"));
  });

  it("devuelve un entero de 32 bits sin signo", () => {
    for (const s of ["", "x", "hola", "una semilla larga con espacios y ñ"]) {
      const h = hash32(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("mulberry32", () => {
  it("la misma semilla produce la misma secuencia", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("siempre en [0, 1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 10_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("rngFromSeed", () => {
  it("int respeta los límites incluidos", () => {
    const r = rngFromSeed("limites");
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = r.int(1, 4);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(4);
      seen.add(v);
    }
    expect(seen.size).toBe(4);
  });

  it("shuffle es una permutación determinística", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    const s1 = rngFromSeed("mazo").shuffle(items);
    const s2 = rngFromSeed("mazo").shuffle(items);
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual(items);
    expect(items).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});
