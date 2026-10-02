// Deslizamientos con un solo dedo (el detector de "rastitas rastotas",
// compartido): manda el primer puntero apoyado; cada vez que se mueve 24 px
// desde el último punto de referencia en el eje dominante cuenta un
// deslizamiento en esa dirección, y se encadena sin soltar. En escritorio
// vale el mouse con el botón izquierdo. El elemento que recibe los handlers
// tiene que llevar touch-action: none y sin selección de texto.

import type * as React from "react";

export type SwipeDir = "up" | "down" | "left" | "right";

export interface SwipeHandlers<E extends Element = HTMLDivElement> {
  onPointerDown: (e: React.PointerEvent<E>) => void;
  onPointerMove: (e: React.PointerEvent<E>) => void;
  onPointerUp: (e: React.PointerEvent<E>) => void;
  onPointerCancel: (e: React.PointerEvent<E>) => void;
  onLostPointerCapture: (e: React.PointerEvent<E>) => void;
}

export const SWIPE_PX = 24;

/**
 * `onSwipe` recibe cada deslizamiento. Con `axis: "horizontal"` solo cuentan
 * los que van más a lo ancho que a lo alto (los verticales se ignoran, pero
 * igual mueven el punto de referencia).
 */
export function swipeHandlers<E extends Element = HTMLDivElement>(onSwipe: (dir: SwipeDir) => void, opts: { px?: number; axis?: "both" | "horizontal" } = {}): SwipeHandlers<E> {
  const px = opts.px ?? SWIPE_PX;
  const axis = opts.axis ?? "both";
  let pointer: { id: number; x: number; y: number } | null = null;
  const up = (e: React.PointerEvent<E>) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    pointer = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return {
    onPointerDown(e) {
      e.preventDefault();
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (pointer !== null) return;
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove(e) {
      const p = pointer;
      if (!p || e.pointerId !== p.id) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (Math.abs(dx) < px && Math.abs(dy) < px) return;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      p.x = e.clientX;
      p.y = e.clientY;
      if (!horizontal && axis === "horizontal") return;
      onSwipe(horizontal ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    },
    onPointerUp: up,
    onPointerCancel: up,
    onLostPointerCapture: up,
  };
}
