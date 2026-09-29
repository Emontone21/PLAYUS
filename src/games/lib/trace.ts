// La traza de una simulación a paso fijo controlada con el dedo: los cambios
// de objetivo (desde el tick `tick`, el objetivo es `x`) más un cierre con el
// tick en que terminó la partida. Acá vive la parte que no depende del juego:
// grabar los cambios, revisar la forma de la traza y comprobar que el tick de
// fin cierra con la duración real del intento. Volver a jugar la partida es de
// cada juego.

/** un cambio de objetivo: desde el tick `tick`, el objetivo es `x` (unidades enteras) */
export type InputEvent = { tick: number; x: number };
/** cierra la traza: el tick en que terminó la partida (o en que la cortó el cronómetro) */
export type EndEvent = { tick: number; fin: true };
export type TraceEvent = InputEvent | EndEvent;

export type TraceShape = { ok: true; inputs: InputEvent[]; endTick: number } | { ok: false; reason: string };

/**
 * Revisa la forma de la traza: un arreglo no vacío de entradas bien armadas,
 * con ticks estrictamente crecientes, anteriores al cierre y con `x` dentro
 * de [0, fieldW], y un cierre en (0, maxTick].
 */
export function parseTrace(events: unknown, fieldW: number, maxTick: number): TraceShape {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, reason: "traza mal armada" };
  if (events.length > maxTick + 1) return { ok: false, reason: "traza demasiado larga" };
  const last = events[events.length - 1] as Partial<EndEvent> | null;
  if (!last || typeof last !== "object" || last.fin !== true || !Number.isInteger(last.tick)) return { ok: false, reason: "falta el cierre de la traza" };
  const endTick = last.tick as number;
  if (endTick < 1 || endTick > maxTick) return { ok: false, reason: "tick de fin fuera de rango" };
  const inputs: InputEvent[] = [];
  let prev = -1;
  for (let i = 0; i < events.length - 1; i++) {
    const e = events[i] as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || !Number.isInteger(e.tick) || !Number.isInteger(e.x) || "fin" in e) return { ok: false, reason: "entrada mal armada" };
    const tick = e.tick as number;
    const x = e.x as number;
    if (tick <= prev) return { ok: false, reason: "ticks fuera de orden" };
    if (tick >= endTick) return { ok: false, reason: "entrada después del final" };
    if (x < 0 || x > fieldW) return { ok: false, reason: "x fuera del campo" };
    prev = tick;
    inputs.push({ tick, x });
  }
  return { ok: true, inputs, endTick };
}

/**
 * El tick de fin contra la duración real del intento (medida en el servidor):
 * la partida no pudo durar más que el intento, ni el intento mucho más que la
 * partida. Devuelve el motivo del rechazo, o null si cierra.
 */
export function elapsedMismatch(endTick: number, ticksPerSecond: number, elapsedMs: number, slackMs: number): string | null {
  const endMs = Math.floor((endTick * 1000) / ticksPerSecond);
  if (endMs > elapsedMs) return "la partida duró más que el intento";
  if (elapsedMs > endMs + slackMs) return "el intento duró mucho más que la partida";
  return null;
}

/** Graba los cambios de objetivo: solo cuando el objetivo cambia de verdad. */
export class TraceRecorder {
  readonly inputs: InputEvent[] = [];
  constructor(private current: number) {}
  /** anota `x` como objetivo desde `tick` si es distinto del vigente; devuelve el objetivo vigente */
  set(tick: number, x: number): number {
    if (x !== this.current) {
      this.inputs.push({ tick, x });
      this.current = x;
    }
    return this.current;
  }
  get target(): number {
    return this.current;
  }
  /** la traza completa, con el cierre */
  events(endTick: number): TraceEvent[] {
    return [...this.inputs, { tick: endTick, fin: true }];
  }
}

/** el objetivo vigente en `tick` según una lista de entradas ordenadas (avanza el cursor `k`) */
export function targetAt(inputs: readonly InputEvent[], tick: number, cursor: { k: number; target: number }): number {
  while (cursor.k < inputs.length && inputs[cursor.k]!.tick <= tick) cursor.target = inputs[cursor.k++]!.x;
  return cursor.target;
}
