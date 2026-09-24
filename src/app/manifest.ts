import type { MetadataRoute } from "next";

// Se sirve en /manifest.webmanifest. Standalone y vertical: la app se usa
// parada en el ómnibus con una mano.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "playus",
    short_name: "playus",
    description: "un minijuego distinto por día. todos el mismo, el mismo día. gana el ranking del grupo.",
    lang: "es",
    id: "/hoy",
    start_url: "/hoy",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1b1a2e",
    theme_color: "#1b1a2e",
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
      { src: "/screenshots/grupo.png", sizes: "1082x2649", type: "image/png", form_factor: "narrow", label: "la tabla de la temporada" },
    ],
  };
}
