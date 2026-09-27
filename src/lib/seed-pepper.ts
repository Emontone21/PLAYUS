// Secreto del servidor que entra en la semilla de cada intento (decisión 105).
// Sin él, un integrante podría calcular la semilla de su próximo intento
// antes de empezarlo: la semilla de la ronda es legible vía RLS y el hash es
// público. En producción es obligatorio; en desarrollo y tests vale un fijo.
//
// No se cambia nunca salvo que se filtre: cambiarlo a mitad de un día les da
// tableros distintos a los que juegan antes y después. Si hay que cambiarlo,
// justo después de medianoche.

export const DEV_SEED_PEPPER = "dev-pepper";

export class SeedPepperMissingError extends Error {
  constructor() {
    super("falta SEED_PEPPER en el servidor: las partidas no pueden empezar hasta configurarla.");
    this.name = "SeedPepperMissingError";
  }
}

export function seedPepper(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.SEED_PEPPER?.trim();
  if (value) return value;
  if (env.NODE_ENV === "production") throw new SeedPepperMissingError();
  return DEV_SEED_PEPPER;
}
