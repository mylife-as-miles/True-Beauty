// Adapted from MIROIR/SKIN_AI, Copyright (c) 2026 MIROIR. MIT. See LICENSE.MIROIR.
// Source f3c0661cb0594fff07e89c80fbe129e7e5bdffa5.
// Personal-color engine — the science between the two APIs.
//
// Given a representative skin colour (sampled from the user's own selfie), this
// derives the same metrics a professional colour analyst uses:
//
//   • CIELAB       — a perceptually-uniform colour space (L* lightness,
//                    a* green–red, b* blue–yellow).
//   • ITA°         — Individual Typology Angle, a descriptive pixel-colour measure
//                    of skin depth  =  atan2(L* − 50, b*) · 180/π.
//   • Undertone    — warm (golden/yellow) vs cool (pink/blue) vs neutral,
//                    read from where the skin sits on the a*/b* plane.
//   • Season       — a rule-based map onto the 12-season colour system.
//
// Everything here is pure, deterministic and unit-testable — no I/O, no API.
// This module is client-safe (used by both the server sampler and the UI).

export type Undertone = "warm" | "cool" | "neutral";
export type Depth = "light" | "medium" | "deep";

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface SkinTone {
  hex: string; // representative skin colour, e.g. "#c98a6b"
  lab: Lab;
  ita: number; // Individual Typology Angle, degrees
  chroma: number; // C* = sqrt(a*^2 + b*^2), colour saturation
  undertone: Undertone;
  depth: Depth;
  season: Season; // one of the 12 seasons
  seasonLabel: string; // e.g. "True Autumn"
  palette: PaletteColor[]; // colours that flatter this tone
  headline: string;
  description: string;
  /** True when the underlying skin-colour sample was low-confidence. */
  lowConfidence?: boolean;
  /**
   * Where the skin colour came from: the in-browser, white-balanced sample of
   * the face (preferred: it follows the photo's pixels), or YouCam's Facial
   * Color Tones Analyzer when there is no sample.
   */
  measuredBy?: "youcam" | "photo-sample";
  /** Where hair and eye colour came from. */
  hairEyeBy?: "youcam" | "swatches";
  /**
   * Both skin readings side by side, when both exist. YouCam's skin colour is
   * repeatable but lighting-normalised, so it can sit far from the photo's
   * pixels; disagreement lowers confidence instead of being hidden.
   */
  crossCheck?: {
    photoHex: string;
    youcamHex: string;
    /** CIE76 distance between the two skin readings. */
    deltaE: number;
    photoSeason: string;
    youcamSeason: string;
    agree: boolean;
  };
  /**
   * Full three-axis season analysis, when hair/eye colour were available.
   * Type-only import: season.ts imports values from here, so a value import
   * back would create a cycle.
   */
  analysis?: import("./season").SeasonAnalysis;
}

export interface PaletteColor {
  hex: string;
  name: string;
}

// ---- sRGB -> CIELAB -------------------------------------------------------

