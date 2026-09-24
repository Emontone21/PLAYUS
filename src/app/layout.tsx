import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "playus",
  description: "un minijuego por día, con tu grupo",
};

export const viewport: Viewport = {
  themeColor: "#1b1a2e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">
        <div className="mx-auto min-h-dvh w-full max-w-[480px]">{children}</div>
      </body>
    </html>
  );
}
