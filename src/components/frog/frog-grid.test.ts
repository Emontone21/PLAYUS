import { describe, expect, it } from "vitest";
import { cellColor, frogGrid, frogPaths, GRID, type FrogPose } from "./frog-grid";

const POSES: FrogPose[] = ["feliz", "risa", "lengua", "guino", "sorpresa", "dormida", "corona"];
const KNOWN = new Set([".", "G", "H", "N", "E", "M", "T", "Y", "B", "Z", "O", "X"]);

describe("rana en pixel art", () => {
  it("cada pose produce una grilla de 15×15 sin escribir fuera de los límites", () => {
    for (const pose of POSES) {
      const g = frogGrid(pose);
      expect(g, pose).toHaveLength(GRID);
      for (const row of g) {
        expect(row, pose).toHaveLength(GRID);
        for (const ch of row) expect(KNOWN.has(ch), `${pose}: letra ${ch}`).toBe(true);
      }
    }
  });

  it("sticker=false no genera celdas O ni X", () => {
    for (const pose of POSES) {
      const flat = frogGrid(pose, { sticker: false }).flat();
      expect(flat.includes("O"), pose).toBe(false);
      expect(flat.includes("X"), pose).toBe(false);
    }
  });

  it("con sticker hay borde y sombra, y la sombra queda abajo a la derecha", () => {
    const g = frogGrid("feliz");
    const flat = g.flat();
    expect(flat.includes("O")).toBe(true);
    expect(flat.includes("X")).toBe(true);
    // la fila debajo del borde inferior es sombra; arriba del borde superior no hay nada
    expect(g[13]!.includes("X")).toBe(true);
    expect(g[2]!.every((ch) => ch === ".")).toBe(true);
  });

  it("las poses cambian lo que dicen: corona arriba, lengua abajo, gota a la derecha", () => {
    expect(frogGrid("corona", { sticker: false })[3]!.join("")).toContain("Y..Y".replaceAll(".", "."));
    expect(frogGrid("lengua", { sticker: false })[11]!.slice(6, 8)).toEqual(["T", "T"]);
    expect(frogGrid("sorpresa", { sticker: false })[2]![12]).toBe("B");
    expect(frogGrid("dormida", { sticker: false })[0]!.slice(10, 13)).toEqual(["Z", "Z", "Z"]);
  });

  it("el parpadeo aplana los ojos en feliz y no toca las poses que ya tienen otros ojos", () => {
    const open = frogGrid("feliz", { sticker: false });
    const closed = frogGrid("feliz", { sticker: false, blink: true });
    expect(open[5]!.slice(3, 5)).toEqual(["E", "E"]);
    expect(closed[5]!.slice(3, 5)).toEqual(["H", "H"]);
    expect(frogGrid("guino", { sticker: false, blink: true })).toEqual(frogGrid("guino", { sticker: false }));
  });

  it("los colores salen del color del cuerpo y hay un path por color", () => {
    expect(cellColor("G", "#5FCB8F")).toBe("#5FCB8F");
    expect(cellColor("H", "#5FCB8F")).toBe("#8BE3AF");
    expect(cellColor("N", "#B8E04A")).toBe("#8FB52E");
    expect(cellColor(".", "#6CC24A")).toBeNull();
    const paths = frogPaths("feliz", "#6CC24A", { sticker: false });
    expect(paths.map((p) => p.color).sort()).toEqual(["#10201A", "#4E9A36", "#6CC24A", "#8EDC66", "#F07A3C"]);
    expect(paths[0]!.d).toMatch(/^M\d+ \d+h1v1h-1z/);
  });
});
