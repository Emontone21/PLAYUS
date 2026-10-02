// El aviso de la cuenta regresiva en los juegos horizontales: un teléfono en
// pixel art que gira hacia la izquierda, con "girá el teléfono". Con
// prefers-reduced-motion aparece ya girado (ver .phone-turn en globals.css).

import { buildSprite, OUTLINE } from "./lib/sprites";
import { SpriteSvg } from "./lib/sprite-svg";

const ROWS = [
  "..KKKKKKKK..",
  ".KSSSSSSSSK.",
  "KSKKKKKKKKSK",
  "KSKPPPPPPKSK",
  "KSKPPPPPPKSK",
  "KSKPPLPPPKSK",
  "KSKPLLLPPKSK",
  "KSKPPLPPPKSK",
  "KSKPPPPPPKSK",
  "KSKPPPPPPKSK",
  "KSKPPPPPPKSK",
  "KSKPPPPPPKSK",
  "KSKPPPPPPKSK",
  "KSKPPPPPPKSK",
  "KSKKKKKKKKSK",
  ".KSSSKKSSSK.",
  ".KSSSSSSSSK.",
  "..KKKKKKKK..",
];
let sprite: ReturnType<typeof buildSprite> | null = null;
function phoneSprite() {
  sprite ??= buildSprite(ROWS, { K: OUTLINE, S: "#3A3D47", P: "#163a2f", L: "#8EDC66" });
  return sprite;
}

export function RotateHint() {
  return (
    <div className="flex flex-col items-center gap-3" data-testid="game-rotate-hint">
      <div className="phone-turn">
        <SpriteSvg sprite={phoneSprite()} height={72} label="un teléfono que gira de costado" />
      </div>
      <span className="display text-xl text-tinta">girá el teléfono</span>
    </div>
  );
}
