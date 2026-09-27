import type { Metadata, Viewport } from "next";
import { Fredoka, Instrument_Sans } from "next/font/google";
import "./globals.css";

// Dos familias, no más. Fredoka para títulos, nombres, números, botones y la
// marca; Instrument Sans para el resto. Se sirven desde el propio dominio.
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: "frog",
  description: "un juego distinto cada día, el mismo para todo el grupo. jugás, comparás y a medianoche se sabe quién ganó.",
  applicationName: "frog",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "frog" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0E2620",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${fredoka.variable} ${instrument.variable}`}>
      <body className="min-h-dvh">
        <div className="mx-auto min-h-dvh w-full max-w-[480px]">{children}</div>
      </body>
    </html>
  );
}
