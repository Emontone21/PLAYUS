// Pixel art de las sustancias, como mapas de letras (games/lib/sprites), sin
// DOM ni React. El jota y la tussi están en games/lib/jota. Se dibujan como SVG con SpriteSvg,
// con el mismo criterio que la rana: una celda por unidad, sin suavizado.

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";
import { tussiSprite } from "../lib/jota";
import type { SubstanceId } from "./rounds";

export type { Sprite };

// ---------------------------------------------------------------------------
// las sustancias: 12 × 12. Hay pares que se confunden a propósito: merca y
// tussi (polvo blanco y rosa), keta y popper (dos frasquitos), marihuana y
// hachís (verde y marrón).
// ---------------------------------------------------------------------------

export const SUBSTANCE_SIZE = 12;

const K = OUTLINE;
const SUBSTANCE_ART: Record<Exclude<SubstanceId, "tussi">, { rows: string[]; palette: Record<string, string> }> = {
  marihuana: {
    rows: ["....KKKK....", "...KGgGGK...", "..KGGOGgGK..", ".KgGGGGGGgK.", ".KGOGgGGOGK.", ".KGGGGgGGGK.", ".KgGGOGGGgK.", "..KGGGGgGK..", "..KGgGGOGK..", "...KGGGGK...", "....KDDK....", ".....KK....."],
    palette: { K, G: "#5B9A3C", g: "#7FC25A", O: "#E8862A", D: "#6E4B24" },
  },
  hachis: {
    rows: ["............", "............", "..KKKKKKKK..", ".KbbbbbbbbK.", ".KBBBBBBBbK.", ".KBBBBBBBbK.", ".KBBdBBBBbK.", ".KBBBBBdBbK.", ".KBBBBBBBbK.", ".KKKKKKKKKK.", "............", "............"],
    palette: { K, B: "#5E3A1A", b: "#7A4E27", d: "#3F2510" },
  },
  merca: {
    rows: ["KKKKKKKKKKKK", "KDDDDDDDDDDK", "KDDDDDDWWDDK", "KDDDDDWWDDDK", "KDDDDWWDDDDK", "KDDDWWDDDDDK", "KDDWWDDDCCDK", "KDWWDDDCCcDK", "KDDDDDCCcDDK", "KDDDDCCcDDDK", "KDDDDDDDDDDK", "KKKKKKKKKKKK"],
    palette: { K, D: "#1E1E26", W: "#F7F7F7", C: "#3B6BD6", c: "#2A4FA8" },
  },
  cristal: {
    rows: ["KKKKKKKKKKKK", "KDDDDDDDDDDK", "KDDDCcDDDDDK", "KDDCccCDDcDK", "KDCccccCDccK", "KDDCccCDcccK", "KDDDCcDDDcDK", "KDcDDDDCcDDK", "KDccCDDcccDK", "KDDcDDDDcDDK", "KDDDDDDDDDDK", "KKKKKKKKKKKK"],
    palette: { K, D: "#1E1E26", C: "#BFEFFF", c: "#7FD6F2" },
  },
  extasis: {
    rows: ["............", "..KKK.......", ".KRRRK.KKK..", ".KRrRK.KBBBK", ".KRRRK.KBbBK", "..KKK..KBBBK", "....KKK.KKK.", "...KYYYK....", "...KYyYK....", "...KYYYK....", "....KKK.....", "............"],
    palette: { K, R: "#E8536B", r: "#FFFFFF", B: "#5A8BE8", b: "#FFFFFF", Y: "#F7D23E", y: "#FFFFFF" },
  },
  lsd: {
    rows: ["KKKKKKKKKKKK", "KWWWWWWWWWWK", "KWWPPWWPPWWK", "KWPPPPPPPPWK", "KWPWWPPWWPWK", "KWWPPPPPPWWK", "KWWPPPPPPWWK", "KWPWWPPWWPWK", "KWPPPPPPPPWK", "KWWPPWWPPWWK", "KWWWWWWWWWWK", "KKKKKKKKKKKK"],
    palette: { K, W: "#F5F0E6", P: "#8E4DD6" },
  },
  hongos: {
    rows: ["....KKKK....", "...KRRRRK...", "..KRWRRWRK..", "..KRRRRRRK..", "..KKKKKKKK..", "....KSSK.KK.", "....KSSKKRRK", "....KSSKRWRK", "....KSSKKKKK", "....KSSK.KSK", "....KSSK.KSK", "....KKKK.KKK"],
    palette: { K, R: "#D9482B", W: "#FFFFFF", S: "#E7D6B0" },
  },
  ketamina: {
    rows: ["....KKKK....", "....KggK....", "...KKKKKK...", "...KTTTTK...", "..KTTTTTTK..", "..KTWWWWTK..", "..KTWWWWTK..", "..KTWWWWTK..", "..KTWWWWTK..", "..KTTTTTTK..", "..KKKKKKKK..", "............"],
    palette: { K, g: "#8A8A94", T: "#D5EAF3", W: "#F7F7F7" },
  },
  popper: {
    rows: ["....KKKK....", "...KRRRRK...", "...KRRRRK...", "...KKKKKK...", "....KBBK....", "...KBBBBK...", "...KBLLBK...", "...KBLLBK...", "...KBLLBK...", "...KBBBBK...", "...KKKKKK...", "............"],
    palette: { K, R: "#D9482B", B: "#7A4E27", L: "#F3E4C0" },
  },
};

const cache = new Map<string, Sprite>();
export function substanceSprite(id: SubstanceId): Sprite {
  let s = cache.get(id);
  if (!s) {
    // la tussi es la de games/lib/jota (la bolsita del otro juego del jota)
    s = id === "tussi" ? tussiSprite() : build(SUBSTANCE_ART[id].rows, SUBSTANCE_ART[id].palette);
    cache.set(id, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// el jota viene de games/lib/jota (lo comparte con "la bolsita del jota"); acá,
// las cuatro caras que usa este juego
// ---------------------------------------------------------------------------

export { JOTA_H, JOTA_W, jotaSprite } from "../lib/jota";
export type JotaFace = "neutral" | "impaciente" | "contento" | "enojado";
export const JOTA_FACES: readonly JotaFace[] = ["neutral", "impaciente", "contento", "enojado"];
