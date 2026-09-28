import Link from "next/link";
import { notFound } from "next/navigation";
import { getGame } from "@/games";
import { DevGame } from "./dev-game";
import { MapPreview } from "@/games/piba-del-ipa/preview";
import { FacePreview } from "@/games/quedo-re-tarado/preview";

// Solo en desarrollo: prueba un juego sin servidor ni ronda.
// /dev/juego/piba-del-ipa?seed=lo-que-quieras (&map=N: vista previa del mapa N)
//
// Este archivo es también la prueba de la decisión 8: un Server Component
// importa el registry (y con él los módulos de los juegos, que usan hooks)
// para leer metadatos. Si esto compila, /finish también puede.
export default async function DevGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seed?: string; map?: string; estado?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { id } = await params;
  const { seed = "dev", map, estado } = await searchParams;
  const game = getGame(id);
  if (!game) notFound();

  return (
    <main className="flex flex-col gap-4 px-5 py-6">
      <p className="text-xs text-tinta-suave">
        <Link href="/dev/juego" className="text-agua">
          ← juegos
        </Link>{" "}
        {" "}modo desarrollo. {game.id}, semilla “{seed}”, {game.scoring}, máximo {game.maxPlausibleScore}
      </p>
      {game.id === "piba-del-ipa" && map ? (
        <MapPreview seed={seed} mapIndex={Math.max(1, Number(map) || 1)} />
      ) : game.id === "quedo-re-tarado" && estado !== undefined ? (
        <FacePreview seed={seed} initial={Number(estado) || 0} />
      ) : (
        <DevGame id={game.id} seed={seed} />
      )}
    </main>
  );
}
