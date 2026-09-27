"use client";

import * as React from "react";
import { frogPaths, NO_BLINK, type FrogColor, type FrogPose } from "./frog-grid";

export type { FrogColor, FrogPose } from "./frog-grid";

export interface FrogProps {
  pose?: FrogPose;
  /** lado en px (default 160) */
  size?: number;
  /** grados de rotación (default 0) */
  tilt?: number;
  color?: FrogColor;
  /** parpadeo y saltito (default true); se apagan solos con prefers-reduced-motion */
  animate?: boolean;
  /** borde blanco y sombra dura (default true) */
  sticker?: boolean;
  className?: string;
}

// La rana es decorativa: el SVG va con aria-hidden. Parpadea cada 3,4 a 4,6 s
// (160 ms con los ojos planos) con un desfase distinto por instancia, y salta
// un píxel de la grilla en pasos discretos. Con reducir movimiento, quieta y
// con los ojos abiertos.
export function Frog({ pose = "feliz", size = 160, tilt = 0, color = "#6CC24A", animate = true, sticker = true, className }: FrogProps) {
  const [blink, setBlink] = React.useState(false);
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const blinks = animate && !reduced && !NO_BLINK.has(pose);
  React.useEffect(() => {
    if (!blinks) {
      setBlink(false);
      return;
    }
    let alive = true;
    let open: number | undefined;
    let close: number | undefined;
    const schedule = (delay: number) => {
      open = window.setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        close = window.setTimeout(() => {
          if (!alive) return;
          setBlink(false);
          schedule(3400 + Math.random() * 1200);
        }, 160);
      }, delay);
    };
    schedule(Math.random() * 4000);
    return () => {
      alive = false;
      window.clearTimeout(open);
      window.clearTimeout(close);
    };
  }, [blinks]);

  const paths = React.useMemo(
    () => frogPaths(pose, color, { sticker, blink: blinks && blink }),
    [pose, color, sticker, blinks, blink],
  );
  const hop = animate && !reduced && pose !== "dormida";

  return (
    <span
      className={`inline-block shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size, transform: tilt ? `rotate(${tilt}deg)` : undefined }}
      data-frog={pose}
    >
      <svg
        viewBox="0 0 15 15"
        width={size}
        height={size}
        shapeRendering="crispEdges"
        aria-hidden="true"
        className={hop ? "frog-hop" : undefined}
        style={{ display: "block", opacity: pose === "dormida" ? 0.85 : 1, ["--frog-px" as string]: `${size / 15}px` }}
      >
        {paths.map((p) => (
          <path key={p.color} fill={p.color} d={p.d} />
        ))}
      </svg>
    </span>
  );
}
