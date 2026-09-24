import { z } from "zod";
import { BG_COLORS, HAIR_COLORS, SKIN_COLORS } from "./palette";

// El avatar se guarda como jsonb en profiles.avatar con esta forma:
// { base, skin, hair, hairColor, eyes, mouth, accessory, bg }
// Los ids numéricos son 1-based y estables: se corresponden con las piezas
// de src/avatar/pieces.tsx. Nunca se reordenan las piezas existentes.

export const BASE_COUNT = 6;
export const HAIR_COUNT = 8;
export const EYES_COUNT = 6;
export const MOUTH_COUNT = 6;
export const ACCESSORY_COUNT = 6;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = (max: number) => z.number().int().min(1).max(max);

// Estricto: para guardar.
export const avatarSchema = z.object({
  base: id(BASE_COUNT),
  skin: hex,
  hair: id(HAIR_COUNT),
  hairColor: hex,
  eyes: id(EYES_COUNT),
  mouth: id(MOUTH_COUNT),
  accessory: id(ACCESSORY_COUNT).nullable(),
  bg: hex,
});

export type Avatar = z.infer<typeof avatarSchema>;

export const DEFAULT_AVATAR: Avatar = {
  base: 1,
  skin: SKIN_COLORS[3],
  hair: 2,
  hairColor: HAIR_COLORS[1],
  eyes: 1,
  mouth: 1,
  accessory: null,
  bg: BG_COLORS[0],
};

// Tolerante: para leer. Cada campo que falte o esté mal cae a su default,
// así los perfiles de la etapa 2 (que solo tenían `bg`) siguen dibujándose.
const lenientSchema = z.object({
  base: id(BASE_COUNT).catch(DEFAULT_AVATAR.base),
  skin: hex.catch(DEFAULT_AVATAR.skin),
  hair: id(HAIR_COUNT).catch(DEFAULT_AVATAR.hair),
  hairColor: hex.catch(DEFAULT_AVATAR.hairColor),
  eyes: id(EYES_COUNT).catch(DEFAULT_AVATAR.eyes),
  mouth: id(MOUTH_COUNT).catch(DEFAULT_AVATAR.mouth),
  accessory: id(ACCESSORY_COUNT).nullable().catch(null),
  bg: hex.catch(DEFAULT_AVATAR.bg),
});

export function parseAvatar(value: unknown): Avatar {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return lenientSchema.parse(source);
}

// Para un usuario nuevo: uno al azar, que dé ganas de tocar.
export function randomAvatar(random: () => number = Math.random): Avatar {
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(random() * arr.length)] as T;
  const upto = (n: number) => 1 + Math.floor(random() * n);
  return {
    base: upto(BASE_COUNT),
    skin: pick(SKIN_COLORS),
    hair: upto(HAIR_COUNT),
    hairColor: pick(HAIR_COLORS),
    eyes: upto(EYES_COUNT),
    mouth: upto(MOUTH_COUNT),
    accessory: random() < 0.4 ? upto(ACCESSORY_COUNT) : null,
    bg: pick(BG_COLORS),
  };
}

// Para las pantallas de alta: si el perfil todavía no tiene avatar (jsonb
// vacío), arranca con uno al azar; si tiene, lo respeta.
export function avatarFromProfile(value: unknown): Avatar {
  const empty = !value || typeof value !== "object" || Object.keys(value as object).length === 0;
  return empty ? randomAvatar() : parseAvatar(value);
}
