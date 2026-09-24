import { initials, type ProvisionalAvatar } from "@/lib/avatar";

// Avatar provisorio: círculo de color con iniciales. Es un SVG para que en la
// etapa 3 se reemplace por las piezas sin cambiar quién lo usa.
export function Avatar({
  avatar,
  name,
  size = 40,
}: {
  avatar: ProvisionalAvatar;
  name: string;
  size?: number;
}) {
  const dark = isLight(avatar.bg);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={name || "avatar"}
      className="shrink-0"
    >
      <circle cx="20" cy="20" r="20" fill={avatar.bg} />
      <text
        x="20"
        y="21"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="16"
        fontWeight="800"
        fill={dark ? "#1b1a2e" : "#f5f3ff"}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {initials(name)}
      </text>
    </svg>
  );
}

function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}
