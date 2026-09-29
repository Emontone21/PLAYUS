// La serie de "pegándole al jota": una función pura que saca de la semilla
// del intento las 60 rondas (número, sustancia y cuánto se muestra la pista).
// Todo el grupo ve la misma serie en el mismo número de intento.

import { rngFromSeed } from "../../lib/rng";

export const DURATION_MS = 180_000;
/** rondas generadas de sobra */
export const ROUNDS = 60;
/** la pista: arranca en 3.000 ms y baja 200 por ronda, con piso de 700 */
export const DISPLAY_START_MS = 3_000;
export const DISPLAY_STEP_MS = 200;
export const DISPLAY_MIN_MS = 700;

export const SUBSTANCES = [
  { id: "marihuana", name: "marihuana" },
  { id: "hachis", name: "hachís" },
  { id: "merca", name: "merca" },
  { id: "tussi", name: "tussi" },
  { id: "cristal", name: "cristal" },
  { id: "extasis", name: "éxtasis" },
  { id: "lsd", name: "ácido" },
  { id: "hongos", name: "hongos" },
  { id: "ketamina", name: "keta" },
  { id: "popper", name: "popper" },
] as const;
export type SubstanceId = (typeof SUBSTANCES)[number]["id"];
export const SUBSTANCE_IDS: readonly SubstanceId[] = SUBSTANCES.map((s) => s.id);

export function isSubstance(id: unknown): id is SubstanceId {
  return typeof id === "string" && (SUBSTANCE_IDS as readonly string[]).includes(id);
}

export function substanceName(id: SubstanceId): string {
  return SUBSTANCES.find((s) => s.id === id)!.name;
}

export interface JotaRound {
  /** 1 en adelante */
  round: number;
  number: number;
  digits: number;
  substance: SubstanceId;
  displayMs: number;
}

/** cuántas cifras tiene el número de la ronda `round` (1 en adelante): 2, 3, 4, 5 y 6 desde la 13 */
export function digitsFor(round: number): number {
  return Math.min(6, 2 + Math.floor((round - 1) / 3));
}

export function displayMsFor(round: number): number {
  return Math.max(DISPLAY_MIN_MS, DISPLAY_START_MS - DISPLAY_STEP_MS * (round - 1));
}

/** trivial: todas las cifras iguales (11, 55.555) o redondo (1.000, 20.000) */
export function isTrivial(n: number, digits: number): boolean {
  const s = String(n);
  if (s.length !== digits) return true;
  if (/^(\d)\1*$/.test(s)) return true;
  if (n % 10 ** (digits - 1) === 0) return true;
  return false;
}

/** "2.450": separador de miles con punto, como se escribe acá */
export function formatNumber(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function jotaRounds(attemptSeed: string): JotaRound[] {
  const rng = rngFromSeed(`${attemptSeed}:jota`);
  const out: JotaRound[] = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const digits = digitsFor(r);
    const lo = 10 ** (digits - 1);
    const hi = 10 ** digits - 1;
    let n = rng.int(lo, hi);
    while (isTrivial(n, digits)) n = rng.int(lo, hi);
    out.push({ round: r, number: n, digits, substance: rng.pick(SUBSTANCE_IDS), displayMs: displayMsFor(r) });
  }
  return out;
}
