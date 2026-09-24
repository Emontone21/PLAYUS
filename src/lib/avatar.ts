import type { Json } from "@/lib/supabase/types";

// Avatar provisorio de la etapa 2: solo un color de fondo, y se dibujan las
// iniciales del nombre. La etapa 3 lo reemplaza por piezas SVG; la clave `bg`
// se mantiene, así los perfiles creados ahora siguen valiendo.

export const AVATAR_BACKGROUNDS = [
  "#FFC94A",
  "#FF5C8A",
  "#5BC0BE",
  "#8B7CF6",
  "#F97316",
  "#22C55E",
  "#38BDF8",
  "#F5F3FF",
] as const;

export type ProvisionalAvatar = {
  bg: string;
}

export function parseAvatar(value: Json | null | undefined): ProvisionalAvatar {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const bg = value.bg;
    if (typeof bg === "string" && /^#[0-9a-fA-F]{6}$/.test(bg)) {
      return { bg };
    }
  }
  return { bg: AVATAR_BACKGROUNDS[0] };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}