export function hexToRgb(hex: string): RGB {
  if (!/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(hex))
    throw new Error("Use a three- or six-digit hex colour.");
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6),
    16,
  );
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** Convert an sRGB colour to CIELAB (D65 reference white). */
export function rgbToLab({ r, g, b }: RGB): Lab {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  // linear sRGB -> XYZ (D65), scaled to 100
  let X = (0.4124 * rl + 0.3576 * gl + 0.1805 * bl) * 100;
  let Y = (0.2126 * rl + 0.7152 * gl + 0.0722 * bl) * 100;
  let Z = (0.0193 * rl + 0.1192 * gl + 0.9505 * bl) * 100;

  // normalise by D65 white point
  X /= 95.047;
  Y /= 100.0;
  Z /= 108.883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

// ---- metrics --------------------------------------------------------------

/** Individual Typology Angle (degrees). Higher = lighter skin. */
export function itaOf(lab: Lab): number {
  return (Math.atan2(lab.L - 50, lab.b) * 180) / Math.PI;
}

export function chromaOf(lab: Lab): number {
  return Math.sqrt(lab.a * lab.a + lab.b * lab.b);
}

/**
 * Undertone from the a*-b* plane. Warm skin carries more golden-yellow (b*)
 * than pink-red (a*); cool skin the reverse. The gap between them is a robust,
 * depth-tolerant signal.
 */
export function undertoneOf(lab: Lab): Undertone {
  const warmthIndex = lab.b - lab.a; // yellow minus red
  if (warmthIndex > 8) return "warm";
  if (warmthIndex < 2) return "cool";
  return "neutral";
}

/** Skin depth bucket from ITA° (editorial pixel-lightness thresholds, simplified to 3). */
export function depthOf(ita: number): Depth {
  if (ita > 41) return "light";
  if (ita > 10) return "medium";
  return "deep";
}

// ---- 12-season classification --------------------------------------------

export type Season =
  | "light-spring"
  | "true-spring"
  | "bright-spring"
  | "light-summer"
  | "true-summer"
  | "soft-summer"
  | "soft-autumn"
  | "true-autumn"
  | "deep-autumn"
  | "true-winter"
  | "deep-winter"
  | "bright-winter";

interface SeasonDef {
  label: string;
  headline: string;
  description: string;
  palette: PaletteColor[];
}

// Editorial palette suggestions, not scientific or diagnostic categories.
const SEASONS: Record<Season, SeasonDef> = {
  "light-spring": {
    label: "Light Spring",
    headline: "Warm, light and fresh",
    description:
      "Delicate warm pastels and clear light shades bring out your natural glow. Avoid heavy, dark or icy colours that overwhelm you.",
    palette: [
      { hex: "#f6c9a8", name: "peach" },
      { hex: "#f4d06f", name: "warm butter" },
      { hex: "#a8d5a2", name: "spring green" },
      { hex: "#8fd3d1", name: "aqua" },
      { hex: "#f4a9a0", name: "coral pink" },
      { hex: "#e8d5b0", name: "warm cream" },
    ],
  },
  "true-spring": {
    label: "True Spring",
    headline: "Warm, clear and vivid",
    description:
      "Warm, saturated colours light you up — think golden, coral and grass green. Muted or icy tones dull your natural warmth.",
    palette: [
      { hex: "#ff8552", name: "coral" },
      { hex: "#f2b134", name: "golden yellow" },
      { hex: "#7cbf5a", name: "leaf green" },
      { hex: "#39a0a3", name: "turquoise" },
      { hex: "#ef6f6c", name: "warm red" },
      { hex: "#f0d264", name: "sunflower" },
    ],
  },
  "bright-spring": {
    label: "Bright Spring",
    headline: "Warm, bright and high-contrast",
    description:
      "Clear, vivid warm colours suit your natural brightness. Dusty, muted shades wash you out.",
    palette: [
      { hex: "#ff6f3c", name: "bright coral" },
      { hex: "#ffd23f", name: "vivid gold" },
      { hex: "#2ec4b6", name: "bright teal" },
      { hex: "#ff5d8f", name: "warm fuchsia" },
      { hex: "#3fa34d", name: "clear green" },
      { hex: "#f7b32b", name: "amber" },
    ],
  },
  "light-summer": {
    label: "Light Summer",
    headline: "Cool, light and soft",
    description:
      "Soft cool pastels flatter you — powder blue, rose and lavender. Steer clear of warm, dark or overly vivid colours.",
    palette: [
      { hex: "#a9c9e8", name: "powder blue" },
      { hex: "#e8b4c8", name: "rose" },
      { hex: "#c8b4e8", name: "lavender" },
      { hex: "#a2d5c6", name: "cool mint" },
      { hex: "#d5dae8", name: "soft periwinkle" },
      { hex: "#e6c3d1", name: "dusty pink" },
    ],
  },
  "true-summer": {
    label: "True Summer",
    headline: "Cool, soft and muted",
    description:
      "Cool, gently muted colours suit you best — soft navy, berry and slate blue. Warm oranges and golds clash with your undertone.",
    palette: [
      { hex: "#5b7a9d", name: "slate blue" },
      { hex: "#9e5b7a", name: "berry" },
      { hex: "#6d9d8f", name: "sea green" },
      { hex: "#7d7fae", name: "cool violet" },
      { hex: "#b45d7a", name: "raspberry" },
      { hex: "#4f6d8a", name: "denim" },
    ],
  },
  "soft-summer": {
    label: "Soft Summer",
    headline: "Cool, muted and gentle",
    description:
      "Soft, greyed cool tones are your friends — sage, mauve and dusty teal. Bright or warm colours overpower your subtle colouring.",
    palette: [
      { hex: "#8ba39b", name: "sage" },
      { hex: "#a68a9d", name: "mauve" },
      { hex: "#6d8a99", name: "dusty teal" },
      { hex: "#9d8ba3", name: "soft plum" },
      { hex: "#b0a9b8", name: "cool taupe" },
      { hex: "#7a8ba3", name: "muted blue" },
    ],
  },
  "soft-autumn": {
    label: "Soft Autumn",
    headline: "Warm, muted and earthy",
    description:
      "Soft, warm earth tones flatter you — camel, olive and terracotta. Bright, icy or stark colours feel harsh against your skin.",
    palette: [
      { hex: "#c19a6b", name: "camel" },
      { hex: "#8a8f5a", name: "olive" },
      { hex: "#c17a5a", name: "terracotta" },
      { hex: "#a3937a", name: "warm taupe" },
      { hex: "#b5896b", name: "clay" },
      { hex: "#9d8f6b", name: "moss" },
    ],
  },
  "true-autumn": {
    label: "True Autumn",
    headline: "Warm, rich and earthy",
    description:
      "Deep, warm earth tones are made for you — rust, mustard, forest and bronze. Cool pastels and icy shades drain your warmth.",
    palette: [
      { hex: "#a8481f", name: "rust" },
      { hex: "#c99a2e", name: "mustard" },
      { hex: "#4f6b3a", name: "forest green" },
      { hex: "#8a5a2b", name: "bronze" },
      { hex: "#9d5c33", name: "burnt orange" },
      { hex: "#7a6a3a", name: "olive gold" },
    ],
  },
  "deep-autumn": {
    label: "Deep Autumn",
    headline: "Warm, deep and rich",
    description:
      "Rich, warm darks suit your depth — chocolate, deep teal and burgundy with a warm cast. Pale, cool pastels wash you out.",
    palette: [
      { hex: "#5a3a2a", name: "chocolate" },
      { hex: "#1f5a54", name: "deep teal" },
      { hex: "#7a2f2f", name: "warm burgundy" },
      { hex: "#8a6a2b", name: "dark gold" },
      { hex: "#3f4a2a", name: "dark olive" },
      { hex: "#9d4a2b", name: "brick" },
    ],
  },
  "true-winter": {
    label: "True Winter",
    headline: "Cool, clear and bold",
    description:
      "Cool, clear and bold colours suit you — true red, emerald, royal blue and icy accents. Warm, muted earth tones dull your contrast.",
    palette: [
      { hex: "#c1121f", name: "true red" },
      { hex: "#046a38", name: "emerald" },
      { hex: "#12428a", name: "royal blue" },
      { hex: "#8a1f5a", name: "magenta" },
      { hex: "#1f1f2e", name: "true black" },
      { hex: "#e8eef4", name: "icy white" },
    ],
  },
  "deep-winter": {
    label: "Deep Winter",
    headline: "Cool, deep and intense",
    description:
      "Deep, cool and intense colours are yours — pine, deep berry, navy and true black. Warm, dusty shades fight your colouring.",
    palette: [
      { hex: "#1f4a3f", name: "pine" },
      { hex: "#5a1f3f", name: "deep berry" },
      { hex: "#1f2a4a", name: "navy" },
      { hex: "#6a1f2e", name: "wine" },
      { hex: "#2a2a2a", name: "charcoal" },
      { hex: "#3a5a7a", name: "cool sapphire" },
    ],
  },
  "bright-winter": {
    label: "Bright Winter",
    headline: "Cool, bright and striking",
    description:
      "Clear, cool and vivid colours pop on you — hot pink, electric blue, bright emerald and stark contrast. Muted, warm tones fall flat.",
    palette: [
      { hex: "#e5006d", name: "hot pink" },
      { hex: "#0057d9", name: "electric blue" },
      { hex: "#00a86b", name: "bright emerald" },
      { hex: "#8a2be2", name: "vivid violet" },
      { hex: "#d90429", name: "clear red" },
      { hex: "#eef2f7", name: "bright white" },
    ],
  },
};

/**
 * Reference (median) chroma for each depth band, from the original heuristic; not a validated population model. Chroma covaries strongly with depth — mid-brown skin sits
 * around C* 38 while very light skin sits near C* 20 — so an *absolute* chroma
 * threshold does not mean the same thing at different depths.
 */
const REFERENCE_CHROMA: Record<Depth, number> = {
  light: 20,
  medium: 38,
  deep: 26,
};

/**
 * Chroma expressed relative to what is typical for this skin depth.
 * 1.0 = average saturation for the band, >1 = clear/bright, <1 = muted/soft.
 *
 * This is what makes the season split meaningful across skin depths: comparing
 * raw C* against a fixed cutoff classifies every medium and deep tone into the
 * same bucket, because their baseline chroma is simply higher.
 */
export function clarityOf(chroma: number, depth: Depth): number {
  return chroma / REFERENCE_CHROMA[depth];
}

export type Clarity = "bright" | "true" | "soft";

export function clarityBand(clarity: number): Clarity {
  if (clarity >= 1.15) return "bright";
  if (clarity < 0.85) return "soft";
  return "true";
}

/**
 * Map undertone + depth + clarity onto one of the 12 seasons.
 *
 * Undertone picks the warm/cool family; depth and *depth-relative* clarity pick
 * the sub-type. All 12 seasons are reachable — see the season-coverage
 * assertions in `scripts/color.test.mjs`.
 */
export function classifySeason(
  undertone: Undertone,
  depth: Depth,
  chroma: number,
): Season {
  const clarity = clarityOf(chroma, depth);
  const band = clarityBand(clarity);

  // Neutral undertones lean warm when their colouring is clear and saturated,
  // and cool when it is muted.
  const warm =
    undertone === "warm" || (undertone === "neutral" && clarity >= 0.9);

  if (warm) {
    if (depth === "light")
      return band === "bright" ? "bright-spring" : "light-spring";
    if (depth === "medium") {
      if (band === "bright") return "true-spring";
      return band === "soft" ? "soft-autumn" : "true-autumn";
    }
    // deep
    if (band === "bright") return "deep-autumn";
    return band === "soft" ? "soft-autumn" : "true-autumn";
  }

  // cool family (cool undertone, or neutral + muted colouring)
  if (depth === "light") {
    if (band === "bright") return "true-summer";
    return band === "soft" ? "soft-summer" : "light-summer";
  }
  if (depth === "medium") {
    if (band === "bright") return "true-winter";
    return band === "soft" ? "soft-summer" : "true-summer";
  }
  // deep
  if (band === "bright") return "bright-winter";
  return band === "soft" ? "deep-winter" : "true-winter";
}

/** Full analysis: skin colour hex -> complete SkinTone. */
export function analyzeSkinTone(hex: string): SkinTone {
  const rgb = hexToRgb(hex);
  const lab = rgbToLab(rgb);
  const ita = itaOf(lab);
  const chroma = chromaOf(lab);
  const undertone = undertoneOf(lab);
  const depth = depthOf(ita);
  const season = classifySeason(undertone, depth, chroma);
  const def = SEASONS[season];

  return {
    hex,
    lab,
    ita: Math.round(ita * 10) / 10,
    chroma: Math.round(chroma * 10) / 10,
    undertone,
    depth,
    season,
    seasonLabel: def.label,
    palette: def.palette,
    headline: def.headline,
    description: def.description,
  };
}

export const UNDERTONE_LABEL: Record<Undertone, string> = {
  warm: "Warm",
  cool: "Cool",
  neutral: "Neutral",
};

export const DEPTH_LABEL: Record<Depth, string> = {
  light: "Light",
  medium: "Medium",
  deep: "Deep",
};

export function seasonDef(season: Season): SeasonDef {
  return SEASONS[season];
}

// ---- proof-shot colours ---------------------------------------------------

export interface ProofColors {
  flattering: PaletteColor; // a hero colour from the user's own palette
  clashing: PaletteColor; // a colour of the opposite temperature that fights it
}

// A clashing colour of the opposite temperature, by the user's undertone.
const CLASH_FOR: Record<Undertone, PaletteColor> = {
  warm: { hex: "#4f6d9e", name: "cool slate blue" }, // cool clashes warm skin
  cool: { hex: "#c8772e", name: "warm ochre" }, // warm clashes cool skin
  neutral: { hex: "#9a9a58", name: "muddy olive" }, // muted clash
};

/**
 * Picks a flattering colour (from the shopper's season palette) and a clashing
 * colour (opposite temperature) for the side-by-side "prove it" comparison.
 */
export function proofColors(tone: SkinTone): ProofColors {
  // A saturated, mid-depth hero from their palette reads best on a garment.
  const flattering = tone.palette[0] ?? { hex: "#3a6ea5", name: "blue" };
  return { flattering, clashing: CLASH_FOR[tone.undertone] };
}
