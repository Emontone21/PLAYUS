import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { it } from "vitest";
import { cellColor, frogGrid, GRID, type FrogPose } from "@/components/frog/frog-grid";
import { BERET_BLACK, personPixels, SPRITE_H, SPRITE_W, type Look } from "@/games/piba-del-ipa/sprites";
import { generateMap } from "@/games/piba-del-ipa/map";
import { broSprite, CANARIO_STATES, canarioSprite } from "@/games/la-parrilla-del-bro/sprites";
import { larrySprite, type Face } from "@/games/los-deseos-de-larry/sprites";
import type { Sprite } from "@/games/lib/sprites";

// Sprites sueltos para el video: PNG con fondo transparente, escalados ×8 con
// vecino más cercano. Se corre con vitest por los alias @/ del proyecto:
//   npx vitest run --config scripts/video-assets/vitest.config.mts

const SCALE = 8;
/** el mismo look que PIBA_LOOK en games/piba-del-ipa/index.tsx (copiado para no importar JSX acá) */
const PIBA_LOOK: Look = { skin: "#D9A06B", hair: "largo", hairColor: "#2B1B12", shirt: "#3FAE6A", pants: "#2E3A59", head: "boina", headColor: BERET_BLACK, star: true, cig: true };
const OUT = path.resolve(__dirname, "../../video-assets/sprites");

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** escribe w × h píxeles (x, y, color) como PNG ×SCALE */
async function writePng(name: string, w: number, h: number, px: { x: number; y: number; c: string }[]): Promise<void> {
  const raw = Buffer.alloc(w * h * 4, 0);
  for (const p of px) {
    if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) continue;
    const [r, g, b] = hexToRgb(p.c);
    const i = (p.y * w + p.x) * 4;
    raw[i] = r;
    raw[i + 1] = g;
    raw[i + 2] = b;
    raw[i + 3] = 255;
  }
  await sharp(raw, { raw: { width: w, height: h, channels: 4 } })
    .resize(w * SCALE, h * SCALE, { kernel: "nearest" })
    .png()
    .toFile(path.join(OUT, `${name}.png`));
}

function writeSprite(name: string, s: Sprite): Promise<void> {
  return writePng(name, s.w, s.h, s.px);
}

it("genera los sprites del video", async () => {
  mkdirSync(OUT, { recursive: true });
  const written: string[] = [];
  const add = async (name: string, p: Promise<void>) => {
    await p;
    written.push(name);
  };

  // la rana: las 7 poses, con el borde de sticker y la sombra, como en la app
  const poses: FrogPose[] = ["feliz", "risa", "lengua", "guino", "sorpresa", "dormida", "corona"];
  for (const pose of poses) {
    const g = frogGrid(pose, { sticker: true });
    const px: { x: number; y: number; c: string }[] = [];
    g.forEach((row, y) =>
      row.forEach((ch, x) => {
        const c = cellColor(ch, "#6CC24A");
        if (c) px.push({ x, y, c });
      }),
    );
    await add(`rana-${pose}`, writePng(`rana-${pose}`, GRID, GRID, px));
  }

  // la piba del IPA (con el humo) y 3 personas comunes de la multitud
  await add("piba", writePng("piba", SPRITE_W, SPRITE_H, personPixels(PIBA_LOOK, 1)));
  const commons = generateMap("video-promo", 2)
    .people.filter((p) => p.role === "comun")
    .slice(0, 3);
  for (const [i, p] of commons.entries()) await add(`persona-${i + 1}`, writePng(`persona-${i + 1}`, SPRITE_W, SPRITE_H, personPixels(p.look, 0)));

  // el bro (quieto y tocando la parrilla) y el canario en cada estado
  await add("bro", writeSprite("bro", broSprite(false)));
  await add("bro-tocando", writeSprite("bro-tocando", broSprite(true)));
  for (const look of CANARIO_STATES) {
    await add(`canario-${look}`, writeSprite(`canario-${look}`, canarioSprite(look, 0)));
    await add(`canario-${look}-cuadro2`, writeSprite(`canario-${look}-cuadro2`, canarioSprite(look, 1)));
  }

  // Larry, con sus cuatro caras
  const faces: Face[] = ["normal", "feliz", "asco", "bajon"];
  for (const face of faces) await add(`larry-${face}`, writeSprite(`larry-${face}`, larrySprite(face, 0)));

  process.stdout.write(`sprites: ${written.length} archivos en ${OUT}\n${written.join(", ")}\n`);
});
