// Aleatoriedad determinística. Todo lo "al azar" de un juego sale de acá:
// hash32 convierte la semilla (string) en un entero de 32 bits y mulberry32
// genera números en [0, 1) a partir de ese entero. Dos jugadores con la
// misma semilla ven exactamente la misma secuencia.

/** FNV-1a de 32 bits con una mezcla final. Estable: no cambiarlo nunca. */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // avalancha final para que semillas parecidas no den estados parecidos
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** hash32 en hexadecimal de 8 caracteres; sirve para semillas legibles. */
export function hashHex(input: string): string {
  return hash32(input).toString(16).padStart(8, "0");
}

/** PRNG mulberry32: rápido, 32 bits de estado, devuelve números en [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** número en [0, 1) */
  next: () => number;
  /** entero en [min, max], ambos incluidos */
  int: (min: number, max: number) => number;
  /** número en [min, max) */
  range: (min: number, max: number) => number;
  /** un elemento del arreglo */
  pick: <T>(items: readonly T[]) => T;
  /** copia barajada (Fisher–Yates) */
  shuffle: <T>(items: readonly T[]) => T[];
}

/** Generador completo a partir de una semilla string. */
export function rngFromSeed(seed: string): Rng {
  const next = mulberry32(hash32(seed));
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    pick: (items) => items[Math.floor(next() * items.length)] as (typeof items)[number],
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]];
      }
      return out;
    },
  };
}
