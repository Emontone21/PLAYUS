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
      <p className="text-sm text-tinta-suave">agregá ?seed=algo a la URL para fijar la semilla. para la piba, ?map=N muestra el mapa N con la opción de resaltar (la hoja de sprites está en /dev/piba/sprites); para quedó re tarado, ?estado=50 muestra la cara con un control de estados. para los deseos de Larry hay cajas de colisión, cámara lenta y saltos al cronograma (también por URL: &desde=60&cajas=1&lento=1). para remar vuelve a casa, cajas y camino seguro, cámara lenta, saltos a los 200, 500 y 1.000 m y ×2 forzado (&desde=500&cajas=1&lento=1&x2=1). para la parrilla del bro, la barra del cronograma, cámara lenta, saltos a los 10, 45 y 80 s y cada estado del canario (&desde=45&lento=1). para pegándole al jota, la serie con sus respuestas, saltos a la ronda 1, 7 y 13, las caras del jota y la grilla (&desde=7).</p>

    </main>
  );
}
