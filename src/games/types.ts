import type * as React from "react";
import type { Orientation } from "./lib/orientation";

// Contrato de juegos. Un juego nuevo es un archivo en src/games/ que exporta
// un GameModule, más una línea en src/games/index.ts. Nada más del sistema se
// toca. Leé src/games/README.md antes de escribir uno.

export type ScoringDirection = "high" | "low";
export type { Orientation };

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
   * cuenta. Si falta, vale durationMs - 2000.
   */
  minDurationMs?: number;
  /** 'high' = gana el puntaje más alto; 'low' = gana el más bajo (ej. milisegundos) */
  scoring: ScoringDirection;
  /** cota de plausibilidad para validación en servidor */
  maxPlausibleScore: number;
  /** cota inferior (ej. nadie reacciona en menos de 100 ms). Si falta, 0. */
  minPlausibleScore?: number;
  /**
   * unidad del puntaje, para el ranking, el historial y los avisos (ej. "m").
   * Si falta, los juegos de 'low' muestran "ms" y los de 'high' nada.
   */
  unit?: string;
  /**
   * Cómo se muestra el puntaje cuando el número crudo no alcanza (ej. ms que
   * se muestran como "34,7 s"). Devuelve el texto entero, con la unidad. Si
   * falta, se muestra el número y `unit`.
   */
  formatScore?: (score: number) => string;
  /**
   * validador propio sobre los eventos. Devuelve false para rechazar.
   * El servidor lo llama después de las cotas, con la semilla del intento y
   * la duración real del intento medida en el servidor (desde /start, con la
   * cuenta regresiva incluida). Puede devolver una promesa (un juego que
   * necesita cargar un motor, como la torre con Rapier). Opcional.
   */
  validate?: (result: GameResult, seed: string, meta?: { elapsedMs: number }) => boolean | Promise<boolean>;
  /**
   * el puntaje recalculado desde la traza con la semilla, o null si no se
   * puede. Solo lo usa el panel de admin para mostrar qué recalcula el
   * servidor al probar un juego. Opcional.
   */
  recomputeScore?: (result: GameResult, seed: string) => number | null;
  /**
   * 'landscape' si el juego se juega con el teléfono de costado. El
   * contenedor rota 90° el área de juego (con su cronómetro) cuando la
   * pantalla está en vertical, avisa "girá el teléfono" en la cuenta
   * regresiva, y el juego pasa sus punteros por `useLogicalPointer`
   * (games/lib/orientation-context). La previa y el resultado siguen en
   * vertical. Default 'portrait'.
   */
  orientation?: Orientation;
  /**
   * de quién depende la semilla del intento. 'group' (default): todos los del
   * grupo reciben la misma en el mismo número de intento. 'player': cada
   * jugador recibe una distinta (el servidor suma su profile_id al hash en
   * /start, /finish y validate; el juego sigue recibiendo solo una semilla).
   * Con 'player' se resigna la igualdad exacta entre jugadores, así que el
   * generador del juego tiene que controlar la dificultad (decisión 265).
   */
  seedScope?: "group" | "player";
  /**
   * true si mientras se juega el área ocupa la ventana entera, de borde a
   * borde (sin la marca, los márgenes de la página ni la barra de pestañas),
   * fija para que la página no se desplace. Lo usan los juegos que necesitan
   * todo el lugar posible (ej. el estacionamiento de "Saca el Sunny").
   * Default false.
   */
  fullscreen?: boolean;
  Component: React.ComponentType<GameProps>;
  /**
   * bloque extra para la pantalla previa (ej. la ficha "así es ella"). El
   * contenedor lo muestra debajo de las instrucciones. Opcional.
   */
  Intro?: React.ComponentType<{ seed?: string }>;
  /**
   * pantalla de resultado propia (ej. "18,4 s" con la cara final). Si falta,
   * el contenedor muestra el puntaje grande. Opcional.
   */
  Result?: React.ComponentType<{ result: GameResult; seed: string; cutByTimer: boolean }>;
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
   * termina antes puede ignorarlo.
   */
  onProgress: (result: GameResult) => void;
}

export interface GameResult {
  score: number;
  /** traza mínima para validar en el servidor; el shape lo define cada juego */
  events: unknown[];
}

/** El puntaje como texto, con su unidad: lo que ve el jugador en el ranking, en Hoy y en los avisos. */
export function scoreText(game: Pick<GameModule, "scoring" | "unit" | "formatScore"> | undefined, score: number): string {
  if (game?.formatScore) return game.formatScore(score);
  const u = scoreUnit(game);
  return u ? `${score} ${u}` : `${score}`;
}

/** La unidad que se muestra junto al puntaje ("" si no lleva). */
export function scoreUnit(game: Pick<GameModule, "scoring" | "unit"> | undefined): string {
  if (!game) return "";
  return game.unit ?? (game.scoring === "low" ? "ms" : "");
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
