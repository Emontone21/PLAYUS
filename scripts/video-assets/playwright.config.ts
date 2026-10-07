import { defineConfig } from "@playwright/test";

// Capturas y clips para el video promocional, contra el stack local
// (Supabase local + next dev en :3000). Viewport de teléfono 360 × 640 con
// deviceScaleFactor 3: las capturas salen de 1080 × 1920.
//   npx playwright test --config scripts/video-assets/playwright.config.ts
export default defineConfig({
  testDir: ".",
  testMatch: "capturas.spec.ts",
  timeout: 900_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  },
  projects: [{ name: "phone" }],
});
