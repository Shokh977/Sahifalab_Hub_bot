// tier-data.ts — stack-agnostic. Drop into any TS project (web or RN).
// 7 tiers, 29 levels. Uzbek primary labels.

export type Motif =
  | "tree" | "shield" | "moon" | "sun" | "diamond" | "flame" | "star";

export interface Tier {
  id: string;
  /** Uzbek display name */
  name: string;
  /** English fallback / debug */
  en: string;
  /** Uzbek subtitle */
  subtitle: string;
  /** Number of sub-levels in this tier */
  levels: number;
  /** First absolute level number in this tier */
  startLevel: number;
  /**
   * Palette stops used for the conic gradient.
   * Cycle through these around 360° to make the holographic rim.
   */
  palette: string[];
  /** Single accent / glow color (drop shadow, sheen tint) */
  glow: string;
  /** Dark inner ink color (used for legibility multiply) */
  ink: string;
  motif: Motif;
}

export interface Level {
  /** Absolute level number, 1..29 */
  n: number;
  /** Which tier this level belongs to */
  tier: Tier;
  /** Roman numeral within the tier ("I"..."V") */
  roman: string;
  /** 1-indexed position within the tier */
  sub: number;
}

export const TIERS: Tier[] = [
  {
    id: "wood",
    name: "Yog'och", en: "Wood", subtitle: "Boshlanish",
    levels: 4, startLevel: 1,
    palette: ["#6b3a14", "#a86a2c", "#e0a86b", "#f3d9a6", "#3d2009"],
    glow: "#d99756", ink: "#2a1707", motif: "tree",
  },
  {
    id: "bronze",
    name: "Bronza", en: "Bronze", subtitle: "Mustahkamlanish",
    levels: 4, startLevel: 5,
    palette: ["#8a3f1a", "#cd7f32", "#e8a55c", "#fbd9a6", "#4a1d08"],
    glow: "#e08741", ink: "#321406", motif: "shield",
  },
  {
    id: "silver",
    name: "Kumush", en: "Silver", subtitle: "Aniqlik",
    levels: 5, startLevel: 9,
    palette: ["#5d6b7a", "#a8b6c4", "#e6edf3", "#ffffff", "#1f2a36"],
    glow: "#cfd9e5", ink: "#1b242e", motif: "moon",
  },
  {
    id: "gold",
    name: "Oltin", en: "Gold", subtitle: "Ustalik",
    levels: 5, startLevel: 14,
    palette: ["#a86a08", "#f0b423", "#ffe57a", "#fff6c8", "#4a2c03"],
    glow: "#ffd24a", ink: "#3a2104", motif: "sun",
  },
  {
    id: "platinum",
    name: "Platina", en: "Platinum", subtitle: "Sof zehn",
    levels: 4, startLevel: 19,
    palette: ["#3a6b8e", "#7eb6d6", "#c8e4f2", "#ffffff", "#0f2638"],
    glow: "#a0d8f0", ink: "#0d1f2e", motif: "diamond",
  },
  {
    id: "ruby",
    name: "Yoqut", en: "Ruby", subtitle: "Olovli iroda",
    levels: 4, startLevel: 23,
    palette: ["#8a0f3a", "#e0115f", "#ff5fa0", "#ffc1d8", "#3a0414"],
    glow: "#ff3a7a", ink: "#2e0212", motif: "flame",
  },
  {
    id: "legendary",
    name: "Afsonaviy", en: "Legendary", subtitle: "Cheksizlik",
    levels: 3, startLevel: 27,
    palette: ["#ff5fa0", "#ffb347", "#ffd24a", "#7ef0c0", "#5fb6ff", "#a78bfa", "#ff5fa0"],
    glow: "#ffd24a", ink: "#0a0418", motif: "star",
  },
];

const ROMAN = ["", "I", "II", "III", "IV", "V"];

/** Flatten the 29 levels in order. */
export const LEVELS: Level[] = TIERS.flatMap((tier) =>
  Array.from({ length: tier.levels }, (_, i) => ({
    n: tier.startLevel + i,
    tier,
    roman: ROMAN[i + 1],
    sub: i + 1,
  }))
);

/** Get the tier for a given absolute level (1..29). */
export function tierOf(level: number): Tier {
  return LEVELS[Math.max(0, Math.min(28, level - 1))].tier;
}

/** Get the full level object for an absolute level (1..29). */
export function levelOf(n: number): Level {
  return LEVELS[Math.max(0, Math.min(28, n - 1))];
}

/** Hex path constants for SVG and clip-path (flat-top hex). */
export const HEX_POINTS = "50,2 95,26 95,74 50,98 5,74 5,26";
export const HEX_CLIP_PATH =
  "polygon(50% 1%, 96% 26%, 96% 74%, 50% 99%, 4% 74%, 4% 26%)";

/** SVG path strings for each motif (viewBox 0 0 100 100). */
export const MOTIF_PATHS: Record<Motif, string> = {
  tree: "M50 12 L72 42 L62 42 L80 70 L66 70 L82 92 L18 92 L34 70 L20 70 L38 42 L28 42 Z",
  shield: "M50 10 L82 22 L82 50 C82 72 68 86 50 92 C32 86 18 72 18 50 L18 22 Z",
  moon: "M62 14 C42 18 28 35 28 56 C28 77 44 92 62 90 C44 84 36 66 38 50 C40 32 50 20 62 14 Z",
  sun: "M50 30 a20 20 0 1 0 0.001 0 Z M50 10 L50 22 M50 78 L50 90 M10 50 L22 50 M78 50 L90 50 M22 22 L30 30 M70 70 L78 78 M78 22 L70 30 M22 78 L30 70",
  diamond: "M50 10 L84 38 L50 92 L16 38 Z M16 38 L84 38 M50 10 L36 38 M50 10 L64 38 M36 38 L50 92 M64 38 L50 92",
  flame: "M50 8 C58 22 70 30 70 50 C70 60 64 68 58 70 C62 64 60 56 54 54 C58 46 52 38 50 32 C48 42 38 48 36 60 C34 70 40 80 50 86 C32 86 22 72 22 56 C22 38 38 30 42 18 C44 28 48 30 50 32 Z",
  star: "M50 8 L60 38 L92 40 L66 58 L76 90 L50 72 L24 90 L34 58 L8 40 L40 38 Z",
};
