import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// El service worker se genera en el build (webpack). En desarrollo queda
// apagado: Turbopack no corre el plugin y, además, un SW en dev confunde.
// El revision de /~offline cambia en cada build para que se vuelva a
// precachear.
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now());

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  cacheOnNavigation: false,
  reloadOnOnline: false,
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
});

const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
