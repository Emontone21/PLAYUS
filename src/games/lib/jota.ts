// El jota, compartido por los juegos donde aparece ("pegándole al jota", "la
// bolsita del jota"): un canguro transa de barrio, con capucha, gorra, lentes
// oscuros y riñonera, de 16 × 18, con sus caras; su mano (para mezclar) y la
// tussi (la bolsita transparente con polvo rosa). Mapas de letras, sin DOM.

import { buildSprite as build, OUTLINE, type Sprite } from "./sprites";

const K = OUTLINE;

export const JOTA_W = 16;
export const JOTA_H = 18;
/**
 * neutral, impaciente (boca torcida y una ceja arriba), contento (sonrisa con
 * la lengua), enojado (cara roja), burlón (se ríe con la boca abierta y la
 * lengua afuera) y concentrado (cejas bajas y la boca apretada)
 */
export type JotaFace = "neutral" | "impaciente" | "contento" | "enojado" | "burlon" | "concentrado";

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
  const out = rows.map((r) => r.replace(/S/g, skin));
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
    case "burlon":
      // se ríe: boca bien abierta con la lengua afuera, cachetes y una ceja arriba
      out[6] = ".KHhKKSSSSSShHK.";
      out[11] = ".KHTSSScNcSSTHK.";
      out[12] = ".KHSMMMMMMMMSHK.";
      out[13] = ".KHhSMTTTTMShHK.";
      break;
    case "concentrado":
      // cejas bajas sobre los dos lentes y la boca apretada, de costado
      out[6] = ".KHhKKKSSKKKhHK.";
      out[12] = ".KHSSSSSMMSSSHK.";
      break;
  }
  return out.map((r) => r.replace(/S/g, skin));
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

/** la mano del jota (6 × 5), una pata de canguro con los dedos para abajo */
let hand: Sprite | null = null;
export function jotaHandSprite(): Sprite {
  hand ??= build(["KKKKKK", "KCCCCK", "KCcCcK", "KCKCKK", "K.K.K."], JOTA_PALETTE);
  return hand;
}

/** la tussi (12 × 12): la bolsita transparente con polvo rosa */
export const TUSSI_SIZE = 12;
let tussi: Sprite | null = null;
export function tussiSprite(): Sprite {
  tussi ??= build(["...KKKKKK...", "..KttttttK..", "..KKKKKKKK..", ".KTPPPPPPTK.", ".KPPpPPPPPK.", ".KPPPPPpPPK.", ".KPpPPPPPPK.", ".KPPPPpPPPK.", ".KPPPPPPPPK.", ".KTPPPPPPTK.", ".KKKKKKKKKK.", "............"], {
    K,
    t: "#DCE8F0",
    T: "#EAF3F8",
    P: "#F27BB0",
    p: "#FBB7D6",
  });
  return tussi;
}
