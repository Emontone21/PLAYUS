import type { Avatar } from "./schema";
import { ACCESSORIES, BASES, EYES, HAIRS, MOUTHS } from "./pieces";

// Dibuja un avatar completo. Sirve en servidor y en cliente. El atributo
// data-avatar lleva el JSON normalizado: sirve para comparar en los tests que
// el mismo avatar se ve igual en dos navegadores.
export function AvatarSvg({
  avatar,
  size = 40,
  label,
  className,
}: {
  avatar: Avatar;
  size?: number;
  label?: string;
  className?: string;
}) {
  const Base = BASES[avatar.base - 1]?.Piece ?? BASES[0]!.Piece;
  const Hair = HAIRS[avatar.hair - 1]?.Piece ?? HAIRS[0]!.Piece;
  const Eyes = EYES[avatar.eyes - 1]?.Piece ?? EYES[0]!.Piece;
  const Mouth = MOUTHS[avatar.mouth - 1]?.Piece ?? MOUTHS[0]!.Piece;
  const Accessory = avatar.accessory ? ACCESSORIES[avatar.accessory - 1]?.Piece : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={label ?? "avatar"}
      className={className}
      data-avatar={JSON.stringify(avatar)}
    >
      <circle cx="50" cy="50" r="50" fill={avatar.bg} />
      <Base color={avatar.skin} />
      <Eyes />
      <Mouth />
      <Hair color={avatar.hairColor} />
      {Accessory ? <Accessory /> : null}
    </svg>
  );
}
