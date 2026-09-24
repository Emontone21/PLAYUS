import { ACCENT, ACCENT_2, GOLD, INK, WHITE } from "./palette";

// Piezas del avatar, en un viewBox de 100x100. La cabeza está centrada en
// (50, 55). El orden de cada lista es el id (1-based) que se guarda en la
// base: agregar piezas nuevas siempre al final, nunca reordenar.

type Colored = { color: string };

// --- caras (relleno = color de piel) -----------------------------------------

export const BASES: Array<{ name: string; Piece: React.FC<Colored> }> = [
  { name: "redonda", Piece: ({ color }) => <circle cx="50" cy="55" r="28" fill={color} /> },
  { name: "ovalada", Piece: ({ color }) => <ellipse cx="50" cy="55" rx="25" ry="31" fill={color} /> },
  { name: "cuadrada", Piece: ({ color }) => <rect x="24" y="27" width="52" height="56" rx="14" fill={color} /> },
  {
    name: "con mentón",
    Piece: ({ color }) => <path d="M22 48 C22 30 78 30 78 48 C78 66 64 84 50 86 C36 84 22 66 22 48 Z" fill={color} />,
  },
  { name: "alargada", Piece: ({ color }) => <ellipse cx="50" cy="55" rx="22" ry="33" fill={color} /> },
  { name: "ancha", Piece: ({ color }) => <ellipse cx="50" cy="56" rx="31" ry="26" fill={color} /> },
];

// --- pelo (relleno = color de pelo) ------------------------------------------

export const HAIRS: Array<{ name: string; Piece: React.FC<Colored> }> = [
  { name: "sin pelo", Piece: () => null },
  { name: "corto", Piece: ({ color }) => <path d="M21 50 A29 29 0 0 1 79 50 L79 49 Q50 28 21 49 Z" fill={color} /> },
  {
    name: "flequillo",
    Piece: ({ color }) => (
      <path d="M21 50 A29 29 0 0 1 79 50 L79 54 L70 44 L62 54 L54 44 L46 54 L38 44 L30 54 L21 54 Z" fill={color} />
    ),
  },
  {
    name: "largo",
    Piece: ({ color }) => (
      <path d="M18 50 A32 32 0 0 1 82 50 L85 92 L70 92 L68 58 Q50 42 32 58 L30 92 L15 92 Z" fill={color} />
    ),
  },
  {
    name: "rulos",
    Piece: ({ color }) => (
      <g fill={color}>
        <circle cx="26" cy="44" r="9" />
        <circle cx="36" cy="33" r="9" />
        <circle cx="50" cy="28" r="10" />
        <circle cx="64" cy="33" r="9" />
        <circle cx="74" cy="44" r="9" />
        <path d="M22 50 A28 28 0 0 1 78 50 L78 48 Q50 34 22 48 Z" />
      </g>
    ),
  },
  { name: "cresta", Piece: ({ color }) => <path d="M42 42 L42 22 L50 6 L58 22 L58 42 Q50 36 42 42 Z" fill={color} /> },
  {
    name: "rodete",
    Piece: ({ color }) => (
      <g fill={color}>
        <circle cx="50" cy="23" r="10" />
        <path d="M21 50 A29 29 0 0 1 79 50 L79 49 Q50 28 21 49 Z" />
      </g>
    ),
  },
  {
    name: "de costado",
    Piece: ({ color }) => (
      <path d="M21 50 A29 29 0 0 1 79 50 L79 58 Q66 40 42 50 Q30 55 21 62 Z" fill={color} />
    ),
  },
];

// --- ojos --------------------------------------------------------------------

