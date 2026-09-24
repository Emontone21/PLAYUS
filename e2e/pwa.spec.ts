import { test, expect } from "@playwright/test";

// PWA: manifest, service worker y pantalla sin conexión. El SW solo existe en
// el build (en dev está apagado), así que esta prueba corre contra
// `next start`: E2E_PROD=1 E2E_BASE_URL=http://127.0.0.1:3001 npm run e2e
test.skip(process.env.E2E_PROD !== "1", "solo contra un build de producción (E2E_PROD=1)");

test("el manifest y el service worker se sirven, y sin red aparece la pantalla de sin conexión", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const json = (await manifest.json()) as { display: string; orientation: string; icons: Array<{ purpose?: string; sizes: string }>; screenshots: unknown[] };
  expect(json.display).toBe("standalone");
  expect(json.orientation).toBe("portrait");
  expect(json.icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
  expect(json.icons.some((i) => i.sizes === "192x192")).toBe(true);
  expect(json.screenshots.length).toBeGreaterThan(0);

  const sw = await page.request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(await sw.text()).toContain("/~offline");

  // registrar el SW y esperar a que controle la página
  await page.goto("/");
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active);
  }, null, { timeout: 30_000 });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30_000 });

  // sin red: una navegación cae al fallback precacheado, nunca a datos viejos
  await context.setOffline(true);
  await page.goto("/hoy").catch(() => undefined);
  await expect(page.getByTestId("offline")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("sin señal")).toBeVisible();

  await context.setOffline(false);
  await context.close();
});
