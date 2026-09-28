import Link from "next/link";
import { notFound } from "next/navigation";
import { GAME_IDS, GAMES } from "@/games";

export default function DevGamesIndex() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="flex flex-col gap-4 px-5 py-8">
      <h1 className="display text-3xl">juegos (desarrollo)</h1>
      <ul className="flex flex-col">
        {GAME_IDS.map((id) => {
          const g = GAMES[id]!;
          return (
            <li key={id} className="border-b-2 border-superficie-2 py-3">
              <Link href={`/dev/juego/${id}?seed=dev`} className="flex flex-col">
                <span className="display text-lg">{g.name}</span>
                <span className="text-sm text-tinta-suave">
                  {g.tagline} · {g.scoring} · {Math.round(g.durationMs / 1000)} s
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-tinta-suave">agregá ?seed=algo a la URL para fijar la semilla. para la piba, ?map=N muestra el mapa N con la opción de resaltar; la hoja de sprites está en /dev/piba/sprites.</p>

    </main>
  );
}
