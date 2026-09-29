// Pixel art como mapas de letras: cada fila es un string con una letra por
// unidad lógica y una paleta que dice de qué color es cada letra; "." es
// transparente. Sin DOM ni React: lo usan los canvas de los juegos, los SVG de
// las pantallas previas y los tests. El pintado a escala se cachea por canvas.

export interface Pixel {
  x: number;
  y: number;
  c: string;
}

export interface Sprite {
  w: number;
  h: number;
  px: Pixel[];
}

export const OUTLINE = "#141414";

export function buildSprite(rows: readonly string[], palette: Record<string, string>): Sprite {
  const px: Pixel[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === ".") continue;
      const c = palette[ch];
      if (!c) throw new Error(`sin color para "${ch}"`);
      px.push({ x, y, c });
    }
  });
  return { w: Math.max(...rows.map((r) => r.length)), h: rows.length, px };
}

/** el sprite en espejo horizontal */
export function flipSprite(s: Sprite): Sprite {
  return { ...s, px: s.px.map((p) => ({ ...p, x: s.w - 1 - p.x })) };
}

/** una versión en grises (por ejemplo, una vida apagada) */
export function greyedSprite(sprite: Sprite): Sprite {
  return {
    ...sprite,
    px: sprite.px.map((p) => {
      const n = parseInt(p.c.slice(1), 16);
      const l = Math.round((((n >> 16) & 255) * 3 + ((n >> 8) & 255) * 6 + (n & 255)) / 10 / 2.4) + 30;
      const h = l.toString(16).padStart(2, "0");
      return { ...p, c: `#${h}${h}${h}` };
    }),
  };
}

// ---------------------------------------------------------------------------
// canvas pintados una vez por escala
// ---------------------------------------------------------------------------

const cache = new Map<string, HTMLCanvasElement>();

/** un canvas de w × h unidades a escala k, pintado una sola vez por clave */
export function paintedCanvas(key: string, w: number, h: number, k: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const id = `${key}@${k}`;
  let c = cache.get(id);
  if (!c) {
    c = document.createElement("canvas");
    c.width = w * k;
    c.height = h * k;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    paint(ctx);
    cache.set(id, c);
  }
  return c;
}

/** varios sprites en uno, cada uno en su lugar (los de más adelante tapan a los de antes) */
export function composeSprite(w: number, h: number, parts: readonly { sprite: Sprite; x: number; y: number }[]): Sprite {
  const grid = new Map<string, Pixel>();
  for (const part of parts) {
    for (const p of part.sprite.px) {
      const x = p.x + part.x;
      const y = p.y + part.y;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      grid.set(`${x},${y}`, { x, y, c: p.c });
    }
  }
  return { w, h, px: [...grid.values()] };
}

/** un sprite pintado a escala k, cacheado por clave */
export function spriteCanvas(key: string, s: Sprite, k: number): HTMLCanvasElement {
  return paintedCanvas(key, s.w, s.h, k, (ctx) => {
    for (const p of s.px) {
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x * k, p.y * k, k, k);
    }
  });
}
