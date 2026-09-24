import { AvatarSvg } from "@/avatar/avatar-svg";
import type { Avatar as AvatarData } from "@/avatar/schema";

// Envoltorio con el nombre para el aria-label. El dibujo vive en src/avatar.
export function Avatar({ avatar, name, size = 40 }: { avatar: AvatarData; name: string; size?: number }) {
  return <AvatarSvg avatar={avatar} size={size} label={name ? `avatar de ${name}` : "avatar"} className="shrink-0" />;
}
