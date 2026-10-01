import { buildSprite, OUTLINE } from "@/games/lib/sprites";
import { SpriteSvg } from "@/games/lib/sprite-svg";

// El ícono de las colillas (los puntos de la temporada): un pucho apagado y
// aplastado, con el filtro naranja, en pixel art de 16 × 7 con el mismo
// sistema de mapas de píxeles que la rana. Decorativo: el número que
// acompaña ya dice "colillas".

const ROWS = [
  "......KK........",
  "....KKggK.......",
  "KKKKgKKKKKKKKKK.",
  "KWWWWKWWKFFFFFFK",
  "KWWWwWWWKFfFFFFK",
  "KKWWWWWKKFFFFFFK",
  "..KKKKK.KKKKKKKK",
];
const PALETTE = { K: OUTLINE, W: "#F2EFE4", w: "#D8D3C4", F: "#E8862A", f: "#F5A552", g: "#8A8A94" };

export const COLILLA_SPRITE = buildSprite(ROWS, PALETTE);

/** la colilla al lado de un número; `size` es el alto en px (12 a 16) */
export function Colilla({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 align-middle ${className}`} data-testid="colilla" aria-hidden="true">
      <SpriteSvg sprite={COLILLA_SPRITE} height={size} />
    </span>
  );
}
