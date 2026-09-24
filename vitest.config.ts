import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // los tests importan el registry de juegos, que trae TSX; tsconfig dice
  // jsx: preserve (para Next) y acá hace falta compilarlo (vite 8 usa oxc)
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    testTimeout: 30_000,
  },
});
