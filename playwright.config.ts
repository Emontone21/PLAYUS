import { defineConfig, devices } from "@playwright/test";

// E2E contra Next en :3000 y Supabase (real o mini-supabase) en :54321.
// Levantar antes: scripts/dev-local.sh, npm run dev:local-stack, npm run dev.
// PW_CHROMIUM_PATH permite usar un Chromium ya instalado.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // Con Supabase real en Docker y `next dev`, una acción de servidor más el
  // redirect y el render de la página siguiente tarda 3-7 s en una máquina
  // modesta; el default de 5 s daba falsos negativos (decisión 82).
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    ...devices["Pixel 7"],
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "android", use: { ...devices["Pixel 7"] } }],
});
