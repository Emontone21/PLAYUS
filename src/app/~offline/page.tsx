import Link from "next/link";

// Pantalla sin conexión. Está precacheada por el service worker y se muestra
// cuando una navegación no llega a la red. Nada de puntajes viejos: los datos
// siempre vienen de la red.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-6 px-5 py-10" data-testid="offline">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-tinta-suave">playus</p>
        <h1 className="text-5xl font-extrabold tracking-tight">sin señal</h1>
        <p className="text-lg text-tinta-suave">
          no llegamos al servidor. el juego de hoy y el ranking están del otro lado, así que acá no hay
          nada viejo para mostrarte.
        </p>
      </header>
      <Link href="/hoy" className="rounded-md bg-oro px-4 py-4 text-center text-xl font-extrabold text-fondo">
        probar de nuevo
      </Link>
      <p className="text-sm text-tinta-suave">si estabas en medio de una partida, ese intento ya se gastó. lo sentimos.</p>
    </main>
  );
}
