import Link from "next/link";

// Pantalla sin conexión. Está precacheada por el service worker y se muestra
// cuando una navegación no llega a la red. Nada de puntajes viejos: los datos
// siempre vienen de la red.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-6 px-5 py-10" data-testid="offline">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">playus</p>
        <h1 className="display text-5xl">sin señal</h1>
        <p className="text-lg text-tinta-suave">
          no llegamos al servidor. el juego de hoy y el ranking están del otro lado, así que acá no hay
          nada viejo para mostrarte.
        </p>
      </header>
      <Link href="/hoy" className="btn-primary">
        probar de nuevo
      </Link>
      <p className="eyebrow">si estabas en medio de una partida, ese intento ya se gastó. lo sentimos.</p>
    </main>
  );
}
