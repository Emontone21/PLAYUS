import { describe, expect, it } from "vitest";
import { countPibas, difficulty, generateMap, HEAD_H, MAP_H, MAP_W, MAX_DECOYS, MAX_PEOPLE, personAt, pibaTarget } from "./map";
import { isPiba, SPRITE_H, SPRITE_W } from "./sprites";

describe("generateMap", () => {
  it("es determinística: misma semilla y mismo índice dan el mismo mapa", () => {
    const a = generateMap("abc", 3);
    const b = generateMap("abc", 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(generateMap("abc", 4))).not.toBe(JSON.stringify(a));
    expect(JSON.stringify(generateMap("abd", 3))).not.toBe(JSON.stringify(a));
  });

  it("la tabla de dificultad: 18/2, +8/+2 por mapa, tope 70/16", () => {
    expect(difficulty(1)).toEqual({ people: 18, decoys: 2 });
    expect(difficulty(2)).toEqual({ people: 26, decoys: 4 });
    expect(difficulty(3)).toEqual({ people: 34, decoys: 6 });
    expect(difficulty(7)).toEqual({ people: 66, decoys: 14 });
    expect(difficulty(8)).toEqual({ people: 70, decoys: 16 });
    expect(difficulty(20)).toEqual({ people: MAX_PEOPLE, decoys: MAX_DECOYS });
  });

  it("en 1.000 mapas: una sola piba, ningún señuelo con los tres rasgos, la cabeza de ella libre, todos adentro y las cantidades de la tabla", () => {
    let headsCoveredOthers = 0;
    for (let i = 0; i < 1000; i++) {
      const index = (i % 9) + 1;
      const map = generateMap(`semilla-${i}`, index);
      const d = difficulty(index);
      expect(map.people).toHaveLength(d.people);
      expect(map.people.filter((p) => p.role === "senuelo")).toHaveLength(d.decoys);
      expect(countPibas(map)).toBe(1);
      const piba = map.people[map.pibaIndex]!;
      expect(piba.role).toBe("piba");
      expect(isPiba(piba.look)).toBe(true);
      for (const p of map.people) {
        if (p !== piba) expect(isPiba(p.look), `otra persona con los tres rasgos en ${map.seed}#${index}`).toBe(false);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(map.scene.groundTop);
        expect(p.x + SPRITE_W).toBeLessThanOrEqual(MAP_W);
        expect(p.y + SPRITE_H).toBeLessThanOrEqual(MAP_H);
      }
      // nadie dibujado encima de la piba toca su cabeza
      const head = { x: piba.x, y: piba.y, w: SPRITE_W, h: HEAD_H };
      for (const p of map.people) {
        if (p.z <= piba.z) continue;
        const overlaps = p.x < head.x + head.w && p.x + SPRITE_W > head.x && p.y < head.y + head.h && p.y + SPRITE_H > head.y;
        expect(overlaps, `la cabeza de la piba tapada en ${map.seed}#${index}`).toBe(false);
        if (overlaps) headsCoveredOthers++;
      }
      // tocar el centro de su cara la encuentra, aunque haya gente cerca
      const t = pibaTarget(map);
      expect(personAt(map, t.x, t.y)?.role).toBe("piba");
    }
    expect(headsCoveredOthers).toBe(0);
  });

  it("el toque superpuesto lo gana quien está dibujado más arriba", () => {
    const map = generateMap("solapados", 8);
    // buscar dos personas cuyas cajas se crucen
    let found = false;
    for (const a of map.people) {
      for (const b of map.people) {
        if (a === b) continue;
        const x = Math.max(a.x, b.x) + 1;
        const y = Math.max(a.y, b.y) + 1;
        const inA = x >= a.x - 1 && x < a.x + SPRITE_W + 1 && y >= a.y - 1 && y < a.y + SPRITE_H + 1;
        const inB = x >= b.x - 1 && x < b.x + SPRITE_W + 1 && y >= b.y - 1 && y < b.y + SPRITE_H + 1;
        if (inA && inB) {
          const top = personAt(map, x, y)!;
          expect(top.z).toBe(Math.max(a.z, b.z) === top.z ? top.z : -1);
          expect([a.z, b.z].some((z) => z <= top.z)).toBe(true);
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });
});
