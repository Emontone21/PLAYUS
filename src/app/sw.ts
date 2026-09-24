/// <reference lib="webworker" />
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

// Service worker (Serwist). Regla del brief: se cachea el esqueleto y los
// assets; los datos siempre van a la red. Nunca se sirve un puntaje desde
// caché: /api/*, Supabase y las páginas (HTML y RSC) son NetworkOnly. Sin
// red, una navegación cae a /~offline, que está precacheada.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const DAY = 24 * 60 * 60;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // datos: nunca desde caché
    { matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    { matcher: ({ url }) => /\/(rest|auth|realtime|storage|functions)\/v1\//.test(url.pathname), handler: new NetworkOnly() },
    // páginas (documento y payload RSC): siempre de la red; sin red, el fallback
    { matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate", handler: new NetworkOnly() },
    { matcher: ({ url, sameOrigin }) => sameOrigin && url.searchParams.has("_rsc"), handler: new NetworkOnly() },
    // esqueleto: chunks con hash, inmutables
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "playus-static",
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * DAY })],
      }),
    },
    // íconos, fuentes, imágenes
    {
      matcher: ({ request }) => ["image", "font", "style", "script"].includes(request.destination),
      handler: new StaleWhileRevalidate({
        cacheName: "playus-assets",
        plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * DAY })],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.mode === "navigate";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// --- Web Push -----------------------------------------------------------------

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = { title: "playus", body: "hay novedades en tu grupo." };
  try {
    if (event.data) payload = { ...payload, ...(event.data.json() as Partial<PushPayload>) };
  } catch {
    // texto plano
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag ?? "playus",
      data: { url: payload.url ?? "/hoy" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/hoy";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          void client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
