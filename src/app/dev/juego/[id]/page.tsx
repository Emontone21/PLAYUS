import Link from "next/link";
import { notFound } from "next/navigation";
import { getGame } from "@/games";
import { DevGame } from "./dev-game";

// Solo en desarrollo: prueba un juego sin servidor ni ronda.
// /dev/juego/reflejo?seed=lo-que-quieras
//
// Este archivo es también la prueba de la decisión 8: un Server Component
// importa el registry (y con él los módulos de los juegos, que usan hooks)
// para leer metadatos. Si esto compila, /finish también puede.
export default async function DevGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seed?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { id } = await params;
  const { seed = "dev" } = await searchParams;
  const game = getGame(id);
  if (!game) notFound();

  return (
    <main className="flex flex-col gap-4 px-5 py-6">
      <p className="text-xs text-tinta-suave">
        <Link href="/dev/juego" className="text-agua">
          ← juegos
        </Link>{" "}
        · modo desarrollo · {game.id} · semilla “{seed}” · {game.scoring} · máx {game.maxPlausibleScore}
      </p>
      <DevGame id={game.id} seed={seed} />
    </main>
  );
}
