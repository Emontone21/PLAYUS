// Captura de arrastre con un solo dedo: manda el primer puntero apoyado y los
// demás se ignoran hasta que ese se levanta. En escritorio vale el mouse con
// el botón izquierdo apretado. Sin estado de juego: cada movimiento del puntero
// que manda pasa por `toValue` (de coordenadas de pantalla a lo que el juego
// entienda) y se entrega en `onValue`.
//
// El elemento que recibe los handlers tiene que llevar touch-action: none y
// sin selección de texto ni menú contextual (eso queda en el componente).

import type * as React from "react";

export interface DragHandlers<E extends Element = HTMLDivElement> {
  onPointerDown: (e: React.PointerEvent<E>) => void;
  onPointerMove: (e: React.PointerEvent<E>) => void;
  onPointerUp: (e: React.PointerEvent<E>) => void;
  onPointerCancel: (e: React.PointerEvent<E>) => void;
  onLostPointerCapture: (e: React.PointerEvent<E>) => void;
}

export function singlePointerDrag<T, E extends Element = HTMLDivElement>(
  toValue: (clientX: number, clientY: number) => T,
  onValue: (value: T) => void,
  /** opcional: cuando el dedo se levanta (o el arrastre se cancela), con el último valor */
  onEnd?: (value: T) => void,
): DragHandlers<E> {
  let pointer: number | null = null;
  const up = (e: React.PointerEvent<E>) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onEnd?.(toValue(e.clientX, e.clientY));
  };
  return {
    onPointerDown(e) {
      e.preventDefault();
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (pointer !== null) return;
      pointer = e.pointerId;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      onValue(toValue(e.clientX, e.clientY));
    },
    onPointerMove(e) {
      if (e.pointerId !== pointer) return;
      onValue(toValue(e.clientX, e.clientY));
    },
    onPointerUp: up,
    onPointerCancel: up,
    onLostPointerCapture: up,
  };
}
