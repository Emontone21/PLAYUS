import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// three solo entra al bundle de este juego (decisión 190): ningún otro archivo
// de la app lo importa, y acá solo scene.ts lo importa de forma estática; el
// resto lo carga con import() dinámico, así Next lo parte en un chunk aparte
// que se pide recién al jugar.

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const SRC = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const GAME = join(SRC, "games", "pisteando-el-sunny");

describe("three no sale de este juego", () => {
  it("ningún archivo fuera de la carpeta del juego menciona three, y adentro solo scene.ts lo importa de forma estática", () => {
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(50);
    // los `import type` se borran al compilar: no cuentan
    const staticImport = /^\s*import\s(?!type\s)[^;]*\sfrom\s+["']three(\/[^"']*)?["']/m;
    const anyThree = /["']three(\/[^"']*)?["']/;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const inside = f.startsWith(GAME);
      if (!inside) {
        expect(anyThree.test(src), `${f} menciona three`).toBe(false);
        continue;
      }
      if (f.endsWith("scene.ts")) {
        expect(staticImport.test(src)).toBe(true);
      } else {
        expect(staticImport.test(src), `${f} importa three de forma estática`).toBe(false);
        // el juego y la herramienta cargan la escena con import() dinámico, nunca con import estático
        expect(/^\s*import\s(?!type\s)[^;]*\sfrom\s+["']\.\/scene["']/m.test(src), `${f} importa scene.ts de forma estática`).toBe(false);
      }
    }
  });

  it("el componente carga la escena con import() y sin tocar la simulación desde el renderer", () => {
    const index = readFileSync(join(GAME, "index.tsx"), "utf8");
    expect(index).toMatch(/import\(["']\.\/scene["']\)/);
    const scene = readFileSync(join(GAME, "scene.ts"), "utf8");
    // el renderer lee el estado: no llama a step ni a generateCourse
    expect(scene).not.toMatch(/\bstep\(/);
    expect(scene).not.toMatch(/generateCourse/);
  });
});
