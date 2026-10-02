import { describe, expect, it } from "vitest";
import { frameFor, logicalSize, rotatedStyle, shouldRotate, toLogical, toPhysical } from "./orientation";

// un teléfono en vertical (Pixel 7 en px CSS) y el mismo de costado
const PHONE = { vw: 412, vh: 915 };
const SIDEWAYS = { vw: 915, vh: 412 };

describe("rotación virtual", () => {
  it("un juego 'landscape' se rota en una ventana vertical y no en una horizontal", () => {
    expect(shouldRotate("landscape", PHONE.vw, PHONE.vh)).toBe(true);
    expect(shouldRotate("landscape", SIDEWAYS.vw, SIDEWAYS.vh)).toBe(false);
    expect(shouldRotate("landscape", 1280, 720)).toBe(false);
    // una ventana cuadrada no se rota
    expect(shouldRotate("landscape", 600, 600)).toBe(false);
    const f = frameFor("landscape", PHONE.vw, PHONE.vh);
    expect(f).toEqual({ rotated: true, vw: 412, vh: 915 });
    // el jugador ve un área de 915 × 412
    expect(logicalSize(f)).toEqual({ width: 915, height: 412 });
    expect(logicalSize(frameFor("landscape", SIDEWAYS.vw, SIDEWAYS.vh))).toEqual({ width: 915, height: 412 });
    const style = rotatedStyle(f);
    expect(style.width).toBe(915);
    expect(style.height).toBe(412);
    expect(style.transform).toBe("rotate(90deg) translateY(-412px)");
  });

  it("un toque en cada esquina física llega en la esquina correcta del sistema rotado, y vuelve", () => {
    const f = frameFor("landscape", PHONE.vw, PHONE.vh);
    // arriba a la derecha de la pantalla física es el origen del jugador (la parte de arriba del teléfono quedó a la izquierda)
    expect(toLogical(412, 0, f)).toEqual({ x: 0, y: 0 });
    expect(toLogical(412, 915, f)).toEqual({ x: 915, y: 0 });
    expect(toLogical(0, 0, f)).toEqual({ x: 0, y: 412 });
    expect(toLogical(0, 915, f)).toEqual({ x: 915, y: 412 });
    expect(toLogical(206, 457.5, f)).toEqual({ x: 457.5, y: 206 });
    for (const [x, y] of [
      [0, 0],
      [412, 0],
      [0, 915],
      [412, 915],
      [100, 700],
    ]) {
      const l = toLogical(x!, y!, f);
      expect(toPhysical(l.x, l.y, f)).toEqual({ x, y });
    }
    // un arrastre físico hacia abajo es, para el jugador, hacia la derecha
    const a = toLogical(200, 300, f);
    const b = toLogical(200, 400, f);
    expect([b.x - a.x, b.y - a.y]).toEqual([100, 0]);
    // y uno físico hacia la derecha es hacia arriba
    const c = toLogical(300, 300, f);
    expect([c.x - a.x, c.y - a.y]).toEqual([0, -100]);
  });

  it("los juegos 'portrait' (o sin orientación) no cambian nada", () => {
    for (const o of ["portrait", undefined] as const) {
      expect(shouldRotate(o, PHONE.vw, PHONE.vh)).toBe(false);
      const f = frameFor(o, PHONE.vw, PHONE.vh);
      expect(f.rotated).toBe(false);
      expect(logicalSize(f)).toEqual({ width: 412, height: 915 });
      for (const [x, y] of [
        [0, 0],
        [412, 0],
        [0, 915],
        [412, 915],
      ]) {
        expect(toLogical(x!, y!, f)).toEqual({ x, y });
        expect(toPhysical(x!, y!, f)).toEqual({ x, y });
      }
    }
  });
});
