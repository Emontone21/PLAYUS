import type * as React from "react";

// Contrato de juegos. Un juego nuevo es un archivo en src/games/ que exporta
// un GameModule, más una línea en src/games/index.ts. Nada más del sistema se
// toca. Leé src/games/README.md antes de escribir uno.

export type ScoringDirection = "high" | "low";

export interface GameModule {
  /** slug estable, nunca cambia: queda guardado en la base (rounds.game_id) */
  id: string;
  name: string;
  /** una línea, se muestra en la pantalla previa */
  tagline: string;
  /** 2 o 3 instrucciones cortas */
  howTo: string[];
  /** duración fija de la partida en ms; el contenedor corta cuando se acaba */
  durationMs: number;
  /**
   * duración mínima plausible en ms para un juego que termina antes por su
   * cuenta (ej. reflejo). Si falta, vale durationMs - 2000.
   */
  minDurationMs?: number;
  /** 'high' = gana el puntaje más alto; 'low' = gana el más bajo (ej. tiempo de reacción) */
  scoring: ScoringDirection;
  /** cota de plausibilidad para validación en servidor */
  maxPlausibleScore: number;
  /** cota inferior (ej. nadie reacciona en menos de 100 ms). Si falta, 0. */
  minPlausibleScore?: number;
  /**
   * validador propio sobre los eventos. Devuelve false para rechazar.
   * El servidor lo llama después de las cotas. Opcional.
   */
  validate?: (result: GameResult, seed: string) => boolean;
  Component: React.ComponentType<GameProps>;
}

export interface GameProps {
  /** determinístico: todos los del grupo reciben la misma semilla ese día */
  seed: string;
  /** el juego avisa que terminó de cargar; recién ahí arranca el cronómetro */
  onReady: () => void;
  /** el juego terminó por su cuenta (antes del límite de tiempo) */
  onFinish: (result: GameResult) => void;
  /**
   * el juego informa su resultado parcial cada vez que cambia. Cuando el
   * contenedor corta por tiempo, usa el último parcial informado. Un juego
   * que puede ser cortado por tiempo tiene que llamarlo; uno que siempre
   * termina antes (reflejo) puede ignorarlo.
   */
  onProgress: (result: GameResult) => void;
}

export interface GameResult {
  score: number;
  /** traza mínima para validar en el servidor; el shape lo define cada juego */
  events: unknown[];
}

/** Límites efectivos con los defaults aplicados. Lo usa el servidor en /finish. */
export function gameLimits(game: GameModule) {
  return {
    minDurationMs: game.minDurationMs ?? game.durationMs - 2000,
    maxDurationMs: game.durationMs + 10_000,
    minScore: game.minPlausibleScore ?? 0,
    maxScore: game.maxPlausibleScore,
  };
}