export const EYES: Array<{ name: string; Piece: React.FC }> = [
  {
    name: "puntitos",
    Piece: () => (
      <g fill={INK}>
        <circle cx="40" cy="52" r="3.5" />
        <circle cx="60" cy="52" r="3.5" />
      </g>
    ),
  },
  {
    name: "grandes",
    Piece: () => (
      <g>
        <circle cx="40" cy="52" r="6" fill={INK} />
        <circle cx="60" cy="52" r="6" fill={INK} />
        <circle cx="42" cy="50" r="2" fill={WHITE} />
        <circle cx="62" cy="50" r="2" fill={WHITE} />
      </g>
    ),
  },
  {
    name: "contentos",
    Piece: () => (
      <g fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round">
        <path d="M34 54 Q40 46 46 54" />
        <path d="M54 54 Q60 46 66 54" />
      </g>
    ),
  },
  {
    name: "guiño",
    Piece: () => (
      <g>
        <circle cx="40" cy="52" r="4" fill={INK} />
        <path d="M54 53 Q60 47 66 53" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      </g>
    ),
  },
  {
    name: "dormidos",
    Piece: () => (
      <g stroke={INK} strokeWidth="3.5" strokeLinecap="round">
        <path d="M34 52 L46 52" />
        <path d="M54 52 L66 52" />
      </g>
    ),
  },
  {
    name: "sorprendidos",
    Piece: () => (
      <g>
        <ellipse cx="40" cy="52" rx="4" ry="6" fill={WHITE} />
        <ellipse cx="60" cy="52" rx="4" ry="6" fill={WHITE} />
        <circle cx="40" cy="53" r="2.5" fill={INK} />
        <circle cx="60" cy="53" r="2.5" fill={INK} />
      </g>
    ),
  },
];

// --- bocas -------------------------------------------------------------------

export const MOUTHS: Array<{ name: string; Piece: React.FC }> = [
  {
    name: "sonrisa",
    Piece: () => <path d="M39 66 Q50 78 61 66" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />,
  },
  {
    name: "carcajada",
    Piece: () => (
      <g>
        <path d="M37 65 Q50 86 63 65 Z" fill={INK} />
        <path d="M43 72 Q50 80 57 72 Z" fill={ACCENT} />
      </g>
    ),
  },
  { name: "seria", Piece: () => <path d="M41 69 L59 69" stroke={INK} strokeWidth="3.5" strokeLinecap="round" /> },
  { name: "sorpresa", Piece: () => <ellipse cx="50" cy="70" rx="5" ry="6" fill={INK} /> },
  {
    name: "pícara",
    Piece: () => <path d="M40 68 Q52 77 62 65" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />,
  },
  {
    name: "dientes",
    Piece: () => (
      <g>
        <path d="M38 65 Q50 80 62 65 Z" fill={INK} />
        <rect x="42" y="65" width="16" height="5" fill={WHITE} />
      </g>
    ),
  },
];

// --- extras (se dibujan encima de todo) --------------------------------------

export const ACCESSORIES: Array<{ name: string; Piece: React.FC }> = [
  {
    name: "anteojos",
    Piece: () => (
      <g fill="none" stroke={INK} strokeWidth="2.5">
        <circle cx="40" cy="52" r="8" />
        <circle cx="60" cy="52" r="8" />
        <path d="M48 52 L52 52" />
      </g>
    ),
  },
  {
    name: "lentes de sol",
    Piece: () => (
      <g>
        <rect x="30" y="45" width="18" height="13" rx="4" fill={INK} />
        <rect x="52" y="45" width="18" height="13" rx="4" fill={INK} />
        <path d="M48 50 L52 50" stroke={INK} strokeWidth="2.5" />
      </g>
    ),
  },
  {
    name: "gorra",
    Piece: () => (
      // contorno oscuro para que se vea aunque el fondo sea del mismo color
      <g fill={ACCENT} stroke={INK} strokeWidth="2" strokeLinejoin="round">
        <path d="M23 46 A27 27 0 0 1 77 46 Z" />
        <rect x="14" y="43" width="72" height="6" rx="3" />
      </g>
    ),
  },
  {
    name: "vincha",
    Piece: () => <rect x="21" y="44" width="58" height="7" rx="3" fill={ACCENT_2} stroke={INK} strokeWidth="2" />,
  },
  { name: "aro", Piece: () => <circle cx="79" cy="63" r="4" fill="none" stroke={GOLD} strokeWidth="2.5" /> },
  { name: "bigote", Piece: () => <path d="M38 64 Q50 56 62 64 Q56 60 50 62 Q44 60 38 64 Z" fill={INK} /> },
];
