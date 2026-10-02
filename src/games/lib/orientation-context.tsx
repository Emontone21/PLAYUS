// El contenedor publica cómo está puesta el área de juego; un juego
// 'landscape' pasa sus punteros por `useLogicalPointer` y trabaja en el
// sistema que ve el jugador. Hooks como React.useX (decisión 8).

import * as React from "react";
import { toLogical, UPRIGHT, type RotationFrame } from "./orientation";

// El contexto se crea recién cuando alguien lo pide: los módulos de juego los
// importa también el servidor (para validate), y ahí createContext no existe.
let ctx: React.Context<RotationFrame> | null = null;
export function rotationContext(): React.Context<RotationFrame> {
  ctx ??= React.createContext<RotationFrame>(UPRIGHT);
  return ctx;
}

export function useRotationFrame(): RotationFrame {
  return React.useContext(rotationContext());
}

/** clientX/clientY físicos → coordenadas del sistema rotado (identidad si no hay rotación) */
export function useLogicalPointer(): (e: { clientX: number; clientY: number }) => { x: number; y: number } {
  const f = React.useContext(rotationContext());
  return React.useCallback((e: { clientX: number; clientY: number }) => toLogical(e.clientX, e.clientY, f), [f]);
}
