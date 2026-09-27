// Nenúfar decorativo: un círculo al que le falta una cuña. Va detrás del
// contenido, grande y recortado contra el borde. El contenedor tiene que ser
// `relative isolate overflow-x-clip`.
export function Lily({ size = 260, className = "", style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={`pointer-events-none absolute -z-10 ${className}`}
      style={style}
    >
      <path d="M60 60 L119.1 49.6 A60 60 0 1 1 109.1 25.6 Z" fill="var(--decoracion)" />
    </svg>
  );
}

// Nenúfar chico, en línea (por ejemplo al lado de un texto de estado vacío).
export function LilyInline({ size = 28, color = "var(--punteado)" }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 120" width={size} height={size} className="shrink-0">
      <path d="M60 60 L119.1 49.6 A60 60 0 1 1 109.1 25.6 Z" fill={color} />
    </svg>
  );
}

// El mini nenúfar de 26×12 que corona la pestaña activa.
export function LilyTab() {
  return (
    <svg aria-hidden="true" viewBox="0 0 26 12" width={26} height={12} className="block">
      <path d="M13 6 L25.6 4.4 A12.6 6 0 1 1 24.4 2.2 Z" fill="var(--rana)" />
    </svg>
  );
}
