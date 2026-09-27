// Genera los íconos de la PWA desde la rana "feliz" en pixel art, sin borde
// de sticker, sobre el fondo de la app, escalada sin suavizado.
//
//   node scripts/frog-icons.ts
//
// Escribe public/icons/icon-192.png, icon-512.png, icon-maskable-192.png,
// icon-maskable-512.png, apple-touch-icon.png y src/app/icon.png (favicon).
// Cada tamaño se dibuja a resolución de celda y se agranda con vecino más
// cercano, con un canvas de N celdas elegido para que el factor sea entero.

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cellColor, frogGrid } from "../src/components/frog/frog-grid.ts";

const require = createRequire(import.meta.url);
// sharp viene con Next; se usa solo para escalar y codificar el PNG
const sharp = require("sharp") as typeof import("sharp").default;

const FONDO = [0x0e, 0x26, 0x20, 0xff] as const;

function hex(color: string): [number, number, number, number] {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 0xff];
}

// La rana ocupa 12×8 celdas dentro de la grilla de 15 (filas 4..11, cols 1..12).
// Se centra en un canvas cuadrado de `cells` celdas.
function raster(cells: number): Buffer {
  const g = frogGrid("feliz", { sticker: false });
  const buf = Buffer.alloc(cells * cells * 4);
  for (let i = 0; i < cells * cells; i++) buf.set(FONDO, i * 4);
  const top = Math.floor((cells - 8) / 2);
  const left = Math.floor((cells - 12) / 2);
  for (let r = 4; r <= 11; r++) {
    for (let c = 1; c <= 12; c++) {
      const fill = cellColor(g[r]![c]!, "#6CC24A");
      if (!fill) continue;
      const rr = top + (r - 4);
      const cc = left + (c - 1);
      buf.set(hex(fill), (rr * cells + cc) * 4);
    }
  }
  return buf;
}

async function png(cells: number, size: number, out: string, pad = 0) {
  const inner = size - pad * 2;
  if (inner % cells !== 0) throw new Error(`${out}: ${inner} no es múltiplo de ${cells} celdas`);
  let img = sharp(raster(cells), { raw: { width: cells, height: cells, channels: 4 } }).resize(inner, inner, { kernel: "nearest" });
  if (pad > 0) {
    img = sharp(await img.png().toBuffer()).extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: FONDO[0], g: FONDO[1], b: FONDO[2], alpha: 1 },
    });
  }
  writeFileSync(out, await img.png().toBuffer());
  console.log("ok", out);
}

mkdirSync("public/icons", { recursive: true });
// any: la rana grande (12 de 16 celdas)
await png(16, 192, "public/icons/icon-192.png");
await png(16, 512, "public/icons/icon-512.png");
// maskable: la rana dentro de la zona segura (12 de 24 celdas = 50% del ancho)
await png(24, 192, "public/icons/icon-maskable-192.png");
await png(24, 512, "public/icons/icon-maskable-512.png", 4); // 24 × 21 = 504 + 4 de margen por lado
// apple: iOS redondea las esquinas, alcanza con un poco de aire (12 de 15)
await png(15, 180, "public/icons/apple-touch-icon.png");
// favicon: Next sirve src/app/icon.png como ícono del sitio
await png(16, 64, "src/app/icon.png");
