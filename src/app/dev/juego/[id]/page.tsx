import Link from "next/link";
import { notFound } from "next/navigation";
import { getGame } from "@/games";
import { devToolsAllowed } from "@/lib/admin";
import { DevGame } from "./dev-game";
import { MapPreview } from "@/games/piba-del-ipa/preview";
import { FacePreview } from "@/games/quedo-re-tarado/preview";
import { LarryDev } from "@/games/los-deseos-de-larry/dev";
import { RemarDev } from "@/games/remar-vuelve-a-casa/dev";
import { ParrillaDev } from "@/games/la-parrilla-del-bro/dev";
import { JotaDev } from "@/games/pegandole-al-jota/dev";
import { CaminandoDev } from "@/games/caminando-por-18/dev";
import { RastasDev } from "@/games/rastitas-rastotas/dev";
import { SunnyDev } from "@/games/pisteando-el-sunny/dev";
import { ParisDev } from "@/games/busca-los-paris/dev";
import { ColgadoDev } from "@/games/colgado-del-121/dev";
import { TorreDev } from "@/games/apila-las-boludeces/dev";
import { MayoDev } from "@/games/la-mayo/dev";
import { ServilaDev } from "@/games/servila-justa/dev";
import { ChinoDev } from "@/games/fumate-algo-chino/dev";
import { ClaseDev } from "@/games/clase-con-el-bro/dev";
import { HdpDev } from "@/games/hdp/dev";
import { CruzaDev } from "@/games/cruza-con-el-chino/dev";
import { RanaDev } from "@/games/cazando-colillas/dev";
import { TragoDev } from "@/games/dale-un-trago-al-pibe/dev";
import { LarryHdpDev } from "@/games/larry-en-la-hdp/dev";
import { AfilaDev } from "@/games/big-bro-afila/dev";
import { NachSaltaDev } from "@/games/nach-salta/dev";
import { BolsitaDev } from "@/games/la-bolsita-del-jota/dev";

