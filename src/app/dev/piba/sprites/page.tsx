import { notFound } from "next/navigation";
import { generateMap, type DecoyKind } from "@/games/piba-del-ipa/map";
import { PIBA_LOOK, SpriteSvg } from "@/games/piba-del-ipa";

// Solo desarrollo: hoja de sprites para revisar el arte: la piba, un señuelo
// de cada tipo y una muestra de personas comunes, sacadas de un mapa grande.
export default function SpriteSheetPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const map = generateMap("hoja-de-sprites", 8);
  const kinds: DecoyKind[] = ["boina-estrella-sin-pucho", "pucho-otro-gorro", "boina-sin-estrella-con-pucho", "boina-otro-color-con-pucho"];
  const decoys = kinds.map((k) => ({ kind: k, look: map.people.find((p) => p.decoy === k)!.look }));
  const commons = map.people.filter((p) => p.role === "comun").slice(0, 16);
  return (
    <main className="flex flex-col gap-6 px-5 py-8" data-testid="sprite-sheet">
      <h1 className="display text-3xl">hoja de sprites (desarrollo)</h1>
      <section className="flex items-end gap-6">
        <div className="flex flex-col items-center gap-2">
          <SpriteSvg look={PIBA_LOOK} size={130} label="la piba del IPA" />
          <span className="text-sm text-rana">la piba</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <SpriteSvg look={map.people[map.pibaIndex]!.look} size={130} label="la piba, en el mapa" />
          <span className="text-sm text-tinta-suave">ella en un mapa</span>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="display text-xl">señuelos</h2>
        <div className="flex flex-wrap items-end gap-6">
          {decoys.map((d) => (
            <div key={d.kind} className="flex flex-col items-center gap-2">
              <SpriteSvg look={d.look} size={104} />
              <span className="max-w-32 text-center text-xs text-tinta-suave">{d.kind.replaceAll("-", " ")}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="display text-xl">gente común</h2>
        <div className="flex flex-wrap items-end gap-4">
          {commons.map((p, i) => (
            <SpriteSvg key={i} look={p.look} size={78} />
          ))}
        </div>
      </section>
    </main>
  );
}
