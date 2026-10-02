// Rotación virtual para los juegos que se juegan en horizontal. No depende
// del sistema (screen.orientation.lock no anda en iPhone y la app sigue
// siendo vertical para todo lo demás): si el juego pide 'landscape' y la
// pantalla está en vertical, el contenedor rota 90° toda el área de juego con
// CSS, y las coordenadas del puntero se pasan al sistema que ve el jugador
// con `toLogical`. Funciones puras, sin DOM.

export type Orientation = "portrait" | "landscape";

/** cómo está puesta el área de juego respecto de la pantalla física */
export interface RotationFrame {
  /** el área está rotada 90° (el jugador tiene el teléfono de costado) */
  rotated: boolean;
  /** ancho físico de la ventana, en px CSS */
  vw: number;
  /** alto físico de la ventana, en px CSS */
  vh: number;
}

export const UPRIGHT: RotationFrame = { rotated: false, vw: 0, vh: 0 };

/** rota solo un juego 'landscape' en una ventana más alta que ancha */
export function shouldRotate(orientation: Orientation | undefined, vw: number, vh: number): boolean {
  return orientation === "landscape" && vh > vw;
}

export function frameFor(orientation: Orientation | undefined, vw: number, vh: number): RotationFrame {
  return { rotated: shouldRotate(orientation, vw, vh), vw, vh };
}

/** el tamaño del área tal como la ve el jugador */
export function logicalSize(f: RotationFrame): { width: number; height: number } {
  return f.rotated ? { width: f.vh, height: f.vw } : { width: f.vw, height: f.vh };
}

/**
 * De la pantalla física al sistema rotado. El área rotada tiene su esquina
 * superior izquierda en la esquina superior derecha física: el teléfono se
 * gira con la parte de arriba hacia la izquierda, así que el eje y físico
 * (hacia abajo) es el x del jugador (hacia la derecha), y el x físico (hacia
 * la derecha) es el y del jugador hacia arriba.
 */
export function toLogical(x: number, y: number, f: RotationFrame): { x: number; y: number } {
  return f.rotated ? { x: y, y: f.vw - x } : { x, y };
}

/** la inversa: del sistema rotado a la pantalla física (para los tests y el E2E) */
export function toPhysical(x: number, y: number, f: RotationFrame): { x: number; y: number } {
  return f.rotated ? { x: f.vw - y, y: x } : { x, y };
}

/** los estilos del área rotada: ocupa la ventana entera, girada 90° con el origen arriba a la izquierda */
export function rotatedStyle(f: RotationFrame): { width: number; height: number; transformOrigin: string; transform: string } {
  // translateY(-vw) y después rotate(90°): la esquina (0, 0) lógica va a (vw, 0) física
  return { width: f.vh, height: f.vw, transformOrigin: "0 0", transform: `rotate(90deg) translateY(-${f.vw}px)` };
}
