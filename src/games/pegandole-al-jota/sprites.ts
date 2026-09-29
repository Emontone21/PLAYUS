// Pixel art de las sustancias y del jota, como mapas de letras
// (games/lib/sprites), sin DOM ni React. Se dibujan como SVG con SpriteSvg,
// con el mismo criterio que la rana: una celda por unidad, sin suavizado.

import { buildSprite as build, OUTLINE, type Sprite } from "../lib/sprites";
import type { SubstanceId } from "./rounds";

export type { Sprite };

// ---------------------------------------------------------------------------
// las sustancias: 12 × 12. Hay pares que se confunden a propósito: merca y
// tussi (polvo blanco y rosa), keta y popper (dos frasquitos), marihuana y
// hachís (verde y marrón).
// ---------------------------------------------------------------------------

export const SUBSTANCE_SIZE = 12;

const K = OUTLINE;
const SUBSTANCE_ART: Record<SubstanceId, { rows: string[]; palette: Record<string, string> }> = {
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
  tussi: {
    rows: ["...KKKKKK...", "..KttttttK..", "..KKKKKKKK..", ".KTPPPPPPTK.", ".KPPpPPPPPK.", ".KPPPPPpPPK.", ".KPpPPPPPPK.", ".KPPPPpPPPK.", ".KPPPPPPPPK.", ".KTPPPPPPTK.", ".KKKKKKKKKK.", "............"],
    palette: { K, t: "#DCE8F0", T: "#EAF3F8", P: "#F27BB0", p: "#FBB7D6" },
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
    s = build(SUBSTANCE_ART[id].rows, SUBSTANCE_ART[id].palette);
    cache.set(id, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// el jota: un canguro transa de barrio, con capucha, gorra, lentes oscuros y
// riñonera. 16 × 18. Cuatro caras.
// ---------------------------------------------------------------------------

export const JOTA_W = 16;
export const JOTA_H = 18;
export type JotaFace = "neutral" | "impaciente" | "contento" | "enojado";
export const JOTA_FACES: readonly JotaFace[] = ["neutral", "impaciente", "contento", "enojado"];

const JOTA_PALETTE: Record<string, string> = {
  K,
  C: "#C4813A", // pelaje del canguro
  c: "#E0A263", // hocico y panza
  H: "#5B5B6B", // capucha
  h: "#3F3F4C",
  G: "#1F1F26", // gorra
  L: "#101014", // lentes
  l: "#3A3A48",
  N: "#2A1B10", // nariz
  M: "#8A3A2E", // boca
  T: "#FF8FA3", // lengua / cachetes
  Y: "#F7D23E", // riñonera
  y: "#C9A21E",
  R: "#D9482B", // cara roja
  W: "#FFFFFF",
};

function jotaRows(face: JotaFace): string[] {
  const skin = face === "enojado" ? "R" : "C";
  const rows = [
    ".KK........KK...", // 0 orejas
    "KCCK......KCCK..",
    "KCCKKKKKKKKCCK..",
    ".KKGGGGGGGGKK...", // 3 gorra
    ".KGGGGGGGGGGGGK.", // 4 visera
    ".KHKKKKKKKKKKHK.",
    ".KHhSSSSSSSShHK.", // 6 cara (S = piel)
    ".KHSLLLSSLLLSHK.", // 7 lentes
    ".KHSLlLSSLlLSHK.",
    ".KHSSSSSSSSSSHK.", // 9
    ".KHSSSSccSSSSHK.", // 10 hocico
    ".KHSSSScNcSSSHK.", // 11 nariz
    ".KHSSSmmmmSSSHK.", // 12 boca (m = M / T según cara)
    ".KHhSSSSSSSShHK.",
    "..KHHHHHHHHHHK..", // 14 buzo
    "..KHHYYYYYYHHK..", // 15 riñonera
    "..KHHYyYYyYHHK..",
    "..KKKKKKKKKKKK..",
  ];
  let out = rows.map((r) => r.replace(/S/g, skin));
  switch (face) {
    case "neutral":
      out[12] = ".KHSSSMMMMSSSHK.";
      break;
    case "impaciente":
      // la boca torcida y una ceja levantada sobre el lente derecho
      out[6] = ".KHhSSSSSKKKhHK.";
      out[12] = ".KHSSSSSMMMMSHK.";
      break;
    case "contento":
      // sonrisa ancha con la lengua y cachetes
      out[11] = ".KHTSSScNcSSTHK.";
      out[12] = ".KHSSMMMMMMSSHK.";
      out[13] = ".KHhSSSTTSSShHK.";
      break;
    case "enojado":
      // cejas en V sobre los lentes y la boca para abajo
      out[6] = ".KHhKKSSSSKKhHK.";
      out[12] = ".KHSSMMMMMMSSHK.";
      out[13] = ".KHhSMSSSSMShHK.";
      break;
  }
  out = out.map((r) => r.replace(/S/g, skin));
  return out;
}

const jotaCache = new Map<JotaFace, Sprite>();
export function jotaSprite(face: JotaFace): Sprite {
  let s = jotaCache.get(face);
  if (!s) {
    s = build(jotaRows(face), JOTA_PALETTE);
    jotaCache.set(face, s);
  }
  return s;
}
