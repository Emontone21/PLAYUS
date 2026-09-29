// Escalado entero del canvas de pixel art: cuántos píxeles del dispositivo por
// unidad lógica entran en un espacio dado, y cómo dejar el <canvas> con ese
// tamaño (píxeles reales por dentro, CSS por fuera) sin que se vea borroso.

/** píxeles del dispositivo por unidad lógica que entran en un espacio dado (mínimo 1) */
export function integerScale(cssWidth: number, cssHeight: number, dpr: number, fieldW: number, fieldH: number): number {
  return Math.max(1, Math.floor(Math.min((cssWidth * dpr) / fieldW, (cssHeight * dpr) / fieldH)));
}

/** deja el canvas en fieldW × fieldH unidades a escala k, con el tamaño CSS ajustado a devicePixelRatio */
export function sizeCanvas(canvas: HTMLCanvasElement, fieldW: number, fieldH: number, k: number, dpr: number): void {
  canvas.width = fieldW * k;
  canvas.height = fieldH * k;
  canvas.style.width = `${(fieldW * k) / dpr}px`;
  canvas.style.height = `${(fieldH * k) / dpr}px`;
}

/** unidades (con fracción) → píxeles del dispositivo, redondeado */
export function px(units: number, k: number): number {
  return Math.round(units * k);
}
