import { Avatar } from "@/components/avatar";
import { Crown } from "@/components/crown";
import type { Avatar as AvatarData } from "@/avatar/schema";

export interface RankingRow {
  profileId: string;
  name: string;
  avatar: AvatarData;
  rank: number;
  /** el número grande de la fila */
  value: number;
  unit?: string;
  /** texto chico a la derecha del valor (ej. "+10") */
  detail?: string;
  isMe: boolean;
  champion?: boolean;
}

// Pila de filas con línea divisoria, no tarjetas. Tu fila lleva el borde
// izquierdo grueso en agua. Los puestos se distinguen por peso y color.
export function Ranking({ rows, emptyText, testId = "ranking" }: { rows: RankingRow[]; emptyText: string; testId?: string }) {
  if (rows.length === 0) {
    return <p className="note">{emptyText}</p>;
  }
  return (
    <ol className="flex flex-col" data-testid={testId}>
      {rows.map((r) => (
        <li
          key={r.profileId}
          data-testid="ranking-row"
          data-profile={r.profileId}
          data-rank={r.rank}
          className={`flex items-center gap-3 border-b border-superficie bg-fondo py-3 ${
            r.isMe ? "-ml-5 border-l-4 border-l-agua pl-4" : ""
          }`}
        >
          <span
            className={`w-7 text-right display text-xl ${
              r.rank === 1 ? "text-oro" : r.rank <= 3 ? "text-tinta" : "text-tinta-suave"
            }`}
          >
            {r.rank}
          </span>
          <Avatar avatar={r.avatar} name={r.name} size={36} />
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className={`truncate text-lg ${r.rank === 1 ? "font-extrabold" : "font-bold"}`}>{r.name}</span>
            {r.champion ? <Crown /> : null}
            {r.isMe ? <span className="ml-1 text-xs text-agua">vos</span> : null}
          </span>
          <span className="flex items-baseline gap-2">
            <span className="display text-4xl" data-testid="ranking-value">
              {r.value}
              {r.unit ? <span className="ml-1 text-sm text-tinta-suave">{r.unit}</span> : null}
            </span>
            {r.detail ? <span className="text-right text-xs text-tinta-suave">{r.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