// Prueba un juego sin servidor ni ronda. Libre en desarrollo; en producción,
// solo para el admin (decisión 238): para cualquier otra persona es 404.
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
  searchParams: Promise<{ seed?: string; map?: string; estado?: string; desde?: string; cajas?: string; lento?: string; x2?: string; donpasta?: string; coords?: string; redbull?: string; eje?: string; auto?: string; datos?: string; reposo?: string; libre?: string; prediccion?: string; todo?: string; resolver?: string; vertices?: string; areas?: string; camino?: string; solucion?: string }>;
}) {
  if (!(await devToolsAllowed())) notFound();
  const { id } = await params;
  const { seed = "dev", map, estado, desde, cajas, lento, x2, donpasta, coords, redbull, eje, auto, datos, reposo, libre, prediccion, todo, resolver, vertices, areas, camino, solucion } = await searchParams;
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
      ) : game.id === "los-deseos-de-larry" ? (
        <LarryDev seed={seed} from={Math.max(0, Math.min(89, Number(desde) || 0))} hitboxes={cajas === "1"} slow={lento === "1"} />
      ) : game.id === "la-bolsita-del-jota" ? (
        <BolsitaDev seed={seed} from={[1, 6, 10, 15].includes(Number(desde)) ? Number(desde) : 1} xray={cajas === "1"} slow={lento === "1"} />
      ) : game.id === "nach-salta" ? (
        <NachSaltaDev seed={seed} from={[0, 150, 400, 800].includes(Number(desde)) ? Number(desde) : 0} hitboxes={cajas === "1"} slow={lento === "1"} auto={auto === "1"} />
      ) : game.id === "big-bro-afila" ? (
        <AfilaDev seed={seed} from={Math.max(1, Math.min(8, Number(desde) || 1))} debug={cajas === "1"} slow={lento === "1"} auto={auto === "1"} />
      ) : game.id === "larry-en-la-hdp" ? (
        <LarryHdpDev seed={seed} from={Math.max(1, Math.min(30, Number(desde) || 1))} />
      ) : game.id === "dale-un-trago-al-pibe" ? (
        <TragoDev seed={seed} from={Math.max(1, Math.min(40, Number(desde) || 1))} solution={solucion === "1"} slow={lento === "1"} />
      ) : game.id === "cazando-colillas" ? (
        <RanaDev seed={seed} from={[0, 20, 40, 55].includes(Number(desde)) ? Number(desde) : 0} debug={cajas === "1"} slow={lento === "1"} auto={auto === "1"} />
      ) : game.id === "cruza-con-el-chino" ? (
        <CruzaDev seed={seed} from={[0, 10, 30, 60].includes(Number(desde)) ? Number(desde) : 0} hitboxes={cajas === "1"} path={camino === "1"} slow={lento === "1"} />
      ) : game.id === "hdp" ? (
        <HdpDev seed={seed} from={Math.max(0, Math.min(59, Number(desde) || 0))} quadrants={cajas === "1"} slow={lento === "1"} />
      ) : game.id === "clase-con-el-bro" ? (
        <ClaseDev seed={seed} from={Math.max(0, Math.min(2, Number(desde) || 0))} vertices={vertices === "1"} solver={resolver === "1"} areas={areas === "1"} />
      ) : game.id === "fumate-algo-chino" ? (
        <ChinoDev seed={seed} from={Math.max(0, Math.min(2, Number(desde) || 0))} fullPath={todo === "1"} debug={datos === "1"} solver={resolver === "1"} />
      ) : game.id === "servila-justa" ? (
        <ServilaDev seed={seed} from={Math.max(0, Math.min(7, Number(desde) || 0))} debug={datos === "1"} slow={lento === "1"} predict={prediccion === "1"} />
      ) : game.id === "la-mayo" ? (
        <MayoDev seed={seed} from={Math.max(0, Math.min(59, Number(desde) || 0))} debug={datos === "1"} slow={lento === "1"} />
      ) : game.id === "apila-las-boludeces" ? (
        <TorreDev seed={seed} colliders={cajas === "1"} rest={reposo === "1"} slow={lento === "1"} free={libre === "1"} />
      ) : game.id === "colgado-del-121" ? (
        <ColgadoDev seed={seed} from={Math.max(0, Math.min(119, Number(desde) || 0))} debug={datos === "1"} slow={lento === "1"} auto={auto === "1"} />
      ) : game.id === "busca-los-paris" ? (
        <ParisDev seed={seed} from={Math.max(1, Math.min(12, Number(desde) || 1))} />
      ) : game.id === "pisteando-el-sunny" ? (
        <SunnyDev seed={seed} from={Math.max(0, Math.min(5500, Number(desde) || 0))} overlay={eje === "1"} slow={lento === "1"} auto={auto === "1"} hitboxes={cajas === "1"} />
      ) : game.id === "rastitas-rastotas" ? (
        <RastasDev seed={seed} from={Math.max(0, Math.min(179, Number(desde) || 0))} coords={coords === "1"} slow={lento === "1"} redbull={redbull === "1"} />
      ) : game.id === "caminando-por-18" ? (
        <CaminandoDev seed={seed} from={Math.max(0, Math.min(119, Number(desde) || 0))} hitboxes={cajas === "1"} slow={lento === "1"} donpasta={donpasta === "1"} />
      ) : game.id === "pegandole-al-jota" ? (
        <JotaDev seed={seed} from={Math.max(1, Math.min(60, Number(desde) || 1))} />
      ) : game.id === "la-parrilla-del-bro" ? (
        <ParrillaDev seed={seed} from={Math.max(0, Math.min(89, Number(desde) || 0))} slow={lento === "1"} />
      ) : game.id === "remar-vuelve-a-casa" ? (
        <RemarDev seed={seed} from={Math.max(0, Math.min(2000, Number(desde) || 0))} hitboxes={cajas === "1"} slow={lento === "1"} x2={x2 === "1"} />
      ) : (
        <DevGame id={game.id} seed={seed} />
      )}
    </main>
  );
}
