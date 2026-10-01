import { Avatar } from "@/components/avatar";
import { Crown } from "@/components/crown";
import { Colilla } from "@/components/colilla";
import { Frog } from "@/components/frog/Frog";
import type { Avatar as AvatarData } from "@/avatar/schema";

export interface RankingRow {
  profileId: string;
  name: string;
  avatar: AvatarData;
  rank: number;
  /** el número grande de la fila */
  value: number;
  unit?: string;
  /** si el juego formatea el puntaje (ej. "34,7 s"), el texto entero en lugar de value + unit */
  valueText?: string;
  /** el valor son colillas: lleva el ícono al lado */
  colillas?: boolean;
  /** texto chico a la derecha del valor (ej. "+25") */
  detail?: string;
  /** el detalle son colillas ganadas: lleva el ícono */
  detailColillas?: boolean;
  /** el color de la línea de la gráfica: un punto al lado del nombre */
  color?: string;
  /** subió o bajó de puesto respecto del día anterior */
  trend?: "up" | "down" | null;
  isMe: boolean;
  champion?: boolean;
  /** todavía no jugó: sin puesto ni puntaje, con la rana dormida */
  pending?: boolean;
}

// Pila de filas con divisor de 2px, no tarjetas. Tu fila lleva el borde
// izquierdo grueso en agua. El primer puesto va en luciérnaga; las colillas
// ganadas, en un chip.
export function Ranking({
  rows,
  emptyText,
  empty,
  testId = "ranking",
}: {
  rows: RankingRow[];
  emptyText: string;
  /** reemplaza al texto vacío por un bloque propio */
  empty?: React.ReactNode;
  testId?: string;
}) {
  if (rows.length === 0) {
    return empty ? <>{empty}</> : <p className="note">{emptyText}</p>;
  }
  return (
    <ol className="flex flex-col" data-testid={testId}>
      {rows.map((r) => (
        <li
          key={r.profileId}
          data-testid={r.pending ? "ranking-pending" : "ranking-row"}
          data-profile={r.profileId}
          data-rank={r.pending ? undefined : r.rank}
          data-trend={r.trend ?? undefined}
          className={`flex items-center gap-2 py-3 min-[420px]:gap-3 ${r.pending ? "opacity-80" : ""} ${
            r.isMe ? "-ml-5 bg-mi-fila pl-[14px] pr-2" : ""
          }`}
          style={{
            borderBottom: "2px solid var(--superficie-2)",
            ...(r.isMe ? { borderLeft: "6px solid var(--agua)", borderRadius: "0 14px 14px 0" } : {}),
          }}
        >
          <span className={`flex w-8 shrink-0 items-center justify-end gap-0.5 display text-xl ${r.rank === 1 && !r.pending ? "text-luciernaga" : r.pending ? "text-tinta-suave" : "text-tinta"}`}>
            {r.trend ? (
              <span className={`text-[10px] ${r.trend === "up" ? "text-rana" : "text-lengua"}`} role="img" aria-label={r.trend === "up" ? "subió" : "bajó"} data-testid="ranking-trend">
                {r.trend === "up" ? "▲" : "▼"}
              </span>
            ) : null}
            {r.pending ? "" : r.rank}
          </span>
          <Avatar avatar={r.avatar} name={r.name} size={36} />
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className={`truncate display-bold text-base min-[420px]:text-lg ${r.rank === 1 && !r.pending ? "display" : ""}`}>{r.name}</span>
            {r.color ? <span className="ml-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" data-testid="ranking-color" /> : null}
            {r.champion ? <Crown /> : null}
            {r.isMe ? <span className="ml-1 text-xs text-agua">vos</span> : null}
          </span>
          {r.pending ? (
            <span className="flex shrink-0 items-center gap-2 text-xs text-tinta-suave">
              todavía no
              <Frog pose="dormida" size={42} />
            </span>
          ) : (
            /* en pantallas angostas el puntaje achica un poco y el detalle va
               abajo, para que el nombre no quede en tres letras */
            <span className="flex shrink-0 flex-col items-end gap-1 min-[420px]:flex-row min-[420px]:items-baseline min-[420px]:gap-2">
              <span className={`display text-3xl min-[420px]:text-4xl ${r.rank === 1 ? "text-luciernaga" : ""}`} data-testid="ranking-value">
                {r.valueText ?? r.value}
                {!r.valueText && r.unit ? <span className="ml-0.5 text-xs text-tinta-suave min-[420px]:ml-1 min-[420px]:text-sm">{r.unit}</span> : null}
                {r.colillas ? <Colilla size={14} className="ml-1" /> : null}
              </span>
              {r.detail ? (
                <span className="chip-points inline-flex items-center gap-1">
                  {r.detail}
                  {r.detailColillas ? <Colilla size={11} /> : null}
                </span>
              ) : null}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
