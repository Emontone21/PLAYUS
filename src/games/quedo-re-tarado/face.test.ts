import { describe, expect, it } from "vitest";
import { accessoryCollides, cigLength, FACE_H, FACE_W, faceFor, facePixels, stageFor } from "./face";

describe("la cara de quedó re tarado", () => {
  it("misma semilla, misma cara; distinta semilla, en general otra", () => {
    expect(faceFor("abc")).toEqual(faceFor("abc"));
    const distinct = new Set(Array.from({ length: 50 }, (_, i) => JSON.stringify(faceFor(`s${i}`))));
    expect(distinct.size).toBeGreaterThan(40);
  });

  it("ninguna combinación de accesorios tapa el cigarro ni los ojos, y todo entra en el lienzo", () => {
    for (let i = 0; i < 300; i++) {
      const look = faceFor(`cara-${i}`);
      expect(accessoryCollides(look), `${look.accessory} en cara-${i}`).toBe(false);
      for (const progress of [0, 0.3, 0.6, 0.9, 1]) {
        const out = facePixels(look, { progress, ash: 3, smokeFrame: 2 }).filter((p) => p.x < 0 || p.y < 0 || p.x >= FACE_W || p.y >= FACE_H);
        expect(out, `píxeles fuera del lienzo en cara-${i} al ${progress * 100}%`).toEqual([]);
      }
    }
  });

  it("las etapas y el largo del cigarro siguen el consumo", () => {
    expect(stageFor(0)).toBe(0);
    expect(stageFor(0.24)).toBe(0);
    expect(stageFor(0.25)).toBe(1);
    expect(stageFor(0.5)).toBe(2);
    expect(stageFor(0.75)).toBe(3);
    expect(stageFor(1)).toBe(4);
    expect(cigLength(0)).toBe(14);
    expect(cigLength(0.5)).toBe(7);
    expect(cigLength(1)).toBe(2);
    // la cara cambia entre etapas
    const look = faceFor("abc");
    const a = JSON.stringify(facePixels(look, { progress: 0 }));
    const b = JSON.stringify(facePixels(look, { progress: 0.6 }));
    expect(a).not.toBe(b);
  });
});
