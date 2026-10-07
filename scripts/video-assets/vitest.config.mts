import path from "node:path";
import { defineConfig } from "vitest/config";

// Config aparte para correr el generador de sprites del video con vitest
// (resuelve los alias @/ del proyecto sin bundler extra):
//   npx vitest run --config scripts/video-assets/vitest.config.mts
const root = path.resolve(__dirname, "../..");

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "server-only": path.resolve(root, "src/test/server-only.ts"),
    },
  },
  test: {
    include: ["scripts/video-assets/*.gen.ts"],
    environment: "node",
    testTimeout: 120_000,
  },
});
