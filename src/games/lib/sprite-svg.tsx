// Un sprite como SVG nítido, para las pantallas previa y de resultado (fuera
// del canvas). Hooks no hay: es un componente puro.

import type { Sprite } from "./sprites";

export function SpriteSvg({ sprite, height, label }: { sprite: Sprite; height: number; label?: string }) {
  return (
    <svg
      viewBox={`0 0 ${sprite.w} ${sprite.h}`}
      width={(height * sprite.w) / sprite.h}
      height={height}
      shapeRendering="crispEdges"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {sprite.px.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={1} height={1} fill={p.c} />
      ))}
    </svg>
  );
}
