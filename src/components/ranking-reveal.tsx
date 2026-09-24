"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Ranking, type RankingRow } from "@/components/ranking";

// El único movimiento coreografiado de la app: al volver de una partida, el
// ranking aparece como estaba (tu fila donde estaba antes, o abajo de todo
// si es tu primera) y las filas se reordenan con FLIP hasta su lugar nuevo.
// Con prefers-reduced-motion no hay animación: se muestra el orden final.

export const PREV_RANK_KEY = "playus-prev-rank";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function beforeOrder(rows: RankingRow[], myId: string): RankingRow[] {
  const others = rows.filter((r) => r.profileId !== myId);
  const me = rows.find((r) => r.profileId === myId);
  if (!me) return rows;
  let prev: number | null = null;
  try {
    const raw = sessionStorage.getItem(PREV_RANK_KEY);
    prev = raw ? Number(raw) : null;
  } catch {
    /* sin storage */
  }
  const index = prev && prev >= 1 ? Math.min(prev - 1, others.length) : others.length;
  return [...others.slice(0, index), me, ...others.slice(index)];
}

export function RankingReveal({ rows, myId, reveal }: { rows: RankingRow[]; myId: string; reveal: boolean }) {
  const [order, setOrder] = useState<RankingRow[]>(() => (reveal && !reducedMotion() ? beforeOrder(rows, myId) : rows));
  const [phase, setPhase] = useState<"before" | "after">(reveal && !reducedMotion() ? "before" : "after");
  const wrap = useRef<HTMLDivElement>(null);
  const first = useRef<Map<string, number>>(new Map());

  // filas nuevas del servidor (refresco en vivo) después del reveal: se toman tal cual
  useEffect(() => {
    if (phase === "after") setOrder(rows);
  }, [rows, phase]);

  // 1) medir dónde está cada fila en el orden viejo, y pasar al orden nuevo
  useEffect(() => {
    if (phase !== "before") return;
    const timer = setTimeout(() => {
      const el = wrap.current;
      if (!el) return;
      first.current = new Map(
        [...el.querySelectorAll<HTMLElement>("[data-profile]")].map((li) => [li.dataset.profile ?? "", li.getBoundingClientRect().top]),
      );
      setOrder(rows);
      setPhase("after");
      try {
        sessionStorage.removeItem(PREV_RANK_KEY);
        const url = new URL(window.location.href);
        url.searchParams.delete("reveal");
        window.history.replaceState(null, "", url.toString());
      } catch {
        /* nada */
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [phase, rows]);

  // 2) invertir la diferencia y dejar que la transición lleve cada fila a su lugar
  useLayoutEffect(() => {
    if (phase !== "after" || first.current.size === 0) return;
    const el = wrap.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>("[data-profile]")];
    for (const li of items) {
      const before = first.current.get(li.dataset.profile ?? "");
      if (before === undefined) continue;
      const delta = before - li.getBoundingClientRect().top;
      if (delta === 0) continue;
      li.style.transition = "none";
      li.style.transform = `translateY(${delta}px)`;
    }
    // forzar el layout antes de animar
    void el.offsetHeight;
    for (const li of items) {
      li.style.transition = "transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1)";
      li.style.transform = "";
    }
    first.current = new Map();
  }, [phase, order]);

  return (
    <div ref={wrap} data-testid="ranking-reveal" data-phase={phase}>
      <Ranking rows={order} emptyText="todavía no hay puntajes." />
    </div>
  );
}
