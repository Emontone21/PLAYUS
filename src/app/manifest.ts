import type { MetadataRoute } from "next";

// Se sirve en /manifest.webmanifest. Standalone y vertical: la app se usa
// parada en el ómnibus con una mano.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "frog",
    short_name: "frog",
    description: "un juego distinto cada día, el mismo para todo el grupo. jugás, comparás y a medianoche se sabe quién ganó.",
    lang: "es",
    id: "/hoy",
    start_url: "/hoy",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0E2620",
    theme_color: "#0E2620",
    categories: ["games", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      { src: "/screenshots/hoy.png", sizes: "1082x2202", type: "image/png", form_factor: "narrow", label: "el juego del día" },
      { src: "/screenshots/ranking.png", sizes: "1082x2202", type: "image/png", form_factor: "narrow", label: "el ranking de hoy" },
      { src: "/screenshots/grupo.png", sizes: "1082x2202", type: "image/png", form_factor: "narrow", label: "la tabla de la temporada" },
    ],
  };
}
