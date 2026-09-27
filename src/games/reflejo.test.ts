import { describe, expect, it } from "vitest";
import { gameLimits } from "./types";
import { projected, reflejo, waitsForSeed, type RoundEvent } from "./reflejo";

// Quedarse sin tiempo en reflejo tiene que dar un resultado que el servidor
// acepte (malo, pero válido), no un intento rechazado.
describe("reflejo cortado por tiempo", () => {
  const seed = "abc";
  const waits = waitsForSeed(seed);
  const limits = gameLimits(reflejo);
  const accepted = (r: { score: number; events: unknown[] }) =>
    r.score >= limits.minScore && r.score <= limits.maxScore && reflejo.validate!(r, seed);

  it("sin ninguna ronda jugada vale el tope en todas", () => {
    const r = projected([], waits);
    expect(r.score).toBe(2000);
    expect(r.events).toHaveLength(5);
    expect(accepted(r)).toBe(true);
  });

  it("con dos rondas jugadas, las que faltan valen el tope", () => {
    const done: RoundEvent[] = [
      { round: 0, waitMs: waits[0]!, reactionMs: 300, falseStarts: 2 },
      { round: 1, waitMs: waits[1]!, reactionMs: 400, falseStarts: 0 },
    ];
    const r = projected(done, waits);
    expect(r.score).toBe(Math.round((300 + 400 + 2000 * 3) / 5));
    expect(accepted(r)).toBe(true);
  });
});
