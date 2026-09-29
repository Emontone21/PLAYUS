// Reloj de paso fijo con acumulador: convierte el tiempo real transcurrido en
// "hasta qué tick tiene que estar la simulación" y en la fracción del tick en
// curso (para dibujar interpolado). No sabe nada del juego: el bucle del juego
// avanza su simulación hasta `want` y dibuja con `alpha`.
//
// Si la pestaña estuvo en segundo plano, el acumulador pide ponerse al día de
// una (miles de ticks de aritmética entera son nada).

export interface TickClock {
  /** avanza el reloj hasta `now` (ms, performance.now) con un factor de velocidad (1 normal, 0,25 cámara lenta) */
  advance(now: number, rate?: number): { want: number; alpha: number };
}

export function createTickClock(ticksPerSecond: number, baseTick: number, startNow: number): TickClock {
  let simMs = 0;
  let last = startNow;
  return {
    advance(now, rate = 1) {
      simMs += Math.max(0, now - last) * rate;
      last = now;
      const exact = (simMs * ticksPerSecond) / 1000;
      const whole = Math.floor(exact);
      return { want: baseTick + whole, alpha: exact - whole };
    },
  };
}
