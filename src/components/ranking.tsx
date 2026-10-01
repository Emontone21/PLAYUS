import { Avatar } from "@/components/avatar";
import { Crown } from "@/components/crown";
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
  /** texto chico a la derecha del valor (ej. "+10") */
  detail?: string;
  isMe: boolean;
  champion?: boolean;
  /** todavía no jugó: sin puesto ni puntaje, con la rana dormida */
  pending?: boolean;
}

// Pila de filas con divisor de 2px, no tarjetas. Tu fila lleva el borde
// izquierdo grueso en agua. El primer puesto va en luciérnaga; los puntos
// ganados, en un chip.
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
          className={`flex items-center gap-2 py-3 min-[420px]:gap-3 ${r.pending ? "opacity-80" : ""} ${
            r.isMe ? "-ml-5 bg-mi-fila pl-[14px] pr-2" : ""
          }`}
          style={{
            borderBottom: "2px solid var(--superficie-2)",
            ...(r.isMe ? { borderLeft: "6px solid var(--agua)", borderRadius: "0 14px 14px 0" } : {}),
          }}
        >
          <span className={`w-7 text-right display text-xl ${r.rank === 1 && !r.pending ? "text-luciernaga" : r.pending ? "text-tinta-suave" : "text-tinta"}`}>
            {r.pending ? "" : r.rank}
          </span>
          <Avatar avatar={r.avatar} name={r.name} size={36} />
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className={`truncate display-bold text-base min-[420px]:text-lg ${r.rank === 1 && !r.pending ? "display" : ""}`}>{r.name}</span>
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
              </span>
              {r.detail ? <span className="chip-points">{r.detail}</span> : null}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
